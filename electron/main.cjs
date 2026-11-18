'use strict';
const { app, BrowserWindow, ipcMain, shell, Menu, dialog, nativeImage, safeStorage, clipboard } = require('electron');
const path = require('node:path');
const { openStore } = require('./db.cjs');
const { initUpdater } = require('./updater.cjs');
const { registerSystemIpc, state: systemState } = require('./system.cjs');
const { registerDevicesIpc } = require('./devices.cjs');
const { registerEscPosIpc } = require('./escpos.cjs');
// في النسخة المبنية: وحدة الترخيص المشوَّشة (scripts/protect.cjs) — في التطوير: المصدر
const license = (() => { try { if (app.isPackaged) return require('./license.protected.cjs'); } catch (e) { console.error('license module', e); } return require('./license.cjs'); })();
const { registerLicenseIpc } = license;
const { refreshShortcutIcons } = require('./shortcuts.cjs');
const { createZatcaService } = require('./zatca/service.cjs');
const { createArchive } = require('./archive.cjs');
let archive = null;
const fs = require('node:fs');

const { createNetwork } = require('./network.cjs');
const { createBranchSync, loadBranchConfig } = require('./branchsync.cjs');

// لغة محرك العرض إنجليزية: خانات الأرقام (السعر، الكمية، التاريخ) تُعرض بأرقام 123 لا ١٢٣
// حتى لو كانت لغة الويندوز عربية — واجهة البرنامج نفسها عربية من الكود ولا تتأثر
app.commandLine.appendSwitch('lang', 'en-US');

const DEV_URL = process.env.VITE_DEV_SERVER_URL || '';
const isDev = !app.isPackaged;


// نسخة التطوير تستعمل قاعدة بيانات منفصلة حتى لا تلوّث بيانات النسخة المثبتة
if (isDev) app.setPath('userData', `${app.getPath('userData')}-dev`);

let mainWindow = null;
// خطأ غير ملتقط في العملية الرئيسية (طابعة/جهاز/ملف): يُسجَّل ولا يُغلق البرنامج أثناء البيع
process.on('uncaughtException', (err) => { console.error('[main] uncaughtException', err); });
process.on('unhandledRejection', (reason) => { console.error('[main] unhandledRejection', reason); });
let store = null;
/** النسخة الاحتياطية عند الإغلاق أُخذت (أو يُثبَّت تحديث له نسخته الخاصة) */
let quitBackupDone = false;
let updater = null;
let zatca = null;
let devices = null;
let escpos = null;
let network = null;
/** Pro: ربط الفروع عن بعد (المركز / الفرع) */
let branches = null;
/** الجهاز الفرعي: حُفظ كل ما هو معلّق على الجهاز الرئيسي قبل الإغلاق */
let flushedForClose = false;

function isTrusted(event) {
  return mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents;
}

