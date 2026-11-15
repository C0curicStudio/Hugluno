'use strict';
/* Hugluno 快照版 · 桌面外壳（Electron）。
   只做四件事：① 用 hug://app 打开本地的 app/ 页面；② 拦截一切不在白名单里的网络请求（policy.js）；
   ③ 用系统钥匙串保存密钥；④ Lunosland 悬浮岛。不自动更新、不上报、不连任何统计服务。 */
const { app, BrowserWindow, Menu, protocol, session, ipcMain, dialog, shell, safeStorage, screen, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const policy = require('./policy');

const APP_DIR = path.resolve(__dirname, '..', 'app');
const MAC = process.platform === 'darwin';
const T = {
  zh: { netTitle: '要向这个地址发送请求吗？', netSub: '这是「接口调试」卡的发送按钮触发的，请求会离开你的电脑。', send: '发送', cancel: '取消', openTitle: '用系统浏览器打开这个链接？', open: '打开', cancelled: '已取消', noKeychain: '系统钥匙串不可用，密钥这次只保存在内存里。' },
  en: { netTitle: 'Send a request to this address?', netSub: 'Triggered by the API debugger’s Send button — the request will leave your computer.', send: 'Send', cancel: 'Cancel', openTitle: 'Open this link in your browser?', open: 'Open', cancelled: 'Cancelled', noKeychain: 'The OS keychain is unavailable; the key is kept in memory for this session only.' },
  fr: { netTitle: 'Envoyer une requête à cette adresse ?', netSub: 'Déclenchée par le bouton Envoyer du débogueur d’API — la requête quittera votre ordinateur.', send: 'Envoyer', cancel: 'Annuler', openTitle: 'Ouvrir ce lien dans le navigateur ?', open: 'Ouvrir', cancelled: 'Annulé', noKeychain: 'Le trousseau du système est indisponible ; la clé reste en mémoire pour cette session.' },
};
const tx = () => { const l = (app.getLocale() || 'en').toLowerCase(); return l.startsWith('zh') ? T.zh : l.startsWith('fr') ? T.fr : T.en; };

protocol.registerSchemesAsPrivileged([{ scheme: 'hug', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
if (!app.requestSingleInstanceLock()) app.quit();

const net = { providers: new Set(), once: new Map(), log: [] };
const note = (host, allowed) => { net.log.push({ t: Date.now(), host, allowed }); if (net.log.length > 300) net.log.shift(); };
let win = null, island = null, quitting = false;
const islandState = { pending: false, edge: false };
let islandOn = true;

const SECRET = () => path.join(app.getPath('userData'), 'key.bin');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };

function lockDownSession(ses) {
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(false)); // 摄像头 / 麦克风 / 定位 / 通知…一律不给
  ses.setPermissionCheckHandler(() => false);
  try { ses.setSpellCheckerEnabled(false); } catch {} // 拼写词典要联网下载：关掉
  ses.webRequest.onBeforeRequest((d, cb) => { // 所有请求的总闸
    const r = policy.decide(d.url, net);
    if (!r.local) note(r.host, r.allow);
    cb({ cancel: !r.allow });
  });
  // 只对「你填的模型接口」补上跨域头（让不支持浏览器直连的接口也能用）；别的地址不动
  ses.webRequest.onHeadersReceived((d, cb) => {
    let origin = ''; try { origin = new URL(d.url).origin; } catch {}
    if (!net.providers.has(origin)) return cb({});
    const h = { ...d.responseHeaders }; for (const k of Object.keys(h)) if (/^access-control-/i.test(k)) delete h[k];
    h['Access-Control-Allow-Origin'] = ['hug://app']; h['Access-Control-Allow-Headers'] = ['authorization, content-type']; h['Access-Control-Allow-Methods'] = ['GET, POST, OPTIONS'];
    cb({ responseHeaders: h, ...(d.method === 'OPTIONS' ? { statusLine: 'HTTP/1.1 204 No Content' } : {}) });
  });
  ses.protocol.handle('hug', async req => {
    const u = new URL(req.url); if (u.hostname !== 'app') return new Response('Not found', { status: 404 });
    const f = policy.resolveAppFile(APP_DIR, u.pathname); if (!f) return new Response('Forbidden', { status: 403 });
    try {
      const body = await fs.promises.readFile(f);
      return new Response(body, { headers: { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store', ...(f.endsWith('.woff2') ? { 'access-control-allow-origin': '*' } : {}) } });
    } catch { return new Response('Not found', { status: 404 }); }
  });
}

function openExternal(url) {
  const r = policy.externalLink(url); if (!r.ok) return;
  if (r.trusted) return shell.openExternal(r.url);
  const t = tx(); // 不在白名单里的网站：先问
  dialog.showMessageBox(win, { type: 'question', buttons: [t.open, t.cancel], defaultId: 1, cancelId: 1, title: 'Hugluno', message: t.openTitle, detail: r.url }).then(x => { if (x.response === 0) shell.openExternal(r.url); });
}

function createWindow() {
  win = new BrowserWindow({ width: 1280, height: 820, minWidth: 900, minHeight: 600, show: false, title: 'Hugluno Snapshot',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#141210' : '#f4efe3', icon: path.join(__dirname, 'icon.png'),
    ...(MAC ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 18 } } : {}),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, spellcheck: false, allowRunningInsecureContent: false } });
  win.once('ready-to-show', () => { win.show(); if (islandOn) createIsland(); });
  win.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('hug://app/')) { e.preventDefault(); openExternal(url); } });
  win.on('close', e => { if (!quitting && MAC) { e.preventDefault(); win.hide(); } });
  win.on('closed', () => { win = null; island?.close(); });
  win.loadURL('hug://app/index.html');
}

