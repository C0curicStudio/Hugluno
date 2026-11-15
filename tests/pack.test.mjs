import test from 'node:test';
import assert from 'node:assert/strict';
import { buildZip } from '../tools/pack-web.mjs';
test('网站部署包：同样的输入永远打出同样的字节（可复现）', () => {
  const f = () => [{ name: 'b.txt', data: Buffer.from('bbb'.repeat(50)) }, { name: 'a.txt', data: Buffer.from('aaa') }];
  const a = buildZip(f()), b = buildZip(f().reverse());
  assert.ok(a.equals(b)); assert.equal(a.readUInt32LE(0), 0x04034b50);
});
