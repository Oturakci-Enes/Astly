import express from 'express';
import db from '../db/database.js';
const router = express.Router();

router.get('/', (req, res) => {
  const orgId = req.user.organization_id;

  const totalTasks = db.prepare(`
    SELECT COUNT(*) as c FROM tasks t
    LEFT JOIN users u ON t.assigned_by = u.id
    WHERE u.organization_id = ?
  `).get(orgId).c;

  const pendingTasks = db.prepare(`
    SELECT COUNT(*) as c FROM tasks t
    LEFT JOIN users u ON t.assigned_by = u.id
    WHERE u.organization_id = ? AND t.status = 'pending'
  `).get(orgId).c;

  const inProgressTasks = db.prepare(`
    SELECT COUNT(*) as c FROM tasks t
    LEFT JOIN users u ON t.assigned_by = u.id
    WHERE u.organization_id = ? AND t.status = 'in_progress'
  `).get(orgId).c;

  const completedTasks = db.prepare(`
    SELECT COUNT(*) as c FROM tasks t
    LEFT JOIN users u ON t.assigned_by = u.id
    WHERE u.organization_id = ? AND t.status = 'completed'
  `).get(orgId).c;

  const overdueTasks = db.prepare(`
    SELECT COUNT(*) as c FROM tasks t
    LEFT JOIN users u ON t.assigned_by = u.id
    WHERE u.organization_id = ?
      AND t.status != 'completed'
      AND t.due_date < date('now')
  `).get(orgId).c;

  const totalUsers = db.prepare("SELECT COUNT(*) as c FROM users WHERE status = 'active' AND organization_id = ?").get(orgId).c;

  const totalMessages = db.prepare(`
    SELECT COUNT(*) as c FROM messages m
    LEFT JOIN users u ON m.sender_id = u.id
    WHERE u.organization_id = ?
  `).get(orgId).c;

  const todayReports = db.prepare(`
    SELECT COUNT(*) as c FROM daily_reports dr
    LEFT JOIN users u ON dr.user_id = u.id
    WHERE u.organization_id = ? AND dr.report_date = date('now')
  `).get(orgId).c;

  const recentTasks = db.prepare(`
    SELECT t.*, u1.name as assigned_to_name
    FROM tasks t
    LEFT JOIN users u1 ON t.assigned_to = u1.id
    LEFT JOIN users creator ON t.assigned_by = creator.id
    WHERE creator.organization_id = ?
    ORDER BY t.created_at DESC LIMIT 5
  `).all(orgId);

  const urgentTasks = db.prepare(`
    SELECT t.*, u1.name as assigned_to_name
    FROM tasks t
    LEFT JOIN users u1 ON t.assigned_to = u1.id
    LEFT JOIN users creator ON t.assigned_by = creator.id
    WHERE creator.organization_id = ?
      AND t.status != 'completed'
      AND (t.priority = 'urgent' OR t.priority = 'high')
    ORDER BY CASE t.priority WHEN 'urgent' THEN 0 ELSE 1 END, t.due_date ASC
    LIMIT 5
  `).all(orgId);

  res.json({
    stats: { totalTasks, pendingTasks, inProgressTasks, completedTasks, overdueTasks, totalUsers, totalMessages, todayReports },
    recentTasks,
    urgentTasks,
  });
});

export default router;
