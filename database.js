// database.js — sql.js 适配层
// sql.js: 纯 JS + WASM，无需编译，API 与 better-sqlite3 兼容（同步部分）
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'geo-tool.db');
let db = null;

// ── Init (异步，server.js 启动时调用) ───────────────────────────
async function initDatabase() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  createTables();
  // 迁移：为 articles 表添加 cover_image 字段（已有表不会重建，用 ALTER TABLE）
  try { db.run("ALTER TABLE articles ADD COLUMN cover_image TEXT"); } catch {}
  console.log('[DB] sql.js initialized, WAL mode');
  return db;
}

// ── Save to disk (每次写入后调用) ──────────────────────────────
function saveDb() {
  if (!db) return;
  const buf = db.export();
  fs.writeFileSync(DB_PATH, buf);
}

// ── Tables ────────────────────────────────────────────────────
function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS keywords (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword    TEXT    NOT NULL,
      category   TEXT    NOT NULL,
      intent_tag TEXT,
      intent_label TEXT,
      score      REAL    DEFAULT 0.8,
      source     TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS articles (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT    NOT NULL,
      content    TEXT    NOT NULL,
      platform   TEXT    NOT NULL,
      keywords   TEXT,
      word_count INTEGER DEFAULT 0,
      status     TEXT    DEFAULT 'draft',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS published (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id    INTEGER REFERENCES articles(id) ON DELETE CASCADE,
      platform_id   INTEGER,
      platform_type TEXT,
      publish_url   TEXT,
      status        TEXT    DEFAULT 'pending',
      message       TEXT,
      publish_time  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS platforms (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      type      TEXT    NOT NULL,
      name      TEXT    NOT NULL,
      config    TEXT,
      last_used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Indexes
  ['idx_keywords_category', 'idx_articles_status', 'idx_published_article'].forEach(name => {
    try { db.run(`CREATE INDEX IF NOT EXISTS ${name} ON ${name.replace('idx_','')}`); } catch {}
  });
}

// ── Auto-save wrapper ──────────────────────────────────────────
function run(sql, ...params) {
  try {
    db.run(sql, params);
    saveDb();
    return { changes: db.getRowsModified() };
  } catch (e) {
    console.error('[DB] run error:', e.message, sql);
    throw e;
  }
}

function get(sql, ...params) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function all(sql, ...params) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function getLastInsertId() {
  const r = db.exec('SELECT last_insert_rowid() as id');
  return r[0]?.values[0]?.[0] ?? null;
}

// ═══════════════════════════════════════════════════════════════
// Keyword CRUD
// ═══════════════════════════════════════════════════════════════
function getAllKeywords() {
  return all('SELECT * FROM keywords ORDER BY score DESC, created_at DESC');
}

function insertKeyword(keyword, category, intent_tag, intent_label, score, source) {
  run('INSERT INTO keywords (keyword, category, intent_tag, intent_label, score, source) VALUES (?,?,?,?,?,?)',
    keyword, category, intent_tag, intent_label, score, source);
  return getLastInsertId();
}

function deleteAllKeywords() {
  run('DELETE FROM keywords');
}

// ═══════════════════════════════════════════════════════════════
// Article CRUD
// ═══════════════════════════════════════════════════════════════
function getAllArticles({ search = '', platform = '', status = '', limit = 20, offset = 0 } = {}) {
  let sql = `SELECT * FROM articles WHERE 1=1`;
  const params = [];
  if (search) { sql += ` AND title LIKE ?`; params.push(`%${search}%`); }
  if (platform) { sql += ` AND platform = ?`; params.push(platform); }
  if (status) { sql += ` AND status = ?`; params.push(status); }
  sql += ` ORDER BY updated_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  const rows = all(sql, ...params);

  // Attach publish history
  return rows.map(a => ({
    ...a,
    keywords: a.keywords ? JSON.parse(a.keywords) : [],
    publishHistory: getPublishHistoryByArticle(a.id)
  }));
}

function getArticleCount({ search = '', platform = '', status = '' } = {}) {
  let sql = `SELECT COUNT(*) as total FROM articles WHERE 1=1`;
  const params = [];
  if (search) { sql += ` AND title LIKE ?`; params.push(`%${search}%`); }
  if (platform) { sql += ` AND platform = ?`; params.push(platform); }
  if (status) { sql += ` AND status = ?`; params.push(status); }
  const r = get(sql, ...params);
  return r ? r.total : 0;
}

function insertArticle({ title, content, platform, keywords, status = 'draft', cover_image = null }) {
  const wordCount = content.replace(/\s/g, '').length;
  const keywordsJson = JSON.stringify(keywords || []);
  run('INSERT INTO articles (title, content, platform, keywords, word_count, status, cover_image) VALUES (?,?,?,?,?,?,?)',
    title, content, platform, keywordsJson, wordCount, status, cover_image);
  return getLastInsertId();
}

function updateArticle(id, { title, content, platform, keywords, status, cover_image }) {
  const wordCount = content ? content.replace(/\s/g, '').length : 0;
  const keywordsJson = keywords ? JSON.stringify(keywords) : null;
  run(`UPDATE articles SET
    title = COALESCE(?, title),
    content = COALESCE(?, content),
    platform = COALESCE(?, platform),
    keywords = COALESCE(?, keywords),
    word_count = COALESCE(?, word_count),
    status = COALESCE(?, status),
    cover_image = COALESCE(?, cover_image),
    updated_at = CURRENT_TIMESTAMP
  WHERE id = ?`, title, content, platform, keywordsJson, wordCount, status, cover_image, id);
}

function getArticleById(id) {
  const a = get('SELECT * FROM articles WHERE id = ?', id);
  if (!a) return null;
  return {
    ...a,
    keywords: a.keywords ? JSON.parse(a.keywords) : [],
    publishHistory: getPublishHistoryByArticle(id)
  };
}

function deleteArticle(id) {
  run('DELETE FROM articles WHERE id = ?', id);
}

// ═══════════════════════════════════════════════════════════════
// Publish History
// ═══════════════════════════════════════════════════════════════
function recordPublish({ articleId, platformId, platformType, url, status, message }) {
  run('INSERT INTO published (article_id, platform_id, platform_type, publish_url, status, message) VALUES (?,?,?,?,?,?)',
    articleId, platformId, platformType, url, status, message);

  // Update article status
  run('UPDATE articles SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', status, articleId);

  // Update platform last_used_at
  if (platformId) {
    run('UPDATE platforms SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?', platformId);
  }
  return getLastInsertId();
}

function getPublishHistoryByArticle(articleId) {
  return all('SELECT * FROM published WHERE article_id = ? ORDER BY publish_time DESC', articleId);
}

function getRecentPublishedHistory(limit = 20) {
  return all(`
    SELECT p.*, a.title as article_title
    FROM published p
    JOIN articles a ON a.id = p.article_id
    ORDER BY p.publish_time DESC
    LIMIT ?
  `, limit);
}

// ═══════════════════════════════════════════════════════════════
// Platform CRUD
// ═══════════════════════════════════════════════════════════════
function getAllPlatforms() {
  return all('SELECT * FROM platforms ORDER BY created_at DESC');
}

function insertPlatform({ type, name, config }) {
  run('INSERT INTO platforms (type, name, config) VALUES (?,?,?)',
    type, name, JSON.stringify(config));
  return getLastInsertId();
}

function getPlatformById(id) {
  const p = get('SELECT * FROM platforms WHERE id = ?', id);
  if (!p) return null;
  return { ...p, config: p.config ? JSON.parse(p.config) : {} };
}

function deletePlatform(id) {
  run('DELETE FROM platforms WHERE id = ?', id);
}

// ═══════════════════════════════════════════════════════════════
// Settings
// ═══════════════════════════════════════════════════════════════
function getSetting(key) {
  const s = get('SELECT value FROM settings WHERE key = ?', key);
  return s ? s.value : null;
}

function setSetting(key, value) {
  run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
}

function getAllSettings() {
  const rows = all('SELECT * FROM settings');
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  return settings;
}

function closeDatabase() {
  if (db) { saveDb(); db.close(); db = null; }
}

module.exports = {
  initDatabase,
  saveDb,
  closeDatabase,
  run,
  get,
  all,
  // keywords
  getAllKeywords,
  insertKeyword,
  deleteAllKeywords,
  // articles
  getAllArticles,
  getArticleCount,
  insertArticle,
  updateArticle,
  getArticleById,
  deleteArticle,
  // publish
  recordPublish,
  getPublishHistoryByArticle,
  getRecentPublishedHistory,
  // platforms
  getAllPlatforms,
  insertPlatform,
  getPlatformById,
  deletePlatform,
  // settings
  getSetting,
  setSetting,
  getAllSettings,
};
