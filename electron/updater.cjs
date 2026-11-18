'use strict';
const { app, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('node:path');
const fs = require('node:fs');

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000; // كل 4 ساعات
const FIRST_CHECK_DELAY_MS = 8 * 1000;

/** رسالة مختصرة ومفهومة بدل نص الخطأ التقني الطويل */
function friendlyError(err) {
  const raw = String((err && err.message) || err || '');
  if (/latest\.yml|HttpError: 404|status code 404/i.test(raw)) return 'الإصدار الجديد لم يكتمل رفعه على الخادم بعد — أعد المحاولة بعد دقائق.';
  if (/ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|net::ERR_|getaddrinfo|socket hang up/i.test(raw)) return 'تعذّر الاتصال بالإنترنت للبحث عن تحديث.';
  if (/HttpError: 40[13]|rate limit/i.test(raw)) return 'رفض الخادم الطلب مؤقتاً — أعد المحاولة لاحقاً.';
  if (/sha512 checksum mismatch|checksum/i.test(raw)) return 'ملف التحديث الذي نُزّل تالف — أعد المحاولة.';
  return raw.split('\n')[0].slice(0, 160);
}

function initUpdater({ getWindow, beforeInstall }) {
  // إعداد «التحديث التلقائي» (مفعّل افتراضياً) — يُحفظ في ملف صغير بمجلد بيانات البرنامج
  const cfgFile = path.join(app.getPath('userData'), 'update-settings.json');
  let autoEnabled = true;
  try { autoEnabled = JSON.parse(fs.readFileSync(cfgFile, 'utf8')).autoUpdate !== false; } catch { /* أول تشغيل */ }

  let state = { status: 'idle', version: app.getVersion(), manual: false, autoUpdate: autoEnabled };
  let manualCheck = false;

  const publish = (patch) => {
    state = { ...state, ...patch };
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('update:status', state);
  };

  // عند الإيقاف: لا فحص دوري ولا تنزيل ولا تثبيت تلقائي — ويبقى الفحص اليدوي متاحاً
  autoUpdater.autoDownload = true;                   // ينزّل التحديث في الخلفية
  autoUpdater.autoInstallOnAppQuit = autoEnabled;    // ويثبّته تلقائياً عند الإغلاق التالي
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = console;

  autoUpdater.on('checking-for-update', () =>
    publish({ status: 'checking', manual: manualCheck, error: undefined })
  );
  autoUpdater.on('update-available', (info) =>
    publish({ status: 'available', newVersion: info.version, manual: manualCheck })
  );
  autoUpdater.on('update-not-available', () => {
    publish({ status: manualCheck ? 'not-available' : 'idle', manual: manualCheck });
    manualCheck = false;
  });
  autoUpdater.on('download-progress', (p) =>
    publish({ status: 'downloading', percent: Math.round(p.percent) })
  );
  autoUpdater.on('update-downloaded', (info) =>
    publish({ status: 'downloaded', newVersion: info.version })
  );
  autoUpdater.on('error', (err) => {
    // الفحص الصامت في الخلفية (مثلاً بدون إنترنت) لا يزعج الكاشير بأي رسالة
    if (manualCheck) {
      publish({ status: 'error', manual: true, error: friendlyError(err) });
    } else if (state.status === 'checking') {
      publish({ status: 'idle' });
    }
    manualCheck = false;
  });

  async function check({ manual = false } = {}) {
    if (!app.isPackaged) {
      if (manual) publish({ status: 'error', manual: true, error: 'التحديث التلقائي يعمل في النسخة المثبتة فقط وليس في وضع التطوير.' });
      return;
    }
    manualCheck = manual;
    try {
      await autoUpdater.checkForUpdates();
    } catch {
      /* يُعالَج في حدث error */
    }
  }

  ipcMain.handle('update:getState', () => state);
  ipcMain.handle('update:setAuto', (_e, enabled) => {
    autoEnabled = !!enabled;
    autoUpdater.autoInstallOnAppQuit = autoEnabled;
    try { fs.writeFileSync(cfgFile, JSON.stringify({ autoUpdate: autoEnabled })); } catch (err) { console.error(err); }
    publish({ autoUpdate: autoEnabled });
    if (autoEnabled) check();
    return state;
  });
  ipcMain.handle('update:check', () => check({ manual: true }));
  ipcMain.handle('update:install', async () => {
    try { await beforeInstall(); } catch (e) { console.error('Backup before install failed:', e); }
    autoUpdater.quitAndInstall(false, true);
  });

  if (app.isPackaged) {
    setTimeout(() => { if (autoEnabled) check(); }, FIRST_CHECK_DELAY_MS);
    setInterval(() => { if (autoEnabled) check(); }, CHECK_EVERY_MS);
  }

  return { check };
}

module.exports = { initUpdater };
