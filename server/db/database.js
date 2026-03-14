import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new Database(join(__dirname, 'workos.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  -- ========================================
  -- ORGANIZASYONLAR (Organizations)
  -- ========================================
  CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ========================================
  -- KULLANICILAR (Users)
  -- ========================================
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    department TEXT,
    phone TEXT,
    avatar_color TEXT DEFAULT '#6366f1',
    status TEXT DEFAULT 'active',
    organization_id INTEGER REFERENCES organizations(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ========================================
  -- GÖREV YÖNETİMİ (Task Management)
  -- ========================================
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    assigned_to INTEGER REFERENCES users(id),
    assigned_by INTEGER REFERENCES users(id),
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'medium',
    due_date DATE,
    completed_at DATETIME,
    category TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS task_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    priority TEXT DEFAULT 'normal',
    created_by INTEGER REFERENCES users(id),
    expires_at DATETIME,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS daily_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    report_date DATE NOT NULL,
    content TEXT NOT NULL,
    tasks_completed INTEGER DEFAULT 0,
    tasks_in_progress INTEGER DEFAULT 0,
    issues TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ========================================
  -- MESAJLAŞMA (Messaging)
  -- ========================================
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    type TEXT DEFAULT 'direct',
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS conversation_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    last_read_at DATETIME,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(conversation_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id),
    sender_id INTEGER NOT NULL REFERENCES users(id),
    content TEXT,
    message_type TEXT DEFAULT 'text',
    attachment_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ========================================
  -- BİLDİRİMLER (Notifications)
  -- ========================================
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id INTEGER REFERENCES organizations(id),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    reference_id INTEGER,
    reference_type TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ========================================
  -- MODÜL YETKİLERİ (Module Permissions)
  -- ========================================
  CREATE TABLE IF NOT EXISTS user_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    module TEXT NOT NULL,
    has_access INTEGER DEFAULT 1,
    UNIQUE(user_id, module)
  );
`);

try {
  db.exec('ALTER TABLE messages ADD COLUMN attachment_url TEXT');
} catch (error) {
  // Ignored if column already exists
}

// Backwards-compatible migration: ensure organization_id column & default org
try {
  db.exec('ALTER TABLE users ADD COLUMN organization_id INTEGER REFERENCES organizations(id)');
} catch (error) {
  // Column already exists
}

// Ensure there is at least one default organization and all existing users belong to it
db.exec(`
  INSERT OR IGNORE INTO organizations (id, name, slug) VALUES (1, 'Astly Demo', 'astly-demo');
  UPDATE users SET organization_id = 1 WHERE organization_id IS NULL;
`);

export default db;
