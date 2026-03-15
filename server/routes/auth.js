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

// ☁️ BULUT GÜNCELLEMESİ 1: Fonksiyon async (asenkron) yapıldı
async function getUserPermissions(userId) {
  const permsRes = await db.query('SELECT module, has_access FROM user_permissions WHERE user_id=$1', [userId]);
  return permsRes.rows.filter(p => p.has_access === 1).map(p => p.module);
}

// ☁️ BULUT GÜNCELLEMESİ 2: Route async yapıldı ve try-catch eklendi
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email ve şifre gerekli' });
    }

    const ip = req.ip;
    if (checkBruteForce(ip)) {
      return res.status(429).json({ error: 'Çok fazla başarısız deneme. 15 dakika sonra tekrar deneyin.' });
    }

    // db.prepare yerine await db.query ve $1 formatı
    const userRes = await db.query('SELECT * FROM users WHERE email = $1', [email?.trim()?.toLowerCase()]);
    const user = userRes.rows[0];

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

    // getUserPermissions artık async olduğu için await ile çağrılır
    const permissions = await getUserPermissions(user.id);
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
  } catch (error) {
    console.error("Login Hatası:", error);
    res.status(500).json({ error: 'Sunucu hatası oluştu' });
  }
});

// ☁️ BULUT GÜNCELLEMESİ 3: Route async yapıldı
router.get('/me', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token gerekli' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // db.prepare yerine await db.query
    const userRes = await db.query('SELECT id, name, email, role, department, organization_id FROM users WHERE id = $1', [decoded.id]);
    const user = userRes.rows[0];

    if (!user) return res.status(401).json({ error: 'Kullanıcı bulunamadı' });

    // getUserPermissions async çağrısı
    const permissions = await getUserPermissions(user.id);
    res.json({ ...user, permissions });
  } catch (error) {
    console.error("Auth /me Hatası:", error);
    res.status(403).json({ error: 'Geçersiz token veya sunucu hatası' });
  }
});

export default router;
