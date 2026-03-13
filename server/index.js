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

// Auto-seed on first run
const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get();
if (userCount.c === 0) {
  console.log('📦 İlk çalışma — örnek veri yükleniyor...');
  import('./db/seed.js').then(() => {
    console.log('✅ Seed tamamlandı!');
  }).catch(e => console.error('Seed hatası:', e));
}

// ─── HTTP Server + Socket.io (WebRTC Signaling) ────────────────────────
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigins, credentials: true },
});

// Socket authentication middleware — verify JWT
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare("SELECT id, name, email, role, organization_id FROM users WHERE id = ? AND status = 'active'").get(decoded.id);
    if (!user) return next(new Error('User not found'));
    socket.user = user;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

// Online users map: userId → socketId
const onlineUsers = new Map();

io.on('connection', (socket) => {
  const userId = socket.user.id;
  onlineUsers.set(userId, socket.id);

  // Caller sends call offer to target user
  socket.on('call-user', ({ to, type, offer }) => {
    const targetSocket = onlineUsers.get(to);
    if (targetSocket) {
      io.to(targetSocket).emit('incoming-call', {
        from: userId,
        fromName: socket.user.name,
        type,
        offer,
      });
    }
  });

  // Callee accepts the call
  socket.on('call-accepted', ({ to, answer }) => {
    const targetSocket = onlineUsers.get(to);
    if (targetSocket) {
      io.to(targetSocket).emit('call-accepted', { answer });
    }
  });

  // Callee rejects the call
  socket.on('call-rejected', ({ to }) => {
    const targetSocket = onlineUsers.get(to);
    if (targetSocket) {
      io.to(targetSocket).emit('call-rejected', {});
    }
  });

  // Either party ends the call
  socket.on('call-ended', ({ to }) => {
    const targetSocket = onlineUsers.get(to);
    if (targetSocket) {
      io.to(targetSocket).emit('call-ended', {});
    }
  });

  // ICE candidate exchange for WebRTC
  socket.on('ice-candidate', ({ to, candidate }) => {
    const targetSocket = onlineUsers.get(to);
    if (targetSocket) {
      io.to(targetSocket).emit('ice-candidate', { candidate });
    }
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(userId);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Work OS Server · Port ${PORT}`);
});
