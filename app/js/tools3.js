'use strict';
/* 第三批工具卡：图表 · 流程图 · 甘特图 · 正则 · 记忆卡（模型填数据，边写边画；你来改） */
(() => {
  const G = globalThis;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const COLORS = ['#8B7CFF', '#1FD1B6', '#FFB547', '#FF6B8A', '#5AB8FF', '#C6F36B', '#F78CFF', '#9AA4B2'];
  const fmtN = v => { const a = Math.abs(v); return a >= 1e9 ? (v / 1e9).toFixed(1) + 'B' : a >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : a >= 1e4 ? (v / 1e3).toFixed(1) + 'k' : +v.toFixed(a < 1 ? 2 : a < 100 ? 1 : 0) + ''; };
  const day = s => { const t = Date.parse(String(s || '').slice(0, 10) + 'T00:00:00Z'); return Number.isFinite(t) ? Math.round(t / 864e5) : null; };
  const iso = d => new Date(d * 864e5).toISOString().slice(0, 10);

  /* ---------- 纯函数（测试用） ---------- */
  function readChart(d) {
    const o = d && typeof d === 'object' ? d : {}, labels = (Array.isArray(o.labels) ? o.labels : []).slice(0, 200).map(x => String(x).slice(0, 30));
    const series = (Array.isArray(o.series) ? o.series : Array.isArray(o.data) ? [{ name: o.name || '', data: o.data }] : []).slice(0, 8).map((s, i) => ({ name: String(s?.name ?? '').slice(0, 30), color: /^#[0-9a-f]{6}$/i.test(s?.color || '') ? s.color : COLORS[i % COLORS.length], data: (Array.isArray(s?.data) ? s.data : []).slice(0, 200).map(v => (Array.isArray(v) ? v.slice(0, 2).map(Number) : Number(v))) }));
    return { title: String(o.title || '').slice(0, 60), type: ['bar', 'line', 'area', 'pie', 'scatter', 'stack'].includes(o.type) ? o.type : 'bar', labels, series, unit: String(o.unit || '').slice(0, 12) };
  }
  function layoutFlow(nodes, edges) { // 分层排版：最长路径定层，层内按出现顺序；返回 { pos: id → {x,y}, W, H }
    const ids = nodes.map(n => n.id), rank = Object.fromEntries(ids.map(i => [i, 0])), indeg = Object.fromEntries(ids.map(i => [i, 0]));
    const out = Object.fromEntries(ids.map(i => [i, []])); edges.forEach(e => { if (out[e.from] && rank[e.to] !== undefined && e.from !== e.to) { out[e.from].push(e.to); indeg[e.to]++; } });
    const q = ids.filter(i => !indeg[i]), seen = new Set(); if (!q.length && ids.length) q.push(ids[0]);
    const preds = Object.fromEntries(ids.map(i => [i, []])); edges.forEach(e => preds[e.to] && out[e.from] && preds[e.to].push(e.from));
    for (let k = 0, guard = 0; guard++ < 10000;) {
      for (; k < q.length; k++) { const u = q[k]; if (seen.has(u)) continue; seen.add(u); for (const v of out[u]) { if (seen.has(v)) continue; rank[v] = Math.max(rank[v], rank[u] + 1); if (--indeg[v] <= 0) q.push(v); } }
      const rest = ids.filter(i => !seen.has(i)); if (!rest.length) break;
      const u = rest.find(i => preds[i].some(p => seen.has(p))) || rest[0]; rank[u] = Math.max(0, ...preds[u].filter(p => seen.has(p)).map(p => rank[p] + 1)); q.push(u); // 有环：从已排好的前驱接着排，把环断开
    }
    const layers = []; ids.forEach(i => (layers[rank[i]] ||= []).push(i));
    const NW = 150, NH = 44, GX = 40, GY = 56, maxW = Math.max(1, ...layers.map(l => l?.length || 0)), pos = {};
    layers.forEach((l, r) => (l || []).forEach((id, k) => { pos[id] = { x: (k - (l.length - 1) / 2) * (NW + GX) + (maxW * (NW + GX)) / 2, y: r * (NH + GY) + NH / 2 + 10 }; }));
    return { pos, W: maxW * (NW + GX), H: layers.length * (NH + GY) + 10, NW, NH };
  }
  function toMermaid(nodes, edges) { const sh = n => (n.type === 'decision' ? `{${n.text}}` : n.type === 'start' || n.type === 'end' ? `([${n.text}])` : `[${n.text}]`); return ['flowchart TD', ...nodes.map(n => `  ${n.id}${sh({ ...n, text: n.text.replace(/["[\]{}()]/g, ' ') })}`), ...edges.map(e => `  ${e.from} -->${e.label ? '|' + e.label.replace(/\|/g, ' ') + '|' : ''} ${e.to}`)].join('\n'); }
  const risky = p => /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/.test(p); // (a+)+ 一类：可能卡死，只在前 2000 字上跑
  function regexRun(pattern, flags, text) {
    let re; try { re = new RegExp(pattern, [...new Set(String(flags || '').replace(/[^gimsuy]/g, '') + 'g')].join('')); } catch (e) { return { err: String(e.message || e), hits: [] }; }
    const src = risky(pattern) ? text.slice(0, 2000) : text.slice(0, 50000), hits = []; let m, n = 0;
    while ((m = re.exec(src)) && n++ < 2000) { hits.push({ i: m.index, s: m[0], g: m.slice(1) }); if (m[0] === '') re.lastIndex++; }
    return { err: '', hits, cut: src.length < text.length };
  }
  G.MxTools3 = { readChart, layoutFlow, toMermaid, regexRun, risky, day, iso };

  const M = G.MXUI; if (!M?.register || !G.document) return;
  const { E, T, str, arr, obj } = M;
  const btn = (a, label, cls = '', title = '') => `<button type="button" class="${cls}" data-x="${a}"${title ? ` title="${E(title)}"` : ''}>${label}</button>`;
  const on = (el, fn) => { el.onclick = e => { const b = e.target.closest('[data-x]'); if (b && el.contains(b)) fn(b.dataset.x, b, e); }; };
  const dl = (name, text, type = 'text/plain') => { const u = URL.createObjectURL(new Blob([text], { type })), a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 3000); };

  /* ---------- 1. 图表 ---------- */
  function paintChart(cv, c, hover) {
    const dpr = Math.min(2, G.devicePixelRatio || 1), W = cv.clientWidth * dpr, H = cv.clientHeight * dpr; if (!W || !H) return null; if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const g = cv.getContext('2d'); g.clearRect(0, 0, W, H); g.font = `${11 * dpr}px system-ui,sans-serif`;
    const S = c.series.filter(s => s.data.length); if (!S.length) return null;
    if (c.type === 'pie') {
      const d = S[0].data.map(v => Math.max(0, +v || 0)), sum = d.reduce((a, b) => a + b, 0) || 1, R = Math.min(W, H) * 0.36, cx = W * 0.4, cy = H / 2; let a0 = -Math.PI / 2;
      d.forEach((v, i) => { const a1 = a0 + (v / sum) * Math.PI * 2, mid = (a0 + a1) / 2, off = hover === i ? 8 * dpr : 0; g.fillStyle = COLORS[i % COLORS.length]; g.beginPath(); g.moveTo(cx + Math.cos(mid) * off, cy + Math.sin(mid) * off); g.arc(cx + Math.cos(mid) * off, cy + Math.sin(mid) * off, R, a0, a1); g.fill(); a0 = a1; });
      g.fillStyle = '#0f1015'; g.beginPath(); g.arc(cx, cy, R * 0.55, 0, 7); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = `600 ${15 * dpr}px system-ui`; g.fillText(fmtN(sum) + (c.unit ? ' ' + c.unit : ''), cx, cy + 5 * dpr);
      g.font = `${11 * dpr}px system-ui`; g.textAlign = 'left'; d.forEach((v, i) => { const y = cy - (d.length * 18 * dpr) / 2 + i * 18 * dpr; g.fillStyle = COLORS[i % COLORS.length]; g.fillRect(W * 0.72, y, 10 * dpr, 10 * dpr); g.fillStyle = hover === i ? '#fff' : 'rgba(255,255,255,.75)'; g.fillText(`${c.labels[i] ?? i + 1} · ${Math.round((v / sum) * 100)}%`, W * 0.72 + 16 * dpr, y + 9 * dpr); });
      return { pie: { cx, cy, R, d, sum } };
    }
    const n = Math.max(c.labels.length, ...S.map(s => s.data.length)), pad = { l: 44 * dpr, r: 12 * dpr, t: 12 * dpr, b: 26 * dpr }, pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    let vals = c.type === 'scatter' ? S.flatMap(s => s.data.map(p => (Array.isArray(p) ? p[1] : p))) : c.type === 'stack' ? [...Array(n)].map((_, i) => S.reduce((a, s) => a + (+s.data[i] || 0), 0)) : S.flatMap(s => s.data.map(Number));
    vals = vals.filter(Number.isFinite); let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals); if (hi === lo) hi = lo + 1; const step = M.niceStep ? 0 : 0; const span = hi - lo, ns = Math.pow(10, Math.floor(Math.log10(span / 5))), st = [1, 2, 5, 10].map(k => k * ns).find(k => span / k <= 6); lo = Math.floor(lo / st) * st; hi = Math.ceil(hi / st) * st;
    const Y = v => pad.t + ph - ((v - lo) / (hi - lo)) * ph, X = i => pad.l + (n <= 1 ? pw / 2 : (i / (n - 1)) * pw), bw = pw / n;
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.fillStyle = 'rgba(255,255,255,.45)'; g.textAlign = 'right'; g.lineWidth = 1;
    for (let v = lo; v <= hi + 1e-9; v += st) { g.beginPath(); g.moveTo(pad.l, Math.round(Y(v)) + 0.5); g.lineTo(W - pad.r, Math.round(Y(v)) + 0.5); g.stroke(); g.fillText(fmtN(v), pad.l - 6 * dpr, Y(v) + 4 * dpr); }
    g.textAlign = 'center'; const every = Math.ceil(n / Math.max(1, Math.floor(pw / (60 * dpr)))); for (let i = 0; i < n; i += every) g.fillText(c.labels[i] ?? String(i + 1), c.type === 'bar' || c.type === 'stack' ? pad.l + bw * (i + 0.5) : X(i), H - 8 * dpr);
    if (hover != null && hover >= 0 && hover < n) { g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(c.type === 'bar' || c.type === 'stack' ? pad.l + bw * hover : X(hover) - bw / 2, pad.t, bw, ph); }
    S.forEach((s, si) => {
      g.strokeStyle = g.fillStyle = s.color; g.lineWidth = 2.2 * dpr;
      if (c.type === 'bar') { const w = (bw * 0.72) / S.length; s.data.forEach((v, i) => { const y0 = Y(0), y1 = Y(+v || 0); g.beginPath(); g.roundRect?.(pad.l + bw * i + bw * 0.14 + w * si, Math.min(y0, y1), w - 2 * dpr, Math.max(1, Math.abs(y1 - y0)), 3 * dpr); g.fill(); }); }
      else if (c.type === 'stack') { s.data.forEach((v, i) => { const below = S.slice(0, si).reduce((a, x) => a + (+x.data[i] || 0), 0), y0 = Y(below), y1 = Y(below + (+v || 0)); g.fillRect(pad.l + bw * i + bw * 0.18, y1, bw * 0.64, Math.max(1, y0 - y1)); }); }
      else if (c.type === 'scatter') s.data.forEach((p, i) => { const [x, y] = Array.isArray(p) ? p : [i, p]; const xs = S.flatMap(q => q.data.map((pp, k) => (Array.isArray(pp) ? pp[0] : k))), x0 = Math.min(...xs), x1 = Math.max(...xs) || 1; g.globalAlpha = 0.85; g.beginPath(); g.arc(pad.l + ((x - x0) / (x1 - x0 || 1)) * pw, Y(y), 4 * dpr, 0, 7); g.fill(); g.globalAlpha = 1; });
      else { g.beginPath(); s.data.forEach((v, i) => (i ? g.lineTo(X(i), Y(+v)) : g.moveTo(X(i), Y(+v)))); g.stroke(); if (c.type === 'area') { g.lineTo(X(s.data.length - 1), Y(0)); g.lineTo(X(0), Y(0)); g.closePath(); g.globalAlpha = 0.18; g.fill(); g.globalAlpha = 1; } s.data.forEach((v, i) => { g.beginPath(); g.arc(X(i), Y(+v), (hover === i ? 4.5 : 2.5) * dpr, 0, 7); g.fill(); }); }
    });
    return { n, pad, pw, bw, X };
  }
  M.register('ChartCard', {
    label: '图表', icon: '▥', wide: true, addable: true,
    kw: /图表|柱状|折线|饼图|趋势|占比|统计|可视化|chart|bar|line chart|pie|trend|visuali[sz]/i,
    read: d => readChart(d),
    proj: s => ({ type: s.type, labels: s.labels.length, series: s.series.map(x => ({ name: x.name, n: x.data.length })) }),
    tool: {
      out: st => ({ kind: 'json', data: { labels: st.labels, series: st.series.map(s => ({ name: s.name, data: s.data })) } }),
      accept: (st, p) => { if (p.kind !== 'json' && p.kind !== 'text') return null; try { const d = typeof p.data === 'string' ? JSON.parse(p.data) : p.data; const c = readChart(Array.isArray(d) ? { series: [{ data: d }] } : d); return c.series.length ? { labels: c.labels, series: c.series } : null; } catch { return null; } },
      init: d => d, title: st => st.title,
      paint(el, st) { const cv = el.querySelector('.ch-cv'); if (cv) paintChart(cv, st); },
      view(st) {
        const legend = st.type !== 'pie' && st.series.length > 1 ? `<div class="ch-lg">${st.series.map(s => `<span><i style="background:${s.color}"></i>${E(s.name)}</span>`).join('')}</div>` : '';
        return `<div class="t2-row">${['bar', 'line', 'area', 'stack', 'pie', 'scatter'].map(k => btn('ty:' + k, { bar: '▥', line: '⟋', area: '◢', stack: '▤', pie: '◔', scatter: '⁘' }[k], 'ch-ty' + (st.type === k ? ' on' : ''), T({ bar: '柱状', line: '折线', area: '面积', stack: '堆叠', pie: '饼图', scatter: '散点' }[k]))).join('')}<span class="sp"></span>${btn('png', '⤓', '', T('导出 PNG'))}${btn('csv', 'CSV', '', T('导出 CSV'))}</div>${legend}<div class="ch-box"><canvas class="ch-cv"></canvas><div class="ch-tip" hidden></div></div>`;
      },
      bind(el, st, ro, ctx) {
        const cv = el.querySelector('.ch-cv'), tip = el.querySelector('.ch-tip'); let geo = null;
        const draw = h => (geo = paintChart(cv, ctx.st, h)); requestAnimationFrame(() => draw());
        new ResizeObserver(() => draw()).observe(cv);
        cv.onpointermove = e => { if (!geo) return; const r = cv.getBoundingClientRect(), dpr = cv.width / r.width, x = (e.clientX - r.left) * dpr, y = (e.clientY - r.top) * dpr; let i;
          if (geo.pie) { const a = (Math.atan2(y - geo.pie.cy, x - geo.pie.cx) + Math.PI * 2.5) % (Math.PI * 2), dist = Math.hypot(x - geo.pie.cx, y - geo.pie.cy); let acc = 0; i = dist > geo.pie.R ? -1 : geo.pie.d.findIndex(v => (acc += (v / geo.pie.sum) * Math.PI * 2) >= a); }
          else i = ctx.st.type === 'bar' || ctx.st.type === 'stack' ? Math.floor((x - geo.pad.l) / geo.bw) : Math.round(((x - geo.pad.l) / geo.pw) * (geo.n - 1));
          const s = ctx.st; if (i == null || i < 0 || i >= (geo.pie ? geo.pie.d.length : geo.n)) { tip.hidden = true; draw(); return; }
          draw(i); tip.hidden = false; tip.style.left = Math.min(r.width - 140, e.clientX - r.left + 12) + 'px'; tip.style.top = e.clientY - r.top + 10 + 'px';
          tip.innerHTML = `<b>${E(s.labels[i] ?? i + 1)}</b>${(geo.pie ? [s.series[0]] : s.series).map(x => `<span><i style="background:${geo.pie ? COLORS[i % COLORS.length] : x.color}"></i>${E(x.name || '')} ${E(fmtN(+(Array.isArray(x.data[i]) ? x.data[i][1] : x.data[i]) || 0))}${E(s.unit ? ' ' + s.unit : '')}</span>`).join('')}`; };
        cv.onpointerleave = () => { tip.hidden = true; draw(); };
        on(el, a => {
          if (a.startsWith('ty:')) ctx.set({ type: a.slice(3) });
          if (a === 'png') { const x = document.createElement('a'); x.href = cv.toDataURL('image/png'); x.download = (ctx.st.title || 'chart') + '.png'; x.click(); }
          if (a === 'csv') { const s = ctx.st, n = Math.max(s.labels.length, ...s.series.map(x => x.data.length)), q = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v; dl((s.title || 'chart') + '.csv', ['label,' + s.series.map(x => q(x.name)).join(','), ...[...Array(n)].map((_, i) => [q(s.labels[i] ?? i + 1), ...s.series.map(x => x.data[i] ?? '')].join(','))].join('\n'), 'text/csv'); }
        });
      },
    },
  });

  /* ---------- 2. 流程图 ---------- */
  const readFlow = d => { const nodes = arr(d.nodes).slice(0, 60).map((n, i) => ({ id: str(obj(n).id, 'n' + i, 20).replace(/[^\w-]/g, '_') || 'n' + i, text: str(obj(n).text ?? obj(n).label, '', 40), type: ['start', 'end', 'decision', 'step', 'io'].includes(obj(n).type) ? obj(n).type : 'step' })); const ids = new Set(nodes.map(n => n.id)); return { title: str(d.title, '', 60), nodes, edges: arr(d.edges).slice(0, 120).map(e => ({ from: str(obj(e).from, '', 20), to: str(obj(e).to, '', 20), label: str(obj(e).label, '', 20) })).filter(e => ids.has(e.from) && ids.has(e.to)) }; };
  M.register('Flowchart', {
    label: '流程图', icon: '⬡', wide: true, addable: true,
    kw: /流程|步骤|工作流|决策|判断|审批|flow ?chart|workflow|process|diagram/i,
    read: readFlow,
    proj: s => ({ nodes: s.nodes.length, edges: s.edges.length }),
    tool: {
      out: st => ({ kind: 'text', data: toMermaid(st.nodes, st.edges) }),
      init: d => ({ ...d, sel: null }), title: st => st.title,
      view(st) {
        const L = layoutFlow(st.nodes, st.edges), P = L.pos, w = L.NW, h = L.NH;
        const path = e => { const a = P[e.from], b = P[e.to]; if (!a || !b) return ''; const y1 = a.y + h / 2, y2 = b.y - h / 2 - 4, back = b.y <= a.y; const d = back ? `M${a.x + w / 2},${a.y} C${a.x + w / 2 + 50},${a.y} ${b.x + w / 2 + 50},${b.y} ${b.x + w / 2 + 4},${b.y}` : `M${a.x},${y1} C${a.x},${(y1 + y2) / 2} ${b.x},${(y1 + y2) / 2} ${b.x},${y2}`; return `<path d="${d}" marker-end="url(#fa)"/>${e.label ? `<text x="${(a.x + b.x) / 2 + 6}" y="${(y1 + y2) / 2}" class="fl-el">${E(e.label)}</text>` : ''}`; };
        const shape = n => { const p = P[n.id]; if (!p) return ''; const x = p.x - w / 2, y = p.y - h / 2, cls = `fl-n fl-${n.type}${st.sel === n.id ? ' on' : ''}`;
          const body = n.type === 'decision' ? `<polygon points="${p.x},${y} ${x + w},${p.y} ${p.x},${y + h} ${x},${p.y}"/>` : n.type === 'start' || n.type === 'end' ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}"/>` : n.type === 'io' ? `<polygon points="${x + 12},${y} ${x + w},${y} ${x + w - 12},${y + h} ${x},${y + h}"/>` : `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9"/>`;
          return `<g class="${cls}" data-n="${E(n.id)}">${body}<text x="${p.x}" y="${p.y + 4}">${E(n.text.length > 14 ? n.text.slice(0, 13) + '…' : n.text)}</text><title>${E(n.text)}</title></g>`; };
        return `<div class="t2-row"><span class="sp"></span>${btn('mmd', 'Mermaid', '', T('复制 Mermaid'))}${btn('svg', '⤓ SVG', '', T('导出 SVG'))}</div>
          <div class="fl-box"><svg class="fl-svg" viewBox="-10 0 ${Math.max(300, L.W + 20)} ${Math.max(120, L.H + 10)}" style="max-height:${Math.max(160, Math.min(720, L.H + 20))}px"><defs><marker id="fa" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker></defs><g class="fl-e">${st.edges.map(path).join('')}</g>${st.nodes.map(shape).join('')}</svg></div>`;
      },
      bind(el, st, ro, ctx) {
        el.querySelectorAll('[data-n]').forEach(g => (g.ondblclick = () => { if (ro) return; const n = ctx.st.nodes.find(x => x.id === g.dataset.n), t = prompt(T('改文字'), n.text); if (t != null) ctx.set({ nodes: ctx.st.nodes.map(x => (x === n ? { ...x, text: t.slice(0, 40) } : x)) }); }));
        on(el, async a => { if (a === 'mmd') { try { await navigator.clipboard.writeText(toMermaid(ctx.st.nodes, ctx.st.edges)); ctx.toast(T('已复制')); } catch {} } if (a === 'svg') dl((ctx.st.title || 'flow') + '.svg', el.querySelector('.fl-svg').outerHTML.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg" style="background:#111;font:12px sans-serif"'), 'image/svg+xml'); });
      },
    },
  });

  /* ---------- 3. 甘特图 ---------- */
  const readGantt = d => ({ title: str(d.title, '', 60), tasks: arr(d.tasks).slice(0, 60).map((t, i) => { const o = obj(t), s = day(o.start), e = day(o.end) ?? (s != null && +o.days ? s + Math.max(1, +o.days) - 1 : null); return { id: 't' + i, name: str(o.name ?? o.title, '', 40), owner: str(o.owner, '', 20), start: s, end: e != null && s != null ? Math.max(s, e) : e, progress: clamp(Math.round(+o.progress || 0), 0, 100), group: str(o.group, '', 20) }; }).filter(t => t.start != null && t.end != null) });
  M.register('Gantt', {
    label: '甘特图', icon: '☷', wide: true, addable: true,
    kw: /甘特|排期|进度|里程碑|计划表|时间线|工期|gantt|timeline|schedule|milestone|roadmap/i,
    read: readGantt,
    proj: s => ({ tasks: s.tasks.map(t => ({ name: t.name, start: iso(t.start), end: iso(t.end), progress: t.progress })) }),
    tool: {
      out: st => ({ kind: 'text', data: st.tasks.map(t => `${t.name}\t${iso(t.start)} → ${iso(t.end)}\t${t.progress}%${t.owner ? '\t@' + t.owner : ''}`).join('\n') }),
      init: d => d, title: st => st.title,
      view(st) {
        if (!st.tasks.length) return `<p class="mxui-muted">—</p>`;
        const a = Math.min(...st.tasks.map(t => t.start)), b = Math.max(...st.tasks.map(t => t.end)), n = b - a + 1, today = Math.floor(Date.now() / 864e5), pct = d => ((d - a) / n) * 100;
        const heads = []; for (let d = a; d <= b; d += Math.max(1, Math.ceil(n / 10))) heads.push(`<span style="left:${pct(d)}%">${iso(d).slice(5)}</span>`);
        return `<div class="gt"><div class="gt-hd"><div></div><div class="gt-scale">${heads.join('')}</div></div>${st.tasks.map((t, i) => `<div class="gt-row"><div class="gt-nm" title="${E(t.name)}">${E(t.name)}${t.owner ? `<small>${E(t.owner)}</small>` : ''}</div><div class="gt-lane">${today >= a && today <= b ? `<i class="gt-today" style="left:${pct(today)}%"></i>` : ''}<div class="gt-bar" data-i="${i}" style="left:${pct(t.start)}%;width:${Math.max(1.2, ((t.end - t.start + 1) / n) * 100)}%;--c:${COLORS[i % COLORS.length]}" title="${E(iso(t.start) + ' → ' + iso(t.end))}"><b style="width:${t.progress}%"></b><span>${t.end - t.start + 1}d</span></div></div></div>`).join('')}</div>
          <div class="t2-row"><span class="mxui-muted">${iso(a)} → ${iso(b)} · ${n}d</span><span class="sp"></span>${btn('md', 'Markdown')}</div>`;
      },
      bind(el, st, ro, ctx) {
        el.querySelectorAll('.gt-bar').forEach(b => { if (ro) return; let sx = 0, d0 = 0, moved = false; const lane = b.parentElement;
          b.onpointerdown = e => { sx = e.clientX; d0 = 0; moved = false; b.setPointerCapture(e.pointerId); };
          b.onpointermove = e => { if (!b.hasPointerCapture(e.pointerId)) return; const tk = ctx.st.tasks, a = Math.min(...tk.map(t => t.start)), n = Math.max(...tk.map(t => t.end)) - a + 1; d0 = Math.round(((e.clientX - sx) / lane.clientWidth) * n); if (d0) moved = true; b.style.transform = `translateX(${(d0 / n) * lane.clientWidth}px)`; };
          b.onpointerup = () => { if (moved && d0) ctx.set({ tasks: ctx.st.tasks.map((t, i) => (i === +b.dataset.i ? { ...t, start: t.start + d0, end: t.end + d0 } : t)) }); else b.style.transform = ''; }; // 拖动整条挪日期
        });
        on(el, async a => { if (a === 'md') { try { await navigator.clipboard.writeText('| 任务 | 开始 | 结束 | 进度 |\n|---|---|---|---|\n' + ctx.st.tasks.map(t => `| ${t.name} | ${iso(t.start)} | ${iso(t.end)} | ${t.progress}% |`).join('\n')); ctx.toast(T('已复制')); } catch {} } });
      },
    },
  });

  /* ---------- 4. 正则 ---------- */
  M.register('RegexLab', {
    label: '正则', icon: '.*', addable: true,
    kw: /正则|regex|regexp|匹配|提取.{0,6}(邮箱|手机|号码|网址)|pattern/i,
    read: d => ({ pattern: str(d.pattern, '', 500), flags: str(d.flags, 'g', 6).replace(/[^gimsuy]/g, ''), text: str(d.text ?? d.sample, '', 20000), replace: str(d.replace, '', 300) }),
    proj: s => ({ pattern: s.pattern, flags: s.flags, hits: regexRun(s.pattern, s.flags, s.text).hits.length }),
    tool: {
      out: st => ({ kind: 'text', data: regexRun(st.pattern, st.flags, st.text).hits.map(h => h.s).join('\n') }),
      accept: (st, p) => (p.kind === 'text' ? { text: String(p.data).slice(0, 20000) } : null),
      init: d => d,
      view(st) {
        const r = regexRun(st.pattern, st.flags, st.text); let h = '', at = 0;
        for (const m of r.hits.slice(0, 500)) { if (m.i < at) continue; h += E(st.text.slice(at, m.i)) + `<mark>${E(m.s) || '·'}</mark>`; at = m.i + m.s.length; } h += E(st.text.slice(at, 20000));
        let rep = ''; if (st.replace && !r.err) try { rep = st.text.slice(0, 20000).replace(new RegExp(st.pattern, [...new Set(st.flags + 'g')].join('')), st.replace); } catch {}
        const groups = r.hits.some(m => m.g.length) ? `<table class="mxui-tbl rx-g"><tr><th>#</th>${r.hits[0].g.map((_, k) => `<th>$${k + 1}</th>`).join('')}</tr>${r.hits.slice(0, 30).map((m, i) => `<tr><td>${i + 1}</td>${m.g.map(g => `<td>${E(g ?? '')}</td>`).join('')}</tr>`).join('')}</table>` : '';
        return `<div class="rx-top"><span class="rx-sl">/</span><input class="mono grow${r.err ? ' bad' : ''}" data-f="pattern" value="${E(st.pattern)}" spellcheck="false"><span class="rx-sl">/</span><input class="mono rx-fl" data-f="flags" value="${E(st.flags)}" spellcheck="false"><b class="rx-n${r.hits.length ? ' ok' : ''}">${r.err ? '!' : r.hits.length}</b></div>
          ${r.err ? `<p class="mxui-err">${E(r.err)}</p>` : ''}<div class="rx-txt" contenteditable="plaintext-only" spellcheck="false" data-f="text">${h}</div>
          <div class="rx-top"><span class="rx-sl">→</span><input class="mono grow" data-f="replace" value="${E(st.replace)}" placeholder="$1" spellcheck="false"></div>${rep ? `<pre class="rx-out">${E(rep.slice(0, 4000))}</pre>` : ''}${groups}`;
      },
      bind(el, st, ro, ctx) {
        el.querySelectorAll('input[data-f]').forEach(i => (i.oninput = () => { clearTimeout(i._t); i._t = setTimeout(() => { const p = el.querySelector(`[data-f="${i.dataset.f}"]`); const pos = i.selectionStart; ctx.set({ [i.dataset.f]: i.value }); const n = el.querySelector(`input[data-f="${i.dataset.f}"]`); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 250); }));
        const tx = el.querySelector('.rx-txt'); if (tx) tx.onblur = () => { if (tx.innerText !== ctx.st.text) ctx.set({ text: tx.innerText.slice(0, 20000) }); };
      },
    },
  });

  /* ---------- 5. 记忆卡 ---------- */
  M.register('Flashcards', {
    label: '记忆卡', icon: '⧉', addable: true,
    kw: /记忆卡|单词|背诵|闪卡|抽认卡|复习|flash ?cards?|vocab|anki|quiz me|memori[sz]e/i,
    read: d => ({ deck: str(d.deck ?? d.title, '', 60), cards: arr(d.cards).slice(0, 300).map(c => ({ q: str(obj(c).q ?? obj(c).front, '', 300), a: str(obj(c).a ?? obj(c).back, '', 600) })).filter(c => c.q) }),
    proj: s => ({ deck: s.deck, cards: s.cards.length, known: (s.observed.known || []).length }),
    tool: {
      init: d => ({ ...d, i: 0, flip: false }), title: st => st.deck,
      view(st) {
        const o = st.observed || {}, known = new Set(o.known || []), left = st.cards.map((_, i) => i).filter(i => !known.has(i)), cur = st.cards[st.i] || st.cards[0];
        if (!st.cards.length) return '<p class="mxui-muted">—</p>';
        return `<div class="fc-prog"><i style="width:${(known.size / st.cards.length) * 100}%"></i></div><div class="t2-foot">${known.size} / ${st.cards.length}</div>
          <button type="button" class="fc-card${st.flip ? ' flip' : ''}" data-x="flip"><span class="fc-f">${E(cur.q)}</span><span class="fc-b">${E(cur.a)}</span></button>
          <div class="fc-act">${btn('no', '✗', 'fc-no', T('还不会'))}${btn('yes', '✓', 'fc-yes', T('记住了'))}<span class="sp"></span>${left.length === 0 ? btn('reset', '↺', '', T('重来')) : ''}${btn('csv', 'CSV', '', 'Anki')}</div>`;
      },
      bind(el, st, ro, ctx) {
        const next = known => { const n = ctx.st.cards.length, left = [...Array(n).keys()].filter(i => !known.has(i)); if (!left.length) return ctx.set({ flip: false }); const after = left.find(i => i > ctx.st.i); ctx.set({ i: after ?? left[0], flip: false }); };
        on(el, a => {
          const known = new Set(ctx.st.observed.known || []);
          if (a === 'flip') ctx.set({ flip: !ctx.st.flip });
          if (a === 'yes') { known.add(ctx.st.i); ctx.obs({ known: [...known] }, false); next(known); }
          if (a === 'no') { known.delete(ctx.st.i); ctx.obs({ known: [...known] }, false); next(known); }
          if (a === 'reset') { ctx.obs({ known: [] }, false); ctx.set({ i: 0, flip: false }); }
          if (a === 'csv') dl((ctx.st.deck || 'cards') + '.csv', 'front,back\n' + ctx.st.cards.map(c => [c.q, c.a].map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
        });
        el.onkeydown = e => { if (e.key === ' ') { e.preventDefault(); ctx.set({ flip: !ctx.st.flip }); } };
      },
    },
  });

  M.hintExtra?.({
    ChartCard: '{"title":"…","type":"bar|line|area|stack|pie|scatter","labels":["Q1","Q2"],"series":[{"name":"…","data":[12,30]}],"unit":"…"} — real numbers only',
    Flowchart: '{"title":"…","nodes":[{"id":"a","text":"…","type":"start|step|decision|io|end"}],"edges":[{"from":"a","to":"b","label":"yes"}]}',
    Gantt: '{"title":"…","tasks":[{"name":"…","start":"2026-11-20","end":"2026-11-25","owner":"…","progress":0}]}',
    RegexLab: '{"pattern":"…","flags":"gi","text":"sample text","replace":"$1"}',
    Flashcards: '{"deck":"…","cards":[{"q":"…","a":"…"}]} — 10-40 cards',
  });
  M.hintKw?.({ ChartCard: /图表|柱状|折线|饼图|趋势|占比|统计|可视化|chart|pie|trend|visuali[sz]/i, Flowchart: /流程|工作流|审批|决策树|flow ?chart|workflow|process/i, Gantt: /甘特|排期|里程碑|计划表|工期|gantt|timeline|roadmap|milestone/i, RegexLab: /正则|regex|regexp/i, Flashcards: /记忆卡|单词|背诵|闪卡|复习|flash ?cards?|vocab|anki|quiz me|memori[sz]e/i });
  M.addWant?.(/图表|柱状|折线|饼图|趋势|占比|流程图|工作流|审批流程|甘特|排期|里程碑|正则|regex|记忆卡|背单词|闪卡|chart|flow ?chart|workflow|gantt|roadmap|flash ?cards?|vocab|anki/i);
})();
