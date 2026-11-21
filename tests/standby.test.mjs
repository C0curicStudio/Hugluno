// 静默待机（desktop/standby.js）：什么样的窗口标题算像报错 · 同一个窗口 10 分钟只问一次 · 整体 2 分钟最多一次 · Hugluno 自己的窗口不算
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { looksLikeError, gate } = createRequire(import.meta.url)('../desktop/standby.js');

test('像报错的标题：中英法都认；普通窗口、Hugluno 自己不算', () => {
  for (const [a, t] of [['Code', 'TypeError: x is undefined — app.js'], ['Terminal', 'npm ERR! failed'], ['Excel', '无法打开文件'], ['WINWORD', 'Word 未响应'], ['Finder', 'Erreur de copie'], ['Python', 'Traceback (most recent call last)']]) assert.equal(looksLikeError(a, t), true, t);
  for (const [a, t] of [['Code', 'index.html — my-site'], ['Chrome', 'Google'], ['Hugluno', 'Error in chat'], ['Word', '季度报告.docx']]) assert.equal(looksLikeError(a, t), false, t);
});
test('频率：同一个窗口 10 分钟只问一次，整体 2 分钟最多问一次', () => {
  const st = { asked: new Map(), last: 0 }, T0 = 1e12;
  assert.equal(gate(st, 'Code', 'Error: boom', T0), true);
  assert.equal(gate(st, 'Code', 'Error: boom', T0 + 3 * 60e3), false, '同一个窗口 10 分钟内');
  assert.equal(gate(st, 'Excel', '无法打开', T0 + 60e3), false, '整体 2 分钟内');
  assert.equal(gate(st, 'Excel', '无法打开', T0 + 3 * 60e3), true);
  assert.equal(gate(st, 'Code', 'Error: boom', T0 + 11 * 60e3), true, '10 分钟后可以再问');
  assert.equal(gate(st, 'Code', 'all good', T0 + 30 * 60e3), false);
});
