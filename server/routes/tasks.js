import express from 'express';
import db from '../db/database.js';
import { getPowerScore, canSee, canAssignTo, canDeleteTask, canPublishAnnouncement, canDeleteAnnouncement, getVisibleRolesSQL } from '../helpers/powerScore.js';
import { sendNotification, sendNotificationToMany } from '../helpers/notifications.js';
const router = express.Router();

// =====================
// TASKS
// =====================

// List tasks (Power-score-based visibility)
router.get('/', async (req, res) => {
  try {
    const { status, assigned_to, priority } = req.query;
    const orgId = req.user.organization_id;
    const userRole = req.user.role;
    const userId = req.user.id;
    const userPower = getPowerScore(userRole);

    const where = ['org_user.organization_id = $1'];
    const params = [orgId];
    let paramIndex = 2;

    // Power score visibility:
    // Admin(100): sees all tasks
    // Others: see tasks assigned to users with equal or lower power, plus own tasks
    if (userPower < 100) {
      const visibleRoles = getVisibleRolesSQL(userRole);
      where.push(`(u1.role IN (${visibleRoles}) OR t.assigned_to = $${paramIndex} OR t.assigned_by = $${paramIndex + 1})`);
      params.push(userId, userId);
      paramIndex += 2;
    }

    if (status) { where.push(`t.status = $${paramIndex}`); params.push(status); paramIndex++; }
    if (assigned_to) { where.push(`t.assigned_to = $${paramIndex}`); params.push(assigned_to); paramIndex++; }
    if (priority) { where.push(`t.priority = $${paramIndex}`); params.push(priority); paramIndex++; }

    const whereClause = `WHERE ${where.join(' AND ')}`;

    const result = await db.query(`
      SELECT t.*,
        u1.name as assigned_to_name,
        u1.role as assigned_to_role,
        u2.name as assigned_by_name,
        (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id) as comment_count
      FROM tasks t
      LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN users u2 ON t.assigned_by = u2.id
      LEFT JOIN users org_user ON t.assigned_by = org_user.id
      ${whereClause}
      ORDER BY
        CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        t.due_date ASC NULLS LAST,
        t.created_at DESC
    `, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Task list error:', error);
    res.status(500).json({ error: 'Görevler yüklenirken hata oluştu' });
  }
});

// Get single task with comments - scoped to current organization
router.get('/:id', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const taskResult = await db.query(`
      SELECT t.*,
        u1.name as assigned_to_name,
        u2.name as assigned_by_name
      FROM tasks t
      LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN users u2 ON t.assigned_by = u2.id
      LEFT JOIN users org_user ON t.assigned_by = org_user.id
      WHERE t.id = $1 AND org_user.organization_id = $2
    `, [req.params.id, orgId]);

    const task = taskResult.rows[0];
    if (!task) return res.status(404).json({ error: 'Görev bulunamadı' });

    const commentsResult = await db.query(`
      SELECT tc.*, u.name as user_name FROM task_comments tc
      LEFT JOIN users u ON tc.user_id = u.id
      WHERE tc.task_id = $1
      ORDER BY tc.created_at ASC
    `, [req.params.id]);

    res.json({ ...task, comments: commentsResult.rows });
  } catch (error) {
    console.error('Task detail error:', error);
    res.status(500).json({ error: 'Görev detayları yüklenirken hata oluştu' });
  }
});

