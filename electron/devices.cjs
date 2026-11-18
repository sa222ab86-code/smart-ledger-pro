'use strict';
/**
 * أجهزة نقطة البيع: درج النقود (ESC/POS عبر طابعة الإيصالات)، الميزان الإلكتروني (منفذ COM)،
 * وشاشة العميل (نافذة على الشاشة الثانية).
 * لا تحتاج وحدات أصلية (native): الدرج والميزان عبر PowerShell و.NET المدمجين في ويندوز.
 */
const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { registryDefaultPrinter } = require('./winprint.cjs');

const PS_BASE = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand'];
/** السكربت مُرمّز Base64 (UTF-16LE) لتفادي مشاكل علامات التنصيص والأسطر في سطر الأوامر */
const ps = (script) => [...PS_BASE, Buffer.from(script, 'utf16le').toString('base64')];

/* ----------------------------- طباعة خام RAW ----------------------------- */
/* فئة C# واحدة (للأداة المترجمة ولاحتياط PowerShell): ترسل البيانات كما هي للطابعة،
 * وعند الفشل تعيد الخطوة ورمز خطأ ويندوز (مثل OpenPrinter:1722 = خدمة الطباعة متوقفة) */
const RAW_CLASS = `using System;
using System.Runtime.InteropServices;
public class SlRawPrn {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName; [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] public static extern int StartDocPrinter(IntPtr h, int level, [In] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool WritePrinter(IntPtr h, byte[] b, int c, out int w);
  public static string SendErr(string name, byte[] bytes) {
    IntPtr h;
    if (!OpenPrinter(name, out h, IntPtr.Zero)) { return "OpenPrinter:" + Marshal.GetLastWin32Error(); }
    string err = "";
    DOCINFO di = new DOCINFO();
    di.pDocName = "Smart Ledger";
    di.pDataType = "RAW";
    if (StartDocPrinter(h, 1, di) != 0) {
      if (StartPagePrinter(h)) {
        int w;
        if (!WritePrinter(h, bytes, bytes.Length, out w)) { err = "WritePrinter:" + Marshal.GetLastWin32Error(); }
        else if (w != bytes.Length) { err = "WritePrinter:partial"; }
        EndPagePrinter(h);
      } else { err = "StartPagePrinter:" + Marshal.GetLastWin32Error(); }
      EndDocPrinter(h);
    } else { err = "StartDocPrinter:" + Marshal.GetLastWin32Error(); }
    ClosePrinter(h);
    return err;
  }
  public static bool Send(string name, byte[] bytes) { return SendErr(name, bytes).Length == 0; }
}
`;
const RAW_PS = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
${RAW_CLASS}
"@
`;
const RAW_ONCE = RAW_PS + `
$bytes = [System.IO.File]::ReadAllBytes($env:SL_FILE)
$r = [SlRawPrn]::SendErr($env:SL_PRINTER, $bytes)
if ($r -eq '') { 'OK' } else { 'FAIL ' + $r }
`;
/* أداة إرسال خام صغيرة (exe) تُترجم مرة واحدة من مُترجم C# المدمج في ويندوز (.NET Framework) —
 * تشغيلها يستغرق أجزاء من الثانية بدل ثانيتين لتشغيل PowerShell وترجمة الواجهة مع كل ورقة.
 * إن تعذّرت (مُترجم غير موجود/منعها مضاد الفيروسات) نرجع تلقائياً لطريقة PowerShell. */
const RAW_CS = RAW_CLASS + `
public static class SlRawMain {
  public static int Main(string[] a) {
    try {
      string e = SlRawPrn.SendErr(a[0], System.IO.File.ReadAllBytes(a[1]));
      if (e.Length == 0) return 0;
      Console.Out.Write(e);
      return 2;
    } catch (Exception ex) { Console.Out.Write("EX:" + ex.Message); return 3; }
  }
}
`;

/** رمز خطأ ويندوز → رسالة واضحة للكاشير */
function rawReason(printer, detail) {
  const d = String(detail || '').trim();
  const code = Number((/:(\d+)/.exec(d) || [])[1]) || 0;
  const name = String(printer || '');
  if ([1722, 1726, 1753, 1717, 1702, 1706, 1727, 1764].includes(code)) {
    return 'خدمة الطباعة في ويندوز (Print Spooler) متوقفة أو معلّقة — شغّلها من شاشة الطابعات أو أعد تشغيل الجهاز';
  }
  if (code === 1801 || code === 1905 || code === 2) return `الطابعة «${name}» غير موجودة في ويندوز — اخترها من جديد في شاشة الطابعات`;
  if (code === 1804) return `الطابعة «${name}» لا تقبل الطباعة الحرارية المباشرة (تعريفها من نوع v4) — اختر «تعريف ويندوز» في طريقة الطباعة بشاشة الطابعات أو ثبّت تعريفها الأصلي من الشركة المصنّعة`;
  if (code === 5) return `لا توجد صلاحية للطباعة على «${name}»`;
  if (code === 1906 || code === 6) return `الطابعة «${name}» لا تستجيب — تأكد أنها مشغّلة وموصولة`;
  return `تعذر الإرسال للطابعة «${name}»${d ? ` (${d})` : ''}`;
}

let exePromise = null;
function ensureRawExe() {
  if (process.platform !== 'win32') return Promise.resolve(null);
  if (exePromise) return exePromise;
  exePromise = new Promise((resolve) => {
    try {
      const fs = require('node:fs');
      const { app } = require('electron');
      const dir = path.join(app.getPath('userData'), 'bin');
      const exe = path.join(dir, 'sl-rawprint-2.exe');
      if (fs.existsSync(exe) && fs.statSync(exe).size > 1000) return resolve(exe);
      fs.mkdirSync(dir, { recursive: true });
      const src = path.join(dir, 'sl-rawprint-2.cs');
      fs.writeFileSync(src, RAW_CS, 'utf8');
      const win = process.env.WINDIR || 'C:\\Windows';
      const cands = ['Framework64', 'Framework'].map((f) => path.join(win, 'Microsoft.NET', f, 'v4.0.30319', 'csc.exe')).filter((c) => fs.existsSync(c));
      if (!cands.length) return resolve(null);
      execFile(cands[0], ['/nologo', '/optimize+', '/target:exe', `/out:${exe}`, src], { windowsHide: true, timeout: 60000 }, (err) => {
        fs.rm(src, { force: true }, () => {});
        resolve(!err && fs.existsSync(exe) ? exe : null);
      });
    } catch { resolve(null); }
  }).then((r) => { if (!r) exePromise = null; return r; });
  return exePromise;
}
/** تجهيز الأداة مسبقاً عند بدء البرنامج حتى تخرج أول ورقة فوراً */
function warmRawPrinter() { void ensureRawExe(); }

function rawPrint(printerName, bytes) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve({ ok: false, reason: 'windows-only' });
    // البيانات في ملف مؤقت (صورة التذكرة قد تتجاوز حد متغيرات البيئة)
    const tmp = path.join(require('node:os').tmpdir(), `sl-raw-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
    try { require('node:fs').writeFileSync(tmp, Buffer.from(bytes)); } catch (e) { return resolve({ ok: false, reason: String(e.message || e) }); }
    const fs = require('node:fs');
    ensureRawExe().then((exe) => {
      if (!exe) return once();
      execFile(exe, [String(printerName), tmp], { windowsHide: true, timeout: 20000 }, (err, stdout) => {
        if (err && err.killed) {
          // الأداة علقت 20 ثانية بانتظار ويندوز: خدمة الطباعة معلّقة — لا فائدة من محاولة PowerShell (ستعلق أيضاً)
          fs.rm(tmp, { force: true }, () => {});
          return resolve({ ok: false, reason: rawReason(printerName, 'OpenPrinter:1722'), detail: 'timeout' });
        }
        const code = err ? (typeof err.code === 'number' ? err.code : -1) : 0;
        if (code === 0) { fs.rm(tmp, { force: true }, () => {}); return resolve({ ok: true, reason: '' }); }
        if (code === 2) { fs.rm(tmp, { force: true }, () => {}); return resolve({ ok: false, reason: rawReason(printerName, stdout), detail: String(stdout || '').trim() }); }
        once(); // الأداة لم تعمل → PowerShell
      });
    });
    const once = () => execFile('powershell.exe', ps(RAW_ONCE), {
      windowsHide: true,
      timeout: 30000,
      // القيم عبر متغيرات البيئة: لا يُدمج اسم الطابعة في نص الأمر
      env: { ...process.env, SL_PRINTER: String(printerName), SL_FILE: tmp },
    }, (err, stdout) => {
      require('node:fs').rm(tmp, { force: true }, () => {});
      if (err) return resolve({ ok: false, reason: String(err.message || err).slice(0, 200) });
      const out = String(stdout || '').trim();
      if (/^OK/m.test(out)) return resolve({ ok: true, reason: '' });
      const detail = (/FAIL\s+(.+)/.exec(out) || [])[1] || out;
      resolve({ ok: false, reason: rawReason(printerName, detail), detail });
    });
  });
}