function isAppUrl(url) {
  if (DEV_URL && url.startsWith(DEV_URL)) return true;
  return url.startsWith('file://');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1180,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true, // القائمة تظهر بالضغط على Alt
    backgroundColor: '#0e1518',
    title: 'الدفتر الذكي Pro',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: !app.isPackaged, // أدوات المطوّر مغلقة في النسخة المبنية
    },
  });

  // يفتح مكبّراً (Maximize) بحجم الشاشة مع بقاء شريط مهام ويندوز ظاهراً — يناسب 15.6 إلى 24 بوصة
  mainWindow.once('ready-to-show', () => { mainWindow.maximize(); mainWindow.show(); });

  // قائمة الزر الأيمن: نسخ / لصق / قص / تحديد الكل (Electron لا يوفرها افتراضياً)
  mainWindow.webContents.on('context-menu', (_e, p) => {
    const items = [];
    const pwd = p.inputFieldType === 'password';
    if (p.isEditable) {
      if (!pwd) items.push({ role: 'cut', label: 'قص', enabled: p.editFlags.canCut });
      if (!pwd) items.push({ role: 'copy', label: 'نسخ', enabled: p.editFlags.canCopy });
      items.push({ role: 'paste', label: 'لصق', enabled: p.editFlags.canPaste });
      items.push({ type: 'separator' }, { role: 'selectAll', label: 'تحديد الكل' });
    } else if (p.selectionText && p.selectionText.trim()) {
      items.push({ role: 'copy', label: 'نسخ' });
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: mainWindow });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });
  // الجهاز الفرعي: لا حفظ متزامن عبر الشبكة — نطلب من الواجهة حفظ المعلّق على الجهاز الرئيسي ثم نغلق
  mainWindow.on('close', (e) => {
    if (!network || network.role() !== 'client' || flushedForClose || !mainWindow || mainWindow.isDestroyed()) return;
    e.preventDefault();
    mainWindow.webContents.send('app:flushBeforeClose');
    setTimeout(() => { flushedForClose = true; if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close(); }, 6000);
  });
  // إغلاق البرنامج يغلق شاشة العميل ويوقف قراءة الميزان (وإلا يبقى التطبيق يعمل في الخلفية)
  mainWindow.on('closed', () => { mainWindow = null; if (devices) devices.dispose(); if (escpos) escpos.dispose(); });
  // انهيار عملية الواجهة (نفاد ذاكرة/خطأ في المحرك): إعادة تحميل تلقائية بدل نافذة بيضاء متجمدة
  let lastGone = 0;
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[main] renderer gone', details && details.reason);
    if (!mainWindow || mainWindow.isDestroyed() || (details && details.reason === 'clean-exit')) return;
    const now = Date.now();
    if (now - lastGone < 10000) return; // تفادي حلقة إعادة تحميل
    lastGone = now;
    setTimeout(() => { try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload(); } catch { /* */ } }, 500);
  });
  mainWindow.on('unresponsive', () => console.warn('[main] window unresponsive'));

  if (DEV_URL) mainWindow.loadURL(DEV_URL);
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

function registerZatcaIpc() {
  const guard = (e) => { if (!isTrusted(e)) throw new Error('untrusted'); if (!zatca) throw new Error('خدمة الفوترة غير جاهزة'); };
  // الفاتورة الإلكترونية بترخيص منفصل — الفحص هنا لا في الواجهة وحدها
  const FEAT = 'zatca';
  const needFeature = () => { if (license.hasFeature && !license.hasFeature(FEAT)) throw new Error('الفاتورة الإلكترونية تحتاج ترخيصاً — فعّل مفتاحاً يشملها من شاشة «الترخيص والتفعيل»'); };
  const needLicensed = () => { if (license.hasLicensedFeature && !license.hasLicensedFeature(FEAT)) throw new Error('الربط بمنصة فاتورة يحتاج ترخيص «الفاتورة الإلكترونية» — تواصل مع المطوّر ليصدر لك مفتاحاً يشملها'); };
  ipcMain.handle('zatca:status', (e) => { guard(e); return zatca.status(); });
  ipcMain.handle('zatca:onboard', async (e, input) => {
    guard(e);
    try { needLicensed(); return await zatca.onboard(input); }
    catch (err) { return { ok: false, error: String(err.message || err), results: err.results || [] }; }
  });
  ipcMain.handle('zatca:sign', (e, payload) => {
    guard(e);
    try { needFeature(); return { ok: true, ...zatca.sign(payload) }; }
    catch (err) { return { ok: false, error: String(err.message || err), details: err.details || [] }; }
  });
  ipcMain.handle('zatca:runQueue', async (e) => { guard(e); needFeature(); await zatca.runQueue(); return zatca.status(); });
  ipcMain.handle('zatca:docStatuses', (e) => { guard(e); return zatca.docStatuses(); });
  ipcMain.handle('zatca:docDetail', (e, id) => { guard(e); return zatca.docDetail(String(id)); });
  ipcMain.handle('zatca:orphans', (e, ids) => { guard(e); return zatca.orphans(Array.isArray(ids) ? ids : []); });
  ipcMain.handle('zatca:retryDoc', (e, invoiceId) => { guard(e); zatca.retryRejected(String(invoiceId)); return true; });
  ipcMain.handle('zatca:disconnect', (e) => { guard(e); zatca.disconnect(); return zatca.status(); });
  ipcMain.handle('zatca:exportXml', async (e, invoiceId) => {
    guard(e);
    const r = zatca.getXml(String(invoiceId));
    if (!r) return { ok: false, error: 'لا يوجد ملف XML لهذه الفاتورة' };
    const res = await dialog.showSaveDialog(mainWindow, { defaultPath: `${r.number}.xml`, filters: [{ name: 'XML', extensions: ['xml'] }] });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(res.filePath, r.xml, 'utf8');
    return { ok: true, path: res.filePath };
  });
}

