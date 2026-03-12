import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db/database.js';
import { JWT_SECRET } from '../middleware/auth.js';

const router = Router();

const ALL_MODULES = ['dashboard', 'tasks', 'messaging'];

// Brute-force protection: track failed login attempts per IP
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCK_DURATION = 15 * 60 * 1000; // 15 minutes

function checkBruteForce(ip) {
  const record = loginAttempts.get(ip);
  if (!record) return false;
  if (Date.now() - record.firstAttempt > LOCK_DURATION) {
    loginAttempts.delete(ip);
    return false;
  }
  return record.count >= MAX_ATTEMPTS;
}

function recordFailedAttempt(ip) {
  const record = loginAttempts.get(ip);
  if (!record || Date.now() - record.firstAttempt > LOCK_DURATION) {
    loginAttempts.set(ip, { count: 1, firstAttempt: Date.now() });
  } else {
    record.count++;
  }
}

function clearAttempts(ip) {
  loginAttempts.delete(ip);
}

function getUserPermissions(userId) {
  const perms = db.prepare('SELECT module, has_access FROM user_permissions WHERE user_id=?').all(userId);
  return perms.filter(p => p.has_access === 1).map(p => p.module);
}

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email ve şifre gerekli' });
  }

  const ip = req.ip;
  if (checkBruteForce(ip)) {
    return res.status(429).json({ error: 'Çok fazla başarısız deneme. 15 dakika sonra tekrar deneyin.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email?.trim()?.toLowerCase());
  if (!user) {
    recordFailedAttempt(ip);
    return res.status(401).json({ error: 'Geçersiz kimlik bilgileri' });
  }

  if (user.status === 'inactive') {
    return res.status(403).json({ error: 'Hesabınız devre dışı bırakılmış' });
  }

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) {
    recordFailedAttempt(ip);
    return res.status(401).json({ error: 'Geçersiz kimlik bilgileri' });
  }

  clearAttempts(ip);

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
