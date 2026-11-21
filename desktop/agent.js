'use strict';
/* 本地 Agent（桌面版，精简版：一个模型、一个对话循环，没有工作流 / 规划器 / 路由 / 审查）。
   主进程只提供「手」：在你选定的一个文件夹里读写文件、搜索、（可选）运行命令。模型请求仍然只走 net.js → 你填的模型接口。
   安全边界：
   · 所有路径都必须落在你选的文件夹里（解析软链接后再判断），跳出去一律拒绝；密钥 / .env / .ssh / 浏览器登录数据这类文件就算在文件夹里也不碰；
   · 删除文件、运行命令每一次都弹系统对话框问你；运行命令默认关闭，要在设置里打开；
   · 命令硬拒绝：提权（sudo / runas）、格式化 / 毁盘、curl | sh 这类「下载就执行」、改开机自启、读钥匙串；
   · 命令在文件夹里运行，环境变量里的密钥 / 令牌先清掉；120 秒超时，超时结束整个进程树；输出截断；
   · 注意：命令由系统 shell 执行，它自己的联网不经过 Hugluno 的网络总闸（policy.js）——所以默认关闭、每次都问。
   · 每次操作在 userData/agent-audit.log 记一行（只记操作和路径，不记文件内容）。
   纯函数（tests/agent.test.mjs 直接测）：within / sensitive / classify / cleanEnv / clip */
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const WIN = process.platform === 'win32';
const READ_MAX = 512 * 1024, WRITE_MAX = 4 * 1024 * 1024, OUT_MAX = 20000, LIST_MAX = 500, HITS_MAX = 200, RUN_MS = 120000;
const SKIP = new Set(['node_modules', '.git', '.hg', '.svn', 'dist', 'build', '.next', '__pycache__', '.venv', 'venv']);

/** rel 在 root 里面吗（纯字符串判断；真实路径另外再查一次） */
function within(root, rel) {
  const r = path.resolve(root), p = path.resolve(r, String(rel ?? '.'));
  return p === r || p.startsWith(r + path.sep) ? p : null;
}
const SENSITIVE = /(^|[\\/])(\.env(\..*)?|\.npmrc|\.pypirc|\.netrc|\.git-credentials|id_(rsa|ed25519|ecdsa|dsa)(\.pub)?|[^\\/]*\.(pem|key|p12|pfx|keystore|jks)|\.ssh|\.gnupg|\.aws|\.kube|\.docker|Login Data|Cookies|key\.bin)([\\/]|$)/i;
const sensitive = p => SENSITIVE.test(String(p));

