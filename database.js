'use strict';

/**
 * database.js — Vercel Postgres (pg) 适配层
 * 兼容本地开发 & Vercel Serverless
 */
const { Pool } = require('pg');

const pgUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
console.log('[DB] POSTGRES_URL present:', !!pgUrl);

let pool = null;
if (pgUrl) {
  pool = new Pool({
    connectionString: pgUrl,
    ssl: { rejectUnauthorized: false },
    max: 1,
    idleTimeoutMillis: 0,
    connectionTimeoutMillis: 10000,
  });
} else {
  console.warn('[DB] ⚠️  No database URL — running without database');
}

let _initDone = false;

// ── Init ────────────────────────────────────────────────────────
async function initDatabase() {
  if (!pool) {
    console.warn('[DB] Skipping init — no pool');
    return;
  }
  if (_initDone) return;
  try {
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
    const idxs = [
      'CREATE INDEX IF NOT EXISTS idx_keywords_category ON keywords(category)',
      'CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status)',
      'CREATE INDEX IF NOT EXISTS idx_published_article ON published(article_id)',
    ];
    for (const sql of idxs) {
      try { await pool.query(sql); } catch {}
    }
    _initDone = true;
    console.log('[DB] Initialized successfully');
  } catch (e) {
    console.error('[DB] Init failed:', e.message);
    throw e;
  }
}

// ── Query helpers ───────────────────────────────────────────────
async function run(sql, ...params) {
  if (!pool) throw new Error('Database not configured');
  const r = await pool.query(sql, params);
  return { changes: r.rowCount, rows: r.rows };
}

async function get(sql, ...params) {
  if (!pool) return null;
  const r = await pool.query(sql, params);
  return r.rows[0] || null;
}

async function all(sql, ...params) {
  if (!pool) return [];
  const r = await pool.query(sql, params);
  return r.rows;
}

// ── Keywords ────────────────────────────────────────────────────
async function getAllKeywords() { return all('SELECT * FROM keywords ORDER BY score DESC, created_at DESC'); }
async function insertKeyword(keyword, category, intent_tag, intent_label, score, source) {
  await run('INSERT INTO keywords (keyword,category,intent_tag,intent_label,score,source) VALUES ($1,$2,$3,$4,$5,$6)', keyword,category,intent_tag,intent_label,score,source);
  const r = await pool.query('SELECT lastval() as id');
  return r.rows[0].id;
}
async function deleteAllKeywords() { await run('DELETE FROM keywords'); }

// ── Articles ────────────────────────────────────────────────────
async function getAllArticles({ search='', platform='', status='', limit=20, offset=0 } = {}) {
  const c = [], p = []; let i = 1;
  if (search)   { c.push(`title ILIKE $${i++}`); p.push(`%${search}%`); }
  if (platform) { c.push(`platform=$${i++}`); p.push(platform); }
  if (status)   { c.push(`status=$${i++}`); p.push(status); }
  const w = c.length ? 'WHERE '+c.join(' AND ') : '';
  p.push(limit, offset);
  const rows = await all(`SELECT * FROM articles ${w} ORDER BY updated_at DESC LIMIT $${i++} OFFSET $${i}`, ...p);
  return rows.map(a => ({ ...a, keywords: a.keywords ? JSON.parse(a.keywords) : [], publishHistory: [] }));
}

async function getArticleCount({ search='', platform='', status='' } = {}) {
  const c = [], p = []; let i = 1;
  if (search)   { c.push(`title ILIKE $${i++}`); p.push(`%${search}%`); }
  if (platform) { c.push(`platform=$${i++}`); p.push(platform); }
  if (status)   { c.push(`status=$${i++}`); p.push(status); }
  const w = c.length ? 'WHERE '+c.join(' AND ') : '';
  const r = await get(`SELECT COUNT(*) as total FROM articles ${w}`, ...p);
  return r ? parseInt(r.total) : 0;
}

async function insertArticle({ title, content, platform, keywords, status='draft', cover_image=null }) {
  await run('INSERT INTO articles (title,content,platform,keywords,word_count,status,cover_image) VALUES ($1,$2,$3,$4,$5,$6,$7)', title, content, platform, JSON.stringify(keywords||[]), content.replace(/\s/g,'').length, status, cover_image);
  const r = await pool.query('SELECT lastval() as id');
  return r.rows[0].id;
}

