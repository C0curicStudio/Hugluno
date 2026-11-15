#!/usr/bin/env node
/* 把 app/ 打成「网站部署包」：dist/hugluno-snapshot-web-<版本>.zip，并写出 SHA256SUMS.txt。
   零依赖；zip 是确定性的（文件按名字排序、固定时间戳），同一份源码永远打出同一个 SHA-256，方便别人复现核对。 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const src = path.join(root, process.argv[2] || 'app'), out = path.join(root, 'dist');
const walk = (d, o = []) => { for (const n of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, n.name); n.isDirectory() ? walk(p, o) : o.push(p); } return o; };
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

export function buildZip(files) { // files: [{name, data}]
  const parts = [], cen = []; let off = 0;
  const DOS_T = 0, DOS_D = (2026 - 1980) << 9 | 1 << 5 | 1; // 固定时间 2026-01-01 00:00
  for (const f of files.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const name = Buffer.from(f.name), raw = f.data, def = zlib.deflateRawSync(raw, { level: 9 }), useDef = def.length < raw.length, data = useDef ? def : raw, crc = crc32(raw);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(useDef ? 8 : 0, 8); h.writeUInt16LE(DOS_T, 10); h.writeUInt16LE(DOS_D, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(name.length, 26);
    parts.push(h, name, data);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(useDef ? 8 : 0, 10); c.writeUInt16LE(DOS_T, 12); c.writeUInt16LE(DOS_D, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42);
    cen.push(c, name); off += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(cen), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = walk(src).map(f => ({ name: 'hugluno-snapshot-web/' + path.relative(src, f).split(path.sep).join('/'), data: fs.readFileSync(f) }));
  fs.mkdirSync(out, { recursive: true });
  const zip = buildZip(files), name = `hugluno-snapshot-web-${pkg.version}.zip`;
  fs.writeFileSync(path.join(out, name), zip);
  const sum = crypto.createHash('sha256').update(zip).digest('hex');
  fs.writeFileSync(path.join(out, 'SHA256SUMS-web.txt'), `${sum}  ${name}\n`);
  console.log(`${name}  ${(zip.length / 1024).toFixed(0)} KB  ${files.length} 个文件\nSHA-256 ${sum}`);
}
