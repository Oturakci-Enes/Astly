import express from 'express';
import db from '../db/database.js';
const router = express.Router();

// GET notifications for current user (latest 50, unread first)
router.get('/', (req, res) => {
  const userId = req.user.id;
  const notifications = db.prepare(`
    SELECT * FROM notifications
    WHERE user_id = ?
    ORDER BY is_read ASC, created_at DESC
    LIMIT 50
  `).all(userId);
  res.json(notifications);
});

// GET unread count
router.get('/unread-count', (req, res) => {
  const userId = req.user.id;
  const result = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(userId);
  res.json({ count: result.count });
});

// PUT mark single as read
router.put('/:id/read', (req, res) => {
  const userId = req.user.id;
  const notifId = req.params.id;
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(notifId, userId);
  res.json({ message: 'ok' });
});

// PUT mark all as read
router.put('/read-all', (req, res) => {
  const userId = req.user.id;
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(userId);
  res.json({ message: 'ok' });
});

export default router;
