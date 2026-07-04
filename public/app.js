'use strict';

// ═══════════════════════════════════════════════════════════════
// GEO-Tool — Frontend Application
// ═══════════════════════════════════════════════════════════════

const API = '/api';

// ─── State ─────────────────────────────────────────────────────
const state = {
  keywords: [],        // Current extracted keywords
  selectedKeywords: new Set(),
  articles: [],
  platforms: [],
  currentArticleId: null,
  currentPlatformType: 'wordpress',
  publishTargetArticleId: null,
  confirmAction: null,
  currentPage: 1,
  pageSize: 20
};

// ─── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  initNavigation();
  initSettings();
  initTheme();
  checkApiStatus();
  loadPlatforms();
  loadArticles();
  loadPublishHistory();
  initKeywordSelectors();
  initPreview();
});

// ─── Theme ─────────────────────────────────────────────────────
function initTheme() {
  const savedTheme = localStorage.getItem('geo-theme') || 'dark';
  applyTheme(savedTheme);
}

function setTheme(theme) {
  applyTheme(theme);
  localStorage.setItem('geo-theme', theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  
  // Update button states
  const darkBtn = document.getElementById('themeDark');
  const lightBtn = document.getElementById('themeLight');
  if (darkBtn && lightBtn) {
    darkBtn.classList.toggle('active', theme === 'dark');
    lightBtn.classList.toggle('active', theme === 'light');
  }
}

// ─── Navigation ────────────────────────────────────────────────
function initNavigation() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.tab;
      switchTab(tabId);
    });
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabId);
    t.setAttribute('aria-selected', t.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === `tab-${tabId}`);
  });
  lucide.createIcons();

  // Load data when switching tabs
  if (tabId === 'articles') loadArticles();
  if (tabId === 'platforms') { loadPlatforms(); loadPublishHistory(); }
  if (tabId === 'settings') loadSettings();
}

// ─── Toast Notifications ───────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = { success: 'check-circle', error: 'x-circle', info: 'info', warning: 'alert-triangle' };
  toast.innerHTML = `
    <i data-lucide="${icons[type]}" class="toast-icon"></i>
    <span class="toast-msg">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">
      <i data-lucide="x" style="width:14px;height:14px"></i>
    </button>
  `;
  container.appendChild(toast);
  lucide.createIcons({ nodes: [toast] });
  setTimeout(() => toast.remove(), 4000);
}

// ═══════════════════════════════════════════════════════════════
// KEYWORDS MODULE
// ═══════════════════════════════════════════════════════════════

