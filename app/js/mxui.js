'use strict';
/* Hugluno 快照版 · 工具卡片 + 学习窗口（由完整版 mxui.js 精简而来）
   保留：接口调试 / 任务看板 / 视频剪辑 / 代码比对 / 动态表单 五张基础工具卡，和「学习窗口」（Lab）。
   去掉：科研沙盒（Python / Pyodide）、操作接管（Autopilot）、卡片数据通道、本机授权文件夹、订阅档限制、CDN 外部库。
   联网：只有「接口调试」点「发送」时才会请求你填写的地址，且每次先经 HugNet.allow() 询问；学习窗口里没有任何网络。 */
/* 生成式 UI 工具卡（Hugluno UI 调度）：模型按需输出 UISchema → 聊天里拉起可交互的工具卡（grid 布局，可一次多张）
   协议（模型侧）：{"type":"text","text":"…"} 或 {"type":"ui_schema","text?":"…","cards":[{"cardType":"ApiTracer","title?":"…","initialData":{…},"gridHint?":{"w":1|2}}]}
   · 回答整段就是这个 JSON，或写在 ```mxui 代码块里，都能识别
   · 只走 Controlled catalog：5 个白名单工具 + typed props；未知 cardType / 字段 / 函数 / html 一律剥掉或降级成文本卡，绝不白屏、不抛错
   · 五层容错：解析 → 净化 → 白名单 → 宽容读取（缺字段取默认）→ 单卡 try/catch（坏一张只降级这一张）
   · 每卡 state = { initial（AI 写的描述层）, observed（本地操作 / 本地 IO 采集的事实层）, sealed }，按 instanceId 隔离并存本机
   · 封存：白名单投影 → 规范 JSON → sha256，之后整卡只读；时间戳是本机自报（self_declared）
   · 红线：Authorization / *key* / token / cookie 的值不进封存、不进日志、不上屏；视频原件只在本机，不上传 */