// Create task (Power-score-based assignment validation)
router.post('/', async (req, res) => {
  const { title, description, assigned_to, priority, due_date, category } = req.body;
  if (!title) return res.status(400).json({ error: 'Görev başlığı gerekli' });

  const assignees = Array.isArray(assigned_to) ? assigned_to : [assigned_to];

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    for (const userId of assignees) {
      if (userId) {
        const targetResult = await client.query(
          'SELECT id, role FROM users WHERE id = $1 AND organization_id = $2',
          [userId, req.user.organization_id]
        );
        const targetUser = targetResult.rows[0];

        if (!targetUser) continue;

        // Power score check: can only assign to equal or lower power
        if (!canAssignTo(req.user.role, targetUser.role)) {
          continue; // Skip users with higher power score
        }

        await client.query(
          'INSERT INTO tasks (title, description, assigned_to, assigned_by, priority, due_date, category) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [title, description || null, userId, req.user.id, priority || 'medium', due_date || null, category || null]
        );
      }
    }

    await client.query('COMMIT');

    // Send notifications to assignees (outside transaction)
    for (const userId of assignees) {
      if (userId && userId !== req.user.id) {
        await sendNotification(req.app, {
          userId: Number(userId),
          orgId: req.user.organization_id,
          type: 'task_assigned',
          title: title,
          message: `${req.user.name}`,
          referenceId: null,
          referenceType: 'task',
        });
      }
    }

    res.status(201).json({ message: 'Görev(ler) başarıyla oluşturuldu' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Görev oluşturma hatası:", error);
    res.status(500).json({ error: 'Görevler oluşturulurken bir hata oluştu' });
  } finally {
    client.release();
  }
});

// Update task - scoped to current organization
router.put('/:id', async (req, res) => {
  try {
    const { title, description, assigned_to, status, priority, due_date, category } = req.body;

    const orgId = req.user.organization_id;
    const taskResult = await db.query(`
      SELECT t.* FROM tasks t
      LEFT JOIN users org_user ON t.assigned_by = org_user.id
      WHERE t.id = $1 AND org_user.organization_id = $2
    `, [req.params.id, orgId]);
    const task = taskResult.rows[0];
    if (!task) return res.status(404).json({ error: 'Görev bulunamadı' });

    // Verify assigned_to user belongs to same organization and power score allows assignment
    if (assigned_to) {
      const targetResult = await db.query(
        'SELECT id, role FROM users WHERE id = $1 AND organization_id = $2',
        [assigned_to, orgId]
      );
      const targetUser = targetResult.rows[0];
      if (!targetUser) return res.status(400).json({ error: 'Geçersiz atanan kullanıcı' });
      if (!canAssignTo(req.user.role, targetUser.role)) {
        return res.status(403).json({ error: 'Bu kullanıcıya görev atama yetkiniz yok' });
      }
    }

    const completedAt = status === 'completed' && task.status !== 'completed'
      ? new Date().toISOString()
      : (status !== 'completed' ? null : task.completed_at);

    await db.query(`
      UPDATE tasks SET title=$1, description=$2, assigned_to=$3, status=$4, priority=$5, due_date=$6, category=$7, completed_at=$8, updated_at=CURRENT_TIMESTAMP WHERE id=$9
    `, [
      title ?? task.title,
      description ?? task.description,
      assigned_to ?? task.assigned_to,
      status ?? task.status,
      priority ?? task.priority,
      due_date ?? task.due_date,
      category ?? task.category,
      completedAt,
      req.params.id
    ]);

    res.json({ message: 'Görev güncellendi' });
  } catch (error) {
    console.error('Task update error:', error);
    res.status(500).json({ error: 'Görev güncellenirken hata oluştu' });
  }
});

// Delete task - Power-score-based armor system
router.delete('/:id', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const requesterRole = req.user.role;

    const taskResult = await db.query(`
      SELECT t.*, u_creator.role as creator_role, u_creator.id as creator_id
      FROM tasks t
      JOIN users u_creator ON t.assigned_by = u_creator.id
      WHERE t.id = $1 AND u_creator.organization_id = $2
    `, [req.params.id, orgId]);
    const task = taskResult.rows[0];

    if (!task) return res.status(404).json({ error: 'Görev bulunamadı' });

    // Power score armor: can only delete tasks created by someone with equal or lower power
    if (!canDeleteTask(requesterRole, task.creator_role)) {
      return res.status(403).json({ error: 'Üst kademe tarafından verilen görevleri reddedemez veya silemezsiniz.' });
    }

    await db.query('DELETE FROM task_comments WHERE task_id = $1', [task.id]);
    await db.query('DELETE FROM tasks WHERE id = $1', [task.id]);

    res.json({ message: 'Görev başarıyla kaldırıldı / reddedildi' });
  } catch (error) {
    console.error('Task delete error:', error);
    res.status(500).json({ error: 'Görev silinirken hata oluştu' });
  }
});

// Add comment - verify task belongs to user's organization
router.post('/:id/comments', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Yorum içeriği gerekli' });

    const orgId = req.user.organization_id;
    const taskResult = await db.query(`
      SELECT t.id FROM tasks t
      LEFT JOIN users org_user ON t.assigned_by = org_user.id
      WHERE t.id = $1 AND org_user.organization_id = $2
    `, [req.params.id, orgId]);
    if (!taskResult.rows[0]) return res.status(404).json({ error: 'Görev bulunamadı' });

    await db.query(
      'INSERT INTO task_comments (task_id, user_id, content) VALUES ($1, $2, $3)',
      [req.params.id, req.user.id, content]
    );

    res.status(201).json({ message: 'Yorum eklendi' });
  } catch (error) {
    console.error('Comment add error:', error);
    res.status(500).json({ error: 'Yorum eklenirken hata oluştu' });
  }
});