async function extractKeywords() {
  const input = document.getElementById('kwInput').value.trim();
  if (!input) { showToast('请输入关键词', 'warning'); return; }

  // Parse keywords
  const raw = input.split(/[\n,，、]+/).map(k => k.trim()).filter(Boolean);
  if (raw.length === 0) { showToast('未识别到有效关键词', 'warning'); return; }

  // Check if URL
  if (raw.length === 1 && raw[0].startsWith('http')) {
    showToast('正在抓取网页内容...', 'info');
    // For URL input, just use the URL as-is for now
  }

  setLoading('kw', true);
  try {
    const res = await fetch(`${API}/keywords/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords: raw, mode: 'detailed' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '提炼失败');

    state.keywords = data.keywords;
    state.selectedKeywords.clear();
    renderKeywordResults(data);
    checkApiStatus();

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setLoading('kw', false);
  }
}

function renderKeywordResults(data) {
  const empty = document.getElementById('kwEmpty');
  const results = document.getElementById('kwResults');
  const suggestions = document.getElementById('kwSuggestions');
  const summary = document.getElementById('kwSummary');

  empty.classList.add('hidden');
  results.classList.remove('hidden');
  suggestions.classList.remove('hidden');

  // Summary
  const counts = { core: 0, entity: 0, question: 0, scenario: 0 };
  data.keywords.forEach(k => { if (counts[k.category] !== undefined) counts[k.category]++; });

  summary.textContent = `提炼完成：共 ${data.keywords.length} 个关键词（核心词 ${counts.core} · 实体词 ${counts.entity} · 疑问词 ${counts.question} · 场景词 ${counts.scenario}），来源词：${data.sourceCount} 个`;

  // Group by category
  const categories = {
    core: { label: '核心词', el: 'kwCore' },
    entity: { label: '实体词', el: 'kwEntity' },
    question: { label: '疑问词', el: 'kwQuestion' },
    scenario: { label: '场景词', el: 'kwScenario' }
  };

  Object.entries(categories).forEach(([cat, info]) => {
    const items = data.keywords.filter(k => k.category === cat);
    const container = document.getElementById(info.el);
    if (items.length === 0) { container.innerHTML = ''; return; }

    const rotations = [-1.5, 0.5, -0.8, 1.2, -0.3, 0.9, -1.1, 0.4, -0.7, 1.0];
    container.innerHTML = `
      <div class="kw-category-label">${info.label}</div>
      <div class="kw-tags">${items.map((k, i) => {
        const rot = rotations[i % rotations.length];
        return `<span class="kw-tag"
          data-id="${k.keyword}"
          data-category="${k.category}"
          data-intent="${k.intent_tag}"
          data-score="${k.score || 0.8}"
          style="--rotate: ${rot}deg; animation-delay: ${i * 40}ms"
          onclick="toggleKeyword(this)"
          title="意图：${k.intent_label || k.intent_tag}">${k.keyword}<span class="tag-score">${Math.round((k.score || 0.8) * 100)}</span><span class="tag-del">×</span></span>`;
      }).join('')}</div>`;
  });

  // Suggestions
  if (data.suggestions && data.suggestions.length > 0) {
    document.getElementById('kwSuggestions').innerHTML = `
      <h4>💡 主题建议</h4>
      <div class="kw-tags">${data.suggestions.map(s =>
        `<span class="kw-tag" style="--rotate: 0deg" onclick="appendKeyword('${s}')">${s}</span>`
      ).join('')}</div>`;
  }

  updatePromptPreview();
  initKeywordSelectors();
}

function toggleKeyword(el) {
  const kw = el.dataset.id;
  if (state.selectedKeywords.has(kw)) {
    state.selectedKeywords.delete(kw);
    el.classList.remove('selected');
  } else {
    state.selectedKeywords.add(kw);
    el.classList.add('selected');
  }
  updatePromptPreview();
  initKeywordSelectors();
}

function appendKeyword(kw) {
  document.getElementById('kwInput').value += `\n${kw}`;
}

function clearKeywords() {
  state.keywords = [];
  state.selectedKeywords.clear();
  document.getElementById('kwResults').classList.add('hidden');
  document.getElementById('kwSuggestions').classList.add('hidden');
  document.getElementById('kwEmpty').classList.remove('hidden');
  document.getElementById('promptPreview').innerHTML = '<span class="code-comment">// 选中关键词后，此处将生成优化的 Prompt 格式</span>';
  initKeywordSelectors();
}

function copyKeywords() {
  if (state.selectedKeywords.size === 0) {
    showToast('请先选择关键词', 'warning'); return;
  }
  const text = Array.from(state.selectedKeywords).join('\n');
  copyToClipboard(text);
  showToast('已复制到剪贴板', 'success');
}

function exportKeywords() {
  if (state.keywords.length === 0) { showToast('没有可导出的关键词', 'warning'); return; }
  const text = state.keywords.map(k => `${k.keyword}\t${k.category}\t${k.intent_tag || ''}`).join('\n');
  downloadFile('geo-keywords.tsv', text, 'text/plain');
  showToast('关键词已导出', 'success');
}

function updatePromptPreview() {
  const selected = Array.from(state.selectedKeywords);
  if (selected.length === 0) {
    document.getElementById('promptPreview').innerHTML = '<span class="code-comment">// 选中关键词后，此处将生成优化的 Prompt 格式</span>';
    return;
  }
  const prompt = `请围绕以下关键词撰写内容：\n\n主题：${selected.join('、')}\n\n要求：\n1. 覆盖所有关键词的核心语义\n2. 符合 SEO 和 AI 搜索引擎优化标准\n3. 结构清晰，内容翔实`;
  document.getElementById('promptPreview').textContent = prompt;
}

function copyPromptPreview() {
  const text = document.getElementById('promptPreview').textContent;
  if (text.includes('选中关键词后')) { showToast('请先提炼并选中关键词', 'warning'); return; }
  copyToClipboard(text);
  showToast('Prompt 已复制', 'success');
}

// File import for keywords
document.getElementById('kwFileImport').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  document.getElementById('kwInput').value = text.split(/[\r\n,，]+/).filter(Boolean).join('\n');
  e.target.value = '';
  showToast(`已导入：${file.name}`, 'info');
});

// ═══════════════════════════════════════════════════════════════
// WRITING MODULE
// ═══════════════════════════════════════════════════════════════

function initKeywordSelectors() {
  const container = document.getElementById('kwSelector');
  if (!container) return;

  if (state.keywords.length === 0) {
    container.innerHTML = '<span class="kw-placeholder">请先在「关键词提炼」中选择关键词</span>';
    return;
  }

  container.innerHTML = state.keywords.map(k => {
    const selected = state.selectedKeywords.has(k.keyword) ? 'selected' : '';
    return `<span class="kw-tag ${selected}"
      data-id="${k.keyword}"
      style="--rotate: 0deg"
      onclick="toggleKeywordForWriting(this, '${k.keyword}')">${k.keyword}</span>`;
  }).join('');
}

function toggleKeywordForWriting(el, kw) {
  if (state.selectedKeywords.has(kw)) {
    state.selectedKeywords.delete(kw);
    el.classList.remove('selected');
  } else {
    state.selectedKeywords.add(kw);
    el.classList.add('selected');
  }
}

async function generateArticle() {
  const selected = Array.from(state.selectedKeywords);
  if (selected.length === 0) { showToast('请先选择关键词', 'warning'); return; }

  const platform = document.querySelector('input[name="writePlatform"]:checked')?.value || 'news';
  const wordCount = document.getElementById('wordCount')?.value || 800;
  const tone = document.getElementById('writeTone')?.value || 'neutral';

  const btn = document.getElementById('genBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div> 生成中...';

  try {
    const res = await fetch(`${API}/articles/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords: selected, platform, wordCount: +wordCount, tone })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '生成失败');

    document.getElementById('articleEditor').value = data.content;
    state.currentArticleId = data.article.id;
    document.getElementById('publishBtn').disabled = false;
    updatePreview();
    updateEditorMeta();
    showToast('文章生成完成！', 'success');

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="sparkles" class="btn-icon"></i>生成文章';
    lucide.createIcons();
  }
}

function initPreview() {
  const editor = document.getElementById('articleEditor');
  if (!editor) return;
  editor.addEventListener('input', () => { updatePreview(); updateEditorMeta(); });
}