function registerIpc() {
  registerSystemIpc({ getWindow: () => mainWindow, getStore: () => store, isTrusted });
  devices = registerDevicesIpc({ getWindow: () => mainWindow, isTrusted });
  escpos = registerEscPosIpc({ isTrusted });
  registerLicenseIpc({ isTrusted, getStore: () => store });
  require('./pwreset.cjs').registerPwResetIpc({ isTrusted, getPublicKey: () => license.publicKey(), getDeviceCode: () => license.machineCode() });
  // الحافظة: قراءة/كتابة نص (زر «لصق» و«نسخ» في الواجهة)
  ipcMain.handle('clipboard:readText', (e) => { if (!isTrusted(e)) throw new Error('untrusted'); return clipboard.readText(); });
  ipcMain.handle('clipboard:writeText', (e, t) => { if (!isTrusted(e)) throw new Error('untrusted'); clipboard.writeText(String(t ?? '')); return true; });
  // كل أوامر البيانات تمر عبر موجّه الشبكة (نسخة Pro): مستقل = القاعدة المحلية كالنسخة العادية،
  // رئيسي = كتابة متسامحة تُبث للأجهزة الفرعية، فرعي = على الجهاز الرئيسي
  const D = () => network.data;
  const denied = (e) => { if (!isTrusted(e)) throw new Error('untrusted'); };
  ipcMain.handle('db:load', (e) => { denied(e); return D().loadAll(); });
  ipcMain.handle('db:saveCollection', (e, name, items) => { if (systemState.restoring) return false; denied(e); return D().saveCollection(name, items); });
  ipcMain.handle('db:patchCollection', (e, name, patch) => { if (systemState.restoring) return false; denied(e); return D().patchCollection(name, patch); });
  ipcMain.handle('db:batch', (e, ops) => { if (systemState.restoring) return false; denied(e); return D().batch(ops); });
  ipcMain.handle('db:saveKv', (e, key, value) => { if (systemState.restoring) return false; denied(e); return D().saveKv(key, value); });
  const syncOp = (e, ops) => {
    try { if (systemState.restoring) { e.returnValue = false; return; } denied(e); e.returnValue = !!D().batchSync(ops); }
    catch (err) { console.error('db sync save failed', err); e.returnValue = false; }
  };
  ipcMain.on('db:batchSync', (e, ops) => syncOp(e, ops));
  ipcMain.on('db:patchCollectionSync', (e, name, patch) => syncOp(e, [{ t: 'patch', name, patch }]));
  ipcMain.on('db:saveCollectionSync', (e, name, items) => syncOp(e, [{ t: 'save', name, items }]));
  ipcMain.on('db:saveKvSync', (e, key, value) => syncOp(e, [{ t: 'kv', key, value }]));

  /* ------------------------------ ربط الأجهزة (Pro) ------------------------------ */
  ipcMain.handle('network:info', (e) => { denied(e); return network.info(); });
  ipcMain.handle('network:configure', (e, cfg) => { denied(e); return network.configure(cfg || {}); });
  ipcMain.handle('network:discover', (e) => { denied(e); return network.discover(); });
  ipcMain.handle('network:test', (e, opts) => { denied(e); return network.test(opts || {}); });
  /* ------------------------------ ربط الفروع عن بعد (Pro) ------------------------------ */
  const B = () => { if (!branches) throw new Error('خدمة الفروع غير جاهزة'); return branches; };
  const wrap = (fn) => async (e, ...args) => { denied(e); try { return { ok: true, ...(await fn(...args)) }; } catch (err) { return { ok: false, error: String((err && err.message) || err) }; } };
  ipcMain.handle('branches:info', (e) => { denied(e); return B().info(); });
  ipcMain.handle('branches:configure', (e, input) => { denied(e); return B().configure(input || {}); });
  ipcMain.handle('branches:testLink', (e, code) => { denied(e); return B().testLink(String(code || '')); });
  ipcMain.handle('branches:join', (e, code) => { denied(e); return B().join(String(code || '')); });
  ipcMain.handle('branches:syncNow', (e) => { denied(e); return B().syncNow(); });
  ipcMain.handle('branches:add', wrap((input) => B().addBranch(input || {})));
  ipcMain.handle('branches:update', wrap((id, input) => ({ done: B().updateBranch(String(id), input || {}) })));
  ipcMain.handle('branches:setActive', wrap((id, on) => ({ done: B().setBranchActive(String(id), !!on) })));
  ipcMain.handle('branches:remove', wrap((id, purge) => ({ done: B().removeBranch(String(id), !!purge) })));
  ipcMain.handle('branches:linkCode', wrap((id) => ({ linkCode: B().linkCode(String(id)) })));
  ipcMain.handle('branches:rekey', wrap((id) => ({ linkCode: B().rekeyBranch(String(id)) })));
  ipcMain.handle('branches:data', (e, id, collections) => { denied(e); return B().branchData(String(id), collections); });

  ipcMain.handle('app:relaunch', (e) => { denied(e); quitBackupDone = true; app.relaunch(); setTimeout(() => app.quit(), 100); return true; });
  ipcMain.on('app:flushedForClose', (e) => {
    if (!isTrusted(e)) return;
    flushedForClose = true;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
  });

  ipcMain.handle('app:version', () => app.getVersion());
  // أزرار النافذة في شاشة الدخول (مهمة في وضع ملء الشاشة حيث لا يظهر شريط العنوان)
  ipcMain.handle('app:minimize', (e) => { if (!isTrusted(e)) throw new Error('untrusted'); BrowserWindow.fromWebContents(e.sender)?.minimize(); return true; });
  ipcMain.handle('app:quit', (e) => { if (!isTrusted(e)) throw new Error('untrusted'); setTimeout(() => app.quit(), 50); return true; });
  // ملء الشاشة (يخفي شريط مهام ويندوز) — إعداد في «إعدادات التطبيق»
  ipcMain.handle('app:setFullScreen', (e, on) => {
    if (!isTrusted(e)) throw new Error('untrusted');
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win || win.isDestroyed()) return false;
    win.setFullScreen(!!on);
    return win.isFullScreen();
  });
  // تغيير أيقونة النافذة وشريط المهام من داخل البرنامج (dataUrl بصيغة PNG، أو null للأيقونة الافتراضية)
  // إصلاح معروف في ويندوز: بعد نوافذ alert/confirm الأصلية قد تفقد حقول الإدخال قدرتها على الكتابة
  // (تبدو الشاشة متجمدة) حتى يُعاد تركيز النافذة — نعيد التركيز برمجياً بعد كل نافذة تأكيد
  ipcMain.on('app:refocus', (e) => {
    if (!isTrusted(e)) return;
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win || win.isDestroyed()) return;
    win.blur();
    win.focus();
    e.sender.focus();
  });
  ipcMain.handle('app:setIcon', (e, dataUrl) => {
    if (!isTrusted(e)) throw new Error('untrusted');
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    const img = typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')
      ? nativeImage.createFromDataURL(dataUrl)
      : nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png'));
    if (img.isEmpty()) return false;
    mainWindow.setIcon(img);
    return true;
  });
}

