'use strict';
/* 静默待机（默认关闭，设置里打开）：你在电脑上干活时，Hugluno 在后台留意有没有卡在报错上，有就轻轻提醒你。
   · 每 20 秒在本机读一次「最前面的窗口」的程序名和标题（Windows 用 PowerShell，Mac 用 osascript）——这一步完全在本机，不发给任何人；
   · 标题像报错（error / exception / failed / 崩溃 / 未响应 / 错误 / 失败…），或者同一个报错窗口一直挂着，才截一张屏交给「你填的那个模型」看一眼，
     让它判断是不是真有问题、怎么解决；同一个窗口 10 分钟内只问一次，整体每 2 分钟最多问一次；
   · 模型说有问题：Lunosland 亮黄灯 + 系统通知（只显示一句）；你点了才打开主窗口看完整的解决办法；
   · 截图只在打开了静默待机、且怀疑有报错时才发给你的模型；网络照旧只放行你填的那一个地址（policy.js）。
   纯函数（tests/standby.test.mjs 直接测）：looksLikeError / gate */
const { execFile } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const WIN = process.platform === 'win32', MAC = process.platform === 'darwin';
const TICK = 20000, PER_WINDOW = 10 * 60e3, MIN_GAP = 2 * 60e3;
const ERR = /[A-Za-z]+(Error|Exception)\b|\b(error|errors|exception|traceback|failed|failure|fatal|crash(ed)?|not responding|panic|segmentation fault|denied|cannot|can't|unable to)\b|错误|报错|失败|异常|无法|崩溃|未响应|出错|拒绝访问|找不到|erreur|échec|impossible|plantage|ne répond pas/i;
const SELF = /^(hugluno|electron)$/i;

/** 窗口标题像不像报错 */
const looksLikeError = (app, title) => !SELF.test(String(app || '').trim()) && ERR.test(String(title || ''));
/** 要不要这次去问模型：像报错 + 同一个窗口 10 分钟内没问过 + 离上次问过了 2 分钟 */
function gate(st, app, title, now = Date.now()) {
  if (!looksLikeError(app, title)) return false;
  const k = app + '|' + title;
  if (now - (st.asked.get(k) || 0) < PER_WINDOW || now - st.last < MIN_GAP) return false;
  st.asked.set(k, now); st.last = now; if (st.asked.size > 200) st.asked.clear();
  return true;
}

const run = (file, args, ms = 6000) => new Promise(res => execFile(file, args, { timeout: ms, windowsHide: true, maxBuffer: 1 << 20 }, (e, out) => res(e ? '' : String(out || '').trim())));
const WIN_FRONT = `[Console]::OutputEncoding=[Text.Encoding]::UTF8;Add-Type 'using System;using System.Text;using System.Runtime.InteropServices;public class HugF{[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();[DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);[DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);}';$h=[HugF]::GetForegroundWindow();$b=New-Object Text.StringBuilder 512;[void][HugF]::GetWindowText($h,$b,512);$p=0;[void][HugF]::GetWindowThreadProcessId($h,[ref]$p);$n=(Get-Process -Id $p -ErrorAction SilentlyContinue).ProcessName;"$n\`t$($b.ToString())"`;
const MAC_FRONT = `const se=Application('System Events'),p=se.processes.whose({frontmost:true})[0];let t='';try{t=p.windows[0].name()}catch(_){};p.name()+'\\t'+(t||'')`;
async function front() {
  const out = WIN ? await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WIN_FRONT]) : MAC ? await run('osascript', ['-l', 'JavaScript', '-e', MAC_FRONT]) : '';
  const i = out.indexOf('\t'); return i < 0 ? null : { app: out.slice(0, i).trim(), title: out.slice(i + 1).trim().slice(0, 300) };
}

function createStandby({ app, electron, getWin, islandPush, send }) {
  const { desktopCapturer, screen, Notification, systemPreferences } = electron;
  const FILE = () => path.join(app.getPath('userData'), 'standby.json');
  let on = false; try { on = !!JSON.parse(fs.readFileSync(FILE(), 'utf8')).on; } catch {}
  const st = { asked: new Map(), last: 0, timer: 0, busy: false, hint: null };

  async function shot() {
    if (MAC && systemPreferences.getMediaAccessStatus('screen') !== 'granted') return '';
    const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()), k = Math.min(1, 1280 / d.size.width);
    const all = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(d.size.width * k), height: Math.round(d.size.height * k) } });
    const src = all.find(x => x.display_id === String(d.id)) || all[0]; return src ? 'data:image/jpeg;base64,' + src.thumbnail.toJPEG(60).toString('base64') : '';
  }
  async function tick() {
    if (!on || st.busy) return; st.busy = true;
    try {
      const f = await front(); if (!f) return;
      const w = getWin(); if (w && !w.isDestroyed() && w.isFocused()) return; // 你正在用 Hugluno 本身：不打扰
      if (!gate(st, f.app, f.title)) return;
      const jpg = await shot();
      send('standby:check', { app: f.app, title: f.title, jpg }); // 交给页面：用你填的模型看一眼（net.js），结果经 standby:result 回来
    } catch {} finally { st.busy = false; }
  }
  function result(r) { // 页面问完模型：真有问题才亮黄灯 + 通知
    if (!on || !r || !r.problem) return;
    st.hint = { summary: String(r.summary || '').slice(0, 300), fix: String(r.fix || '').slice(0, 4000), app: String(r.app || '').slice(0, 80), title: String(r.title || '').slice(0, 300) };
    const line = st.hint.summary.slice(0, 40) || '看起来卡在一个报错上';
    islandPush({ hint: line });
    try { if (Notification.isSupported()) { const n = new Notification({ title: 'Hugluno', body: line + '（点 Lunosland 看解决办法）', silent: true }); n.on('click', open); n.show(); } } catch {}
  }
  function open() { // 点了黄灯 / 通知：打开主窗口，把解决办法放进一个新对话
    if (!st.hint) return; const w = getWin(); if (!w || w.isDestroyed()) return;
    w.show(); w.focus(); send('standby:open', st.hint); st.hint = null; islandPush({ hint: '' });
  }
  function set(v) { on = !!v; try { fs.writeFileSync(FILE(), JSON.stringify({ on })); } catch {} clearInterval(st.timer); if (on) st.timer = setInterval(tick, TICK); else { st.hint = null; islandPush({ hint: '' }); } return on; }
  if (on) st.timer = setInterval(tick, TICK);
  return { get: () => on, set, result, open, stop: () => clearInterval(st.timer), _tick: tick };
}

module.exports = { createStandby, looksLikeError, gate, ERR };
