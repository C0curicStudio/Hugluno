// 桌面版冒烟测试：真的启动 Electron（需要显示环境；Linux 用 xvfb-run），验证：hug:// 页面能开、预加载只暴露 HugDesk、
// 网络总闸默认拦截一切外联、只放行设置里的模型接口、IPC 只认主页面。
// 运行：xvfb-run -a node tests/desktop-smoke.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFake } from './fake-provider.mjs';
const require = createRequire(import.meta.url);
const { _electron } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? '✓' : '✗'} ${n}${c ? '' : '  ' + x}`); };
const fake = await startFake(() => 'Hello from desktop.');
const app = await _electron.launch({ executablePath: require('electron'), args: [root, '--no-sandbox'], env: { ...process.env, ELECTRON_ENABLE_LOGGING: '0' } });
try {
  const win = await app.firstWindow(); await win.waitForSelector('#input', { timeout: 20000 });
  check('页面来自 hug://app（不是 file:// 也不是网址）', win.url().startsWith('hug://app/'), win.url());
  const keys = await win.evaluate(() => Object.keys(window.HugDesk || {}).sort().join(','));
  check('预加载只暴露约定的几个接口', keys === 'island,net,platform,secret,wipe', keys);
  check('页面里没有 Node（require / process）', await win.evaluate(() => typeof require === 'undefined' && typeof process === 'undefined'));
  const ext = await win.evaluate(() => fetch('https://example.com/', { mode: 'no-cors' }).then(() => 'REACHED', () => 'blocked'));
  check('默认拦截外联（fetch https://example.com 失败）', ext === 'blocked', ext);
  const imgBlocked = await win.evaluate(() => new Promise(r => { const i = new Image(); i.onload = () => r('loaded'); i.onerror = () => r('blocked'); i.src = 'https://example.com/x.png'; }));
  check('远程图片也被拦', imgBlocked === 'blocked', imgBlocked);
  // 设置模型接口（本机假服务）→ 只放行这一个
  await win.evaluate(async b => { HugStore.Settings.set({ base: b, model: 'fake-1' }); await HugStore.HugKey.save('sk-desk'); }, fake.base);
  await win.reload(); await win.waitForSelector('#input');
  await win.fill('#input', 'hi'); await win.press('#input', 'Enter');
  await win.waitForFunction(() => document.querySelector('#msgs .msg.a .md')?.textContent.includes('Hello from desktop.'), null, { timeout: 15000 });
  check('桌面版对话成功（只放行了你填的接口）', true);
  check('密钥经系统钥匙串 / 主进程保存，不在 localStorage', await win.evaluate(() => !localStorage.getItem('hug.key')));
  const ext2 = await win.evaluate(() => fetch('https://example.com/', { mode: 'no-cors' }).then(() => 'REACHED', () => 'blocked'));
  check('设置接口后别的地址仍被拦', ext2 === 'blocked', ext2);
  const log = await win.evaluate(() => HugDesk.net.log());
  check('主进程网络记录里有被拦的 example.com', log.some(r => /example\.com/.test(r.host) && r.allowed === false), JSON.stringify(log).slice(0, 200));
  // IPC 只认主页面：学习窗口的 iframe 调不到
  await win.evaluate(() => MXUI.open1('Lab', { title: 't', source: '<b>x</b>' }, 't')); await win.waitForSelector('#mxWork iframe.lab-fr'); await win.waitForTimeout(1500);
  const lab = win.frames().find(f => f.url().endsWith('lab.html'));
  check('学习窗口 iframe 里没有 HugDesk', !!lab && await lab.evaluate(() => typeof window.HugDesk === 'undefined').catch(() => true));
} catch (e) { fail++; console.log('  ✗ 异常：', e.message); }
await app.close(); fake.close();
console.log(`\n${pass} 通过，${fail} 失败`); process.exit(fail ? 1 : 0);
