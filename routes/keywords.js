'use strict';

const express = require('express');
const router = express.Router();
const db = require('../database');
const { extractKeywords } = require('../services/llm');

// POST /api/keywords/extract
router.post('/extract', async (req, res) => {
  try {
    const { keywords, mode = 'detailed' } = req.body;

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ error: '请提供至少一个关键词' });
    }

    const cleaned = keywords.map(k => String(k).trim()).filter(Boolean);
    if (cleaned.length === 0) {
      return res.status(400).json({ error: '关键词格式不正确' });
    }

    const result = await extractKeywords(cleaned, mode);

    // Save to database
    if (result.keywords && result.keywords.length > 0) {
      result.keywords.forEach(k => {
        db.insertKeyword(
          k.keyword,
          k.category || 'core',
          k.intent_tag || 'informational',
          k.intent_label || '信息型',
          k.score || 0.8,
          JSON.stringify(cleaned)
        );
      });
    }

    res.json({
      keywords: result.keywords || [],
      suggestions: result.suggestions || [],
      sourceCount: cleaned.length
    });

  } catch (err) {
    console.error('[/api/keywords/extract]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/keywords
router.get('/', (req, res) => {
  try {
    const { category } = req.query;
    const items = db.getAllKeywords();
    const filtered = category ? items.filter(k => k.category === category) : items;
    res.json({ keywords: filtered });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/keywords/:id
router.delete('/:id', (req, res) => {
  try {
    // Not implemented in simple API - delete all is used instead
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/keywords — clear all
router.delete('/', (req, res) => {
  try {
    db.deleteAllKeywords();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