function updatePreview() {
  const content = document.getElementById('articleEditor')?.value || '';
  const preview = document.getElementById('articlePreview');
  if (!preview) return;

  if (!content.trim()) {
    preview.innerHTML = `<div class="preview-placeholder"><i data-lucide="file-text" class="empty-icon"></i><p>文章预览将显示在这里</p></div>`;
    lucide.createIcons({ nodes: [preview] });
    return;
  }

  // Simple markdown-like rendering
  const html = content
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hupbcl])/gm, '<p>')
    .replace(/(?<![>])$/gm, '</p>')
    .replace(/<p><\/p>/g, '');

  preview.innerHTML = html;
}

function updateEditorMeta() {
  const content = document.getElementById('articleEditor')?.value || '';
  const chars = content.replace(/\s/g, '').length;
  const words = chars / 2; // rough Chinese word estimate
  const readTime = Math.max(1, Math.round(words / 400));
  const wcEl = document.getElementById('wordCountDisplay');
  const rtEl = document.getElementById('readTimeDisplay');
  if (wcEl) wcEl.textContent = `${chars} 字`;
  if (rtEl) rtEl.textContent = `约 ${readTime} 分钟`;
}

async function improveArticle() {
  const content = document.getElementById('articleEditor').value;
  if (!content) { showToast('文章内容为空', 'warning'); return; }

  const instruction = prompt('请输入润色要求（直接回车使用默认）：', '优化语言表达，提升可读性和专业感');
  if (instruction === null) return;

  showToast('正在润色...', 'info');
  try {
    const res = await fetch(`${API}/articles/improve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, instruction: instruction || '优化语言表达' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    document.getElementById('articleEditor').value = data.content;
    updatePreview();
    updateEditorMeta();
    showToast('润色完成', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function copyArticle() {
  const content = document.getElementById('articleEditor').value;
  if (!content) { showToast('文章内容为空', 'warning'); return; }
  copyToClipboard(content);
  showToast('已复制到剪贴板', 'success');
}

function insertImage() {
  const textarea = document.getElementById('articleEditor');
  const url = prompt('请输入图片 URL（建议使用网络图片地址）：');
  if (!url || !url.trim()) return;
  insertImageAtCursor(textarea, url.trim());
  showToast('图片已插入', 'success');
}

function insertImageEdit() {
  const textarea = document.getElementById('editContent');
  const url = prompt('请输入图片 URL（建议使用网络图片地址）：');
  if (!url || !url.trim()) return;
  insertImageAtCursor(textarea, url.trim());
  showToast('图片已插入', 'success');
}

function insertImageAtCursor(textarea, url) {
  const alt = url.split('/').pop().replace(/[.\-_]/g, ' ').substring(0, 20) || '图片';
  const markdown = `![${alt}](${url})\n`;
  if (textarea.selectionStart !== undefined) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = textarea.value.substring(0, start);
    const after = textarea.value.substring(end);
    textarea.value = before + markdown + after;
    textarea.selectionStart = textarea.selectionEnd = start + markdown.length;
    textarea.focus();
  } else {
    textarea.value += markdown;
  }
  // 触发 input 事件，确保其他监听器收到更新
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

async function saveArticle() {
  const title = document.getElementById('articleEditor').value.split('\n')[0].replace(/^#\s*/, '').substring(0, 100) || '未命名文章';
  const content = document.getElementById('articleEditor').value;
  const platform = document.querySelector('input[name="writePlatform"]:checked')?.value || 'manual';

  if (!content.trim()) { showToast('文章内容为空', 'warning'); return; }

  try {
    const res = await fetch(`${API}/articles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, platform, keywords: Array.from(state.selectedKeywords), status: 'draft' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    state.currentArticleId = data.article.id;
    showToast('文章已保存', 'success');
    loadArticles();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════
// ARTICLES MODULE
// ═══════════════════════════════════════════════════════════════

async function loadArticles() {
  const search = document.getElementById('articleSearch')?.value || '';
  const platform = document.getElementById('filterPlatform')?.value || '';
  const status = document.getElementById('filterStatus')?.value || '';

  try {
    const params = new URLSearchParams({ search, limit: state.pageSize, offset: (state.currentPage - 1) * state.pageSize });
    if (platform) params.set('platform', platform);
    if (status) params.set('status', status);

    const res = await fetch(`${API}/articles?${params}`);
    const data = await res.json();
    state.articles = data.articles || [];
    renderArticles(data.articles, data.total);
  } catch (err) {
    console.error(err);
  }
}

function renderArticles(articles, total) {
  const container = document.getElementById('articlesList');
  const countEl = document.getElementById('articlesCount');

  if (countEl) countEl.textContent = `共 ${total} 篇`;

  if (!articles || articles.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="file-text" class="empty-icon"></i>
        <p>暂无文章</p>
        <small>在「文章写作」中生成并保存文章</small>
      </div>`;
    lucide.createIcons({ nodes: [container] });
    return;
  }

  const platformLabels = { news: '新闻', commercial: '商业', social: '自媒体', manual: '手动' };

  container.innerHTML = articles.map(a => {
    const pubLinks = (a.publishHistory || []).filter(p => p.publish_url).map(p =>
      `<a href="${p.publish_url}" target="_blank" class="ph-link">查看链接 ↗</a>`
    ).join(' ');
    const pubCount = (a.publishHistory || []).filter(p => p.status === 'success').length;

    return `
    <div class="article-card">
      <div class="article-info">
        <div class="article-title">${escapeHtml(a.title)}</div>
        <div class="article-meta">
          <span class="article-platform-badge badge-${a.platform}">${platformLabels[a.platform] || a.platform}</span>
          <span class="article-status status-${a.status}">${a.status === 'published' ? '✓ 已发布' : a.status === 'failed' ? '✗ 失败' : '○ 草稿'}</span>
          <span>${a.word_count || 0} 字</span>
          <span>${formatDate(a.updated_at)}</span>
          ${pubCount > 0 ? `<span>已发布 ${pubCount} 次</span>` : ''}
        </div>
        ${pubLinks ? `<div style="margin-top:4px">${pubLinks}</div>` : ''}
      </div>
      <div class="article-actions">
        <button class="btn btn-ghost btn-sm" onclick="loadArticleToEditor(${a.id})" title="编辑">
          <i data-lucide="edit-3" class="btn-icon"></i>
        </button>
        <button class="btn btn-ghost btn-sm" onclick="openPublishModal(${a.id})" title="发布">
          <i data-lucide="send" class="btn-icon"></i>
        </button>
        <button class="btn btn-ghost btn-sm" onclick="copyArticleContent(${a.id})" title="复制">
          <i data-lucide="copy" class="btn-icon"></i>
        </button>
        <button class="btn btn-ghost btn-sm" onclick="confirmDeleteArticle(${a.id})" title="删除">
          <i data-lucide="trash-2" class="btn-icon"></i>
        </button>
      </div>
    </div>`;
  }).join('');

  lucide.createIcons({ nodes: [container] });
  renderPagination(total);
}

async function loadArticleToEditor(id) {
  try {
    const res = await fetch(`${API}/articles/${id}`);
    const data = await res.json();
    document.getElementById('articleEditor').value = data.content;
    state.currentArticleId = id;
    updatePreview();
    updateEditorMeta();
    document.getElementById('publishBtn').disabled = false;
    switchTab('writing');
    showToast('已加载文章，可编辑', 'info');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function copyArticleContent(id) {
  const article = state.articles.find(a => a.id === id);
  if (!article) return;
  copyToClipboard(article.content);
  showToast('已复制到剪贴板', 'success');
}

function confirmDeleteArticle(id) {
  showConfirm('删除文章', '确定要删除这篇文章吗？此操作不可恢复。', async () => {
    try {
      const res = await fetch(`${API}/articles/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      showToast('文章已删除', 'success');
      loadArticles();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function renderPagination(total) {
  const container = document.getElementById('articlesPagination');
  if (!container) return;
  const totalPages = Math.ceil(total / state.pageSize);
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  let html = '';
  html += `<button class="page-btn" onclick="goPage(${state.currentPage - 1})" ${state.currentPage === 1 ? 'disabled' : ''}>
    <i data-lucide="chevron-left" style="width:14px;height:14px"></i></button>`;

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= state.currentPage - 1 && i <= state.currentPage + 1)) {
      html += `<button class="page-btn ${i === state.currentPage ? 'active' : ''}" onclick="goPage(${i})">${i}</button>`;
    } else if (i === state.currentPage - 2 || i === state.currentPage + 2) {
      html += `<span style="color:var(--text-muted)">...</span>`;
    }
  }

  html += `<button class="page-btn" onclick="goPage(${state.currentPage + 1})" ${state.currentPage === totalPages ? 'disabled' : ''}>
    <i data-lucide="chevron-right" style="width:14px;height:14px"></i></button>`;

  container.innerHTML = html;
  lucide.createIcons({ nodes: [container] });
}

function goPage(page) {
  state.currentPage = page;
  loadArticles();
}

// ═══════════════════════════════════════════════════════════════
// PUBLISH MODULE
// ═══════════════════════════════════════════════════════════════

function openPublishModal(articleId) {
  state.publishTargetArticleId = articleId;
  const modal = document.getElementById('publishModal');
  const grid = document.getElementById('platformSelectGrid');
  const info = document.getElementById('modalArticleInfo');
  const result = document.getElementById('publishResult');
  const status = document.getElementById('publishStatus');

  result.classList.add('hidden');
  status.classList.add('hidden');
  document.getElementById('doPublishBtn').disabled = false;

  // Load article info
  fetch(`${API}/articles/${articleId}`).then(r => r.json()).then(a => {
    const platformLabels = { news: '新闻', commercial: '商业', social: '自媒体', manual: '手动' };
    info.innerHTML = `<strong>${escapeHtml(a.title)}</strong> · ${a.word_count} 字 · ${platformLabels[a.platform] || a.platform}`;
  }).catch(() => {});

  // Load platforms
  grid.innerHTML = state.platforms.length === 0
    ? '<p style="color:var(--text-muted);font-size:0.85rem">尚未配置任何平台，请先在「平台发布」中添加平台</p>'
    : state.platforms.map(p => `
      <label class="platform-select-item" data-platform-id="${p.id}">
        <input type="radio" name="publishPlatform" value="${p.id}" />
        <div class="ps-icon" style="background:${getPlatformColor(p.type)}20;color:${getPlatformColor(p.type)}">${getPlatformEmoji(p.type)}</div>
        <div class="ps-info">
          <div class="ps-name">${escapeHtml(p.name)}</div>
          <div class="ps-type">${getPlatformLabel(p.type)}</div>
        </div>
        <i data-lucide="check" class="ps-check btn-icon"></i>
      </label>`).join('');

  grid.querySelectorAll('.platform-select-item').forEach(item => {
    item.addEventListener('click', () => {
      grid.querySelectorAll('.platform-select-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      item.querySelector('input').checked = true;
    });
  });

  if (state.platforms.length > 0) {
    grid.querySelector('.platform-select-item').click();
  }

  modal.classList.remove('hidden');
  lucide.createIcons({ nodes: [modal] });
}

function closePublishModal() {
  document.getElementById('publishModal').classList.add('hidden');
}

async function doPublish() {
  const selected = document.querySelector('input[name="publishPlatform"]:checked');
  if (!selected) { showToast('请选择发布平台', 'warning'); return; }

  const status = document.getElementById('publishStatus');
  const result = document.getElementById('publishResult');
  const btn = document.getElementById('doPublishBtn');

  status.classList.remove('hidden');
  result.classList.add('hidden');
  btn.disabled = true;

  document.getElementById('publishStatusText').textContent = '正在发布...';

  try {
    const res = await fetch(`${API}/articles/${state.publishTargetArticleId}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platformId: +selected.value })
    });
    const data = await res.json();

    status.classList.add('hidden');
    result.classList.remove('hidden');

    if (data.success) {
      result.className = 'publish-result success';
      result.innerHTML = `
        <strong>✓ 发布成功！</strong><br/>
        ${data.url ? `<a href="${data.url}" target="_blank" style="color:var(--accent)">${data.url}</a>` : data.message || ''}`;
      showToast('文章发布成功！', 'success');
      loadArticles();
      loadPublishHistory();
    } else {
      result.className = 'publish-result error';
      result.innerHTML = `<strong>✗ 发布失败</strong><br/>${data.message || data.error || '未知错误'}`;
      showToast('发布失败：' + (data.message || data.error), 'error');
    }

  } catch (err) {
    status.classList.add('hidden');
    result.classList.remove('hidden');
    result.className = 'publish-result error';
    result.innerHTML = `<strong>✗ 发生错误</strong><br/>${err.message}`;
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════════
// PLATFORMS MODULE
// ═══════════════════════════════════════════════════════════════

async function loadPlatforms() {
  try {
    const res = await fetch(`${API}/platforms`);
    const data = await res.json();
    state.platforms = data.platforms || [];
    renderPlatforms();
  } catch (err) {
    console.error(err);
  }
}

function renderPlatforms() {
  const grid = document.getElementById('platformsGrid');
  if (state.platforms.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <i data-lucide="plug" class="empty-icon"></i>
        <p>尚未添加任何平台</p>
        <small>点击下方按钮添加发布平台</small>
      </div>`;
    lucide.createIcons({ nodes: [grid] });
    return;
  }

  grid.innerHTML = state.platforms.map(p => `
    <div class="platform-card" id="platform-${p.id}">
      <div class="platform-avatar" style="background:${getPlatformColor(p.type)}20;color:${getPlatformColor(p.type)}">
        ${getPlatformEmoji(p.type)}
      </div>
      <div class="platform-info">
        <div class="platform-name">${escapeHtml(p.name)}</div>
        <div class="platform-type">${getPlatformLabel(p.type)}</div>
        ${p.last_used_at ? `<div class="platform-last-used">上次使用：${formatDate(p.last_used_at)}</div>` : ''}
      </div>
      <div class="platform-card-actions">
        <button class="btn btn-ghost btn-sm" onclick="testPlatform(${p.id})" title="测试连接">
          <i data-lucide="wifi" class="btn-icon"></i>
        </button>
        <button class="btn btn-ghost btn-sm" onclick="deletePlatform(${p.id})" title="删除">
          <i data-lucide="trash-2" class="btn-icon"></i>
        </button>
      </div>
    </div>`).join('');

  lucide.createIcons({ nodes: [grid] });
}

function selectPlatformType(type) {
  state.currentPlatformType = type;
  document.querySelectorAll('.platform-type-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === type);
  });
  renderPlatformForm(type);
}

function renderPlatformForm(type) {
  const form = document.getElementById('platformForm');
  const configs = {
    wordpress: `
      <div class="form-group"><label class="form-label">网站地址</label><input type="url" id="pf-siteUrl" class="input" placeholder="https://yourblog.com" /></div>
      <div class="form-group"><label class="form-label">用户名</label><input type="text" id="pf-username" class="input" placeholder="admin" /></div>
      <div class="form-group"><label class="form-label">应用密码</label><input type="password" id="pf-appPassword" class="input" placeholder="xxxx xxxx xxxx xxxx" /><small style="color:var(--text-muted)">在 WordPress 后台 → 用户 → 个人资料 → 应用密码 中生成</small></div>
      <div class="form-group"><label class="form-label">默认分类（可选，多个用逗号分隔）</label><input type="text" id="pf-categories" class="input" placeholder="技术, 行业动态" /></div>`,
    zhihu: `
      <div class="form-group"><label class="form-label">平台名称</label><input type="text" id="pf-name" class="input" placeholder="我的知乎" /></div>
      <div class="form-group"><label class="form-label">Access Token</label><input type="password" id="pf-accessToken" class="input" placeholder="从知乎开放平台获取" /><small style="color:var(--text-muted)">访问 zhihu.com/oauth/me 创建应用获取 Token</small></div>`,
    wechat: `
      <div class="form-group"><label class="form-label">平台名称</label><input type="text" id="pf-name" class="input" placeholder="我的公众号" /></div>
      <div class="form-group"><label class="form-label">AppID</label><input type="text" id="pf-appId" class="input" placeholder="wx1234567890abcdef" /></div>
      <div class="form-group"><label class="form-label">AppSecret</label><input type="password" id="pf-appSecret" class="input" placeholder="应用密钥" /></div>
      <div class="form-group"><label class="form-label">作者名（可选）</label><input type="text" id="pf-author" class="input" placeholder="默认匿名" /></div>
      <div class="form-group"><label class="form-label">封面图 URL（可选）</label><input type="url" id="pf-coverUrl" class="input" placeholder="https://example.com/cover.jpg" /><p class="form-hint">不填则自动抓取文章第一张图片作为封面</p></div>
      <div class="form-group"><label class="form-label">永久素材 media_id（可选）</label><input type="text" id="pf-thumbMediaId" class="input" placeholder="从微信公众号素材库获取" /><p class="form-hint">填此项则优先使用，跳过封面上传</p></div>`,
    weibo: `
      <div class="form-group"><label class="form-label">平台名称</label><input type="text" id="pf-name" class="input" placeholder="我的微博" /></div>
      <div class="form-group"><label class="form-label">Access Token</label><input type="password" id="pf-accessToken" class="input" placeholder="从微博开放平台获取" /></div>`,
    webhook: `
      <div class="form-group"><label class="form-label">平台名称</label><input type="text" id="pf-name" class="input" placeholder="我的 Webhook" /></div>
      <div class="form-group"><label class="form-label">Webhook URL</label><input type="url" id="pf-url" class="input" placeholder="https://your-server.com/webhook" /></div>
      <div class="form-group"><label class="form-label">HTTP 方法</label><select id="pf-method" class="select"><option value="POST">POST</option><option value="PUT">PUT</option></select></div>
      <div class="form-group"><label class="form-label">自定义 Headers（JSON，可选）</label><input type="text" id="pf-headers" class="input" placeholder='{"Authorization": "Bearer xxx"}' /></div>
      <div class="form-group"><label class="form-label">Body 模板（可选，支持 {{title}} {{content}} {{keywords}}）</label><textarea id="pf-bodyTemplate" class="textarea" rows="3" placeholder='{"title": "{{title}}", "content": "{{content}}"}'></textarea></div>`
  };

  form.innerHTML = (configs[type] || '') + `
    <button class="btn btn-primary" onclick="addPlatform()" style="align-self:flex-start">
      <i data-lucide="plus" class="btn-icon"></i>添加平台
    </button>`;
  lucide.createIcons({ nodes: [form] });
}

async function addPlatform() {
  const type = state.currentPlatformType;
  const name = document.getElementById('pf-name')?.value ||
    (type === 'wordpress' ? document.getElementById('pf-siteUrl')?.value : `${getPlatformLabel(type)}平台`);

  const config = {};

  switch (type) {
    case 'wordpress':
      config.siteUrl = document.getElementById('pf-siteUrl')?.value;
      config.username = document.getElementById('pf-username')?.value;
      config.appPassword = document.getElementById('pf-appPassword')?.value;
      config.categories = (document.getElementById('pf-categories')?.value || '').split(/[,，]/).map(s => s.trim()).filter(Boolean);
      break;
    case 'zhihu':
      config.accessToken = document.getElementById('pf-accessToken')?.value;
      break;
    case 'wechat':
      config.appId = document.getElementById('pf-appId')?.value;
      config.appSecret = document.getElementById('pf-appSecret')?.value;
      config.author = document.getElementById('pf-author')?.value;
      config.coverUrl = document.getElementById('pf-coverUrl')?.value?.trim();
      config.thumb_media_id = document.getElementById('pf-thumbMediaId')?.value?.trim();
      break;
    case 'weibo':
      config.accessToken = document.getElementById('pf-accessToken')?.value;
      break;
    case 'webhook':
      config.url = document.getElementById('pf-url')?.value;
      config.method = document.getElementById('pf-method')?.value || 'POST';
      try {
        config.headers = JSON.parse(document.getElementById('pf-headers')?.value || '{}');
      } catch { config.headers = {}; }
      config.bodyTemplate = document.getElementById('pf-bodyTemplate')?.value || '';
      break;
  }

  if (!name) { showToast('请填写平台名称', 'warning'); return; }

  try {
    const res = await fetch(`${API}/platforms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, name, config })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast(`${name} 添加成功`, 'success');
    loadPlatforms();
    renderPlatformForm(type); // Reset form
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function testPlatform(id) {
  const btn = event.target.closest('button');
  const origHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px"></div>';

  try {
    const res = await fetch(`${API}/platforms/${id}/test`, { method: 'POST' });
    const data = await res.json();
    showToast(data.message, data.success ? 'success' : 'error');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = origHtml;
    lucide.createIcons({ nodes: [btn] });
  }
}

async function deletePlatform(id) {
  showConfirm('删除平台', '确定要删除此平台配置吗？', async () => {
    try {
      await fetch(`${API}/platforms/${id}`, { method: 'DELETE' });
      showToast('平台已删除', 'success');
      loadPlatforms();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

async function loadPublishHistory() {
  try {
    const res = await fetch(`${API}/articles/published/history?limit=20`);
    const data = await res.json();
    renderPublishHistory(data.history || []);
  } catch (err) {
    console.error(err);
  }
}

function renderPublishHistory(history) {
  const container = document.getElementById('publishHistory');
  if (!history || history.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="clock" class="empty-icon"></i>
        <p>暂无发布记录</p>
      </div>`;
    lucide.createIcons({ nodes: [container] });
    return;
  }

  container.innerHTML = history.map(h => `
    <div class="publish-history-item">
      <div class="ph-icon ${h.status === 'success' ? 'success' : 'failed'}">
        <i data-lucide="${h.status === 'success' ? 'check' : 'x'}" style="width:16px;height:16px"></i>
      </div>
      <div class="ph-info">
        <div class="ph-title">${escapeHtml(h.article_title || '未知文章')}</div>
        <div class="ph-meta">${getPlatformLabel(h.platform_type)} · ${formatDate(h.publish_time)}</div>
      </div>
      ${h.publish_url ? `<a href="${h.publish_url}" target="_blank" class="ph-link">${h.publish_url}</a>` : ''}
    </div>`).join('');

  lucide.createIcons({ nodes: [container] });
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS MODULE
// ═══════════════════════════════════════════════════════════════

async function checkApiStatus() {
  try {
    const res = await fetch(`${API}/settings`);
    const data = await res.json();
    const statusEl = document.getElementById('apiStatus');
    const statusDot = statusEl?.querySelector('.status-dot');
    const statusText = statusEl?.querySelector('.status-text');

    if (data.settings?.openai_api_key_set) {
      if (statusDot) statusDot.className = 'status-dot online';
      if (statusText) statusText.textContent = 'API 已配置';
    } else {
      if (statusDot) statusDot.className = 'status-dot offline';
      if (statusText) statusText.textContent = '未配置';
    }

    document.getElementById('apiKeyStatus').textContent = data.settings?.openai_api_key_set
      ? `当前 Key：${data.settings.openai_api_key_masked || ''}`
      : '未配置 API Key，请先配置';
  } catch {}
}

// ─── Provider Presets ────────────────────────────────────────────────────────────
const PROVIDER_PRESETS = {
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    modelList: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo', 'claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229']
  },
  doubao: {
    label: '豆包（字节跳动）',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-pro-32k',
    modelList: ['doubao-pro-32k', 'doubao-lite-32k', 'doubao-pro-4k', 'doubao-lite-4k']
  },
  kimi: {
    label: 'Kimi（Moonshot）',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    modelList: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k']
  },
  zhipu: {
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    modelList: ['glm-4-flash', 'glm-4', 'glm-4-plus', 'glm-3-turbo']
  },
  siliconflow: {
    label: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    modelList: ['Qwen/Qwen2.5-7B-Instruct', 'deepseek-ai/DeepSeek-V2.5', 'THUDM/glm-4-9b-chat', 'mistralai/Mistral-7B-Instruct-v0.2']
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    modelList: ['deepseek-chat', 'deepseek-coder']
  }
};

function applyProviderPreset(provider) {
  const preset = PROVIDER_PRESETS[provider];
  if (!preset) return;

  // Highlight active button
  document.querySelectorAll('.provider-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.provider === provider);
  });

  // Auto-fill base URL
  document.getElementById('apiBaseUrlInput').value = preset.baseUrl;

  // Filter model select to relevant models + allow all as fallback
  const modelSelect = document.getElementById('modelSelect');
  // Reset to show all
  for (const opt of modelSelect.options) {
    opt.hidden = false;
  }
  // Try to select preset default, fall back to first available
  const targetOpt = [...modelSelect.options].find(o => o.value === preset.model);
  if (targetOpt) {
    modelSelect.value = preset.model;
  }

  document.getElementById('providerHint').textContent = `当前：${preset.label}（已填入推荐端点和模型，请填入 Key 后保存）`;

  // Auto-save base URL
  saveApiBaseUrl();
  saveModel();
}

function highlightActiveProvider(baseUrl) {
  const url = (baseUrl || '').toLowerCase();
  let matched = 'openai';
  if (url.includes('volces.com') || url.includes('bytedance') || url.includes(' volcengine')) matched = 'doubao';
  else if (url.includes('moonshot.cn')) matched = 'kimi';
  else if (url.includes('bigmodel.cn') || url.includes('zhipuai')) matched = 'zhipu';
  else if (url.includes('siliconflow')) matched = 'siliconflow';
  else if (url.includes('deepseek')) matched = 'deepseek';

  document.querySelectorAll('.provider-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.provider === matched);
  });
  const preset = PROVIDER_PRESETS[matched];
  document.getElementById('providerHint').textContent = `当前：${preset ? preset.label : 'OpenAI'}`;
}

function initSettings() {
  const savedUrl = localStorage.getItem('geo_api_base_url') || '';
  const savedModel = localStorage.getItem('geo_model') || 'gpt-4o-mini';
  document.getElementById('apiBaseUrlInput').value = savedUrl;
  document.getElementById('modelSelect').value = savedModel;
  highlightActiveProvider(savedUrl);
}

async function loadSettings() {
  await checkApiStatus();
  try {
    const res = await fetch(`${API}/settings`);
    const data = await res.json();
    const s = data.settings || {};
    document.getElementById('apiKeyStatus').textContent = s.openai_api_key_set
      ? `当前 Key：${s.openai_api_key_masked || ''}`
      : '未配置 API Key，请先配置';
    if (s.openai_base_url) {
      localStorage.setItem('geo_api_base_url', s.openai_base_url);
      document.getElementById('apiBaseUrlInput').value = s.openai_base_url;
      highlightActiveProvider(s.openai_base_url);
    }
    if (s.openai_model) {
      localStorage.setItem('geo_model', s.openai_model);
      document.getElementById('modelSelect').value = s.openai_model;
    }
  } catch {}
}

async function saveApiKey() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!key) { showToast('请输入 API Key', 'warning'); return; }

  try {
    await fetch(`${API}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'openai_api_key', value: key })
    });
    document.getElementById('apiKeyInput').value = '';
    localStorage.setItem('geo_api_key_set', '1');
    showToast('API Key 已保存（已脱敏显示）', 'success');
    checkApiStatus();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function saveApiBaseUrl() {
  const url = document.getElementById('apiBaseUrlInput').value.trim();
  localStorage.setItem('geo_api_base_url', url);
  highlightActiveProvider(url);
  try {
    await fetch(`${API}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'openai_base_url', value: url })
    });
    showToast('API 端点已保存', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function saveModel() {
  const model = document.getElementById('modelSelect').value;
  localStorage.setItem('geo_model', model);
  try {
    await fetch(`${API}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'openai_model', value: model })
    });
    showToast('模型已保存', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function saveDefaultPlatform() {
  const val = document.getElementById('defaultPlatformSelect').value;
  await fetch(`${API}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'default_platform', value: val })
  });
  showToast('默认平台已保存', 'success');
}