/* ---------- IPC：只认主窗口的主页面（不认里面的 iframe，比如学习窗口） ---------- */
const fromMain = e => win && e.senderFrame === win.webContents.mainFrame && e.senderFrame.url.startsWith('hug://app/');
const guard = fn => (e, ...a) => (fromMain(e) ? fn(e, ...a) : (() => { throw new Error('forbidden'); })());
ipcMain.handle('secret:get', guard(() => {
  try { if (!safeStorage.isEncryptionAvailable() || !fs.existsSync(SECRET())) return ''; return safeStorage.decryptString(fs.readFileSync(SECRET())); } catch { return ''; }
}));
ipcMain.handle('secret:set', guard((e, key) => {
  if (!key) { fs.rmSync(SECRET(), { force: true }); return true; }
  if (!safeStorage.isEncryptionAvailable()) { win.webContents.executeJavaScript(`window.toast&&toast(${JSON.stringify(tx().noKeychain)})`).catch(() => {}); return false; }
  fs.writeFileSync(SECRET(), safeStorage.encryptString(String(key).slice(0, 4096)), { mode: 0o600 }); return true;
}));
ipcMain.handle('secret:clear', guard(() => { fs.rmSync(SECRET(), { force: true }); return true; }));
ipcMain.handle('net:provider', guard((e, base) => { const r = policy.validateProvider(base); if (!r.ok) throw new Error(r.reason); net.providers = new Set([r.origin]); return true; })); // 只放行这一个地址
ipcMain.handle('net:confirm', guard(async (e, raw) => {
  let u; try { u = new URL(raw); } catch { return false; } if (!/^https?:$/.test(u.protocol)) return false;
  const t = tx(), r = await dialog.showMessageBox(win, { type: 'question', buttons: [t.send, t.cancel], defaultId: 1, cancelId: 1, title: 'Hugluno', message: t.netTitle, detail: u.href + '\n\n' + t.netSub });
  if (r.response !== 0) return false; net.once.set(u.origin, Date.now() + 60_000); return true; // 只放行这个来源 60 秒
}));
ipcMain.handle('net:log', guard(() => net.log.slice(-100)));
ipcMain.handle('data:wipe', guard(async () => { fs.rmSync(SECRET(), { force: true }); await session.defaultSession.clearStorageData(); net.log.length = 0; return true; }));

