import express from 'express';
import db from '../db/database.js';
import bcrypt from 'bcryptjs';
import { canManageUsers, isValidRole, getPowerScore, getCreatableRoles, isAdmin } from '../helpers/powerScore.js';
const router = express.Router();

const ALL_MODULES = ['dashboard', 'tasks', 'messaging'];

// Manager+ can manage users (power >= 60)
function requireManager(req, res, next) {
  if (!canManageUsers(req.user.role)) return res.status(403).json({ error: 'Yetkiniz yok' });
  next();
}

// Admin only (power === 100) - for destructive ops
function requireAdminOnly(req, res, next) {
  if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Sadece admin' });
  next();
}

// GET all users for current organization
router.get('/users', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await db.query(
      'SELECT id,name,email,role,department,phone,status,created_at FROM users WHERE organization_id = $1 ORDER BY name',
      [orgId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Settings users list error:', error);
    res.status(500).json({ error: 'Kullanıcılar yüklenirken hata oluştu' });
  }
});

// GET creatable roles for the current user
router.get('/creatable-roles', requireManager, (req, res) => {
  const roles = getCreatableRoles(req.user.role);
  res.json({ roles });
});

// CREATE user
router.post('/users', requireManager, async (req, res) => {
  const { name, email, password, role, department, phone } = req.body;

  const userRole = role || 'user';
  if (!isValidRole(userRole)) {
    return res.status(400).json({ error: 'Geçersiz rol' });
  }

  // Validate: can only create roles with STRICTLY lower power
  const creatableRoles = getCreatableRoles(req.user.role);
  if (!creatableRoles.includes(userRole)) {
    return res.status(403).json({ error: 'Bu rolde kullanıcı oluşturamazsınız' });
  }

  const hashed = bcrypt.hashSync(password, 10);
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const r = await client.query(
      'INSERT INTO users (name,email,password,role,department,phone,organization_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [name, email, hashed, userRole, department, phone, req.user.organization_id]
    );
    const userId = r.rows[0].id;

    for (const mod of ALL_MODULES) {
      await client.query(
        'INSERT INTO user_permissions (user_id, module, has_access) VALUES ($1, $2, 1)',
        [userId, mod]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ id: userId });
  } catch(e) {
    await client.query('ROLLBACK');
    console.error('User create error:', e);
    res.status(400).json({ error: 'E-posta zaten kullanımda' });
  } finally {
    client.release();
  }
});

// Helper: verify target user belongs to same organization
async function verifyOrgMembership(req, res) {
  const targetId = Number(req.params.id);
  const orgId = req.user.organization_id;
  const result = await db.query(
    'SELECT id, role FROM users WHERE id = $1 AND organization_id = $2',
    [targetId, orgId]
  );
  const target = result.rows[0];
  if (!target) {
    res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    return null;
  }
  return target;
}

// UPDATE user
router.put('/users/:id', requireManager, async (req, res) => {
  try {
    const target = await verifyOrgMembership(req, res);
    if (target === null) return;
    const targetId = target.id;

    const { name, email, role, department, phone, status, password } = req.body;

    // Validate role if provided
    if (role && !isValidRole(role)) {
      return res.status(400).json({ error: 'Geçersiz rol' });
    }

    // Can only edit users with strictly lower power, and set roles strictly lower
    const creatableRoles = getCreatableRoles(req.user.role);
    if (!creatableRoles.includes(target.role) && target.id !== req.user.id) {
      return res.status(403).json({ error: 'Bu kullanıcıyı düzenleme yetkiniz yok' });
    }
    if (role && !creatableRoles.includes(role)) {
      return res.status(403).json({ error: 'Bu rolü atama yetkiniz yok' });
    }

    if (password) {
      const hashed = bcrypt.hashSync(password, 10);
      await db.query(
        'UPDATE users SET name=COALESCE($1,name),email=COALESCE($2,email),password=$3,role=COALESCE($4,role),department=COALESCE($5,department),phone=COALESCE($6,phone),status=COALESCE($7,status) WHERE id=$8 AND organization_id=$9',
        [name, email, hashed, role, department, phone, status, targetId, req.user.organization_id]
      );
    } else {
      await db.query(
        'UPDATE users SET name=COALESCE($1,name),email=COALESCE($2,email),role=COALESCE($3,role),department=COALESCE($4,department),phone=COALESCE($5,phone),status=COALESCE($6,status) WHERE id=$7 AND organization_id=$8',
        [name, email, role, department, phone, status, targetId, req.user.organization_id]
      );
    }
    res.json({ message: 'Kullanıcı güncellendi' });
  } catch (error) {
    console.error('User update error:', error);
    res.status(500).json({ error: 'Kullanıcı güncellenirken hata oluştu' });
  }
});

