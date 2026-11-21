import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../app');
const rd = f => fs.readFileSync(path.join(app, f), 'utf8');
const ctx = { window: {}, document: { documentElement: {}, querySelectorAll: () => [] }, localStorage: { getItem: () => null }, navigator: { languages: ['en'] }, location: {} }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(rd('js/i18n-cards.js'), ctx); vm.runInContext(rd('js/i18n.js'), ctx);
test('界面文字：每条都有中 / 英 / 法三语且不为空', () => {
  const D = ctx.HUG_DICT; assert.ok(Object.keys(D).length > 60);
  for (const [k, v] of Object.entries(D)) { assert.equal(v.length, 3, k); v.forEach((s, i) => assert.ok(s && s.trim(), `${k}[${i}]`)); assert.ok(/[一-鿿]/.test(v[0]) || /^[A-Za-z]/.test(v[0]), k); }
});
test('页面里用到的 data-i / data-ph / data-title 都有词条；L("…") 引用的也都存在', () => {
  const D = ctx.HUG_DICT, used = new Set();
  for (const m of rd('index.html').matchAll(/data-(?:i|ph|title)="([A-Za-z0-9]+)"/g)) used.add(m[1]);
  for (const f of ['js/app.js', 'js/net.js', 'js/agent.js', 'js/standby.js']) for (const m of rd(f).matchAll(/\bL\(\s*'([A-Za-z0-9]+)'\s*\)/g)) used.add(m[1]);
  for (const m of rd('js/app.js').matchAll(/\[('try\d|'link\w+'|'help')/g)) used.add(m[1].replace(/'/g, ''));
  const miss = [...used].filter(k => !D[k]); assert.deepEqual(miss, []);
});
test('学习窗口 / 工具卡里 T("中文") 的每一句都有英文和法文', () => {
  const C = ctx.HUG_CARDS_I18N, src = ['js/mxui.js', 'js/tools2.js', 'js/tools3.js', 'js/graph.js'].map(rd).join('\n'), miss = [];
  for (const m of src.matchAll(/\bT\((['"])((?:\\.|(?!\1).)*?)\1\)/g)) { const k = m[2].replace(/\\'/g, "'"); if (/[一-鿿]/.test(k) && !(C[k] && C[k][0] && C[k][1])) miss.push(k); }
  assert.deepEqual([...new Set(miss)], []);
});
