import express from 'express';
import db from '../db/database.js';
const router = express.Router();

// =====================
// TASKS
// =====================

// List tasks (Hiyerarşik görünürlük eklendi)
router.get('/', (req, res) => {
  const { status, assigned_to, priority } = req.query;
  const orgId = req.user.organization_id;
  const userRole = req.user.role;
  const userId = req.user.id;

  const where = ['org_user.organization_id = ?'];
  const params = [orgId];

  // --- HIYERARŞİ KURALI ---
  if (userRole === 'manager') {
    // Yöneticiler: 
    // 1. 'user' rolündeki herkesin görevlerini görür.
    // 2. Kendisine atanan görevleri (Admin'den veya diğer Yöneticiden gelen) görür.
    // 3. Kendi atadığı (başkasına verdiği) görevleri görür.
    where.push('(u1.role = "user" OR t.assigned_to = ? OR t.assigned_by = ?)');
    params.push(userId, userId);
  } else if (userRole === 'user') {
    // Kullanıcı: Sadece kendine atananları görür.
    where.push('t.assigned_to = ?');
    params.push(userId);
  }
  // Admin ise kısıtlama yok.

  if (status) { where.push('t.status = ?'); params.push(status); }
  if (assigned_to) { where.push('t.assigned_to = ?'); params.push(assigned_to); }
  if (priority) { where.push('t.priority = ?'); params.push(priority); }

  const whereClause = `WHERE ${where.join(' AND ')}`;

  const tasks = db.prepare(`
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
  `).all(...params);

  res.json(tasks);
});

// Get single task with comments - scoped to current organization
router.get('/:id', (req, res) => {
  const orgId = req.user.organization_id;
  const task = db.prepare(`
    SELECT t.*,
      u1.name as assigned_to_name,
      u2.name as assigned_by_name
    FROM tasks t
    LEFT JOIN users u1 ON t.assigned_to = u1.id
    LEFT JOIN users u2 ON t.assigned_by = u2.id
    LEFT JOIN users org_user ON t.assigned_by = org_user.id
    WHERE t.id = ? AND org_user.organization_id = ?
  `).get(req.params.id, orgId);

  if (!task) return res.status(404).json({ error: 'Görev bulunamadı' });

  const comments = db.prepare(`
    SELECT tc.*, u.name as user_name FROM task_comments tc
    LEFT JOIN users u ON tc.user_id = u.id
    WHERE tc.task_id = ?
    ORDER BY tc.created_at ASC
  `).all(req.params.id);

  res.json({ ...task, comments });
});

