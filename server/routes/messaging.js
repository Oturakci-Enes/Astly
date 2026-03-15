import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db/database.js';
import { sendNotificationToMany } from '../helpers/notifications.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_MIMETYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/wav',
];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Desteklenmeyen dosya tipi'), false);
    }
  }
});

const router = express.Router();

// List user's conversations
router.get('/conversations', async (req, res) => {
  try {
    const userId = req.user.id;

    const conversationsResult = await db.query(`
      SELECT c.*,
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT message_type FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_type,
        (SELECT attachment_url FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_attachment_url,
        (SELECT sender_id FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_sender_id,
        (SELECT u.name FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_sender_name,
        (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id
          AND m.sender_id != $1
          AND m.created_at > COALESCE((SELECT last_read_at FROM conversation_members WHERE conversation_id = c.id AND user_id = $2), '1970-01-01')
        ) as unread_count
      FROM conversations c
      INNER JOIN conversation_members cm ON c.id = cm.conversation_id AND cm.user_id = $3
      ORDER BY last_message_at DESC NULLS LAST
    `, [userId, userId, userId]);

    const result = [];
    for (const conv of conversationsResult.rows) {
      const membersResult = await db.query(`
        SELECT u.id, u.name, u.email, u.role, u.department
        FROM conversation_members cm
        JOIN users u ON cm.user_id = u.id
        WHERE cm.conversation_id = $1
      `, [conv.id]);

      let displayName = conv.name;
      if (conv.type === 'direct' && !conv.name) {
        const other = membersResult.rows.find(m => m.id !== userId);
        displayName = other ? other.name : 'Sohbet';
      }

      result.push({ ...conv, members: membersResult.rows, display_name: displayName });
    }

    res.json(result);
  } catch (error) {
    console.error('Conversations list error:', error);
    res.status(500).json({ error: 'Sohbetler yüklenirken hata oluştu' });
  }
});

// Create conversation
router.post('/conversations', async (req, res) => {
  const { name, type, member_ids } = req.body;
  const userId = req.user.id;

  if (!member_ids || !member_ids.length) {
    return res.status(400).json({ error: 'En az bir üye seçin' });
  }

  const client = await db.connect();
  try {
    // Verify all members belong to the same organization
    const orgId = req.user.organization_id;
    const placeholders = member_ids.map((_, i) => `$${i + 1}`).join(',');
    const validMembersResult = await client.query(
      `SELECT id FROM users WHERE id IN (${placeholders}) AND organization_id = $${member_ids.length + 1} AND status = 'active'`,
      [...member_ids, orgId]
    );
    if (validMembersResult.rows.length !== member_ids.length) {
      client.release();
      return res.status(400).json({ error: 'Gecersiz veya yetkisiz uyeler' });
    }

    if (type === 'direct' && member_ids.length === 1) {
      const otherId = member_ids[0];
      const existingResult = await client.query(`
        SELECT c.id FROM conversations c
        WHERE c.type = 'direct'
        AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = $1)
        AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = $2)
        AND (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = c.id) = 2
      `, [userId, otherId]);

      if (existingResult.rows[0]) {
        client.release();
        return res.json({ id: existingResult.rows[0].id, existing: true });
      }
    }

    await client.query('BEGIN');

    const r = await client.query(
      'INSERT INTO conversations (name, type, created_by) VALUES ($1, $2, $3) RETURNING id',
      [name || null, type || 'direct', userId]
    );
    const convId = r.rows[0].id;

    await client.query(
      'INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2)',
      [convId, userId]
    );

    const allIds = [...new Set(member_ids)];
    for (const memberId of allIds) {
      if (memberId !== userId) {
        await client.query(
          'INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [convId, memberId]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ id: convId, message: 'Sohbet oluşturuldu' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Conversation create error:', error);
    res.status(500).json({ error: 'Sohbet oluşturulurken hata oluştu' });
  } finally {
    client.release();
  }
});

// Get messages — with read receipts
router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const userId = req.user.id;
    const convId = req.params.id;

    const memberResult = await db.query(
      'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
      [convId, userId]
    );
    if (!memberResult.rows[0]) return res.status(403).json({ error: 'Bu sohbete erişim yetkiniz yok' });

    const messagesResult = await db.query(`
      SELECT m.*, u.name as sender_name
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = $1
      ORDER BY m.created_at ASC
    `, [convId]);

    // Get all members' last_read_at (excluding current user) for read receipts
    const otherMembersResult = await db.query(`
      SELECT cm.user_id, cm.last_read_at, u.name
      FROM conversation_members cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.conversation_id = $1 AND cm.user_id != $2
    `, [convId, userId]);
    const otherMembers = otherMembersResult.rows;

    // For each message sent by current user, check who has read it
    const messagesWithReadStatus = messagesResult.rows.map(msg => {
      if (msg.sender_id === userId) {
        const readBy = otherMembers.filter(m => m.last_read_at && m.last_read_at >= msg.created_at);
        const allRead = readBy.length === otherMembers.length && otherMembers.length > 0;
        return { ...msg, read_by: readBy.map(r => ({ id: r.user_id, name: r.name })), all_read: allRead };
      }
      return msg;
    });

    // Update current user's last_read_at
    await db.query(
      'UPDATE conversation_members SET last_read_at = CURRENT_TIMESTAMP WHERE conversation_id = $1 AND user_id = $2',
      [convId, userId]
    );

    res.json(messagesWithReadStatus);
  } catch (error) {
    console.error('Messages get error:', error);
    res.status(500).json({ error: 'Mesajlar yüklenirken hata oluştu' });
  }
});

