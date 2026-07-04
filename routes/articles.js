'use strict';

const express = require('express');
const router = express.Router();
const db = require('../database');
const { generateArticle, improveArticle } = require('../services/llm');
const { publishArticle } = require('../services/publisher');

function extractFirstImage(markdown) {
  if (!markdown) return null;
  const match = markdown.match(/!\[.*?\]\((.+?)\)/);
  return match ? match[1] : null;
}

// GET /api/articles
router.get('/', async (req, res) => {
  try {
    const { platform, status, search, limit, offset } = req.query;
    const articles = await db.getAllArticles({
      platform,
      status,
      search,
      limit: +limit || 50,
      offset: +offset || 0
    });
    const total = await db.getArticleCount({ platform, status, search });
    res.json({ articles, total });
  } catch (err) {
    console.error('[articles GET]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/articles/:id
router.get('/:id', async (req, res) => {
  try {
    const article = await db.getArticleById(+req.params.id);
    if (!article) return res.status(404).json({ error: '文章不存在' });
    res.json(article);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/articles/generate
router.post('/generate', async (req, res) => {
  try {
    const { keywords, platform, wordCount = 800, tone } = req.body;

    if (!keywords || keywords.length === 0) {
      return res.status(400).json({ error: '请选择至少一个关键词' });
    }

    const content = await generateArticle({ keywords, platform, tone, wordCount: +wordCount });

    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : `${keywords[0]}深度分析`;

    const articleId = await db.insertArticle({
      title,
      content,
      platform,
      keywords,
      status: 'draft',
      cover_image: extractFirstImage(content)
    });

    const article = await db.getArticleById(articleId);
    res.json({ article, content });

  } catch (err) {
    console.error('[/api/articles/generate]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/articles/improve
router.post('/improve', async (req, res) => {
  try {
    const { content, instruction } = req.body;
    if (!content) return res.status(400).json({ error: '文章内容不能为空' });

    const improved = await improveArticle({ content, instruction: instruction || '润色并优化文章质量' });
    res.json({ content: improved });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/articles
router.post('/', async (req, res) => {
  try {
    const { title, content, platform, keywords, status } = req.body;
    if (!title || !content) return res.status(400).json({ error: '标题和内容不能为空' });

    const articleId = await db.insertArticle({
      title,
      content,
      platform: platform || 'manual',
      keywords: keywords || [],
      status: status || 'draft',
      cover_image: extractFirstImage(content)
    });

    const article = await db.getArticleById(articleId);
    res.json({ article });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/articles/:id
router.put('/:id', async (req, res) => {
  try {
    const existing = await db.getArticleById(+req.params.id);
    if (!existing) return res.status(404).json({ error: '文章不存在' });

    await db.updateArticle(+req.params.id, {
      title: req.body.title,
      content: req.body.content,
      platform: req.body.platform,
      keywords: req.body.keywords,
      status: req.body.status,
      cover_image: req.body.cover_image
    });

    const updated = await db.getArticleById(+req.params.id);
    res.json({ article: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/articles/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.deleteArticle(+req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/articles/:id/publish
router.post('/:id/publish', async (req, res) => {
  try {
    const { platformId } = req.body;
    if (!platformId) return res.status(400).json({ error: '请选择发布平台' });

    const result = await publishArticle(+req.params.id, +platformId);
    res.json(result);

  } catch (err) {
    console.error('[/api/articles/:id/publish]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/articles/published/history
router.get('/published/history', async (req, res) => {
  try {
    const history = await db.getRecentPublishedHistory(+req.query.limit || 20);
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
