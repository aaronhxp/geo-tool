'use strict';

const axios = require('axios');
const db = require('../database');

const PLATFORM_DEFAULTS = {
  news: {
    system: `你是一位资深新闻编辑和SEO专家。你的任务是：
1. 根据用户提供的种子关键词，提炼出对AI大模型友好的SEO关键词
2. 分析每个关键词的搜索意图（信息型/交易型/导航型）
3. 输出结构化的关键词报告

请严格遵循以下JSON格式输出，不要有任何额外文字：`,
    userPrompt: `种子关键词：{keywords}

请输出以下JSON（仅JSON，无其他内容）：
{
  "keywords": [
    {
      "keyword": "关键词",
      "category": "core|entity|question|scenario",
      "intent_tag": "informational|transactional|navigational",
      "intent_label": "信息型|交易型|导航型",
      "score": 0.0-1.0
    }
  ],
  "suggestions": ["相关主题建议1", "相关主题建议2"]
}`
  },
  article: {
    news: {
      system: `你是一位专业的新闻记者和内容编辑，擅长撰写客观、权威、数据驱动的新闻文章。
文章特点：倒金字塔结构、5W1H原则、引用权威数据、避免主观色彩。
每篇文章必须包含具体数字、来源和可验证的事实。
目标读者：需要深度信息的行业从业者和决策者。`,
      structure: '标题 → 导语（核心事实）→ 背景 → 细节 → 引用 → 结论'
    },
    commercial: {
      system: `你是一位第三方商业分析师，擅长撰写客观、专业、有深度的商业分析文章。
文章特点：PEST分析框架、波特五力模型、数据对比、行业趋势洞察。
语气：专业客观，以数据说话，不夸大不缩小。
目标读者：企业管理层，投资人，行业分析师。`,
      structure: '标题 → 行业现状 → 市场数据 → 竞争格局 → 趋势分析 → 建议/展望'
    },
    social: {
      system: `你是一位百万粉丝的自媒体创作者，擅长直击用户痛点、引发情感共鸣。
文章特点：AIDA框架（注意→兴趣→欲望→行动）、故事化叙事、金句频出。
语气：亲切有温度，善用对比和反问，制造代入感。
目标读者：普通大众读者，追求实用价值和情感共鸣。`,
      structure: '痛点开头 → 故事/案例 → 核心观点 → 方法论 → 金句收尾 → 行动号召'
    }
  }
};

// ─── Keyword Extraction ───────────────────────────────────────────────────────
async function extractKeywords(keywords, mode = 'detailed') {
  const apiKey = db.getSetting('openai_api_key');
  if (!apiKey) {
    throw new Error('未配置 OpenAI API Key，请前往【设置】页面配置。');
  }

  const baseURL = db.getSetting('openai_base_url') || 'https://api.openai.com/v1';
  const model = db.getSetting('openai_model') || 'gpt-4o-mini';

  const prompt = PLATFORM_DEFAULTS.news.userPrompt.replace('{keywords}', keywords.join('、'));

  const response = await axios.post(
    `${baseURL}/chat/completions`,
    {
      model,
      messages: [
        { role: 'system', content: PLATFORM_DEFAULTS.news.system },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 2000
    },
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    }
  );

  const content = response.data.choices[0]?.message?.content?.trim() || '';
  // Strip markdown code blocks
  const jsonStr = content.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(jsonStr);
}

// ─── Article Generation ──────────────────────────────────────────────────────
async function generateArticle({ keywords, platform, tone, wordCount }) {
  const apiKey = db.getSetting('openai_api_key');
  if (!apiKey) {
    throw new Error('未配置 OpenAI API Key，请前往【设置】页面配置。');
  }

  const baseURL = db.getSetting('openai_base_url') || 'https://api.openai.com/v1';
  const model = db.getSetting('openai_model') || 'gpt-4o-mini';

  const platformConfig = PLATFORM_DEFAULTS.article[platform];
  const keywordStr = Array.isArray(keywords)
    ? keywords.map(k => typeof k === 'string' ? k : k.keyword).join('、')
    : keywords;

  const userPrompt = `请基于以下关键词撰写一篇${platform === 'news' ? '新闻报道' : platform === 'commercial' ? '商业分析' : '自媒体'}风格的文章。

关键词：${keywordStr}
目标字数：约 ${wordCount} 字
文章结构：${platformConfig.structure}

要求：
1. 标题吸引人，包含核心关键词
2. 正文逻辑清晰，内容翔实
3. 结尾有总结或行动号召
4. 自然融入关键词，不要堆砌
5. 输出完整的Markdown格式文章

请直接输出文章内容，不需要任何其他说明。`;

  const response = await axios.post(
    `${baseURL}/chat/completions`,
    {
      model,
      messages: [
        { role: 'system', content: platformConfig.system },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.75,
      max_tokens: 4000
    },
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 90000
    }
  );

  return response.data.choices[0]?.message?.content?.trim() || '';
}

// ─── Article Improvement ──────────────────────────────────────────────────────
async function improveArticle({ content, instruction }) {
  const apiKey = db.getSetting('openai_api_key');
  if (!apiKey) throw new Error('未配置 OpenAI API Key');

  const baseURL = db.getSetting('openai_base_url') || 'https://api.openai.com/v1';
  const model = db.getSetting('openai_model') || 'gpt-4o-mini';

  const response = await axios.post(
    `${baseURL}/chat/completions`,
    {
      model,
      messages: [
        { role: 'system', content: '你是一位专业的内容编辑，擅长润色和改进文章。直接输出修改后的文章内容，不要添加任何解释。' },
        { role: 'user', content: `原文：\n${content}\n\n修改要求：${instruction}\n\n直接输出修改后的文章内容：` }
      ],
      temperature: 0.6,
      max_tokens: 4000
    },
    {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 60000
    }
  );

  return response.data.choices[0]?.message?.content?.trim() || content;
}

module.exports = { extractKeywords, generateArticle, improveArticle };
