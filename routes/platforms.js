'use strict';

const express = require('express');
const router = express.Router();
const db = require('../database');
const { testPlatform } = require('../services/publisher');

// GET /api/platforms
router.get('/', (req, res) => {
  try {
    const platforms = db.getAllPlatforms().map(p => ({
      ...p,
      config: p.config ? JSON.parse(p.config) : {}
    }));
    res.json({ platforms });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/platforms
router.post('/', (req, res) => {
  try {
    const { type, name, config } = req.body;
    if (!type || !name) return res.status(400).json({ error: '平台类型和名称不能为空' });

    const validTypes = ['wordpress', 'zhihu', 'wechat', 'weibo', 'webhook'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `不支持的平台类型：${type}` });
    }

    const id = db.insertPlatform({ type, name, config });
    const platform = db.getPlatformById(id);
    res.json({ platform });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/platforms/:id
router.delete('/:id', (req, res) => {
  try {
    db.deletePlatform(+req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/platforms/:id/test
router.post('/:id/test', async (req, res) => {
  try {
    const result = await testPlatform(+req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
