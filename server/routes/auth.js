import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db/database.js';
import { JWT_SECRET } from '../middleware/auth.js';

const router = Router();

const ALL_MODULES = ['dashboard', 'tasks', 'messaging'];

function getUserPermissions(userId) {
  const perms = db.prepare('SELECT module, has_access FROM user_permissions WHERE user_id=?').all(userId);
  return perms.filter(p => p.has_access === 1).map(p => p.module);
}

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email ve şifre gerekli' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    return res.status(401).json({ error: 'Geçersiz kimlik bilgileri' });
  }

  if (user.status === 'inactive') {
    return res.status(403).json({ error: 'Hesabınız devre dışı bırakılmış' });
  }

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'Geçersiz kimlik bilgileri' });
  }

  const permissions = getUserPermissions(user.id);
  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      organization_id: user.organization_id,
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      organization_id: user.organization_id,
      permissions,
    },
  });
});

router.get('/me', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token gerekli' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, name, email, role, department, organization_id FROM users WHERE id = ?').get(decoded.id);
    if (!user) return res.status(401).json({ error: 'Kullanıcı bulunamadı' });
    const permissions = getUserPermissions(user.id);
    res.json({ ...user, permissions });
  } catch {
    res.status(403).json({ error: 'Geçersiz token' });
  }
});

export default router;
