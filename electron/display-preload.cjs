'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// شاشة العميل: استقبال حالة السلة فقط (قراءة) — لا وصول لأي شيء آخر
contextBridge.exposeInMainWorld('customerDisplay', {
  onState: (cb) => ipcRenderer.on('display:state', (_e, s) => cb(s)),
});
