'use strict';
/**
 * ترخيص البرنامج (بدون إنترنت):
 *  - رمز الجهاز: بصمة من معرّف ويندوز الثابت (MachineGuid)
 *  - كشف استنساخ ويندوز (من 2.2.71): تُحفظ بصمة العتاد (اللوحة الأم + القرص الفعلي) موقّعةً بجانب
 *    الترخيص. نسخ القرص إلى جهاز آخر ينقل MachineGuid والترخيص معاً، لكن العتاد يختلف: إذا اختلفت
 *    القطعتان معاً يُعدّ الجهاز نسخة، فيتوقف الترخيص المنقول ويظهر للجهاز رمز جديد خاص به.
 *    تغيير قطعة واحدة (قرص أو لوحة) لا يقفل، وتُحدَّث البصمة تلقائياً.
 *  - مفتاح الترخيص: بيانات JSON موقّعة بـ Ed25519 بالمفتاح الخاص للمطوّر (لا يوجد داخل البرنامج)،
 *    والبرنامج يتحقق بالمفتاح العام فقط: electron/license-public.pem
 *  - الأنواع: سنوي (له تاريخ انتهاء) / شراء كامل (بلا انتهاء) — ويحدد المفتاح الأجهزة المسموحة
 *  - تجربة مجانية 7 أيام من أول تشغيل، مع حماية من إرجاع ساعة الجهاز للخلف
 *
 * حمولة المفتاح v2 (من 2026-11-16): تضيف حقلين اختياريين على v1
 *  - f:  المزايا المرخّصة، مثل ["zatca"] للفاتورة الإلكترونية
 *  - fx: تاريخ انتهاء كل ميزة على حدة، مثل { zatca: '2027-11-16' } — غيابه = مع عمر الترخيص.
 *        فيمكن بيع «شراء كامل» للبرنامج واشتراك سنوي للفاتورة الإلكترونية وحدها.
 *  - mv: أقل نسخة من البرنامج تقبل هذا المفتاح
 * النسخ القديمة ترفض v2 من نفسها (شرطها data.v !== 1)، فلا يُفعَّل مفتاح جديد على
 * نسخة قديمة، بينما مفاتيح v1 تبقى تعمل هنا وهناك فلا يتأثر عميل سابق.
 */
const { app, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync, execFile } = require('node:child_process');

const TRIAL_DAYS = 7;
/** المفاتيح الصادرة قبل هذا التاريخ تحتفظ بالفاتورة الإلكترونية (ميزة مكتسبة) */
const FEATURES_FROM = '2026-11-16';
const ALL_FEATURES = ['zatca'];
/** مهلة بعد انتهاء اشتراك الميزة تبقى فيها تعمل (تنبيه أصفر ثم أحمر في نصفها) */
const FEATURE_GRACE_DAYS = 30;
const REG_KEY = 'HKCU\\Software\\SmartLedger';
const DAY = 86400000;

const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

/* ------------------------------ رمز الجهاز ------------------------------ */
let cachedCode = null;
function rawMachineId() {
  if (process.platform === 'win32') {
    try {
      const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { encoding: 'utf8', windowsHide: true, timeout: 8000 });
      const m = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/);
      if (m) return m[1].toLowerCase();
    } catch { /* نكمل للبديل */ }
  }
  // بديل: اسم الجهاز + أول عنوان MAC حقيقي
  const macs = Object.values(os.networkInterfaces()).flat().filter((n) => n && !n.internal && n.mac && n.mac !== '00:00:00:00:00:00').map((n) => n.mac).sort();
  return `${os.hostname()}|${macs[0] || ''}`;
}
const fmtCode = (h) => h.toUpperCase().slice(0, 20).match(/.{5}/g).join('-');
/** الرمز الأساسي (من MachineGuid) — هو رمز كل جهاز ما لم يُكتشف أنه نسخة */
function baseCode() {
  if (cachedCode) return cachedCode;
  cachedCode = fmtCode(crypto.createHash('sha256').update(`smart-ledger|${rawMachineId()}`).digest('hex'));
  return cachedCode;
}
const normCode = (s) => String(s || '').toUpperCase().replace(/[^0-9A-F]/g, '');