/** 命令分级：deny 硬拒绝（任何情况下都不跑）· ask 每次问 */
const DENY = [
  [/\b(sudo|doas|su\s+-|runas|Start-Process\b[^|;&]*-Verb\s+RunAs)\b/i, '提权'],
  [/\b(mkfs|diskpart|format(\.com)?\s+[a-z]:|dd\s+[^|;&]*of=\/dev\/|Clear-Disk|Format-Volume)\b/i, '格式化 / 写磁盘'],
  [/\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)[a-z]*\s+(\/|~|\$HOME|\*)(\s|$)/i, '删除根目录 / 家目录'],
  [/Remove-Item\b[^|;&]*-Recurse[^|;&]*\s(\/|[a-z]:\\?|~|\$HOME|\$env:USERPROFILE)(\s|$)/i, '删除根目录 / 家目录'],
  [/(curl|wget|iwr|Invoke-WebRequest|irm|Invoke-RestMethod)\b[^|;&]*\|\s*(sh|bash|zsh|iex|Invoke-Expression|python\d?|node)\b/i, '下载后直接执行'],
  [/\b(crontab|launchctl\s+(load|bootstrap)|schtasks\s+\/create|reg\s+add\s+[^|;&]*\\Run\b|New-Service|systemctl\s+enable)\b/i, '开机自启 / 计划任务'],
  [/\b(security\s+(find|dump)-(generic|internet)-password|cmdkey\s+\/list|vaultcmd)\b/i, '读钥匙串 / 凭据'],
  [/:\(\)\s*\{\s*:\|:&\s*\};:/, 'fork 炸弹'],
];
function classify(cmd) {
  const c = String(cmd || '').trim();
  if (!c) return { level: 'deny', why: '空命令' };
  if (c.length > 4000) return { level: 'deny', why: '命令太长' };
  for (const [re, why] of DENY) if (re.test(c)) return { level: 'deny', why };
  return { level: 'ask' };
}
/** 子进程环境：去掉密钥 / 令牌类变量，加上非交互标志 */
function cleanEnv(env) {
  const o = {};
  for (const [k, v] of Object.entries(env || {})) if (!/(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|COOKIE|AUTH)/i.test(k)) o[k] = v;
  return { ...o, CI: '1', NO_COLOR: '1', GIT_TERMINAL_PROMPT: '0', PAGER: 'cat' };
}
const clip = (s, n = OUT_MAX) => { s = String(s ?? '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, ''); return s.length > n ? s.slice(0, n / 2) + `\n…（省略 ${s.length - n} 字）…\n` + s.slice(-n / 2) : s; };

function createAgent({ app, dialog, getWin, tx }) {
  const CFG = () => path.join(app.getPath('userData'), 'agent.json');
  const AUDIT = () => path.join(app.getPath('userData'), 'agent-audit.log');
  let cfg = null;
  const conf = () => { if (!cfg) { try { cfg = JSON.parse(fs.readFileSync(CFG(), 'utf8')); } catch { cfg = {}; } cfg = { dir: '', cmd: 'off', ...cfg }; } return cfg; };
  const saveConf = () => fs.writeFileSync(CFG(), JSON.stringify(conf(), null, 2), { mode: 0o600 });
  const audit = (op, target, ok) => { try { fs.appendFileSync(AUDIT(), JSON.stringify({ t: new Date().toISOString(), op, target: String(target || '').slice(0, 300), ok }) + '\n'); } catch {} };
  const running = new Set();

  async function real(rel, mustExist = true) { // → 真实绝对路径；不在文件夹里 / 敏感文件就抛错
    const root = conf().dir; if (!root || !fs.existsSync(root)) throw new Error(tx().agNoDir);
    const p = within(root, rel); if (!p) throw new Error(tx().agOutside + String(rel));
    if (sensitive(path.relative(root, p))) throw new Error(tx().agSensitive + String(rel));
    const rr = await fs.promises.realpath(root);
    let probe = p; while (!fs.existsSync(probe)) { const up = path.dirname(probe); if (up === probe) break; probe = up; }
    const rp = await fs.promises.realpath(probe); // 软链接指到文件夹外面：拒绝
    if (rp !== rr && !rp.startsWith(rr + path.sep)) throw new Error(tx().agOutside + String(rel));
    if (mustExist && !fs.existsSync(p)) throw new Error(tx().agMissing + String(rel));
    return p;
  }
  const relOf = p => path.relative(conf().dir, p).split(path.sep).join('/') || '.';
  const ask = async (title, detail, yes) => { const t = tx(), w = getWin(); const r = await dialog.showMessageBox(w, { type: 'warning', buttons: [yes, t.cancel], defaultId: 1, cancelId: 1, title: 'Hugluno Agent', message: title, detail }); return r.response === 0; };

  const TOOLS = {
    async list_files({ path: rel = '.' }) {
      const base = await real(rel), out = [];
      const walk = async (d, depth) => {
        for (const e of await fs.promises.readdir(d, { withFileTypes: true })) {
          if (out.length >= LIST_MAX) return; if (SKIP.has(e.name)) continue;
          const p = path.join(d, e.name); if (sensitive(path.relative(conf().dir, p))) continue;
          if (e.isDirectory()) { out.push(relOf(p) + '/'); if (depth < 3) await walk(p, depth + 1); }
          else if (e.isFile()) out.push(`${relOf(p)}  (${(await fs.promises.stat(p)).size} B)`);
        }
      };
      if ((await fs.promises.stat(base)).isDirectory()) await walk(base, 0); else out.push(relOf(base));
      return out.length ? out.join('\n') + (out.length >= LIST_MAX ? `\n…（只列出前 ${LIST_MAX} 项）` : '') : '（空文件夹）';
    },
    async read_file({ path: rel }) {
      const p = await real(rel), st = await fs.promises.stat(p);
      if (!st.isFile()) throw new Error('不是文件：' + rel);
      if (st.size > READ_MAX) throw new Error(`文件太大（${st.size} B，上限 ${READ_MAX} B）`);
      const b = await fs.promises.readFile(p); if (b.includes(0)) throw new Error('二进制文件，不能按文本读取：' + rel);
      return b.toString('utf8');
    },
    async write_file({ path: rel, content }) {
      const s = String(content ?? ''); if (Buffer.byteLength(s) > WRITE_MAX) throw new Error(`内容太大（上限 ${WRITE_MAX} B）`);
      const p = await real(rel, false); await fs.promises.mkdir(path.dirname(p), { recursive: true });
      const tmp = p + '.hug-' + process.pid + '.tmp'; await fs.promises.writeFile(tmp, s); await fs.promises.rename(tmp, p); // 先写临时文件再改名：不会留下写了一半的文件
      return `已写入 ${relOf(p)}（${Buffer.byteLength(s)} B）`;
    },
    async edit_file({ path: rel, old: a, new: b }) {
      const p = await real(rel), t = await fs.promises.readFile(p, 'utf8'), n = String(a ?? '');
      if (!n) throw new Error('old 不能为空');
      const c = t.split(n).length - 1; if (c !== 1) throw new Error(c ? `old 出现了 ${c} 次，请给出更长、唯一的片段` : 'old 在文件里没找到（要逐字一致）');
      await TOOLS.write_file({ path: rel, content: t.replace(n, () => String(b ?? '')) }); return `已修改 ${relOf(p)}`;
    },
    async delete_file({ path: rel }) {
      const p = await real(rel); if ((await fs.promises.stat(p)).isDirectory()) throw new Error('只能删除文件，不能删除文件夹');
      if (!(await ask(tx().agDelTitle, relOf(p), tx().agDelete))) throw new Error(tx().agDenied);
      await fs.promises.rm(p); return `已删除 ${relOf(p)}`;
    },
    async search_files({ query, path: rel = '.' }) {
      const q = String(query || '').toLowerCase(); if (!q) throw new Error('query 不能为空');
      const base = await real(rel), hits = [];
      const walk = async d => {
        for (const e of await fs.promises.readdir(d, { withFileTypes: true })) {
          if (hits.length >= HITS_MAX || SKIP.has(e.name)) continue;
          const p = path.join(d, e.name); if (sensitive(path.relative(conf().dir, p))) continue;
          if (e.isDirectory()) await walk(p);
          else if (e.isFile() && (await fs.promises.stat(p)).size <= 1024 * 1024) {
            const b = await fs.promises.readFile(p); if (b.includes(0)) continue;
            b.toString('utf8').split('\n').forEach((ln, i) => { if (hits.length < HITS_MAX && ln.toLowerCase().includes(q)) hits.push(`${relOf(p)}:${i + 1}: ${ln.trim().slice(0, 200)}`); });
          }
        }
      };
      await walk(base); return hits.length ? hits.join('\n') : '没有找到';
    },
    async run_command({ command }) {
      const c = conf(), t = tx(); if (c.cmd !== 'ask') throw new Error(t.agCmdOff);
      const k = classify(command); if (k.level === 'deny') throw new Error(t.agCmdDeny + k.why);
      if (running.size >= 2) throw new Error('同时最多运行 2 条命令');
      await real('.');
      if (!(await ask(t.agRunTitle, `${command}\n\n${t.agRunIn}${c.dir}\n\n${t.agRunNote}`, t.agRun))) throw new Error(t.agDenied);
      return new Promise(resolve => {
        const ch = WIN ? spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], { cwd: c.dir, env: cleanEnv(process.env), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
          : spawn(process.env.SHELL && /zsh|bash/.test(process.env.SHELL) ? process.env.SHELL : '/bin/sh', ['-c', command], { cwd: c.dir, env: cleanEnv(process.env), detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
        running.add(ch); let out = '', timedOut = false;
        const add = d => { if (out.length < OUT_MAX * 4) out += d; };
        ch.stdout.on('data', add); ch.stderr.on('data', add);
        const kill = () => { try { if (WIN) spawn('taskkill', ['/pid', String(ch.pid), '/T', '/F'], { windowsHide: true }); else process.kill(-ch.pid, 'SIGKILL'); } catch {} };
        const tm = setTimeout(() => { timedOut = true; kill(); }, RUN_MS);
        ch.on('error', e => { clearTimeout(tm); running.delete(ch); resolve(`无法运行：${e.message}`); });
        ch.on('close', code => { clearTimeout(tm); running.delete(ch); resolve(`${timedOut ? `（超过 ${RUN_MS / 1000} 秒，已结束）\n` : ''}退出码 ${code}\n${clip(out) || '（没有输出）'}`); });
      });
    },
  };

  return {
    status: () => { const c = conf(); return { dir: c.dir && fs.existsSync(c.dir) ? c.dir : '', name: c.dir ? path.basename(c.dir) : '', cmd: c.cmd }; },
    async pickDir() {
      const r = await dialog.showOpenDialog(getWin(), { title: tx().agPick, properties: ['openDirectory', 'createDirectory'] });
      if (r.canceled || !r.filePaths[0]) return null;
      const d = r.filePaths[0], home = app.getPath('home');
      if (path.resolve(d) === path.parse(d).root || path.resolve(d) === path.resolve(home)) throw new Error(tx().agTooWide); // 不许把整个磁盘 / 家目录交出去
      conf().dir = d; saveConf(); audit('pick', d, true); return this.status();
    },
    setCmd(mode) { conf().cmd = mode === 'ask' ? 'ask' : 'off'; saveConf(); return conf().cmd; },
    async tool(name, args) {
      const fn = Object.prototype.hasOwnProperty.call(TOOLS, name) ? TOOLS[name] : null;
      if (!fn) return { error: '没有这个工具：' + name };
      const target = args?.path || args?.command || args?.query || '';
      try { const out = await fn(args && typeof args === 'object' ? args : {}); audit(name, target, true); return { ok: true, out: clip(out, 60000) }; }
      catch (e) { audit(name, target, false); return { error: String(e?.message || e) }; }
    },
    stopAll() { for (const ch of running) { try { if (WIN) spawn('taskkill', ['/pid', String(ch.pid), '/T', '/F'], { windowsHide: true }); else process.kill(-ch.pid, 'SIGKILL'); } catch {} } },
  };
}

module.exports = { createAgent, within, sensitive, classify, cleanEnv, clip };
