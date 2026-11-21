'use strict';
/* Hugluno 快照版 · 常量。这里是整个程序里「会指向外部网站的链接」的唯一来源（只是链接：用户点了才会在浏览器里打开，程序自己不会访问它们）。 */
window.HUG = Object.freeze({
  version: '1.2.0',
  edition: 'snapshot',
  links: Object.freeze({
    full: 'https://hugluno.c0curic.top',          // 在线订阅服务完整版
    help: 'https://support.c0curic.top',          // 帮助中心
    snapshotHelp: 'https://support.c0curic.top/max/snapshot',
    deployHelp: 'https://support.c0curic.top/max/snapshot-deploy',
    safetyHelp: 'https://support.c0curic.top/max/settings/install-safety',
    privacy: 'https://c0curic.top/privacy',
    repo: 'https://github.com/C0curicStudio/Hugluno',
    releases: 'https://github.com/C0curicStudio/Hugluno/releases',
  }),
  // 常用的 OpenAI 兼容服务（只是预填地址；密钥只发给你选的这一家）
  providers: Object.freeze([
    ['openai', 'OpenAI', 'https://api.openai.com/v1'],
    ['gemini', 'Gemini', 'https://generativelanguage.googleapis.com/v1beta/openai'],
    ['xai', 'Grok', 'https://api.x.ai/v1'],
    ['deepseek', 'DeepSeek', 'https://api.deepseek.com'],
    ['mistral', 'Mistral', 'https://api.mistral.ai/v1'],
    ['qwen', '通义千问 / Qwen', 'https://dashscope.aliyuncs.com/compatible-mode/v1'],
    ['moonshot', 'Kimi', 'https://api.moonshot.cn/v1'],
    ['zhipu', '智谱 GLM', 'https://open.bigmodel.cn/api/paas/v4'],
    ['doubao', '豆包 / Doubao', 'https://ark.cn-beijing.volces.com/api/v3'],
    ['openrouter', 'OpenRouter', 'https://openrouter.ai/api/v1'],
    ['ollama', 'Ollama (local)', 'http://localhost:11434/v1'],
    ['lmstudio', 'LM Studio (local)', 'http://localhost:1234/v1'],
  ]),
});