/* ---------------------- بصمة العتاد (كشف استنساخ ويندوز) ---------------------- */
// قيم لا تميّز جهازاً (لوحات رخيصة/أجهزة افتراضية تكتبها كما هي) — تُتجاهل
const JUNK = /^(|0+|none|null|default string|default|to be filled by o\.?e\.?m\.?|system serial number|not specified|not applicable|n\/a|serial|base board serial number|123456789|1234567890|f+)$/i;
const JUNK_UUID = /^(0{8}-0{4}-0{4}-0{4}-0{12}|f{8}-f{4}-f{4}-f{4}-f{12}|03000200-0400-0500-0006-000700080009)$/i;
const HW_PS = `$ErrorActionPreference='SilentlyContinue'
$u=(Get-CimInstance Win32_ComputerSystemProduct).UUID
$b=(Get-CimInstance Win32_BaseBoard).SerialNumber
$sd=$env:SystemDrive
$d=''
$p=Get-CimInstance -Query ("ASSOCIATORS OF {Win32_LogicalDisk.DeviceID='" + $sd + "'} WHERE AssocClass=Win32_LogicalDiskToPartition") | Select-Object -First 1
if ($p) { $dd=Get-CimInstance -Query ("ASSOCIATORS OF {Win32_DiskPartition.DeviceID='" + $p.DeviceID + "'} WHERE AssocClass=Win32_DiskDriveToDiskPartition") | Select-Object -First 1; if ($dd) { $d=$dd.SerialNumber } }
Write-Output ("U=" + $u)
Write-Output ("B=" + $b)
Write-Output ("D=" + $d)`;
const HW_ARGS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(HW_PS, 'utf16le').toString('base64')];
const hwHash = (v) => (v ? crypto.createHash('sha256').update(`slhw|${v}`).digest('hex').slice(0, 24) : '');
function parseHw(out) {
  const get = (k) => ((String(out || '').match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1] || '').trim();
  const u = get('U').toLowerCase(), b = get('B'), d = get('D');
  const board = [u && !JUNK_UUID.test(u) ? u : '', b && !JUNK.test(b) ? b.toUpperCase() : ''].filter(Boolean).join('|');
  const disk = d && !JUNK.test(d) ? d.toUpperCase() : '';
  return { b: hwHash(board), d: hwHash(disk) };
}
let cachedHw = null;
/** قراءة مسبقة بلا انتظار عند بدء البرنامج (تستغرق ثانية تقريباً) */
function prefetchHardware() {
  if (cachedHw || process.platform !== 'win32') return;
  try { execFile('powershell.exe', HW_ARGS, { windowsHide: true, timeout: 20000 }, (err, out) => { if (!err && !cachedHw) cachedHw = parseHw(out); }); } catch { /* */ }
}
function hardwareIds() {
  if (cachedHw) return cachedHw;
  if (process.platform !== 'win32') { cachedHw = { b: '', d: '' }; return cachedHw; }
  try { cachedHw = parseHw(execFileSync('powershell.exe', HW_ARGS, { encoding: 'utf8', windowsHide: true, timeout: 20000 })); }
  catch { return { b: '', d: '' }; } // فشل مؤقت: لا نحفظه حتى يُعاد المحاولة لاحقاً
  return cachedHw;
}

