import express from 'express';
import db from '../db/database.js';
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    const totalTasks = (await db.query(`
      SELECT COUNT(*) as c FROM tasks t
      LEFT JOIN users u ON t.assigned_by = u.id
      WHERE u.organization_id = $1
    `, [orgId])).rows[0].c;

    const pendingTasks = (await db.query(`
      SELECT COUNT(*) as c FROM tasks t
      LEFT JOIN users u ON t.assigned_by = u.id
      WHERE u.organization_id = $1 AND t.status = 'pending'
    `, [orgId])).rows[0].c;

    const inProgressTasks = (await db.query(`
      SELECT COUNT(*) as c FROM tasks t
      LEFT JOIN users u ON t.assigned_by = u.id
      WHERE u.organization_id = $1 AND t.status = 'in_progress'
    `, [orgId])).rows[0].c;

    const completedTasks = (await db.query(`
      SELECT COUNT(*) as c FROM tasks t
      LEFT JOIN users u ON t.assigned_by = u.id
      WHERE u.organization_id = $1 AND t.status = 'completed'
    `, [orgId])).rows[0].c;

    const overdueTasks = (await db.query(`
      SELECT COUNT(*) as c FROM tasks t
      LEFT JOIN users u ON t.assigned_by = u.id
      WHERE u.organization_id = $1
        AND t.status != 'completed'
        AND t.due_date < CURRENT_DATE
    `, [orgId])).rows[0].c;

    const totalUsers = (await db.query(
      "SELECT COUNT(*) as c FROM users WHERE status = 'active' AND organization_id = $1",
      [orgId]
    )).rows[0].c;

    const totalMessages = (await db.query(`
      SELECT COUNT(*) as c FROM messages m
      LEFT JOIN users u ON m.sender_id = u.id
      WHERE u.organization_id = $1
    `, [orgId])).rows[0].c;

    const todayReports = (await db.query(`
      SELECT COUNT(*) as c FROM daily_reports dr
      LEFT JOIN users u ON dr.user_id = u.id
      WHERE u.organization_id = $1 AND dr.report_date = CURRENT_DATE
    `, [orgId])).rows[0].c;

    const recentTasksResult = await db.query(`
      SELECT t.*, u1.name as assigned_to_name
      FROM tasks t
      LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN users creator ON t.assigned_by = creator.id
      WHERE creator.organization_id = $1
      ORDER BY t.created_at DESC LIMIT 5
    `, [orgId]);

    const urgentTasksResult = await db.query(`
      SELECT t.*, u1.name as assigned_to_name
      FROM tasks t
      LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN users creator ON t.assigned_by = creator.id
      WHERE creator.organization_id = $1
        AND t.status != 'completed'
        AND (t.priority = 'urgent' OR t.priority = 'high')
      ORDER BY CASE t.priority WHEN 'urgent' THEN 0 ELSE 1 END, t.due_date ASC
      LIMIT 5
    `, [orgId]);

    res.json({
      stats: {
        totalTasks: parseInt(totalTasks),
        pendingTasks: parseInt(pendingTasks),
        inProgressTasks: parseInt(inProgressTasks),
        completedTasks: parseInt(completedTasks),
        overdueTasks: parseInt(overdueTasks),
        totalUsers: parseInt(totalUsers),
        totalMessages: parseInt(totalMessages),
        todayReports: parseInt(todayReports),
      },
      recentTasks: recentTasksResult.rows,
      urgentTasks: urgentTasksResult.rows,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Dashboard verileri yüklenirken hata oluştu' });
  }
});

export default router;