/* ----------------------------- الميزان (COM) ----------------------------- */
const SCALE_PS = `
$ErrorActionPreference = 'Stop'
$parity = [System.IO.Ports.Parity]::$($env:SL_PARITY)
$p = New-Object System.IO.Ports.SerialPort $env:SL_PORT, ([int]$env:SL_BAUD), $parity, ([int]$env:SL_BITS), ([System.IO.Ports.StopBits]::One)
$p.ReadTimeout = 500
$p.DtrEnable = $true
$p.RtsEnable = $true
$p.Open()
[Console]::Out.WriteLine('#OPEN')
$cmd = $env:SL_CMD
$iv = [int]$env:SL_INTERVAL
while ($true) {
  if ($cmd -eq 'ENQ') { $p.Write([byte[]](5), 0, 1) }
  elseif ($cmd) { $p.Write($cmd + [char]13) }
  Start-Sleep -Milliseconds $iv
  $s = $p.ReadExisting()
  if ($s) { [Console]::Out.WriteLine(($s -replace '[\\x00-\\x1F]+', '|')); [Console]::Out.Flush() }
}
`;

/* ------------------- شاشة العميل التسلسلية (VFD/POLE) -------------------
 * شاشة سطرين × 20 حرفاً تتصل بمنفذ COM (CD5220 أو ESC/POS أو نص خام).
 * نُبقي منفذاً مفتوحاً ونكتب عليه البايتات القادمة من الواجهة (base64 عبر stdin)
 * فلا نشغّل عملية جديدة مع كل تحديث.
 */