/* ---------- Lunosland：独立透明悬浮窗 ---------- */
const ISLAND_W = 360, ISLAND_H = 56;
function islandPos() { const wa = screen.getPrimaryDisplay().workArea; return islandState.edge ? { x: wa.x + wa.width - ISLAND_W - 8, y: wa.y + 4 } : { x: Math.round(wa.x + (wa.width - ISLAND_W) / 2), y: wa.y + 4 }; }
function islandPush(p) { Object.assign(islandState, p || {}); if (!island || island.isDestroyed()) return; island.setBounds({ ...islandPos(), width: ISLAND_W, height: ISLAND_H }); island.webContents.send('island:state', islandState); }
function createIsland() {
  if (island && !island.isDestroyed()) return;
  island = new BrowserWindow({ ...islandPos(), width: ISLAND_W, height: ISLAND_H, frame: false, transparent: true, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, hasShadow: false, focusable: false, alwaysOnTop: true, show: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'island-preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false } });
  island.setAlwaysOnTop(true, 'screen-saver'); if (MAC) island.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  island.setIgnoreMouseEvents(true, { forward: true });
  island.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); island.webContents.on('will-navigate', e => e.preventDefault());
  island.loadFile(path.join(__dirname, 'island.html'));
  island.once('ready-to-show', () => { island.showInactive(); islandPush(); });
  island.on('closed', () => { island = null; });
}
const fromIsland = e => island && !island.isDestroyed() && e.sender === island.webContents;
ipcMain.on('island:hover', (e, on) => { if (fromIsland(e)) island.setIgnoreMouseEvents(!on, { forward: true }); });
ipcMain.on('island:expand', (e, on) => { if (!fromIsland(e)) return; island.setFocusable(!!on); if (on) island.focus(); else island.blur(); });
ipcMain.on('island:submit', (e, text) => {
  if (!fromIsland(e) || !win || win.isDestroyed()) return;
  islandPush({ pending: true }); win.webContents.send('island:submit', String(text).slice(0, 8000)); if (!win.isVisible()) win.showInactive();
});
ipcMain.on('island:enable', (e, on) => { if (!fromMain(e)) return; islandOn = !!on; if (islandOn) createIsland(); else island?.close(); });
ipcMain.on('island:state', (e, p) => { if (!fromMain(e)) return; const o = {}; if ('pending' in p) o.pending = !!p.pending; if ('edge' in p) o.edge = !!p.edge; islandPush(o); });

function buildMenu() {
    const link = (label, url) => ({ label, click: () => openExternal(url) });
  const zh = (app.getLocale() || '').toLowerCase().startsWith('zh'), fr = (app.getLocale() || '').toLowerCase().startsWith('fr');
  const pick = (a, b, c) => (zh ? a : fr ? c : b);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(MAC ? [{ role: 'appMenu' }] : []), { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
    { label: pick('帮助', 'Help', 'Aide'), submenu: [
      link(pick('帮助中心：快照版', 'Help center: Snapshot', 'Centre d’aide : Snapshot'), 'https://support.c0curic.top/max/snapshot'),
      link(pick('安装安全提示', 'Install security prompts', 'Alertes de sécurité à l’installation'), 'https://support.c0curic.top/max/settings/install-safety'),
      link(pick('GitHub 源码（可审查）', 'Source on GitHub (auditable)', 'Code source GitHub (auditable)'), 'https://github.com/C0curicStudio/Hugluno'),
      link(pick('在线完整版', 'Online full version', 'Version complète en ligne'), 'https://hugluno.c0curic.top'),
    ] },
  ]));
}

app.whenReady().then(() => {
  app.setAppUserModelId('top.c0curic.hugluno.snapshot');
  lockDownSession(session.defaultSession);
  buildMenu(); createWindow();
  app.on('activate', () => { if (!win) createWindow(); else win.show(); });
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { if (!MAC) app.quit(); });