(() => {
  const G = globalThis;
  const CATALOG_VERSION = '1.0.0';
  const TYPES = ['ApiTracer', 'KanbanBoard', 'VideoEditor', 'CodeDiff', 'GenerativeForm', 'Lab'];
  const TYPE_OF = Object.fromEntries(TYPES.map(t => [t.toLowerCase(), t]));
  Object.assign(TYPE_OF, { api: 'ApiTracer', apitester: 'ApiTracer', postman: 'ApiTracer', kanban: 'KanbanBoard', board: 'KanbanBoard', trello: 'KanbanBoard', video: 'VideoEditor', videoeditor: 'VideoEditor', diff: 'CodeDiff', codediff: 'CodeDiff', form: 'GenerativeForm', dynamicform: 'GenerativeForm', sandbox: 'Lab', sandboxcard: 'Lab', learn: 'Lab', lab: 'Lab' });
  // 快照版没有订阅档：不设档位上限，也不挡任何功能
  const lim = (k, d) => d, can = () => true;
  const gate = msg => { G.toast?.(msg); return false; };
  const MAX_CARDS = 8, MAX_INIT = 64 * 1024, MAX_STR = 20000, MAX_ARR = 500, MAX_DEPTH = 14; // 深度够放思维导图 / JSON 树
  const BAN = /^(code|html|jsx|css|script|style|component|dangerouslysetinnerhtml|__proto__|constructor|prototype|on[a-z]+)$/i; // 模型不许写实现，只给数据
  const SECRET = /authorization|cookie|token|secret|password|passwd|(^|[-_])key$|api[-_]?key|x-api-key/i;
  const LABEL = { ApiTracer: '接口调试', KanbanBoard: '任务看板', VideoEditor: '视频剪辑', CodeDiff: '代码比对', GenerativeForm: '动态表单', Lab: '学习窗口' };
  const ICON = { ApiTracer: '⇄', KanbanBoard: '▦', VideoEditor: '▶', CodeDiff: '±', GenerativeForm: '☰', Lab: '◎' };

  const T = s => (typeof G.t0 === 'function' ? G.t0(s) : s);
  const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const str = (v, d = '', n = MAX_STR) => (typeof v === 'string' ? v.slice(0, n) : typeof v === 'number' && isFinite(v) ? String(v) : d);
  const int = (v, d = 0) => { const n = typeof v === 'string' ? Number(v) : v; return Number.isSafeInteger(n) ? n : Number.isFinite(n) ? Math.round(n) : d; };
  const arr = v => (Array.isArray(v) ? v.slice(0, MAX_ARR) : []);
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const uidS = () => Math.random().toString(36).slice(2, 8);
  const clone = v => JSON.parse(JSON.stringify(v ?? null));
  const now = () => Date.now();
  const logSafe = (...a) => { try { console.warn('[mxui]', ...a.map(x => String(x?.message || x).replace(/(authorization|bearer|api[-_]?key|token|sk-)[^\s,;"']*/gi, '$1***'))); } catch {} };

  /* ---------- 层 1 / 2：解析 + 净化 ---------- */
  function sanitize(v, depth = 0, seen = new WeakSet()) {
    if (v == null || typeof v === 'boolean') return v;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string') return v.slice(0, MAX_STR);
    if (typeof v !== 'object' || depth > MAX_DEPTH || seen.has(v)) return null; // 函数 / 循环引用 / 过深 → 剥掉
    seen.add(v);
    if (Array.isArray(v)) return v.slice(0, MAX_ARR).map(x => sanitize(x, depth + 1, seen));
    const o = {};
    for (const k of Object.keys(v).slice(0, 200)) if (!BAN.test(k)) { const x = sanitize(v[k], depth + 1, seen); if (x !== null || v[k] === null) o[k] = x; }
    return o;
  }
  const unfence = s => { const m = String(s).trim().match(/^```(?:json|mxui|ui_schema)?[ \t]*\n([\s\S]*?)\n?```$/i); return m ? m[1] : String(s).trim(); };
  // 返回 { mode:'text', text } | { mode:'ui', text, cards:[{ cardType, title, initialData, w, err? }], errors:[] }；永不抛错
  function parse(raw) {
    let j = raw;
    if (typeof raw === 'string') { try { j = JSON.parse(unfence(raw)); } catch { return { mode: 'text', text: String(raw), errors: ['E_UISCHEMA_INVALID'] }; } }
    j = sanitize(obj(j));
    const ty = String(j.type || j.intent || j.mode || '').toLowerCase();
    const text = str(j.text ?? j.message ?? j.content, '');
    const list = arr(j.cards || j.tools || j.widgets || j.ui || j.items);
    if (/^(text|chat_only|chat)$/.test(ty) || (!list.length && !/ui/.test(ty))) return { mode: 'text', text, errors: [] };
    const errors = [], cards = [];
    if (j.catalogVersion && String(j.catalogVersion).split('.')[0] !== CATALOG_VERSION.split('.')[0]) errors.push('E_CATALOG_VERSION');
    for (const c0 of list) {
      const c = obj(c0), name = str(c.cardType || c.tool || c.name || c.kind || c.widget, '');
      const cardType = TYPE_OF[name.replace(/[\s_-]/g, '').toLowerCase()] || null;
      const initialData = obj(c.initialData || c.props || c.data || c.initial);
      const title = str(c.title, '', 80), w = int(obj(c.gridHint || c.grid || c.layout).w ?? c.w, 1) >= 2 ? 2 : 1;
      if (cards.length >= Math.min(MAX_CARDS, lim('wbCards', MAX_CARDS))) { errors.push('E_TOO_MANY_CARDS'); break; }
      if (!cardType) { cards.push({ cardType: null, name, title, initialData, w, err: 'E_CATALOG_MISS' }); continue; }
      if (JSON.stringify(initialData).length > MAX_INIT) { cards.push({ cardType, title, initialData: {}, w, err: 'E_UISCHEMA_INVALID' }); continue; }
      cards.push({ cardType, title, initialData, w });
    }
    if (!cards.length) return { mode: 'text', text, errors: errors.concat('E_UISCHEMA_EMPTY') };
    return { mode: 'ui', text, cards, errors };
  }
  // 是不是一段 UISchema（整段回答是 JSON 时用来判断要不要接管渲染）
  const looks = s => { const t = unfence(s || ''); if (!/^\{[\s\S]*\}$/.test(t)) return false; try { const j = JSON.parse(t); return !!j && typeof j === 'object' && /^(text|ui_schema|chat_only|spawn_cards)$/i.test(String(j.type || j.intent || '')); } catch { return false; } };

  /* ---------- 层 4：宽容读取（缺省取默认，类型不符不抛） ---------- */
  const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  const FIELD_TYPES = ['text', 'textarea', 'number', 'email', 'tel', 'url', 'date', 'time', 'select', 'radio', 'checkbox', 'checkboxes', 'switch'];
  const READ = {
    ApiTracer: d => {
      let h = d.headers; if (Array.isArray(h)) h = Object.fromEntries(h.map(x => Array.isArray(x) ? x : [x?.key ?? x?.name, x?.value]));
      const headers = Object.entries(obj(h)).filter(([k]) => k).slice(0, 40).map(([k, v]) => [str(k, '', 200), str(v, '', 4000)]);
      const m = str(d.method, 'GET').toUpperCase();
      let body = d.body; if (body && typeof body === 'object') body = JSON.stringify(body, null, 2);
      return { method: METHODS.includes(m) ? m : 'GET', url: str(d.url || d.endpoint, '', 4000), headers, body: str(body, '') };
    },
    KanbanBoard: d => {
      let cols = arr(d.columns).map((c, i) => (typeof c === 'string' ? { id: 'c' + i, title: c } : { id: str(obj(c).id, 'c' + i, 40) || 'c' + i, title: str(obj(c).title || obj(c).name, '列 ' + (i + 1), 40) }));
      if (cols.length < 1) cols = [{ id: 'todo', title: T('待办') }, { id: 'doing', title: T('进行中') }, { id: 'done', title: T('已完成') }];
      cols = cols.slice(0, 5).filter((c, i, a) => a.findIndex(x => x.id === c.id) === i);
      const ids = new Set(cols.map(c => c.id));
      const cards = arr(d.cards || d.tasks).map((c, i) => { const o = typeof c === 'string' ? { title: c } : obj(c); const col = str(o.columnId || o.column || o.status, ''); return { id: str(o.id, 'k' + i, 40) || 'k' + i, columnId: ids.has(col) ? col : (cols.find(x => x.title === col) || cols[0]).id, title: str(o.title || o.name, T('未命名'), 200), tags: arr(o.tags || o.labels).map(t => str(t, '', 20)).filter(Boolean).slice(0, 4), order: int(o.order, i) }; });
      return { title: str(d.title, '', 80), columns: cols, cards };
    },
    VideoEditor: d => ({ projectName: str(d.projectName || d.name, T('未命名项目'), 80), suggestedCuts: arr(d.suggestedCuts || d.cuts).map(c => (typeof c === 'number' ? { atMs: int(c), reason: '' } : { atMs: int(obj(c).atMs ?? obj(c).ms ?? (obj(c).sec ?? obj(c).seconds) * 1000), reason: str(obj(c).reason || obj(c).note, '', 120) })).filter(c => c.atMs >= 0).slice(0, 50) }),
    CodeDiff: d => { const l = obj(d.left), r = obj(d.right); return { left: { path: str(l.path || d.leftPath, 'left', 300), content: str(l.content ?? d.leftContent, '', 200000) }, right: { path: str(r.path || d.rightPath || l.path, 'right', 300), content: str(r.suggestedContent ?? r.content ?? d.rightContent, '', 200000), aiSuggested: r.suggestedContent != null } }; },
    GenerativeForm: d => ({
      title: str(d.title, '', 80), description: str(d.description, '', 600), submitLabel: str(d.submitLabel, T('提交'), 30),
      fields: arr(d.fields).slice(0, 40).map((f0, i) => { const f = typeof f0 === 'string' ? { label: f0 } : obj(f0); const type = FIELD_TYPES.includes(str(f.type).toLowerCase()) ? str(f.type).toLowerCase() : 'text'; return { key: str(f.key || f.name || f.id, 'f' + i, 60) || 'f' + i, label: str(f.label || f.title || f.key || f.name, T('字段') + ' ' + (i + 1), 120), type, required: !!f.required, placeholder: str(f.placeholder, '', 120), help: str(f.help || f.hint, '', 200), options: arr(f.options).map(o => (typeof o === 'object' && o ? { value: str(o.value ?? o.label, ''), label: str(o.label ?? o.value, '') } : { value: str(o, ''), label: str(o, '') })).filter(o => o.value).slice(0, 50), min: f.min == null ? null : int(f.min, null), max: f.max == null ? null : int(f.max, null), value: f.default ?? f.value ?? null }; }).filter((f, i, a) => a.findIndex(x => x.key === f.key) === i),
    }),
  };

  /* ---------- 封存：白名单投影 + 规范 JSON + sha256 ---------- */
  function canonical(v) { // 键排序、无空白；数字必须是 JS safe integer，否则跨语言规范化会分叉 → 拒绝封存
    if (v === null || typeof v === 'boolean') return JSON.stringify(v);
    if (typeof v === 'number') { if (!Number.isSafeInteger(v) || Object.is(v, -0)) throw Object.assign(new Error('E_NUM_UNSAFE'), { code: 'E_NUM_UNSAFE' }); return String(v); }
    if (typeof v === 'string') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  }
  async function sha256(data) {
    const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    if (!G.crypto?.subtle) return null;
    const h = await G.crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const PROJ = {
    ApiTracer: s => { const o = s.observed || {}; return { method: s.req.method, url: s.req.url.replace(/([?&](?:token|key|api_key|apikey|access_token|sig|signature)=)[^&#]*/gi, '$1***'), requestHeaderKeys: s.req.headers.map(h => h[0]).filter(Boolean), sentAt: o.sentAt ?? null, status: o.status ?? null, durationMs: o.durationMs ?? null, responseHeaderKeys: Object.keys(o.responseHeaders || {}), responseBodyHash: o.bodyHash ?? null } },
    KanbanBoard: s => ({ columns: s.columns.map(c => ({ id: c.id, title: c.title })), cards: s.cards.map(c => ({ id: c.id, title: c.title, columnId: c.columnId, order: c.order })), moves: (s.observed.moves || []).map(m => ({ cardId: m.cardId, from: m.from, to: m.to, at: m.at })) }),
    VideoEditor: s => { const o = s.observed || {}; return { source: o.source ? { name: o.source.name, sha256: o.source.sha256 ?? null, durationMs: o.source.durationMs } : null, clips: (o.clips || []).map(c => ({ id: c.id, inMs: c.inMs, outMs: c.outMs })), durationMs: (o.clips || []).reduce((n, c) => n + c.outMs - c.inMs, 0) }; },
    CodeDiff: s => ({ paths: { left: s.left.path, right: s.right.path }, hunks: (s.hunks || []).map(h => h.id), decisions: { ...(s.observed.decisions || {}) }, leftHash: s.leftHash ?? null, rightHash: s.rightHash ?? null, rightAiGenerated: !!s.right.aiSuggested }),
    GenerativeForm: s => ({ fields: s.fields.map(f => ({ key: f.key, type: f.type })), values: s.observed.submitted ? s.observed.values : null, submittedAt: s.observed.submittedAt ?? null }),
  };
  async function seal(cardType, st) {
    const payload = { cardType, catalogVersion: CATALOG_VERSION, data: PROJ[cardType](st), ai_generated_initial: true, sealedAt: now(), self_declared: true };
    const c = canonical(payload);
    return { payload, hash: await sha256(c), canonical: c };
  }

  /* ---------- 本机状态（按 instanceId 隔离） ---------- */
  const mem = new Map();
  const KEY = 'mxui:';
  const load = k => { if (mem.has(k)) return mem.get(k); let v = null; try { v = JSON.parse(localStorage.getItem(KEY + k) || 'null'); } catch {} if (v) mem.set(k, v); return v; };
  const store = (k, v) => { mem.set(k, v); try { const s = JSON.stringify(v); if (s.length < 300000) localStorage.setItem(KEY + k, s); } catch {} };
  const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  let spawnSeq = 0;

  /* ---------- 流式中的半截 JSON：补齐引号 / 括号，解析出「目前为止」的结构，用来实时渲染 ---------- */
  function partialJSON(src) {
    let s = String(src || '').replace(/^\s*```[a-z_]*[ \t]*\n?/i, '').replace(/\n?```\s*$/, '');
    const i0 = s.indexOf('{'); if (i0 < 0) return null; s = s.slice(i0);
    for (let cut = s.length, tries = 0; cut > 0 && tries < 12; tries++) {
      const t = s.slice(0, cut), st = []; let inS = false, esc = false;
      for (const ch of t) { if (inS) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inS = false; continue; } if (ch === '"') inS = true; else if (ch === '{' || ch === '[') st.push(ch); else if (ch === '}' || ch === ']') st.pop(); }
      let u = inS ? (esc ? t.slice(0, -1) : t) + '"' : t.replace(/[,:\s]+$/, '');
      try { return JSON.parse(u + st.reverse().map(c => (c === '{' ? '}' : ']')).join('')); } catch {}
      const c = t.lastIndexOf(','), b = Math.max(t.lastIndexOf('{'), t.lastIndexOf('['));
      cut = c > b ? c : b + 1 < cut ? b + 1 : b;
    }
    return null;
  }

  /* ---------- 组（一次回答里的一个 ```mxui / ```mxlab 块 = 一组工作台）---------- */
  const groups = new Map(); // key → { key, text, cards:[spec] }
  const specs = new Map();  // cardKey → spec
  const lives = [];         // 正在流式生成的组 { key, src, done }
  const groupTitle = g => g.text || g.cards.map(c => c.title).filter(Boolean)[0] || T(LABEL[g.cards[0]?.cardType] || '工作台');
  function register(key, p) {
    const g = groups.get(key) || { key };
    g.text = p.text; g.cards = p.cards; groups.set(key, g);
    p.cards.forEach((c, i) => { const k = key + '.' + i, old = specs.get(k); specs.set(k, { ...c, id: old?.id || (c.cardType || 'Text') + '#' + ++spawnSeq }); });
    return g;
  }
  const userCards = key => (load('add:' + key) || []).map(a => ({ k: key + '.u' + a.i, t: a.t }));
  const chip = (g, building) => `<button type="button" class="mxui-chip${building ? ' live' : ''}${Pane.open.includes(g.key) ? ' on' : ''}" data-g="${E(g.key)}"><span class="mxui-chip-ic">${g.cards.slice(0, 5).map(c => `<i>${ICON[c.cardType] || '?'}</i>`).join('') || '<i>…</i>'}</span><span class="mxui-chip-t">${E(groupTitle(g))}</span>${g.cards.length > 1 ? `<span class="mxui-chip-n">${g.cards.length}</span>` : ''}<span class="mxui-chip-go">›</span></button>`;

  /* ---------- 渲染入口（聊天里只放一枚入口芯片；工作台在右边的切分窗口里，可同时开多组） ---------- */
  function render(raw, opt = {}) {
    const s = typeof raw === 'string' ? raw : JSON.stringify(raw);
    if (opt.live) return feedLive(s, () => { const j = partialJSON(s), p = j ? parse(j) : null; return p && p.mode === 'ui' ? p : null; });
    const p = parse(raw);
    if (p.mode === 'text' && !p.errors.includes('E_UISCHEMA_INVALID')) return opt.textHtml ? opt.textHtml(p.text) : `<p>${E(p.text)}</p>`;
    const q = p.mode === 'ui' ? p : { text: '', cards: [{ cardType: null, title: T('工作台'), initialData: {}, w: 1, err: 'E_UISCHEMA_INVALID' }] };
    return finish(s, q);
  }
  // ```mxlab 块：头部几行 key: value，然后一行 ---，下面是可运行的 HTML / JS（学习窗口）
  // 代码块头部：几行 key: value，一行 ---，下面是代码；头还没写完（流式）就先不画
  function parseHead(raw) {
    const s = String(raw || ''), m = s.match(/^((?:[ \t]*(?:title|libs|subject|标题|库)[ \t]*[:：][^\n]*\n)+)[ \t]*-{3,}[ \t]*\n?/i);
    const head = {}; if (m) m[1].split('\n').forEach(l => { const x = l.match(/^\s*([^:：]+)[:：]\s*(.*)$/); if (x) head[x[1].trim().toLowerCase()] = x[2].trim(); });
    const body = m ? s.slice(m[0].length) : /^\s*(title|libs)\s*[:：]/i.test(s) && !/\n\s*-{3,}/.test(s) ? '' : s;
    const list = v => String(v || '').split(/[,，\s]+/).filter(Boolean);
    return { title: str(head.title || head['标题'], '', 80), libs: list(head.libs || head['库']), body };
  }
  function parseLab(raw) {
    const h = parseHead(raw);
    return { mode: 'ui', text: '', errors: [], cards: [{ cardType: 'Lab', title: h.title, w: 2, initialData: { title: h.title, libs: h.libs, source: h.body } }] };
  }
  function lab(raw, opt = {}) {
    const s = String(raw || '');
    if (opt.live) return feedLive(s, () => parseLab(s));
    return finish(s, parseLab(s));
  }
  function finish(s, q) {
    const key = hashStr(s);
    const g = register(key, q);
    const e = lives.find(x => !x.done && s.length >= x.src.length && s.startsWith(x.src.slice(0, 48)));
    if (e) finalizeLive(e, key, g); // 流式结束：实时卡片原地转成可交互的
    return chip(g);
  }
  const pending = () => `<button type="button" class="mxui-chip live" disabled><span class="mxui-chip-ic"><i>…</i></span></button>`;

  function feedLive(s, build) {
    let e = lives.find(x => !x.done && s.length >= x.src.length && s.startsWith(x.src.slice(0, Math.min(48, x.src.length))));
    if (!e) { e = { key: 'live.' + uidS(), src: s, done: false }; lives.push(e); if (lives.length > 20) lives.shift(); }
    e.src = s;
    const p = build(), g = groups.get(e.key) || { key: e.key, text: '', cards: [] };
    if (p) { g.text = p.text; g.cards = p.cards.filter(c => c.cardType); g.cards.forEach((c, i) => specs.set(e.key + '.' + i, { ...c, id: specs.get(e.key + '.' + i)?.id || c.cardType + '#' + ++spawnSeq })); }
    groups.set(e.key, g);
    if (g.cards.length && G.document) { Pane.live.add(e.key); if (!Pane.open.includes(e.key) && !e.closed) Pane.show(e.key, { live: true }); else Pane.sync(); }
    return chip(g, true);
  }
  function finalizeLive(e, key, g) {
    e.done = true; Pane.live.delete(e.key); groups.delete(e.key);
    const i = Pane.open.indexOf(e.key); if (i < 0) return;
    Pane.open[i] = key;
    cardsOf(e.key).forEach(el => { const n = el.dataset.mxui.slice(e.key.length + 1); el.dataset.mxui = key + '.' + n; delete el.dataset.on; el.classList.remove('live'); });
    Pane.cursor(null); Pane.sync();
  }
  const cardsOf = key => [...(Pane.grid?.children || [])].filter(el => el.dataset.mxui === key || el.dataset.mxui?.startsWith(key + '.'));
  // 停靠面板：别的模块（cards.js 的对话卡片区）把自己的面板放进同一个切分窗口，作为一个固定标签，不再另开抽屉
  const docks = new Map(); // 'dock:<名>' → { el, onHide }
  function dock(name, el, o = {}) {
    const key = 'dock:' + name;
    el.dataset.mxui = key; el.classList.add('mxui-card', 'w2', 'mxw-dock');
    docks.set(key, { el, onHide: o.onHide });
    groups.set(key, { key, text: o.title || name, cards: [], icon: o.icon || '▤' });
    return { show: () => Pane.show(key), hide: () => Pane.open.includes(key) && Pane.hideGroup(key), isOpen: () => Pane.isOpen() && Pane.open.includes(key), title: t => { groups.get(key).text = t; Pane.marks(); } };
  }
  const dockHidden = keys => keys.forEach(k => docks.get(k)?.onHide?.());

  /* ---------- 切分窗口：主窗口一分为二，右边是工作台（可拖动分隔条调宽度；手机上整屏滑入）；可同时开多组 ---------- */
  const W_KEY = 'mc_mxw_w';
  const LS0 = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  const hostEl = () => document.getElementById('app') || document.body;
  const Pane = {
    el: null, grid: null, open: [], live: new Set(), hidden: new Set(),
    ensure() {
      if (this.el) return this.el;
      const host = hostEl();
      const el = document.createElement('section'); el.id = 'mxWork'; el.className = 'mxui'; el.setAttribute('aria-label', T('工作台'));
      el.innerHTML = `<div class="mxw-resize" title="${E(T('拖动调宽度'))}"></div><div class="mxw-in"><div class="mxw-bar"><span class="mxw-dot"></span><div class="mxw-tabs"></div><span class="sp"></span><div class="mxw-add"><button type="button" class="mxw-ib" data-w="add" title="${E(T('添加工作台'))}">＋</button><div class="mxw-menu" hidden>${[...ADDABLE].map(t => `<button type="button" data-add="${t}"><i>${ICON[t]}</i>${E(T(LABEL[t]))}</button>`).join('')}</div></div><button type="button" class="mxw-ib" data-w="export" title="${E(T('导出全部凭证'))}">⤓</button><button type="button" class="mxw-ib" data-w="close" title="${E(T('收起'))}">✕</button></div><div class="mxw-grid"></div><div class="mxw-nav"><button type="button" class="mxw-ib" data-w="prev" aria-label="${E(T('上一个'))}">‹</button><span class="mxw-pos"></span><button type="button" class="mxw-ib" data-w="close" aria-label="${E(T('返回'))}">↩</button><button type="button" class="mxw-ib" data-w="next" aria-label="${E(T('下一个'))}">›</button></div><div class="mxw-cursor" hidden></div></div>`;
      host.append(el);
      this.el = el; this.grid = el.querySelector('.mxw-grid');
      const pos = () => { const n = this.grid.children.length, i = Math.round(this.grid.scrollLeft / Math.max(1, this.grid.clientWidth)); el.querySelector('.mxw-pos').textContent = n > 1 ? (i + 1) + ' / ' + n : ''; };
      this.grid.addEventListener('scroll', () => requestAnimationFrame(pos), { passive: true }); this.pos = pos;
      const w = +(LS0.get(W_KEY) || 0); if (w) host.style.setProperty('--mxw', w + 'px');
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-w],[data-add],[data-tab]'); if (!b) { if (!e.target.closest('.mxw-add')) el.querySelector('.mxw-menu').hidden = true; return; }
        if (b.dataset.w === 'close') this.hide();
        else if (b.dataset.w === 'prev' || b.dataset.w === 'next') this.grid.scrollBy({ left: (b.dataset.w === 'next' ? 1 : -1) * this.grid.clientWidth, behavior: 'smooth' }); // 手机：一次一张，左右切换
        else if (b.dataset.w === 'export') exportReceipts();
        else if (b.dataset.w === 'add') { const m = el.querySelector('.mxw-menu'); m.hidden = !m.hidden; }
        else if (b.dataset.add) { el.querySelector('.mxw-menu').hidden = true; this.addCard(b.dataset.add); }
        else if (b.dataset.tab) { if (e.target.closest('[data-x]')) this.hideGroup(b.dataset.tab); else cardsOf(b.dataset.tab)[0]?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
      });
      el.querySelector('.mxw-resize').addEventListener('pointerdown', e => { // 分隔条：拖动时关掉过渡，跟手
        e.preventDefault(); const box = host.getBoundingClientRect(); host.classList.add('mxw-drag');
        const mv = ev => host.style.setProperty('--mxw', Math.round(Math.max(340, Math.min(box.right - ev.clientX, box.width - 380))) + 'px');
        const up = () => { host.classList.remove('mxw-drag'); removeEventListener('pointermove', mv); removeEventListener('pointerup', up); const w = parseInt(getComputedStyle(host).getPropertyValue('--mxw')); if (w) LS0.set(W_KEY, w); };
        addEventListener('pointermove', mv); addEventListener('pointerup', up);
      });
      return el;
    },
    isOpen() { return !!this.el && hostEl().classList.contains('mxw-open'); },
    marks() {
      document.querySelectorAll('.mxui-chip[data-g]').forEach(c => c.classList.toggle('on', this.open.includes(c.dataset.g) && this.isOpen()));
      document.querySelectorAll('.mxui-chip[data-mxc-open]').forEach(c => c.classList.toggle('on', this.open.includes('dock:cards') && this.isOpen()));
      if (!this.el) return;
      const tabs = this.open.map(k => groups.get(k)).filter(Boolean);
      this.el.querySelector('.mxw-tabs').innerHTML = tabs.map(g => `<button type="button" class="mxw-tab${this.live.has(g.key) ? ' live' : ''}" data-tab="${E(g.key)}"><span>${E(groupTitle(g))}</span>${tabs.length > 1 ? '<i data-x title="收起">✕</i>' : ''}</button>`).join('');
      this.el.classList.toggle('live', tabs.some(g => this.live.has(g.key)));
    },
    show(key, o = {}) {
      if (!groups.get(key)) return;
      this.ensure();
      const wasOpen = this.isOpen();
      if (!wasOpen) { this.open = this.open.filter(k => groups.has(k)); [...this.grid.children].forEach(c => c.remove()); }
      if (!this.open.includes(key)) this.open.push(key);
      cardsOf(key).length || groups.get(key).cards.forEach((c, i) => this.hidden.delete(key + '.' + i));
      this.sync(!wasOpen);
      if (!wasOpen) requestAnimationFrame(() => { hostEl().classList.add('mxw-open'); this.marks(); });
      else { this.marks(); setTimeout(() => cardsOf(key)[0]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 80); }
    },
    hideGroup(key) {
      const l = lives.find(x => x.key === key); if (l) l.closed = true; // 用户自己收起的实时组：别再自动弹回来
      this.open = this.open.filter(k => k !== key); dockHidden([key]);
      if (!this.open.length) return this.hide();
      this.sync(); this.marks();
    },
    hide() {
      lives.forEach(l => { if (this.open.includes(l.key)) l.closed = true; });
      const was = this.open; hostEl().classList.remove('mxw-open'); this.open = []; this.marks(); this.cursor(null); dockHidden(was);
      clearTimeout(this._t); this._t = setTimeout(() => { if (!this.isOpen() && this.grid) [...this.grid.children].forEach(c => c.remove()); }, 600); // 收起动画结束再释放（沙盒 iframe 等）
    },
    // 按 open 的顺序把每组的卡片放进网格：缺的补上（带入场动画），多的移除；已有的不挪动（挪动会让沙盒重新加载）
    sync(first) {
      if (!this.grid) return;
      const want = [];
      for (const gk of this.open) {
        const g = groups.get(gk); if (!g) continue; const isLive = this.live.has(gk);
        if (docks.has(gk)) { want.push({ k: gk, dock: docks.get(gk).el }); continue; }
        g.cards.forEach((c, i) => { const k = gk + '.' + i; if (!this.hidden.has(k)) want.push({ k, c, isLive }); });
        if (!isLive) userCards(gk).forEach(u => want.push({ k: u.k }));
      }
      const have = new Map([...this.grid.children].map(el => [el.dataset.mxui, el])); let n = 0;
      for (const w of want) {
        if (w.dock) { // 停靠面板：整块放进来（不重画它的内容）
          if (w.dock.parentNode !== this.grid) { w.dock.classList.add('mxw-enter'); w.dock.style.animationDelay = (first ? 140 : 0) + n++ * 70 + 'ms'; w.dock.addEventListener('animationend', () => w.dock.classList.remove('mxw-enter'), { once: true }); this.grid.append(w.dock); }
          continue;
        }
        let el = have.get(w.k);
        if (!el) {
          el = document.createElement('section'); el.className = 'mxui-card mxw-enter'; el.dataset.mxui = w.k;
          el.style.animationDelay = (first ? 140 : 0) + n++ * 70 + 'ms';
          el.addEventListener('animationend', () => el.classList.remove('mxw-enter'), { once: true });
          this.grid.append(el);
        }
        if (w.isLive) { el.classList.add('live'); el.classList.toggle('w2', w.c.w === 2); drawLive(el, w.c); }
        else if (!el.dataset.on) mount(el);
      }
      const keep = new Set(want.map(w => w.k));
      have.forEach((el, k) => { if (!keep.has(k)) el.remove(); });
      this.marks(); this.pos?.();
    },
    // 「模型的手」：一个光标移到正在被填写的地方
    cursor(target) {
      const c = this.el?.querySelector('.mxw-cursor'); if (!c) return;
      if (!target) { c.hidden = true; return; }
      const box = this.el.querySelector('.mxw-in').getBoundingClientRect(), r = target.getBoundingClientRect();
      const x = Math.min(r.right - 6, r.left + Math.max(10, Math.min(r.width - 6, measure(target)))), y = r.top + Math.min(r.height / 2, 14);
      c.hidden = false; c.style.transform = `translate(${x - box.left}px,${y - box.top}px)`;
    },
    addCard(t) {
      const key = [...this.open].reverse().find(k => !this.live.has(k)); if (!key) return;
      const list = load('add:' + key) || [];
      const cap = lim('wbCards', 16), have = (groups.get(key)?.cards.length || 0) + list.length; if (have >= cap) return gate(T('每组最多 ') + cap + T(' 个工作台'));
      const n = list.reduce((m, a) => Math.max(m, a.i + 1), 0); list.push({ t, i: n }); store('add:' + key, list);
      specs.set(key + '.u' + n, { cardType: t, title: '', initialData: {}, w: 1, id: t + '#' + ++spawnSeq });
      this.sync(); this.grid.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
  };
  function measure(el) { // 输入框里文字的大致宽度：光标停在字的末尾
    if (!('value' in el) || el.tagName === 'SELECT') return el.getBoundingClientRect().width;
    const c = measure.c ||= document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(el); c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const line = String(el.value).split('\n').pop(); return parseFloat(cs.paddingLeft) + c.measureText(line).width + 2;
  }

  /* ---------- 实时渲染：每来一段，就把真实的工具界面按「目前为止」的数据重画；新出现的元素弹入、变化的元素高亮，光标跟着走 ---------- */
  const LIVE_SEL = '.mxui-hd b,[data-f],.mxui-kv,.kb-col,.kb-card,.gf-f,.ve-sug-chip,.mxui-res';
  function snap(root) {
    const m = new Map(), cnt = {};
    root.querySelectorAll(LIVE_SEL).forEach(e => {
      const id = e.dataset.id || e.dataset.col || e.dataset.f || e.querySelector?.('[name]')?.getAttribute('name') || '';
      const base = e.className.split(' ')[0] + ':' + id, n = (cnt[base] = (cnt[base] || 0) + 1);
      m.set(base + '#' + n, { e, v: 'value' in e && e.tagName !== 'BUTTON' ? e.value : e.textContent });
    });
    return m;
  }
  function drawLive(el, spec) {
    const tool = TOOLS[spec.cardType]; if (!tool) return;
    if (tool.self) return tool.live(el, spec);
    el._spec = spec;
    if (el._raf) return;
    el._raf = requestAnimationFrame(() => {
      el._raf = 0;
      const sp = el._spec;
      try {
        const st = { ...tool.init(READ[sp.cardType](clone(sp.initialData))), observed: {}, sealed: null, live: true };
        const prev = el._snap || new Map();
        el.innerHTML = head(sp, st, tool) + `<div class="mxui-body">${tool.view(st, true, { runtime: {}, live: true })}</div>`;
        el.querySelectorAll('input,textarea,select,button').forEach(x => (x.tabIndex = -1));
        const cur = snap(el); let last = null;
        cur.forEach((x, k) => { const p = prev.get(k); if (!p) { x.e.classList.add('mx-new'); last = x.e; } else if (p.v !== x.v) { x.e.classList.add('mx-hot'); last = x.e; } });
        el._snap = cur;
        if (last) { if (last.tagName === 'TEXTAREA') last.scrollTop = last.scrollHeight; if (last.tagName === 'INPUT') last.scrollLeft = 1e6; Pane.cursor(last); }
      } catch (e) { logSafe(e); }
    });
  }
  const sealBadge = st => st.sealed ? `<span class="mxui-seal" title="${E((st.sealed.via === 'chat' ? T('已随对话封存，只读') + ' · chain_head ' : T('已封存，只读') + ' · sha256 ') + (st.sealed.hash || ''))}">🔒 ${E(String(st.sealed.hash || '').replace(/^sha256:/, '').slice(0, 6))}</span>` : '';
  const head = (spec, st, tool) => `<div class="mxui-hd"><span class="mxui-ic"${tool.out && !st.live ? ` draggable="true" data-link title="${E(T('拖到另一张卡片上：把结果交给它'))}"` : ''}>${ICON[spec.cardType]}</span><b>${E(spec.title || tool.title?.(st) || T(LABEL[spec.cardType]))}</b>${st.live ? '<span class="mxui-pulse"></span>' : sealBadge(st)}</div>`;

  function fallbackHtml(spec, code) {
    return `<div class="mxui-hd"><span class="mxui-ic">!</span><b>${E(spec.title || spec.name || T('工作台'))}</b><span class="mxui-type" title="${E(T('没能生成这个工作台'))}">${E(code)}</span></div><div class="mxui-body"><p class="mxui-muted">${E(T('没能生成这个工作台'))}</p></div>`;
  }

  function mount(el) {
    el.dataset.on = '1';
    const k = el.dataset.mxui, spec = specs.get(k);
    if (!spec) { el.innerHTML = fallbackHtml({ title: T('工作台') }, 'E_STATE_LOST'); return; }
    if (spec.err || !spec.cardType) { el.classList.add('fb'); el.innerHTML = fallbackHtml(spec, spec.err || 'E_CATALOG_MISS'); return; }
    el.classList.toggle('w2', spec.w === 2);
    const tool = TOOLS[spec.cardType];
    const fresh = () => ({ v: 1, type: spec.cardType, id: spec.id, ...tool.init(READ[spec.cardType](clone(spec.initialData))), observed: {}, sealed: null });
    let st = load(k);
    try { if (!st || st.v !== 1 || st.type !== spec.cardType) { st = fresh(); store(k, st); } }
    catch (e) { logSafe(e); el.classList.add('fb'); el.innerHTML = fallbackHtml(spec, 'E_UISCHEMA_INVALID'); return; }
    const user = /\.u\d+$/.test(k);
    const ctx = el._ctx = {
      el, k, spec, user, get st() { return st; },
      set(patch, rerender = true) { if (st.sealed) return; st = { ...st, ...patch }; store(k, st); if (rerender) ctx.redraw?.(); },
      obs(patch, rerender = true) { if (st.sealed) return; st = { ...st, observed: { ...st.observed, ...patch } }; store(k, st); if (rerender) ctx.redraw?.(); },
      toast: m => (typeof G.toast === 'function' ? G.toast(m) : logSafe(m)),
      runtime: {},
      reset() { for (const x in ctx.runtime) delete ctx.runtime[x]; st = fresh(); store(k, st); },
      async sealNow() {
        try { const r = await seal(spec.cardType, st); st = { ...st, sealed: { hash: r.hash, at: r.payload.sealedAt, payload: r.payload } }; store(k, st); ctx.redraw?.(); ctx.toast(T('已封存')); }
        catch (err) { ctx.toast(err.code === 'E_NUM_UNSAFE' ? T('数字须为整数才能封存') : T('封存失败')); logSafe(err); }
      },
      async copySeal() { try { await navigator.clipboard.writeText(JSON.stringify({ ...st.sealed.payload, sha256: st.sealed.hash }, null, 2)); ctx.toast(T('已复制')); } catch { ctx.toast(T('复制失败')); } },
      close() {
        if (user) { const m = k.match(/^(.*)\.u(\d+)$/); store('add:' + m[1], (load('add:' + m[1]) || []).filter(x => x.i !== +m[2])); try { localStorage.removeItem(KEY + k); } catch {} mem.delete(k); }
        else Pane.hidden.add(k);
        el.classList.add('mxw-leave'); setTimeout(() => { el.remove(); if (!Pane.grid.children.length) Pane.hide(); }, 220);
      },
    };
    if (tool.self) return tool.mount(el, ctx);
    const draw = () => {
      try {
        const ro = !!st.sealed;
        el.classList.toggle('sealed', ro);
        el.innerHTML = head(spec, st, tool) + `<div class="mxui-body">${tool.view(st, ro, ctx)}</div>
          <div class="mxui-ft">${ro ? `<button type="button" class="mxw-ib" data-a="copy-seal" title="${E(T('复制封存记录'))}">⧉</button>` : `<button type="button" class="mxw-ib" data-a="reset" title="${E(T('重置'))}">↺</button><button type="button" class="mxw-ib" data-a="seal" title="${E(T('封存（之后只读）'))}">🔒</button>`}<button type="button" class="mxw-ib" data-a="close" title="${E(T('收起'))}">✕</button></div>`;
        tool.bind?.(el, st, ro, ctx);
        if (ro) el.querySelectorAll('.mxui-body input,.mxui-body textarea,.mxui-body select,.mxui-body button:not([data-ro])').forEach(x => (x.disabled = true));
      } catch (e) { logSafe(e); el.classList.add('fb'); el.innerHTML = fallbackHtml(spec, 'E_CARD_CRASH'); } // 单卡崩溃只降级这一张
    };
    ctx.redraw = draw;
    el.addEventListener('click', e => {
      const a = e.target.closest('.mxui-ft [data-a]')?.dataset.a; if (!a) return;
      if (a === 'close') ctx.close();
      else if (a === 'reset') { ctx.reset(); draw(); }
      else if (a === 'seal') ctx.sealNow();
      else if (a === 'copy-seal') ctx.copySeal();
    });
    draw();
  }
  function scan() {} // 兼容旧入口：卡片只在工作台窗口里挂载

  /* ---------- 工具 1：ApiTracer（极简 Postman） ---------- */
  const fmtBytes = n => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
  function jsonTree(v, depth = 0, budget = { n: 0 }) {
    if (++budget.n > 1500) return '<span class="mxui-muted">…</span>';
    if (v === null || typeof v !== 'object') return `<span class="j-${v === null ? 'n' : typeof v}">${E(JSON.stringify(v))}</span>`;
    const ent = Array.isArray(v) ? v.map((x, i) => [i, x]) : Object.entries(v);
    if (!ent.length) return Array.isArray(v) ? '[]' : '{}';
    const inner = ent.map(([k, x]) => `<div class="j-row">${Array.isArray(v) ? '' : `<span class="j-k">${E(JSON.stringify(k))}</span>: `}${jsonTree(x, depth + 1, budget)}</div>`).join('');
    return `<details${depth < 2 ? ' open' : ''}><summary>${Array.isArray(v) ? `[ ${ent.length} ]` : `{ ${ent.length} }`}</summary><div class="j-in">${inner}</div></details>`;
  }
  const TOOLS = {};
  TOOLS.ApiTracer = {
    out: st => (st.observed.bodyPreview != null ? { kind: 'text', data: String(st.observed.bodyPreview) } : null), // 连线：响应正文交给下一张卡
    init: d => ({ req: d }),
    title: st => st.req.url ? st.req.method + ' ' + st.req.url.replace(/^https?:\/\//, '').slice(0, 40) : '',
    view(st, ro, ctx) {
      const o = st.observed, r = st.req, rt = ctx.runtime;
      const hdr = r.headers.map(([hk, hv], i) => `<div class="mxui-kv" data-i="${i}"><input data-f="hk" value="${E(hk)}" placeholder="Header" spellcheck="false"><input data-f="hv" ${SECRET.test(hk) ? 'type="password" autocomplete="off"' : ''} value="${E(hv)}" placeholder="Value" spellcheck="false"><button type="button" data-a="hdel" title="${E(T('删除'))}">×</button></div>`).join('');
      const cls = o.status ? 's' + String(o.status)[0] : o.error ? 'err' : '';
      let res = '';
      if (rt.busy) res = `<div class="mxui-wait shimmer">${E(T('请求中…'))}</div>`;
      else if (o.error) res = `<div class="mxui-err"><b>${E(o.error)}</b> · ${E(o.error === 'E_NET' ? T('连不上或跨域受限') : o.error === 'E_TIMEOUT' ? T('超时') : T('失败'))}</div>`;
      else if (o.status != null) {
        const body = rt.body ?? o.bodyPreview ?? '';
        let pretty = null; try { pretty = body && /^[\s]*[{[]/.test(body) ? JSON.parse(body) : null; } catch {}
        const tabs = ['body', 'headers', 'timing'].map(t => `<button type="button" data-ro data-tab="${t}" class="${(rt.tab || 'body') === t ? 'on' : ''}">${E(T({ body: 'Body', headers: 'Headers', timing: 'Timing' }[t]))}</button>`).join('');
        const pane = rt.tab === 'headers' ? `<table class="mxui-tbl">${Object.entries(o.responseHeaders || {}).map(([a, b]) => `<tr><td>${E(a)}</td><td>${E(SECRET.test(a) ? '•••' : b)}</td></tr>`).join('') || `<tr><td class="mxui-muted">—</td></tr>`}</table>`
          : rt.tab === 'timing' ? `<table class="mxui-tbl"><tr><td>${E(T('耗时'))}</td><td>${o.durationMs} ms</td></tr><tr><td>${E(T('大小'))}</td><td>${fmtBytes(o.size || 0)}</td></tr><tr><td>${E(T('发送时间（本机）'))}</td><td>${E(new Date(o.sentAt).toLocaleString())}</td></tr><tr><td>sha256</td><td class="mono">${E((o.bodyHash || '').slice(0, 16))}…</td></tr></table>`
          : pretty ? `<div class="mxui-json">${jsonTree(pretty)}</div>` : `<pre class="mxui-pre">${E(body.slice(0, 200000)) || `<span class="mxui-muted">${E(T('（空）'))}</span>`}</pre>${o.truncated ? `<p class="mxui-muted">${E(T('仅预览前 200 KB'))}</p>` : ''}`;
        res = `<div class="mxui-res"><div class="mxui-stat"><span class="mxui-code ${cls}">${o.status}</span><span>${o.durationMs} ms</span><span>${fmtBytes(o.size || 0)}</span></div><div class="mxui-tabs">${tabs}</div>${pane}</div>`;
      }
      return `<div class="mxui-row"><select data-f="method">${METHODS.map(m => `<option${m === r.method ? ' selected' : ''}>${m}</option>`).join('')}</select><input data-f="url" class="grow" value="${E(r.url)}" placeholder="https://api.example.com/…" spellcheck="false"><button type="button" data-a="send" class="pri"${rt.busy ? ' disabled' : ''}>${E(T('发送'))}</button></div>
        <details class="mxui-sub"${r.headers.length ? ' open' : ''}><summary>Headers · ${r.headers.length}</summary>${hdr}<button type="button" data-a="hadd" class="ghost">+ Header</button></details>
        ${['GET', 'HEAD'].includes(r.method) ? '' : `<details class="mxui-sub"${r.body ? ' open' : ''}><summary>Body</summary><textarea data-f="body" rows="4" spellcheck="false" placeholder='{"key":"value"}'>${E(r.body)}</textarea></details>`}
        ${res}`;
    },
    bind(el, st, ro, ctx) {
      const req = () => ctx.st.req;
      el.querySelector('[data-f=method]').onchange = e => ctx.set({ req: { ...req(), method: e.target.value } });
      el.querySelector('[data-f=url]').oninput = e => ctx.set({ req: { ...req(), url: e.target.value } }, false);
      el.querySelector('[data-f=url]').onkeydown = e => { if (e.key === 'Enter') el.querySelector('[data-a=send]').click(); };
      const b = el.querySelector('[data-f=body]'); if (b) b.oninput = e => ctx.set({ req: { ...req(), body: e.target.value } }, false);
      el.querySelectorAll('.mxui-kv').forEach(row => {
        const i = +row.dataset.i;
        row.querySelectorAll('input').forEach(inp => (inp.oninput = () => { const h = req().headers.map(x => [...x]); h[i][inp.dataset.f === 'hk' ? 0 : 1] = inp.value; ctx.set({ req: { ...req(), headers: h } }, false); }));
        row.querySelector('[data-a=hdel]').onclick = () => ctx.set({ req: { ...req(), headers: req().headers.filter((_, j) => j !== i) } });
      });
      el.querySelector('[data-a=hadd]').onclick = () => ctx.set({ req: { ...req(), headers: [...req().headers, ['', '']] } });
      el.querySelectorAll('[data-tab]').forEach(t => (t.onclick = () => { ctx.runtime.tab = t.dataset.tab; ctx.redraw(); }));
      el.querySelector('[data-a=send]').onclick = () => this.send(ctx);
    },
    async send(ctx) {
      const r = ctx.st.req;
      if (!/^https?:\/\//i.test(r.url)) return ctx.toast(T('请填写以 http:// 或 https:// 开头的地址'));
      if (G.HugNet && !(await G.HugNet.allow(r.url))) return ctx.toast(T('已取消')); // 快照版：这是唯一一个由你点「发送」才会联网的卡片，每次都先问你
      ctx.runtime.busy = true; ctx.obs({ error: null });
      const ac = new AbortController(), timer = setTimeout(() => ac.abort(), 30000), sentAt = now(), t0 = performance.now();
      try {
        const headers = new Headers(); r.headers.forEach(([k, v]) => { if (k) try { headers.set(k, v); } catch {} });
        const res = await fetch(r.url, { method: r.method, headers, body: ['GET', 'HEAD'].includes(r.method) ? undefined : r.body || undefined, signal: ac.signal, credentials: 'omit', redirect: 'follow' });
        const buf = new Uint8Array(await res.arrayBuffer()), durationMs = Math.round(performance.now() - t0);
        const text = new TextDecoder().decode(buf.subarray(0, 200 * 1024));
        const responseHeaders = {}; res.headers.forEach((v, k) => (responseHeaders[k] = v));
        ctx.runtime.body = text;
        ctx.runtime.busy = false;
        ctx.obs({ sentAt, status: res.status, durationMs, size: buf.length, responseHeaders, bodyHash: await sha256(buf), bodyPreview: buf.length <= 20 * 1024 ? text : text.slice(0, 20 * 1024), truncated: buf.length > 200 * 1024, error: null });
      } catch (e) {
        ctx.runtime.busy = false; logSafe(e); // 原始异常只进日志（已剥离密钥），上屏只给稳定错误码 + 通用文案
        ctx.obs({ sentAt, status: null, error: e?.name === 'AbortError' ? 'E_TIMEOUT' : 'E_NET' });
      } finally { clearTimeout(timer); }
    },
  };

  /* ---------- 工具 2：KanbanBoard（极简 Trello） ---------- */
  TOOLS.KanbanBoard = {
    init: d => ({ columns: d.columns, cards: d.cards, title0: d.title }),
    title: st => st.title0,
    view(st, ro) {
      const n = st.columns.length;
      return `<div class="mxui-kb" style="--n:${n}">${st.columns.map((c, ci) => {
        const cs = st.cards.filter(x => x.columnId === c.id).sort((a, b) => a.order - b.order);
        return `<div class="kb-col" data-col="${E(c.id)}"><div class="kb-hd"><b${ro ? '' : ' contenteditable="plaintext-only" spellcheck="false"'} data-ct="${E(c.id)}">${E(c.title)}</b><span>${cs.length}</span></div><div class="kb-list">${cs.map(x => `<div class="kb-card" draggable="${!ro}" data-id="${E(x.id)}"><div class="kb-t"${ro ? '' : ' contenteditable="plaintext-only" spellcheck="false"'}>${E(x.title)}</div>${x.tags.length ? `<div class="kb-tags">${x.tags.map(t => `<span>${E(t)}</span>`).join('')}</div>` : ''}${ro ? '' : `<div class="kb-act">${ci > 0 ? `<button type="button" data-mv="-1" title="${E(T('移到左边一列'))}">‹</button>` : ''}${ci < n - 1 ? `<button type="button" data-mv="1" title="${E(T('移到右边一列'))}">›</button>` : ''}<button type="button" data-del title="${E(T('删除'))}">×</button></div>`}</div>`).join('')}</div>${ro ? '' : `<input class="kb-add" placeholder="+ ${E(T('添加卡片'))}" data-add="${E(c.id)}">`}</div>`;
      }).join('')}${!ro && n < 5 ? `<button type="button" class="ghost kb-addcol" data-a="addcol">+ ${E(T('列'))}</button>` : ''}</div>`;
    },
    bind(el, st, ro, ctx) {
      if (ro) return;
      const move = (id, to, before) => {
        const s = ctx.st, c = s.cards.find(x => x.id === id); if (!c) return;
        const from = c.columnId;
        const rest = s.cards.filter(x => x.columnId === to && x.id !== id).sort((a, b) => a.order - b.order);
        const at = before ? rest.findIndex(x => x.id === before) : -1; rest.splice(at < 0 ? rest.length : at, 0, { ...c, columnId: to });
        const ord = new Map(rest.map((x, i) => [x.id, i]));
        const cards = s.cards.map(x => (x.id === id ? { ...x, columnId: to, order: ord.get(id) } : ord.has(x.id) ? { ...x, order: ord.get(x.id) } : x));
        const moves = from === to ? s.observed.moves || [] : [...(s.observed.moves || []), { cardId: id, from, to, at: now() }].slice(-500);
        ctx.set({ cards, observed: { ...s.observed, moves } });
      };
      el.querySelectorAll('.kb-card').forEach(card => {
        card.ondragstart = e => { e.dataTransfer.setData('text/x-mxkb', card.dataset.id); e.dataTransfer.effectAllowed = 'move'; card.classList.add('drag'); };
        card.ondragend = () => card.classList.remove('drag');
        card.onclick = e => {
          const b = e.target.closest('button'); if (!b) return;
          const col = card.closest('.kb-col').dataset.col, cols = ctx.st.columns.map(c => c.id);
          if (b.dataset.mv) move(card.dataset.id, cols[cols.indexOf(col) + +b.dataset.mv]);
          else if (b.hasAttribute('data-del')) ctx.set({ cards: ctx.st.cards.filter(x => x.id !== card.dataset.id) });
        };
      });
      el.querySelectorAll('.kb-col').forEach(col => {
        col.ondragover = e => { if ([...e.dataTransfer.types].includes('text/x-mxkb')) { e.preventDefault(); col.classList.add('over'); } };
        col.ondragleave = () => col.classList.remove('over');
        col.ondrop = e => { e.preventDefault(); col.classList.remove('over'); const id = e.dataTransfer.getData('text/x-mxkb'); const tgt = e.target.closest('.kb-card'); move(id, col.dataset.col, tgt && tgt.dataset.id !== id ? tgt.dataset.id : null); };
      });
      el.querySelectorAll('.kb-t').forEach(t => { t.onblur = () => { const id = t.closest('.kb-card').dataset.id, v = t.textContent.trim().slice(0, 200); if (v) ctx.set({ cards: ctx.st.cards.map(x => (x.id === id ? { ...x, title: v } : x)) }, false); }; t.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); t.blur(); } }; t.ondragstart = e => e.preventDefault(); });
      el.querySelectorAll('[data-ct]').forEach(t => { t.onblur = () => { const v = t.textContent.trim().slice(0, 40); if (v) ctx.set({ columns: ctx.st.columns.map(c => (c.id === t.dataset.ct ? { ...c, title: v } : c)) }, false); }; t.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); t.blur(); } }; });
      const ac = el.querySelector('[data-a=addcol]'); if (ac) ac.onclick = () => ctx.set({ columns: [...ctx.st.columns, { id: 'c' + uidS(), title: T('新列') }] });
      el.querySelectorAll('.kb-add').forEach(inp => (inp.onkeydown = e => {
        if (e.key !== 'Enter' || !inp.value.trim()) return;
        const s = ctx.st; ctx.set({ cards: [...s.cards, { id: 'u' + uidS(), columnId: inp.dataset.add, title: inp.value.trim().slice(0, 200), tags: [], order: s.cards.filter(x => x.columnId === inp.dataset.add).length }] });
        el.querySelector(`.kb-add[data-add="${CSS.escape(inp.dataset.add)}"]`)?.focus();
      }));
    },
  };

  /* ---------- 工具 3：VideoEditor（极简剪映；原件只在本机） ---------- */
  const fmtMs = ms => { ms = Math.max(0, ms | 0); const s = Math.floor(ms / 1000), m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}.${String(Math.floor((ms % 1000) / 100))}`; };
  TOOLS.VideoEditor = {
    init: d => ({ projectName: d.projectName, suggestedCuts: d.suggestedCuts, sel: null }),
    title: st => st.projectName,
    view(st, ro, ctx) {
      const o = st.observed, rt = ctx.runtime, src = o.source, dur = src?.durationMs || 0;
      const clips = o.clips || [], ph = o.playheadMs || 0;
      const pick = `<label class="mxui-btn${ro ? ' dis' : ''}"><input type="file" accept="video/*" hidden${ro ? ' disabled' : ''}>${E(src ? T('换一个视频') : T('选择本机视频'))}</label>`;
      if (!src || !rt.url) return `<div class="ve-empty">${pick}${src ? `<span class="mxui-muted">${E(src.name)} · ${clips.length} ${E(T('段'))}</span>` : `<span class="mxui-muted" title="${E(T('视频只在本机处理，不会上传'))}">${E(T('仅本机'))}</span>`}${st.suggestedCuts.length ? `<div class="ve-chips">${st.suggestedCuts.map(c => `<span class="ve-sug-chip" title="${E(c.reason)}">✂ ${fmtMs(c.atMs)}</span>`).join('')}</div>` : ''}</div>`;
      const pct = ms => (dur ? (ms / dur) * 100 : 0).toFixed(3) + '%';
      const track = clips.map((c, i) => `<div class="ve-clip${st.sel === c.id ? ' on' : ''}" data-clip="${E(c.id)}" style="left:${pct(c.inMs)};width:${pct(c.outMs - c.inMs)}"><span>${i + 1}</span></div>`).join('');
      const sug = st.suggestedCuts.filter(c => c.atMs < dur).map((c, i) => `<div class="ve-sug" style="left:${pct(c.atMs)}" title="${E(T('AI 建议') + ' ' + fmtMs(c.atMs) + (c.reason ? ' · ' + c.reason : ''))}" data-sug="${i}"></div>`).join('');
      const kept = clips.reduce((n, c) => n + c.outMs - c.inMs, 0);
      return `<video class="ve-v" src="${E(rt.url)}" preload="metadata" playsinline></video>
        <div class="ve-tl" title="${E(T('点击定位播放头'))}"><div class="ve-track">${track}</div>${sug}<div class="ve-ph" style="left:${pct(ph)}"></div></div>
        <div class="mxui-row ve-ctl"><button type="button" data-ro data-a="play">▶︎❚❚</button><span class="mono">${fmtMs(ph)} / ${fmtMs(dur)}</span><span class="sp"></span><button type="button" data-a="split">✂ ${E(T('切割'))}</button><button type="button" data-a="del"${st.sel ? '' : ' disabled'}>${E(T('删除片段'))}</button>${st.suggestedCuts.length ? `<button type="button" data-a="sug" title="${E(T('AI 只建议，点了才会切'))}">✂ AI ×${st.suggestedCuts.length}</button>` : ''}</div>
        <table class="mxui-tbl ve-list">${clips.map((c, i) => `<tr data-clip="${E(c.id)}" class="${st.sel === c.id ? 'on' : ''}"><td>${i + 1}</td><td class="mono">${fmtMs(c.inMs)} → ${fmtMs(c.outMs)}</td><td class="mono">${fmtMs(c.outMs - c.inMs)}</td></tr>`).join('')}</table>
        <div class="mxui-row"><span class="mxui-muted">${fmtMs(kept)} · ${clips.length} ${E(T('段'))}</span><span class="sp"></span>${pick}<button type="button" data-ro data-a="export">${E(T('导出'))}</button></div>`;
    },
    bind(el, st, ro, ctx) {
      const rt = ctx.runtime, o = () => ctx.st.observed;
      el.querySelector('input[type=file]')?.addEventListener('change', async e => {
        const f = e.target.files?.[0]; if (!f) return;
        if (rt.url) URL.revokeObjectURL(rt.url);
        rt.url = URL.createObjectURL(f);
        const durationMs = await new Promise(res => { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => res(Math.round(v.duration * 1000) || 0); v.onerror = () => res(0); v.src = rt.url; });
        const hash = f.size <= 300 * 1048576 ? await sha256(new Uint8Array(await f.arrayBuffer())).catch(() => null) : null;
        const prev = o().source, same = prev && hash && prev.sha256 === hash;
        ctx.obs({ source: { name: f.name.slice(0, 200), sha256: hash, durationMs, size: f.size }, clips: same ? o().clips : [{ id: 'v' + uidS(), inMs: 0, outMs: durationMs }], playheadMs: same ? o().playheadMs || 0 : 0 });
        if (!hash) ctx.toast(T('文件超过 300 MB，没有计算哈希'));
      });
      const v = el.querySelector('video'); if (!v) return;
      const dur = o().source?.durationMs || 0;
      const kept = () => (o().clips || []).slice().sort((a, b) => a.inMs - b.inMs);
      v.currentTime = (o().playheadMs || 0) / 1000;
      const ph = el.querySelector('.ve-ph'), tm = el.querySelector('.ve-ctl .mono');
      v.ontimeupdate = () => {
        let ms = Math.round(v.currentTime * 1000);
        if (!v.paused) { const ks = kept(), inK = ks.find(c => ms >= c.inMs && ms < c.outMs); if (!inK) { const nx = ks.find(c => c.inMs > ms); if (nx) { v.currentTime = nx.inMs / 1000; ms = nx.inMs; } else v.pause(); } } // 预览只播保留的片段
        ctx.obs({ playheadMs: ms }, false);
        if (ph) ph.style.left = (dur ? (ms / dur) * 100 : 0) + '%'; if (tm) tm.textContent = `${fmtMs(ms)} / ${fmtMs(dur)}`;
      };
      el.querySelector('.ve-tl').onclick = e => {
        const r = e.currentTarget.getBoundingClientRect(), ms = Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur);
        v.currentTime = ms / 1000;
        const c = e.target.closest('[data-clip]');
        if (!ro) { ctx.obs({ playheadMs: ms }, false); if (c) ctx.set({ sel: c.dataset.clip }); }
      };
      el.querySelectorAll('.ve-list tr').forEach(tr => (tr.onclick = () => { const c = o().clips.find(x => x.id === tr.dataset.clip); if (!c) return; v.currentTime = c.inMs / 1000; if (!ro) { ctx.obs({ playheadMs: c.inMs }, false); ctx.set({ sel: c.id }); } }));
      const split = at => { const cs = o().clips || []; const c = cs.find(x => at > x.inMs + 50 && at < x.outMs - 50); if (!c) return false; const a = { id: 'v' + uidS(), inMs: c.inMs, outMs: at }, b = { id: 'v' + uidS(), inMs: at, outMs: c.outMs }; ctx.obs({ clips: cs.flatMap(x => (x === c ? [a, b] : [x])) }, false); return true; };
      el.onclick = e => {
        const a = e.target.closest('.mxui-body [data-a]')?.dataset.a; if (!a) return;
        if (a === 'play') v.paused ? v.play().catch(() => {}) : v.pause();
        else if (a === 'split') { if (!split(o().playheadMs || 0)) ctx.toast(T('播放头离片段边缘太近')); ctx.set({}); }
        else if (a === 'del') { ctx.obs({ clips: o().clips.filter(x => x.id !== ctx.st.sel) }, false); ctx.set({ sel: null }); }
        else if (a === 'sug') { let n = 0; ctx.st.suggestedCuts.forEach(c => (n += split(c.atMs) ? 1 : 0)); ctx.set({}); ctx.toast(fmtT('已按建议切割 {n} 处', n)); }
        else if (a === 'export') download(`${ctx.st.projectName || 'clips'}.json`, JSON.stringify({ project: ctx.st.projectName, ...PROJ.VideoEditor(ctx.st) }, null, 2));
      };
    },
  };
  const fmtT = (s, n) => T(s).replace('{n}', n);
  function download(name, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name.replace(/[\\/:*?"<>|]/g, '_'); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

  /* ---------- 工具 4：CodeDiff（左右对比，按 hunk 接受 / 拒绝） ---------- */
  function diffLines(a, b) { // LCS（超大文件退化成整体替换），输出 [{t:'=',l,r}|{t:'-',l}|{t:'+',r}]
    const A = a.split('\n'), B = b.split('\n');
    let s = 0; while (s < A.length && s < B.length && A[s] === B[s]) s++;
    let ea = A.length, eb = B.length; while (ea > s && eb > s && A[ea - 1] === B[eb - 1]) { ea--; eb--; }
    const a2 = A.slice(s, ea), b2 = B.slice(s, eb), out = [];
    for (let i = 0; i < s; i++) out.push({ t: '=', l: i, r: i });
    if (a2.length * b2.length > 4e6) { a2.forEach((_, i) => out.push({ t: '-', l: s + i })); b2.forEach((_, i) => out.push({ t: '+', r: s + i })); }
    else {
      const n = a2.length, m = b2.length, L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
      for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a2[i] === b2[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
      let i = 0, j = 0;
      while (i < n || j < m) { if (i < n && j < m && a2[i] === b2[j]) { out.push({ t: '=', l: s + i++, r: s + j++ }); } else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) out.push({ t: '+', r: s + j++ }); else out.push({ t: '-', l: s + i++ }); }
    }
    for (let i = ea, j = eb; i < A.length; i++, j++) out.push({ t: '=', l: i, r: j });
    return { A, B, ops: out };
  }
  function hunksOf(ops) { const hs = []; let cur = null; ops.forEach((o, i) => { if (o.t === '=') { cur = null; return; } if (!cur) hs.push((cur = { s: i, e: i })); cur.e = i; }); return hs.map((h, k) => ({ id: 'h' + (k + 1), s: h.s, e: h.e })); }
  function merged(d, hs, dec) { const out = []; let k = 0; d.ops.forEach((o, i) => { while (hs[k] && i > hs[k].e) k++; const h = hs[k] && i >= hs[k].s && i <= hs[k].e ? hs[k] : null; const take = h && dec[h.id] === 'accepted'; if (o.t === '=') out.push(d.A[o.l]); else if (o.t === '-' && !take) out.push(d.A[o.l]); else if (o.t === '+' && take) out.push(d.B[o.r]); }); return out.join('\n'); }
  TOOLS.CodeDiff = {
    init: d => ({ left: d.left, right: d.right, edit: !d.left.content && !d.right.content }),
    view(st, ro, ctx) {
      const rt = ctx.runtime;
      if ((st.edit && !ro) || ctx.live) return `<div class="cd-edit"><label>${E(T('原文件'))} <input data-f="lp" value="${E(st.left.path)}"></label><textarea data-f="lc" rows="8" spellcheck="false" placeholder="${E(T('原内容'))}">${E(st.left.content)}</textarea><input type="file" data-file="left"><label>${E(T('新文件'))} <input data-f="rp" value="${E(st.right.path)}"></label><textarea data-f="rc" rows="8" spellcheck="false">${E(st.right.content)}</textarea><input type="file" data-file="right"><div class="mxui-row"><span class="sp"></span><button type="button" data-a="cmp" class="pri">${E(T('比对'))}</button></div></div>`;
      const d = (rt.d ||= diffLines(st.left.content, st.right.content)), hs = (rt.hs ||= hunksOf(d.ops)), dec = st.observed.decisions || {};
      const add = d.ops.filter(o => o.t === '+').length, del = d.ops.filter(o => o.t === '-').length;
      const CTX = 2, show = new Set(); hs.forEach(h => { for (let i = h.s - CTX; i <= h.e + CTX; i++) show.add(i); });
      let rows = '', k = 0, gap = false;
      for (let i = 0; i < d.ops.length; i++) {
        if (!show.has(i)) { if (!gap) { rows += `<tr class="cd-gap"><td colspan="4">⋯</td></tr>`; gap = true; } continue; }
        gap = false;
        const h = hs.find(x => x.s === i);
        if (h) { k++; const st2 = dec[h.id]; rows += `<tr class="cd-hh"><td colspan="4"><div class="cd-hhi"><span>${E(T('改动'))} ${k}/${hs.length}</span>${st2 ? `<span class="cd-dec ${st2}">${E(st2 === 'accepted' ? T('已接受') : T('已拒绝'))}</span>` : ''}<span class="sp"></span>${ro ? '' : `<button type="button" data-h="${h.id}" data-d="accepted">${E(T('接受'))}</button><button type="button" data-h="${h.id}" data-d="rejected">${E(T('拒绝'))}</button>`}</div></td></tr>`; }
        const o = d.ops[i];
        rows += o.t === '=' ? `<tr><td class="ln">${o.l + 1}</td><td>${E(d.A[o.l])}</td><td class="ln">${o.r + 1}</td><td>${E(d.B[o.r])}</td></tr>`
          : o.t === '-' ? `<tr><td class="ln">${o.l + 1}</td><td class="del">${E(d.A[o.l])}</td><td class="ln"></td><td class="nil"></td></tr>`
          : `<tr><td class="ln"></td><td class="nil"></td><td class="ln">${o.r + 1}</td><td class="add">${E(d.B[o.r])}</td></tr>`;
      }
      const done = hs.filter(h => dec[h.id]).length;
      return `<div class="cd-top"><span class="mono">${E(st.left.path)}</span><span>→</span><span class="mono">${E(st.right.path)}</span>${st.right.aiSuggested ? `<span class="mxui-ai">${E(T('AI 建议'))}</span>` : ''}<span class="sp"></span><span class="cd-n add">+${add}</span><span class="cd-n del">−${del}</span></div>
        ${hs.length ? `<div class="cd-wrap"><table class="cd">${rows}</table></div>` : `<p class="mxui-muted">${E(T('两边内容相同'))}</p>`}
        <div class="mxui-row"><span class="mxui-muted">${done}/${hs.length}</span><span class="sp"></span>${ro ? '' : `<button type="button" data-a="all-a">${E(T('全部接受'))}</button><button type="button" data-a="all-r">${E(T('全部拒绝'))}</button><button type="button" data-a="edit">${E(T('编辑'))}</button>`}<button type="button" data-ro data-a="copy">${E(T('复制结果'))}</button></div>`;
    },
    async bind(el, st, ro, ctx) {
      const rt = ctx.runtime;
      const recompute = async s => { rt.d = rt.hs = null; const d = diffLines(s.left.content, s.right.content); const hs = hunksOf(d.ops); const [lh, rh] = await Promise.all([sha256(s.left.content), sha256(s.right.content)]); ctx.set({ ...s, edit: false, hunks: hs.map(h => ({ id: h.id })), leftHash: lh, rightHash: rh, observed: { ...ctx.st.observed, decisions: {} } }); };
      if (!st.edit && !st.hunks && !ro) { recompute(st); return; }
      if (st.edit) {
        const g = f => el.querySelector(`[data-f=${f}]`);
        el.querySelectorAll('[data-file]').forEach(inp => (inp.onchange = async () => { const f = inp.files?.[0]; if (!f) return; if (f.size > 2 * 1048576) return ctx.toast(T('文件太大（上限 2 MB）')); const txt = await f.text(); const side = inp.dataset.file; g(side === 'left' ? 'lc' : 'rc').value = txt; g(side === 'left' ? 'lp' : 'rp').value = f.name; }));
        el.querySelector('[data-a=cmp]').onclick = () => recompute({ ...ctx.st, left: { path: g('lp').value || 'left', content: g('lc').value }, right: { ...ctx.st.right, path: g('rp').value || 'right', content: g('rc').value, aiSuggested: ctx.st.right.aiSuggested && g('rc').value === ctx.st.right.content } });
        return;
      }
      el.querySelectorAll('[data-h]').forEach(b => (b.onclick = () => ctx.obs({ decisions: { ...(ctx.st.observed.decisions || {}), [b.dataset.h]: b.dataset.d } })));
      el.onclick = async e => {
        const a = e.target.closest('.mxui-body [data-a]')?.dataset.a; if (!a) return;
        if (a === 'all-a' || a === 'all-r') ctx.obs({ decisions: Object.fromEntries(rt.hs.map(h => [h.id, a === 'all-a' ? 'accepted' : 'rejected'])) });
        else if (a === 'edit') ctx.set({ edit: true });
        else if (a === 'copy') { try { await navigator.clipboard.writeText(merged(rt.d, rt.hs, ctx.st.observed.decisions || {})); ctx.toast(T('已复制：接受的改动取新内容，其余保留原内容')); } catch { ctx.toast(T('复制失败')); } }
      };
    },
  };

  /* ---------- 工具 5：GenerativeForm（动态表单；结果可一键发回对话） ---------- */
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function checkForm(fields, vals) {
    const err = {};
    for (const f of fields) {
      const v = vals[f.key], empty = v == null || v === '' || (Array.isArray(v) && !v.length) || (f.type === 'checkbox' && !v);
      if (f.required && empty) { err[f.key] = T('必填'); continue; }
      if (empty) continue;
      if (f.type === 'number') { const n = Number(v); if (!Number.isSafeInteger(n)) err[f.key] = T('请填整数'); else if (f.min != null && n < f.min) err[f.key] = T('不能小于') + ' ' + f.min; else if (f.max != null && n > f.max) err[f.key] = T('不能大于') + ' ' + f.max; }
      else if (f.type === 'email' && !EMAIL.test(v)) err[f.key] = T('邮箱格式不对');
      else if (f.type === 'url' && !/^https?:\/\/\S+$/i.test(v)) err[f.key] = T('请填 http(s) 链接');
      else if (typeof v === 'string' && ((f.min != null && f.type !== 'number' && v.length < f.min) || (f.max != null && f.type !== 'number' && v.length > f.max))) err[f.key] = T('长度不符合要求');
    }
    return err;
  }
  TOOLS.GenerativeForm = {
    init: d => ({ ...d, draft: Object.fromEntries(d.fields.map(f => [f.key, f.type === 'checkboxes' ? arr(f.value).map(String) : f.type === 'checkbox' || f.type === 'switch' ? !!f.value : f.value == null ? '' : String(f.value)])) }),
    title: st => st.title,
    view(st, ro) {
      const o = st.observed, vals = o.submitted ? o.values : st.draft, err = st.err || {};
      const fld = f => {
        const v = vals[f.key], nm = `name="${E(f.key)}"`, ph = f.placeholder ? ` placeholder="${E(f.placeholder)}"` : '';
        let inp;
        if (f.type === 'textarea') inp = `<textarea ${nm} rows="3"${ph}>${E(v)}</textarea>`;
        else if (f.type === 'select') inp = `<select ${nm}><option value="">${E(T('请选择'))}</option>${f.options.map(op => `<option value="${E(op.value)}"${op.value === v ? ' selected' : ''}>${E(op.label)}</option>`).join('')}</select>`;
        else if (f.type === 'radio') inp = `<div class="gf-opts">${f.options.map(op => `<label><input type="radio" ${nm} value="${E(op.value)}"${op.value === v ? ' checked' : ''}>${E(op.label)}</label>`).join('')}</div>`;
        else if (f.type === 'checkboxes') inp = `<div class="gf-opts">${f.options.map(op => `<label><input type="checkbox" ${nm} value="${E(op.value)}"${arr(v).includes(op.value) ? ' checked' : ''}>${E(op.label)}</label>`).join('')}</div>`;
        else if (f.type === 'checkbox' || f.type === 'switch') inp = `<label class="gf-chk${f.type === 'switch' ? ' sw' : ''}"><input type="checkbox" ${nm}${v ? ' checked' : ''}><span>${E(f.placeholder || f.label)}</span></label>`;
        else inp = `<input type="${f.type === 'number' ? 'number" step="1' : f.type}" ${nm} value="${E(v)}"${ph}${f.type === 'number' && f.min != null ? ` min="${f.min}"` : ''}${f.type === 'number' && f.max != null ? ` max="${f.max}"` : ''}>`;
        return `<div class="gf-f${err[f.key] ? ' bad' : ''}"><label class="gf-l">${E(f.label)}${f.required ? '<i>*</i>' : ''}</label>${inp}${err[f.key] ? `<div class="gf-err">${E(err[f.key])}</div>` : f.help ? `<div class="mxui-muted">${E(f.help)}</div>` : ''}</div>`;
      };
      const done = o.submitted ? `<div class="gf-done">${E(T('已提交'))} · ${E(new Date(o.submittedAt).toLocaleTimeString())}<span class="sp"></span>${ro ? '' : `<button type="button" data-a="edit">${E(T('修改'))}</button>`}<button type="button" data-ro data-a="send-chat" class="pri">${E(T('发回对话'))}</button></div>` : '';
      return `${st.description ? `<p class="mxui-muted">${E(st.description)}</p>` : ''}<form class="gf"${o.submitted ? ' inert' : ''}>${st.fields.map(fld).join('')}${o.submitted ? '' : `<div class="mxui-row">${ro ? '' : `<input class="gf-new" placeholder="+ ${E(T('字段'))}"><select class="gf-nt">${['text', 'textarea', 'number', 'date', 'checkbox'].map(t => `<option>${t}</option>`).join('')}</select>`}<span class="sp"></span><button type="submit" class="pri">${E(st.submitLabel)}</button></div>`}</form>${done}`;
    },
    bind(el, st, ro, ctx) {
      const form = el.querySelector('form');
      const read = () => { const v = {}; for (const f of ctx.st.fields) { const els = form.querySelectorAll(`[name="${CSS.escape(f.key)}"]`); if (f.type === 'checkboxes') v[f.key] = [...els].filter(x => x.checked).map(x => x.value); else if (f.type === 'radio') v[f.key] = [...els].find(x => x.checked)?.value || ''; else if (f.type === 'checkbox' || f.type === 'switch') v[f.key] = !!els[0]?.checked; else v[f.key] = els[0]?.value ?? ''; } return v; };
      if (form && !st.observed.submitted) {
        form.oninput = e => { if (!e.target.closest('.gf-new,.gf-nt')) ctx.set({ draft: read() }, false); };
        const nf = form.querySelector('.gf-new'); if (nf) nf.onkeydown = e => { if (e.key !== 'Enter') return; e.preventDefault(); const label = nf.value.trim().slice(0, 120); if (!label) return; const type = form.querySelector('.gf-nt').value; const f = { key: 'u' + uidS(), label, type, required: false, placeholder: '', help: '', options: [], min: null, max: null, value: null }; ctx.set({ fields: [...ctx.st.fields, f], draft: { ...read(), [f.key]: type === 'checkbox' ? false : '' } }); el.querySelector('.gf-new')?.focus(); };
        form.onsubmit = e => {
          e.preventDefault();
          const raw = read(), err = checkForm(ctx.st.fields, raw);
          if (Object.keys(err).length) return ctx.set({ draft: raw, err });
          const values = Object.fromEntries(ctx.st.fields.map(f => [f.key, f.type === 'number' && raw[f.key] !== '' ? Number(raw[f.key]) : raw[f.key]]));
          ctx.set({ draft: raw, err: {}, observed: { ...ctx.st.observed, submitted: true, values, submittedAt: now() } });
        };
      }
      el.querySelector('[data-a=edit]')?.addEventListener('click', () => ctx.obs({ submitted: false }));
      el.querySelector('[data-a=send-chat]')?.addEventListener('click', () => {
        const s = ctx.st, lines = s.fields.map(f => { let v = s.observed.values[f.key]; if (Array.isArray(v)) v = v.join('、'); if (typeof v === 'boolean') v = v ? T('是') : T('否'); if (f.options.length && typeof v === 'string') v = f.options.find(o => o.value === v)?.label || v; return `- ${f.label}：${v === '' || v == null ? '—' : v}`; });
        const msg = `${T('我填好了表单')}${s.title ? '「' + s.title + '」' : ''}：\n${lines.join('\n')}`;
        const inp = document.querySelector('#input');
        if (!inp) return navigator.clipboard?.writeText(msg).then(() => ctx.toast(T('已复制')));
        inp.value = msg; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.focus(); ctx.toast(T('已放进输入框，确认后发送'));
      });
    },
  };

  /* ---------- 工具 6：Lab（学习窗口：模型现写的交互演示，在隔离沙盒里实时渲染） ----------
     安全边界：iframe sandbox="allow-scripts"（不透明来源，读不到本站 Cookie / 存储 / 密钥）+ lab.html 自己的 CSP（connect-src 'none'，没有任何出网）；
     库只能从白名单里选（版本钉死）；和父页面只通过 postMessage 通信，父页面校验来源窗口；交互轨迹只记控件 id 和值 */
  // 快照版的学习窗口完全离线：不加载任何外部库（没有 CDN，沙盒页没有网络），模型只能用原生 HTML / CSS / JS / Canvas / SVG
  const LAB_LIBS = {};
  const LIB_ALIAS = {};
  const libName = x => { const k = String(x || '').toLowerCase().replace(/[^a-z0-9]/g, ''); return LAB_LIBS[k] ? k : LIB_ALIAS[k] || null; };
  READ.Lab = d => ({ title: str(d.title, '', 80), libs: [...new Set(arr(d.libs).map(libName).filter(Boolean))].slice(0, 6), source: str(d.source ?? d.src, '', 200000) });
  PROJ.Lab = s => ({ title: s.title, libs: s.libs, codeHash: s.codeHash ?? null, edited: s.edited != null, runs: s.observed.runs | 0, trace: (s.observed.trace || []).map(e => ({ run: e.run, t: e.t, k: e.k, id: e.id, v: e.v })), traceDropped: s.observed.dropped | 0 });
  const LAB_CSS = '@font-face{font-family:"MaxRIous";font-weight:100 900;src:url(fonts/maxrious-400.woff2) format("woff2")}html,body{margin:0;min-height:100%;background:#0b0b0f;color:#e6e6ec;font:14px/1.5 "MaxRIous","MaxCN",sans-serif}*{box-sizing:border-box}input[type=range]{accent-color:#7c6cf0}button{font:inherit;color:#e6e6ec;background:#1d1d24;border:1px solid #2c2c36;border-radius:8px;padding:4px 10px;cursor:pointer}canvas,svg{max-width:100%}.jxgbox{background:#0b0b0f!important;border:0!important;border-radius:0!important}';
  function labBridge() { // 注入沙盒：把控件交互（id + 值）通过 postMessage 报给父页面；不读任何其它数据
    var last = {}, tm = {};
    var send = function (m) { m.mxlab = 1; try { parent.postMessage(m, '*'); } catch (e) {} };
    var fmt = function (v) { try { return (typeof v === 'object' ? JSON.stringify(v) : String(v)).slice(0, 200); } catch (e) { return ''; } };
    window.hugluno = { log: function (k, v) { send({ ev: { k: 'log', id: String(k).slice(0, 60), v: fmt(v) } }); } };
    var on = function (e) {
      var el = e.target; if (!el || !el.tagName) return;
      var id = String(el.id || el.name || el.getAttribute('aria-label') || el.tagName.toLowerCase()).slice(0, 60), key = id + e.type, now = Date.now();
      var go = function () { last[key] = Date.now(); send({ ev: { k: e.type, id: id, v: fmt(el.type === 'checkbox' ? el.checked : el.value) } }); };
      clearTimeout(tm[key]); if (e.type === 'input' && now - (last[key] || 0) < 160) { tm[key] = setTimeout(go, 160); return; } go();
    };
    addEventListener('input', on, true); addEventListener('change', on, true);
    addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('button,a,[role=button]'); if (b) send({ ev: { k: 'click', id: String(b.id || b.textContent || '').trim().slice(0, 60) } }); }, true);
    addEventListener('error', function (e) { send({ err: String(e.message || 'Error').slice(0, 300) }); });
    addEventListener('load', function () { send({ ready: 1 }); });
  }
  const jsonInScript = v => JSON.stringify(v ?? null).replace(/</g, '\\u003c');
  // 学习窗口里模型写的代码：iframe sandbox="allow-scripts"（不透明来源）+ 文档自带的 CSP（connect-src / img-src 外链 / 表单 / 子框架全部禁止）→ 没有任何网络出口
  const LAB_CSP = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src 'self' data:; connect-src 'none'; form-action 'none'; frame-src 'none'; base-uri 'none'";
  function labDoc(src, libs, portable, data) {
    const bridge = portable ? '' : `<script>(${labBridge})()<\/script>`;
    return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${LAB_CSP}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${LAB_CSS}</style>${bridge}${data ? `<script>window.hugluno=window.hugluno||{};hugluno.data=${jsonInScript(data)}<\/script>` : ''}</head><body>${String(src).replace(/<!doctype[^>]*>/i, '')}</body></html>`;
  }
  const LABW = new WeakMap(); // 沙盒窗口 → 处理函数（只认自己建的 iframe）
  if (G.addEventListener) G.addEventListener('message', e => { const h = e.source && LABW.get(e.source); if (h && e.data && typeof e.data === 'object') h(e.data); });
  // 双缓冲：新画面在后台 iframe 里渲染好再淡入替换，实时更新不闪
  function labRun(stage, src, libs, onMsg, data) {
    stage.querySelectorAll('iframe.next').forEach(x => x.remove());
    const fr = document.createElement('iframe');
    fr.setAttribute('sandbox', 'allow-scripts'); fr.className = 'lab-fr next'; fr.title = 'sandbox'; fr.setAttribute('referrerpolicy', 'no-referrer');
    fr.src = 'lab.html'; // 学习窗口外壳页：自带 CSP（没有网络），收到 postMessage 里的 HTML 再写进去
    const html = labDoc(src, libs, false, data); let sent = false, shown = false;
    const swap = () => {
      if (shown || !fr.isConnected) return; shown = true;
      stage.querySelectorAll('iframe.cur').forEach(x => { x.classList.replace('cur', 'old'); setTimeout(() => x.remove(), 320); });
      fr.classList.replace('next', 'cur'); stage.querySelector('.lab-empty')?.remove();
    };
    stage.append(fr);
    LABW.set(fr.contentWindow, m => {
      if (m.ready === true && !m.mxlab && !sent) { sent = true; fr.contentWindow.postMessage({ type: 'preview', html }, '*'); setTimeout(swap, 2500); return; }
      if (!m.mxlab) return;
      if (m.ready) swap();
      onMsg?.(m);
    });
    return fr;
  }
  const labOk = s => (s.match(/<script\b/gi) || []).length === (s.match(/<\/script>/gi) || []).length && (s.match(/<style\b/gi) || []).length === (s.match(/<\/style>/gi) || []).length && /\S/.test(s);
  TOOLS.Lab = {
    self: true,
    init: d => ({ title: d.title, libs: d.libs, source: d.source, edited: null, codeHash: null }),
    build(el, spec) { // 一次建好骨架，之后只改局部，不整块重画（重画会让沙盒重新加载）
      el.classList.add('lab'); el.innerHTML = `<div class="mxui-hd"><span class="mxui-ic">◎</span><b></b><span class="lab-libs"></span><span class="lab-badge"></span></div><div class="lab-stage"><div class="lab-empty"><span class="mxui-pulse"></span></div><div class="lab-err" hidden></div></div><pre class="lab-tick"></pre><div class="lab-src" hidden><textarea spellcheck="false"></textarea></div><div class="mxui-ft"></div>`;
      el._lab = { last: '', t: 0, timer: 0 };
      this.head(el, spec, { libs: READ.Lab(spec.initialData).libs });
    },
    head(el, spec, st) {
      el.querySelector('.mxui-hd b').textContent = spec.title || st.title || T('学习窗口');
      el.querySelector('.lab-libs').innerHTML = (st.libs || []).map(l => `<i>${E(l)}</i>`).join('');
    },
    live(el, spec) {
      if (!el._lab) this.build(el, spec);
      const L = el._lab, d = READ.Lab(spec.initialData), src = d.source;
      this.head(el, spec, d);
      el.querySelector('.lab-badge').innerHTML = '<span class="mxui-pulse"></span>';
      const tick = el.querySelector('.lab-tick'), lines = src.split('\n'); // 正在写的代码：只露最后几行，像打字一样往上滚
      tick.textContent = lines.slice(-4).join('\n'); tick.classList.toggle('on', !!src);
      const go = () => { L.timer = 0; if (!el.isConnected) return; const s = el._lab.pend; if (s && s !== L.last && labOk(s)) { L.last = s; L.t = Date.now(); labRun(el.querySelector('.lab-stage'), s, d.libs, null); } };
      L.pend = src;
      if (!L.timer) L.timer = setTimeout(go, Math.max(0, 900 - (Date.now() - L.t))); // 节流：边写边画，但不每个字都重载
    },
    mount(el, ctx) {
      const spec = ctx.spec, upgrade = !!el._lab;
      if (!upgrade) this.build(el, spec);
      clearTimeout(el._lab.timer); el._lab.timer = 0;
      el.querySelector('.lab-tick').classList.remove('on');
      const stage = el.querySelector('.lab-stage'), ta = el.querySelector('.lab-src textarea'), cnt = () => ctx.st.observed.trace?.length || 0;
      const cur = () => ctx.st.edited ?? ctx.st.source;
      const run = async () => {
        const s = cur(); el._lab.last = s;
        if (!s.trim()) return;
        el._lab.t0 = performance.now(); el.querySelector('.lab-err').hidden = true;
        ctx.obs({ runs: (ctx.st.observed.runs | 0) + 1 }, false);
        labRun(stage, s, ctx.st.libs, onMsg);
        ctx.set({ codeHash: await sha256(labDoc(s, ctx.st.libs, true)) }, false); // 源码哈希：随运行的代码变，封存时一起记
      };
      const onMsg = m => {
        if (m.err) { const e = el.querySelector('.lab-err'); e.hidden = false; e.textContent = '⚠'; e.title = m.err; return; }
        if (!m.ev || ctx.st.sealed) return;
        const o = ctx.st.observed, tr = o.trace || [], ev = { run: o.runs | 0, t: Math.max(0, Math.round(performance.now() - (el._lab.t0 || 0))), k: str(m.ev.k, '', 12), id: str(m.ev.id, '', 60), v: str(m.ev.v, '', 200) };
        if (tr.length >= 2000) ctx.obs({ dropped: (o.dropped | 0) + 1 }, false); else ctx.obs({ trace: [...tr, ev] }, false);
        const b = el.querySelector('[data-a=trace]'); if (b) { b.lastChild.textContent = cnt(); b.classList.add('ping'); setTimeout(() => b.classList.remove('ping'), 300); }
      };
      const refresh = () => {
        const ro = !!ctx.st.sealed;
        el.classList.toggle('sealed', ro);
        this.head(el, spec, ctx.st);
        el.querySelector('.lab-badge').innerHTML = sealBadge(ctx.st);
        ta.readOnly = ro;
        el.querySelector('.mxui-ft').innerHTML = `<button type="button" class="mxw-ib" data-a="run" title="${E(T('重新运行'))}">▶</button><button type="button" class="mxw-ib" data-a="src" title="${E(T('查看源码'))}">&lt;/&gt;</button><button type="button" class="mxw-ib" data-a="big" title="${E(T('放大'))}">⤢</button><button type="button" class="mxw-ib lab-tr" data-a="trace" title="${E(T('已记录的交互'))}"><span>●</span><span>${cnt()}</span></button><span class="sp"></span>${ro ? `<button type="button" class="mxw-ib" data-a="copy-seal" title="${E(T('复制学习凭证'))}">⧉</button>` : `<button type="button" class="mxw-ib" data-a="reset" title="${E(T('重置'))}">↺</button><button type="button" class="mxw-ib" data-a="seal" title="${E(T('封存学习凭证（之后只读）'))}">🔒</button>`}<button type="button" class="mxw-ib" data-a="close" title="${E(T('收起'))}">✕</button>`;
      };
      ctx.redraw = refresh;
      el.onclick = async e => {
        const a = e.target.closest('[data-a]')?.dataset.a; if (!a || !el.contains(e.target)) return;
        if (a === 'run') { if (!el.querySelector('.lab-src').hidden && !ctx.st.sealed) ctx.set({ edited: ta.value === ctx.st.source ? null : ta.value.slice(0, 200000) }, false); run(); }
        else if (a === 'src') { const p = el.querySelector('.lab-src'); p.hidden = !p.hidden; if (!p.hidden) { ta.value = cur(); ta.focus(); } el.querySelector('[data-a=src]').classList.toggle('on', !p.hidden); }
        else if (a === 'big') { el.classList.toggle('big'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
        else if (a === 'trace') { const tr = ctx.st.observed.trace || []; ctx.toast(tr.length ? tr.slice(-3).map(x => `${x.id}=${x.v}`).join(' · ') : T('还没有交互')); }
        else if (a === 'reset') { ctx.reset(); refresh(); run(); }
        else if (a === 'seal') { await ctx.sealNow(); }
        else if (a === 'copy-seal') ctx.copySeal();
        else if (a === 'close') ctx.close();
      };
      ta.onkeydown = e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); el.querySelector('[data-a=run]').click(); } else e.stopPropagation(); };
      refresh();
      if (!upgrade || el._lab.last !== cur() || !stage.querySelector('iframe')) run();
      else { el._lab.t0 = performance.now(); const f = stage.querySelector('iframe.cur,iframe.next'); if (f) { const h = LABW.get(f.contentWindow); LABW.set(f.contentWindow, m => { h?.(m); if (m.mxlab) onMsg(m); }); } sha256(labDoc(cur(), ctx.st.libs, true)).then(h => ctx.set({ codeHash: h }, false)); }
    },
  };

  /* ---------- 卡片连线：把一张卡的结果（tool.out）拖到另一张卡上（tool.accept），自动注入；两边都记下连线，封存时成为因果链 ---------- */
  const linkOf = el => el?.closest?.('.mxui-card[data-mxui]');
  if (G.document) {
    document.addEventListener('dragstart', e => { const h = e.target.closest?.('[data-link]'); if (!h) return; const card = linkOf(h); if (!card?._ctx) return; e.dataTransfer.setData('text/x-mxlink', card.dataset.mxui); e.dataTransfer.effectAllowed = 'copy'; document.body.classList.add('mx-linking'); });
    document.addEventListener('dragend', () => { document.body.classList.remove('mx-linking'); document.querySelectorAll('.mxui-card.link-over').forEach(x => x.classList.remove('link-over')); });
    document.addEventListener('dragover', e => { if (![...(e.dataTransfer?.types || [])].includes('text/x-mxlink')) return; const c = linkOf(e.target); if (c && TOOLS[c._ctx?.spec.cardType]?.accept) { e.preventDefault(); c.classList.add('link-over'); } });
    document.addEventListener('dragleave', e => { const c = linkOf(e.target); if (c && !c.contains(e.relatedTarget)) c.classList.remove('link-over'); });
    document.addEventListener('drop', async e => {
      const from = e.dataTransfer?.getData('text/x-mxlink'); if (!from) return; const dst = linkOf(e.target); if (!dst) return; e.preventDefault(); dst.classList.remove('link-over');
      const src = [...(Pane.grid?.children || [])].find(x => x.dataset.mxui === from); if (!src?._ctx || src === dst || !dst._ctx) return;
      await link(src._ctx, dst._ctx);
    });
  }
  async function link(a, b) {
    const ta = TOOLS[a.spec.cardType], tb = TOOLS[b.spec.cardType];
    if (!ta?.out || !tb?.accept) return G.toast?.(T('这两张卡片接不上'));
    if (b.st.sealed) return G.toast?.(T('目标卡片已封存'));
    const pay = ta.out(a.st); if (!pay) return G.toast?.(T('这张卡片还没有结果'));
    const patch = tb.accept(b.st, pay); if (!patch) return G.toast?.(T('目标卡片不接受这类内容'));
    const h = await sha256(JSON.stringify(pay.data ?? '')), ln = { from: a.st.id, to: b.st.id, kind: pay.kind, hash: h, t: Date.now() };
    b.set({ ...patch, observed: { ...b.st.observed, ...(patch.observed || {}), links: [...(b.st.observed.links || []), ln].slice(-50) } });
    a.obs({ links: [...(a.st.observed.links || []), ln].slice(-50) }, false);
    G.toast?.(T('已接上'));
  }

  /* ---------- 凭证导出：把窗口里每张卡的封存记录（和还没封存的当前投影）打包成一份 JSON，附在论文 / 数据仓库里 ---------- */
  async function exportReceipts() {
    const cards = [];
    for (const el of [...(Pane.grid?.children || [])]) {
      const k = el.dataset.mxui; if (!k || docks.has(k)) continue;
      const spec = specs.get(k), st = load(k); if (!spec || !st || !PROJ[st.type]) continue;
      let current = null; try { current = PROJ[st.type](st); } catch {}
      cards.push({ id: st.id, type: st.type, title: spec.title || st.title || '', sealed: st.sealed ? { sha256: st.sealed.hash, payload: st.sealed.payload } : null, current: st.sealed ? null : current });
    }
    if (!cards.length) return G.toast?.(T('窗口里还没有可导出的卡片'));
    const doc = {
      spec: 'hugluno.research-manifest/1', catalogVersion: CATALOG_VERSION, exported_at: new Date().toISOString(), time_source: 'device clock (self-declared)',
      hash: 'sha256 over canonical JSON (sorted keys, integers only)', cards,
      not_captured: ['raw input data and source code (hashes only)', 'third-party timestamp', 'signer identity'],
      what_this_does_not_prove: ['the time of the runs', 'who ran them', 'that the conclusions are correct', 'ethics approval or any certification'],
    };
    download('hugluno-receipts-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(doc, null, 2));
    G.toast?.(T('已导出') + ' · ' + cards.length);
  }

  /* ---------- 给模型的提示（按需带上，不白占用量） ---------- */
  const HINT = `You can open interactive tool cards in the chat when the user needs a working interface, not just text. Output ONE \`\`\`mxui code block containing JSON only (no prose inside it); you may write a short sentence before it. Schema:
{"type":"ui_schema","catalogVersion":"1.0.0","text":"one-line note (optional)","cards":[{"cardType":"<tool>","title":"short title","initialData":{...},"gridHint":{"w":1|2}}]}
Tools and their initialData (fill it with data extracted from the user's message; several cards, even of the same tool, can be opened at once, max 8):
- ApiTracer (API debugging): {"method":"GET|POST|PUT|PATCH|DELETE","url":"https://…","headers":{"Content-Type":"application/json"},"body":"…"} — never invent responses, status codes or timings: the user presses Send and the page records the real result. Never put real secrets in headers; use a placeholder like "<YOUR_TOKEN>".
- KanbanBoard (task board): {"title":"…","columns":[{"id":"todo","title":"To do"},{"id":"doing","title":"Doing"},{"id":"done","title":"Done"}],"cards":[{"id":"t1","columnId":"todo","title":"…","tags":["…"]}]} — 3 to 5 columns.
- VideoEditor (video cutting; the user picks a local file, nothing is uploaded): {"projectName":"…","suggestedCuts":[{"atMs":12000,"reason":"…"}]} — cuts are suggestions only.
- CodeDiff (side-by-side diff with per-hunk accept/reject): {"left":{"path":"a.js","content":"original"},"right":{"path":"a.js","suggestedContent":"your proposed version"}}
- GenerativeForm (dynamic form; the user can send answers back to you): {"title":"…","description":"…","submitLabel":"Submit","fields":[{"key":"name","label":"Name","type":"text|textarea|number|email|tel|url|date|time|select|radio|checkbox|checkboxes|switch","required":true,"options":["A","B"],"placeholder":"…","default":"…","min":0,"max":100}]}
Each tool is a framework: fill it with concrete content for the task; the user can keep editing and adding. When a task needs several related workbenches (e.g. a form to collect requirements + a board to track tasks + an API tracer for the endpoint), open them together in one block. Use "gridHint":{"w":2} for wide cards (boards, diffs).
Rules: only these 5 cardType values; only data, never code/html/css/event handlers/component names; numbers must be integers. For plain conversation answer normally and don't output this block.`;
  const WANT = /接口|api\b|调试|请求|postman|curl|看板|任务板|待办|排期|kanban|trello|视频|剪辑|剪映|切割|裁剪|video|diff|比对|对比.{0,4}(代码|文件|版本)|代码.{0,4}(对比|比较)|表单|问卷|报名表|填写|form\b|survey|formulaire|tableau de bord|工具卡|拉起|界面/i;
  const WANTS = [WANT];
  const wants = (lastUser, prevAssistantHadUi) => !!prevAssistantHadUi || WANTS.some(re => re.test(String(lastUser || '')));
  const LAB_HINT = `When a concept is best understood by seeing and manipulating it (physics, math, algorithms / data structures, circuits, chemistry, statistics, economics…), open a learning window instead of explaining in text: output a \`\`\`mxlab code block:
title: short title
---
<self-contained HTML: markup + <style> + <script>>
The learning window is fully offline: use only plain HTML / CSS / JavaScript, <canvas> and inline <svg>. Never add <script src>, <link>, <img src="http…"> or fetch anything (there is no network and no library). Rules: dark theme (background #0b0b0f, light text); fill the window responsively; visual first, minimal text; a few labeled sliders / buttons with id attributes for the key parameters (interactions are recorded for the user's own study receipt); call hugluno.log(name, value) for key states; draw a first frame early in the code so it shows while you are still writing. Several \`\`\`mxlab blocks open several windows side by side. Keep each under ~250 lines. Add one short sentence of context outside the block at most.`;
  const LAB_WANT = /演示|模拟|仿真|可视化|动画|交互式|互动|单摆|弹簧|抛体|碰撞|电路|电场|磁场|波函数|量子|分子|化学键|反应|函数图像|导数|积分|微积分|极限|几何|向量|矩阵|傅里叶|算法|排序|二叉树|链表|图论|最短路|数据结构|回归|分类|概率|分布|供需|定价|期权|细胞|simulat|visuali[sz]|demo|interactive|animat|pendulum|circuit|molecule|wave ?function|sorting|binary tree|regression|supply and demand|démonstration|visualis|simulation|animation/i;
  const wantsLab = (lastUser, prevHadLab) => !!prevHadLab || LAB_WANT.test(String(lastUser || ''));

  // 外部模块注册工作台卡片（copilot.js / observer.js…）：{ label, icon, addable, read, proj, tool }
  const ADDABLE = new Set(TYPES.filter(t => t !== 'Lab'));
  function registerTool(type, def) {
    if (!/^[A-Z][A-Za-z]{2,30}$/.test(type) || TOOLS[type]) return false;
    TYPES.push(type); TYPE_OF[type.toLowerCase()] = type; LABEL[type] = def.label || type; ICON[type] = def.icon || '·';
    READ[type] = def.read || (d => d); PROJ[type] = def.proj || (s => ({ title: s.title || '' })); TOOLS[type] = def.tool;
    if (def.addable) ADDABLE.add(type);
    const m = Pane.el?.querySelector('.mxw-menu'); if (m && def.addable) m.insertAdjacentHTML('beforeend', `<button type="button" data-add="${type}"><i>${ICON[type]}</i>${E(T(LABEL[type]))}</button>`);
    return true;
  }
  const open1 = (type, initialData = {}, title = '') => { const key = 'x.' + uidS(); groups.set(key, { key, text: title, cards: [{ cardType: type, title, initialData, w: 2 }] }); specs.set(key + '.0', { cardType: type, title, initialData, w: 2, id: type + '#' + ++spawnSeq }); Pane.show(key); return key; };
  const MXUI = (G.MXUI = { addWant: re => WANTS.push(re), link, register: registerTool, open1, E, T, str, int, arr, obj, sha256, download, partialJSON, sealBadge, lim, can, gate, CATALOG_VERSION, TYPES, parse, looks, render, pending, scan, sanitize, canonical, seal, sha256, diffLines, hunksOf, merged, checkForm, partialJSON, parseLab, lab, labDoc, exportReceipts, READ, PROJ, HINT, LAB_HINT, wants, wantsLab, open: k => Pane.show(k), close: () => Pane.hide(), dock, _groups: groups, _lives: lives });
  if (G.document) document.addEventListener('click', e => { const c = e.target.closest('.mxui-chip[data-g]'); if (!c) return; const k = c.dataset.g; Pane.open.includes(k) && Pane.isOpen() ? Pane.hideGroup(k) : Pane.show(k); });
  return MXUI;
})();