async function saveDefaultWordCount() {
  const val = document.getElementById('defaultWordCountSelect').value;
  await fetch(`${API}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'default_word_count', value: +val })
  });
  showToast('默认字数已保存', 'success');
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('apiKeyInput');
  input.type = input.type === 'password' ? 'text' : 'password';
}

async function exportAllData() {
  try {
    const [kwRes, artRes] = await Promise.all([
      fetch(`${API}/keywords`),
      fetch(`${API}/articles?limit=1000`)
    ]);
    const kwData = await kwRes.json();
    const artData = await artRes.json();

    const exportObj = {
      exportTime: new Date().toISOString(),
      keywords: kwData.keywords || [],
      articles: (artData.articles || []).map(a => ({ ...a, publishHistory: undefined }))
    };

    downloadFile('geo-export.json', JSON.stringify(exportObj, null, 2), 'application/json');
    showToast('数据已导出', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function confirmClearData() {
  showConfirm('清空所有数据', '⚠️ 将删除所有关键词、文章和平台配置。此操作不可恢复！', async () => {
    try {
      // Delete keywords
      await fetch(`${API}/keywords`, { method: 'DELETE' });
      // Delete articles
      const res = await fetch(`${API}/articles?limit=1000`);
      const data = await res.json();
      for (const a of (data.articles || [])) {
        await fetch(`${API}/articles/${a.id}`, { method: 'DELETE' });
      }
      // Delete platforms
      for (const p of state.platforms) {
        await fetch(`${API}/platforms/${p.id}`, { method: 'DELETE' });
      }
      state.keywords = [];
      state.selectedKeywords.clear();
      state.articles = [];
      state.platforms = [];
      clearKeywords();
      renderArticles([], 0);
      renderPlatforms();
      showToast('所有数据已清空', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// EDIT ARTICLE MODAL
// ═══════════════════════════════════════════════════════════════

let editArticleId = null;

function openEditModal(id) {
  editArticleId = id;
  const article = state.articles.find(a => a.id === id);
  if (!article) return;

  document.getElementById('editTitle').value = article.title;
  document.getElementById('editPlatform').value = article.platform;
  document.getElementById('editContent').value = article.content;
  document.getElementById('editModal').classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('editModal').classList.add('hidden');
  editArticleId = null;
}

async function saveEditArticle() {
  if (!editArticleId) return;
  const title = document.getElementById('editTitle').value;
  const platform = document.getElementById('editPlatform').value;
  const content = document.getElementById('editContent').value;

  try {
    const res = await fetch(`${API}/articles/${editArticleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, platform, content })
    });
    if (!res.ok) throw new Error('保存失败');
    showToast('文章已更新', 'success');
    closeEditModal();
    loadArticles();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════