// البصمة المحفوظة موقّعة حتى لا تُكتب يدوياً، وتُحفظ في 3 أماكن (ملف + سجل ويندوز + قاعدة البيانات)
const HW_SECRET = 'sl-hw-anchor-7f3c91e4b25d';
const anchorSig = (a) => crypto.createHmac('sha256', HW_SECRET).update(`${a.b}|${a.d}|${normCode(a.code)}`).digest('hex').slice(0, 32);
const validAnchor = (a) => !!a && typeof a === 'object' && typeof a.code === 'string' && normCode(a.code).length === 20 && a.sig === anchorSig(a);
const anchorToReg = (a) => `${a.b}.${a.d}.${normCode(a.code)}.${a.sig}`;
function anchorFromReg(v) {
  const p = String(v || '').split('.');
  if (p.length !== 4) return null;
  return { b: p[0], d: p[1], code: p[2] ? fmtCode(p[2]) : '', sig: p[3] };
}
function readAnchor() {
  for (const a of [readState().hw, anchorFromReg(regGet('HwAnchor')), dbGet('hw')]) if (validAnchor(a)) return a;
  return null;
}
let syncedSig = '';
function saveAnchor(hw, code) {
  const a = { b: hw.b || '', d: hw.d || '', code: fmtCode(normCode(code)) };
  a.sig = anchorSig(a);
  if (syncedSig === a.sig && (readState().hw || {}).sig === a.sig) return a; // محفوظة في الأماكن الثلاثة منذ قليل
  syncedSig = a.sig;
  const st = readState();
  if (!validAnchor(st.hw) || st.hw.sig !== a.sig) writeState({ ...st, hw: a });
  const reg = anchorToReg(a);
  if (regGet('HwAnchor') !== reg) regSet('HwAnchor', reg);
  const db = dbGet('hw');
  if (!validAnchor(db) || db.sig !== a.sig) dbSet('hw', a);
  return a;
}
/** رمز خاص بالجهاز المستنسخ: MachineGuid نفسه + عتاده الحالي */
const cloneCode = (hw) => fmtCode(crypto.createHash('sha256').update(`smart-ledger|${rawMachineId()}|${hw.b}|${hw.d}`).digest('hex'));

/**
 * رمز الجهاز الفعلي + هل هو نسخة من جهاز آخر.
 * - أول تشغيل: تُحفظ البصمة مع الرمز الأساسي.
 * - اختلاف القطعتين معاً (من المعروفتين) = نسخة → رمز جديد من عتاده ولا يُحفظ حتى يُفعَّل مفتاح له.
 * - اختلاف قطعة واحدة = صيانة → تُحدَّث البصمة ويبقى الرمز كما هو.
 */
function deviceIdentity() {
  const hw = hardwareIds();
  const a = readAnchor();
  if (!hw.b && !hw.d) return { code: a ? a.code : baseCode(), cloned: false, hw };
  if (!a) { saveAnchor(hw, baseCode()); return { code: baseCode(), cloned: false, hw }; }
  const cmp = [];
  if (a.b && hw.b) cmp.push(a.b === hw.b);
  if (a.d && hw.d) cmp.push(a.d === hw.d);
  if (cmp.length && cmp.every((x) => !x)) return { code: cloneCode(hw), cloned: true, hw, anchoredCode: a.code };
  const next = { b: hw.b || a.b, d: hw.d || a.d };
  saveAnchor(next, a.code); // يحدّث القطعة المتغيّرة ويُكمل الأماكن الناقصة
  return { code: a.code, cloned: false, hw };
}
function machineCode() { return deviceIdentity().code; }

/* ------------------------------ المفتاح العام ------------------------------ */
// يُستبدل عند البناء (scripts/protect.cjs) بنص المفتاح العام داخل الكود المشوَّش نفسه
const EMBEDDED_PUBLIC_KEY = /*__SL_PUBLIC_KEY__*/ null;
function publicKey() {
  if (EMBEDDED_PUBLIC_KEY) { try { return crypto.createPublicKey(EMBEDDED_PUBLIC_KEY); } catch { return null; } }
  try {
    const pem = fs.readFileSync(path.join(__dirname, 'license-public.pem'), 'utf8');
    if (!pem.includes('BEGIN PUBLIC KEY')) return null;
    return crypto.createPublicKey(pem);
  } catch { return null; }
}
/** بصمة مفتاح التحقق في هذه النسخة — تُقارن ببصمة مولّد المفاتيح لكشف اختلاف زوج المفاتيح */
function keyId() {
  try {
    const pub = publicKey();
    if (!pub) return '';
    const der = pub.export({ type: 'spki', format: 'der' });
    return crypto.createHash('sha256').update(der).digest('hex').toUpperCase().slice(0, 16).match(/.{4}/g).join('-');
  } catch { return ''; }
}