function buildMenu() {
  const template = [
    {
      label: 'ملف',
      submenu: [
        {
          label: 'نسخة احتياطية الآن',
          click: async () => {
            try {
              const dest = await store.backupNow();
              dialog.showMessageBox(mainWindow, { type: 'info', message: 'تم إنشاء النسخة الاحتياطية', detail: dest });
            } catch (err) {
              dialog.showErrorBox('تعذر إنشاء النسخة الاحتياطية', String(err && err.message || err));
            }
          },
        },
        { label: 'فتح مجلد النسخ الاحتياطية', click: () => shell.openPath(store.backupsDir) },
        { label: 'فتح مجلد البيانات', click: () => shell.openPath(app.getPath('userData')) },
        { type: 'separator' },
        { role: 'quit', label: 'خروج' },
      ],
    },
    {
      label: 'مساعدة',
      submenu: [
        { label: 'التحقق من وجود تحديث', click: () => updater && updater.check({ manual: true }) },
        {
          label: 'عن البرنامج',
          click: () =>
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              message: 'الدفتر الذكي Pro',
              detail: `الإصدار ${app.getVersion()}\nقاعدة البيانات: ${store.file}`,
            }),
        },
      ],
    },
  ];
  // قائمة التحرير: تضمن عمل اختصارات النسخ واللصق (Ctrl+C / Ctrl+V) في كل الحقول
  template.push({
    label: 'تحرير',
    submenu: [
      { role: 'undo', label: 'تراجع' }, { role: 'redo', label: 'إعادة' }, { type: 'separator' },
      { role: 'cut', label: 'قص' }, { role: 'copy', label: 'نسخ' }, { role: 'paste', label: 'لصق' }, { role: 'selectAll', label: 'تحديد الكل' },
    ],
  });
  if (isDev) {
    template.push({ label: 'تطوير', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }] });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * أول تشغيل لنسخة Pro: إن وُجدت بيانات «الدفتر الذكي» (النسخة السابقة) على الجهاز نعرض نسخها.
 * النسخ بواجهة النسخ الاحتياطي في SQLite (سليم حتى لو كانت النسخة القديمة مفتوحة)، والأصل لا يُمس.
 */
