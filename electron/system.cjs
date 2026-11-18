'use strict';
/**
 * قنوات IPC الخاصة بالطباعة (الصامتة وغير الصامتة) وحفظ الملفات والنسخ الاحتياطي/الاستعادة.
 */
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { validateBackupFile, stamp } = require('./db.cjs');

const state = { restoring: false };

/**
 * لون خلفية النافذة الرئيسية داكن (#0e1518 لتجنّب الوميض عند الفتح)، والطابعة/PDF ترسم هوامش الصفحة بلون النافذة
 * فيظهر إطار داكن حول صفحة A4. نجعلها بيضاء أثناء الطباعة ثم نعيدها.
 */
async function withWhiteBg(wc, fn) {
  let w = null, prev = null;
  try {
    w = BrowserWindow.fromWebContents(wc);
    if (w && !w.isDestroyed()) { prev = w.getBackgroundColor(); w.setBackgroundColor('#ffffff'); await new Promise((r) => setTimeout(r, 80)); }
  } catch { /* تجاهل */ }
  try { return await fn(); } finally {
    try { if (w && prev && !w.isDestroyed()) w.setBackgroundColor(prev); } catch { /* تجاهل */ }
  }
}

/**
 * هوامش الطباعة حسب نوع الورقة:
 *  - A4/A5/متصل: هوامش CSS ‎@page (ترقيم الصفحات)
 *  - printer («ورق الطابعة» للحرارية): هوامش منطقة الطباعة التي يعلنها التعريف — المحتوى لا يُقص من أي جهة
 *  - الإيصال الحراري بمقاس مخصص: بلا هوامش
 */
const marginTypeFor = (pageSize) => (pageSize === 'A4' || pageSize === 'A5' || pageSize === 'CF' ? 'default' : pageSize === 'printer' ? 'printableArea' : 'none');

