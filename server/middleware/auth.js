import jwt from 'jsonwebtoken';
import db from '../db/database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'workos-secret-key-2025';

export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Yetkilendirme gerekli' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Re-validate user from database to catch role/status changes
    const result = await db.query(
      'SELECT id, name, email, role, organization_id, status FROM users WHERE id = $1',
      [decoded.id]
    );
    const user = result.rows[0];

    if (!user || user.status === 'inactive') {
      return res.status(401).json({ error: 'Hesap devre disi veya bulunamadi' });
    }

    // Use fresh data from DB instead of stale JWT claims
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organization_id: user.organization_id,
    };
    next();
  } catch {
    return res.status(403).json({ error: 'Gecersiz token' });
  }
}

export { JWT_SECRET };
