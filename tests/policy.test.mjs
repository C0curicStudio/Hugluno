import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
const { validateProvider, decide, externalLink, resolveAppFile } = createRequire(import.meta.url)('../desktop/policy.js');
const st = (p = [], once = {}) => ({ providers: new Set(p), once: new Map(Object.entries(once)) });

test('模型接口：https 可以；http 只许本机 / 局域网；带账号密码、其它协议不行', () => {
  assert.equal(validateProvider('https://api.openai.com/v1').ok, true);
  assert.equal(validateProvider('http://localhost:11434/v1').ok, true);
  assert.equal(validateProvider('http://192.168.1.5:1234/v1').ok, true);
  assert.equal(validateProvider('http://api.openai.com/v1').reason, 'http-public');
  assert.equal(validateProvider('http://8.8.8.8/v1').ok, false);
  assert.equal(validateProvider('https://u:p@x.com').reason, 'credentials-in-url');
  assert.equal(validateProvider('file:///etc/passwd').ok, false);
  assert.equal(validateProvider('javascript:alert(1)').ok, false);
  assert.equal(validateProvider('').ok, false);
});
test('网络总闸：默认全拦；只放行 hug:// 和设置里的那一个接口', () => {
  const s = st(['https://api.deepseek.com']);
  assert.equal(decide('hug://app/index.html', s).allow, true);
  assert.equal(decide('data:image/png;base64,AA', s).allow, true);
  assert.equal(decide('https://api.deepseek.com/v1/chat/completions', s).allow, true);
  assert.equal(decide('https://example.com/', s).allow, false);
  assert.equal(decide('https://api.deepseek.com.evil.com/', s).allow, false);
  assert.equal(decide('http://api.deepseek.com/', s).allow, false, 'http 不等于 https');
  assert.equal(decide('file:///C:/Users/x/secret.txt', s).allow, false);
  assert.equal(decide('ws://evil.example/', s).allow, false);
  assert.equal(decide('not a url', s).allow, false);
});
test('「接口调试」逐次放行：只放那个来源，60 秒后失效', () => {
  const now = 1_000_000, s = st([], { 'https://httpbin.org': now + 60_000 });
  assert.equal(decide('https://httpbin.org/get', s, now).allow, true);
  assert.equal(decide('https://httpbin.org/get', s, now + 61_000).allow, false);
  assert.equal(decide('https://other.org/get', s, now).allow, false);
});
test('点链接：只许 https；白名单站点直接开，其它要先问', () => {
  assert.deepEqual(externalLink('https://support.c0curic.top/max/snapshot'), { ok: true, url: 'https://support.c0curic.top/max/snapshot', host: 'support.c0curic.top', trusted: true });
  assert.equal(externalLink('https://evil.example/').trusted, false);
  assert.equal(externalLink('http://support.c0curic.top/').ok, false);
  assert.equal(externalLink('https://a:b@support.c0curic.top/').ok, false);
  assert.equal(externalLink('javascript:alert(1)').ok, false);
  assert.equal(externalLink('file:///etc/passwd').ok, false);
});
test('hug://app 路径：不能跳出 app 目录', () => {
  const dir = path.resolve('/opt/app');
  assert.equal(resolveAppFile(dir, '/'), path.join(dir, 'index.html'));
  assert.equal(resolveAppFile(dir, '/js/app.js'), path.join(dir, 'js/app.js'));
  assert.equal(resolveAppFile(dir, '/../etc/passwd'), null);
  assert.equal(resolveAppFile(dir, '/%2e%2e/etc/passwd'), null);
  assert.equal(resolveAppFile(dir, '/a%00b'), null);
});
