'use strict';

/**
 * database.js — Vercel Postgres (pg) 适配层
 * 兼容本地开发（环境变量）& Vercel Serverless
 */
const { Pool } = require('pg');

// ── Pool ────────────────────────────────────────────────────────
// Vercel 自动注入这些环境变量
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: process.env.POSTGRES_URL ? { rejectUnauthorized: false } : false,
  max: 1,           // Serverless: 1 connection per cold start
  idleTimeoutMillis: 0,
  connectionTimeoutMillis: 10000,
});

let _initDone = false;

// ── Init (异步) ─────────────────────────────────────────────────
async function initDatabase() {
  if (_initDone) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS keywords (
      id             SERIAL PRIMARY KEY,
      keyword        TEXT    NOT NULL,
      category       TEXT    NOT NULL,
      intent_tag     TEXT,
      intent_label   TEXT,
      score          REAL    DEFAULT 0.8,
      source         TEXT,
      created_at     TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS articles (
      id             SERIAL PRIMARY KEY,
      title          TEXT    NOT NULL,
      content        TEXT    NOT NULL,
      platform       TEXT    NOT NULL,
      keywords       TEXT,
      word_count     INTEGER DEFAULT 0,
      status         TEXT    DEFAULT 'draft',
      cover_image    TEXT,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      updated_at     TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS published (
      id              SERIAL PRIMARY KEY,
      article_id      INTEGER REFERENCES articles(id) ON DELETE CASCADE,
      platform_id     INTEGER,
      platform_type   TEXT,
      publish_url     TEXT,
      status          TEXT    DEFAULT 'pending',
      message         TEXT,
      publish_time    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS platforms (
      id            SERIAL PRIMARY KEY,
      type          TEXT    NOT NULL,
      name          TEXT    NOT NULL,
      config        TEXT,
      last_used_at  TIMESTAMPTZ,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Indexes
  const idxs = [
    'CREATE INDEX IF NOT EXISTS idx_keywords_category ON keywords(category)',
    'CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status)',
    'CREATE INDEX IF NOT EXISTS idx_published_article ON published(article_id)',
  ];
  for (const sql of idxs) {
    try { await pool.query(sql); } catch {}
  }

  _initDone = true;
  console.log('[DB] Vercel Postgres initialized');
}

// ── Query helpers ──────────────────────────────────────────────
async function run(sql, ...params) {
  try {
    const r = await pool.query(sql, params);
    return { changes: r.rowCount, rows: r.rows };
  } catch (e) {
    console.error('[DB] run error:', e.message, sql);
    throw e;
  }
}

async function get(sql, ...params) {
  const r = await pool.query(sql, params);
  return r.rows[0] || null;
}

async function all(sql, ...params) {
  const r = await pool.query(sql, params);
  return r.rows;
}

// ═══════════════════════════════════════════════════════════════
// Keywords
// ═══════════════════════════════════════════════════════════════
async function getAllKeywords() {
  return all('SELECT * FROM keywords ORDER BY score DESC, created_at DESC');
}

async function insertKeyword(keyword, category, intent_tag, intent_label, score, source) {
  const r = await run(
    'INSERT INTO keywords (keyword, category, intent_tag, intent_label, score, source) VALUES ($1,$2,$3,$4,$5,$6)',
    keyword, category, intent_tag, intent_label, score, source
  );
  const id = await pool.query('SELECT lastval() as id');
  return id.rows[0].id;
}

async function deleteAllKeywords() {
  await run('DELETE FROM keywords');
}

// ═══════════════════════════════════════════════════════════════
// Articles
// ═══════════════════════════════════════════════════════════════
async function getAllArticles({ search = '', platform = '', status = '', limit = 20, offset = 0 } = {}) {
  const conditions = [];
  const params = [];
  let i = 1;
  if (search)    { conditions.push(`title ILIKE $${i++}`); params.push(`%${search}%`); }
  if (platform)  { conditions.push(`platform = $${i++}`);  params.push(platform); }
  if (status)    { conditions.push(`status = $${i++}`);     params.push(status); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  params.push(limit, offset);
  const rows = await all(
    `SELECT * FROM articles ${where} ORDER BY updated_at DESC LIMIT $${i++} OFFSET $${i}`,
    ...params
  );
  return rows.map(a => ({
    ...a,
    keywords: a.keywords ? JSON.parse(a.keywords) : [],
    publishHistory: await getPublishHistoryByArticle(a.id)
  }));
}

async function getArticleCount({ search = '', platform = '', status = '' } = {}) {
  const conditions = [];
  const params = [];
  let i = 1;
  if (search)   { conditions.push(`title ILIKE $${i++}`); params.push(`%${search}%`); }
  if (platform) { conditions.push(`platform = $${i++}`);  params.push(platform); }
  if (status)   { conditions.push(`status = $${i++}`);    params.push(status); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const r = await get(`SELECT COUNT(*) as total FROM articles ${where}`, ...params);
  return r ? parseInt(r.total) : 0;
}

async function insertArticle({ title, content, platform, keywords, status = 'draft', cover_image = null }) {
  const wordCount = content.replace(/\s/g, '').length;
  const keywordsJson = JSON.stringify(keywords || []);
  const r = await run(
    `INSERT INTO articles (title,content,platform,keywords,word_count,status,cover_image)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    title, content, platform, keywordsJson, wordCount, status, cover_image
  );
  const id = await pool.query('SELECT lastval() as id');
  return id.rows[0].id;
}

async function updateArticle(id, { title, content, platform, keywords, status, cover_image }) {
  const sets = [];
  const params = [];
  let i = 1;
  if (title      !== undefined) { sets.push(`title = $${i++}`);       params.push(title); }
  if (content    !== undefined) {
    sets.push(`content = $${i++}`); params.push(content);
    sets.push(`word_count = $${i++}`); params.push(content.replace(/\s/g,'').length);
  }
  if (platform   !== undefined) { sets.push(`platform = $${i++}`);    params.push(platform); }
  if (keywords   !== undefined) { sets.push(`keywords = $${i++}`);    params.push(JSON.stringify(keywords)); }
  if (status     !== undefined) { sets.push(`status = $${i++}`);      params.push(status); }
  if (cover_image !== undefined){ sets.push(`cover_image = $${i++}`);  params.push(cover_image); }
  sets.push(`updated_at = NOW()`);
  params.push(id);
  await run(`UPDATE articles SET ${sets.join(',')} WHERE id = $${i}`, ...params);
}

async function getArticleById(id) {
  const a = await get('SELECT * FROM articles WHERE id = $1', id);
  if (!a) return null;
  return {
    ...a,
    keywords: a.keywords ? JSON.parse(a.keywords) : [],
    publishHistory: await getPublishHistoryByArticle(id)
  };
}

async function deleteArticle(id) {
  await run('DELETE FROM articles WHERE id = $1', id);
}

// ═══════════════════════════════════════════════════════════════
// Publish History
// ═══════════════════════════════════════════════════════════════
async function recordPublish({ articleId, platformId, platformType, url, status, message }) {
  const r = await run(
    'INSERT INTO published (article_id,platform_id,platform_type,publish_url,status,message) VALUES ($1,$2,$3,$4,$5,$6)',
    articleId, platformId, platformType, url, status, message
  );
  await run('UPDATE articles SET status=$1, updated_at=NOW() WHERE id=$2', status, articleId);
  if (platformId) {
    await run('UPDATE platforms SET last_used_at=NOW() WHERE id=$1', platformId);
  }
  const id = await pool.query('SELECT lastval() as id');
  return id.rows[0].id;
}

async function getPublishHistoryByArticle(articleId) {
  return all('SELECT * FROM published WHERE article_id=$1 ORDER BY publish_time DESC', articleId);
}

async function getRecentPublishedHistory(limit = 20) {
  return all(`
    SELECT p.*, a.title as article_title
    FROM published p
    JOIN articles a ON a.id = p.article_id
    ORDER BY p.publish_time DESC
    LIMIT $1
  `, limit);
}

// ═══════════════════════════════════════════════════════════════
// Platforms
// ═══════════════════════════════════════════════════════════════
async function getAllPlatforms() {
  return all('SELECT * FROM platforms ORDER BY created_at DESC');
}

async function insertPlatform({ type, name, config }) {
  const r = await run(
    'INSERT INTO platforms (type, name, config) VALUES ($1,$2,$3)',
    type, name, JSON.stringify(config)
  );
  const id = await pool.query('SELECT lastval() as id');
  return id.rows[0].id;
}

async function getPlatformById(id) {
  const p = await get('SELECT * FROM platforms WHERE id = $1', id);
  if (!p) return null;
  return { ...p, config: p.config ? JSON.parse(p.config) : {} };
}

async function deletePlatform(id) {
  await run('DELETE FROM platforms WHERE id = $1', id);
}

// ═══════════════════════════════════════════════════════════════
// Settings
// ═══════════════════════════════════════════════════════════════
async function getSetting(key) {
  const s = await get('SELECT value FROM settings WHERE key = $1', key);
  return s ? s.value : null;
}

async function setSetting(key, value) {
  await run('INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT(key) DO UPDATE SET value = $2', key, value);
}

async function getAllSettings() {
  const rows = await all('SELECT * FROM settings');
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  return settings;
}

async function closeDatabase() {
  await pool.end();
}

module.exports = {
  initDatabase,
  closeDatabase,
  // raw
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
