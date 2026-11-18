'use strict';
/**
 * طباعة صورة الإيصال عبر تعريف ويندوز (GDI) بورق الطابعة كما هو — تماماً مثل ورقة ويندوز التجريبية:
 *  - لا مقاس مخصص ولا A4: Electron يطلب A4 إن لم يُحدَّد مقاس، وبعض التعريفات (CognitiveTPG…) لا تقبل
 *    المقاس المخصص فلا تخرج أي ورقة.
 *  - الصورة تُرسم داخل منطقة الطباعة التي يعلنها التعريف: إن كانت أضيق من الإيصال تُصغَّر (لا قصّ أبداً)،
 *    وإن كانت بعرض الرول تُوسَّط، وإن كان ورق التعريف أعرض بكثير (A4) تُحاذى لبداية الورقة.
 *  - الإيصال الطويل يُكمَل على صفحات متتالية من ورق التعريف.
 * أداة صغيرة (exe) تُترجم مرة واحدة من مُترجم C# المدمج في ويندوز، واحتياطها PowerShell.
 */
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFile } = require('node:child_process');

const PS_BASE = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand'];
const ps = (script) => [...PS_BASE, Buffer.from(script, 'utf16le').toString('base64')];

/* الفئة المشتركة: args = الطابعة، ملف PNG، عرض المحتوى (مم)، عرض الرول (مم)، إزاحة (مم)، النسخ */
const GDI_CLASS = `using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Printing;
using System.Globalization;
public static class SlGdiPrn {
  public static string Print(string printer, string file, double contentMm, double paperMm, double offsetMm, int copies) {
    try {
      using (Image img = Image.FromFile(file)) {
        float cw = (float)(contentMm / 25.4 * 100), paper = (float)(paperMm / 25.4 * 100), off = (float)(offsetMm / 25.4 * 100);
        for (int c = 0; c < Math.Max(1, Math.Min(5, copies)); c++) {
          using (PrintDocument pd = new PrintDocument()) {
            if (printer.Length > 0) pd.PrinterSettings.PrinterName = printer;
            if (!pd.PrinterSettings.IsValid) return "InvalidPrinter";
            pd.DocumentName = "Smart Ledger";
            pd.PrintController = new StandardPrintController();
            float y = 0;
            int pages = 0;
            pd.PrintPage += delegate (object s, PrintPageEventArgs e) {
              Graphics g = e.Graphics;
              g.PageUnit = GraphicsUnit.Display;
              RectangleF pa = e.PageSettings.PrintableArea;
              float pw = pa.Width > 1 ? pa.Width : cw, ph = pa.Height > 1 ? pa.Height : 1100, w, x;
              if (pw <= cw + 1) { w = pw; x = 0; }
              else if (pw <= paper + 8) { w = cw; x = (pw - cw) / 2; }
              else { w = cw; x = 0; }
              x += off;
              float scale = w / img.Width;
              float srcH = Math.Min(img.Height - y, ph / scale);
              g.InterpolationMode = InterpolationMode.NearestNeighbor;
              g.PixelOffsetMode = PixelOffsetMode.Half;
              g.DrawImage(img, new RectangleF(x, 0, w, srcH * scale), new RectangleF(0, y, img.Width, srcH), GraphicsUnit.Pixel);
              y += srcH;
              pages++;
              e.HasMorePages = srcH > 0 && y < img.Height - 0.5f && pages < 60;
            };
            pd.Print();
          }
        }
      }
      return "";
    } catch (Exception ex) {
      return ex.GetType().Name + ": " + ex.Message.Replace("\\r", " ").Replace("\\n", " ");
    }
  }
}
`;
const GDI_CS = GDI_CLASS + `
public static class SlGdiMain {
  public static int Main(string[] a) {
    if (a.Length < 6) { Console.Out.Write("args"); return 3; }
    CultureInfo ci = CultureInfo.InvariantCulture;
    string e = SlGdiPrn.Print(a[0], a[1], double.Parse(a[2], ci), double.Parse(a[3], ci), double.Parse(a[4], ci), int.Parse(a[5], ci));
    if (e.Length == 0) return 0;
    Console.Out.Write(e);
    return 2;
  }
}
`;
const GDI_PS = `
$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
${GDI_CLASS}
"@
$ci = [Globalization.CultureInfo]::InvariantCulture
$r = [SlGdiPrn]::Print($env:SL_PRINTER, $env:SL_FILE, [double]::Parse($env:SL_CONTENT, $ci), [double]::Parse($env:SL_PAPER, $ci), [double]::Parse($env:SL_OFFSET, $ci), [int]$env:SL_COPIES)
if ($r -eq '') { 'OK' } else { 'FAIL ' + $r }
`;

let exePromise = null;
function ensureGdiExe() {
  if (process.platform !== 'win32') return Promise.resolve(null);
  if (exePromise) return exePromise;
  exePromise = new Promise((resolve) => {
    try {
      const { app } = require('electron');
      const dir = path.join(app.getPath('userData'), 'bin');
      const exe = path.join(dir, 'sl-gdiprint-1.exe');
      if (fs.existsSync(exe) && fs.statSync(exe).size > 1000) return resolve(exe);
      fs.mkdirSync(dir, { recursive: true });
      const src = path.join(dir, 'sl-gdiprint-1.cs');
      fs.writeFileSync(src, GDI_CS, 'utf8');
      const win = process.env.WINDIR || 'C:\\Windows';
      const cands = ['Framework64', 'Framework'].map((f) => path.join(win, 'Microsoft.NET', f, 'v4.0.30319', 'csc.exe')).filter((c) => fs.existsSync(c));
      if (!cands.length) return resolve(null);
      execFile(cands[0], ['/nologo', '/optimize+', '/target:exe', '/r:System.Drawing.dll', `/out:${exe}`, src], { windowsHide: true, timeout: 60000 }, (err) => {
        fs.rm(src, { force: true }, () => {});
        resolve(!err && fs.existsSync(exe) ? exe : null);
      });
    } catch { resolve(null); }
  }).then((r) => { if (!r) exePromise = null; return r; });
  return exePromise;
}
/** تجهيز الأداة مسبقاً حتى تخرج أول ورقة فوراً */
function warmGdiPrinter() { void ensureGdiExe(); }

