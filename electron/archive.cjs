'use strict';
/**
 * توجيه النسخ الاحتياطي وأرشيف الفواتير:
 *  - مجلد النسخ الاحتياطي الخارجي: كل نسخة تلقائية/يدوية تُنسخ أيضاً إلى مجلد يختاره المستخدم
 *    (قرص آخر، فلاش، مجلد OneDrive/Google Drive...) مع الاحتفاظ بآخر 60 نسخة هناك.
 *  - أرشيف الفواتير: كل فاتورة جديدة تُحفظ كملف PDF (وملف XML المختوم للفوترة الإلكترونية)
 *    في مجلد مرتب حسب السنة/الشهر:  <المجلد>/2026/10/INV-00001.pdf
 */
const { BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const MIRROR_KEEP = 60;
const MIRROR_SUBDIR = 'SmartLedger-Backups';

function createArchive({ userDataDir, getWindow, getStore, isTrusted }) {
  const cfgFile = path.join(userDataDir, 'archive-settings.json');
  const defaults = { backupDir: '', invoiceDir: '', invoicePdf: true, invoiceXml: true, backupOnOpenClose: true, lastMirrorAt: null, lastMirrorError: null, lastMirrorFile: null, lastInvoiceError: null, archivedCount: 0 };
  let cfg = { ...defaults };
  try { cfg = { ...defaults, ...JSON.parse(fs.readFileSync(cfgFile, 'utf8')) }; } catch { /* أول تشغيل */ }
  const save = () => { try { fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2), 'utf8'); } catch (e) { console.error('archive cfg save', e); } };

  const dirOk = (d) => { try { return !!d && fs.statSync(d).isDirectory(); } catch { return false; } };

  /* ------------------------- النسخ الاحتياطي الخارجي ------------------------- */
  function mirrorBackup(srcFile) {
    if (!cfg.backupDir) return null;
    try {
      if (!dirOk(cfg.backupDir)) throw new Error('المجلد غير متاح — هل الفلاش/القرص متصل؟');
      const dest = path.join(cfg.backupDir, MIRROR_SUBDIR);
      fs.mkdirSync(dest, { recursive: true });
      const target = path.join(dest, path.basename(srcFile));
      fs.copyFileSync(srcFile, target);
      // تدوير: نحتفظ بآخر 60 نسخة تلقائية فقط في المجلد الخارجي
      const files = fs.readdirSync(dest).filter((f) => /^ledger-\d{8}-\d{6}\.db$/.test(f)).sort();
      for (const f of files.slice(0, Math.max(0, files.length - MIRROR_KEEP))) {
        try { fs.unlinkSync(path.join(dest, f)); } catch { /* تجاهل */ }
      }
      cfg.lastMirrorAt = new Date().toISOString();
      cfg.lastMirrorError = null;
      cfg.lastMirrorFile = target;
      save();
      return target;
    } catch (err) {
      cfg.lastMirrorError = String((err && err.message) || err);
      save();
      return null;
    }
  }

  /* ------------------------------ أرشيف الفواتير ------------------------------ */
  const safeName = (s) => String(s || 'invoice').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 80);
  function invoiceFolder(dateStr) {
    const m = /^(\d{4})-(\d{2})/.exec(String(dateStr || ''));
    const now = new Date();
    const y = m ? m[1] : String(now.getFullYear());
    const mo = m ? m[2] : String(now.getMonth() + 1).padStart(2, '0');
    const dir = path.join(cfg.invoiceDir, y, mo);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  function archiveXml({ number, issueDate, xml }) {
    if (!cfg.invoiceDir || !cfg.invoiceXml || !xml) return;
    try {
      if (!dirOk(cfg.invoiceDir)) throw new Error('مجلد أرشيف الفواتير غير متاح');
      fs.writeFileSync(path.join(invoiceFolder(issueDate), `${safeName(number)}.xml`), xml, 'utf8');
    } catch (err) {
      cfg.lastInvoiceError = String((err && err.message) || err); save();
    }
  }

  // PDF: نافذة مخفية واحدة في كل مرة (طابور) حتى لا تتراكم النوافذ عند الأرشفة الجماعية
  let chain = Promise.resolve();
  function archivePdf({ number, date, html, overwrite }) {
    const job = chain.then(async () => {
      if (!cfg.invoiceDir || !cfg.invoicePdf) return { ok: false, skipped: true };
      if (!dirOk(cfg.invoiceDir)) throw new Error('مجلد أرشيف الفواتير غير متاح');
      const target = path.join(invoiceFolder(date), `${safeName(number)}.pdf`);
      if (!overwrite && fs.existsSync(target)) return { ok: true, path: target, existed: true };
      const tmp = path.join(os.tmpdir(), `ledger-archive-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
      fs.writeFileSync(tmp, String(html || ''), 'utf8');
      const win = new BrowserWindow({ show: false, backgroundColor: '#ffffff', webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false } });
      try {
        await win.loadFile(tmp);
        const buf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { top: 0.3, bottom: 0.4, left: 0.3, right: 0.3 }, preferCSSPageSize: true });
        fs.writeFileSync(target, buf);
        cfg.archivedCount = (cfg.archivedCount || 0) + 1;
        cfg.lastInvoiceError = null;
        save();
        return { ok: true, path: target };
      } finally {
        if (!win.isDestroyed()) win.destroy();
        fs.rm(tmp, { force: true }, () => {});
      }
    }).catch((err) => {
      cfg.lastInvoiceError = String((err && err.message) || err); save();
      return { ok: false, error: cfg.lastInvoiceError };
    });
    chain = job.then(() => undefined);
    return job;
  }

  /* ---------------------------------- IPC ---------------------------------- */
  const guard = (e) => { if (!isTrusted(e)) throw new Error('untrusted'); };
  const publicCfg = () => ({
    ...cfg,
    backupDirOk: cfg.backupDir ? dirOk(cfg.backupDir) : null,
    invoiceDirOk: cfg.invoiceDir ? dirOk(cfg.invoiceDir) : null,
    localBackupsDir: getStore()?.backupsDir || '',
  });

  ipcMain.handle('archive:get', (e) => { guard(e); return publicCfg(); });

  ipcMain.handle('archive:chooseDir', async (e, kind) => {
    guard(e);
    const res = await dialog.showOpenDialog(getWindow(), {
      title: kind === 'invoices' ? 'اختر مجلد أرشيف الفواتير' : 'اختر مجلد النسخ الاحتياطي',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: (kind === 'invoices' ? cfg.invoiceDir : cfg.backupDir) || undefined,
    });
    if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true, config: publicCfg() };
    const dir = res.filePaths[0];
    // تجربة الكتابة قبل الاعتماد
    try {
      const probe = path.join(dir, `.ledger-write-test-${Date.now()}`);
      fs.writeFileSync(probe, 'ok'); fs.unlinkSync(probe);
    } catch {
      return { ok: false, error: 'لا يمكن الكتابة في هذا المجلد — اختر مجلداً آخر', config: publicCfg() };
    }
    if (kind === 'invoices') cfg.invoiceDir = dir; else { cfg.backupDir = dir; cfg.lastMirrorError = null; }
    save();
    // أول نسخة فورية للمجلد الجديد
    if (kind !== 'invoices') {
      try { const f = await getStore().backupNow(); mirrorBackup(f); } catch (err) { cfg.lastMirrorError = String(err.message || err); save(); }
    }
    return { ok: true, config: publicCfg() };
  });

  ipcMain.handle('archive:set', (e, patch = {}) => {
    guard(e);
    if (typeof patch.invoicePdf === 'boolean') cfg.invoicePdf = patch.invoicePdf;
    if (typeof patch.invoiceXml === 'boolean') cfg.invoiceXml = patch.invoiceXml;
    if (typeof patch.backupOnOpenClose === 'boolean') cfg.backupOnOpenClose = patch.backupOnOpenClose;
    if (patch.clear === 'backup') cfg.backupDir = '';
    if (patch.clear === 'invoices') cfg.invoiceDir = '';
    save();
    return publicCfg();
  });

  ipcMain.handle('archive:backupNow', async (e) => {
    guard(e);
    const f = await getStore().backupNow(); // backupNow يستدعي mirrorBackup عبر onBackup
    return { ok: true, local: f, mirrored: cfg.backupDir && !cfg.lastMirrorError ? cfg.lastMirrorFile : null, config: publicCfg() };
  });

  ipcMain.handle('archive:invoicePdf', (e, opts = {}) => { guard(e); return archivePdf(opts); });

  ipcMain.handle('archive:open', (e, kind) => {
    guard(e);
    const d = kind === 'invoices' ? cfg.invoiceDir : kind === 'local' ? getStore().backupsDir : cfg.backupDir ? path.join(cfg.backupDir, MIRROR_SUBDIR) : '';
    if (d && dirOk(d)) shell.openPath(d);
    else if (d && kind === 'backup' && dirOk(cfg.backupDir)) shell.openPath(cfg.backupDir);
    return true;
  });

  return { mirrorBackup, archiveXml, archivePdf, config: () => cfg };
}

module.exports = { createArchive };
