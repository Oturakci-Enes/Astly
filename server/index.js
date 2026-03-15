import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import db from './db/database.js';
import { authenticateToken, JWT_SECRET } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import tasksRoutes from './routes/tasks.js';
import messagingRoutes from './routes/messaging.js';
import settingsRoutes from './routes/settings.js';
import dashboardRoutes from './routes/dashboard.js';
import notificationsRoutes from './routes/notifications.js';

const app = express();
const PORT = 3002;

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:4173'];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '1mb' }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const uploadsDir = join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
app.use('/uploads', (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  res.setHeader('Content-Disposition', 'inline');
  next();
}, authenticateToken, express.static(uploadsDir));

// Public
app.use('/api/auth', authRoutes);

// Protected
app.use('/api/dashboard', authenticateToken, dashboardRoutes);
app.use('/api/tasks', authenticateToken, tasksRoutes);
app.use('/api/messaging', authenticateToken, messagingRoutes);
app.use('/api/settings', authenticateToken, settingsRoutes);
app.use('/api/notifications', authenticateToken, notificationsRoutes);

// Auto-seed on first run - Tabloların oluşması için 2 saniye bekler
setTimeout(async () => {
  try {
    const result = await db.query('SELECT COUNT(*) as c FROM users');
    const count = parseInt(result.rows[0].c, 10);

    if (count === 0) {
      console.log('📦 İlk çalışma - örnek veri yükleniyor...');
      import('./db/seed.js').then(() => {
        console.log('✅ Seed tamamlandı!');
      }).catch(e => console.error('Seed hatası:', e));
    }
  } catch (error) {
    console.error('Veritabanı kontrol hatası:', error);
  }
}, 2000);

// ─── HTTP Server + Socket.io ────────────────────────────────────────────
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigins, credentials: true },
});

// Online users map: userId → { socketId, orgId }
const onlineUsers = new Map();

// Make io and onlineUsers available to route handlers via app.locals
app.locals.io = io;
app.locals.onlineUsers = onlineUsers;

// Socket authentication middleware — verify JWT (async)
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await db.query(
      "SELECT id, name, email, role, organization_id FROM users WHERE id = $1 AND status = 'active'",
      [decoded.id]
    );
    const user = result.rows[0];
    if (!user) return next(new Error('User not found'));
    socket.user = user;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

// ─── REST endpoint: get online user IDs for same org ────────────────────
app.get('/api/online-users', authenticateToken, (req, res) => {
  const orgId = req.user.organization_id;
  const ids = [];
  onlineUsers.forEach((val, uid) => {
    if (val.orgId === orgId) ids.push(uid);
  });
  res.json({ online: ids });
});

io.on('connection', (socket) => {
  const { id: userId, organization_id: orgId } = socket.user;

  onlineUsers.set(userId, { socketId: socket.id, orgId });
  socket.join(`org:${orgId}`);

  // Send current online users list to the new connection
  const orgOnlineIds = [];
  onlineUsers.forEach((val, uid) => {
    if (val.orgId === orgId) orgOnlineIds.push(uid);
  });
  socket.emit('online-users-list', { users: orgOnlineIds });

  // Broadcast to others in same org
  socket.to(`org:${orgId}`).emit('user-online', { userId });

  // ─── WebRTC call signaling ──────────────────────────────────────────
  socket.on('call-user', ({ to, type, offer }) => {
    const target = onlineUsers.get(to);
    if (target) {
      io.to(target.socketId).emit('incoming-call', {
        from: userId,
        fromName: socket.user.name,
        type,
        offer,
      });
    }
  });

  socket.on('call-accepted', ({ to, answer }) => {
    const target = onlineUsers.get(to);
    if (target) io.to(target.socketId).emit('call-accepted', { answer });
  });

  socket.on('call-rejected', ({ to }) => {
    const target = onlineUsers.get(to);
    if (target) io.to(target.socketId).emit('call-rejected', {});
  });

  socket.on('call-ended', ({ to }) => {
    const target = onlineUsers.get(to);
    if (target) io.to(target.socketId).emit('call-ended', {});
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    const target = onlineUsers.get(to);
    if (target) io.to(target.socketId).emit('ice-candidate', { candidate });
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(userId);
    io.to(`org:${orgId}`).emit('user-offline', { userId });
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Work OS Server · Port ${PORT}`);
});