/** يفك المفتاح ويتحقق من التوقيع — يعيد البيانات أو سبب الرفض */
function decodeKey(key) {
  const clean = String(key || '').replace(/\s+/g, '').replace(/^SL1[-_.]?/i, '');
  const [p, s] = clean.split('.');
  if (!p || !s) return { error: 'صيغة المفتاح غير صحيحة' };
  const pub = publicKey();
  if (!pub) return { error: 'نسخة البرنامج بدون مفتاح تحقق — تواصل مع المطوّر' };
  let ok = false;
  try { ok = crypto.verify(null, Buffer.from(p, 'base64url'), pub, Buffer.from(s, 'base64url')); } catch { ok = false; }
  if (!ok) return { error: `المفتاح غير صالح لهذه النسخة من البرنامج (بصمة التحقق ${keyId() || '—'}) — أرسلها للمطوّر مع رمز الجهاز ليصدر لك مفتاحاً مطابقاً` };
  let data;
  try { data = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')); } catch { return { error: 'المفتاح تالف' }; }
  if (![1, 2].includes(data.v) || !['year', 'life'].includes(data.t) || !Array.isArray(data.d)) return { error: 'إصدار المفتاح غير مدعوم' };
  return { data };
}

/* --------------------------- المزايا وأقل نسخة --------------------------- */
/** ما كُتب في المفتاح صراحةً (v2 فقط) */
const explicitFeatures = (d) => (Array.isArray(d.f) ? d.f.filter((x) => typeof x === 'string') : null);
/**
 * المزايا المتاحة للتشغيل: المكتوبة في المفتاح، وإن لم تُكتب (مفاتيح ما قبل الفصل)
 * فصاحبها اشترى البرنامج وفيه الفاتورة الإلكترونية فتبقى له.
 */
function featuresOf(d) {
  const f = explicitFeatures(d);
  if (f) return f;
  return (d.i || '') < FEATURES_FROM ? ['zatca'] : [];
}
/** تاريخ انتهاء الميزة إن كانت باشتراك مستقل (غيابه = مع عمر الترخيص) */
const featureExpiry = (d, name) => {
  const fx = d && typeof d.fx === 'object' && d.fx ? d.fx[name] : null;
  return typeof fx === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fx) ? fx : null;
};
/**
 * حالة ميزة باشتراك: daysLeft موجب قبل الانتهاء وسالب بعده،
 * وتبقى تعمل طوال المهلة (grace) ثم تتوقف.
 */
function featureState(d, name, effective) {
  const owned = featuresOf(d).includes(name);
  const exp = featureExpiry(d, name);
  if (!owned) return { owned: false, active: false, expires: exp, daysLeft: null };
  if (!exp) return { owned: true, active: true, expires: null, daysLeft: null };
  const daysLeft = daysBetween(effective, exp);
  return { owned: true, active: daysLeft >= -FEATURE_GRACE_DAYS, expires: exp, daysLeft, graceDays: FEATURE_GRACE_DAYS };
}
/** مقارنة نسخ: 2.2.58 ← [2,2,58] */
const vparts = (v) => String(v || '0').split('.').map((x) => parseInt(x, 10) || 0);
function versionBelow(cur, min) {
  if (!min) return false;
  const a = vparts(cur), b = vparts(min);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0, y = b[i] || 0;
    if (x !== y) return x < y;
  }
  return false;
}
const appVersion = () => { try { return app.getVersion(); } catch { return '0.0.0'; } };
/*
 * Smart Ledger Pro بدأ ترقيمه من 1.0.1 لكنه أحدث من كل نسخ 2.x من الدفتر الذكي.
 * «أقل نسخة» داخل المفاتيح (mv) تُقارن بإصدار خط الترخيص: Pro x.y.z ≙ (x+2).y.z
 * فتبقى كل المفاتيح الصادرة سارية بنفس الترخيص دون إعادة إصدار.
 */
const PRO_LINE_OFFSET = 2;
const licenseLineVersion = () => { const p = vparts(appVersion()); p[0] = (p[0] || 0) + PRO_LINE_OFFSET; return p.join('.'); };

/* ------------------------------ حالة التجربة والساعة ------------------------------ */
const stateFile = () => path.join(app.getPath('userData'), 'license.json');
function readState() { try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return {}; } }
function writeState(s) { try { fs.writeFileSync(stateFile(), JSON.stringify(s, null, 1), 'utf8'); } catch (e) { console.error('license state', e); } }