/** رسالة واضحة من خطأ .NET */
function gdiReason(printer, detail) {
  const d = String(detail || '').trim();
  const name = String(printer || '') || 'الافتراضية';
  if (/InvalidPrinter/i.test(d)) return `الطابعة «${name}» غير موجودة في ويندوز — اخترها من جديد في شاشة الطابعات`;
  if (/spooler|1722|RPC server/i.test(d)) return 'خدمة الطباعة في ويندوز (Print Spooler) متوقفة أو معلّقة — شغّلها من شاشة الطابعات أو أعد تشغيل الجهاز';
  return `تعذرت الطباعة عبر تعريف «${name}»${d ? ` (${d.slice(0, 160)})` : ''}`;
}

/**
 * يطبع صورة PNG على الطابعة عبر تعريفها (بورقها الافتراضي).
 * @returns {Promise<{ok:boolean, reason?:string, detail?:string}>}
 */
function gdiPrint(printer, png, { contentMm = 72, paperMm = 80, offsetMm = 0, copies = 1 } = {}) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve({ ok: false, reason: 'unavailable', detail: 'windows-only' });
    const tmp = path.join(os.tmpdir(), `sl-gdi-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
    try { fs.writeFileSync(tmp, png); } catch (e) { return resolve({ ok: false, reason: String((e && e.message) || e) }); }
    const done = (r) => { fs.rm(tmp, { force: true }, () => {}); resolve(r); };
    const num = (v) => String(Number(v) || 0);
    const args = [String(printer || ''), tmp, num(contentMm), num(paperMm), num(offsetMm), String(Math.max(1, Math.min(5, Number(copies) || 1)))];
    const viaPs = () => execFile('powershell.exe', ps(GDI_PS), {
      windowsHide: true,
      timeout: 60000,
      // القيم عبر متغيرات البيئة: لا يُدمج اسم الطابعة في نص الأمر
      env: { ...process.env, SL_PRINTER: args[0], SL_FILE: tmp, SL_CONTENT: args[2], SL_PAPER: args[3], SL_OFFSET: args[4], SL_COPIES: args[5] },
    }, (err, stdout) => {
      const out = String(stdout || '').trim();
      if (/^OK/m.test(out)) return done({ ok: true });
      const fail = /FAIL\s+(.+)/.exec(out);
      if (fail) return done({ ok: false, reason: gdiReason(printer, fail[1]), detail: fail[1] });
      if (err && err.killed) return done({ ok: false, reason: gdiReason(printer, 'spooler timeout'), detail: 'timeout' });
      // PowerShell نفسه لم يعمل (سياسة/وضع لغة مقيّد…) — لم يُطبع شيء: البرنامج يطبع بنافذة المتصفح بدلاً منه
      done({ ok: false, reason: 'unavailable', detail: String((err && err.message) || out).slice(0, 200) });
    });
    ensureGdiExe().then((exe) => {
      if (!exe) return viaPs();
      execFile(exe, args, { windowsHide: true, timeout: 45000 }, (err, stdout) => {
        if (err && err.killed) return done({ ok: false, reason: gdiReason(printer, 'spooler timeout'), detail: 'timeout' });
        const code = err ? (typeof err.code === 'number' ? err.code : -1) : 0;
        if (code === 0) return done({ ok: true });
        if (code === 2) return done({ ok: false, reason: gdiReason(printer, stdout), detail: String(stdout || '').trim() });
        viaPs(); // الأداة لم تعمل → PowerShell
      });
    });
  });
}

/**
 * صورة BGRA → PNG أبيض/أسود حاد (الطابعة الحرارية نقطة سوداء أو لا شيء؛ الرمادي يُطبع منقّطاً)
 * مع حذف البياض في آخر الصورة.
 */
function bitmapToBwPng({ bitmap, width, height }, nativeImage, threshold = 170) {
  const lum = (i) => 0.299 * bitmap[i + 2] + 0.587 * bitmap[i + 1] + 0.114 * bitmap[i];
  const dark = (i) => (bitmap[i + 3] === undefined || bitmap[i + 3] >= 40) && lum(i) < threshold;
  let last = height - 1;
  outer: for (; last > 0; last--) for (let x = 0; x < width; x += 2) if (dark((last * width + x) * 4)) break outer;
  const rows = Math.max(1, Math.min(height, last + 16));
  const out = Buffer.alloc(width * rows * 4);
  for (let i = 0; i < width * rows * 4; i += 4) {
    const v = dark(i) ? 0 : 255;
    out[i] = v; out[i + 1] = v; out[i + 2] = v; out[i + 3] = 255;
  }
  return nativeImage.createFromBitmap(out, { width, height: rows }).toPNG();
}

module.exports = { gdiPrint, warmGdiPrinter, bitmapToBwPng, GDI_CS, GDI_PS };
