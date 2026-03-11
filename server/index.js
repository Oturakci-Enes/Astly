import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import db from './db/database.js';
import { authenticateToken } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import tasksRoutes from './routes/tasks.js';
import messagingRoutes from './routes/messaging.js';
import settingsRoutes from './routes/settings.js';
import dashboardRoutes from './routes/dashboard.js';

const app = express();
const PORT = 3002;

app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const uploadsDir = join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
app.use('/uploads', express.static(uploadsDir));

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

app.listen(PORT, () => {
  console.log(`🚀 Work OS Server · Port ${PORT}`);
});