function regGet(name) {
  if (process.platform !== 'win32') return '';
  try {
    const out = execFileSync('reg', ['query', REG_KEY, '/v', name], { encoding: 'utf8', windowsHide: true, timeout: 8000 });
    const m = out.match(new RegExp(`${name}\\s+REG_SZ\\s+(\\S+)`));
    return m ? m[1] : '';
  } catch { return ''; }
}
function regSet(name, value) {
  if (process.platform !== 'win32') return;
  try { execFileSync('reg', ['add', REG_KEY, '/v', name, '/t', 'REG_SZ', '/d', value, '/f'], { windowsHide: true, timeout: 8000 }); } catch { /* */ }
}
const minDate = (...ds) => ds.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '')).sort()[0] || '';
const maxDate = (...ds) => ds.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '')).sort().pop() || '';

/**
 * التاريخ الفعلي = الأحدث بين ساعة الجهاز وآخر تاريخ شوهد (إرجاع الساعة لا يمدّد التجربة أو الاشتراك).
 * أول تشغيل يُحفظ في ملف البيانات وفي سجل ويندوز معاً، ويؤخذ الأقدم.
 */
let getStore = () => null;
const dbGet = (k) => { try { const s = getStore(); return s && s.sysGet ? s.sysGet(k) : undefined; } catch { return undefined; } };
const dbSet = (k, v) => { try { const s = getStore(); if (s && s.sysSet) s.sysSet(k, v); } catch { /* */ } };

function clock() {
  const st = readState();
  const today = ymd(Date.now());
  // أول تشغيل محفوظ في 3 أماكن (ملف + سجل ويندوز + قاعدة البيانات): حذفها لإعادة التجربة يعني فقدان البيانات
  const first = minDate(st.first, regGet('FirstRun'), dbGet('first')) || today;
  const lastSeen = maxDate(st.last, regGet('LastSeen'), dbGet('last'));
  const effective = maxDate(today, lastSeen) || today;
  const rolledBack = !!lastSeen && today < lastSeen && daysBetween(today, lastSeen) > 1;
  if (st.first !== first || st.last !== effective) writeState({ ...st, first, last: effective });
  if (regGet('FirstRun') !== first) regSet('FirstRun', first);
  regSet('LastSeen', effective);
  if (dbGet('first') !== first) dbSet('first', first);
  if (dbGet('last') !== effective) dbSet('last', effective);
  return { first, effective, rolledBack, st: { ...readState() } };
}

/* ------------------------------ الحالة ------------------------------ */
function status() {
  const ident = deviceIdentity();
  const code = ident.code;
  const { first, effective, rolledBack, st } = clock();
  const base = { machineCode: code, today: effective, clockWarning: rolledBack, keyId: keyId(), ...(ident.cloned ? { cloned: true } : {}) };
  if (st.key) {
    const r = decodeKey(st.key);
    if (r.data) {
      const d = r.data;
      const devices = d.d.map(normCode);
      // المزايا المنتهية (بعد المهلة) تخرج من القائمتين فتتوقف الميزة وحدها دون بقية البرنامج
      const owned = featuresOf(d);
      const states = {}; const live = [];
      for (const name of owned) {
        const fs2 = featureState(d, name, effective);
        states[name] = { expires: fs2.expires, daysLeft: fs2.daysLeft, graceDays: FEATURE_GRACE_DAYS };
        if (fs2.active) live.push(name);
      }
      const explicit = explicitFeatures(d) || [];
      const lic = {
        customer: d.n || '', type: d.t, issued: d.i, expires: d.e || null, devices: d.d.length, licenseId: d.id || '',
        features: live,
        // الربط بمنصة فاتورة يحتاج ترخيصاً صريحاً: الميزة المكتسبة تُبقي ما هو مربوط يعمل ولا تربط من جديد
        licensedFeatures: explicit.filter((x) => live.includes(x)),
        featureStates: states,
        minVersion: d.mv || null, appVersion: appVersion(),
      };
      if (!devices.includes(normCode(code))) {
        return { ...base, state: 'wrong_device', ...lic, reason: ident.cloned
          ? 'نظام ويندوز في هذا الجهاز منسوخ من جهاز آخر، والترخيص المنقول معه لا يعمل هنا — أرسل رمز هذا الجهاز للمطوّر ليصدر له ترخيصاً خاصاً به'
          : 'المفتاح المحفوظ لجهاز آخر' };
      }
      if (versionBelow(licenseLineVersion(), d.mv)) return { ...base, state: 'needs_update', ...lic, reason: `هذا المفتاح يحتاج النسخة ${d.mv} أو أحدث (نسختك ${appVersion()}) — حدّث البرنامج ثم أعد التفعيل` };
      if (d.t === 'year' && d.e && effective > d.e) return { ...base, state: 'expired', ...lic, daysLeft: daysBetween(d.e, effective) * -1 };
      return { ...base, state: 'active', ...lic, daysLeft: d.t === 'year' && d.e ? daysBetween(effective, d.e) : null };
    }
  }
  const trialEnds = ymd(Date.parse(first) + TRIAL_DAYS * DAY);
  const left = daysBetween(effective, trialEnds);
  return { ...base, state: left > 0 ? 'trial' : 'trial_expired', trialStart: first, trialEnds, daysLeft: Math.max(0, left), trialDays: TRIAL_DAYS,
    features: left > 0 ? ALL_FEATURES : [], licensedFeatures: left > 0 ? ALL_FEATURES : [], appVersion: appVersion() };
}

