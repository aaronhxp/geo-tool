'use strict';

const axios = require('axios');
const FormData = require('form-data');
const { Readable } = require('stream');
const db = require('../database');

// ─── Platform Registry ───────────────────────────────────────────────────────
const publishers = {

  // ── WordPress ─────────────────────────────────────────────────────────────
  wordpress: {
    async publish(article, config) {
      const { siteUrl, username, appPassword, categories = [], tags = [] } = config;

      if (!siteUrl || !username || !appPassword) {
        throw new Error('WordPress 配置不完整，请检查站点地址、用户名和 App 密码是否已填写');
      }

      // Test authentication first
      let authOk = false;
      let userInfo = null;
      try {
        const meRes = await axios.get(`${siteUrl}/wp-json/wp/v2/users/me`, {
          auth: { username, password: appPassword },
          timeout: 10000
        });
        authOk = true;
        userInfo = meRes.data;
      } catch (e) {
        if (e.response?.status === 401 || e.response?.status === 403) {
          throw new Error('App 密码无效或已过期。请到 WordPress「用户 → 个人资料 → 应用密码」重新生成，并更新到本系统。');
        }
        throw new Error(`WordPress 连接失败：${e.message}`);
      }

      // Fetch categories to get IDs
      let categoryIds = [];
      if (categories.length > 0) {
        try {
          const catRes = await axios.get(`${siteUrl}/wp-json/wp/v2/categories?per_page=100`, {
            auth: { username, password: appPassword },
            timeout: 10000
          });
          const existing = catRes.data;
          categoryIds = categories.map(c => {
            const found = existing.find(e => e.name === c || e.slug === c);
            return found ? found.id : null;
          }).filter(Boolean);
        } catch {}
      }

      const payload = {
        title: article.title,
        content: article.content,
        status: 'publish',
        categories: categoryIds,
        tags: tags,
        date: new Date().toISOString()
      };

      let response;
      try {
        response = await axios.post(
          `${siteUrl}/wp-json/wp/v2/posts`,
          payload,
          {
            auth: { username, password: appPassword },
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
          }
        );
      } catch (e) {
        const errData = e.response?.data || {};
        const errMsg = errData.message || errData.code || e.message;
        if (e.response?.status === 401 || e.response?.status === 403) {
          throw new Error('App 密码无效或已过期。请到 WordPress「用户 → 个人资料 → 应用密码」重新生成。');
        }
        throw new Error(`WordPress 发布失败：${errMsg}（HTTP ${e.response?.status || 'unknown'}）`);
      }

      const postUrl = response.data.link;
      if (!postUrl) {
        throw new Error('文章已创建但未返回访问链接，可能是站点限制了直接发布。请登录 WordPress 后台确认文章状态。');
      }

      return {
        success: true,
        url: postUrl,
        platformPostId: String(response.data.id),
        message: `发布成功！文章地址：${postUrl}`
      };
    },

    async test(config) {
      try {
        const { siteUrl, username, appPassword } = config;
        const res = await axios.get(`${siteUrl}/wp-json/wp/v2/users/me`, {
          auth: { username, password: appPassword },
          timeout: 10000
        });
        return { success: true, message: `已连接，用户：${res.data.name}` };
      } catch (e) {
        const msg = e.response?.data?.message || e.message;
        return { success: false, message: `连接失败：${msg}` };
      }
    }
  },

  // ── Zhihu ──────────────────────────────────────────────────────────────────
  zhihu: {
    async publish(article, config) {
      const { accessToken } = config;
      if (!accessToken) throw new Error('缺少知乎 Access Token');

      // Zhihu API requires special formatting
      // Note: Zhihu's API is restricted; we use their draft API if available
      const content = article.content
        .replace(/#{1,6}\s/g, '') // Remove markdown headers for cleaner output
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1');

      const payload = {
        title: article.title,
        content: content,
        content_type: 'article',
       版权_声明: '1',
        comment_type: '1'
      };

      try {
        const response = await axios.post(
          'https://www.zhihu.com/api/v4/articles',
          payload,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'User-Agent': 'GEO-Tool/1.0'
            },
            timeout: 15000
          }
        );
        return {
          success: true,
          url: response.data.url,
          platformPostId: String(response.data.id),
          message: '发布成功'
        };
      } catch (e) {
        // If API fails (common with Zhihu), return instructions
        return {
          success: false,
          url: null,
          message: `知乎 API 暂不可用（${e.response?.status || e.message}）。请手动复制文章内容到知乎编辑器发布。`,
          manual: true
        };
      }
    },

    async test(config) {
      try {
        const res = await axios.get('https://www.zhihu.com/api/v4/user', {
          headers: { 'Authorization': `Bearer ${config.accessToken}` },
          timeout: 10000
        });
        return { success: true, message: `已连接，用户：${res.data.name}` };
      } catch (e) {
        return { success: false, message: `Token 无效：${e.message}` };
      }
    }
  },

  // ── WeChat Official Account ─────────────────────────────────────────────────
  wechat: {
    async publish(article, config) {
      const { appId, appSecret, coverUrl } = config;

      // Step 1: Get access token
      const tokenRes = await axios.get(
        'https://api.weixin.qq.com/cgi-bin/token',
        { params: { grant_type: 'client_credential', appid: appId, secret: appSecret }, timeout: 10000 }
      );
      const accessToken = tokenRes.data.access_token;
      if (!accessToken) throw new Error(`获取 Access Token 失败：${tokenRes.data.errmsg}`);

      // Step 2: Get thumb_media_id
      let thumbMediaId = config.thumb_media_id || '';

      if (!thumbMediaId) {
        // Try to find a cover image: user config > article.cover_image > article images > placeholder
        const coverImageUrl = coverUrl || article.cover_image || this._extractFirstImage(article.content);

        if (coverImageUrl) {
          console.log(`[WeChat] Uploading cover image: ${coverImageUrl}`);
          const uploadResult = await this._uploadPermanentImage(accessToken, coverImageUrl);
          if (uploadResult.media_id) {
            thumbMediaId = uploadResult.media_id;
            console.log(`[WeChat] Cover uploaded, media_id: ${thumbMediaId}`);
          } else if (uploadResult.errcode) {
            throw new Error(`封面上传失败：${uploadResult.errmsg}（错误码：${uploadResult.errcode}）`);
          }
        } else {
          // No cover found — use a placeholder image (picsum with article title as seed)
          const seed = encodeURIComponent((article.title || 'default').substring(0, 20));
          const placeholderUrl = `https://picsum.photos/seed/${seed}/900/500`;
          console.log(`[WeChat] No cover image found, using placeholder: ${placeholderUrl}`);
          const uploadResult = await this._uploadPermanentImage(accessToken, placeholderUrl);
          if (uploadResult.media_id) {
            thumbMediaId = uploadResult.media_id;
            console.log(`[WeChat] Placeholder uploaded, media_id: ${thumbMediaId}`);
          } else if (uploadResult.errcode) {
            throw new Error(`封面图获取失败：${uploadResult.errmsg}（错误码：${uploadResult.errcode}）。建议在平台配置中手动填写「封面图 URL」。`);
          }
        }
      }

      if (!thumbMediaId) {
        throw new Error(
          '缺少封面图：微信公众号草稿必须上传封面图片。请在平台配置中填写「封面图 URL」，或确保文章内容中包含网络图片。'
        );
      }

      // Step 3: Create draft article
      const htmlContent = this._markdownToHtml(article.content);
      const plainText = article.content.replace(/[#*`\[\]]/g, '').replace(/!\[.*?\]\(.*?\)/g, '').replace(/\n+/g, ' ').trim();

      // digest 字段限制 120 字节（中文每字 3 字节），按字节截断
      const truncateByte = (str, maxBytes = 120) => {
        let bytes = 0;
        let cut = '';
        for (const ch of str) {
          const b = Buffer.byteLength(ch, 'utf8');
          if (bytes + b > maxBytes) { cut += '...'; break; }
          bytes += b;
          cut += ch;
        }
        return cut;
      };

      const draftPayload = {
        articles: [{
          title: article.title,
          author: config.author || '',
          digest: truncateByte(plainText, 120),
          content: htmlContent,
          content_source_url: '',
          thumb_media_id: thumbMediaId,
          need_open_comment: 1,
          only_fans_can_comment: 0
        }]
      };

      // Step 4: Submit for immediate publication (free_publish works for most verified accounts)
      // Falls back to draft/add if free_publish fails (some account types don't support it)
      let published = false;
      let publishMsg = '';

      const pubPayload = { articles: draftPayload.articles };

      const pubRes = await axios.post(
        `https://api.weixin.qq.com/cgi-bin/freepublish/submit?access_token=${accessToken}`,
        pubPayload,
        { timeout: 15000 }
      );

      if (pubRes.data.errcode === 0) {
        published = true;
        publishMsg = '发布成功！文章已直接推送到所有粉丝';
      } else if (pubRes.data.errcode === 200002 || pubRes.data.errcode === -1) {
        // free_publish not supported (some account types) — fall back to draft
        const draftRes = await axios.post(
          `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${accessToken}`,
          draftPayload,
          { timeout: 15000 }
        );
        if (draftRes.data.errcode && draftRes.data.errcode !== 0) {
          throw new Error(`发布失败：${draftRes.data.errmsg}（错误码：${draftRes.data.errcode}）`);
        }
        publishMsg = `已存入草稿箱（media_id: ${thumbMediaId}），请在微信公众号后台手动发布`;
      } else {
        throw new Error(`发布失败：${pubRes.data.errmsg}（错误码：${pubRes.data.errcode}）`);
      }

      return {
        success: true,
        url: null,
        platformPostId: thumbMediaId,
        message: publishMsg,
        draft: !published
      };
    },

    /** Upload image from URL to WeChat permanent material and return media_id */
    async _uploadPermanentImage(accessToken, imageUrl) {
      try {
        const imageRes = await axios.get(imageUrl, {
          responseType: 'arraybuffer',
          timeout: 20000,
          maxRedirects: 5,
          headers: { 'User-Agent': 'GEO-Tool/1.0' }
        });
        const buffer = Buffer.from(imageRes.data);

        // Determine MIME type from buffer magic bytes or URL extension
        const ext = (imageUrl.split('?')[0].match(/\.(\w+)$/i) || [])[1] || 'jpg';
        const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
        const mime = mimeMap[ext.toLowerCase()] || 'image/jpeg';
        const filename = `cover.${ext}`;

        const form = new FormData();
        form.append('media', buffer, { filename, contentType: mime });
        form.append('type', 'image');

        const uploadRes = await axios.post(
          `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${accessToken}&type=image`,
          form,
          {
            headers: { ...form.getHeaders() },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: 20000
          }
        );

        return uploadRes.data;
      } catch (e) {
        const data = e.response?.data;
        if (data?.errcode) return data;
        throw new Error(`封面图下载或上传失败：${e.message}`);
      }
    },

    /** Extract first image URL from markdown content */
    _extractFirstImage(content) {
      const match = content.match(/!\[.*?\]\((.*?)\)/);
      return match ? match[1] : null;
    },

    _markdownToHtml(md) {
      return md
        .replace(/^#{1,6}\s+(.+)$/gm, (_, t) => `<h${t.length}>${t}</h${t.length}>`)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/^(.+)$/gm, (line) => line.startsWith('<') ? line : `<p>${line}</p>`);
    },

    async test(config) {
      try {
        const res = await axios.get(
          'https://api.weixin.qq.com/cgi-bin/token',
          { params: { grant_type: 'client_credential', appid: config.appId, secret: config.appSecret }, timeout: 10000 }
        );
        if (res.data.access_token) {
          return { success: true, message: 'AppID 和 AppSecret 验证通过' };
        }
        return { success: false, message: res.data.errmsg };
      } catch (e) {
        return { success: false, message: `验证失败：${e.message}` };
      }
    }
  },

  // ── Weibo ──────────────────────────────────────────────────────────────────
  weibo: {
    async publish(article, config) {
      const { accessToken } = config;

      // Weibo long text posts
      const payload = {
        access_token: accessToken,
        longtext: true,
        title: article.title,
        content: article.content.substring(0, 2000)
      };

      try {
        const response = await axios.post(
          'https://api.weibo.com/proxy/article/publish.json',
          payload,
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 15000
          }
        );
        const data = response.data;
        if (data.id) {
          return {
            success: true,
            url: `https://weibo.com/ttarticle/p/show?id=${data.id}`,
            platformPostId: data.id,
            message: '发布成功'
          };
        }
        throw new Error(data.err_message || JSON.stringify(data));
      } catch (e) {
        return {
          success: false,
          url: null,
          message: `微博 API 错误（${e.response?.status || e.message}）。请手动复制文章到微博发布。`,
          manual: true
        };
      }
    },

    async test(config) {
      try {
        const res = await axios.get('https://api.weibo.com/2/users/show.json', {
          params: { access_token: config.accessToken, uid: '0' },
          timeout: 10000
        });
        return { success: true, message: `已连接，用户：${res.data.screen_name}` };
      } catch (e) {
        return { success: false, message: `Token 无效：${e.message}` };
      }
    }
  },

  // ── 百度百家号 ────────────────────────────────────────────────────────────
  baijiahao: {
    async publish(article, config) {
      const { appId, appToken, coverUrl } = config;
      
      if (!appId || !appToken) {
        throw new Error('百家号配置不完整，请填写 AppID 和 AppToken');
      }

      // 百家号内容需要 HTML 格式
      const htmlContent = this._markdownToHtml(article.content);
      
      // 提取第一张图片作为封面
      let coverImages = [];
      if (coverUrl) {
        coverImages.push(coverUrl);
      } else {
        const firstImg = this._extractFirstImage(article.content);
        if (firstImg) coverImages.push(firstImg);
      }

      const payload = {
        app_id: appId,
        app_token: appToken,
        title: article.title,
        content: htmlContent,
        cover_images: coverImages,
        is_original: 1,
        article_type: 'news'
      };

      try {
        // 百家号 API 地址（实际使用时需要替换为正确的 API 端点）
        const response = await axios.post(
          'https://baijiahao.baidu.com/builderinner/open/resource/article/publish',
          payload,
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 20000
          }
        );
        
        if (response.data.errno === 0) {
          return {
            success: true,
            url: `https://baijiahao.baidu.com/s?id=${response.data.data.article_id}`,
            platformPostId: String(response.data.data.article_id),
            message: '发布成功！文章已提交到百家号审核'
          };
        }
        
        // API 返回错误
        throw new Error(`百家号发布失败：${response.data.errmsg || '未知错误'}`);
        
      } catch (e) {
        // 百家号 API 限制较多，降级为手动发布提示
        return {
          success: false,
          url: null,
          message: `百家号 API 暂不可用（${e.response?.status || e.message}）。请手动复制文章内容到百家号后台发布。`,
          manual: true,
          manualUrl: 'https://baijiahao.baidu.com/builder/author/workbench/content/article'
        };
      }
    },

    _markdownToHtml(md) {
      return md
        .replace(/^#{1,6}\s+(.+)$/gm, (_, t) => `<h2>${t}</h2>`)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" />')
        .replace(/\n\n/g, '</p><p>')
        .replace(/^(.+)$/gm, (line) => line.startsWith('<') ? line : `<p>${line}</p>`);
    },

    _extractFirstImage(content) {
      const match = content.match(/!\[.*?\]\((.*?)\)/);
      return match ? match[1] : null;
    },

    async test(config) {
      if (!config.appId || !config.appToken) {
        return { success: false, message: '缺少 AppID 或 AppToken' };
      }
      // 百家号没有简单的测试接口，这里只做格式校验
      return { success: true, message: '配置格式正确（百家号 API 限制，无法在线验证）' };
    }
  },

  // ── 搜狐个人自媒体 ─────────────────────────────────────────────────────────
  sohu: {
    async publish(article, config) {
      const { passport, password, coverUrl } = config;
      
      if (!passport || !password) {
        throw new Error('搜狐配置不完整，请填写搜狐通行证账号和密码');
      }

      // 搜狐自媒体内容需要纯文本或简单 HTML
      const plainContent = article.content
        .replace(/#{1,6}\s/g, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/!\[.*?\]\((.*?)\)/g, '<img src="$1" />')
        .replace(/\n+/g, '<br>');

      // 提取封面图
      let coverImage = coverUrl || this._extractFirstImage(article.content) || '';

      const payload = {
        title: article.title,
        content: plainContent,
        cover: coverImage,
        category: '科技', // 默认分类，可配置
        tags: Array.isArray(article.keywords) ? article.keywords : []
      };

      try {
        // 搜狐自媒体 API（实际使用时需要替换为正确的 API 端点）
        // 注意：搜狐没有公开的发布 API，这里使用模拟请求
        const response = await axios.post(
          'https://mp.sohu.com/api/v2/article/publish',
          payload,
          {
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Basic ${Buffer.from(`${passport}:${password}`).toString('base64')}`
            },
            timeout: 20000
          }
        );
        
        if (response.data.code === 200) {
          return {
            success: true,
            url: response.data.data.url,
            platformPostId: String(response.data.data.id),
            message: '发布成功！'
          };
        }
        
        throw new Error(`搜狐发布失败：${response.data.message || '未知错误'}`);
        
      } catch (e) {
        // 搜狐没有公开 API，降级为手动发布
        return {
          success: false,
          url: null,
          message: `搜狐自媒体暂不支持自动发布（${e.response?.status || e.message}）。请手动复制文章内容到搜狐后台发布。`,
          manual: true,
          manualUrl: 'https://mp.sohu.com/main/home/index.action'
        };
      }
    },

    _extractFirstImage(content) {
      const match = content.match(/!\[.*?\]\((.*?)\)/);
      return match ? match[1] : null;
    },

    async test(config) {
      if (!config.passport || !config.password) {
        return { success: false, message: '缺少搜狐通行证账号或密码' };
      }
      // 搜狐没有测试接口
      return { success: true, message: '配置格式正确（搜狐 API 限制，无法在线验证）' };
    }
  },

  // ── Generic Webhook ─────────────────────────────────────────────────────────
  webhook: {
    async publish(article, config) {
      const { url, method = 'POST', headers = {}, bodyTemplate } = config;

      let body;
      if (bodyTemplate) {
        // Support template variables: {{title}}, {{content}}, {{keywords}}
        body = bodyTemplate
          .replace(/\{\{title\}\}/g, article.title)
          .replace(/\{\{content\}\}/g, article.content)
          .replace(/\{\{keywords\}\}/g, Array.isArray(article.keywords) ? article.keywords.join(', ') : article.keywords || '');
        try { body = JSON.parse(body); } catch {}
      } else {
        body = { title: article.title, content: article.content, keywords: article.keywords };
      }

      const requestConfig = {
        method: method.toUpperCase(),
        url,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        timeout: 20000
      };
      if (['POST', 'PUT', 'PATCH'].includes(requestConfig.method)) {
        requestConfig.data = body;
      }

      const response = await axios(requestConfig);
      return {
        success: response.status >= 200 && response.status < 300,
        url: response.headers.location || null,
        platformPostId: null,
        message: `Webhook 响应 ${response.status}`
      };
    },

    async test(config) {
      try {
        const res = await axios({
          method: 'POST',
          url: config.url,
          data: { test: true, timestamp: Date.now() },
          headers: { 'Content-Type': 'application/json', ...config.headers },
          timeout: 10000
        });
        return { success: true, message: `Webhook 可达，响应状态：${res.status}` };
      } catch (e) {
        return { success: false, message: `Webhook 不可达：${e.message}` };
      }
    }
  }
};

// ─── Main Publisher Interface ────────────────────────────────────────────────
async function publishArticle(articleId, platformId) {
  const article = db.getArticleById(articleId);
  if (!article) throw new Error('文章不存在');

  const platform = db.getPlatformById(platformId);
  if (!platform) throw new Error('平台不存在');

  const config = platform.config || {};
  const publisher = publishers[platform.type];

  if (!publisher) throw new Error(`不支持的平台类型：${platform.type}`);

  let result;
  try {
    result = await publisher.publish(article, config);

    // Record the publish attempt
    db.recordPublish({
      articleId,
      platformId,
      platformType: platform.type,
      url: result.url || null,
      status: result.success ? 'success' : 'failed',
      message: result.success ? null : result.message
    });

    return { ...result };

  } catch (e) {
    db.recordPublish({
      articleId,
      platformId,
      platformType: platform.type,
      url: null,
      status: 'error',
      message: e.message
    });
    throw e;
  }
}

async function testPlatform(platformId) {
  const platform = db.getPlatformById(platformId);
  if (!platform) throw new Error('平台不存在');
  const config = platform.config || {};
  const publisher = publishers[platform.type];
  if (!publisher) throw new Error(`不支持的平台类型：${platform.type}`);
  return publisher.test(config);
}

module.exports = { publishers, publishArticle, testPlatform };
