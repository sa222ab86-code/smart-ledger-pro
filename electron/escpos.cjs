'use strict';
/**
 * طباعة حرارية مباشرة (ESC/POS) بدون تعريف ويندوز:
 * المستند (HTML) يُرسم كصورة بعرض رأس الطباعة (576 نقطة لـ 80مم / 384 لـ 58مم)،
 * ثم يُحوَّل أبيض/أسود ويُرسل كأوامر GS v 0 + قص الورق.
 * النتيجة: طول الورقة = طول المحتوى بالضبط مهما كانت إعدادات تعريف الطابعة.
 */
const { BrowserWindow, ipcMain, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { rawPrint } = require('./devices.cjs');
const { registryDefaultPrinter } = require('./winprint.cjs');
const { gdiPrint, warmGdiPrinter, bitmapToBwPng } = require('./gdiprint.cjs');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* نافذة رسم مخفية واحدة يُعاد استخدامها (إنشاء نافذة لكل ورقة كان يضيف تأخيراً ملحوظاً) */
let rwin = null;
let chain = Promise.resolve();
function getRenderWindow() {
  if (rwin && !rwin.isDestroyed()) return rwin;
  rwin = new BrowserWindow({
    show: false, width: 576, height: 400, useContentSize: true, frame: false, skipTaskbar: true,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: true, backgroundThrottling: false },
  });
  rwin.webContents.setFrameRate(60);
  rwin.on('closed', () => { rwin = null; });
  return rwin;
}
function disposeRenderWindow() { if (rwin && !rwin.isDestroyed()) rwin.destroy(); rwin = null; }
/** تجهيز نافذة الرسم مسبقاً */
function warmRender() { try { getRenderWindow().loadURL('about:blank').catch(() => {}); } catch { /* */ } }

/** يرسم HTML بعرض محدد بالنقاط ويعيد صورة RGBA — الطلبات بالتتابع على نفس النافذة */
function renderHtml(html, widthDots, cssWidthMm) {
  const job = chain.then(() => renderOnce(html, widthDots, cssWidthMm));
  chain = job.catch(() => {});
  return job;
}

