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
router.get('/users', (req, res) => {
  const orgId = req.user.organization_id;
  res.json(
    db.prepare(
      'SELECT id,name,email,role,department,phone,status,created_at FROM users WHERE organization_id = ? ORDER BY name'
    ).all(orgId)
  );
});

// GET creatable roles for the current user
router.get('/creatable-roles', requireManager, (req, res) => {
  const roles = getCreatableRoles(req.user.role);
  res.json({ roles });
});

// CREATE user
router.post('/users', requireManager, (req, res) => {
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
  try {
    const r = db
      .prepare('INSERT INTO users (name,email,password,role,department,phone,organization_id) VALUES (?,?,?,?,?,?,?)')
      .run(name, email, hashed, userRole, department, phone, req.user.organization_id);
    const userId = r.lastInsertRowid;
    const ins = db.prepare('INSERT INTO user_permissions (user_id, module, has_access) VALUES (?, ?, 1)');
    for (const mod of ALL_MODULES) ins.run(userId, mod);
    res.status(201).json({ id: userId });
  } catch(e) { res.status(400).json({ error: 'E-posta zaten kullanımda' }); }
});

// Helper: verify target user belongs to same organization
function verifyOrgMembership(req, res) {
  const targetId = Number(req.params.id);
  const orgId = req.user.organization_id;
  const target = db.prepare('SELECT id, role FROM users WHERE id = ? AND organization_id = ?').get(targetId, orgId);
  if (!target) {
    res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    return null;
  }
  return target;
}

// UPDATE user
router.put('/users/:id', requireManager, (req, res) => {
  const target = verifyOrgMembership(req, res);
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
    db.prepare('UPDATE users SET name=COALESCE(?,name),email=COALESCE(?,email),password=?,role=COALESCE(?,role),department=COALESCE(?,department),phone=COALESCE(?,phone),status=COALESCE(?,status) WHERE id=? AND organization_id=?')
      .run(name,email,hashed,role,department,phone,status,targetId,req.user.organization_id);
  } else {
    db.prepare('UPDATE users SET name=COALESCE(?,name),email=COALESCE(?,email),role=COALESCE(?,role),department=COALESCE(?,department),phone=COALESCE(?,phone),status=COALESCE(?,status) WHERE id=? AND organization_id=?')
      .run(name,email,role,department,phone,status,targetId,req.user.organization_id);
  }
  res.json({ message: 'Kullanıcı güncellendi' });
});

// DELETE user (admin only)
router.delete('/users/:id', requireAdminOnly, (req, res) => {
  const target = verifyOrgMembership(req, res);
  if (target === null) return;
  const targetId = target.id;
  if (targetId === req.user.id) return res.status(400).json({ error: 'Kendinizi silemezsiniz' });

  const deleteUser = db.transaction(() => {
    db.prepare('DELETE FROM user_permissions WHERE user_id=?').run(targetId);
    db.prepare('DELETE FROM task_comments WHERE user_id=?').run(targetId);
    db.prepare('DELETE FROM conversation_members WHERE user_id=?').run(targetId);
    db.prepare('DELETE FROM daily_reports WHERE user_id=?').run(targetId);
    db.prepare('DELETE FROM users WHERE id=? AND organization_id=?').run(targetId, req.user.organization_id);
  });
  deleteUser();
  res.json({ message: 'Kullanıcı silindi' });
});

// GET user permissions
router.get('/users/:id/permissions', requireManager, (req, res) => {
  const target = verifyOrgMembership(req, res);
  if (target === null) return;

  const perms = db.prepare('SELECT module, has_access FROM user_permissions WHERE user_id=?').all(target.id);
  const permMap = {};
  for (const mod of ALL_MODULES) permMap[mod] = 1;
  for (const p of perms) permMap[p.module] = p.has_access;
  res.json(permMap);
});

// UPDATE user permissions
router.put('/users/:id/permissions', requireManager, (req, res) => {
  const target = verifyOrgMembership(req, res);
  if (target === null) return;
  const userId = target.id;
  const permissions = req.body;
  const upsert = db.prepare(`
    INSERT INTO user_permissions (user_id, module, has_access) VALUES (?, ?, ?)
    ON CONFLICT(user_id, module) DO UPDATE SET has_access=excluded.has_access
  `);
  const updateAll = db.transaction(() => {
    for (const [mod, access] of Object.entries(permissions)) {
      if (ALL_MODULES.includes(mod)) {
        upsert.run(userId, mod, access ? 1 : 0);
      }
    }
  });
  updateAll();
  res.json({ message: 'Yetkiler güncellendi' });
});

// Current user profile
router.get('/me', (req, res) => {
  const user = db.prepare('SELECT id,name,email,role,department,phone FROM users WHERE id=?').get(req.user.id);
  res.json(user);
});

// Change own password
router.put('/me/password', (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!bcrypt.compareSync(currentPassword, user.password)) return res.status(400).json({ error: 'Mevcut şifre yanlış' });
  db.prepare('UPDATE users SET password=? WHERE id=?').run(bcrypt.hashSync(newPassword, 10), req.user.id);
  res.json({ message: 'Şifre güncellendi' });
});

export default router;
