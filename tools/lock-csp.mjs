#!/usr/bin/env node
/* 把网站版的 CSP「收紧到只剩你的模型接口」：生成一份改好 index.html 的副本（默认 dist/site）。
   用法：node tools/lock-csp.mjs --api https://api.deepseek.com [--api http://192.168.1.20:11434] [--out dist/site]
   收紧后，浏览器会拒绝页面向任何别的地址发请求（包括「接口调试」卡能请求的地址——要用它请不要收紧）。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), apis = [];
let out = path.join(root, 'dist/site');
for (let i = 0; i < args.length; i++) { if (args[i] === '--api') apis.push(args[++i]); else if (args[i] === '--out') out = path.resolve(args[++i]); }
if (!apis.length) { console.error('用法：node tools/lock-csp.mjs --api https://你的模型接口 [--out 目录]'); process.exit(1); }
const origins = apis.map(a => { let u; try { u = new URL(a); } catch { console.error('不是有效网址：' + a); process.exit(1); } if (!/^https?:$/.test(u.protocol)) { console.error('只支持 http(s)：' + a); process.exit(1); } return u.origin; });
fs.cpSync(path.join(root, 'app'), out, { recursive: true });
const f = path.join(out, 'index.html'); let t = fs.readFileSync(f, 'utf8');
const re = /connect-src [^;"]*;/; if (!re.test(t)) { console.error('index.html 里找不到 connect-src'); process.exit(1); }
t = t.replace(re, `connect-src 'self' ${[...new Set(origins)].join(' ')};`);
fs.writeFileSync(f, t);
console.log(`已生成 ${out}\nconnect-src 现在只允许：'self' ${origins.join(' ')}\n把这个目录部署出去即可。`);
