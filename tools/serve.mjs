#!/usr/bin/env node
/* 零依赖本地静态服务器：把 app/ 放到 http://127.0.0.1:8080 。默认只监听本机（127.0.0.1），别的电脑连不上。
   用法：node tools/serve.mjs [--port 8080] [--host 127.0.0.1] [--dir app]
   只读：只响应 GET / HEAD，不写任何文件，不发出任何网络请求，没有日志外传。 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', arg('dir', 'app'));
const host = arg('host', '127.0.0.1'), port = +arg('port', 8080);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

export function createServer() {
  return http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
    let p; try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
    if (p.endsWith('/')) p += 'index.html';
    const f = path.resolve(root, '.' + p);
    if (f !== root && !f.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); } // 不许跳出 app/
    fs.stat(f, (e, st) => {
      if (e || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-cache',
        'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'SAMEORIGIN', ...(f.endsWith('.woff2') ? { 'access-control-allow-origin': '*' } : {}), 'cross-origin-opener-policy': 'same-origin' });
      if (req.method === 'HEAD') return res.end(); fs.createReadStream(f).pipe(res);
    });
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!fs.existsSync(path.join(root, 'index.html'))) { console.error('找不到 ' + path.join(root, 'index.html')); process.exit(1); }
  createServer().listen(port, host, () => {
    console.log(`Hugluno 快照版  →  http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}/`);
    if (host !== '127.0.0.1' && host !== 'localhost') console.log('⚠ 你让服务器监听了 ' + host + '：同一网络里的其他设备也能打开它。只在可信网络里这样做。');
    console.log('按 Ctrl+C 停止。');
  });
}