// Performance stats - Power-score-based filtering
router.get('/stats/performance', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const userRole = req.user.role;
    const userId = req.user.id;
    const userPower = getPowerScore(userRole);

    const usersResult = await db.query(
      "SELECT id, name, role, department FROM users WHERE status = 'active' AND organization_id = $1",
      [orgId]
    );
    let users = usersResult.rows;

    // Filter by power score: can only see stats of users with equal or lower power + self
    if (userPower < 100) {
      users = users.filter(u => canSee(userRole, u.role) || u.id === userId);
    }

    const stats = [];
    for (const u of users) {
      const total = (await db.query('SELECT COUNT(*) as c FROM tasks WHERE assigned_to = $1', [u.id])).rows[0].c;
      const completed = (await db.query("SELECT COUNT(*) as c FROM tasks WHERE assigned_to = $1 AND status = 'completed'", [u.id])).rows[0].c;
      const inProgress = (await db.query("SELECT COUNT(*) as c FROM tasks WHERE assigned_to = $1 AND status = 'in_progress'", [u.id])).rows[0].c;
      const overdue = (await db.query("SELECT COUNT(*) as c FROM tasks WHERE assigned_to = $1 AND status != 'completed' AND due_date < CURRENT_DATE", [u.id])).rows[0].c;

      const avgResult = await db.query(`
        SELECT AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 86400) as avg_days
        FROM tasks WHERE assigned_to = $1 AND status = 'completed' AND completed_at IS NOT NULL
      `, [u.id]);
      const avgTime = avgResult.rows[0].avg_days;

      stats.push({
        ...u,
        total: parseInt(total),
        completed: parseInt(completed),
        in_progress: parseInt(inProgress),
        overdue: parseInt(overdue),
        completion_rate: total > 0 ? Math.round(parseInt(completed) / parseInt(total) * 100) : 0,
        avg_completion_days: avgTime ? Math.round(parseFloat(avgTime) * 10) / 10 : null
      });
    }

    res.json(stats);
  } catch (error) {
    console.error('Performance stats error:', error);
    res.status(500).json({ error: 'Performans istatistikleri yüklenirken hata oluştu' });
  }
});


// =====================
// ANNOUNCEMENTS
// =====================

router.get('/announcements/list', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await db.query(`
      SELECT a.*, u.name as created_by_name FROM announcements a
      LEFT JOIN users u ON a.created_by = u.id
      WHERE a.status = 'active'
        AND (a.expires_at IS NULL OR a.expires_at > NOW())
        AND u.organization_id = $1
      ORDER BY a.priority DESC, a.created_at DESC
    `, [orgId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Announcements list error:', error);
    res.status(500).json({ error: 'Duyurular yüklenirken hata oluştu' });
  }
});

router.post('/announcements', async (req, res) => {
  try {
    const { title, content, priority, expires_at } = req.body;

    // Power score check: only manager(60) and above can publish
    if (!canPublishAnnouncement(req.user.role)) {
      return res.status(403).json({ error: 'Duyuru yayınlama yetkiniz yok.' });
    }

    if (!title || !content) return res.status(400).json({ error: 'Başlık ve içerik gerekli' });

    const r = await db.query(
      'INSERT INTO announcements (title, content, priority, created_by, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [title, content, priority || 'normal', req.user.id, expires_at || null]
    );
    const announcementId = r.rows[0].id;

    // Send notification to all org users
    const orgUsersResult = await db.query(
      "SELECT id FROM users WHERE organization_id = $1 AND status = 'active' AND id != $2",
      [req.user.organization_id, req.user.id]
    );
    const userIds = orgUsersResult.rows.map(u => u.id);
    await sendNotificationToMany(req.app, userIds, {
      orgId: req.user.organization_id,
      type: 'announcement',
      title: title,
      message: `${req.user.name}`,
      referenceId: announcementId,
      referenceType: 'announcement',
    });

    res.status(201).json({ id: announcementId, message: 'Duyuru yayınlandı' });
  } catch (error) {
    console.error('Announcement create error:', error);
    res.status(500).json({ error: 'Duyuru oluşturulurken hata oluştu' });
  }
});

