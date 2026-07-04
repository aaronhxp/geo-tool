'use strict';

const express = require('express');
const router = express.Router();
const db = require('../database');

// GET /api/settings
router.get('/', (req, res) => {
  try {
    const settings = db.getAllSettings();
    // Mask sensitive fields
    if (settings.openai_api_key) {
      const key = settings.openai_api_key;
      settings.openai_api_key_masked = key.substring(0, 6) + '***' + key.substring(key.length - 4);
      settings.openai_api_key_set = true;
    }
    delete settings.openai_api_key; // Never send raw key
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings
router.post('/', (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: '缺少 key 参数' });
    db.setSetting(key, value);
    res.json({ success: true, key });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/settings/export
router.get('/export', (req, res) => {
  try {
    const settings = db.getAllSettings();
    res.setHeader('Content-Disposition', 'attachment; filename=geo-settings.json');
    res.setHeader('Content-Type', 'application/json');
    // Mask API keys in export
    const exportData = { ...settings };
    if (exportData.openai_api_key) exportData.openai_api_key = '***MASKED***';
    res.json(exportData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
