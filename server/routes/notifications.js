import express from 'express';
import db from '../db/database.js';
const router = express.Router();

// GET notifications for current user (latest 50, unread first)
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await db.query(`
      SELECT * FROM notifications
      WHERE user_id = $1
      ORDER BY is_read ASC, created_at DESC
      LIMIT 50
    `, [userId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Notifications list error:', error);
    res.status(500).json({ error: 'Bildirimler yüklenirken hata oluştu' });
  }
});

// GET unread count
router.get('/unread-count', async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await db.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = 0',
      [userId]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Unread count error:', error);
    res.status(500).json({ error: 'Okunmamış bildirim sayısı alınırken hata oluştu' });
  }
});

// PUT mark single as read
router.put('/:id/read', async (req, res) => {
  try {
    const userId = req.user.id;
    const notifId = req.params.id;
    await db.query(
      'UPDATE notifications SET is_read = 1 WHERE id = $1 AND user_id = $2',
      [notifId, userId]
    );
    res.json({ message: 'ok' });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Bildirim okundu olarak işaretlenirken hata oluştu' });
  }
});

// PUT mark all as read
router.put('/read-all', async (req, res) => {
  try {
    const userId = req.user.id;
    await db.query(
      'UPDATE notifications SET is_read = 1 WHERE user_id = $1 AND is_read = 0',
      [userId]
    );
    res.json({ message: 'ok' });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ error: 'Bildirimler okundu olarak işaretlenirken hata oluştu' });
  }
});

export default router;