// CONFIRM MODAL
// ═══════════════════════════════════════════════════════════════

function showConfirm(title, message, action) {
  state.confirmAction = action;
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  document.getElementById('confirmModal').classList.remove('hidden');
}

function closeConfirmModal() {
  document.getElementById('confirmModal').classList.add('hidden');
  state.confirmAction = null;
}

function doConfirmAction() {
  if (state.confirmAction) state.confirmAction();
  closeConfirmModal();
}

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function setLoading(scope, loading) {
  const el = document.getElementById(`${scope === 'kw' ? 'kw' : scope}Loading`);
  if (!el) return;
  el.classList.toggle('hidden', !loading);
  const empty = document.getElementById(`${scope}Empty`);
  const results = document.getElementById(`${scope}Results`);
  if (loading) {
    if (empty) empty.classList.add('hidden');
    if (results) results.classList.add('hidden');
  }
}

function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text);
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getPlatformLabel(type) {
  const labels = {
    wordpress: 'WordPress',
    zhihu: '知乎',
    wechat: '微信公众号',
    weibo: '微博',
    webhook: '通用 Webhook'
  };
  return labels[type] || type;
}

function getPlatformEmoji(type) {
  const emojis = {
    wordpress: '🔗',
    zhihu: '💬',
    wechat: '📱',
    weibo: '📣',
    webhook: '⚡'
  };
  return emojis[type] || '🌐';
}

function getPlatformColor(type) {
  const colors = {
    wordpress: '#58a6ff',
    zhihu: '#0084ff',
    wechat: '#07c160',
    weibo: '#e6162d',
    webhook: '#f0883e'
  };
  return colors[type] || '#8b949e';
}