const VFD_PS = `
$ErrorActionPreference = 'Stop'
$parity = [System.IO.Ports.Parity]::$($env:SL_PARITY)
$p = New-Object System.IO.Ports.SerialPort $env:SL_PORT, ([int]$env:SL_BAUD), $parity, ([int]$env:SL_BITS), ([System.IO.Ports.StopBits]::One)
$p.DtrEnable = $true
$p.RtsEnable = $true
$p.Open()
[Console]::Out.WriteLine('#OPEN')
[Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  if ($line.Length -eq 0) { continue }
  $b = [Convert]::FromBase64String($line)
  $p.Write($b, 0, $b.Length)
}
try { $p.Close() } catch {}
`;

function registerDevicesIpc({ getWindow, isTrusted }) {
  const guard = (e) => { if (!isTrusted(e)) throw new Error('untrusted'); };

  /* -------- درج النقود -------- */
  ipcMain.handle('drawer:open', async (e, opts = {}) => {
    guard(e);
    let name = String(opts.printer || '');
    if (!name) {
      const list = await e.sender.getPrintersAsync().catch(() => []);
      name = (list.find((p) => p.isDefault) || list[0] || {}).name || '';
      if (!name) name = await registryDefaultPrinter().catch(() => '');
    }
    if (!name) return { ok: false, reason: 'لا توجد طابعة إيصالات — اختر طابعة الدرج من شاشة الطابعات' };
    const pin = Number(opts.pin) === 1 ? 1 : 0;
    // ESC p m t1 t2 — نبضة فتح الدرج المتصل بمنفذ RJ11 في طابعة الإيصالات
    return rawPrint(name, [0x1b, 0x70, pin, 0x19, 0xfa]);
  });

  /* -------- الميزان -------- */
  let scaleProc = null;
  const send = (ch, data) => { const w = getWindow(); if (w && !w.isDestroyed()) w.webContents.send(ch, data); };
  const stopScale = () => { if (scaleProc) { try { scaleProc.kill(); } catch { /* */ } scaleProc = null; } };

  /**
   * منافذ COM مع أسماء أجهزتها: GetPortNames يعطي الأرقام فقط (COM1, COM3)
   * فلا يعرف المستخدم أيها ميزانه. نضمّ إليها أسماء الأجهزة من إدارة الأجهزة.
   */
  const PORTS_PS = `
$names = @()
try { $names = [System.IO.Ports.SerialPort]::GetPortNames() } catch {}
$map = @{}
try {
  Get-CimInstance Win32_PnPEntity -ErrorAction Stop | Where-Object { $_.Name -match '\((COM\d+)\)' } | ForEach-Object {
    if ($_.Name -match '\((COM\d+)\)') { $map[$Matches[1]] = ($_.Name -replace '\s*\(COM\d+\)\s*$','') }
  }
} catch {}
foreach ($k in $map.Keys) { if ($names -notcontains $k) { $names += $k } }
$names | Sort-Object { [int]($_ -replace '\D','') } | ForEach-Object { "$_|" + $map[$_] }
`;
  ipcMain.handle('scale:ports', (e) => {
    guard(e);
    return new Promise((resolve) => {
      if (process.platform !== 'win32') return resolve([]);
      execFile('powershell.exe', ps(PORTS_PS), { windowsHide: true, timeout: 15000 }, (err, out) => {
        if (err) return resolve([]);
        const list = String(out).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
          const i = l.indexOf('|');
          const port = (i < 0 ? l : l.slice(0, i)).trim();
          const label = i < 0 ? '' : l.slice(i + 1).trim();
          return { port, label };
        }).filter((x) => /^COM\d+$/i.test(x.port));
        resolve(list);
      });
    });
  });

  ipcMain.handle('scale:start', (e, cfg = {}) => {
    guard(e);
    stopScale();
    if (process.platform !== 'win32') return { ok: false, reason: 'windows-only' };
    const port = String(cfg.port || '').toUpperCase();
    if (!/^COM\d{1,3}$/.test(port)) return { ok: false, reason: 'اسم منفذ غير صالح' };
    const cmd = ['W', 'P', 'S', 'ENQ'].includes(cfg.command) ? cfg.command : '';
    scaleProc = spawn('powershell.exe', ps(SCALE_PS), {
      windowsHide: true,
      env: {
        ...process.env,
        SL_PORT: port,
        SL_BAUD: String(Math.max(1200, Math.min(115200, Number(cfg.baud) || 9600))),
        SL_BITS: Number(cfg.dataBits) === 7 ? '7' : '8',
        SL_PARITY: ['None', 'Even', 'Odd'].includes(cfg.parity) ? cfg.parity : 'None',
        SL_CMD: cmd,
        SL_INTERVAL: String(Math.max(100, Math.min(3000, Number(cfg.intervalMs) || 300))),
      },
    });
    const proc = scaleProc;
    let buf = '';
    proc.stdout.on('data', (d) => {
      buf += d.toString('utf8');
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() || '';
      for (const l of lines) {
        if (l === '#OPEN') send('scale:status', { connected: true, port });
        else if (l.trim()) send('scale:data', l);
      }
    });
    let errText = '';
    proc.stderr.on('data', (d) => { errText += d.toString('utf8'); });
    proc.on('exit', () => {
      if (scaleProc === proc) scaleProc = null;
      const reason = /does not exist|not exist|غير موجود/i.test(errText) ? `المنفذ ${port} غير موجود`
        : /denied|in use|مرفوض/i.test(errText) ? `المنفذ ${port} مستخدم من برنامج آخر` : errText.trim().split('\n')[0]?.slice(0, 160) || '';
      send('scale:status', { connected: false, port, reason });
    });
    return { ok: true };
  });

  ipcMain.handle('scale:stop', (e) => { guard(e); stopScale(); return { ok: true }; });

  /* -------- شاشة العميل -------- */
  let displayWin = null;
  let lastState = null;

  ipcMain.handle('display:open', (e, opts = {}) => {
    guard(e);
    if (displayWin && !displayWin.isDestroyed()) { displayWin.showInactive(); try { displayWin.setSkipTaskbar(true); } catch { /* */ } return { ok: true, secondary: true }; }
    const primary = screen.getPrimaryDisplay();
    const other = screen.getAllDisplays().find((d) => d.id !== primary.id);
    const target = other || primary;
    const b = target.bounds;
    displayWin = new BrowserWindow({
      x: other ? b.x : b.x + 40,
      y: other ? b.y : b.y + 40,
      width: other ? b.width : 1024,
      height: other ? b.height : 600,
      fullscreen: !!other && opts.windowed !== true,
      frame: !other,
      autoHideMenuBar: true,
      focusable: !other,
      // لا تظهر في شريط المهام ولا في معاينة أيقونة البرنامج
      skipTaskbar: true,
      title: 'شاشة العميل',
      backgroundColor: '#0b2a2a',
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'display-preload.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    displayWin.setMenu(null);
    displayWin.loadFile(path.join(__dirname, 'customer-display.html'));
    displayWin.once('ready-to-show', () => { displayWin.showInactive(); try { displayWin.setSkipTaskbar(true); } catch { /* */ } if (lastState) displayWin.webContents.send('display:state', lastState); });
    displayWin.webContents.on('did-finish-load', () => { if (lastState) displayWin.webContents.send('display:state', lastState); });
    displayWin.on('closed', () => { displayWin = null; });
    // الشاشة الرئيسية تبقى في المقدمة للكاشير
    const main = getWindow();
    if (main && !main.isDestroyed()) setTimeout(() => main.focus(), 300);
    return { ok: true, secondary: !!other };
  });

  ipcMain.handle('display:close', (e) => {
    guard(e);
    if (displayWin && !displayWin.isDestroyed()) displayWin.close();
    displayWin = null;
    return { ok: true };
  });

  ipcMain.on('display:update', (e, state) => {
    if (!isTrusted(e)) return;
    lastState = state;
    if (displayWin && !displayWin.isDestroyed()) displayWin.webContents.send('display:state', state);
  });

  ipcMain.handle('display:info', (e) => {
    guard(e);
    return { displays: screen.getAllDisplays().length, open: !!(displayWin && !displayWin.isDestroyed()) };
  });

  // تشغيل عامل الطباعة الخام مسبقاً حتى تخرج أول تذكرة مطبخ بلا تأخير
  setTimeout(warmRawPrinter, 4000);
  /* -------- شاشة العميل التسلسلية (VFD) -------- */
  let vfdProc = null;
  let vfdReady = false;
  const stopVfd = () => { if (vfdProc) { try { vfdProc.stdin.end(); vfdProc.kill(); } catch { /* */ } vfdProc = null; vfdReady = false; } };

  ipcMain.handle('vfd:start', (e, cfg = {}) => {
    guard(e);
    stopVfd();
    if (process.platform !== 'win32') return { ok: false, reason: 'windows-only' };
    const port = String(cfg.port || 'COM1');
    vfdProc = spawn('powershell.exe', ps(VFD_PS), {
      windowsHide: true,
      env: { ...process.env, SL_PORT: port, SL_BAUD: String(cfg.baud || 9600), SL_BITS: String(cfg.dataBits || 8), SL_PARITY: cfg.parity || 'None' },
    });
    const proc = vfdProc;
    let err = '';
    proc.stdout.on('data', (d) => { if (String(d).includes('#OPEN')) { vfdReady = true; send('vfd:status', { connected: true, port }); } });
    proc.stderr.on('data', (d) => { err += String(d); });
    proc.on('close', () => {
      if (vfdProc === proc) { vfdProc = null; vfdReady = false; }
      const reason = (err.split(/\r?\n/).find((l) => l.trim()) || '').slice(0, 160);
      send('vfd:status', { connected: false, port, reason });
    });
    return { ok: true, port };
  });

  ipcMain.handle('vfd:stop', (e) => { guard(e); stopVfd(); return { ok: true }; });

  /** كتابة بايتات خام على الشاشة (تُبنى في الواجهة حسب البروتوكول) */
  ipcMain.handle('vfd:write', (e, bytes) => {
    guard(e);
    if (!vfdProc || !vfdReady || !Array.isArray(bytes) || !bytes.length) return { ok: false };
    try { vfdProc.stdin.write(Buffer.from(bytes).toString('base64') + '\n'); return { ok: true }; }
    catch { return { ok: false }; }
  });

  return { dispose: () => { stopScale(); stopVfd(); if (displayWin && !displayWin.isDestroyed()) displayWin.destroy(); } };
}

module.exports = { registerDevicesIpc, rawPrint, warmRawPrinter, rawReason };