function registerSystemIpc({ getWindow, getStore, isTrusted }) {
  const guard = (e) => { if (!isTrusted(e)) throw new Error('untrusted'); };

  /* ------------------------------ الطباعة ------------------------------ */

  /* ---------------- قائمة طابعات ويندوز ----------------
   * 1) Chromium (getPrintersAsync) — محاولتان
   * 2) PowerShell (Win32_Printer)
   * 3) سجل ويندوز (لا يحتاج أي خدمة) — الطابعات المثبتة للمستخدم والجهاز
   * ونحفظ تشخيصاً (عدد كل مصدر وخطئه) يُعرض في شاشة الطابعات إن بقيت القائمة فارغة */
  const { short, listViaPowerShell, listViaRegistry, spoolerStatus, repairSpooler } = require('./winprint.cjs');

  let lastPrinterDiag = null;
  async function enumeratePrinters(sender) {
    const diag = { chromium: 0, chromiumError: '', powershell: 0, powershellError: '', registry: 0, registryError: '', source: '', at: new Date().toISOString() };
    const map = (printers) => printers.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault, description: p.description || '' }));
    for (let i = 0; i < 2; i++) {
      try {
        const l = await sender.getPrintersAsync();
        diag.chromium = l.length;
        if (l.length) { diag.source = 'chromium'; lastPrinterDiag = diag; return { printers: map(l), diag }; }
      } catch (e) { diag.chromiumError = short(e); }
      if (i === 0) await new Promise((r) => setTimeout(r, 800));
    }
    // Chromium لم يجد شيئاً: غالباً خدمة الطباعة متوقفة/معلّقة — نسجّل حالتها للشاشة
    const [ps, sp] = await Promise.all([listViaPowerShell(), spoolerStatus().catch(() => null)]);
    diag.spooler = sp;
    diag.powershell = ps.list.length; diag.powershellError = ps.error;
    if (ps.list.length) { diag.source = 'powershell'; lastPrinterDiag = diag; return { printers: ps.list, diag }; }
    const rg = await listViaRegistry();
    diag.registry = rg.list.length; diag.registryError = rg.error;
    if (rg.list.length) diag.source = 'registry';
    lastPrinterDiag = diag;
    return { printers: rg.list, diag };
  }

  ipcMain.handle('print:list', async (e) => {
    guard(e);
    return (await enumeratePrinters(e.sender)).printers;
  });
  /** تشخيص قائمة الطابعات (يُعرض في شاشة الطابعات إن كانت فارغة) */
  ipcMain.handle('print:listDiag', async (e) => {
    guard(e);
    return lastPrinterDiag || (await enumeratePrinters(e.sender)).diag;
  });
  /** حالة خدمة الطباعة في ويندوز (Print Spooler) */
  ipcMain.handle('print:spoolerStatus', async (e) => { guard(e); return spoolerStatus(); });
  /** إصلاح خدمة الطباعة: يطلب صلاحية المسؤول (UAC) ثم يعيد تشغيلها ويحذف الطباعات العالقة */
  let repairing = null;
  ipcMain.handle('print:repairSpooler', async (e) => {
    guard(e);
    if (!repairing) repairing = repairSpooler().finally(() => { repairing = null; lastPrinterDiag = null; });
    return repairing;
  });

  // طباعة الصفحة الحالية (الإيصال الظاهر) — صامتة أو بنافذة النظام
  ipcMain.handle('print:page', (e, opts = {}) => {
    guard(e);
    return new Promise((resolve) => {
      const options = {
        silent: !!opts.silent,
        printBackground: true,
        copies: Math.max(1, Math.min(10, Number(opts.copies) || 1)),
        // A4: هوامش الصفحة من CSS (@page) لترقيم الصفحات — الإيصال الحراري بلا هوامش — «ورق الطابعة»: هوامش التعريف
        margins: { marginType: marginTypeFor(opts.pageSize) },
      };
      if (opts.deviceName) options.deviceName = String(opts.deviceName);
      if (opts.pageSize === 'A4' || opts.pageSize === 'A5') options.pageSize = opts.pageSize;
      // ورق متصل للطابعة الإبرية (9.5×11 إنش…): لا نفرض مقاساً مخصّصاً على التعريف — كثير من التعريفات لا تدعمه
      // فتقصّ الصفحة أو تكبّرها. مقاس الصفحة يأتي من CSS (@page) ويُطابَق مع ورق الطابعة المضبوط في ويندوز (Fanfold)،
      // وعلى طابعة عادية (A4) يُصغَّر ليظهر كاملاً.
      // الإيصال الحراري: مقاس صريح (عرض الرول × طول المحتوى) — وإلا تستخدم الطابعة مقاسها الافتراضي (A4) فتخرج ورقة كبيرة
      // «ورق الطابعة» (printer): بلا مقاس — بعض التعريفات (CognitiveTPG…) لا تقبل المقاس المخصص فلا تطبع شيئاً
      const mm = opts.pageSizeMm;
      if (opts.pageSize === 'thermal') {
        const w = mm && Number(mm.width) > 0 ? Number(mm.width) : 80;
        const h = mm && Number(mm.height) > 0 ? Number(mm.height) : 200;
        options.pageSize = { width: Math.round(w * 1000), height: Math.round(Math.min(2000, h) * 1000) };
      }
      void withWhiteBg(e.sender, () => new Promise((done) => e.sender.print(options, (success, reason) => { resolve({ ok: success, reason: reason || '' }); done(); })));
    });
  });

  // يبني نافذة مخفية من HTML جاهز (تذاكر المطبخ، التقارير)
  async function withHiddenWindow(html, fn) {
    const tmp = path.join(os.tmpdir(), `ledger-print-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
    fs.writeFileSync(tmp, html, 'utf8');
    const win = new BrowserWindow({
      show: false,
      backgroundColor: '#ffffff',
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false },
    });
    try {
      await win.loadFile(tmp);
      return await fn(win);
    } finally {
      if (!win.isDestroyed()) win.destroy();
      fs.rm(tmp, { force: true }, () => {});
    }
  }

  ipcMain.handle('print:html', (e, opts = {}) => {
    guard(e);
    return withHiddenWindow(String(opts.html || ''), (win) =>
      new Promise((resolve) => {
        const options = {
          silent: !!opts.silent,
          printBackground: true,
          copies: Math.max(1, Math.min(10, Number(opts.copies) || 1)),
          margins: { marginType: marginTypeFor(opts.pageSize) },
        };
        if (opts.deviceName) options.deviceName = String(opts.deviceName);
        if (opts.pageSize === 'A4' || opts.pageSize === 'A5') options.pageSize = opts.pageSize;
        // CF (ورق متصل للإبرية) و«ورق الطابعة» للحرارية: المقاس من ورق الطابعة في ويندوز — بلا مقاس مخصّص
        // مقاس مخصص بالملّيمتر (ملصقات الباركود): Electron يطلبه بالميكرون
        const mm = opts.pageSize === 'printer' ? null : opts.pageSizeMm;
        if (mm && Number(mm.width) > 0 && Number(mm.height) > 0) {
          options.pageSize = { width: Math.round(Number(mm.width) * 1000), height: Math.round(Number(mm.height) * 1000) };
        }
        // تذكرة/إيصال حراري بلا مقاس صريح: رول 80مم (وإلا تستخدم الطابعة مقاسها الافتراضي A4)
        if (opts.pageSize === 'thermal' && !options.pageSize) options.pageSize = { width: 80000, height: 200000 };
        if (opts.landscape) options.landscape = true;
        win.webContents.print(options, (success, reason) => resolve({ ok: success, reason: reason || '' }));
      })
    );
  });

  ipcMain.handle('print:pdf', async (e, opts = {}) => {
    guard(e);
    const win = getWindow();
    const res = await dialog.showSaveDialog(win, {
      defaultPath: String(opts.defaultName || 'report.pdf'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    return withHiddenWindow(String(opts.html || ''), async (hidden) => {
      const buf = await hidden.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        landscape: !!opts.landscape,
        margins: { marginType: 'default' },
        preferCSSPageSize: true, // هوامش @page وترقيم الصفحات من المستند
      });
      fs.writeFileSync(res.filePath, buf);
      return { ok: true, path: res.filePath };
    });
  });

  // حفظ الصفحة الحالية (معاينة الفاتورة) كملف PDF — نفس قواعد @media print المستخدمة في الطباعة
  ipcMain.handle('print:pagePdf', async (e, opts = {}) => {
    guard(e);
    const res = await dialog.showSaveDialog(getWindow(), {
      defaultPath: String(opts.defaultName || 'invoice.pdf').replace(/[\\/:*?"<>|]/g, '-'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    try {
      const thermal = opts.pageSize === 'thermal';
      const heightMm = Math.max(100, Math.min(2000, Number(opts.heightMm) || 297));
      const buf = await withWhiteBg(e.sender, () => e.sender.printToPDF({
        pageSize: thermal ? { width: 80 / 25.4, height: heightMm / 25.4 } : opts.pageSize === 'A5' ? 'A5' : 'A4',
        printBackground: true,
        margins: thermal ? { marginType: 'none' } : { top: 0.3, bottom: 0.4, left: 0.3, right: 0.3 }, // هوامش CSS (@page) لها الأولوية — وفيها ترقيم الصفحات
        preferCSSPageSize: !thermal,
      }));
      fs.writeFileSync(res.filePath, buf);
      if (opts.open) shell.openPath(res.filePath).catch(() => {});
      return { ok: true, path: res.filePath };
    } catch (err) {
      return { ok: false, error: String(err && err.message || err) };
    }
  });

  /* ------------------------------ المشاركة ------------------------------ */
  // نسخ ملف إلى الحافظة كملف (للصق Ctrl+V في واتساب/البريد) — ويندوز عبر PowerShell، ماك عبر osascript
  function copyFileToClipboard(file) {
    return new Promise((resolve) => {
      if (process.platform === 'win32') {
        const ps = `Set-Clipboard -LiteralPath '${file.replace(/'/g, "''")}'`;
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps], { windowsHide: true, timeout: 15000 }, (err) => resolve(!err));
      } else if (process.platform === 'darwin') {
        execFile('osascript', ['-e', `set the clipboard to (POSIX file "${file.replace(/"/g, '\\"')}")`], { timeout: 15000 }, (err) => resolve(!err));
      } else resolve(false);
    });
  }

  // مشاركة فاتورة/عرض سعر: ملف PDF (من الصفحة الحالية أو من HTML) → الحافظة → فتح التطبيق المطلوب
  ipcMain.handle('share:file', async (e, opts = {}) => {
    guard(e);
    try {
      const dir = path.join(app.getPath('userData'), 'shared-files');
      fs.mkdirSync(dir, { recursive: true });
      const name = String(opts.fileName || 'document.pdf').replace(/[\\/:*?"<>|]/g, '-');
      const file = path.join(dir, name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`);
      let buf;
      if (opts.html) {
        buf = await withHiddenWindow(String(opts.html), (hidden) => hidden.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'default' }, preferCSSPageSize: true }));
      } else {
        const thermal = opts.pageSize === 'thermal';
        const heightMm = Math.max(100, Math.min(2000, Number(opts.heightMm) || 297));
        buf = await withWhiteBg(e.sender, () => e.sender.printToPDF({
          pageSize: thermal ? { width: 80 / 25.4, height: heightMm / 25.4 } : opts.pageSize === 'A5' ? 'A5' : 'A4',
          printBackground: true,
          margins: thermal ? { marginType: 'none' } : { top: 0.3, bottom: 0.4, left: 0.3, right: 0.3 },
          preferCSSPageSize: !thermal,
        }));
      }
      fs.writeFileSync(file, buf);
      const copied = await copyFileToClipboard(file);
      const target = String(opts.target || 'folder');
      let opened = true;
      if (target === 'whatsapp') {
        const phone = String(opts.phone || '').replace(/\D/g, '').replace(/^0(5\d{8})$/, '966$1');
        const text = opts.text ? `&text=${encodeURIComponent(String(opts.text))}` : '';
        try { await shell.openExternal(phone ? `whatsapp://send?phone=${phone}${text}` : `whatsapp://send?${text.slice(1)}`); }
        catch { opened = false; try { await shell.openExternal(`https://web.whatsapp.com/${phone ? `send?phone=${phone}` : ''}`); opened = true; } catch { /* تجاهل */ } }
      } else if (target === 'email') {
        try { await shell.openExternal(`mailto:${encodeURIComponent(String(opts.email || ''))}?subject=${encodeURIComponent(String(opts.subject || name))}&body=${encodeURIComponent(String(opts.text || ''))}`); } catch { opened = false; }
      }
      if (target === 'folder' || !copied) shell.showItemInFolder(file);
      return { ok: true, path: file, copied, opened };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  /* ------------------------------ الملفات ------------------------------ */

  ipcMain.handle('file:saveText', async (e, opts = {}) => {
    guard(e);
    const res = await dialog.showSaveDialog(getWindow(), {
      defaultPath: String(opts.defaultName || 'export.csv'),
      filters: opts.filters || [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(res.filePath, String(opts.content ?? ''), 'utf8');
    return { ok: true, path: res.filePath };
  });

  /* ------------------------ النسخ الاحتياطي والاستعادة ------------------------ */

  ipcMain.handle('backup:list', (e) => { guard(e); return getStore().listBackups(); });

  ipcMain.handle('backup:export', async (e) => {
    guard(e);
    const res = await dialog.showSaveDialog(getWindow(), {
      defaultPath: `SmartLedger-backup-${stamp()}.db`,
      filters: [{ name: 'Smart Ledger backup', extensions: ['db'] }],
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    await getStore().backupTo(res.filePath);
    return { ok: true, path: res.filePath };
  });

  async function restoreFrom(src) {
    const win = getWindow();
    let info;
    try {
      info = validateBackupFile(src);
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
    const answer = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['استعادة وإعادة التشغيل', 'إلغاء'],
      defaultId: 1,
      cancelId: 1,
      message: 'استعادة نسخة احتياطية',
      detail:
        'سيتم استبدال كل بيانات البرنامج الحالية ببيانات هذه النسخة، ثم يُعاد تشغيل البرنامج.\n' +
        'ستُحفظ نسخة أمان من بياناتك الحالية تلقائياً قبل الاستبدال.\n\n' +
        `عدد السجلات في النسخة: ${info.records}`,
    });
    if (answer.response !== 0) return { ok: false, canceled: true };

    const store = getStore();
    try {
      await store.backupTo(path.join(store.backupsDir, `pre-restore-${stamp()}.db`));
      state.restoring = true;
      store.close();
      for (const ext of ['-wal', '-shm']) fs.rmSync(store.file + ext, { force: true });
      fs.copyFileSync(src, store.file);
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
    app.relaunch();
    app.exit(0); // خروج فوري: لا نسمح للواجهة بحفظ حالتها القديمة فوق النسخة المستعادة
    return { ok: true };
  }

  ipcMain.handle('backup:restoreFile', async (e) => {
    guard(e);
    const res = await dialog.showOpenDialog(getWindow(), {
      properties: ['openFile'],
      filters: [{ name: 'Smart Ledger backup', extensions: ['db'] }],
    });
    if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true };
    return restoreFrom(res.filePaths[0]);
  });

  ipcMain.handle('backup:restoreAuto', async (e, name) => {
    guard(e);
    const safe = path.basename(String(name || ''));
    const item = getStore().listBackups().find((b) => b.name === safe);
    if (!item) return { ok: false, error: 'النسخة غير موجودة.' };
    return restoreFrom(item.path);
  });
}

module.exports = { registerSystemIpc, state };
