'use strict';
// Lunosland 窗口的最小接口：只能报告悬停 / 提交输入 / 收起，接收主进程推来的状态；拿不到任何别的能力
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('Island', {
  hover: on => ipcRenderer.send('island:hover', !!on),
  submit: text => ipcRenderer.send('island:submit', String(text || '').slice(0, 8000)),
  expand: on => ipcRenderer.send('island:expand', !!on),
  onState: fn => ipcRenderer.on('island:state', (e, s) => fn(s)),
});