async function updateArticle(id, { title, content, platform, keywords, status, cover_image }) {
  const s = [], p = []; let i = 1;
  if (title!==undefined)        { s.push(`title=$${i++}`); p.push(title); }
  if (content!==undefined)      { s.push(`content=$${i++}`); p.push(content); s.push(`word_count=$${i++}`); p.push(content.replace(/\s/g,'').length); }
  if (platform!==undefined)    { s.push(`platform=$${i++}`); p.push(platform); }
  if (keywords!==undefined)     { s.push(`keywords=$${i++}`); p.push(JSON.stringify(keywords)); }
  if (status!==undefined)       { s.push(`status=$${i++}`); p.push(status); }
  if (cover_image!==undefined) { s.push(`cover_image=$${i++}`); p.push(cover_image); }
  s.push(`updated_at=NOW()`); p.push(id);
  await run(`UPDATE articles SET ${s.join(',')} WHERE id=$${i}`, ...p);
}

async function getArticleById(id) {
  const a = await get('SELECT * FROM articles WHERE id=$1', id);
  if (!a) return null;
  return { ...a, keywords: a.keywords ? JSON.parse(a.keywords) : [], publishHistory: [] };
}

async function deleteArticle(id) { await run('DELETE FROM articles WHERE id=$1', id); }

// ── Publish ────────────────────────────────────────────────────
async function recordPublish({ articleId, platformId, platformType, url, status, message }) {
  await run('INSERT INTO published (article_id,platform_id,platform_type,publish_url,status,message) VALUES ($1,$2,$3,$4,$5,$6)', articleId,platformId,platformType,url,status,message);
  await run('UPDATE articles SET status=$1,updated_at=NOW() WHERE id=$2', status, articleId);
  if (platformId) await run('UPDATE platforms SET last_used_at=NOW() WHERE id=$1', platformId);
  const r = await pool.query('SELECT lastval() as id');
  return r.rows[0].id;
}

async function getPublishHistoryByArticle(articleId) { return all('SELECT * FROM published WHERE article_id=$1 ORDER BY publish_time DESC', articleId); }
async function getRecentPublishedHistory(limit=20) {
  return all(`SELECT p.*,a.title as article_title FROM published p JOIN articles a ON a.id=p.article_id ORDER BY p.publish_time DESC LIMIT $1`, limit);
}

// ── Platforms ───────────────────────────────────────────────────
async function getAllPlatforms() { return all('SELECT * FROM platforms ORDER BY created_at DESC'); }
async function insertPlatform({ type, name, config }) {
  await run('INSERT INTO platforms (type,name,config) VALUES ($1,$2,$3)', type, name, JSON.stringify(config));
  const r = await pool.query('SELECT lastval() as id');
  return r.rows[0].id;
}
async function getPlatformById(id) {
  const p = await get('SELECT * FROM platforms WHERE id=$1', id);
  if (!p) return null;
  return { ...p, config: p.config ? JSON.parse(p.config) : {} };
}
async function deletePlatform(id) { await run('DELETE FROM platforms WHERE id=$1', id); }

// ── Settings ────────────────────────────────────────────────────
async function getSetting(key) { const s = await get('SELECT value FROM settings WHERE key=$1', key); return s ? s.value : null; }
async function setSetting(key, value) { await run('INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2', key, value); }
async function getAllSettings() { const rows = await all('SELECT * FROM settings'); const o={}; for (const r of rows) o[r.key]=r.value; return o; }

async function closeDatabase() { if (pool) await pool.end(); }

module.exports = {
  initDatabase, closeDatabase, run, get, all,
  getAllKeywords, insertKeyword, deleteAllKeywords,
  getAllArticles, getArticleCount, insertArticle, updateArticle, getArticleById, deleteArticle,
  recordPublish, getPublishHistoryByArticle, getRecentPublishedHistory,
  getAllPlatforms, insertPlatform, getPlatformById, deletePlatform,
  getSetting, setSetting, getAllSettings,
};
