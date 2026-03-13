import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db/database.js';

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
router.get('/conversations', (req, res) => {
  const userId = req.user.id;

  const conversations = db.prepare(`
    SELECT c.*,
      (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT message_type FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_type,
      (SELECT attachment_url FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_attachment_url,
      (SELECT sender_id FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_sender_id,
      (SELECT u.name FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_sender_name,
      (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id
        AND m.sender_id != ?
        AND m.created_at > COALESCE((SELECT last_read_at FROM conversation_members WHERE conversation_id = c.id AND user_id = ?), '1970-01-01')
      ) as unread_count
    FROM conversations c
    INNER JOIN conversation_members cm ON c.id = cm.conversation_id AND cm.user_id = ?
    ORDER BY last_message_at DESC NULLS LAST
  `).all(userId, userId, userId);

  const result = conversations.map(conv => {
    const members = db.prepare(`
      SELECT u.id, u.name, u.email, u.role, u.department
      FROM conversation_members cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.conversation_id = ?
    `).all(conv.id);

    let displayName = conv.name;
    if (conv.type === 'direct' && !conv.name) {
      const other = members.find(m => m.id !== userId);
      displayName = other ? other.name : 'Sohbet';
    }

    return { ...conv, members, display_name: displayName };
  });

  res.json(result);
});

// Create conversation
router.post('/conversations', (req, res) => {
  const { name, type, member_ids } = req.body;
  const userId = req.user.id;

  if (!member_ids || !member_ids.length) {
    return res.status(400).json({ error: 'En az bir üye seçin' });
  }

  // Verify all members belong to the same organization
  const orgId = req.user.organization_id;
  const placeholders = member_ids.map(() => '?').join(',');
  const validMembers = db.prepare(
    `SELECT id FROM users WHERE id IN (${placeholders}) AND organization_id = ? AND status = 'active'`
  ).all(...member_ids, orgId);
  if (validMembers.length !== member_ids.length) {
    return res.status(400).json({ error: 'Gecersiz veya yetkisiz uyeler' });
  }

  if (type === 'direct' && member_ids.length === 1) {
    const otherId = member_ids[0];
    const existing = db.prepare(`
      SELECT c.id FROM conversations c
      WHERE c.type = 'direct'
      AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = ?)
      AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = ?)
      AND (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = c.id) = 2
    `).get(userId, otherId);

    if (existing) {
      return res.json({ id: existing.id, existing: true });
    }
  }

  const result = db.transaction(() => {
    const r = db.prepare('INSERT INTO conversations (name, type, created_by) VALUES (?, ?, ?)')
      .run(name || null, type || 'direct', userId);

    const convId = r.lastInsertRowid;

    db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)').run(convId, userId);

    const allIds = [...new Set(member_ids)];
    allIds.forEach(memberId => {
      if (memberId !== userId) {
        db.prepare('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)').run(convId, memberId);
      }
    });

    return convId;
  })();

  res.status(201).json({ id: result, message: 'Sohbet oluşturuldu' });
});

// Get messages — with read receipts
router.get('/conversations/:id/messages', (req, res) => {
  const userId = req.user.id;
  const convId = req.params.id;

  const member = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(convId, userId);
  if (!member) return res.status(403).json({ error: 'Bu sohbete erişim yetkiniz yok' });

  const messages = db.prepare(`
    SELECT m.*, u.name as sender_name
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.conversation_id = ?
    ORDER BY m.created_at ASC
  `).all(convId);

  // Get all members' last_read_at (excluding current user) for read receipts
  const otherMembers = db.prepare(`
    SELECT cm.user_id, cm.last_read_at, u.name
    FROM conversation_members cm
    JOIN users u ON cm.user_id = u.id
    WHERE cm.conversation_id = ? AND cm.user_id != ?
  `).all(convId, userId);

  // For each message sent by current user, check who has read it
  const messagesWithReadStatus = messages.map(msg => {
    if (msg.sender_id === userId) {
      const readBy = otherMembers.filter(m => m.last_read_at && m.last_read_at >= msg.created_at);
      const allRead = readBy.length === otherMembers.length && otherMembers.length > 0;
      return { ...msg, read_by: readBy.map(r => ({ id: r.user_id, name: r.name })), all_read: allRead };
    }
    return msg;
  });

  // Update current user's last_read_at
  db.prepare('UPDATE conversation_members SET last_read_at = CURRENT_TIMESTAMP WHERE conversation_id = ? AND user_id = ?')
    .run(convId, userId);

  res.json(messagesWithReadStatus);
});

// Send message (text, media, audio, location)
router.post('/conversations/:id/messages', upload.single('attachment'), (req, res) => {
  let { content, message_type: bodyMessageType, lat, lng, label } = req.body;
  const userId = req.user.id;
  const convId = req.params.id;

  const member = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(convId, userId);
  if (!member) return res.status(403).json({ error: 'Bu sohbete erişim yetkiniz yok' });

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

  const r = db.prepare('INSERT INTO messages (conversation_id, sender_id, content, message_type, attachment_url) VALUES (?, ?, ?, ?, ?)')
    .run(convId, userId, content?.trim() || '', messageType, attachmentUrl);

  db.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(convId);
  db.prepare('UPDATE conversation_members SET last_read_at = CURRENT_TIMESTAMP WHERE conversation_id = ? AND user_id = ?')
    .run(convId, userId);

  const message = db.prepare(`
    SELECT m.*, u.name as sender_name FROM messages m
    JOIN users u ON m.sender_id = u.id WHERE m.id = ?
  `).get(r.lastInsertRowid);

  res.status(201).json(message);
});

// Unread count (scoped by organization via membership)
router.get('/unread-count', (req, res) => {
  const userId = req.user.id;
  const orgId = req.user.organization_id;
  const result = db.prepare(`
    SELECT COUNT(*) as count
    FROM messages m
    INNER JOIN conversation_members cm ON m.conversation_id = cm.conversation_id AND cm.user_id = ?
    INNER JOIN users u ON m.sender_id = u.id
    WHERE m.sender_id != ?
      AND m.created_at > COALESCE(cm.last_read_at, '1970-01-01')
      AND u.organization_id = ?
  `).get(userId, userId, orgId);

  res.json({ unread: result.count });
});

// Users list (same organization only)
router.get('/users', (req, res) => {
  const orgId = req.user.organization_id;
  const users = db.prepare(
    "SELECT id, name, email, role, department FROM users WHERE status = 'active' AND organization_id = ? AND id != ? ORDER BY name"
  ).all(orgId, req.user.id);
  res.json(users);
});

export default router;
