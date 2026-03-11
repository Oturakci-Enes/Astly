import express from 'express';
import db from '../db/database.js';
import bcrypt from 'bcryptjs';
const router = express.Router();

const ALL_MODULES = ['dashboard', 'tasks', 'messaging'];

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Sadece yönetici' });
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

// CREATE user
router.post('/users', requireAdmin, (req, res) => {
  const { name, email, password, role, department, phone } = req.body;
  const hashed = bcrypt.hashSync(password, 10);
  try {
    const r = db
      .prepare('INSERT INTO users (name,email,password,role,department,phone,organization_id) VALUES (?,?,?,?,?,?,?)')
      .run(name, email, hashed, role || 'user', department, phone, req.user.organization_id);
    const userId = r.lastInsertRowid;
    const ins = db.prepare('INSERT INTO user_permissions (user_id, module, has_access) VALUES (?, ?, 1)');
    for (const mod of ALL_MODULES) ins.run(userId, mod);
    res.status(201).json({ id: userId });
  } catch(e) { res.status(400).json({ error: 'E-posta zaten kullanımda' }); }
});

// UPDATE user
router.put('/users/:id', requireAdmin, (req, res) => {
  const { name, email, role, department, phone, status, password } = req.body;
  if (password) {
    const hashed = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET name=COALESCE(?,name),email=COALESCE(?,email),password=?,role=COALESCE(?,role),department=COALESCE(?,department),phone=COALESCE(?,phone),status=COALESCE(?,status) WHERE id=?')
      .run(name,email,hashed,role,department,phone,status,req.params.id);
  } else {
    db.prepare('UPDATE users SET name=COALESCE(?,name),email=COALESCE(?,email),role=COALESCE(?,role),department=COALESCE(?,department),phone=COALESCE(?,phone),status=COALESCE(?,status) WHERE id=?')
      .run(name,email,role,department,phone,status,req.params.id);
  }
  res.json({ message: 'Kullanıcı güncellendi' });
});

// DELETE user
router.delete('/users/:id', requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.user.id) return res.status(400).json({ error: 'Kendinizi silemezsiniz' });
  db.prepare('DELETE FROM users WHERE id=?').run(targetId);
  res.json({ message: 'Kullanıcı silindi' });
});

// GET user permissions
router.get('/users/:id/permissions', requireAdmin, (req, res) => {
  const perms = db.prepare('SELECT module, has_access FROM user_permissions WHERE user_id=?').all(req.params.id);
  const permMap = {};
  for (const mod of ALL_MODULES) permMap[mod] = 1;
  for (const p of perms) permMap[p.module] = p.has_access;
  res.json(permMap);
});

// UPDATE user permissions
router.put('/users/:id/permissions', requireAdmin, (req, res) => {
  const userId = Number(req.params.id);
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
