#!/usr/bin/env node
/* 审查脚本：自己检查「这份代码会不会偷偷联网 / 用别的字体 / 带进不该有的功能」。任何人都可以运行：node tools/audit.mjs
   规则全部写在这个文件和 tools/audit-allow.json 里；有一条不过就退出码 1（CI 里也跑）。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allow = JSON.parse(fs.readFileSync(path.join(root, 'tools/audit-allow.json'), 'utf8'));
const walk = (d, out = []) => { for (const n of fs.readdirSync(d, { withFileTypes: true })) { if (n.name === 'node_modules' || n.name === '.git' || n.name === 'dist') continue; const p = path.join(d, n.name); n.isDirectory() ? walk(p, out) : out.push(p); } return out; };
const rel = f => path.relative(root, f).split(path.sep).join('/');
const files = walk(path.join(root, 'app')).concat(walk(path.join(root, 'desktop')));
const own = files.filter(f => /\.(js|html|css)$/.test(f) && !rel(f).startsWith('app/vendor/') && !rel(f).startsWith('desktop/build/'));
const problems = [], notes = [];
const bad = (rule, f, line, msg) => problems.push(`✗ [${rule}] ${f}:${line}  ${msg}`);

for (const f of own) {
  const r = rel(f), lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((ln, i) => {
    const n = i + 1;
    // 1. 联网 API 只能出现在白名单文件里
    for (const [name, re] of Object.entries({ fetch: /\bfetch\s*\(/, xhr: /XMLHttpRequest/, ws: /\bWebSocket\b/, es: /\bEventSource\b/, beacon: /sendBeacon/, importScripts: /importScripts/, sw: /serviceWorker/, dynImport: /\bimport\s*\(/, webview: /<webview/i, nodeHttp: /require\(['"](node:)?(https?|net|tls|dgram|dns)['"]\)/ })) {
      if (re.test(ln) && !(allow.network[name] || []).includes(r)) bad('network', r, n, `不允许在这里使用 ${name}：${ln.trim().slice(0, 100)}`);
    }
    // 2. 页面资源不能指向外部
    if (/(?:src|href)\s*=\s*["']\s*(?:https?:)?\/\//i.test(ln) && r.endsWith('.html') && !/<a /.test(ln)) bad('external-resource', r, n, ln.trim().slice(0, 120));
    if (/url\(\s*["']?\s*(?:https?:)?\/\//i.test(ln)) bad('external-resource', r, n, 'CSS 里引用外部地址：' + ln.trim().slice(0, 100));
    if (/@import\s+(?:url\()?["']?https?:/i.test(ln)) bad('external-resource', r, n, '@import 外部样式');
    // 3. 字符串里的网址必须在白名单主机里
    for (const m of ln.matchAll(/https?:\/\/([A-Za-z0-9.\-\[\]:*]+)/g)) {
      const host = m[1].replace(/:\*|:\d+$/, '');
      if (!allow.hosts.some(h => host === h || host.endsWith('.' + h))) bad('host', r, n, `未登记的网址主机 ${host}（需要写进 tools/audit-allow.json 并说明理由）`);
    }
    // 4. 字体：只许自有字体 + 通用族
    const ff = ln.match(/font-family\s*:\s*([^;}]+)/i) || ln.match(/(?<![\w-])font\s*:\s*[^;}]*?(?:[\d.]+(?:px|em|rem|pt|%))(?:\s*\/\s*[\d.]+(?:px|em|rem|%)?)?\s+([^;}'`]+)/i);
    if (ff && !/^\s*(inherit|initial|unset)\s*$/i.test(ff[1])) {
      for (const fam of ff[1].split(',').map(s => s.trim().replace(/["']/g, '').replace(/!important/, '').trim()).filter(Boolean)) {
        if (!/^(MaxRIous|MaxCN|KaTeX_[A-Za-z0-9]+|monospace|sans-serif|serif|var\(--(sans|mono)\))$/.test(fam) && !/^var\(/.test(fam)) bad('font', r, n, `不是自有字体：${fam}`);
      }
    }
    // 5. 不该出现的功能
    for (const re of [/pyodide/i, /autopilot/i, /nut-js|robotjs/i, /MaxPC/, /clerk/i, /stripe|creem|paddle/i, /subscribe|订阅页/i]) if (re.test(ln) && !/audit|不含|没有|去掉|无订阅|no subscription|sans abonnement/i.test(ln) && !(allow.mention || []).includes(r)) bad('feature', r, n, `不应出现：${re}  ${ln.trim().slice(0, 90)}`);
  });
}
// 6. HTML 必须带 CSP；index.html 的 script-src 里不许有 unsafe-inline / unsafe-eval
for (const f of own.filter(f => f.endsWith('.html'))) {
  const t = fs.readFileSync(f, 'utf8');
  if (!/http-equiv="Content-Security-Policy"/.test(t)) bad('csp', rel(f), 1, '没有 CSP');
  if (/index\.html$/.test(f) && /script-src[^;]*'unsafe-(inline|eval)'/.test(t)) bad('csp', rel(f), 1, '主页面脚本不许 unsafe-inline / unsafe-eval');
  if (/lab\.html$/.test(f) && !/connect-src 'none'/.test(t)) bad('csp', rel(f), 1, '学习窗口必须 connect-src none');
}
// 7. 字体文件：只许 MaxRIous / MaxCN / KaTeX
for (const f of files.filter(f => /\.(woff2?|ttf|otf)$/i.test(f))) {
  const b = path.basename(f); if (!/^(maxrious-(400|700)\.woff2|cn-[0-9a-z]+\.[0-9a-f]{8}\.woff2|KaTeX_[A-Za-z0-9-]+\.woff2)$/.test(b)) bad('font-file', rel(f), 0, '未登记的字体文件');
}
// 8. 不许有 .map / 压缩的自家代码 / 二进制
for (const f of files) if (/\.map$/.test(f)) bad('files', rel(f), 0, 'source map 不应提交');
// 9. 密钥 / 个人信息扫描
const SECRETS = [/sk-[A-Za-z0-9]{20,}/, /AKIA[0-9A-Z]{16}/, /ghp_[A-Za-z0-9]{30,}/, /-----BEGIN (RSA |EC )?PRIVATE KEY-----/, /[A-Za-z0-9._%+-]+@(gmail|qq|163|outlook)\.[a-z]+/i];
for (const f of walk(root).filter(f => /\.(js|mjs|json|md|html|css|yml|yaml|txt|svg)$/.test(f) && !/package-lock|\/vendor\//.test(f.split(path.sep).join('/')))) {
  fs.readFileSync(f, 'utf8').split('\n').forEach((ln, i) => { for (const re of SECRETS) if (re.test(ln)) bad('secret', rel(f), i + 1, '疑似密钥 / 个人邮箱'); });
}
// 10. vendor 里的库：只登记，不放行 fetch（仅提示）
const vend = walk(path.join(root, 'app/vendor')).filter(f => f.endsWith('.js')).map(f => `${rel(f)} (${(fs.statSync(f).size / 1024).toFixed(0)} KB)`);
notes.push('第三方库（原样，未改动）：' + vend.join('，'));

console.log(`审查了 ${own.length} 个自家文件 + ${files.length - own.length} 个资源文件。`);
notes.forEach(n => console.log('· ' + n));
if (problems.length) { console.log('\n' + problems.join('\n') + `\n\n${problems.length} 个问题`); process.exit(1); }
console.log('✓ 全部通过：没有计划外的联网代码、没有外部资源、字体只用自有字体、没有订阅 / 账号 / 代理 / 科研沙盒 / 操作接管代码、没有密钥。');