async function importLegacyData() {
  const userData = app.getPath('userData');
  if (fs.existsSync(path.join(userData, 'ledger.db'))) return;
  const legacyDir = path.join(app.getPath('appData'), isDev ? 'Smart Ledger-dev' : 'Smart Ledger');
  const src = path.join(legacyDir, 'ledger.db');
  if (!fs.existsSync(src)) return;
  const choice = dialog.showMessageBoxSync({
    type: 'question',
    buttons: ['نسخ البيانات إلى Pro', 'البدء ببيانات فارغة'],
    defaultId: 0,
    cancelId: 1,
    title: 'الدفتر الذكي Pro',
    message: 'وُجدت بيانات من «الدفتر الذكي» (النسخة السابقة) على هذا الجهاز',
    detail: 'يمكن نسخ كل البيانات (الأصناف، الفواتير، العملاء، الإعدادات، الترخيص) إلى نسخة Pro.\nالبيانات الأصلية تبقى كما هي دون تغيير.',
  });
  if (choice !== 0) return;
  fs.mkdirSync(userData, { recursive: true });
  const Database = require('better-sqlite3');
  const old = new Database(src, { readonly: true, fileMustExist: true });
  try { await old.backup(path.join(userData, 'ledger.db')); } finally { old.close(); }
  for (const f of ['license.json', 'network.json', 'archive-settings.json', 'update-settings.json']) {
    try { if (fs.existsSync(path.join(legacyDir, f))) fs.copyFileSync(path.join(legacyDir, f), path.join(userData, f)); } catch (e) { console.error('legacy copy', f, e); }
  }
}

