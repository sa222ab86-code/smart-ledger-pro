'use strict';
/**
 * أدوات طباعة ويندوز المشتركة (لا تعتمد على Chromium):
 *  - قائمة الطابعات من PowerShell أو من سجل ويندوز (يعمل حتى لو كانت خدمة الطباعة متوقفة)
 *  - حالة خدمة الطباعة (Print Spooler) وإصلاحها بصلاحية المسؤول
 */
const { execFile } = require('node:child_process');

const isWin = () => process.platform === 'win32';
const run = (file, args, timeout = 15000) => new Promise((resolve) => {
  execFile(file, args, { windowsHide: true, timeout, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }, (err, out, errOut) => resolve({ err, out: String(out || ''), errOut: String(errOut || '') }));
});
const short = (x) => String((x && (x.message || x)) || '').replace(/\s+/g, ' ').slice(0, 160);
/** سكربت PowerShell مُرمَّز (UTF-16LE base64) — بلا مشاكل علامات التنصيص في سطر الأوامر */
const powershell = (script, timeout) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], timeout);

async function listViaPowerShell() {
  if (!isWin()) return { list: [], error: 'windows-only' };
  const r = await powershell('[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-CimInstance Win32_Printer | Select-Object Name,Default | ConvertTo-Json -Compress');
  if (r.err) return { list: [], error: short(r.errOut || r.err) };
  try {
    const j = JSON.parse(r.out.trim() || '[]');
    return { list: [].concat(j).filter((p) => p && p.Name).map((p) => ({ name: p.Name, displayName: p.Name, isDefault: !!p.Default, description: '' })), error: '' };
  } catch (e) { return { list: [], error: short(e) }; }
}

/** الطابعة الافتراضية للمستخدم من السجل («الاسم,winspool,Ne01:») */
async function registryDefaultPrinter() {
  if (!isWin()) return '';
  const d = await run('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows', '/v', 'Device'], 8000);
  const m = /Device\s+REG_SZ\s+([^,\r\n]+)/i.exec(d.out);
  return m ? m[1].trim() : '';
}

async function listViaRegistry() {
  if (!isWin()) return { list: [], error: 'windows-only' };
  const names = new Set();
  let error = '';
  // طابعات المستخدم (ومنها طابعات الشبكة): «الاسم  REG_SZ  winspool,...»
  const u = await run('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Devices']);
  if (u.err) error = short(u.errOut || u.err);
  for (const line of u.out.split(/\r?\n/)) {
    const m = /^\s{2,}(.+?)\s{2,}REG_SZ\s{2,}/.exec(line);
    if (m) names.add(m[1].trim());
  }
  // طابعات الجهاز: مفاتيح فرعية بأسماء الطابعات
  const m2 = await run('reg.exe', ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Print\\Printers']);
  if (m2.err && !names.size) error = error || short(m2.errOut || m2.err);
  for (const line of m2.out.split(/\r?\n/)) {
    const m = /\\Print\\Printers\\(.+)$/i.exec(line.trim());
    if (m) names.add(m[1].trim());
  }
  const def = await registryDefaultPrinter();
  return { list: [...names].map((n) => ({ name: n, displayName: n, isDefault: n === def, description: '' })), error };
}

/* ---------------- خدمة الطباعة (Print Spooler) ---------------- */
const SC_STATES = { 1: 'stopped', 2: 'starting', 3: 'stopping', 4: 'running', 5: 'starting', 6: 'stopping', 7: 'paused' };
const SC_START = { AUTO_START: 'auto', DEMAND_START: 'manual', DISABLED: 'disabled', BOOT_START: 'auto', SYSTEM_START: 'auto' };

/** parse لمخرجات sc.exe (أسماء الحالات بالإنجليزية في كل لغات ويندوز، العناوين قد تُترجم) */
function parseSc(queryOut, qcOut) {
  const m = /\b([1-7])\s+(STOPPED|START_PENDING|STOP_PENDING|RUNNING|CONTINUE_PENDING|PAUSE_PENDING|PAUSED)\b/.exec(String(queryOut || ''));
  const t = /\b([0-4])\s+(BOOT_START|SYSTEM_START|AUTO_START|DEMAND_START|DISABLED)\b/.exec(String(qcOut || ''));
  return { state: m ? SC_STATES[m[1]] : '', startType: t ? SC_START[t[2]] : '' };
}