// Create task (Çoklu görev verme desteği eklendi)
router.post('/', (req, res) => {
  const { title, description, assigned_to, priority, due_date, category } = req.body;
  if (!title) return res.status(400).json({ error: 'Görev başlığı gerekli' });

  // assigned_to'yu her zaman bir liste (array) gibi ele alalım
  // Eğer tek bir id geldiyse onu [id] yapar, liste geldiyse olduğu gibi bırakır.
  const assignees = Array.isArray(assigned_to) ? assigned_to : [assigned_to];

  const insertStmt = db.prepare(`
    INSERT INTO tasks (title, description, assigned_to, assigned_by, priority, due_date, category)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // Güvenli işlem (Transaction) başlatıyoruz: Ya hepsi kaydedilir ya hiçbiri.
  const createTasks = db.transaction((users) => {
    for (const userId of users) {
      if (userId) {
        // Kullanıcının seninle aynı şirkette (organization) olup olmadığını kontrol et
        const targetUser = db.prepare('SELECT id FROM users WHERE id = ? AND organization_id = ?')
          .get(userId, req.user.organization_id);

        if (targetUser) {
          insertStmt.run(title, description || null, userId, req.user.id, priority || 'medium', due_date || null, category || null);
        }
      }
    }
  });

  try {
    createTasks(assignees);
    res.status(201).json({ message: 'Görev(ler) başarıyla oluşturuldu' });
  } catch (error) {
    console.error("Görev oluşturma hatası:", error);
    res.status(500).json({ error: 'Görevler oluşturulurken bir hata oluştu' });
  }
});

// Update task - scoped to current organization
router.put('/:id', (req, res) => {
  const { title, description, assigned_to, status, priority, due_date, category } = req.body;

  const orgId = req.user.organization_id;
  const task = db.prepare(`
    SELECT t.* FROM tasks t
    LEFT JOIN users org_user ON t.assigned_by = org_user.id
    WHERE t.id = ? AND org_user.organization_id = ?
  `).get(req.params.id, orgId);
  if (!task) return res.status(404).json({ error: 'Görev bulunamadı' });

  // Verify assigned_to user belongs to same organization
  if (assigned_to) {
    const targetUser = db.prepare('SELECT id FROM users WHERE id = ? AND organization_id = ?').get(assigned_to, orgId);
    if (!targetUser) return res.status(400).json({ error: 'Gecersiz atanan kullanici' });
  }

  const completedAt = status === 'completed' && task.status !== 'completed'
    ? new Date().toISOString()
    : (status !== 'completed' ? null : task.completed_at);

  db.prepare(`
    UPDATE tasks SET title=?, description=?, assigned_to=?, status=?, priority=?, due_date=?, category=?, completed_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(
    title ?? task.title,
    description ?? task.description,
    assigned_to ?? task.assigned_to,
    status ?? task.status,
    priority ?? task.priority,
    due_date ?? task.due_date,
    category ?? task.category,
    completedAt,
    req.params.id
  );

  res.json({ message: 'Görev güncellendi' });
});

// Delete task - Hiyerarşik koruma ve Admin ortaklığı eklendi
router.delete('/:id', (req, res) => {
  const orgId = req.user.organization_id;
  const requesterId = req.user.id;
  const requesterRole = req.user.role;

  // Görevi ve görevi verenin rolünü sorguluyoruz
  const task = db.prepare(`
    SELECT t.*, u_creator.role as creator_role, u_creator.id as creator_id
    FROM tasks t
    JOIN users u_creator ON t.assigned_by = u_creator.id
    WHERE t.id = ? AND u_creator.organization_id = ?
  `).get(req.params.id, orgId);

  if (!task) return res.status(404).json({ error: 'Görev bulunamadı' });

  // --- HIYERARŞİ VE REDDETME KURALLARI ---

  // 1. KURAL: Admin zırhı (Admin verdiyse alt kademe silemez)
  if (task.creator_role === 'admin' && requesterRole !== 'admin') {
    return res.status(403).json({ error: 'Admin tarafından verilen görevler reddedilemez veya silinemez.' });
  }

  // 2. KURAL: Yönetici zırhı (Yönetici verdiyse kullanıcı silemez)
  if (task.creator_role === 'manager' && requesterRole === 'user') {
    return res.status(403).json({ error: 'Yöneticiden gelen görevi reddetme yetkiniz yok.' });
  }

  // NOT: 
  // - Adminler birbirinin görevini silebilir (requesterRole === 'admin' olduğu için takılmaz).
  // - Kullanıcılar birbirinin görevini silebilir (creator_role 'user' olduğu için takılmaz).

  db.prepare('DELETE FROM task_comments WHERE task_id = ?').run(task.id);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);

  res.json({ message: 'Görev başarıyla kaldırıldı / reddedildi' });
});

// Add comment - verify task belongs to user's organization
router.post('/:id/comments', (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Yorum içeriği gerekli' });

  const orgId = req.user.organization_id;
  const task = db.prepare(`
    SELECT t.id FROM tasks t
    LEFT JOIN users org_user ON t.assigned_by = org_user.id
    WHERE t.id = ? AND org_user.organization_id = ?
  `).get(req.params.id, orgId);
  if (!task) return res.status(404).json({ error: 'Görev bulunamadı' });

  db.prepare('INSERT INTO task_comments (task_id, user_id, content) VALUES (?, ?, ?)')
    .run(req.params.id, req.user.id, content);

  res.status(201).json({ message: 'Yorum eklendi' });
});

