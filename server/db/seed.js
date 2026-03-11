import db from './database.js';
import bcrypt from 'bcryptjs';

const ALL_MODULES = ['dashboard', 'tasks', 'messaging'];

const hash = (pw) => bcrypt.hashSync(pw, 10);

// Organizations
const organizations = [
  { id: 1, name: 'Astly Demo', slug: 'astly-demo' },
  { id: 2, name: 'Second Company', slug: 'second-co' },
];

// Users
const users = [
  // Org 1 - Astly Demo
  { name: 'Admin', email: 'info@astly.app', password: hash('admin123'), role: 'admin', department: 'Management', organization_id: 1 },
  { name: 'Ahmet Yılmaz', email: 'ahmet@astly.app', password: hash('123456'), role: 'manager', department: 'Operations', organization_id: 1 },
  { name: 'Zeynep Kaya', email: 'zeynep@astly.app', password: hash('123456'), role: 'user', department: 'Sales', organization_id: 1 },
  { name: 'Mehmet Demir', email: 'mehmet@astly.app', password: hash('123456'), role: 'user', department: 'Warehouse', organization_id: 1 },
  { name: 'Ayşe Çelik', email: 'ayse@astly.app', password: hash('123456'), role: 'user', department: 'Accounting', organization_id: 1 },
  // Org 2 - Second Company
  { name: 'Second Admin', email: 'admin@secondco.com', password: hash('admin123'), role: 'admin', department: 'Management', organization_id: 2 },
  { name: 'Carlos Alvarez', email: 'carlos@secondco.com', password: hash('123456'), role: 'manager', department: 'Logistics', organization_id: 2 },
];

const insertOrg = db.prepare('INSERT OR IGNORE INTO organizations (id,name,slug) VALUES (?,?,?)');
const insertUser = db.prepare('INSERT OR IGNORE INTO users (name,email,password,role,department,organization_id) VALUES (?,?,?,?,?,?)');
const insertPerm = db.prepare('INSERT OR IGNORE INTO user_permissions (user_id,module,has_access) VALUES (?,?,1)');

const seedAll = db.transaction(() => {
  // Organizations
  for (const org of organizations) {
    insertOrg.run(org.id, org.name, org.slug);
  }

  // Users + permissions
  for (const u of users) {
    const r = insertUser.run(u.name, u.email, u.password, u.role, u.department, u.organization_id);
    const userId = r.lastInsertRowid || db.prepare('SELECT id FROM users WHERE email=?').get(u.email)?.id;
    if (userId) {
      for (const mod of ALL_MODULES) insertPerm.run(userId, mod);
    }
  }

  // Sample tasks
  const insertTask = db.prepare('INSERT INTO tasks (title,description,assigned_to,assigned_by,status,priority,due_date,category) VALUES (?,?,?,?,?,?,?,?)');

  insertTask.run('Prepare weekly report', 'Prepare this week\'s sales and operations report', 3, 1, 'pending', 'high', '2026-03-14', 'Report');
  insertTask.run('Warehouse inventory list', 'Complete the monthly warehouse inventory check and prepare a report', 4, 2, 'in_progress', 'urgent', '2026-03-12', 'Warehouse');
  insertTask.run('Compile customer feedback', 'List the customer complaints and suggestions from the last month', 3, 1, 'pending', 'medium', '2026-03-18', 'Customer Service');
  insertTask.run('Invoice reconciliation', 'Reconcile supplier invoices', 5, 2, 'completed', 'medium', '2026-03-08', 'Accounting');
  insertTask.run('New staff training plan', 'Prepare the orientation plan for staff starting in March', 2, 1, 'in_progress', 'high', '2026-03-15', 'HR');
  insertTask.run('System maintenance', 'Perform server and database maintenance', 2, 1, 'pending', 'low', '2026-03-20', 'IT');

  // Sample announcements
  const insertAnn = db.prepare('INSERT INTO announcements (title,content,priority,created_by) VALUES (?,?,?,?)');
  insertAnn.run('Meeting Notice', 'A general meeting will be held on Monday at 10:00. All department managers must attend.', 'important', 1);
  insertAnn.run('System Update', 'Due to system maintenance this weekend, access may be limited between 02:00-06:00.', 'normal', 1);

  // Sample daily reports
  const insertReport = db.prepare('INSERT INTO daily_reports (user_id,report_date,content,tasks_completed,tasks_in_progress,issues) VALUES (?,?,?,?,?,?)');
  insertReport.run(3, '2026-03-09', 'Held the weekly sales meeting. Planned meetings with new prospect clients.', 3, 2, null);
  insertReport.run(4, '2026-03-09', 'Completed the inventory count for Warehouse Section B. Reported stock discrepancies.', 2, 1, 'Found a 5-item discrepancy on shelf B-3');

  // Sample conversations & messages
  const insertConv = db.prepare('INSERT INTO conversations (name,type,created_by) VALUES (?,?,?)');
  const insertMember = db.prepare('INSERT OR IGNORE INTO conversation_members (conversation_id,user_id) VALUES (?,?)');
  const insertMsg = db.prepare('INSERT INTO messages (conversation_id,sender_id,content) VALUES (?,?,?)');

  // Group chat - Org 1
  const g = insertConv.run('General Channel', 'group', 1);
  const gId = g.lastInsertRowid;
  for (let i = 1; i <= 5; i++) insertMember.run(gId, i);
  insertMsg.run(gId, 1, 'Hello everyone! Welcome to the Astly system.');
  insertMsg.run(gId, 2, 'Hello! We can track our tasks from here.');
  insertMsg.run(gId, 3, 'Great system, thanks!');

  // Direct chat - Org 1
  const d = insertConv.run(null, 'direct', 1);
  const dId = d.lastInsertRowid;
  insertMember.run(dId, 1);
  insertMember.run(dId, 2);
  insertMsg.run(dId, 1, 'Ahmet, what is the status of the warehouse inventory?');
  insertMsg.run(dId, 2, 'Section B is done, setting up Section C now.');
});

seedAll();

console.log('✅ Astly seed completed!');
