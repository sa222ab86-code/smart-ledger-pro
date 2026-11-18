'use strict';
const { contextBridge, ipcRenderer, webFrame } = require('electron');

// واجهة محدودة وآمنة: الصفحة لا ترى Node ولا ipcRenderer مباشرة.
contextBridge.exposeInMainWorld('ledger', {
  isElectron: true,
  /** تكبير/تصغير واجهة البرنامج كاملة (وضع شاشة اللمس) — 0.6 إلى 1.6 */
  ui: {
    setZoom: (f) => { const z = Number(f); if (z >= 0.6 && z <= 1.6) webFrame.setZoomFactor(z); },
  },
  db: {
    loadAll: () => ipcRenderer.invoke('db:load'),
    saveCollection: (name, items) => ipcRenderer.invoke('db:saveCollection', name, items),
    patchCollection: (name, patch) => ipcRenderer.invoke('db:patchCollection', name, patch),
    saveKv: (key, value) => ipcRenderer.invoke('db:saveKv', key, value),
    batch: (ops) => ipcRenderer.invoke('db:batch', ops),
    batchSync: (ops) => ipcRenderer.sendSync('db:batchSync', ops),
    // نسخ متزامنة تُستعمل عند إغلاق النافذة فقط لضمان عدم ضياع آخر تعديل
    saveCollectionSync: (name, items) => ipcRenderer.sendSync('db:saveCollectionSync', name, items),
    saveKvSync: (key, value) => ipcRenderer.sendSync('db:saveKvSync', key, value),
    patchCollectionSync: (name, patch) => ipcRenderer.sendSync('db:patchCollectionSync', name, patch),
  },
  /** نسخة Pro: ربط عدة أجهزة على الشبكة المحلية */
  network: {
    info: () => ipcRenderer.invoke('network:info'),
    configure: (cfg) => ipcRenderer.invoke('network:configure', cfg),
    discover: () => ipcRenderer.invoke('network:discover'),
    test: (opts) => ipcRenderer.invoke('network:test', opts),
    relaunch: () => ipcRenderer.invoke('app:relaunch'),
    onChanges: (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on('net:changes', h); return () => ipcRenderer.removeListener('net:changes', h); },
    onReload: (cb) => { const h = () => cb(); ipcRenderer.on('net:reload', h); return () => ipcRenderer.removeListener('net:reload', h); },
    onResync: (cb) => { const h = () => cb(); ipcRenderer.on('net:resync', h); return () => ipcRenderer.removeListener('net:resync', h); },
    onStatus: (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on('net:status', h); return () => ipcRenderer.removeListener('net:status', h); },
    onFlushBeforeClose: (cb) => { const h = () => cb(); ipcRenderer.on('app:flushBeforeClose', h); return () => ipcRenderer.removeListener('app:flushBeforeClose', h); },
    flushedForClose: () => ipcRenderer.send('app:flushedForClose'),
  },
  /** نسخة Pro: ربط الفروع عن بعد (المركز الرئيسي والفروع) */
  branches: {
    info: () => ipcRenderer.invoke('branches:info'),
    configure: (input) => ipcRenderer.invoke('branches:configure', input),
    testLink: (code) => ipcRenderer.invoke('branches:testLink', code),
    join: (code) => ipcRenderer.invoke('branches:join', code),
    syncNow: () => ipcRenderer.invoke('branches:syncNow'),
    add: (input) => ipcRenderer.invoke('branches:add', input),
    update: (id, input) => ipcRenderer.invoke('branches:update', id, input),
    setActive: (id, on) => ipcRenderer.invoke('branches:setActive', id, on),
    remove: (id, purge) => ipcRenderer.invoke('branches:remove', id, purge),
    linkCode: (id) => ipcRenderer.invoke('branches:linkCode', id),
    rekey: (id) => ipcRenderer.invoke('branches:rekey', id),
    data: (id, collections) => ipcRenderer.invoke('branches:data', id, collections),
    onStatus: (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on('branches:status', h); return () => ipcRenderer.removeListener('branches:status', h); },
    onChanged: (cb) => { const h = () => cb(); ipcRenderer.on('branches:changed', h); return () => ipcRenderer.removeListener('branches:changed', h); },
  },
  print: {
    list: () => ipcRenderer.invoke('print:list'),
    listDiag: () => ipcRenderer.invoke('print:listDiag'),
    spoolerStatus: () => ipcRenderer.invoke('print:spoolerStatus'),
    repairSpooler: () => ipcRenderer.invoke('print:repairSpooler'),
    page: (opts) => ipcRenderer.invoke('print:page', opts),
    html: (opts) => ipcRenderer.invoke('print:html', opts),
    pdf: (opts) => ipcRenderer.invoke('print:pdf', opts),
    pagePdf: (opts) => ipcRenderer.invoke('print:pagePdf', opts),
    escposHtml: (opts) => ipcRenderer.invoke('print:escposHtml', opts),
    gdiHtml: (opts) => ipcRenderer.invoke('print:gdiHtml', opts),
  },
  share: {
    file: (opts) => ipcRenderer.invoke('share:file', opts),
  },
  clipboard: {
    readText: () => ipcRenderer.invoke('clipboard:readText'),
    writeText: (t) => ipcRenderer.invoke('clipboard:writeText', t),
  },
  license: {
    status: () => ipcRenderer.invoke('license:status'),
    activate: (key) => ipcRenderer.invoke('license:activate', key),
    remove: () => ipcRenderer.invoke('license:remove'),
    pwResetChallenge: (o) => ipcRenderer.invoke('pwreset:challenge', o),
    pwResetVerify: (o) => ipcRenderer.invoke('pwreset:verify', o),
  },
  devices: {
    openDrawer: (opts) => ipcRenderer.invoke('drawer:open', opts),
    scalePorts: () => ipcRenderer.invoke('scale:ports'),
    scaleStart: (cfg) => ipcRenderer.invoke('scale:start', cfg),
    scaleStop: () => ipcRenderer.invoke('scale:stop'),
    onScaleData: (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on('scale:data', h); return () => ipcRenderer.removeListener('scale:data', h); },
    onScaleStatus: (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on('scale:status', h); return () => ipcRenderer.removeListener('scale:status', h); },
    displayOpen: (opts) => ipcRenderer.invoke('display:open', opts),
    displayClose: () => ipcRenderer.invoke('display:close'),
    displayInfo: () => ipcRenderer.invoke('display:info'),
    displayUpdate: (state) => ipcRenderer.send('display:update', state),
    vfdStart: (cfg) => ipcRenderer.invoke('vfd:start', cfg),
    vfdStop: () => ipcRenderer.invoke('vfd:stop'),
    vfdWrite: (bytes) => ipcRenderer.invoke('vfd:write', bytes),
    onVfdStatus: (cb) => { const h = (_e, s) => cb(s); ipcRenderer.on('vfd:status', h); return () => ipcRenderer.removeListener('vfd:status', h); },
  },
  files: {
    saveText: (opts) => ipcRenderer.invoke('file:saveText', opts),
  },
  archive: {
    get: () => ipcRenderer.invoke('archive:get'),
    chooseDir: (kind) => ipcRenderer.invoke('archive:chooseDir', kind),
    set: (patch) => ipcRenderer.invoke('archive:set', patch),
    backupNow: () => ipcRenderer.invoke('archive:backupNow'),
    invoicePdf: (opts) => ipcRenderer.invoke('archive:invoicePdf', opts),
    open: (kind) => ipcRenderer.invoke('archive:open', kind),
  },
  backup: {
    list: () => ipcRenderer.invoke('backup:list'),
    exportTo: () => ipcRenderer.invoke('backup:export'),
    restoreFromFile: () => ipcRenderer.invoke('backup:restoreFile'),
    restoreFromAuto: (name) => ipcRenderer.invoke('backup:restoreAuto', name),
  },
  zatca: {
    status: () => ipcRenderer.invoke('zatca:status'),
    onboard: (input) => ipcRenderer.invoke('zatca:onboard', input),
    sign: (payload) => ipcRenderer.invoke('zatca:sign', payload),
    runQueue: () => ipcRenderer.invoke('zatca:runQueue'),
    docStatuses: () => ipcRenderer.invoke('zatca:docStatuses'),
    orphans: (ids) => ipcRenderer.invoke('zatca:orphans', ids),
    docDetail: (id) => ipcRenderer.invoke('zatca:docDetail', id),
    onQueue: (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on('zatca:queue', h); return () => ipcRenderer.removeListener('zatca:queue', h); },
    retryDoc: (id) => ipcRenderer.invoke('zatca:retryDoc', id),
    disconnect: () => ipcRenderer.invoke('zatca:disconnect'),
    exportXml: (id) => ipcRenderer.invoke('zatca:exportXml', id),
    onStatus: (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on('zatca:status', h); return () => ipcRenderer.removeListener('zatca:status', h); },
    onProgress: (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on('zatca:onboardProgress', h); return () => ipcRenderer.removeListener('zatca:onboardProgress', h); },
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:version'),
    setIcon: (dataUrl) => ipcRenderer.invoke('app:setIcon', dataUrl),
    refocus: () => ipcRenderer.send('app:refocus'),
    setFullScreen: (on) => ipcRenderer.invoke('app:setFullScreen', !!on),
    minimize: () => ipcRenderer.invoke('app:minimize'),
    quit: () => ipcRenderer.invoke('app:quit'),
  },
  update: {
    getState: () => ipcRenderer.invoke('update:getState'),
    check: () => ipcRenderer.invoke('update:check'),
    setAuto: (enabled) => ipcRenderer.invoke('update:setAuto', enabled),
    install: () => ipcRenderer.invoke('update:install'),
    onStatus: (cb) => {
      const handler = (_event, state) => cb(state);
      ipcRenderer.on('update:status', handler);
      return () => ipcRenderer.removeListener('update:status', handler);
    },
  },
});
