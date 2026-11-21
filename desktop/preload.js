'use strict';
/* 主窗口的预加载脚本：只暴露下面这几个函数，页面拿不到 Node / 文件系统 / 任何别的能力。 */
const { contextBridge, ipcRenderer } = require('electron');
const inv = (ch, ...a) => ipcRenderer.invoke(ch, ...a);
contextBridge.exposeInMainWorld('HugDesk', {
  platform: process.platform,
  secret: { get: () => inv('secret:get'), set: k => inv('secret:set', String(k || '')), clear: () => inv('secret:clear') },
  net: { setProvider: u => inv('net:provider', String(u || '')), confirm: u => inv('net:confirm', String(u || '')), log: () => inv('net:log') },
  island: {
    enable: on => ipcRenderer.send('island:enable', !!on),
    state: p => ipcRenderer.send('island:state', p || {}),
    onSubmit: fn => ipcRenderer.on('island:submit', (e, t) => fn(String(t || ''))),
  },
  agent: { status: () => inv('agent:status'), pick: () => inv('agent:pick'), setCmd: m => inv('agent:cmd', String(m || 'off')), tool: (n, a) => inv('agent:tool', String(n || ''), a || {}) },
  standby: { get: () => inv('standby:get'), set: on => inv('standby:set', !!on), result: r => inv('standby:result', r || {}), onCheck: fn => ipcRenderer.on('standby:check', (e, p) => fn(p)), onOpen: fn => ipcRenderer.on('standby:open', (e, p) => fn(p)) },
  wipe: () => inv('data:wipe'),
});
