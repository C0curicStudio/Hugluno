'use strict';
/* 网络：这是整个网页里唯一允许调用 fetch 的文件（tools/audit.mjs 会检查）。
   只做三件事：① 向你填写的模型接口发对话请求 / 取模型列表；② 「接口调试」卡点发送时，先问你再请求；③ 记下每一次请求（只记地址，不记内容和密钥）。 */
(() => {
  const log = [];
  const rec = (purpose, url, method, ok) => {
    let host = '?', path = '';
    try { const u = new URL(url); host = u.host; path = u.pathname; } catch {}
    log.push({ t: Date.now(), purpose, method, host, path, ok }); if (log.length > 300) log.shift();
  };
  const isLocalHost = h => /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?$/i.test(h) || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h.replace(/:\d+$/, ''));
  const cleanBase = b => String(b || '').trim().replace(/\/+$/, '');
  const checkBase = b => {
    let u; try { u = new URL(cleanBase(b)); } catch { return 'URL'; }
    if (u.protocol === 'https:') return '';
    if (u.protocol === 'http:' && isLocalHost(u.host)) return ''; // 本机 / 局域网的模型（Ollama、LM Studio）允许明文 http
    return 'HTTP'; // 公网地址必须是 https：否则密钥会明文走在网络上
  };

  // 对话 / 模型列表：只发给设置里的接口地址
  async function api(path, init, purpose) {
    const S = HugStore.Settings.get(), base = cleanBase(S.base), bad = checkBase(base);
    if (bad) throw new Error(bad === 'HTTP' ? 'Base URL must be https:// (http:// is only allowed for localhost / LAN).' : 'Invalid base URL.');
    if (window.HugDesk?.net) await window.HugDesk.net.setProvider(base); // 桌面版：主进程只放行这个地址
    const headers = { 'Content-Type': 'application/json', ...(HugStore.HugKey.value ? { Authorization: 'Bearer ' + HugStore.HugKey.value } : {}) };
    const url = base + path; let ok = false;
    try { const r = await fetch(url, { ...init, headers, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' }); ok = r.ok; return r; }
    finally { rec(purpose, url, init?.method || 'GET', ok); }
  }
  async function models() {
    const r = await api('/models', { method: 'GET' }, 'models');
    if (!r.ok) throw new Error(L('errHttp') + r.status);
    const j = await r.json(); return (j.data || j.models || []).map(m => m.id || m.name).filter(Boolean).sort();
  }
  // 流式对话：onText(增量) / onThink(思考增量)；signal 用来停止
  async function chat(messages, { signal, onText, onThink } = {}) {
    const S = HugStore.Settings.get();
    const body = { model: S.model, messages, stream: true };
    if (S.temp !== '' && !isNaN(+S.temp)) body.temperature = +S.temp;
    let r = await api('/chat/completions', { method: 'POST', body: JSON.stringify(body), signal }, 'chat');
    if (r.status === 400 && 'temperature' in body) { delete body.temperature; r = await api('/chat/completions', { method: 'POST', body: JSON.stringify(body), signal }, 'chat'); } // 有的模型不收 temperature
    if (!r.ok) { let m = ''; try { m = (await r.text()).slice(0, 300); } catch {} const e = new Error(L('errHttp') + r.status + (m ? ' — ' + m : '')); e.status = r.status; throw e; }
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('text/event-stream') && ct.includes('json')) { const j = await r.json(); const m = j.choices?.[0]?.message || {}; if (m.reasoning_content) onThink?.(m.reasoning_content); if (m.content) onText?.(m.content); return; }
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { value, done } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        const d = line.slice(5).trim(); if (!d || d === '[DONE]') continue;
        try { const j = JSON.parse(d), dl = j.choices?.[0]?.delta || {}; const th = dl.reasoning_content ?? dl.reasoning; if (th) onThink?.(th); if (dl.content) onText?.(dl.content); } catch {}
      }
    }
  }

  // 「接口调试」卡：每次发送前问一次（桌面版由主进程弹系统对话框，网页版用页面里的对话框）
  async function allow(url) {
    let u; try { u = new URL(url); } catch { return false; }
    let yes;
    if (window.HugDesk?.net) yes = await window.HugDesk.net.confirm(u.href);
    else yes = await window.hugAskNet(u);
    rec('api-card', u.href, 'USER', !!yes); // 记录「你同意了」；真正的请求由卡片发出
    return !!yes;
  }
  window.HugNet = { api, models, chat, allow, log, checkBase, isLocalHost };
})();
