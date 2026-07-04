# GEO-Tool 规格文档

> GEO（Generative Engine Optimization）工具 — 让 AI 更懂你的内容

## 1. Concept & Vision

**定位：** 面向内容创作者和营销人员的 AI 辅助写作与发布平台，通过关键词提炼→多平台适配写作→一键发布的闭环，大幅提升内容 SEO 效率和 AI 搜索引擎友好度。

**核心理念：** 不是写文章，而是教会 AI 理解"你的主题"并为你生成精准内容。

**设计语言：** 深色科技风格 + 渐变强调色，主视觉传递"数据流动 + AI 智能"的感觉。

---

## 2. Design Language

### 色彩系统
```
背景主色:   #0d1117 (GitHub 深黑)
卡片背景:   #161b22
边框:      #30363d
主强调:    #58a6ff (科技蓝)
次强调:    #3fb950 (成功绿)
警告:     #f0883e (橙色)
危险:     #f85149 (红色)
文字主色:  #e6edf3
文字次色:  #8b949e
文字弱色:  #484f58
```

### 字体
- 主字体: "Inter", "PingFang SC", "Microsoft YaHei", sans-serif
- 代码/关键词: "JetBrains Mono", "Consolas", monospace

### 动效
- 页面切换: fade-in 200ms ease
- 卡片悬停: translateY(-2px) + box-shadow 增强, 200ms
- 按钮点击: scale(0.97), 100ms
- 加载动画: 三色脉冲圆点 1.2s infinite
- 关键词标签: 随机微旋转 (-2°~2°)，营造手工感

### 图标
- Lucide Icons (CDN)
- 风格: 线条图标，stroke-width: 1.5

---

## 3. Layout & Structure

### 整体布局
```
┌──────────────────────────────────────────────────┐
│  顶部导航栏 (固定, 64px高)                         │
│  [Logo]  GEO-Tool  [关键词│写作│发布│平台] [设置]  │
├──────────────────────────────────────────────────┤
│                                                  │
│  主内容区 (每个 Tab 对应一个模块)                  │
│  - 响应式网格，max-width: 1200px                  │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Tab 1: 关键词提炼
```
┌────────────────────┐  ┌──────────────────────────┐
│  输入区              │  │  提炼结果区               │
│  [多行输入框]        │  │  关键词标签云 (可增删)     │
│  [提炼按钮]         │  │  语义关联网络图 (文字版)  │
│  [批量导入链接]     │  │  LLM友好提示词预览        │
└────────────────────┘  └──────────────────────────┘
```

### Tab 2: 文章写作
```
┌──────────────────────────────────────────────────────┐
│  控制面板                                              │
│  [关键词选择] [平台类型] [语气] [字数] [生成按钮]      │
├──────────────────────────────────────────────────────┤
│  文章编辑器 (textarea，支持 Markdown 预览)            │
│  [保存草稿] [复制] [发布到平台]                       │
├──────────────────────────────────────────────────────┤
│  历史文章列表 (可搜索、筛选、修改)                    │
└──────────────────────────────────────────────────────┘
```

### Tab 3: 文章管理
```
┌──────────────────────────────────────────────────────┐
│  筛选器 [平台] [日期范围] [状态] [搜索]               │
├──────────────────────────────────────────────────────┤
│  文章卡片列表                                          │
│  [标题] [平台标签] [状态] [发布时间] [操作按钮]        │
└──────────────────────────────────────────────────────┘
```

### Tab 4: 平台授权
```
┌──────────────────────────────────────────────────────┐
│  已授权平台卡片                                        │
│  [平台图标] [名称] [状态] [最近发布] [解绑]           │
├──────────────────────────────────────────────────────┤
│  添加新平台                                            │
│  [WordPress] [知乎] [微信公众号] [微博] [通用Webhook] │
│  [配置表单] [连接测试] [授权]                        │
└──────────────────────────────────────────────────────┘
```

---

## 4. Features & Interactions

### 4.1 关键词提炼模块

**输入方式:**
- 手动输入关键词（支持多行，逗号/换行分隔）
- 粘贴网页URL，自动抓取内容并提取关键词
- 批量导入（CSV格式，每行一个主题）

**提炼逻辑:**
1. 调用 AI API，将用户输入扩展为 LLM 友好的语义关键词组
2. 返回结构：核心词 × 相关实体 × 疑问词 × 场景词
3. 显示每个关键词的"搜索意图标签"（信息型/交易型/导航型）

**输出:**
- 关键词标签云（点击可选中/取消）
- 导出为 TXT/CSV
- 复制为 AI Prompt 格式

**交互细节:**
- 提炼中：输入框禁用 + 渐变边框动画
- 结果出现：标签逐个弹出（stagger 50ms）
- 悬停标签：显示完整解释 tooltip
- 点击标签：切换选中状态（选中态：蓝色边框 + 背景）

### 4.2 文章写作模块

**平台类型与文章特性:**

| 平台 | 语气 | 结构 | 重点 |
|------|------|------|------|
| 新闻平台 | 严肃客观 | 倒金字塔 + 5W1H | 事实、数据来源、权威引用 |
| 商业平台 | 第三方视角 | PEST/波特五力分析框架 | 专业洞察、行业趋势 |
| 自媒体平台 | 直击痛点 | AIDA框架 | 情感共鸣、案例故事、行动号召 |

**编辑器:**
- 左侧：原始编辑（Markdown）
- 右侧：实时渲染预览
- 底部：字数统计 + 阅读时间估算

**历史文章:**
- 本地存储（SQLite）
- 支持按平台/日期/关键词搜索
- 点击编辑，打开完整编辑模态框

### 4.3 平台发布模块

**WordPress:**
- REST API 认证（Application Password）
- 支持分类、标签、封面图
- 返回发布链接

**知乎:**
- OAuth 2.0 授权
- 发布回答/文章
- 返回文章 URL

**微信公众号:**
- AppID + AppSecret 获取 Access Token
- 草稿箱接口（需手动发布）
- 返回图文消息 ID

**微博:**
- OAuth 2.0 授权
- 发布长文
- 返回微博 URL

**通用 Webhook:**
- 用户配置 endpoint URL + HTTP method + headers
- POST 文章 JSON payload
- 支持自定义模板变量

**发布结果:**
- 成功：绿色提示 + 文章链接（可点击）
- 失败：红色提示 + 错误原因 + 重试按钮
- 发布历史列表（最新在上）

### 4.4 设置模块

- OpenAI API Key 配置（加密存储）
- 默认平台偏好
- 文章自动保存间隔
- 主题切换（深色/浅色）
- 数据导出/导入（JSON格式）

---

## 5. Component Inventory

### KeywordTag
- 默认：深灰背景，浅色文字
- 选中：蓝色边框，浅蓝背景
- 悬停：上浮 + tooltip
- 删除按钮（×）：悬停时显示

### ArticleCard
- 标题（截断2行）
- 平台标签（彩色小圆点）
- 状态徽章（草稿/已发布/发布失败）
- 操作：编辑 / 复制链接 / 删除
- 悬停：边框变亮

### PlatformBadge
- 16px 圆角图标 + 平台名
- 颜色对应平台品牌色

### PromptBox
- 深色代码块背景
- 一键复制按钮
- 语法高亮

### LoadingSpinner
- 三色脉冲圆点（蓝/绿/紫）
- 中心：当前状态文字

### ToastNotification
- 右上角弹出
- 自动消失（3秒）
- 类型：success(绿) / error(红) / info(蓝) / warning(橙)

---

## 6. Technical Approach

### 技术栈
- **运行时**: Node.js v22
- **后端框架**: Express.js
- **数据库**: SQLite（better-sqlite3）
- **前端**: Vanilla JS + CSS（无框架，单文件部署）
- **AI 调用**: OpenAI ChatGPT API（兼容其他 LLM API）
- **HTTP 客户端**: Node.js fetch / axios

### API 设计

```
POST /api/keywords/extract
  Body: { keywords: string[], mode: "brief" | "detailed" }
  Response: { keywords: Keyword[], suggestions: string[] }

