import db from '../db/database.js';

/**
 * Create a notification and send it via socket if user is online
 * @param {Object} app - Express app instance (has app.locals.io and app.locals.onlineUsers)
 * @param {Object} opts - { userId, orgId, type, title, message, referenceId, referenceType }
 */
export function sendNotification(app, { userId, orgId, type, title, message, referenceId, referenceType }) {
  try {
    // Insert into DB
    const result = db.prepare(`
      INSERT INTO notifications (user_id, organization_id, type, title, message, reference_id, reference_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, orgId, type, title, message || null, referenceId || null, referenceType || null);

    const notification = {
      id: result.lastInsertRowid,
      user_id: userId,
      type,
      title,
      message,
      reference_id: referenceId,
      reference_type: referenceType,
      is_read: 0,
      created_at: new Date().toISOString(),
    };

    // Send via socket if user is online
    const io = app?.locals?.io;
    const onlineUsers = app?.locals?.onlineUsers;
    if (io && onlineUsers) {
      const userSocket = onlineUsers.get(userId);
      if (userSocket) {
        io.to(userSocket.socketId).emit('notification', notification);
      }
    }

    return notification;
  } catch (err) {
    console.error('Notification error:', err.message);
    return null;
  }
}

/**
 * Send notification to multiple users
 */
export function sendNotificationToMany(app, userIds, { orgId, type, title, message, referenceId, referenceType }) {
  for (const userId of userIds) {
    sendNotification(app, { userId, orgId, type, title, message, referenceId, referenceType });
  }
}
