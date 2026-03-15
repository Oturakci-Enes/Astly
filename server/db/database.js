import pg from 'pg';
import dotenv from 'dotenv';

// .env dosyasındaki gizli şifreleri okumayı etkinleştir
dotenv.config();

const { Pool } = pg;

// Bulut Veritabanı Bağlantı Ayarları
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Bulut sunucuları için zorunlu güvenlik ayarı
  }
});

// Veritabanı Tablolarını Oluşturma Fonksiyonu
const initDB = async () => {
  try {
    await pool.query(`
      -- ORGANIZASYONLAR
      CREATE TABLE IF NOT EXISTS organizations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- KULLANICILAR
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        department TEXT,
        phone TEXT,
        avatar_color TEXT DEFAULT '#6366f1',
        status TEXT DEFAULT 'active',
        organization_id INTEGER REFERENCES organizations(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- GÖREV YÖNETİMİ
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        assigned_to INTEGER REFERENCES users(id),
        assigned_by INTEGER REFERENCES users(id),
        status TEXT DEFAULT 'pending',
        priority TEXT DEFAULT 'medium',
        due_date DATE,
        completed_at TIMESTAMP,
        category TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS task_comments (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS announcements (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        priority TEXT DEFAULT 'normal',
        created_by INTEGER REFERENCES users(id),
        expires_at TIMESTAMP,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS daily_reports (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        report_date DATE NOT NULL,
        content TEXT NOT NULL,
        tasks_completed INTEGER DEFAULT 0,
        tasks_in_progress INTEGER DEFAULT 0,
        issues TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- MESAJLAŞMA
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        name TEXT,
        type TEXT DEFAULT 'direct',
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS conversation_members (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        last_read_at TIMESTAMP,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(conversation_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id),
        sender_id INTEGER NOT NULL REFERENCES users(id),
        content TEXT,
        message_type TEXT DEFAULT 'text',
        attachment_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- BİLDİRİMLER
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        organization_id INTEGER REFERENCES organizations(id),
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT,
        reference_id INTEGER,
        reference_type TEXT,
        is_read INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- MODÜL YETKİLERİ
      CREATE TABLE IF NOT EXISTS user_permissions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        module TEXT NOT NULL,
        has_access INTEGER DEFAULT 1,
        UNIQUE(user_id, module)
      );

      -- Varsayılan Organizasyonu Ekle (Eğer yoksa)
      INSERT INTO organizations (id, name, slug) 
      VALUES (1, 'Astly Demo', 'astly-demo')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Varolan kullanıcıları organizasyona bağlama kuralı
    await pool.query('UPDATE users SET organization_id = 1 WHERE organization_id IS NULL;');

    console.log("✅ Bulut Veritabanı (PostgreSQL) bağlantısı başarılı ve tablolar hazır!");
  } catch (error) {
    console.error("❌ Veritabanı oluşturma hatası:", error);
  }
};

initDB();

export default pool;
