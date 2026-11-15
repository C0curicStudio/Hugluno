import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('tools/audit.mjs 全部通过（没有计划外联网 / 外部资源 / 别的字体 / 不该有的功能 / 密钥）', () => {
  const r = spawnSync(process.execPath, ['tools/audit.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
