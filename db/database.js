const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  // 事務所設定
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  // FAQ
  db.run(`CREATE TABLE IF NOT EXISTS faqs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // お問い合わせ
  db.run(`CREATE TABLE IF NOT EXISTS inquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    office TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    plan TEXT,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 会話ログ
  db.run(`CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    user_message TEXT NOT NULL,
    ai_response TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // デフォルト設定を挿入
  const defaults = [
    ['office_name', '〇〇社会保険労務士事務所'],
    ['welcome_message', 'こんにちは！AIアシスタントです。労務・社会保険に関するご質問にお答えします。'],
    ['system_prompt', 'あなたは社会保険労務士事務所のAIアシスタントです。労務管理、社会保険、雇用保険、給与計算などに関する一般的な質問にわかりやすく答えてください。複雑な個別案件や法的判断が必要な場合は「担当の先生にご確認ください」と案内してください。'],
    ['admin_password', 'admin123'],
  ];

  defaults.forEach(([key, value]) => {
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, [key, value]);
  });
});

function getSetting(key) {
  return new Promise((resolve, reject) => {
    db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
      if (err) reject(err);
      else resolve(row ? row.value : null);
    });
  });
}

function setSetting(key, value) {
  return new Promise((resolve, reject) => {
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function getAllSettings() {
  return new Promise((resolve, reject) => {
    db.all('SELECT key, value FROM settings', [], (err, rows) => {
      if (err) reject(err);
      else {
        const settings = {};
        rows.forEach(r => settings[r.key] = r.value);
        resolve(settings);
      }
    });
  });
}

function addFaq(question, answer) {
  return new Promise((resolve, reject) => {
    db.run('INSERT INTO faqs (question, answer) VALUES (?, ?)', [question, answer], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function getFaqs() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM faqs ORDER BY created_at DESC', [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function deleteFaq(id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM faqs WHERE id = ?', [id], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function saveConversation(userId, userMessage, aiResponse) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO conversations (user_id, user_message, ai_response) VALUES (?, ?, ?)',
      [userId, userMessage, aiResponse],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function getConversations(limit = 50) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM conversations ORDER BY created_at DESC LIMIT ?',
      [limit],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

function getRecentHistory(userId, limit = 5) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT user_message, ai_response FROM conversations WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
      [userId, limit],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows.reverse());
      }
    );
  });
}

function saveInquiry(office, name, email, plan, message) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO inquiries (office, name, email, plan, message) VALUES (?, ?, ?, ?, ?)',
      [office, name, email, plan, message],
      (err) => { if (err) reject(err); else resolve(); }
    );
  });
}

function getInquiries() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM inquiries ORDER BY created_at DESC', [], (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });
}

module.exports = {
  getSetting, setSetting, getAllSettings,
  addFaq, getFaqs, deleteFaq,
  saveConversation, getConversations, getRecentHistory,
  saveInquiry, getInquiries,
};