router.delete('/announcements/:id', async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    // Power score check: only manager(60) and above can delete
    if (!canDeleteAnnouncement(req.user.role)) {
      return res.status(403).json({ error: 'Duyuru silme yetkiniz yok.' });
    }

    const annResult = await db.query(`
      SELECT a.id FROM announcements a
      JOIN users u ON a.created_by = u.id
      WHERE a.id = $1 AND u.organization_id = $2
    `, [req.params.id, orgId]);

    if (!annResult.rows[0]) return res.status(404).json({ error: 'Duyuru bulunamadı' });

    await db.query("UPDATE announcements SET status = 'archived' WHERE id = $1", [req.params.id]);
    res.json({ message: 'Duyuru kaldırıldı' });
  } catch (error) {
    console.error('Announcement delete error:', error);
    res.status(500).json({ error: 'Duyuru silinirken hata oluştu' });
  }
});

// =====================
// DAILY REPORTS
// =====================

// Daily Reports list - Power-score-based filtering
router.get('/daily-reports/list', async (req, res) => {
  try {
    const { user_id, date } = req.query;
    const orgId = req.user.organization_id;
    const userRole = req.user.role;
    const userId = req.user.id;
    const userPower = getPowerScore(userRole);

    const where = ['u.organization_id = $1'];
    const params = [orgId];
    let paramIndex = 2;

    // Power score filter: see reports of users with equal or lower power + own
    if (userPower < 100) {
      const visibleRoles = getVisibleRolesSQL(userRole);
      where.push(`(u.role IN (${visibleRoles}) OR dr.user_id = $${paramIndex})`);
      params.push(userId);
      paramIndex++;
    }

    if (user_id) { where.push(`dr.user_id = $${paramIndex}`); params.push(user_id); paramIndex++; }
    if (date) { where.push(`dr.report_date = $${paramIndex}`); params.push(date); paramIndex++; }

    const whereClause = `WHERE ${where.join(' AND ')}`;

    const result = await db.query(`
      SELECT dr.*, u.name as user_name FROM daily_reports dr
      LEFT JOIN users u ON dr.user_id = u.id
      ${whereClause}
      ORDER BY dr.report_date DESC, dr.created_at DESC
      LIMIT 100
    `, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Daily reports list error:', error);
    res.status(500).json({ error: 'Raporlar yüklenirken hata oluştu' });
  }
});

router.post('/daily-reports', async (req, res) => {
  try {
    const { report_date, content, tasks_completed, tasks_in_progress, issues } = req.body;
    if (!content) return res.status(400).json({ error: 'Rapor içeriği gerekli' });

    const date = report_date || new Date().toISOString().slice(0, 10);

    const existingResult = await db.query(
      'SELECT id FROM daily_reports WHERE user_id = $1 AND report_date = $2',
      [req.user.id, date]
    );
    const existing = existingResult.rows[0];

    if (existing) {
      await db.query(
        'UPDATE daily_reports SET content=$1, tasks_completed=$2, tasks_in_progress=$3, issues=$4 WHERE id=$5',
        [content, tasks_completed || 0, tasks_in_progress || 0, issues || null, existing.id]
      );
      return res.json({ message: 'Rapor güncellendi' });
    }

    await db.query(
      'INSERT INTO daily_reports (user_id, report_date, content, tasks_completed, tasks_in_progress, issues) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.user.id, date, content, tasks_completed || 0, tasks_in_progress || 0, issues || null]
    );

    res.status(201).json({ message: 'Rapor gönderildi' });
  } catch (error) {
    console.error('Daily report create error:', error);
    res.status(500).json({ error: 'Rapor gönderilirken hata oluştu' });
  }
});

// Users list (Task assignment list) - Power-score-based filtering
router.get('/users/list', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const userRole = req.user.role;
    const userPower = getPowerScore(userRole);

    let query = "SELECT id, name, email, role, department FROM users WHERE status = 'active' AND organization_id = $1";
    const params = [orgId];

    // Power score filter: can assign to users with equal or lower power
    if (userPower < 100) {
      const visibleRoles = getVisibleRolesSQL(userRole);
      query += ` AND role IN (${visibleRoles})`;
    }

    query += " ORDER BY name";
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Users list error:', error);
    res.status(500).json({ error: 'Kullanıcı listesi yüklenirken hata oluştu' });
  }
});

export default router;
