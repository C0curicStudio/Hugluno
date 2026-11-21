'use strict';
/* Hugluno 快照版 · 主程序：对话、设置、侧栏。网络请求一律经 net.js；对话只存在本机（store.js）。 */
(() => {
  if (window.HUG_GATED) return;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const S = () => HugStore.Settings.get();
  const { Convs, HugKey } = HugStore, esc = HugRender.esc;
  let convs = [], cur = null, busy = false, ac = null, liveEl = null, raf = 0;

  /* ---------- 小工具 ---------- */
  window.toast = m => { const e = document.createElement('div'); e.className = 'toast'; e.textContent = m; document.body.append(e); setTimeout(() => e.remove(), 2600); };
  const applyTheme = () => { const t = S().theme; if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; };
  const connected = () => { const s = S(); if (!s.base || !s.model) return false; try { return !!HugKey.value || HugNet.isLocalHost(new URL(s.base).host); } catch { return false; } };
  const askPass = title => new Promise(res => {
    const d = $('#passDlg'), inp = $('#passIn'); $('#passTitle').textContent = title; inp.value = '';
    const done = v => { d.close(); res(v); };
    $('#passForm').onsubmit = e => { e.preventDefault(); done(inp.value || null); }; $('#passNo').onclick = () => done(null);
    d.oncancel = () => res(null); d.showModal(); inp.focus();
  });
  window.hugAskNet = u => new Promise(res => { // 网页版的联网确认（桌面版由主进程弹系统对话框）
    $('#netAskUrl').textContent = u.href; const d = $('#netAsk'); let yes = false;
    $('#netYes').onclick = () => { yes = true; d.close(); }; $('#netNo').onclick = () => d.close(); d.onclose = () => res(yes); d.showModal();
  });

  /* ---------- 侧栏 / 对话列表 ---------- */
  const titleOf = c => c.title || L('newChat');
  function renderSide() {
    const box = $('#convList'); box.innerHTML = '';
    for (const c of convs) {
      const d = document.createElement('div'); d.className = 'conv' + (cur && c.id === cur.id ? ' on' : ''); d.dataset.id = c.id;
      d.innerHTML = `<span>${esc(titleOf(c))}</span><i title="${esc(L('delChat'))}" data-del>✕</i>`; box.append(d);
    }
    $('#chatTitle').textContent = cur ? titleOf(cur) : '';
  }
  function newConv() { if (busy) return; cur = { id: uid(), title: '', msgs: [], created: Date.now(), updated: Date.now() }; renderSide(); renderAll(); $('#input').focus(); }
  function openConv(id) { if (busy) return; const c = convs.find(x => x.id === id); if (!c) return; cur = c; renderSide(); renderAll(); }
  async function delConv(id) {
    if (busy || !confirm(L('delAsk'))) return;
    await Convs.del(id); convs = convs.filter(c => c.id !== id);
    if (cur && cur.id === id) { cur = convs[0] || null; if (!cur) return newConv(); }
    renderSide(); renderAll();
  }
  const save = async () => { if (!cur || !cur.msgs.length) return; await Convs.put(cur); if (!convs.includes(cur)) convs.unshift(cur); convs.sort((a, b) => b.updated - a.updated); renderSide(); };

  /* ---------- 消息 ---------- */
  function decorate(root) { // 代码块：高亮 + 复制按钮
    root.querySelectorAll('pre > code').forEach(c => {
      if (c.dataset.hl) return; c.dataset.hl = 1;
      try { window.hljs?.highlightElement(c); } catch {}
      const b = document.createElement('button'); b.className = 'cp'; b.textContent = L('copy'); b.dataset.cp = 1; c.parentElement.append(b);
    });
  }
  function bodyHtml(m, live) {
    const th = m.think ? `<details class="think"${live && !m.content ? ' open' : ''}><summary>${esc(L('thinking'))}</summary><div>${esc(m.think)}</div></details>` : '';
    const err = m.err ? `<div class="err">${esc(m.err)}</div>` : '';
    return th + `<div class="md${live && !m.content && !m.think ? ' typing' : ''}">${HugRender.md(m.content || '', live)}</div>` + err;
  }
  function msgEl(m, i) {
    const d = document.createElement('div'); d.className = 'msg ' + (m.role === 'user' ? 'u' : 'a'); d.dataset.i = i;
    if (m.role === 'user') d.innerHTML = `<div class="bub">${esc(m.content)}</div>`;
    else { d.innerHTML = `<div class="body">${bodyHtml(m, false)}</div><div class="acts"><button data-act="copy">${esc(L('copy'))}</button></div>`; decorate(d); }
    return d;
  }
  function renderAll() {
    const has = cur && cur.msgs.length;
    $('#msgs').innerHTML = ''; $('#empty').hidden = !!has; $('#msgs').hidden = !has;
    if (!has) paintEmpty(); else { cur.msgs.forEach((m, i) => $('#msgs').append(msgEl(m, i))); markRegen(); scrollEnd(true); }
    $('#chatTitle').textContent = cur ? titleOf(cur) : '';
  }
  function markRegen() { // 只有最后一条回答有「重新生成」
    $$('.acts [data-act=regen]').forEach(b => b.remove());
    const last = $('#msgs').lastElementChild; if (last?.classList.contains('a') && !busy) last.querySelector('.acts').insertAdjacentHTML('beforeend', `<button data-act="regen">${esc(L('regen'))}</button>`);
  }
  const scrollEnd = force => { const l = $('#log'); if (force || l.scrollHeight - l.scrollTop - l.clientHeight < 160) l.scrollTop = l.scrollHeight; };
  function paintEmpty() {
    const ok = connected();
    $('#empty').innerHTML = `<h1>${esc(L('hello'))}</h1><p>${esc(L('helloSub'))}</p>` +
      (ok ? '' : `<div id="connectCard"><b>${esc(L('connectFirst'))}</b><span>${esc(L('connectSub'))}</span><br><button class="btn pri" id="btnConnect">${esc(L('openSettings'))}</button></div>`) +
      `<div class="try">${['try1', 'try2', 'try3', 'try4'].map(k => `<button data-try="${k}">${esc(L(k))}</button>`).join('')}</div>`;
  }

  /* ---------- 发送 / 流式 ---------- */
  const lastUserText = () => [...cur.msgs].reverse().find(m => m.role === 'user')?.content || '';
  function systemPrompt() {
    const lang = { zh: '简体中文', en: 'English', fr: 'français' }[HUG_LANG];
    let s = `You are Hugluno, a careful and concise assistant running in a fully local, open-source app. Reply in the user's language (default: ${lang}).`;
    if (S().system.trim()) s += '\n\n' + S().system.trim();
    const recent = cur.msgs.slice(-6).filter(m => m.role === 'assistant').map(m => m.content || '').join('\n'), last = lastUserText();
    if (MXUI.wants(last, /```mxui|"ui_schema"/.test(recent))) s += '\n\n' + MXUI.HINT;
    if (MXUI.wantsLab(last, /```mxlab/.test(recent))) s += '\n\n' + MXUI.LAB_HINT;
    return s;
  }
  function paintLive() {
    raf = 0; if (!liveEl) return; const m = cur.msgs[cur.msgs.length - 1];
    liveEl.querySelector('.body').innerHTML = bodyHtml(m, true); scrollEnd();
  }
  const tick = () => { if (!raf) raf = setTimeout(paintLive, 50); };
  async function run() { // 对 cur 里最后一条用户消息生成回答
    busy = true; paintBtn(); ac = new AbortController();
    const am = { role: 'assistant', content: '', think: '' }; cur.msgs.push(am);
    $('#empty').hidden = true; $('#msgs').hidden = false;
    liveEl = msgEl(am, cur.msgs.length - 1); liveEl.querySelector('.acts').remove(); $('#msgs').append(liveEl); paintLive(); scrollEnd(true);
    const api = [{ role: 'system', content: systemPrompt() }, ...cur.msgs.slice(0, -1).filter(m => m.content).map(m => ({ role: m.role, content: m.content }))];
    try {
      if (window.HugAgent?.on()) await HugAgent.run(api.slice(1), am, { signal: ac.signal, tick }); // 本地 Agent（桌面版，agent.js）：同一个对话，步骤写进回答
      else await HugNet.chat(api, { signal: ac.signal, onText: t => { am.content += t; tick(); }, onThink: t => { am.think += t; tick(); } });
    } catch (e) {
      if (e.name === 'AbortError') am.err = ''; else am.err = L('errPrefix') + (e instanceof TypeError ? L('errCors') : e.message);
    }
    clearTimeout(raf); raf = 0; busy = false; ac = null; liveEl = null;
    const failed = am.err; if (!am.content && !am.think) cur.msgs.pop(); // 一个字都没有：不留空回答（错误只显示一次，不写进历史）
    renderAll(); await save(); paintBtn();
    if (failed && !am.content && !am.think) $('#msgs').insertAdjacentHTML('beforeend', `<div class="msg a"><div class="err">${esc(failed)}</div></div>`);
    scrollEnd(true);
  }
  async function send(text) {
    if (busy) return;
    text = (text ?? $('#input').value).trim(); if (!text) return;
    if (!connected()) { toast(L('noKey')); return openSettings(); }
    if (!cur) newConv();
    cur.msgs.push({ role: 'user', content: text }); if (!cur.title) cur.title = text.replace(/\s+/g, ' ').slice(0, 40);
    $('#input').value = ''; autoGrow(); renderSide(); $('#empty').hidden = true; $('#msgs').hidden = false;
    $('#msgs').append(msgEl(cur.msgs.at(-1), cur.msgs.length - 1)); await run();
  }
  async function regen() {
    if (busy || !cur) return; while (cur.msgs.length && cur.msgs.at(-1).role === 'assistant') cur.msgs.pop();
    if (!cur.msgs.length) return; renderAll(); await run();
  }
  function paintBtn() { const b = $('#btnSend'); b.textContent = busy ? '■' : '↑'; b.classList.toggle('stop', busy); b.title = busy ? L('stop') : L('send'); b.setAttribute('aria-label', b.title); }
  const autoGrow = () => { const t = $('#input'); t.style.height = 'auto'; t.style.height = Math.min(200, t.scrollHeight) + 'px'; };

  /* ---------- 工具卡 / 学习台 ---------- */
  const PENDULUM = `<div style="display:flex;gap:14px;align-items:center;padding:10px 14px;flex-wrap:wrap">
<label>L <input id="len" type="range" min="40" max="240" value="150"></label>
<label>θ₀ <input id="ang" type="range" min="5" max="85" value="40"></label>
<label>g <input id="grav" type="range" min="2" max="20" value="9.8" step="0.1"></label>
<button id="reset">↺</button><span id="info" style="opacity:.7"></span></div>
<canvas id="c" style="width:100%;height:calc(100vh - 58px);display:block"></canvas>
<script>
var c=document.getElementById('c'),x=c.getContext('2d'),th,w,t0=performance.now(),trail=[];
function g(i){return +document.getElementById(i).value}
function reset(){th=g('ang')*Math.PI/180;w=0;trail=[];hugluno.log('reset',g('len')+'/'+g('ang'))}
document.getElementById('reset').onclick=reset;['len','ang','grav'].forEach(function(i){document.getElementById(i).oninput=reset});
function fit(){c.width=c.clientWidth*devicePixelRatio;c.height=c.clientHeight*devicePixelRatio}
function step(dt){var L=g('len')/100,gg=g('grav');w+=-(gg/L)*Math.sin(th)*dt;th+=w*dt}
function draw(){fit();x.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);var W=c.clientWidth,H=c.clientHeight,px=W/2,py=H*0.18,R=g('len')*Math.min(1.7,H/360);
 var bx=px+R*Math.sin(th),by=py+R*Math.cos(th);trail.push([bx,by]);if(trail.length>160)trail.shift();
 x.strokeStyle='rgba(124,108,240,.35)';x.beginPath();trail.forEach(function(p,i){i?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1])});x.stroke();
 x.strokeStyle='#e6e6ec';x.lineWidth=2;x.beginPath();x.moveTo(px,py);x.lineTo(bx,by);x.stroke();
 x.fillStyle='#7c6cf0';x.beginPath();x.arc(bx,by,16,0,7);x.fill();
 var T=2*Math.PI*Math.sqrt(g('len')/100/g('grav'));document.getElementById('info').textContent='T≈'+T.toFixed(2)+' s'}
reset();var last=performance.now();(function loop(n){var dt=Math.min(.03,(n-last)/1000);last=n;for(var i=0;i<4;i++)step(dt/4);draw();requestAnimationFrame(loop)})(last);
<\/script>`;
  const openCard = t => MXUI.open1(t, {}, '');
  const openStudy = () => MXUI.open1('Lab', { title: L('labSample'), source: PENDULUM.replace(/<\\\//g, '</') }, L('labSample'));

  /* ---------- 设置 ---------- */
  function fillProviders() {
    $('#sProv').innerHTML = `<option value="">—</option>` + HUG.providers.map(p => `<option value="${p[0]}">${esc(p[1])}</option>`).join('');
    $('#sLang').innerHTML = Object.entries(HUG_LANGS).map(([k, v]) => `<option value="${k}"${k === HUG_LANG ? ' selected' : ''}>${v}</option>`).join('');
    $('#aboutLinks').innerHTML = [['linkRepo', HUG.links.repo], ['linkLicense', HUG.links.repo + '/blob/main/COPYRIGHT.md'], ['linkPrivacy', HUG.links.privacy], ['linkSafety', HUG.links.safetyHelp], ['linkDeploy', HUG.links.deployHelp], ['help', HUG.links.snapshotHelp]]
      .map(([k, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(L(k))} ↗</a>`).join('');
  }
  function paintNetLog() {
    const rows = HugNet.log.slice(-60).map(r => `${new Date(r.t).toLocaleTimeString()}  ${r.method.padEnd(4)} ${r.host}${r.path}  [${r.purpose}] ${r.ok ? '✓' : '✕'}`);
    const el = $('#netLog'); el.textContent = rows.length ? rows.join('\n') : L('sNetNone');
    if (window.HugDesk?.net?.log) window.HugDesk.net.log().then(a => { if (a?.length) el.textContent = (rows.length ? rows.join('\n') + '\n— main process —\n' : '') + a.slice(-60).map(r => `${new Date(r.t).toLocaleTimeString()}  ${r.allowed ? '✓' : '✕ blocked'}  ${r.host}`).join('\n'); }).catch(() => {});
  }
  function openSettings() {
    const s = S(), desk = !!window.HugDesk;
    $('#sBase').value = s.base; $('#sKey').value = HugKey.value; $('#sModel').value = s.model; $('#sSys').value = s.system; $('#sTemp').value = s.temp;
    $('#sTheme').value = s.theme; $('#sPass').checked = !!s.passMode; $('#rowPass').hidden = desk; $('#rowIsland').hidden = !window.HugDesk?.island; $('#islandHint').hidden = !window.HugDesk?.island;
    $('#sIsland').checked = s.island !== false; $('#sProv').value = (HUG.providers.find(p => p[2] === s.base) || [''])[0]; $('#testMsg').textContent = ''; paintNetLog();
    $('#settings').showModal();
  }
  async function saveSettings() {
    const prev = S(), base = $('#sBase').value.trim().replace(/\/+$/, ''), bad = HugNet.checkBase(base);
    if (base && bad) { $('#testMsg').className = 'okmsg bad'; $('#testMsg').textContent = bad === 'HTTP' ? 'https:// required (http:// only for localhost / LAN)' : 'Invalid URL'; return false; }
    const v = HugStore.Settings.set({ base, model: $('#sModel').value.trim(), system: $('#sSys').value, temp: $('#sTemp').value, theme: $('#sTheme').value, island: $('#sIsland').checked, passMode: $('#sPass').checked });
    const key = $('#sKey').value.trim();
    if (!window.HugDesk && v.passMode && key) { const p = await askPass(L('sPassSet')); if (!p) { HugStore.Settings.set({ passMode: false }); await HugKey.save(key); } else await HugKey.save(key, p); }
    else await HugKey.save(key);
    if (key === '' && prev.base) await HugKey.clear();
    if (window.HugDesk?.island) window.HugDesk.island.enable(v.island !== false);
    applyTheme(); paintChip(); if (cur && !cur.msgs.length) paintEmpty(); return true;
  }
  async function testConn() {
    const m = $('#testMsg'); m.className = 'okmsg'; m.textContent = '…';
    const base = $('#sBase').value.trim(), old = S(); HugStore.Settings.set({ base }); const oldKey = HugKey.value; HugKey.value = $('#sKey').value.trim();
    try { const ms = await HugNet.models(); $('#modelList').innerHTML = ms.map(x => `<option value="${esc(x)}">`).join(''); m.className = 'okmsg ok'; m.textContent = `${L('sOk')} — ${ms.length}${L('sModelsFound')}`; }
    catch (e) { m.className = 'okmsg bad'; m.textContent = L('sFail') + ': ' + (e instanceof TypeError ? L('errCors') : e.message); HugStore.Settings.set({ base: old.base }); HugKey.value = oldKey; }
    paintNetLog();
  }
  const paintChip = () => { const s = S(); $('#modelChip').textContent = s.model || '—'; $('#modelChip').hidden = !s.model; };

  /* ---------- 事件 ---------- */
  function bind() {
    $('#btnNew').onclick = newConv; $('#btnSettings').onclick = openSettings; $('#btnSetClose').onclick = () => $('#settings').close();
    $('#btnSetSave').onclick = async () => { if (await saveSettings()) $('#settings').close(); };
    $('#btnTest').onclick = testConn; $('#btnStudy').onclick = openStudy;
    $('#sProv').onchange = () => { const p = HUG.providers.find(x => x[0] === $('#sProv').value); if (p) $('#sBase').value = p[2]; };
    $('#sLang').onchange = () => hugSetLang($('#sLang').value);
    $('#sTheme').onchange = () => { HugStore.Settings.set({ theme: $('#sTheme').value }); applyTheme(); };
    $('#convList').onclick = e => { const d = e.target.closest('.conv'); if (!d) return; if (e.target.closest('[data-del]')) delConv(d.dataset.id); else openConv(d.dataset.id); };
    $('#btnSend').onclick = () => (busy ? ac?.abort() : send());
    const inp = $('#input'); inp.oninput = autoGrow; inp.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } };
    $('#btnTools').onclick = e => { e.stopPropagation(); $('#toolsMenu').hidden = !$('#toolsMenu').hidden; };
    $('#toolsMenu').onclick = e => { const b = e.target.closest('[data-open]'); if (b) { $('#toolsMenu').hidden = true; openCard(b.dataset.open); } };
    document.addEventListener('click', e => { if (!e.target.closest('.menu')) $('#toolsMenu').hidden = true; });
    $('#empty').onclick = e => { if (e.target.closest('#btnConnect')) return openSettings(); const t = e.target.closest('[data-try]'); if (t) { const txt = L(t.dataset.try); if (connected()) send(txt); else { $('#input').value = txt; toast(L('noKey')); openSettings(); } } };
    $('#msgs').onclick = e => {
      const cp = e.target.closest('[data-cp]'); if (cp) { navigator.clipboard?.writeText(cp.parentElement.querySelector('code').textContent); cp.textContent = L('copied'); setTimeout(() => (cp.textContent = L('copy')), 1200); return; }
      const a = e.target.closest('[data-act]')?.dataset.act; if (a === 'regen') regen();
      else if (a === 'copy') { const i = +e.target.closest('.msg').dataset.i; navigator.clipboard?.writeText(cur.msgs[i].content); toast(L('copied')); }
    };
    $('#btnExport').onclick = async () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([await HugStore.exportAll()], { type: 'application/json' })); a.download = 'hugluno-snapshot-chats.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
    $('#btnImport').onclick = () => $('#fileImport').click();
    $('#fileImport').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const n = await HugStore.importAll(await f.text()); convs = await Convs.list(); renderSide(); toast(String(n)); } catch { toast(L('sFail')); } e.target.value = ''; };
    $('#btnWipe').onclick = async () => { if (!confirm(L('sWipeAsk'))) return; await HugStore.wipeAll(); toast(L('sWiped')); setTimeout(() => location.reload(), 600); };
  }

  /* ---------- 启动 ---------- */
  async function init() {
    hugTranslate(); applyTheme(); fillProviders(); paintBtn(); bind();
    $('#lnkFull').href = HUG.links.full; $('#lnkHelp').href = HUG.links.snapshotHelp; $('#ver').textContent = `v${HUG.version} · PolyForm NC · ${window.HugDesk ? 'desktop' : 'web'}`;
    await HugKey.load();
    if (HugKey.locked()) { for (let i = 0; i < 5; i++) { const p = await askPass(L('sPassAsk')); if (p === null) break; if (await HugKey.unlock(p)) break; } }
    convs = await Convs.list(); cur = null; paintChip();
    if (convs.length) { cur = convs[0]; renderSide(); renderAll(); } else newConv();
    window.HugApp = { submit: t => send(t), busy: () => busy, appEl: $('#app') };
    window.dispatchEvent(new Event('hug-ready'));
  }
  init();
})();
