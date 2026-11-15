'use strict';
/* 本机存储：对话在 IndexedDB（只在这台电脑的浏览器 / 桌面版数据目录里），设置在 localStorage，密钥见下面的 HugKey。
   这个文件没有任何网络代码。 */
(() => {
  const DB = 'hugluno-snapshot', mem = new Map();
  let dbp = null;
  const open = () => (dbp ||= new Promise((res, rej) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('convs', { keyPath: 'id' });
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  }).catch(() => null));
  const tx = async (mode, fn) => {
    const db = await open(); if (!db) return fn(null);
    return new Promise((res, rej) => { const t = db.transaction('convs', mode), s = t.objectStore('convs'); let out; Promise.resolve(fn(s)).then(v => (out = v)); t.oncomplete = () => res(out); t.onerror = () => rej(t.error); });
  };
  const rq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const Convs = {
    async list() { const a = await tx('readonly', s => (s ? rq(s.getAll()) : [...mem.values()])); return (a || []).sort((x, y) => (y.updated || 0) - (x.updated || 0)); },
    async put(c) { c.updated = Date.now(); const copy = JSON.parse(JSON.stringify(c)); await tx('readwrite', s => (s ? rq(s.put(copy)) : mem.set(c.id, copy))); },
    async del(id) { await tx('readwrite', s => (s ? rq(s.delete(id)) : mem.delete(id))); },
    async clear() { await tx('readwrite', s => (s ? rq(s.clear()) : mem.clear())); },
  };
  const DEF = { base: '', model: '', system: '', temp: '', theme: 'auto', island: true, passMode: false };
  const Settings = {
    get() { try { return { ...DEF, ...JSON.parse(localStorage.getItem('hug.settings') || '{}') }; } catch { return { ...DEF }; } },
    set(p) { const v = { ...this.get(), ...p }; try { localStorage.setItem('hug.settings', JSON.stringify(v)); } catch {} return v; },
  };

  /* ---- 密钥：桌面版放系统钥匙串（Electron safeStorage，由主进程加解密）；网页版放 localStorage，可选用口令加密 ---- */
  const b64 = u => btoa(String.fromCharCode(...u)), unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const derive = async (pass, salt) => {
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  };
  const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }, del: k => { try { localStorage.removeItem(k); } catch {} } };
  const HugKey = {
    value: '',
    desktop: () => !!window.HugDesk?.secret,
    locked: () => !HugKey.desktop() && !!ls.get('hug.key.enc') && !HugKey.value,
    async load() {
      if (this.desktop()) { this.value = (await window.HugDesk.secret.get()) || ''; return this.value; }
      this.value = ls.get('hug.key') || ''; return this.value;
    },
    async unlock(pass) {
      const o = JSON.parse(ls.get('hug.key.enc') || 'null'); if (!o) return false;
      try { const k = await derive(pass, unb64(o.s)); this.value = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, k, unb64(o.ct))); return true; } catch { return false; }
    },
    async save(key, pass) {
      this.value = key;
      if (this.desktop()) { await window.HugDesk.secret.set(key); return; }
      if (pass) {
        const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), k = await derive(pass, salt);
        const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(key)));
        ls.set('hug.key.enc', JSON.stringify({ s: b64(salt), iv: b64(iv), ct: b64(ct) })); ls.del('hug.key');
      } else { ls.set('hug.key', key); ls.del('hug.key.enc'); }
    },
    async clear() { this.value = ''; ls.del('hug.key'); ls.del('hug.key.enc'); if (this.desktop()) await window.HugDesk.secret.clear(); },
  };
  const wipeAll = async () => {
    await Convs.clear(); await HugKey.clear();
    try { Object.keys(localStorage).filter(k => k.startsWith('hug.') || k.startsWith('mc_') || k.startsWith('mxui')).forEach(k => localStorage.removeItem(k)); } catch {}
    try { await new Promise(r => { const q = indexedDB.deleteDatabase(DB); q.onsuccess = q.onerror = q.onblocked = () => r(); }); } catch {}
    if (window.HugDesk?.wipe) await window.HugDesk.wipe();
  };
  const exportAll = async () => JSON.stringify({ app: 'hugluno-snapshot', v: 1, at: new Date().toISOString(), convs: await Convs.list() }, null, 1); // 不含密钥
  const importAll = async text => { const o = JSON.parse(text); if (o?.app !== 'hugluno-snapshot' || !Array.isArray(o.convs)) throw new Error('bad file'); for (const c of o.convs) if (c?.id && Array.isArray(c.msgs)) await Convs.put({ ...c, updated: c.updated || Date.now() }); return o.convs.length; };
  window.HugStore = { Convs, Settings, HugKey, wipeAll, exportAll, importAll };
})();
