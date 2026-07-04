# GEO-Tool

> GEO（Generative Engine Optimization）— AI 时代的内容优化与多平台发布工具

**访问地址：** http://localhost:3000

---

## 功能概览

### 1. 关键词提炼
- 输入核心主题，AI 自动提炼 **LLM 友好**的语义关键词
- 四维分类：核心词 / 实体词 / 疑问词 / 场景词
- 意图标签：信息型 / 交易型 / 导航型
- 质量评分（0-100）
- 支持批量导入（txt/csv）
- 自动生成优化的 Prompt 格式

### 2. 文章写作
- 三种平台风格：新闻报道 / 商业分析 / 自媒体
- 可选目标字数：500 / 800 / 1200 / 2000 字
- 实时 Markdown 预览
- AI 润色功能
- 一键保存到本地数据库

### 3. 多平台发布
支持平台：
- **WordPress**（应用密码认证）
- **知乎**
- **微信公众号**（草稿箱模式）
- **微博**
- **通用 Webhook**（支持自定义模板和 Headers）

### 4. 文章管理
- 搜索与筛选（平台 / 状态）
- 已发布历史记录
- 一键复制 / 重新发布

---

## 快速开始

### 1. 安装依赖

```bash
cd geo-tool
npm install
```

> 注：如果系统 npm 因环境原因不可用，使用 Node.js 直接调用 npm-cli.js：
> ```bash
> node "E:\QClaw\v0.2.31.600\resources\openclaw\config\npm-tools\node_modules\npm\bin\npm-cli.js" install
> ```

### 2. 配置 API Key

首次使用需配置 OpenAI API Key（或其他兼容端点）：

```
访问 http://localhost:3000
→ 切换到「设置」标签
→ 填入 API Key 并保存
```

支持第三方 OpenAI 兼容 API（如硅基流动、Together AI 等），填入自定义端点 URL 即可。

### 3. 启动服务

```bash
node server.js
# 或开发模式（热重载）
node --watch server.js
```

---

## 项目结构

```
geo-tool/
├── server.js              # Express 服务入口
├── database.js             # SQLite 数据库（sql.js）
├── package.json
├── SPEC.md                 # 详细规格文档
├── public/
│   ├── index.html          # 单页应用入口
│   ├── styles.css          # 样式（GitHub Dark 主题）
│   └── app.js              # 前端逻辑
├── services/
│   ├── llm.js             # OpenAI API 封装
│   └── publisher.js        # 多平台发布器
└── routes/
    ├── keywords.js
    ├── articles.js
    ├── platforms.js
    └── settings.js
```

---

## 技术栈

| 层次 | 技术 |
|------|------|
| 前端 | 原生 HTML/CSS/JS + Lucide 图标 |
| 后端 | Node.js + Express |
| 数据库 | sql.js（SQLite WASM，无需编译）|
| AI | OpenAI API（GPT-4o / GPT-4o-mini）或兼容端点 |
| 发布 | WordPress REST API / 知乎 / 微信公众号 / 微博 / Webhook |

---

## 环境要求

- Node.js 18+
- 支持 OpenAI API 或任意 OpenAI 兼容 API
