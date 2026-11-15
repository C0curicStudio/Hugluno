import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../app');
const ctx = { console, crypto: globalThis.crypto, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, setTimeout, clearTimeout, URL, TextEncoder }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(app, 'js/mxui.js'), 'utf8'), ctx);
const M = ctx.MXUI;
test('只有 5 张基础工具卡 + 学习窗口；没有科研沙盒和操作接管', () => {
  assert.deepEqual([...M.TYPES].sort(), ['ApiTracer', 'CodeDiff', 'GenerativeForm', 'KanbanBoard', 'Lab', 'VideoEditor']);
  assert.equal(M.parsePy, undefined); assert.equal(M.auto, undefined); assert.equal(M.PY_HINT, undefined);
});
test('解析 UISchema：未知 cardType / 危险字段被剥掉，不抛错', () => {
  const p = M.parse(JSON.stringify({ type: 'ui_schema', cards: [{ cardType: 'KanbanBoard', initialData: { title: 'x', columns: [{ id: 'a', title: 'A' }], onclick: 'alert(1)', html: '<script>1</script>' } }, { cardType: 'Hack', initialData: {} }] }));
  assert.equal(p.mode, 'ui'); assert.ok(p.cards.length >= 1);
  assert.ok(!JSON.stringify(p).includes('alert(1)'));
});
test('模型提示词里没有科研沙盒 / 操作接管 / 外部库', () => {
  const all = M.HINT + M.LAB_HINT; assert.ok(!/pyodide|mxpy|mxauto|autopilot/i.test(all)); assert.match(M.LAB_HINT, /offline/i);
});
test('学习窗口文档：自带 CSP，connect-src none，不加载任何外部库', () => {
  const html = M.labDoc('<b>hi</b>', [], false);
  assert.match(html, /connect-src 'none'/); assert.match(html, /form-action 'none'/); assert.ok(!/<script[^>]+src=/.test(html)); assert.ok(!/https?:\/\//.test(html.replace(/https?:\/\/www\.w3\.org[^"']*/g, '')));
  assert.deepEqual([...M.READ.Lab({ libs: ['d3', 'three'], source: 'x' }).libs], [], '不再支持外部库');
});