async function renderOnce(html, widthDots, cssWidthMm) {
  const tmp = path.join(os.tmpdir(), `sl-escpos-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(tmp, html, 'utf8');
  const win = getRenderWindow();
  const wc = win.webContents;
  let lastPaint = null;
  const onPaint = (_e, _dirty, image) => { lastPaint = image; };
  wc.on('paint', onPaint);
  let ok = false;
  try {
    win.setContentSize(widthDots, 400);
    await win.loadFile(tmp);
    // بلا أشرطة تمرير إطلاقاً: كانت تظهر أحياناً (فرق كسر بكسل بين عرض المحتوى والنافذة)
    // فتُطبع كإطار عمودي يمين الورقة وشريط سفلي، وتُقصّ الكتابة من اليسار
    await wc.insertCSS('html,body{overflow:hidden!important;scrollbar-width:none!important}::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}').catch(() => {});
    // تكبير المستند (المقاس بالمم) ليملأ عرض رأس الطباعة بالضبط
    const zoom = widthDots / ((cssWidthMm * 96) / 25.4);
    wc.setZoomFactor(zoom);
    await wc.executeJavaScript('document.fonts ? document.fonts.ready.then(() => 1) : 1', true).catch(() => 1);
    // الباركود: عرض كل خط = عدد صحيح من نقاط الطابعة (2–4 نقاط) حتى يُقرأ بدقة بالماسح
    await wc.executeJavaScript(`(() => { const z = ${zoom}; document.querySelectorAll('[data-bc-modules]').forEach((el) => {
      const m = +el.dataset.bcModules; if (!m) return;
      const box = (el.closest('.doc-barcode') || el).parentElement || el; const avail = box.clientWidth * z;
      const k = Math.max(2, Math.min(4, Math.floor(avail / m)));
      el.style.maxWidth = 'none'; el.style.width = (k * m / z) + 'px';
    }); return 1; })()`, true).catch(() => 1);
    await wait(30);
    const cssH = await wc.executeJavaScript('Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight))', true);
    const height = Math.min(12000, Math.max(40, Math.ceil(cssH * zoom)));
    win.setContentSize(widthDots, height);
    // ننتظر حتى تأخذ النافذة المقاس الجديد فعلاً (وإلا يُلتقط جزء من الورقة)
    for (let i = 0; i < 40; i++) {
      const vh = await wc.executeJavaScript('window.innerHeight', true).catch(() => 0);
      if (Math.ceil(vh * zoom) >= height - 2) break;
      await wait(25);
    }
    await wc.executeJavaScript('window.scrollTo(0, 0); 1', true).catch(() => 1);
    // ننتظر أول إطار يُرسم بالمقاس الجديد بدل انتظار ثابت طويل
    const painted = new Promise((res) => {
      let timer = null;
      const finish = () => {
        if (timer) { clearTimeout(timer); timer = null; }
        try { if (!win.isDestroyed() && !wc.isDestroyed()) wc.removeListener('paint', on); } catch { /* */ }
        res();
      };
      const on = (_e, _d, image) => { try { if (image.getSize().height >= height - 2) finish(); } catch { finish(); } };
      wc.on('paint', on);
      timer = setTimeout(finish, 400);
    });
    win.setContentSize(widthDots, height);
    wc.invalidate();
    await painted;
    await wait(20);
    let img = await wc.capturePage({ x: 0, y: 0, width: widthDots, height }).catch(() => null);
    if (!img || img.isEmpty()) img = lastPaint; // بعض الأنظمة: الالتقاط من نافذة مخفية فارغ → آخر إطار مرسوم
    if (!img || img.isEmpty()) throw new Error('تعذر رسم التذكرة');
    // شاشات بتكبير (125%/150%): نعيد الصورة لعرض رأس الطباعة بالضبط
    if (img.getSize().width !== widthDots) img = img.resize({ width: widthDots, quality: 'best' });
    const size = img.getSize();
    ok = true;
    return { bitmap: img.toBitmap(), width: size.width, height: size.height };
  } finally {
    try { if (!win.isDestroyed() && !wc.isDestroyed()) wc.removeListener('paint', onPaint); } catch { /* */ }
    if (!ok) disposeRenderWindow(); // عند الخطأ نبدأ بنافذة جديدة في المرة القادمة
    fs.rm(tmp, { force: true }, () => {});
  }
}

/** صورة BGRA → أوامر ESC/POS نقطية (GS v 0) + تغذية وقص */
function rasterToEscPos({ bitmap, width, height }, { widthDots, offsetDots = 0, cut = true, threshold = 170, maxBand = 960 }) {
  const bytesPerRow = Math.ceil(widthDots / 8);
  // آخر سطر به حبر: لا نرسل البياض في نهاية الصورة
  const dark = (x, y) => {
    const i = (y * width + x) * 4;
    const b = bitmap[i], g = bitmap[i + 1], r = bitmap[i + 2], a = bitmap[i + 3];
    if (a !== undefined && a < 40) return false;
    return 0.299 * r + 0.587 * g + 0.114 * b < threshold;
  };
  let last = height - 1;
  outer: for (; last > 0; last--) for (let x = 0; x < width; x += 2) if (dark(x, last)) break outer;
  const rows = Math.min(height, last + 8);
  const out = [Buffer.from([0x1b, 0x40])]; // ESC @ تهيئة
  // أجزاء كبيرة متساوية (≤960 سطراً): الأجزاء الصغيرة كانت تجعل الطابعة تتوقف بعد كل شريط فتطبع ببطء وتقطّع
  const parts = Math.max(1, Math.ceil(rows / maxBand));
  const CHUNK = Math.ceil(rows / parts);
  for (let y0 = 0; y0 < rows; y0 += CHUNK) {
    const h = Math.min(CHUNK, rows - y0);
    const data = Buffer.alloc(bytesPerRow * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < width; x++) {
        const tx = x + offsetDots;
        if (tx < 0 || tx >= widthDots) continue;
        if (dark(x, y0 + y)) data[y * bytesPerRow + (tx >> 3)] |= 0x80 >> (tx & 7);
      }
    }
    out.push(Buffer.from([0x1d, 0x76, 0x30, 0x00, bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff]), data);
  }
  // تغذية حتى موضع القاطع ثم قص جزئي (GS V 66 n: يغذّي للقاطع تلقائياً + n نقطة) — أقل هدر بين الأوراق
  if (cut) out.push(Buffer.from([0x1d, 0x56, 0x42, 0x10]));
  else out.push(Buffer.from([0x1b, 0x64, 0x04]));
  return Buffer.concat(out);
}

/**
 * عرض رأس الطباعة بالنقاط حسب دقة الطابعة:
 *  - 203 نقطة/بوصة (معظم الطابعات: Xprinter، إبسون TM-T20/m30...): 80مم = 576 نقطة، 58مم = 384
 *  - 180 نقطة/بوصة (إبسون TM-T70/T88/T90...): 80مم = 512 نقطة، 58مم = 360
 * إرسال 576 نقطة لطابعة 512 يقصّ ≈9مم من يمين الورقة ويكبّر المحتوى.
 */
const EPSON_180 = /\bTM[-_ ]?(T70|T88|T90|L90|H6000|H5000|U220)/i;
function headFor(printer, opts = {}) {
  const paper58 = opts.paper ? String(opts.paper) === '58' : Number(opts.widthDots) === 384;
  const dpi = String(opts.dpi) === '180' ? 180 : String(opts.dpi) === '203' ? 203 : (EPSON_180.test(String(printer || '')) ? 180 : 203);
  const widthDots = dpi === 180 ? (paper58 ? 360 : 512) : (paper58 ? 384 : 576);
  return { widthDots, dpi };
}

function registerEscPosIpc({ isTrusted }) {
  setTimeout(warmRender, 3000);
  ipcMain.handle('print:escposHtml', async (e, opts = {}) => {
    if (!isTrusted(e)) throw new Error('untrusted');
    try {
      let printer = String(opts.printer || '');
      if (!printer) {
        const list = await e.sender.getPrintersAsync().catch(() => []);
        printer = (list.find((p) => p.isDefault) || {}).name || '';
        // قائمة Chromium فارغة (خدمة الطباعة متوقفة؟) → الطابعة الافتراضية من سجل ويندوز
        if (!printer) printer = await registryDefaultPrinter().catch(() => '');
      }
      if (!printer) return { ok: false, reason: 'لا توجد طابعة افتراضية في ويندوز — اختر الطابعة من شاشة الطابعات' };
      const { widthDots, dpi } = headFor(printer, opts);
      const img = await renderHtml(String(opts.html || ''), widthDots, Number(opts.cssWidthMm) || (widthDots <= 384 ? 48 : 72));
      const bytes = rasterToEscPos(img, { widthDots, offsetDots: Math.round((Number(opts.offsetMm) || 0) * dpi / 25.4), cut: opts.cut !== false });
      const copies = Math.max(1, Math.min(5, Number(opts.copies) || 1));
      // كل النسخ في مهمة طباعة واحدة (كل نسخة بقصّها) — أسرع من إرسال كل نسخة وحدها
      return await rawPrint(printer, copies > 1 ? Buffer.concat(Array(copies).fill(bytes)) : bytes);
    } catch (err) {
      return { ok: false, reason: String((err && err.message) || err).slice(0, 200) };
    }
  });
  /**
   * «ورق الطابعة»: نفس صورة الإيصال لكن عبر تعريف ويندوز (GDI) وبورقه الافتراضي — للطابعات التي لا تفهم
   * ESC/POS (CognitiveTPG…) أو لا تقبل المقاس المخصص. الصورة تُرسم على عرض منطقة الطباعة فلا تُقص.
   */
  ipcMain.handle('print:gdiHtml', async (e, opts = {}) => {
    if (!isTrusted(e)) throw new Error('untrusted');
    if (process.platform !== 'win32') return { ok: false, reason: 'unavailable' };
    try {
      const paper58 = String(opts.paper) === '58';
      const widthDots = paper58 ? 384 : 576;
      const cssWidthMm = Number(opts.cssWidthMm) || (paper58 ? 48 : 72);
      const img = await renderHtml(String(opts.html || ''), widthDots, cssWidthMm);
      const png = bitmapToBwPng(img, nativeImage);
      return await gdiPrint(String(opts.printer || ''), png, { contentMm: cssWidthMm, paperMm: paper58 ? 58 : 80, offsetMm: Number(opts.offsetMm) || 0, copies: Number(opts.copies) || 1 });
    } catch (err) {
      // تعذّر رسم الصورة — لم يُرسل شيء للطابعة: البرنامج يطبع بنافذة المتصفح بدلاً منها
      return { ok: false, reason: 'unavailable', detail: String((err && err.message) || err).slice(0, 200) };
    }
  });
  if (process.platform === 'win32') setTimeout(warmGdiPrinter, 6000);
  return { dispose: disposeRenderWindow };
}

module.exports = { registerEscPosIpc, rasterToEscPos, renderHtml, headFor };
