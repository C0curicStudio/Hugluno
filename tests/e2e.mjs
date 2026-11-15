// 端到端：真浏览器打开 app/，连一个本机假模型，走一遍：连接 → 对话 → 工具卡 → 学习窗口（断网验证）→ 语言 → 手机拦截。
// 运行：node tests/e2e.mjs        （SHOT=目录 时顺便截图，供文档用）
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { createServer } from '../tools/serve.mjs';
import { startFake } from './fake-provider.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const SHOT = process.env.SHOT; if (SHOT) fs.mkdirSync(SHOT, { recursive: true });
let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? '✓' : '✗'} ${n}${c ? '' : '  ' + x}`); };

const web = createServer(); await new Promise(r => web.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + web.address().port + '/';
const replyFor = j => {
  const u = [...j.messages].reverse().find(m => m.role === 'user')?.content || '';
  if (/pendulum|单摆/i.test(u)) return 'Here is a demo.\n```mxlab\ntitle: Test lab\n---\n<button id="b">x</button><script>window.__ran=1;fetch("https://example.com/x").then(function(){parent.postMessage({net:"LEAK",mxlab:1},"*")}).catch(function(e){hugluno.log("net","blocked")});<\/script>\n```';
  if (/board|看板/i.test(u)) return '```mxui\n{"type":"ui_schema","catalogVersion":"1.0.0","cards":[{"cardType":"KanbanBoard","title":"Plan","initialData":{"title":"Plan","columns":[{"id":"todo","title":"To do"},{"id":"done","title":"Done"}],"cards":[{"id":"t1","columnId":"todo","title":"Read chapter 3"}]}}]}\n```';
  if (/math/i.test(u)) return 'Euler: $e^{i\\pi}+1=0$\n\n```js\nconsole.log(1)\n```\n\n![x](https://example.com/track.png)';
  return 'Hello from the fake model.';
};
const fake = await startFake(replyFor);
const browser = await chromium.launch();
const errors = [], external = [];
async function page(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 840 }, deviceScaleFactor: SHOT ? 2 : 1, locale: opts.locale || 'en-US', ...opts.ctx });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.route(/^https?:\/\//, r => { const u = new URL(r.request().url()); if (u.hostname === '127.0.0.1') return r.continue(); external.push(u.href); return r.abort(); });
  return p;
}
try {
  /* 1 首屏 + 连接 */
  let p = await page({ locale: 'zh-CN' });
  await p.goto(base); await p.waitForSelector('#input');
  check('中文界面（跟随浏览器语言）', (await p.textContent('#btnNew')).includes('新对话'));
  check('没连模型：首页有「先连接一个模型」卡', !!(await p.$('#connectCard')));
  const font = await p.evaluate(() => getComputedStyle(document.body).fontFamily);
  check('正文字体是 MaxRIous / MaxCN', /MaxRIous/.test(font) && /MaxCN/.test(font), font);
  if (SHOT) await p.screenshot({ path: SHOT + '/01-home-zh.png' });
  await p.click('#btnSettings'); await p.waitForSelector('#settings[open]');
  await p.fill('#sBase', fake.base); await p.fill('#sKey', 'sk-test-123'); await p.fill('#sModel', 'fake-1');
  await p.click('#btnTest'); await p.waitForSelector('#testMsg.ok');
  check('测试连接成功并列出模型', (await p.textContent('#testMsg')).includes('2'));
  if (SHOT) await p.screenshot({ path: SHOT + '/02-settings-zh.png' });
  await p.click('#btnSetSave'); await p.waitForFunction(() => !document.querySelector('#settings').open);
  /* 2 对话 */
  await p.fill('#input', 'hi'); await p.press('#input', 'Enter');
  await p.waitForFunction(() => document.querySelector('#msgs .msg.a .md')?.textContent.includes('Hello from the fake model.'));
  check('流式对话完成', true);
  check('密钥只发给了设置里的接口', fake.seen.at(-1)?.auth === 'Bearer sk-test-123');
  check('对话存进本机（IndexedDB）', await p.evaluate(async () => (await HugStore.Convs.list()).length === 1));
  await p.fill('#input', 'math please'); await p.press('#input', 'Enter');
  await p.waitForFunction(() => document.querySelectorAll('#msgs .msg.a').length === 2 && document.querySelector('#msgs .katex'));
  check('KaTeX 公式渲染', true);
  check('代码块有复制按钮', !!(await p.$('#msgs pre .cp')));
  check('远程图片被拦成文字（不发请求）', !!(await p.$('#msgs .noimg')) && !external.some(u => /track\.png/.test(u)));
  /* 3 工具卡 */
  await p.fill('#input', 'make a board'); await p.press('#input', 'Enter');
  await p.waitForSelector('#app.mxw-open #mxWork .mxui-card', { timeout: 8000 });
  await p.waitForFunction(() => [...document.querySelectorAll('#mxWork input,#mxWork textarea')].some(e => /Read chapter 3/.test(e.value)) || /Read chapter 3/.test(document.querySelector('#mxWork').textContent), null, { timeout: 8000 });
  check('看板工具卡在右侧工作台打开', true);
  if (SHOT) await p.screenshot({ path: SHOT + '/03-board-zh.png' });
  /* 4 学习窗口：写的代码想联网 → 必须失败 */
  await p.fill('#input', '单摆 pendulum demo'); await p.press('#input', 'Enter');
  await p.waitForSelector('#mxWork iframe.lab-fr', { timeout: 8000 });
  await p.waitForTimeout(1800);
  const lab = p.frames().find(f => f.url().endsWith('lab.html'));
  check('学习窗口是不透明来源 iframe', !!lab && await p.$eval('#mxWork iframe.lab-fr', f => f.getAttribute('sandbox') === 'allow-scripts'));
  check('学习窗口里的代码运行了', !!lab && await lab.evaluate(() => window.__ran === 1).catch(() => false));
  check('学习窗口里 fetch 外网被 CSP 拦住（零外联）', !external.some(u => /example\.com\/x/.test(u)));
  /* 5 内置示例学习台 + 5 张工具卡 */
  await p.click('#btnStudy'); await p.waitForTimeout(1500);
  check('「学习台」示例（单摆）能打开', (await p.$$('#mxWork iframe.lab-fr')).length >= 1);
  if (SHOT) await p.screenshot({ path: SHOT + '/04-study-zh.png' });
  for (const t of ['ApiTracer', 'KanbanBoard', 'VideoEditor', 'CodeDiff', 'GenerativeForm']) {
    await p.click('#btnTools'); await p.click(`#toolsMenu [data-open=${t}]`); await p.waitForTimeout(250);
    check('工具卡 ' + t + ' 能打开', await p.evaluate(t2 => [...MXUI._groups.values()].some(g => g.cards.some(c => c.cardType === t2)), t));
  }
  check('代码里没有科研沙盒 / 操作接管', await p.evaluate(() => !MXUI.TYPES.includes('PyRun') && !MXUI.TYPES.includes('Autopilot')));
  /* 6 网络记录只有模型接口 */
  await p.click('#btnSettings'); const log = await p.textContent('#netLog');
  check('网络记录里只有本机假模型', /127\.0\.0\.1/.test(log) && !/example\.com/.test(log), log);
  await p.click('#btnSetClose');
  check('整个测试期间没有向外网发过请求', external.length === 0, external.join(', '));
  /* 7 清除数据 */
  p.on('dialog', d => d.accept());
  await p.click('#btnSettings'); await p.click('#btnWipe'); await p.waitForTimeout(1200);
  await p.waitForSelector('#input');
  check('清除后对话和密钥都没了', await p.evaluate(async () => (await HugStore.Convs.list()).length === 0 && !localStorage.getItem('hug.key')));
  await p.context().close();
  /* 8 语言 */
  for (const [loc, key, word] of [['en-US', '#btnNew', 'New chat'], ['fr-FR', '#btnNew', 'Nouvelle conversation']]) {
    const q = await page({ locale: loc }); await q.goto(base); await q.waitForSelector('#input');
    check(loc + ' 界面', (await q.textContent(key)).includes(word));
    if (SHOT) await q.screenshot({ path: SHOT + '/01-home-' + loc.slice(0, 2) + '.png' });
    await q.context().close();
  }
  /* 9 手机拦截 */
  const m = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', locale: 'en-US' });
  const mp = await m.newPage(); await mp.route(/^https?:\/\/(?!127)/, r => r.abort()); await mp.goto(base); await mp.waitForSelector('#gate:not([hidden])');
  check('手机 / 平板：显示「请在电脑上打开」且不加载应用', (await mp.textContent('#gate')).includes('computer') && await mp.$eval('#app', e => e.hidden));
  await m.close();
  check('页面脚本没有报错', errors.length === 0, errors.join(' | '));
} catch (e) { fail++; console.log('  ✗ 异常：', e.message); }
await browser.close(); web.close(); fake.close();
console.log(`\n${pass} 通过，${fail} 失败`); process.exit(fail ? 1 : 0);