GET  /api/articles
  Query: { platform?, status?, search?, limit?, offset? }
  Response: { articles: Article[], total: number }

POST /api/articles
  Body: { title, content, platform, keywords, status }
  Response: { article: Article }

PUT  /api/articles/:id
  Body: Article partial update
  Response: { article: Article }

DELETE /api/articles/:id
  Response: { success: true }

POST /api/articles/:id/publish
  Body: { platform: string, params: object }
  Response: { publishResult: PublishResult }

GET  /api/platforms
  Response: { platforms: Platform[] }

POST /api/platforms
  Body: { type, name, config }
  Response: { platform: Platform }

DELETE /api/platforms/:id
  Response: { success: true }

POST /api/platforms/:id/test
  Response: { success: boolean, message: string }

POST /api/settings
  Body: { key: string, value: any }
  Response: { success: true }

GET  /api/settings
  Response: { settings: object }
```

### 数据模型

```sql
CREATE TABLE keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL,
  category TEXT,          -- core|entity|question|scenario
  intent_tag TEXT,        -- informational|transactional|navigational
  source_keywords TEXT,   -- JSON array of source keywords
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT,
  platform TEXT,           -- news|commercial|social|manual
  keywords TEXT,           -- JSON array of keyword ids
  status TEXT DEFAULT 'draft',  -- draft|published|failed
  word_count INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE published (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER REFERENCES articles(id),
  platform_type TEXT,
  platform_name TEXT,
  publish_url TEXT,
  publish_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT,
  error_message TEXT
);

CREATE TABLE platforms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,      -- wordpress|zhihu|wechat|weibo|webhook
  name TEXT NOT NULL,
  config TEXT,             -- JSON (encrypted credentials)
  status TEXT DEFAULT 'active',
  last_used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

### 目录结构

```
GEO-Tool/
├── server.js           # Express 入口 + 静态文件
├── package.json
├── database.js         # SQLite 初始化 + 封装
├── routes/
│   ├── keywords.js     # 关键词 API
│   ├── articles.js      # 文章 CRUD + 发布
│   ├── platforms.js     # 平台管理
│   └── settings.js      # 设置管理
├── services/
│   ├── llm.js           # LLM 调用封装
│   ├── publisher.js     # 各平台发布器
│   └── keywordExtractor.js
├── public/
│   ├── index.html       # SPA 入口
│   ├── styles.css       # 所有样式
│   └── app.js           # 前端逻辑
└── data/
    └── geo.db           # SQLite 数据库文件
```

### 安全措施
- API Key 使用 AES-256-GCM 加密存储（密钥从环境变量注入）
- 平台密码凭证加密后存储
- Webhook 不记录明文 secret
- CSP 安全策略
