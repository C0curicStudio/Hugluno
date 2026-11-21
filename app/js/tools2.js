'use strict';
/* 第二批工具卡（模型预填，你来改；大多能互相连线：拖卡片左上角的图标到另一张卡上）
   研发：日志查看 · 定时表达式 · JSON 树 · 终端
   AI：提示词对比台 · Token 计数
   产品：思维导图 · 配色 · 文本对比 · 数据表
   效率：行动清单 · 网页摘录 */
(() => {
  const G = globalThis, M = G.MXUI; if (!M?.register) return;
  const { E, T, str, int, arr, obj, sha256 } = M;
  const lines = s => String(s ?? '').replace(/\r/g, '').split('\n');
  const copy = async (t, ctx) => { try { await navigator.clipboard.writeText(t); ctx.toast(T('已复制')); } catch { ctx.toast(T('复制失败')); } };
  const btn = (a, label, cls = '', title = '') => `<button type="button" class="${cls}" data-x="${a}"${title ? ` title="${E(title)}"` : ''}>${label}</button>`;
  const on = (el, fn) => { el.onclick = e => { const b = e.target.closest('[data-x]'); if (b && el.contains(b)) fn(b.dataset.x, b, e); }; };

  /* ---------- 1. 日志查看 ---------- */
  const LV = /\b(FATAL|CRITICAL|ERROR|ERR|WARN(?:ING)?|INFO|DEBUG|TRACE)\b/i;
  const lvOf = l => { const m = l.match(LV); if (!m) return ''; const v = m[1].toUpperCase(); return /FATAL|CRIT|ERR/.test(v) ? 'err' : /WARN/.test(v) ? 'warn' : /INFO/.test(v) ? 'info' : 'debug'; };
  const isStack = l => /^\s+(at |File "|\.\.\.|\^|~)|^\s{4,}\S|^Caused by:|^Traceback/.test(l);
  M.register('LogViewer', {
    label: '日志查看', icon: '≣',
    read: d => ({ log: str(d.log ?? d.text, '', 200000), keywords: arr(d.keywords).map(k => str(k, '', 40)).filter(Boolean).slice(0, 8) }),
    proj: s => ({ lines: lines(s.log).length, filter: s.q || '', levels: s.lv || [], keywords: s.keywords }),
    tool: {
      out: st => ({ kind: 'text', data: st.log }),
      accept: (st, p) => (p.kind === 'text' || p.kind === 'json' ? { log: typeof p.data === 'string' ? p.data : JSON.stringify(p.data, null, 2) } : null),
      init: d => ({ log: d.log, keywords: d.keywords, q: '', lv: ['err', 'warn', 'info', 'debug', ''] }),
      view(st) {
        const L = lines(st.log), q = String(st.q || '').toLowerCase(), kw = [...st.keywords, ...(q ? [st.q] : [])].filter(Boolean);
        const mark = t => { let h = E(t); kw.forEach(k => { const re = new RegExp(E(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); h = h.replace(re, m => `<mark>${m}</mark>`); }); return h; };
        const blocks = []; for (const l of L) { if (isStack(l) && blocks.length) blocks[blocks.length - 1].stack.push(l); else blocks.push({ l, lv: lvOf(l), stack: [] }); }
        const vis = blocks.filter(b => st.lv.includes(b.lv) && (!q || b.l.toLowerCase().includes(q) || b.stack.some(x => x.toLowerCase().includes(q))));
        const n = k => blocks.filter(b => b.lv === k).length;
        return `<div class="t2-row"><input data-f="q" class="grow" placeholder="${E(T('过滤…'))}" value="${E(st.q)}">${[['err', 'ERROR'], ['warn', 'WARN'], ['info', 'INFO'], ['debug', 'DEBUG']].map(([k, l]) => `<button type="button" data-lv="${k}" class="lv ${k}${st.lv.includes(k) ? ' on' : ''}">${l} ${n(k)}</button>`).join('')}</div>
          <div class="t2-log">${vis.slice(0, 2000).map(b => b.stack.length ? `<details class="lg ${b.lv}"><summary>${mark(b.l)} <span class="t2-n">+${b.stack.length}</span></summary><pre>${b.stack.map(mark).join('\n')}</pre></details>` : `<div class="lg ${b.lv}">${mark(b.l) || '&nbsp;'}</div>`).join('') || `<p class="mxui-muted">${E(T('没有匹配的行'))}</p>`}</div>
          <div class="t2-foot">${vis.length} / ${blocks.length}</div>`;
      },
      bind(el, st, ro, ctx) {
        const q = el.querySelector('[data-f=q]'); q.oninput = () => { clearTimeout(q._t); q._t = setTimeout(() => { ctx.set({ q: q.value }); const n = el.querySelector('[data-f=q]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200); };
        el.querySelectorAll('[data-lv]').forEach(b => (b.onclick = () => { const k = b.dataset.lv, lv = st.lv.includes(k) ? st.lv.filter(x => x !== k) : [...st.lv, k]; ctx.set({ lv }); }));
      },
    },
  });

  /* ---------- 2. 定时表达式（cron 5 段：分 时 日 月 周），预览接下来 5 次 ---------- */
  const CR = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
  function cronField(f, [lo, hi]) {
    const out = new Set();
    for (const part of String(f).split(',')) {
      const m = part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/); if (!m) return null;
      let [a, b] = m[1] === '*' ? [lo, hi] : m[1].split('-').map(Number); if (b == null) b = m[2] ? hi : a;
      const step = +(m[2] || 1); if (a < lo || b > hi || a > b || step < 1) return null;
      for (let v = a; v <= b; v += step) out.add(v === 7 && hi === 6 ? 0 : v);
    }
    return out;
  }
  function cronNext(expr, from = new Date(), n = 5) {
    const f = String(expr).trim().split(/\s+/); if (f.length !== 5) return null;
    const S = f.map((x, i) => cronField(x.replace(/^7$/, '0'), i === 4 ? [0, 7] : CR[i])); if (S.some(x => !x)) return null;
    if (S[4].has(7)) S[4].add(0);
    const out = [], d = new Date(from.getTime()); d.setSeconds(0, 0); d.setMinutes(d.getMinutes() + 1);
    const domStar = f[2] === '*', dowStar = f[4] === '*';
    for (let i = 0; i < 527040 && out.length < n; i++) { // 最多找一年
      const dom = S[2].has(d.getDate()), dow = S[4].has(d.getDay()), day = domStar || dowStar ? dom && dow : dom || dow;
      if (S[3].has(d.getMonth() + 1) && day && S[1].has(d.getHours()) && S[0].has(d.getMinutes())) out.push(new Date(d));
      d.setMinutes(d.getMinutes() + 1);
    }
    return out;
  }
  const CRON_PRE = [['每天 8:00', '0 8 * * *'], ['工作日 9:30', '30 9 * * 1-5'], ['每小时', '0 * * * *'], ['每 15 分钟', '*/15 * * * *'], ['每周一 10:00', '0 10 * * 1'], ['每月 1 日 0:00', '0 0 1 * *']];
  M.register('CronBuilder', {
    label: '定时表达式', icon: '⏲',
    read: d => ({ expr: str(d.expr ?? d.cron, '0 8 * * *', 100), desc: str(d.desc ?? d.description, '', 120) }),
    proj: s => ({ expr: s.expr }),
    tool: {
      out: st => ({ kind: 'text', data: st.expr }),
      init: d => ({ expr: d.expr, desc: d.desc }),
      view(st) {
        const f = st.expr.trim().split(/\s+/), nx = cronNext(st.expr), names = ['分', '时', '日', '月', '周'];
        const wk = ['日', '一', '二', '三', '四', '五', '六'];
        return `${st.desc ? `<p class="t2-desc">${E(st.desc)}</p>` : ''}<div class="t2-cron">${names.map((n, i) => `<label><span>${E(T(n))}</span><input data-i="${i}" value="${E(f[i] ?? '*')}" spellcheck="false"></label>`).join('')}</div>
          <div class="t2-row"><code class="grow t2-expr">${E(st.expr)}</code>${btn('copy', T('复制'))}</div>
          <div class="t2-chips">${CRON_PRE.map(([l, x]) => `<button type="button" data-pre="${E(x)}" class="${x === st.expr ? 'on' : ''}">${E(T(l))}</button>`).join('')}</div>
          ${nx ? `<ol class="t2-next">${nx.map((d, i) => `<li><span class="t2-dot"></span>${d.getMonth() + 1}/${d.getDate()} ${T('周')}${wk[d.getDay()]} <b>${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</b>${i === 0 ? `<span class="t2-n">${E(rel(d))}</span>` : ''}</li>`).join('')}</ol>` : `<p class="t2-bad">${E(T('表达式不对'))}</p>`}`;
      },
      bind(el, st, ro, ctx) {
        el.querySelectorAll('.t2-cron input').forEach(inp => (inp.onchange = () => { const f = st.expr.trim().split(/\s+/); while (f.length < 5) f.push('*'); f[+inp.dataset.i] = inp.value.trim() || '*'; ctx.set({ expr: f.slice(0, 5).join(' ') }); }));
        el.querySelectorAll('[data-pre]').forEach(b => (b.onclick = () => ctx.set({ expr: b.dataset.pre })));
        on(el, a => { if (a === 'copy') copy(st.expr, ctx); });
      },
    },
  });
  const rel = d => { const m = Math.round((d - Date.now()) / 60000); return m < 60 ? m + ' ' + T('分钟后') : m < 1440 ? Math.round(m / 60) + ' ' + T('小时后') : Math.round(m / 1440) + ' ' + T('天后'); };

  /* ---------- 3. JSON 树：可折叠，点选取路径 ---------- */
  const pathOf = (p, k) => (typeof k === 'number' ? `${p}[${k}]` : /^[A-Za-z_$][\w$]*$/.test(k) ? `${p}.${k}` : `${p}[${JSON.stringify(k)}]`);
  function tree(v, p, depth, budget) {
    if (++budget.n > 3000) return '<span class="mxui-muted">…</span>';
    if (v === null || typeof v !== 'object') return `<span class="jv j-${v === null ? 'n' : typeof v}" data-p="${E(p)}">${E(JSON.stringify(v))}</span>`;
    const ent = Array.isArray(v) ? v.map((x, i) => [i, x]) : Object.entries(v);
    return `<details${depth < 2 ? ' open' : ''}><summary data-p="${E(p)}">${Array.isArray(v) ? `[ ${ent.length} ]` : `{ ${ent.length} }`}</summary><div class="j-in">${ent.map(([k, x]) => `<div class="j-row"><span class="j-k" data-p="${E(pathOf(p, k))}">${E(Array.isArray(v) ? k : JSON.stringify(k))}</span>: ${tree(x, pathOf(p, k), depth + 1, budget)}</div>`).join('')}</div></details>`;
  }
  const getPath = (v, p) => { try { return Function('$', 'return ' + p.replace(/^\$/, '$'))(v); } catch { return undefined; } };
  M.register('JsonTree', {
    label: 'JSON 树', icon: '{}',
    read: d => { let j = d.json ?? d.data ?? d.text ?? ''; if (typeof j !== 'string') j = JSON.stringify(j); return { json: str(j, '', 400000) }; },
    proj: s => ({ picks: s.observed.picks || [] }),
    tool: {
      out: st => { try { return { kind: 'json', data: JSON.parse(st.json) }; } catch { return null; } },
      accept: (st, p) => (p.kind === 'json' ? { json: JSON.stringify(p.data, null, 2) } : p.kind === 'text' ? { json: String(p.data) } : null),
      init: d => ({ json: d.json, pick: '' }),
      view(st) {
        let v, err = ''; try { v = JSON.parse(st.json || 'null'); } catch (e) { err = e.message; }
        const picked = st.pick ? getPath(v, st.pick) : undefined;
        return `<details class="t2-src"><summary>${E(T('原始数据'))}</summary><textarea data-f="j" rows="5" spellcheck="false">${E(st.json)}</textarea></details>
          ${err ? `<p class="t2-bad">${E(T('不是有效的 JSON：'))}${E(err)}</p>` : `<div class="mxui-json t2-tree">${tree(v, '$', 0, { n: 0 })}</div>`}
          ${st.pick ? `<div class="t2-pick"><code>${E(st.pick)}</code>${btn('cp-path', T('复制路径'))}${btn('cp-val', T('复制值'))}<pre>${E(JSON.stringify(picked, null, 2)?.slice(0, 4000) ?? 'undefined')}</pre></div>` : `<p class="t2-foot">${E(T('点键名取路径'))}</p>`}`;
      },
      bind(el, st, ro, ctx) {
        const ta = el.querySelector('[data-f=j]'); ta.onchange = () => ctx.set({ json: ta.value });
        el.querySelector('.t2-tree')?.addEventListener('click', e => { const t = e.target.closest('[data-p]'); if (!t || t.tagName === 'SUMMARY' && !e.altKey) return; ctx.set({ pick: t.dataset.p, observed: { ...st.observed, picks: [...new Set([...(st.observed.picks || []), t.dataset.p])].slice(-30) } }); });
        on(el, a => { let v; try { v = JSON.parse(st.json); } catch {} if (a === 'cp-path') copy(st.pick, ctx); if (a === 'cp-val') copy(JSON.stringify(getPath(v, st.pick), null, 2), ctx); });
      },
    },
  });

  /* ---------- 4. 终端：模型预填排查命令；桌面版点 ▶ 在本机执行（走现有的命令安全策略与确认），网页版只能复制 ---------- */
  M.register('PromptPlayground', {
    label: '提示词对比台', icon: '⇋',
    read: d => ({ prompt: str(d.prompt, '', 20000), system: str(d.system, '', 8000), models: arr(d.models).map(m => str(m, '', 120)).slice(0, 2), temperature: Number.isFinite(+d.temperature) ? Math.max(0, Math.min(2, +d.temperature)) : 0.7 }),
    proj: s => ({ promptHash: s.ph || '', systemHash: s.sh || '', models: s.models, temperatureX100: Math.round((s.temperature || 0) * 100), outputs: (s.observed.outs || []).map(o => ({ model: o.model, ms: o.ms, hash: o.hash })) }),
    tool: {
      out: st => { const o = (st.observed.outs || [])[0]; return o ? { kind: 'text', data: o.text } : null; },
      accept: (st, p) => (p.kind === 'text' ? { prompt: String(p.data).slice(0, 20000) } : null),
      init: d => { const ms = models(); return { prompt: d.prompt, system: d.system, temperature: d.temperature, models: [d.models[0] || ms[0] || '', d.models[1] || ms.find(m => m !== (d.models[0] || ms[0])) || ms[0] || ''] }; },
      view(st, ro, ctx) {
        const ms = models(), outs = st.observed.outs || [], busy = ctx.runtime?.busy;
        const sel = i => `<select data-m="${i}">${[...new Set([st.models[i], ...ms])].filter(Boolean).map(m => `<option${m === st.models[i] ? ' selected' : ''}>${E(m)}</option>`).join('')}</select>`;
        return `<details class="t2-src"${st.system ? ' open' : ''}><summary>${E(T('系统提示'))}</summary><textarea data-f="sys" rows="2">${E(st.system)}</textarea></details>
          <textarea data-f="p" rows="4" placeholder="${E(T('提示词'))}">${E(st.prompt)}</textarea>
          <div class="t2-row"><span class="mxui-muted">T</span><input data-f="t" type="number" min="0" max="2" step="0.1" value="${st.temperature}" style="width:70px"><span class="sp"></span>${btn('go', busy ? '…' : '▶ ' + T('运行'), 'pri')}</div>
          <div class="t2-pp">${[0, 1].map(i => { const o = outs.find(x => x.i === i); return `<div class="pp">${sel(i)}<div class="pp-o">${o ? E(o.text) : busy ? '<span class="shimmer">…</span>' : ''}</div>${o ? `<div class="t2-foot">${o.ms} ms · ~${o.tok} tok</div>` : ''}</div>`; }).join('')}</div>
          ${outs.length === 2 ? `<div class="t2-row">${btn('diff', T('对比差异'))}${btn('pick:0', T('采用左边'))}${btn('pick:1', T('采用右边'))}</div>` : ''}`;
      },
      bind(el, st, ro, ctx) {
        const g = s => el.querySelector(s);
        g('[data-f=p]').onchange = e => ctx.set({ prompt: e.target.value }, false); g('[data-f=sys]').onchange = e => ctx.set({ system: e.target.value }, false);
        g('[data-f=t]').onchange = e => ctx.set({ temperature: Math.max(0, Math.min(2, +e.target.value || 0)) }, false);
        el.querySelectorAll('[data-m]').forEach(s => (s.onchange = () => { const m = [...ctx.st.models]; m[+s.dataset.m] = s.value; ctx.set({ models: m }, false); }));
        on(el, async a => {
          if (a === 'go') {
            const p = g('[data-f=p]').value.trim(); if (!p || typeof modelAsk !== 'function') return ctx.toast(T('先填提示词，并连接模型'));
            ctx.set({ prompt: p, system: g('[data-f=sys]').value, ph: await sha256(p), sh: await sha256(g('[data-f=sys]').value) }, false);
            ctx.runtime.busy = true; ctx.obs({ outs: [] });
            const outs = await Promise.all(ctx.st.models.map(async (m, i) => { const t0 = performance.now(); let text; try { text = await modelAsk(m, ctx.st.system || 'You are a helpful assistant.', p); } catch (e) { text = '⚠ ' + (e.message || e); } return { i, model: m, text, ms: Math.round(performance.now() - t0), tok: Math.round(text.length / 3), hash: await sha256(text) }; }));
            ctx.runtime.busy = false; ctx.obs({ outs });
          } else if (a === 'diff') { const o = ctx.st.observed.outs; M.open1('CodeDiff', { left: { path: o[0].model, content: o[0].text }, right: { path: o[1].model, content: o[1].text } }, T('方案对比')); }
          else if (a.startsWith('pick:')) { const o = ctx.st.observed.outs.find(x => x.i === +a.slice(5)); if (o) copy(o.text, ctx); }
        });
      },
    },
  });

  /* ---------- 6. Token 计数：估算 token 与成本（按路由里的模型价格），一键裁剪 ---------- */
  const tok = s => { s = String(s || ''); const cjk = (s.match(/[　-鿿가-힯＀-￯]/g) || []).length; return Math.ceil(cjk * 1.05 + (s.length - cjk) / 3.8); };
  const cutTo = (s, n) => { let lo = 0, hi = s.length; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (tok(s.slice(0, m)) <= n) lo = m; else hi = m - 1; } return s.slice(0, lo); };
  M.register('TokenCounter', {
    label: 'Token 计数', icon: '#',
    read: d => ({ text: str(d.text, '', 400000), model: str(d.model, '', 120) }),
    proj: s => ({ tokens: tok(s.text), model: s.model }),
    tool: {
      out: st => ({ kind: 'text', data: st.text }),
      accept: (st, p) => (p.kind === 'text' || p.kind === 'json' ? { text: typeof p.data === 'string' ? p.data : JSON.stringify(p.data) } : null),
      init: d => { let m = d.model; try { m ||= S.model; } catch {} return { text: d.text, model: m || '' }; },
      view(st) {
        const n = tok(st.text), info = G.MxRouter?.info?.(st.model), pin = info?.i, pout = info?.p;
        const usd = x => (x < 0.01 ? '$' + x.toFixed(4) : '$' + x.toFixed(3));
        return `<textarea data-f="x" rows="6">${E(st.text)}</textarea>
          <div class="t2-big"><b>${n.toLocaleString()}</b><span>tokens</span><span>${st.text.length.toLocaleString()} ${E(T('字'))}</span></div>
          <div class="t2-row"><select data-f="m">${[...new Set([st.model, ...models()])].filter(Boolean).map(m => `<option${m === st.model ? ' selected' : ''}>${E(m)}</option>`).join('')}</select><span class="mxui-muted">${pin >= 0 ? `${E(T('输入'))} ${usd(n * pin / 1e6)}${pout >= 0 ? ` · ${E(T('同样长度输出'))} ${usd(n * pout / 1e6)}` : ''}` : E(T('没有这个模型的价格'))}</span></div>
          <div class="t2-row"><span class="mxui-muted">${E(T('裁剪到'))}</span><input data-f="n" type="number" min="1" step="100" value="${Math.min(n, 4000)}" style="width:100px"><span class="mxui-muted">tokens</span>${btn('cut', T('裁剪'))}${btn('copy', T('复制'))}</div>`;
      },
      bind(el, st, ro, ctx) {
        const x = el.querySelector('[data-f=x]'); x.oninput = () => { clearTimeout(x._t); x._t = setTimeout(() => { ctx.set({ text: x.value }); const n = el.querySelector('[data-f=x]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 300); };
        el.querySelector('[data-f=m]').onchange = e => ctx.set({ model: e.target.value });
        on(el, a => { if (a === 'cut') ctx.set({ text: cutTo(st.text, Math.max(1, +el.querySelector('[data-f=n]').value || 1)) }); if (a === 'copy') copy(st.text, ctx); });
      },
    },
  });

  /* ---------- 7. 思维导图：横向树；点选节点后加子节点 / 同级、升降级、改名、删除 ---------- */
  const mmNorm = (n, d = 0) => ({ id: Math.random().toString(36).slice(2, 9), t: str(typeof n === 'string' ? n : obj(n).t ?? obj(n).title ?? obj(n).text, '…', 80), c: d > 6 ? [] : arr(typeof n === 'string' ? [] : obj(n).c ?? obj(n).children).slice(0, 30).map(x => mmNorm(x, d + 1)) });
  const mmFind = (n, id, p = null) => { if (n.id === id) return { n, p }; for (const c of n.c) { const r = mmFind(c, id, n); if (r) return r; } return null; };
  const mmOutline = (n, d = 0) => '  '.repeat(d) + '- ' + n.t + '\n' + n.c.map(c => mmOutline(c, d + 1)).join('');
  M.register('MindMap', {
    label: '思维导图', icon: '✣',
    read: d => ({ root: mmNorm(d.root ?? { t: d.title || '主题', c: d.children ?? d.nodes ?? [] }) }),
    proj: s => ({ outline: mmOutline(s.root) }),
    tool: {
      out: st => ({ kind: 'text', data: mmOutline(st.root) }),
      init: d => ({ root: d.root, sel: d.root.id }),
      view(st) {
        const W = 150, H = 34, GX = 46, GY = 10, pos = []; let y = 0;
        (function lay(n, d) { if (!n.c.length) { pos.push({ n, x: d * (W + GX), y: y }); y += H + GY; return pos.at(-1).y; } const ys = n.c.map(c => lay(c, d + 1)); const me = { n, x: d * (W + GX), y: (ys[0] + ys.at(-1)) / 2 }; pos.push(me); return me.y; })(st.root, 0);
        const at = new Map(pos.map(p => [p.n.id, p])), maxX = Math.max(...pos.map(p => p.x)) + W + 8, maxY = Math.max(...pos.map(p => p.y)) + H + 8;
        const links = pos.flatMap(p => p.n.c.map(c => { const a = p, b = at.get(c.id); return `<path d="M${a.x + W} ${a.y + H / 2} C${a.x + W + GX / 2} ${a.y + H / 2} ${b.x - GX / 2} ${b.y + H / 2} ${b.x} ${b.y + H / 2}"/>`; })).join('');
        const nodes = pos.map(p => `<g class="mm-n${p.n.id === st.sel ? ' on' : ''}${p.n === st.root ? ' root' : ''}" data-id="${p.n.id}" transform="translate(${p.x},${p.y})"><rect width="${W}" height="${H}" rx="10"/><text x="${W / 2}" y="${H / 2 + 4}" text-anchor="middle">${E(p.n.t.length > 16 ? p.n.t.slice(0, 15) + '…' : p.n.t)}</text><title>${E(p.n.t)}</title></g>`).join('');
        return `<div class="t2-row mm-bar">${btn('child', '+ ' + T('子'))}${btn('sib', '+ ' + T('同级'))}${btn('out', '⇤', '', T('升级'))}${btn('in', '⇥', '', T('降级'))}${btn('ren', '✎', '', T('改名'))}${btn('del', '✕', '', T('删除'))}<span class="sp"></span>${btn('copy', T('复制大纲'))}</div>
          <div class="mm-wrap"><svg width="${maxX}" height="${maxY}" class="mm"><g class="mm-l">${links}</g>${nodes}</svg></div>`;
      },
      bind(el, st, ro, ctx) {
        el.querySelector('svg.mm').onclick = e => { const g = e.target.closest('[data-id]'); if (g) ctx.set({ sel: g.dataset.id }); };
        el.querySelector('svg.mm').ondblclick = e => { const g = e.target.closest('[data-id]'); if (g) { ctx.set({ sel: g.dataset.id }, false); el.querySelector('[data-x=ren]').click(); } };
        on(el, a => {
          const root = JSON.parse(JSON.stringify(ctx.st.root)), f = mmFind(root, ctx.st.sel) || { n: root, p: null }, nn = t => ({ id: Math.random().toString(36).slice(2, 9), t, c: [] });
          if (a === 'copy') return copy(mmOutline(root), ctx);
          if (a === 'child') { const x = nn(T('新节点')); f.n.c.push(x); return ctx.set({ root, sel: x.id }); }
          if (a === 'sib' && f.p) { const x = nn(T('新节点')); f.p.c.splice(f.p.c.indexOf(f.n) + 1, 0, x); return ctx.set({ root, sel: x.id }); }
          if (a === 'del' && f.p) { f.p.c = f.p.c.filter(x => x !== f.n); return ctx.set({ root, sel: f.p.id }); }
          if (a === 'in' && f.p) { const i = f.p.c.indexOf(f.n); if (i > 0) { f.p.c.splice(i, 1); f.p.c[i - 1].c.push(f.n); return ctx.set({ root }); } }
          if (a === 'out' && f.p) { const gp = mmFind(root, f.p.id, null) && (function up(n) { for (const c of n.c) { if (c === f.p) return n; const r = up(c); if (r) return r; } return null; })(root); if (gp) { f.p.c = f.p.c.filter(x => x !== f.n); gp.c.splice(gp.c.indexOf(f.p) + 1, 0, f.n); return ctx.set({ root }); } }
          if (a === 'ren') { const g = el.querySelector(`[data-id="${ctx.st.sel}"]`); if (!g) return; const r = g.getBoundingClientRect(), box = el.getBoundingClientRect(), inp = document.createElement('input'); inp.className = 'mm-edit'; inp.value = f.n.t; Object.assign(inp.style, { left: r.left - box.left + 'px', top: r.top - box.top + 'px', width: r.width + 'px', height: r.height + 'px' }); el.append(inp); inp.focus(); inp.select(); const done = ok => { if (ok && inp.value.trim()) { f.n.t = inp.value.trim().slice(0, 80); ctx.set({ root }); } inp.remove(); }; inp.onkeydown = e => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); e.stopPropagation(); }; inp.onblur = () => done(true); }
        });
      },
    },
  });

  /* ---------- 8. 配色：点色块复制 Hex；色相 / 饱和度 / 亮度微调；和白 / 黑的对比度 ---------- */
  const hex2hsl = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return [0, 0, 50]; const n = parseInt(m[1], 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; let hh = 0, s = 0; if (d) { s = d / (1 - Math.abs(2 * l - 1)); hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh *= 60; if (hh < 0) hh += 360; } return [Math.round(hh), Math.round(s * 100), Math.round(l * 100)]; };
  const hsl2hex = (h, s, l) => { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join(''); };
  const lum = h => { const n = parseInt(h.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  M.register('ColorPalette', {
    label: '配色', icon: '◐',
    read: d => ({ name: str(d.name ?? d.title, '', 60), colors: arr(d.colors).map(c => (typeof c === 'string' ? { hex: c, name: '' } : { hex: str(obj(c).hex, '', 9), name: str(obj(c).name, '', 30) })).filter(c => /^#[0-9a-f]{6}$/i.test(c.hex)).slice(0, 10) }),
    proj: s => ({ colors: s.colors.map(c => c.hex.toLowerCase()) }),
    tool: {
      init: d => ({ name: d.name, colors: d.colors.length ? d.colors : ['#5b4fe0', '#1fbfa8', '#f4efe3', '#1f1d1a', '#f0a43a'].map(hex => ({ hex, name: '' })), sel: 0 }),
      view(st) {
        const c = st.colors[st.sel] || st.colors[0], [h, s, l] = hex2hsl(c.hex);
        return `<div class="cp-row">${st.colors.map((x, i) => `<button type="button" class="cp-sw${i === st.sel ? ' on' : ''}" data-i="${i}" style="background:${x.hex}"><span style="color:${contrast(x.hex, '#ffffff') > 3 ? '#fff' : '#111'}">${x.hex.toUpperCase()}</span></button>`).join('')}</div>
          <div class="cp-ed"><label>H<input type="range" min="0" max="360" value="${h}" data-k="h"></label><label>S<input type="range" min="0" max="100" value="${s}" data-k="s"></label><label>L<input type="range" min="0" max="100" value="${l}" data-k="l"></label></div>
          <div class="t2-row"><code>${c.hex.toUpperCase()}</code><span class="mxui-muted">${E(T('对白'))} ${contrast(c.hex, '#ffffff').toFixed(1)} · ${E(T('对黑'))} ${contrast(c.hex, '#000000').toFixed(1)}</span><span class="sp"></span>${btn('cp', T('复制'))}${btn('css', 'CSS')}</div>`;
      },
      bind(el, st, ro, ctx) {
        el.querySelectorAll('.cp-sw').forEach(b => (b.onclick = () => { if (+b.dataset.i === ctx.st.sel) copy(ctx.st.colors[ctx.st.sel].hex, ctx); else ctx.set({ sel: +b.dataset.i }); }));
        el.querySelectorAll('[data-k]').forEach(r => (r.oninput = () => { const v = {}; el.querySelectorAll('[data-k]').forEach(x => (v[x.dataset.k] = +x.value)); const cs = ctx.st.colors.map((x, i) => (i === ctx.st.sel ? { ...x, hex: hsl2hex(v.h, v.s, v.l) } : x)); ctx.set({ colors: cs }, false); const sw = el.querySelectorAll('.cp-sw')[ctx.st.sel]; sw.style.background = cs[ctx.st.sel].hex; sw.firstChild.textContent = cs[ctx.st.sel].hex.toUpperCase(); el.querySelector('.t2-row code').textContent = cs[ctx.st.sel].hex.toUpperCase(); }));
        el.querySelectorAll('[data-k]').forEach(r => (r.onchange = () => ctx.redraw()));
        on(el, a => { if (a === 'cp') copy(ctx.st.colors[ctx.st.sel].hex, ctx); if (a === 'css') copy(':root{\n' + ctx.st.colors.map((c, i) => `  --c${i + 1}: ${c.hex};`).join('\n') + '\n}', ctx); });
      },
    },
  });

  /* ---------- 9. 文本对比：按词（中文按字）对比，红删绿增 ---------- */
  const words = s => String(s || '').match(/[　-鿿＀-￯]|[A-Za-z0-9_'’-]+|\s+|[^\sA-Za-z0-9_　-鿿]/g) || [];
  function wdiff(a, b) {
    const A = words(a), B = words(b); if (A.length * B.length > 4e6) return [{ t: '-', s: a }, { t: '+', s: b }];
    const n = A.length, m = B.length, L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const out = [], push = (t, s) => { const l = out[out.length - 1]; if (l && l.t === t) l.s += s; else out.push({ t, s }); };
    let i = 0, j = 0; while (i < n || j < m) { if (i < n && j < m && A[i] === B[j]) { push('=', A[i]); i++; j++; } else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) push('+', B[j++]); else push('-', A[i++]); }
    return out;
  }
  M.register('TextDiff', {
    label: '文本对比', icon: '⧉',
    read: d => ({ left: str(d.left ?? d.a ?? d.old, '', 100000), right: str(d.right ?? d.b ?? d.new, '', 100000), lt: str(d.leftTitle, '', 60), rt: str(d.rightTitle, '', 60) }),
    proj: s => ({ leftLen: s.left.length, rightLen: s.right.length, changes: wdiff(s.left, s.right).filter(x => x.t !== '=').length }),
    tool: {
      accept: (st, p) => (p.kind === 'text' ? (!st.left ? { left: String(p.data) } : { right: String(p.data) }) : null),
      init: d => d,
      view(st) {
        const D = wdiff(st.left, st.right), add = D.filter(x => x.t === '+').reduce((n, x) => n + x.s.length, 0), del = D.filter(x => x.t === '-').reduce((n, x) => n + x.s.length, 0);
        return `<details class="t2-src"><summary>${E(T('编辑两边'))}</summary><div class="td-ed"><textarea data-f="l" rows="5" placeholder="${E(st.lt || T('原文'))}">${E(st.left)}</textarea><textarea data-f="r" rows="5" placeholder="${E(st.rt || T('新文'))}">${E(st.right)}</textarea></div></details>
          <div class="t2-row"><span class="cd-n add">+${add}</span><span class="cd-n del">−${del}</span><span class="mxui-muted">${E(st.lt || '')}${st.lt || st.rt ? ' → ' : ''}${E(st.rt || '')}</span></div>
          <div class="td-out">${D.map(x => (x.t === '=' ? E(x.s) : `<${x.t === '+' ? 'ins' : 'del'}>${E(x.s)}</${x.t === '+' ? 'ins' : 'del'}>`)).join('')}</div>`;
      },
      bind(el, st, ro, ctx) { el.querySelector('[data-f=l]').onchange = e => ctx.set({ left: e.target.value }); el.querySelector('[data-f=r]').onchange = e => ctx.set({ right: e.target.value }); },
    },
  });

  /* ---------- 10. 数据表：单元格编辑、增删行列、类型提示、底栏统计、导出 CSV ---------- */
  M.register('DataTable', {
    label: '数据表', icon: '▤',
    read: d => { const cols = arr(d.columns).map(c => (typeof c === 'string' ? { key: c, type: 'text' } : { key: str(obj(c).key ?? obj(c).name, '', 40), type: ['number', 'text', 'date', 'bool'].includes(obj(c).type) ? obj(c).type : 'text' })).filter(c => c.key).slice(0, 30); return { columns: cols.length ? cols : [{ key: 'A', type: 'text' }, { key: 'B', type: 'text' }], rows: arr(d.rows).slice(0, 500).map(r => (Array.isArray(r) ? Object.fromEntries(cols.map((c, i) => [c.key, r[i] ?? ''])) : obj(r))) }; },
    proj: s => ({ columns: s.columns.map(c => c.key), rows: s.rows.length, edits: (s.observed.edits || []).length }),
    tool: {
      out: st => ({ kind: 'json', data: st.rows }),
      accept: (st, p) => { const d = p.kind === 'json' ? p.data : null; if (!Array.isArray(d) || !d.length || typeof d[0] !== 'object') return null; const keys = [...new Set(d.slice(0, 50).flatMap(r => Object.keys(r || {})))].slice(0, 30); return { columns: keys.map(k => ({ key: k, type: typeof d[0][k] === 'number' ? 'number' : 'text' })), rows: d.slice(0, 500) }; },
      init: d => d,
      view(st, ro) {
        const bad = (c, v) => c.type === 'number' && v !== '' && v != null && !Number.isFinite(+v);
        const empties = st.rows.reduce((n, r) => n + st.columns.filter(c => r[c.key] === '' || r[c.key] == null).length, 0);
        return `<div class="dt-wrap"><table class="dt"><thead><tr>${st.columns.map((c, j) => `<th><span class="dt-ty">${{ number: '#', date: '◷', bool: '✓', text: 'T' }[c.type]}</span>${E(c.key)}${ro ? '' : `<button type="button" data-x="dc:${j}" class="dt-x">×</button>`}</th>`).join('')}${ro ? '' : `<th>${btn('ac', '+')}</th>`}</tr></thead>
          <tbody>${st.rows.map((r, i) => `<tr>${st.columns.map((c, j) => `<td contenteditable="${!ro}" data-i="${i}" data-j="${j}" class="${bad(c, r[c.key]) ? 'bad' : ''}">${E(r[c.key] ?? '')}</td>`).join('')}${ro ? '' : `<td><button type="button" data-x="dr:${i}" class="dt-x">×</button></td>`}</tr>`).join('')}</tbody></table></div>
          <div class="t2-row">${ro ? '' : btn('ar', '+ ' + T('行'))}<span class="mxui-muted">${st.rows.length} ${E(T('行'))} · ${E(T('空值'))} ${empties} · ${E(T('修改'))} ${(st.observed.edits || []).length}</span><span class="sp"></span>${btn('csv', 'CSV')}</div>`;
      },
      bind(el, st, ro, ctx) {
        el.querySelectorAll('td[data-i]').forEach(td => (td.onblur = () => { const i = +td.dataset.i, c = ctx.st.columns[+td.dataset.j], v = td.textContent; if (String(ctx.st.rows[i][c.key] ?? '') === v) return; const rows = ctx.st.rows.map((r, k) => (k === i ? { ...r, [c.key]: c.type === 'number' && v !== '' && Number.isFinite(+v) ? +v : v } : r)); ctx.set({ rows, observed: { ...ctx.st.observed, edits: [...(ctx.st.observed.edits || []), { row: i, col: c.key, t: Date.now() }].slice(-500) } }); }));
        on(el, a => {
          const [k, n] = a.split(':');
          if (k === 'ar') ctx.set({ rows: [...ctx.st.rows, {}] }); else if (k === 'dr') ctx.set({ rows: ctx.st.rows.filter((_, i) => i !== +n) });
          else if (k === 'ac') { const key = String.fromCharCode(65 + ctx.st.columns.length % 26) + (ctx.st.columns.length >= 26 ? ctx.st.columns.length : ''); ctx.set({ columns: [...ctx.st.columns, { key, type: 'text' }] }); }
          else if (k === 'dc') ctx.set({ columns: ctx.st.columns.filter((_, i) => i !== +n) });
          else if (k === 'csv') { const q = v => { v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }; M.download('table.csv', '﻿' + [ctx.st.columns.map(c => q(c.key)).join(','), ...ctx.st.rows.map(r => ctx.st.columns.map(c => q(r[c.key])).join(','))].join('\n')); }
        });
      },
    },
  });

  /* ---------- 11. 行动清单：勾选、负责人、截止日期；导出 Markdown ---------- */
  M.register('ActionItems', {
    label: '行动清单', icon: '☑',
    read: d => ({ title: str(d.title, '', 80), items: arr(d.items ?? d.todos).map(x => (typeof x === 'string' ? { text: x } : obj(x))).map(x => ({ text: str(x.text ?? x.title, '', 300), owner: str(x.owner ?? x.assignee, '', 40), due: str(x.due, '', 20), done: !!x.done })).filter(x => x.text).slice(0, 100) }),
    proj: s => ({ items: s.items.map(x => ({ text: x.text, owner: x.owner, due: x.due, done: !!x.done })) }),
    tool: {
      out: st => ({ kind: 'text', data: st.items.map(x => `- [${x.done ? 'x' : ' '}] ${x.text}${x.owner ? ' @' + x.owner : ''}${x.due ? ' (' + x.due + ')' : ''}`).join('\n') }),
      init: d => d,
      title: st => st.title,
      view(st, ro) {
        const done = st.items.filter(x => x.done).length;
        return `<div class="ai-prog"><i style="width:${st.items.length ? (done / st.items.length) * 100 : 0}%"></i></div><div class="t2-foot">${done} / ${st.items.length}</div>
          <ul class="ai-list">${st.items.map((x, i) => `<li class="${x.done ? 'done' : ''}"><input type="checkbox" data-i="${i}"${x.done ? ' checked' : ''}><span class="ai-t">${E(x.text)}</span><input class="ai-o" data-o="${i}" value="${E(x.owner)}" placeholder="@"><input class="ai-d" type="date" data-d="${i}" value="${E(/^\d{4}-\d{2}-\d{2}$/.test(x.due) ? x.due : '')}"></li>`).join('')}</ul>
          <div class="t2-row">${ro ? '' : `<input data-f="n" class="grow" placeholder="+ ${E(T('事项'))}">`}${btn('md', 'Markdown')}</div>`;
      },
      bind(el, st, ro, ctx) {
        const upd = (i, p) => ctx.set({ items: ctx.st.items.map((x, k) => (k === i ? { ...x, ...p } : x)) });
        el.querySelectorAll('[data-i]').forEach(c => (c.onchange = () => upd(+c.dataset.i, { done: c.checked })));
        el.querySelectorAll('[data-o]').forEach(c => (c.onchange = () => upd(+c.dataset.o, { owner: c.value.replace(/^@/, '').slice(0, 40) })));
        el.querySelectorAll('[data-d]').forEach(c => (c.onchange = () => upd(+c.dataset.d, { due: c.value })));
        const n = el.querySelector('[data-f=n]'); if (n) n.onkeydown = e => { if (e.key === 'Enter' && n.value.trim()) ctx.set({ items: [...ctx.st.items, { text: n.value.trim().slice(0, 300), owner: '', due: '', done: false }] }); };
        on(el, a => { if (a === 'md') copy(M.TOOLS_OUT?.(ctx) || ctx.st.items.map(x => `- [${x.done ? 'x' : ' '}] ${x.text}${x.owner ? ' @' + x.owner : ''}${x.due ? ' (' + x.due + ')' : ''}`).join('\n'), ctx); });
      },
    },
  });

  /* ---------- 12. 网页摘录：模型提取核心观点，你来划重点、写批注，导出 ---------- */
  M.register('WebClipper', {
    label: '网页摘录', icon: '✂',
    read: d => ({ url: /^https?:\/\//.test(d.url || '') ? str(d.url, '', 2000) : '', title: str(d.title, '', 200), points: arr(d.points ?? d.highlights).map(p => str(p, '', 600)).filter(Boolean).slice(0, 40) }),
    proj: s => ({ url: s.url, marked: (s.observed.marked || []).length, notes: Object.keys(s.observed.notes || {}).length }),
    tool: {
      out: st => ({ kind: 'text', data: st.points.filter((_, i) => (st.observed.marked || []).includes(i)).join('\n') || st.points.join('\n') }),
      init: d => d,
      title: st => st.title,
      view(st, ro) {
        const mk = st.observed.marked || [], notes = st.observed.notes || {};
        return `${st.url ? `<a class="wc-url" href="${E(st.url)}" target="_blank" rel="noopener noreferrer">${E(st.url.replace(/^https?:\/\//, '').slice(0, 80))}</a>` : ''}
          <ol class="wc-list">${st.points.map((p, i) => `<li class="${mk.includes(i) ? 'on' : ''}"><button type="button" class="wc-hl" data-x="hl:${i}" title="${E(T('划重点'))}">★</button><div><div class="wc-p">${E(p)}</div><input class="wc-n" data-n="${i}" placeholder="${E(T('批注'))}" value="${E(notes[i] || '')}"></div></li>`).join('')}</ol>
          <div class="t2-row"><span class="mxui-muted">★ ${mk.length}</span><span class="sp"></span>${btn('md', 'Markdown')}</div>`;
      },
      bind(el, st, ro, ctx) {
        el.querySelectorAll('[data-n]').forEach(c => (c.onchange = () => ctx.obs({ notes: { ...(ctx.st.observed.notes || {}), [c.dataset.n]: c.value.slice(0, 500) } }, false)));
        on(el, a => {
          if (a.startsWith('hl:')) { const i = +a.slice(3), mk = ctx.st.observed.marked || []; ctx.obs({ marked: mk.includes(i) ? mk.filter(x => x !== i) : [...mk, i] }); }
          if (a === 'md') { const mk = ctx.st.observed.marked || [], n = ctx.st.observed.notes || {}; copy(`# ${ctx.st.title || ctx.st.url}\n${ctx.st.url}\n\n` + ctx.st.points.map((p, i) => `- ${mk.includes(i) ? '**' + p + '**' : p}${n[i] ? `\n  > ${n[i]}` : ''}`).join('\n'), ctx); }
        });
      },
    },
  });

  /* ---------- 13. 终端记录：导入 hugluno 命令行封存的 .receipt.json，显示时间线并复查整条链 ---------- */
  M.T2 = { cronNext, cronField, tok, cutTo, wdiff, hex2hsl, hsl2hex, contrast, mmOutline };
})();