/** حالة الخدمة: running | stopped | starting | stopping | paused | unknown — ونوع التشغيل auto | manual | disabled */
async function spoolerStatus() {
  if (!isWin()) return { state: 'unknown', startType: '', detail: 'windows-only' };
  const [q, c] = await Promise.all([run('sc.exe', ['query', 'spooler'], 8000), run('sc.exe', ['qc', 'spooler'], 8000)]);
  let { state, startType } = parseSc(q.out, c.out);
  let detail = '';
  if (!state) {
    // احتياط: PowerShell (Get-Service)
    const p = await powershell("$s = Get-Service -Name Spooler -ErrorAction Stop; '' + $s.Status + '|' + $s.StartType", 15000);
    const pm = /^(\w+)\|(\w+)/m.exec(p.out.trim());
    if (pm) {
      state = { Running: 'running', Stopped: 'stopped', StartPending: 'starting', ContinuePending: 'starting', StopPending: 'stopping', PausePending: 'stopping', Paused: 'paused' }[pm[1]] || 'unknown';
      startType = startType || ({ Automatic: 'auto', Manual: 'manual', Disabled: 'disabled', Boot: 'auto', System: 'auto' }[pm[2]] || '');
    } else {
      state = 'unknown';
      detail = short(q.errOut || q.out || (q.err && q.err.message) || p.errOut);
    }
  }
  return { state, startType, detail };
}

/**
 * إصلاح خدمة الطباعة (يطلب صلاحية المسؤول عبر رسالة ويندوز UAC):
 * تشغيل تلقائي ← إيقاف (أو إنهاء إن كانت معلّقة) ← حذف الطباعات العالقة ← تشغيل.
 * حذف الطباعات العالقة مقصود: ملف طباعة تالف هو أشهر سبب لتوقف الخدمة،
 * ويمنع خروج سيل من الإيصالات القديمة بعد عودة الخدمة.
 */
async function repairSpooler() {
  if (!isWin()) return { ok: false, reason: 'متاح في ويندوز فقط' };
  const steps = [
    'sc config spooler start= auto',
    'net stop spooler /y',
    'taskkill /f /im spoolsv.exe',
    'del /q /f "%SystemRoot%\\System32\\spool\\PRINTERS\\*.*"',
    'net start spooler',
  ].join(' & ');
  const script = [
    '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
    '$ErrorActionPreference = "Stop"',
    `try { Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\\cmd.exe') -ArgumentList '/c ${steps}' -Verb RunAs -WindowStyle Hidden -Wait; 'DONE' }`,
    // 1223 = ERROR_CANCELLED (ضغط «لا» في رسالة صلاحية المسؤول)
    "catch { $c = 0; $ie = $_.Exception.InnerException; if ($ie -and $ie.NativeErrorCode) { $c = $ie.NativeErrorCode }; 'ERR ' + $c + ' ' + $_.Exception.Message }",
  ].join('\n');
  const r = await powershell(script, 120000);
  const out = r.out.trim();
  if (!/^DONE/m.test(out)) {
    const em = /ERR\s+(-?\d+)\s+([\s\S]*)/.exec(out);
    const code = em ? Number(em[1]) : 0;
    const msg = em ? short(em[2]) : short(r.errOut || r.err || out);
    const cancelled = code === 1223 || /cancel/i.test(msg);
    return { ok: false, cancelled, reason: cancelled ? 'لم تتم الموافقة على صلاحية المسؤول — أعد المحاولة واضغط «نعم» في رسالة ويندوز' : `تعذّر الإصلاح: ${msg || 'خطأ غير معروف'}` };
  }
  // الخدمة تحتاج لحظة حتى تستقبل الطلبات
  let st = await spoolerStatus();
  for (let i = 0; i < 6 && st.state !== 'running'; i++) {
    await new Promise((res) => setTimeout(res, 1000));
    st = await spoolerStatus();
  }
  return st.state === 'running'
    ? { ok: true, reason: '', status: st }
    : { ok: false, reason: `الخدمة لم تعمل بعد الإصلاح (الحالة: ${st.state}${st.startType === 'disabled' ? '، معطّلة' : ''}) — أعد تشغيل الجهاز`, status: st };
}

module.exports = { run, short, powershell, listViaPowerShell, listViaRegistry, registryDefaultPrinter, spoolerStatus, repairSpooler, parseSc };
