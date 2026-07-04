'use strict';

require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./database');

// Import routes
const keywordsRouter = require('./routes/keywords');
const articlesRouter = require('./routes/articles');
const platformsRouter = require('./routes/platforms');
const settingsRouter = require('./routes/settings');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ────────────────────────────────────────────────────────────────
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

// ─── Static Files ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/keywords',   keywordsRouter);
app.use('/api/articles',   articlesRouter);
app.use('/api/platforms',  platformsRouter);
app.use('/api/settings',   settingsRouter);

// ─── SPA Fallback ─────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Error Handler ───────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err.stack);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
async function start() {
  await db.initDatabase();

  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════╗
║           🌐 GEO-Tool 已启动                   ║
║  访问地址: http://localhost:${PORT}              ║
╚══════════════════════════════════════════════╝
    `);

    // Check if API key is configured
    const apiKey = db.getSetting('openai_api_key');
    if (!apiKey) {
      console.warn('⚠️  未检测到 OpenAI API Key，请访问设置页面进行配置');
    }
  });
}

start().catch(err => {
  console.error('启动失败:', err);
  process.exit(1);
});