// Performance stats - Hiyerarşik filtreleme ve Admin ortaklığı desteği
router.get('/stats/performance', (req, res) => {
  const orgId = req.user.organization_id;
  const userRole = req.user.role;
  const userId = req.user.id;

  // Tüm aktif kullanıcıları çek
  let users = db.prepare("SELECT id, name, role, department FROM users WHERE status = 'active' AND organization_id = ?").all(orgId);

  // --- HIYERARŞİYE GÖRE KULLANICI LİSTESİNİ FİLTRELE ---
  if (userRole === 'manager') {
    // Yönetici: Sadece 'user' rolündekileri ve kendisini görebilir. 
    // Diğer yöneticiler ve adminler elenir.
    users = users.filter(u => u.role === 'user' || u.id === userId);
  } else if (userRole === 'user') {
    // Kullanıcı: Sadece kendi satırını görebilir.
    users = users.filter(u => u.id === userId);
  }
  // Admin ise hiçbir filtreye takılmaz; diğer admin ortaklarını ve tüm personeli görür.

  const stats = users.map(u => {
    const total = db.prepare('SELECT COUNT(*) as c FROM tasks WHERE assigned_to = ?').get(u.id).c;
    const completed = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE assigned_to = ? AND status = 'completed'").get(u.id).c;
    const inProgress = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE assigned_to = ? AND status = 'in_progress'").get(u.id).c;
    const overdue = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE assigned_to = ? AND status != 'completed' AND due_date < date('now')").get(u.id).c;

    const avgTime = db.prepare(`
      SELECT AVG(julianday(completed_at) - julianday(created_at)) as avg_days
      FROM tasks WHERE assigned_to = ? AND status = 'completed' AND completed_at IS NOT NULL
    `).get(u.id).avg_days;

    return {
      ...u,
      total, completed, in_progress: inProgress, overdue,
      completion_rate: total > 0 ? Math.round(completed / total * 100) : 0,
      avg_completion_days: avgTime ? Math.round(avgTime * 10) / 10 : null
    };
  });

  res.json(stats);
});


// =====================
// ANNOUNCEMENTS
// =====================

router.get('/announcements/list', (req, res) => {
  const orgId = req.user.organization_id;
  const items = db.prepare(`
    SELECT a.*, u.name as created_by_name FROM announcements a
    LEFT JOIN users u ON a.created_by = u.id
    WHERE a.status = 'active'
      AND (a.expires_at IS NULL OR a.expires_at > datetime('now'))
      AND u.organization_id = ?
    ORDER BY a.priority DESC, a.created_at DESC
  `).all(orgId);
  res.json(items);
});

router.post('/announcements', (req, res) => {
  const { title, content, priority, expires_at } = req.body;

  // --- YETKİ KONTROLÜ ---
  if (req.user.role === 'user') {
    return res.status(403).json({ error: 'Duyuru yayınlama yetkiniz yok.' });
  }

  if (!title || !content) return res.status(400).json({ error: 'Başlık ve içerik gerekli' });

  const r = db.prepare('INSERT INTO announcements (title, content, priority, created_by, expires_at) VALUES (?,?,?,?,?)')
    .run(title, content, priority || 'normal', req.user.id, expires_at || null);

  res.status(201).json({ id: r.lastInsertRowid, message: 'Duyuru yayınlandı' });
});

router.delete('/announcements/:id', (req, res) => {
  const orgId = req.user.organization_id;

  // --- YETKİ KONTROLÜ ---
  // Sadece Admin ve Manager duyuru silebilir
  if (req.user.role === 'user') {
    return res.status(403).json({ error: 'Duyuru silme yetkiniz yok.' });
  }

  const ann = db.prepare(`
    SELECT a.id FROM announcements a
    JOIN users u ON a.created_by = u.id
    WHERE a.id = ? AND u.organization_id = ?
  `).get(req.params.id, orgId);

  if (!ann) return res.status(404).json({ error: 'Duyuru bulunamadı' });

  db.prepare("UPDATE announcements SET status = 'archived' WHERE id = ?").run(req.params.id);
  res.json({ message: 'Duyuru kaldırıldı' });
});

