'use strict';

require('dotenv').config();
const express = require('express');
const path = require('path');

// Lazy-load database only when needed
let _db = null;
async function getDb() {
  if (!_db) _db = require('./database');
  return _db;
}

// Lazy init — auto-creates tables on first request if not done at startup
let _dbReady = false;
async function ensureDb() {
  if (!_dbReady) {
    const db = await getDb();
    await db.initDatabase();
    _dbReady = true;
  }
}

// Middleware: ensure DB ready before every API call
const apiMiddleware = async (req, res, next) => {
  try {
    await ensureDb();
    next();
  } catch (e) {
    console.error('[API] DB init failed:', e.message);
    res.status(500).json({ error: 'Database initialization failed: ' + e.message });
  }
};

// Import routes lazily
function getRouter(name) {
  try {
    return require('./routes/' + name);
  } catch (e) {
    console.error('[Router]', name, 'failed:', e.message);
    return null;
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// ~~~~~ Middleware ~~~~~
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS for local development
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ~~~~~ Static Files ~~~~~
app.use(express.static(path.join(__dirname, 'public')));

// ~~~~~ Health Check ~~~~~
app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: Date.now(), hasPostgresUrl: !!process.env.POSTGRES_URL });
});

app.get('/express-test', (req, res) => {
  res.json({ path: req.path, url: req.url, env: Object.keys(process.env).filter(k => k.startsWith('POSTGRES')) });
});

// ~~~~~ API Routes ~~~~~
const kw = getRouter('keywords');
const ar = getRouter('articles');
const pl = getRouter('platforms');
const st = getRouter('settings');
if (kw) app.use('/api/keywords',  apiMiddleware, kw);
if (ar) app.use('/api/articles',  apiMiddleware, ar);
if (pl) app.use('/api/platforms', apiMiddleware, pl);
if (st) app.use('/api/settings',  apiMiddleware, st);

// ~~~~~ SPA Fallback ~~~~~
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ~~~~~ Error Handler ~~~~~
app.use((err, req, res, next) => {
  console.error('[Error]', err.message, err.stack);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// ~~~~~ Start ~~~~~
async function start() {
  // 本地开发时初始化数据库（Vercel 环境用 apiMiddleware 自动初始化）
  if (!process.env.VERCEL) {
    try {
      await ensureDb();
      app.listen(PORT, () => console.log(`GEO-Tool running on http://localhost:${PORT}`));
    } catch (e) {
      console.error('Startup error:', e.message);
      process.exit(1);
    }
  }
}

start().catch(err => {
  console.error('Startup error:', err.message);
  if (!process.env.VERCEL) process.exit(1);
});

module.exports = app;
