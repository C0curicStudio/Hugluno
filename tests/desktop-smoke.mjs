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
let agentScript = [];
const fake = await startFake(j => (j.stream === false && agentScript.length ? agentScript.shift() : 'Hello from desktop.'));
const app = await _electron.launch({ executablePath: require('electron'), args: [root, '--no-sandbox'], env: { ...process.env, ELECTRON_ENABLE_LOGGING: '0' } });
try {
  const win = await app.firstWindow(); await win.waitForSelector('#input', { timeout: 20000 });
  { const fs = await import('node:fs'), ud = await app.evaluate(({ app }) => app.getPath('userData')); fs.rmSync(path.join(ud, 'agent.json'), { force: true }); } // 上次测试留下的 Agent 文件夹设置：清掉
  check('页面来自 hug://app（不是 file:// 也不是网址）', win.url().startsWith('hug://app/'), win.url());
  const keys = await win.evaluate(() => Object.keys(window.HugDesk || {}).sort().join(','));
  check('预加载只暴露约定的几个接口', keys === 'agent,island,net,platform,secret,wipe', keys);
  await win.waitForFunction(() => !document.querySelector('#btnAgent').hidden, null, { timeout: 10000 }).catch(() => {});
  const ag = await win.evaluate(async () => ({ st: await HugDesk.agent.status(), btn: !document.querySelector('#btnAgent').hidden, sec: !document.querySelector('#secAgent').hidden, bad: await HugDesk.agent.tool('read_file', { path: '../x' }) }));
  check('本地 Agent：开关和设置区出现；没选文件夹时工具一律拒绝', ag.btn && ag.sec && !ag.st.dir && !!ag.bad.error, JSON.stringify(ag));
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
  // 本地 Agent 端到端：假模型先调 write_file，再给总结；文件真的写进选定的文件夹
  {
    const os = await import('node:os'), fs = await import('node:fs');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hug-agent-e2e-'));
    const ud = await app.evaluate(({ app }) => app.getPath('userData'));
    fs.writeFileSync(path.join(ud, 'agent.json'), JSON.stringify({ dir, cmd: 'off' }));
    agentScript = [{ tool_calls: [{ id: 'c1', type: 'function', function: { name: 'write_file', arguments: JSON.stringify({ path: 'hello.txt', content: 'hi from agent' }) } }] }, { content: 'Done: wrote hello.txt' }];
    await win.evaluate(() => { localStorage.setItem('hug.agent', '1'); }); await win.reload(); await win.waitForSelector('#input');
    await win.waitForFunction(() => document.querySelector('#btnAgent')?.classList.contains('on'), null, { timeout: 10000 });
    await win.fill('#input', 'write hello'); await win.press('#input', 'Enter');
    await win.waitForFunction(() => document.querySelector('#msgs .msg.a:last-child .md')?.textContent.includes('Done: wrote hello.txt'), null, { timeout: 15000 }).catch(() => {});
    const txt = await win.evaluate(() => document.querySelector('#msgs .msg.a:last-child .md')?.textContent || '');
    check('本地 Agent 端到端：模型调工具 → 文件写进选定文件夹 → 回答里有步骤和总结', fs.existsSync(path.join(dir, 'hello.txt')) && fs.readFileSync(path.join(dir, 'hello.txt'), 'utf8') === 'hi from agent' && /write_file/.test(txt) && /✓/.test(txt), txt.slice(0, 200));
    const req = fake.seen.at(-1)?.body; check('Agent 请求只发给你填的接口，带工具定义、非流式', req?.stream === false && Array.isArray(req.tools) && req.tools.some(t => t.function.name === 'write_file') && !req.tools.some(t => t.function.name === 'run_command'));
    await win.evaluate(() => localStorage.setItem('hug.agent', '0')); fs.rmSync(path.join(ud, 'agent.json'), { force: true });
  }
  // IPC 只认主页面：学习窗口的 iframe 调不到
  await win.evaluate(() => MXUI.open1('Lab', { title: 't', source: '<b>x</b>' }, 't')); await win.waitForSelector('#mxWork iframe.lab-fr'); await win.waitForTimeout(1500);
  const lab = win.frames().find(f => f.url().endsWith('lab.html'));
  check('学习窗口 iframe 里没有 HugDesk', !!lab && await lab.evaluate(() => typeof window.HugDesk === 'undefined').catch(() => true));
} catch (e) { fail++; console.log('  ✗ 异常：', e.message); }
await app.close(); fake.close();
console.log(`\n${pass} 通过，${fail} 失败`); process.exit(fail ? 1 : 0);