// =====================
// DAILY REPORTS
// =====================

// Daily Reports list - Hiyerarşik filtreleme eklendi
router.get('/daily-reports/list', (req, res) => {
  const { user_id, date } = req.query;
  const orgId = req.user.organization_id;
  const userRole = req.user.role;
  const userId = req.user.id;

  const where = ['u.organization_id = ?'];
  const params = [orgId];

  // --- HIYERARŞİ FİLTRESİ ---
  if (userRole === 'manager') {
    // Yöneticiler: personellerin (user) raporlarını ve kendi (userId) raporlarını görür.
    // 'u.role' yerine tablo adını açıkça belirterek (u.role) hatayı engelliyoruz.
    where.push('(u.role = "user" OR dr.user_id = ?)');
    params.push(userId);
  } else if (userRole === 'user') {
    // Kullanıcı: Sadece kendi raporlarını görebilir.
    where.push('dr.user_id = ?');
    params.push(userId);
  }
  // Admin ise kısıtlama yok, her şeyi görür.

  if (user_id) { where.push('dr.user_id = ?'); params.push(user_id); }
  if (date) { where.push('dr.report_date = ?'); params.push(date); }

  const whereClause = `WHERE ${where.join(' AND ')}`;

  const reports = db.prepare(`
    SELECT dr.*, u.name as user_name FROM daily_reports dr
    LEFT JOIN users u ON dr.user_id = u.id
    ${whereClause}
    ORDER BY dr.report_date DESC, dr.created_at DESC
    LIMIT 100
  `).all(...params);

  res.json(reports);
});

router.post('/daily-reports', (req, res) => {
  const { report_date, content, tasks_completed, tasks_in_progress, issues } = req.body;
  if (!content) return res.status(400).json({ error: 'Rapor içeriği gerekli' });

  const date = report_date || new Date().toISOString().slice(0, 10);

  const existing = db.prepare('SELECT id FROM daily_reports WHERE user_id = ? AND report_date = ?').get(req.user.id, date);
  if (existing) {
    db.prepare('UPDATE daily_reports SET content=?, tasks_completed=?, tasks_in_progress=?, issues=? WHERE id=?')
      .run(content, tasks_completed || 0, tasks_in_progress || 0, issues || null, existing.id);
    return res.json({ message: 'Rapor güncellendi' });
  }

  db.prepare('INSERT INTO daily_reports (user_id, report_date, content, tasks_completed, tasks_in_progress, issues) VALUES (?,?,?,?,?,?)')
    .run(req.user.id, date, content, tasks_completed || 0, tasks_in_progress || 0, issues || null);

  res.status(201).json({ message: 'Rapor gönderildi' });
});

// Users list (Görev atama listesi) - Hiyerarşik kısıtlama eklendi
router.get('/users/list', (req, res) => {
  const orgId = req.user.organization_id;
  const userRole = req.user.role;
  const userId = req.user.id;

  let query = "SELECT id, name, email, role, department FROM users WHERE status = 'active' AND organization_id = ?";
  let params = [orgId];

  // --- KİMLERE GÖREV VEREBİLİR? ---
  if (userRole === 'manager') {
    // Yöneticiler: Kullanıcıları, diğer yöneticileri ve kendilerini görebilir. 
    // Sadece Adminler bu listeden gizlenir.
    query += " AND (role = 'user' OR role = 'manager' OR id = ?)";
    params.push(userId);
  } else if (userRole === 'user') {
    // Kullanıcı: Diğer kullanıcılara görev verebilir.
    query += " AND role = 'user'";
  }
  // Admin: Herkese görev verebilir (Hiçbir kısıtlama eklenmez).

  const users = db.prepare(query + " ORDER BY name").all(...params);
  res.json(users);
});

export default router;