if (!app.requestSingleInstanceLock()) {
  // لا نسمح بنسختين تكتبان على نفس قاعدة البيانات
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try { await importLegacyData(); } catch (err) { console.error('legacy import failed', err); dialog.showErrorBox('تعذّر نقل بيانات النسخة السابقة', String((err && err.message) || err)); }
    try {
      store = openStore(app.getPath('userData'), { onBackup: (f) => archive && archive.mirrorBackup(f) });
      store.setCreateGuard(() => license.usableCached());
      archive = createArchive({ userDataDir: app.getPath('userData'), getWindow: () => mainWindow, getStore: () => store, isTrusted });
      const toWindow = (channel, data) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, data); };
      network = createNetwork({
        userDataDir: app.getPath('userData'),
        store,
        appVersion: app.getVersion(),
        send: toWindow,
        // الفرع المرتبط بالمركز: الحفظ بالدمج حتى لا يمسح بيعٌ محلي سعراً وصل من المركز
        merged: loadBranchConfig(app.getPath('userData')).cfg.mode === 'branch',
      });
      branches = createBranchSync({
        userDataDir: app.getPath('userData'),
        store,
        network,
        appVersion: app.getVersion(),
        deviceName: require('node:os').hostname(),
        send: toWindow,
      });
    } catch (err) {
      dialog.showErrorBox('تعذر فتح قاعدة البيانات', String((err && err.message) || err));
      app.quit();
      return;
    }
    // نسخة عند الفتح (إن كانت مفعّلة) — وإلا مرة يومياً على الأقل
    try { if (archive.config().backupOnOpenClose !== false) await store.backupNow(); else await store.backupIfNeeded(); } catch (err) { console.error('Startup backup failed:', err); }

    registerIpc();
    try { branches.start(); } catch (err) { console.error('branches start failed', err); }
    zatca = createZatcaService({
      store,
      safeStorage,
      appVersion: app.getVersion(),
      send: (channel, data) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, data); },
      onXml: (d) => archive && archive.archiveXml(d),
      licensed: () => (license.hasFeature ? license.hasFeature('zatca') : true),
    });
    registerZatcaIpc();
    buildMenu();
    createWindow();
    updater = initUpdater({
      getWindow: () => mainWindow,
      beforeInstall: () => { quitBackupDone = true; return store.backupNow(); },
    });

    // نسخة احتياطية دورية كل 6 ساعات أثناء تشغيل البرنامج (تُنسخ أيضاً للمجلد الخارجي)
    setInterval(() => { store.backupNow().catch((err) => console.error('periodic backup failed', err)); }, 6 * 60 * 60 * 1000);

    // بعد التحديث: توجيه اختصارات سطح المكتب وقائمة ابدأ وشريط المهام إلى الأيقونة الجديدة
    setTimeout(refreshShortcutIcons, 3000);

    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  // نسخة احتياطية عند الإغلاق (إن كانت مفعّلة) — بحد أقصى 10 ثوانٍ ثم يُغلق البرنامج
  app.on('before-quit', (e) => {
    if (quitBackupDone || !store || !archive || archive.config().backupOnOpenClose === false) return;
    quitBackupDone = true;
    e.preventDefault();
    Promise.race([store.backupNow(), new Promise((r) => setTimeout(r, 10000))])
      .catch((err) => console.error('quit backup failed', err))
      .finally(() => app.quit());
  });
  app.on('will-quit', () => { if (branches) void branches.dispose(); if (network) network.dispose(); if (store) store.close(); });
}
