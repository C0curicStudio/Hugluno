'use strict';
/* 本地 Agent（只在桌面版出现：需要主进程的 HugDesk.agent）。精简版：一个模型、一个对话循环，没有工作流 / 规划 / 路由 / 审查。
   · 模型请求照旧只走 net.js（HugNet.complete）→ 你填的那一个接口；
   · 动手的事交给主进程（desktop/agent.js）：只在你选的文件夹里读写 / 搜索，删除和运行命令每次弹系统对话框问你；
   · 回答里把每一步写成一行（工具名 + 目标 + ✓ / ✗），最后是模型的总结；对话照旧只存在本机。 */
(() => {
  const D = window.HugDesk?.agent; if (!D) return;
  const $ = s => document.querySelector(s), MAX_STEPS = 25, OUT_CAP = 12000;
  const KEY = 'hug.agent';
  let on = false, st = { dir: '', name: '', cmd: 'off' };
  try { on = localStorage.getItem(KEY) === '1'; } catch {}

  const fn = (name, description, props, required = []) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties: props, required } } });
  const P = { path: { type: 'string', description: 'Path relative to the working folder' } };
  const TOOLS = [
    fn('list_files', 'List files and folders (up to 3 levels deep) under a path in the working folder.', { path: { ...P.path, description: 'Folder path, default "."' } }),
    fn('read_file', 'Read a UTF-8 text file (max 512 KB).', P, ['path']),
    fn('write_file', 'Create or overwrite a text file with the full content. Parent folders are created.', { ...P, content: { type: 'string' } }, ['path', 'content']),
    fn('edit_file', 'Replace one exact, unique snippet in a file. Prefer this over rewriting big files.', { ...P, old: { type: 'string', description: 'Exact text to replace (must occur once)' }, new: { type: 'string' } }, ['path', 'old', 'new']),
    fn('delete_file', 'Delete one file (the user is asked to confirm).', P, ['path']),
    fn('search_files', 'Case-insensitive text search in files under a path.', { query: { type: 'string' }, path: { ...P.path, description: 'Folder to search, default "."' } }, ['query']),
  ];
  const CMD_TOOL = fn('run_command', 'Run one shell command in the working folder (PowerShell on Windows, sh/zsh on macOS). The user confirms every command. No interactive programs; 120 s timeout.', { command: { type: 'string' } }, ['command']);

  const tools = () => (st.cmd === 'ask' ? [...TOOLS, CMD_TOOL] : TOOLS);
  const prompt = () => {
    const lang = { zh: '简体中文', en: 'English', fr: 'français' }[window.HUG_LANG] || 'English';
    return `You are Hugluno Agent, a local coding / file assistant in the open-source desktop app. Reply in the user's language (default: ${lang}).
You work ONLY inside the user's working folder "${st.name}" using the tools; paths are relative to it. You cannot reach anything outside it, nor key/login files.
Work in small verified steps: look (list_files / read_file / search_files) before changing; prefer edit_file for small changes; write complete files with write_file.
${st.cmd === 'ask' ? 'run_command is available: the user approves each command; keep commands non-interactive and short.' : 'Running commands is turned off — do not ask to run commands; tell the user what to run if needed.'}
There is no workflow or sub-agent: just do the task yourself, then finish with a short summary of what changed (files touched) and anything left for the user. Keep the summary brief.`;
  };
  const brief = a => { const v = a?.path ?? a?.command ?? a?.query ?? ''; return v ? '`' + String(v).replace(/`/g, "'").slice(0, 120) + '`' : ''; };

  async function refresh() {
    try { st = await D.status(); } catch {}
    const b = $('#btnAgent'); if (!b) return;
    b.hidden = false; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    $('#agentDir').textContent = on && st.name ? st.name : '';
    const sd = $('#sAgentDir'); if (sd) sd.textContent = st.dir || L('sAgentNone');
    const sc = $('#sAgentCmd'); if (sc) sc.checked = st.cmd === 'ask';
  }

  /** 跑一轮 Agent：把步骤和最后的回答写进 am.content（tick() 让界面刷新） */
  async function run(history, am, { signal, tick }) {
    await refresh();
    if (!st.dir) throw new Error(L('agNeedDir'));
    const msgs = [{ role: 'system', content: prompt() }, ...history];
    const say = t => { am.content += t; tick(); };
    for (let step = 0; step < MAX_STEPS; step++) {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      let m;
      try { m = await HugNet.complete(msgs, { tools: tools(), signal }); }
      catch (e) { if (e.status === 400 && /tool|function/i.test(e.message)) throw new Error(L('agNoTools')); throw e; }
      if (m.reasoning_content) { am.think += m.reasoning_content + '\n'; tick(); }
      const calls = Array.isArray(m.tool_calls) ? m.tool_calls.filter(c => c?.function?.name) : [];
      msgs.push({ role: 'assistant', content: m.content || (calls.length ? null : ''), ...(calls.length ? { tool_calls: calls } : {}) });
      if (!calls.length) { say((am.content ? '\n' : '') + (m.content || '')); return; }
      if (m.content) say(m.content.trim() + '\n\n');
      for (const c of calls) {
        let args = {}; try { args = JSON.parse(c.function.arguments || '{}'); } catch {}
        say(`- ${c.function.name} ${brief(args)} …`);
        const r = await D.tool(c.function.name, args);
        am.content = am.content.replace(/ …$/, r.ok ? ' ✓\n' : ` ✗ ${String(r.error || '').replace(/\n/g, ' ').slice(0, 160)}\n`); tick();
        msgs.push({ role: 'tool', tool_call_id: c.id, content: r.ok ? String(r.out).slice(0, OUT_CAP) : 'ERROR: ' + r.error });
        if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      }
      say('\n');
    }
    say('\n' + L('agMaxSteps'));
  }

  function bind() {
    const b = $('#btnAgent');
    b.onclick = async () => { on = !on; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch {} await refresh(); if (on && !st.dir) { toast(L('agNeedDir')); $('#btnSettings').click(); } };
    $('#btnAgentDir').onclick = async () => { try { await D.pick(); } catch (e) { toast(String(e.message || e)); } refresh(); };
    $('#sAgentCmd').onchange = async e => { await D.setCmd(e.target.checked ? 'ask' : 'off'); refresh(); };
    $('#secAgent').hidden = false;
    $('#btnSettings').addEventListener('click', refresh);
  }
  window.HugAgent = { on: () => on, run, refresh, TOOLS: () => tools() };
  const start = () => { bind(); refresh(); };
  if (window.HugApp) start(); else window.addEventListener('hug-ready', start, { once: true });
})();
