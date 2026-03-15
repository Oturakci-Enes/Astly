import db from './database.js';
import bcrypt from 'bcryptjs';

const ALL_MODULES = ['dashboard', 'tasks', 'messaging'];
const hash = (pw) => bcrypt.hashSync(pw, 10);

// Organizations
const organizations = [
  { id: 1, name: 'Astly Demo', slug: 'astly-demo' },
  { id: 2, name: 'Second Company', slug: 'second-co' },
];

// Users - 5 Roles: admin(100), senior_manager(80), manager(60), senior_user(40), user(20)
const users = [
  // Org 1 - Astly Demo
  { name: 'Admin', email: 'info@astly.app', password: hash('admin123'), role: 'admin', department: 'Management', organization_id: 1 },
  { name: 'Ahmet Yılmaz', email: 'ahmet@astly.app', password: hash('123456'), role: 'senior_manager', department: 'Operations', organization_id: 1 },
  { name: 'Zeynep Kaya', email: 'zeynep@astly.app', password: hash('123456'), role: 'manager', department: 'Sales', organization_id: 1 },
  { name: 'Mehmet Demir', email: 'mehmet@astly.app', password: hash('123456'), role: 'senior_user', department: 'Warehouse', organization_id: 1 },
  { name: 'Ayşe Çelik', email: 'ayse@astly.app', password: hash('123456'), role: 'user', department: 'Accounting', organization_id: 1 },
  // Org 2 - Second Company
  { name: 'Second Admin', email: 'admin@secondco.com', password: hash('admin123'), role: 'admin', department: 'Management', organization_id: 2 },
  { name: 'Carlos Alvarez', email: 'carlos@secondco.com', password: hash('123456'), role: 'manager', department: 'Logistics', organization_id: 2 },
];

const seedAll = async () => {
  try {
    console.log('🌱 Tohumlama (Seed) işlemi başlatılıyor...');

    // 1. Organizations
    for (const org of organizations) {
      await db.query(
        'INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
        [org.id, org.name, org.slug]
      );
    }

    // 2. Users + permissions
    for (const u of users) {
      // Insert user and get ID back
      const userRes = await db.query(
        `INSERT INTO users (name, email, password, role, department, organization_id) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         ON CONFLICT (email) DO NOTHING 
         RETURNING id`,
        [u.name, u.email, u.password, u.role, u.department, u.organization_id]
      );

      let userId = userRes.rows[0]?.id;

      // If user already existed, fetch their ID
      if (!userId) {
        const existing = await db.query('SELECT id FROM users WHERE email = $1', [u.email]);
        userId = existing.rows[0]?.id;
      }

      // Add permissions
      if (userId) {
        for (const mod of ALL_MODULES) {
          await db.query(
            'INSERT INTO user_permissions (user_id, module, has_access) VALUES ($1, $2, 1) ON CONFLICT (user_id, module) DO NOTHING',
            [userId, mod]
          );
        }
      }
    }

    // 3. Sample tasks
    const taskQuery = 'INSERT INTO tasks (title, description, assigned_to, assigned_by, status, priority, due_date, category) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)';
    await db.query(taskQuery, ['Prepare weekly report', 'Prepare this week\'s sales and operations report', 3, 1, 'pending', 'high', '2026-03-14', 'Report']);
    await db.query(taskQuery, ['Warehouse inventory list', 'Complete the monthly warehouse inventory check and prepare a report', 4, 2, 'in_progress', 'urgent', '2026-03-12', 'Warehouse']);
    await db.query(taskQuery, ['Compile customer feedback', 'List the customer complaints and suggestions from the last month', 3, 1, 'pending', 'medium', '2026-03-18', 'Customer Service']);
    await db.query(taskQuery, ['Invoice reconciliation', 'Reconcile supplier invoices', 5, 2, 'completed', 'medium', '2026-03-08', 'Accounting']);
    await db.query(taskQuery, ['New staff training plan', 'Prepare the orientation plan for staff starting in March', 2, 1, 'in_progress', 'high', '2026-03-15', 'HR']);
    await db.query(taskQuery, ['System maintenance', 'Perform server and database maintenance', 2, 1, 'pending', 'low', '2026-03-20', 'IT']);

    // 4. Sample announcements
    const annQuery = 'INSERT INTO announcements (title, content, priority, created_by) VALUES ($1, $2, $3, $4)';
    await db.query(annQuery, ['Meeting Notice', 'A general meeting will be held on Monday at 10:00. All department managers must attend.', 'important', 1]);
    await db.query(annQuery, ['System Update', 'Due to system maintenance this weekend, access may be limited between 02:00-06:00.', 'normal', 1]);

    // 5. Sample daily reports
    const reportQuery = 'INSERT INTO daily_reports (user_id, report_date, content, tasks_completed, tasks_in_progress, issues) VALUES ($1, $2, $3, $4, $5, $6)';
    await db.query(reportQuery, [3, '2026-03-09', 'Held the weekly sales meeting. Planned meetings with new prospect clients.', 3, 2, null]);
    await db.query(reportQuery, [4, '2026-03-09', 'Completed the inventory count for Warehouse Section B. Reported stock discrepancies.', 2, 1, 'Found a 5-item discrepancy on shelf B-3']);

    // 6. Sample conversations & messages
    // Group chat - Org 1
    const gRes = await db.query("INSERT INTO conversations (name, type, created_by) VALUES ($1, $2, $3) RETURNING id", ['General Channel', 'group', 1]);
    const gId = gRes.rows[0].id;
    for (let i = 1; i <= 5; i++) {
      await db.query('INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT (conversation_id, user_id) DO NOTHING', [gId, i]);
    }
    await db.query('INSERT INTO messages (conversation_id, sender_id, content) VALUES ($1, $2, $3)', [gId, 1, 'Hello everyone! Welcome to the Astly system.']);
    await db.query('INSERT INTO messages (conversation_id, sender_id, content) VALUES ($1, $2, $3)', [gId, 2, 'Hello! We can track our tasks from here.']);
    await db.query('INSERT INTO messages (conversation_id, sender_id, content) VALUES ($1, $2, $3)', [gId, 3, 'Great system, thanks!']);

    // Direct chat - Org 1
    const dRes = await db.query("INSERT INTO conversations (name, type, created_by) VALUES ($1, $2, $3) RETURNING id", [null, 'direct', 1]);
    const dId = dRes.rows[0].id;
    await db.query('INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT (conversation_id, user_id) DO NOTHING', [dId, 1]);
    await db.query('INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT (conversation_id, user_id) DO NOTHING', [dId, 2]);
    await db.query('INSERT INTO messages (conversation_id, sender_id, content) VALUES ($1, $2, $3)', [dId, 1, 'Ahmet, what is the status of the warehouse inventory?']);
    await db.query('INSERT INTO messages (conversation_id, sender_id, content) VALUES ($1, $2, $3)', [dId, 2, 'Section B is done, setting up Section C now.']);

    console.log('✅ Astly seed tamamlandı! Tüm veriler buluta yüklendi.');

  } catch (error) {
    console.error('❌ Seed işleminde kritik hata:', error);
  }
};

// Start the seed process
await seedAll();