function activate(key) {
  const r = decodeKey(key);
  if (r.error) return { ok: false, error: r.error };
  const d = r.data;
  const ident = deviceIdentity();
  const code = ident.code;
  if (!d.d.map(normCode).includes(normCode(code))) return { ok: false, error: `هذا المفتاح لا يشمل هذا الجهاز (${code}) — أرسل رمز الجهاز للمطوّر` };
  const { effective } = clock();
  if (versionBelow(licenseLineVersion(), d.mv)) return { ok: false, error: `هذا المفتاح يحتاج النسخة ${d.mv} أو أحدث، ونسختك ${appVersion()} — حدّث البرنامج من زر «تحديث البرنامج» في هذه الشاشة ثم أعد المحاولة` };
  if (d.t === 'year' && d.e && effective > d.e) return { ok: false, error: `هذا المفتاح منتهي منذ ${d.e}` };
  const st = readState();
  writeState({ ...st, key: String(key).trim(), activatedAt: new Date().toISOString() });
  // جهاز مستنسخ فُعّل له مفتاح برمزه الجديد: يصبح هذا الرمز والعتاد هما البصمة المعتمدة
  if (ident.cloned) saveAnchor(ident.hw, code);
  return { ok: true, status: status() };
}

/** للحماية داخل قاعدة البيانات: نتيجة مخزّنة دقيقة واحدة (فحص السجل بطيء نسبياً) */
let cache = { at: 0, usable: true };
function usableCached() {
  if (Date.now() - cache.at > 60000) {
    let usable = true;
    try { const s = status(); usable = s.state === 'trial' || s.state === 'active'; } catch { usable = true; }
    cache = { at: Date.now(), usable };
  }
  return cache.usable;
}

function registerLicenseIpc({ isTrusted, getStore: gs }) {
  if (gs) getStore = gs;
  prefetchHardware();
  const guard = (e) => { if (!isTrusted(e)) throw new Error('untrusted'); };
  ipcMain.handle('license:status', (e) => { guard(e); return status(); });
  ipcMain.handle('license:activate', (e, key) => { guard(e); const r = activate(key); cache.at = 0; return r; });
  ipcMain.handle('license:remove', (e) => {
    guard(e);
    const st = readState(); delete st.key; writeState(st); cache.at = 0;
    return status();
  });
}

/** هل الميزة متاحة للتشغيل الآن؟ (تشمل الميزة المكتسبة والتجربة) */
function hasFeature(name) {
  try { const s = status(); return (s.state === 'active' || s.state === 'trial') && (s.features || []).includes(name); } catch { return false; }
}
/** هل الميزة مرخّصة صراحةً؟ (للعمليات التي تبدأ من جديد مثل الربط بمنصة فاتورة) */
function hasLicensedFeature(name) {
  try { const s = status(); return (s.state === 'active' || s.state === 'trial') && (s.licensedFeatures || []).includes(name); } catch { return false; }
}

module.exports = { registerLicenseIpc, publicKey, status, machineCode, decodeKey, normCode, usableCached, keyId, hasFeature, hasLicensedFeature, featuresOf, featureState, FEATURE_GRACE_DAYS };