// DELETE user (admin only)
router.delete('/users/:id', requireAdminOnly, async (req, res) => {
  const client = await db.connect();
  try {
    const target = await verifyOrgMembership(req, res);
    if (target === null) { client.release(); return; }
    const targetId = target.id;
    if (targetId === req.user.id) { client.release(); return res.status(400).json({ error: 'Kendinizi silemezsiniz' }); }

    await client.query('BEGIN');
    await client.query('DELETE FROM user_permissions WHERE user_id=$1', [targetId]);
    await client.query('DELETE FROM task_comments WHERE user_id=$1', [targetId]);
    await client.query('DELETE FROM conversation_members WHERE user_id=$1', [targetId]);
    await client.query('DELETE FROM daily_reports WHERE user_id=$1', [targetId]);
    await client.query('DELETE FROM users WHERE id=$1 AND organization_id=$2', [targetId, req.user.organization_id]);
    await client.query('COMMIT');

    res.json({ message: 'Kullanıcı silindi' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('User delete error:', error);
    res.status(500).json({ error: 'Kullanıcı silinirken hata oluştu' });
  } finally {
    client.release();
  }
});

// GET user permissions
router.get('/users/:id/permissions', requireManager, async (req, res) => {
  try {
    const target = await verifyOrgMembership(req, res);
    if (target === null) return;

    const result = await db.query(
      'SELECT module, has_access FROM user_permissions WHERE user_id=$1',
      [target.id]
    );
    const permMap = {};
    for (const mod of ALL_MODULES) permMap[mod] = 1;
    for (const p of result.rows) permMap[p.module] = p.has_access;
    res.json(permMap);
  } catch (error) {
    console.error('Permissions get error:', error);
    res.status(500).json({ error: 'Yetkiler yüklenirken hata oluştu' });
  }
});

// UPDATE user permissions
router.put('/users/:id/permissions', requireManager, async (req, res) => {
  const client = await db.connect();
  try {
    const target = await verifyOrgMembership(req, res);
    if (target === null) { client.release(); return; }
    const userId = target.id;
    const permissions = req.body;

    await client.query('BEGIN');
    for (const [mod, access] of Object.entries(permissions)) {
      if (ALL_MODULES.includes(mod)) {
        await client.query(
          `INSERT INTO user_permissions (user_id, module, has_access) VALUES ($1, $2, $3)
           ON CONFLICT(user_id, module) DO UPDATE SET has_access=EXCLUDED.has_access`,
          [userId, mod, access ? 1 : 0]
        );
      }
    }
    await client.query('COMMIT');

    res.json({ message: 'Yetkiler güncellendi' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Permissions update error:', error);
    res.status(500).json({ error: 'Yetkiler güncellenirken hata oluştu' });
  } finally {
    client.release();
  }
});

// Current user profile
router.get('/me', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id,name,email,role,department,phone FROM users WHERE id=$1',
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Profile get error:', error);
    res.status(500).json({ error: 'Profil yüklenirken hata oluştu' });
  }
});

// Change own password
router.put('/me/password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await db.query('SELECT * FROM users WHERE id=$1', [req.user.id]);
    const user = result.rows[0];
    if (!bcrypt.compareSync(currentPassword, user.password)) {
      return res.status(400).json({ error: 'Mevcut şifre yanlış' });
    }
    await db.query('UPDATE users SET password=$1 WHERE id=$2', [bcrypt.hashSync(newPassword, 10), req.user.id]);
    res.json({ message: 'Şifre güncellendi' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Şifre değiştirilirken hata oluştu' });
  }
});

export default router;