// Send message (text, media, audio, location)
router.post('/conversations/:id/messages', upload.single('attachment'), async (req, res) => {
  try {
    let { content, message_type: bodyMessageType, lat, lng, label } = req.body;
    const userId = req.user.id;
    const convId = req.params.id;

    const memberResult = await db.query(
      'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
      [convId, userId]
    );
    if (!memberResult.rows[0]) return res.status(403).json({ error: 'Bu sohbete erişim yetkiniz yok' });

    let attachmentUrl = null;
    let messageType = 'text';

    // File attachments: image / video / audio
    if (req.file) {
      attachmentUrl = `/uploads/${req.file.filename}`;
      if (req.file.mimetype.startsWith('video/')) {
        messageType = 'video';
      } else if (req.file.mimetype.startsWith('audio/')) {
        messageType = 'audio';
      } else {
        messageType = 'image';
      }
    } else if (bodyMessageType === 'location' && lat && lng) {
      // Location message without file
      messageType = 'location';
      const latitude = Number(lat);
      const longitude = Number(lng);
      if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
        return res.status(400).json({ error: 'Geçersiz konum bilgisi' });
      }
      const payload = {
        lat: latitude,
        lng: longitude,
        label: label || null,
      };
      content = JSON.stringify(payload);
    }

    if (!content?.trim() && !attachmentUrl) {
      return res.status(400).json({ error: 'Mesaj boş olamaz' });
    }

    const r = await db.query(
      'INSERT INTO messages (conversation_id, sender_id, content, message_type, attachment_url) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [convId, userId, content?.trim() || '', messageType, attachmentUrl]
    );
    const messageId = r.rows[0].id;

    await db.query('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [convId]);
    await db.query(
      'UPDATE conversation_members SET last_read_at = CURRENT_TIMESTAMP WHERE conversation_id = $1 AND user_id = $2',
      [convId, userId]
    );

    const messageResult = await db.query(`
      SELECT m.*, u.name as sender_name FROM messages m
      JOIN users u ON m.sender_id = u.id WHERE m.id = $1
    `, [messageId]);
    const message = messageResult.rows[0];

    // Send notification to other conversation members
    const membersResult = await db.query(
      'SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND user_id != $2',
      [convId, userId]
    );
    const convResult = await db.query('SELECT name, type FROM conversations WHERE id = $1', [convId]);
    const conv = convResult.rows[0];
    const memberIds = membersResult.rows.map(m => m.user_id);
    if (memberIds.length > 0) {
      const msgPreview = (content?.trim() || '').substring(0, 50);
      const displayTitle = conv?.type === 'group' ? (conv.name || 'Group') : req.user.name;
      await sendNotificationToMany(req.app, memberIds, {
        orgId: req.user.organization_id,
        type: 'new_message',
        title: displayTitle,
        message: msgPreview || (messageType !== 'text' ? `[${messageType}]` : ''),
        referenceId: Number(convId),
        referenceType: 'conversation',
      });
    }

    res.status(201).json(message);
  } catch (error) {
    console.error('Message send error:', error);
    res.status(500).json({ error: 'Mesaj gönderilirken hata oluştu' });
  }
});

// Unread count (scoped by organization via membership)
router.get('/unread-count', async (req, res) => {
  try {
    const userId = req.user.id;
    const orgId = req.user.organization_id;
    const result = await db.query(`
      SELECT COUNT(*) as count
      FROM messages m
      INNER JOIN conversation_members cm ON m.conversation_id = cm.conversation_id AND cm.user_id = $1
      INNER JOIN users u ON m.sender_id = u.id
      WHERE m.sender_id != $2
        AND m.created_at > COALESCE(cm.last_read_at, '1970-01-01')
        AND u.organization_id = $3
    `, [userId, userId, orgId]);

    res.json({ unread: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Unread count error:', error);
    res.status(500).json({ error: 'Okunmamış mesaj sayısı alınırken hata oluştu' });
  }
});

// Users list (same organization only)
router.get('/users', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await db.query(
      "SELECT id, name, email, role, department FROM users WHERE status = 'active' AND organization_id = $1 AND id != $2 ORDER BY name",
      [orgId, req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Messaging users list error:', error);
    res.status(500).json({ error: 'Kullanıcı listesi yüklenirken hata oluştu' });
  }
});

export default router;
