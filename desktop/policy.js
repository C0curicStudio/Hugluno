'use strict';
/* 桌面版的联网与链接策略（纯函数，tests/policy.test.mjs 直接测）。主进程里每一个对外请求都要过这里。
   原则：默认一律拦截；只放行 ① 程序自己的 hug:// 页面 ② 你在设置里填的模型接口那一个地址 ③ 你在「接口调试」里逐次确认的那一次。 */
const path = require('node:path');

const isLoopback = h => /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|::1)$/i.test(h);
const isPrivateLan = h => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);

/** 模型接口地址：https 任意；http 只许本机 / 局域网（否则密钥会明文走公网） */
function validateProvider(raw) {
  let u; try { u = new URL(String(raw || '').trim()); } catch { return { ok: false, reason: 'invalid-url' }; }
  if (u.username || u.password) return { ok: false, reason: 'credentials-in-url' };
  if (u.protocol === 'https:') return { ok: true, origin: u.origin };
  if (u.protocol === 'http:' && (isLoopback(u.hostname) || isPrivateLan(u.hostname))) return { ok: true, origin: u.origin };
  return { ok: false, reason: u.protocol === 'http:' ? 'http-public' : 'bad-protocol' };
}

/** 一个请求能不能放行。state = { providers:Set<origin>, once:Map<origin,到期毫秒> } */
function decide(rawUrl, state, now = Date.now()) {
  let u; try { u = new URL(rawUrl); } catch { return { allow: false, host: '?' }; }
  const p = u.protocol;
  if (p === 'hug:' || p === 'data:' || p === 'blob:' || p === 'devtools:' || p === 'about:') return { allow: true, host: p, local: true };
  if (p === 'http:' || p === 'https:' || p === 'ws:' || p === 'wss:') {
    const origin = u.origin.replace(/^ws/, 'http');
    if (state.providers.has(u.origin) || state.providers.has(origin)) return { allow: true, host: u.host };
    const exp = state.once.get(u.origin); if (exp && exp > now) return { allow: true, host: u.host, once: true };
    return { allow: false, host: u.host };
  }
  return { allow: false, host: p }; // file: / ftp: / 其它协议一律不放
}

const TRUSTED_LINK_HOSTS = ['hugluno.c0curic.top', 'support.c0curic.top', 'c0curic.top', 'www.c0curic.top', 'github.com'];
/** 点链接时能不能交给系统浏览器：只许 https，不带账号密码；不在白名单的地址要先弹窗问 */
function externalLink(raw) {
  let u; try { u = new URL(raw); } catch { return { ok: false }; }
  if (u.protocol !== 'https:' || u.username || u.password) return { ok: false };
  return { ok: true, url: u.href, host: u.host, trusted: TRUSTED_LINK_HOSTS.includes(u.hostname) };
}

/** hug://app/<path> → app 目录里的文件；跳出目录一律返回 null */
function resolveAppFile(appDir, urlPath) {
  let p; try { p = decodeURIComponent(urlPath); } catch { return null; }
  if (p.includes('\0')) return null;
  if (p === '/' || p === '') p = '/index.html';
  const f = path.resolve(appDir, '.' + p);
  return f === appDir || f.startsWith(appDir + path.sep) ? f : null;
}

module.exports = { validateProvider, decide, externalLink, resolveAppFile, isLoopback, isPrivateLan, TRUSTED_LINK_HOSTS };
