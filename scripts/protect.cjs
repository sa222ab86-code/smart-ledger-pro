'use strict';
/**
 * حماية وحدة الترخيص قبل البناء:
 *  1) تضمين المفتاح العام داخل الكود (لا يُقرأ من ملف يمكن استبداله)
 *  2) تشويش الكود (javascript-obfuscator) → electron/license.protected.cjs
 *  3) اختبار ذاتي للملف الناتج: إن فشل أي فحص يتوقف البناء (لا تُشحن نسخة معطوبة)
 * يعمل تلقائياً ضمن: npm run dist / npm run release
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const Module = require('node:module');

const root = path.join(__dirname, '..');
const src = path.join(root, 'electron', 'license.cjs');
const out = path.join(root, 'electron', 'license.protected.cjs');
const pemPath = path.join(root, 'electron', 'license-public.pem');
const privPath = path.join(process.env.SL_LICENSE_DIR || path.join(os.homedir(), 'SmartLedgerLicense'), 'private.pem');

function fail(msg) {
  console.error(`\n[protect] FAILED: ${msg}\n`);
  try { fs.rmSync(out, { force: true }); } catch { /* */ }
  process.exit(1);
}

if (!fs.existsSync(pemPath)) fail('electron/license-public.pem is missing — run make_license_keys.bat');
const pem = fs.readFileSync(pemPath, 'utf8');
try { crypto.createPublicKey(pem); } catch { fail('license-public.pem is not a valid public key'); }

// بصمة المفاتيح: بناء بمفتاح مختلف عن الذي صدرت به تراخيص العملاء = إبطال تفعيلهم جميعاً
const { keyIdPath, vaultKeyIdPath, keyFingerprint, knownKeyId, logSignedBy } = require('../tools/license/common.cjs');
const pemId = keyFingerprint(pem);

// المصدر الموثوق على جهاز المطوّر هو المفتاح الخاص نفسه؛ وإلا فالبصمة المسجّلة
const privId = fs.existsSync(privPath) ? keyFingerprint(fs.readFileSync(privPath, 'utf8')) : '';
const knownId = knownKeyId();
const expected = privId || knownId;

if (privId && pemId !== privId) {
  fail([
    'electron/license-public.pem لا يطابق مفتاحك الخاص — نسخة قديمة أو من جهاز آخر.',
    `  مفتاحك الخاص:        ${privId}`,
    `  الموجود في المشروع: ${pemId}`,
    '',
    'الحل: شغّل make_license_keys.bat ثم أعد البناء.',
  ].join('\n'));
}
// البصمة المسجّلة قد تكون قديمة من مفتاح خاطئ؛ سجل التراخيص هو الدليل الحقيقي
const staleId = knownId && pemId !== knownId && privId === pemId && (() => {
  const g = logSignedBy(fs.readFileSync(privPath, 'utf8'));
  return g.checked > 0 && g.ok === g.checked ? g : null;
})();
if (staleId) {
  fs.writeFileSync(keyIdPath, `${pemId}\n`, 'utf8');
  fs.writeFileSync(vaultKeyIdPath, `${pemId}\n`, 'utf8');
  console.log(`[protect] البصمة المسجّلة (${knownId}) قديمة — كل التراخيص (${staleId.ok}) صادرة من ${pemId}؛ صُحّحت.`);
} else if (knownId && pemId !== knownId) {
  fail([
    'مفتاح التحقق في هذا البناء يختلف عن الذي صدرت به تراخيص العملاء.',
    `  المتوقع (البصمة المسجّلة): ${knownId}`,
    `  الموجود (license-public.pem): ${pemId}`,
    '',
    'هذا البناء سيُبطل تفعيل كل العملاء الحاليين، لذلك تم إيقافه.',
    `أعد نسخة private.pem الاحتياطية إلى ${path.dirname(privPath)} ثم شغّل make_license_keys.bat.`,
    'وإن كان التغيير مقصوداً فعلاً فاحذف ملفّي البصمة (كل العملاء سيحتاجون مفاتيح جديدة):',
    `  ${path.relative(root, keyIdPath)}`,
    `  ${vaultKeyIdPath}`,
  ].join('\n'));
}
if (!expected) {
  // لا مفتاح خاص ولا بصمة مسجّلة: لا شيء نقارن به — نسجّلها مع تنبيه واضح بدل التأكيد الكاذب
  fs.writeFileSync(keyIdPath, `${pemId}\n`, 'utf8');
  console.warn(`[protect] تحذير: لا يوجد مفتاح خاص ولا بصمة مسجّلة — سُجّلت بصمة هذا البناء ${pemId} بلا تحقق.`);
  console.warn('[protect] إن كان لك عملاء مفعّلون فتأكد أن هذه بصمتك قبل التوزيع.');
} else {
  if (!knownId) fs.writeFileSync(keyIdPath, `${pemId}\n`, 'utf8');
  if (privId && !fs.existsSync(vaultKeyIdPath)) fs.writeFileSync(vaultKeyIdPath, `${privId}\n`, 'utf8');
  console.log(`[protect] key fingerprint OK: ${pemId}${privId ? ' (مطابق لمفتاحك الخاص)' : ' (مطابق للبصمة المسجّلة)'}`);
}

let code = fs.readFileSync(src, 'utf8');
const marker = '/*__SL_PUBLIC_KEY__*/ null';
if (!code.includes(marker)) fail('public key marker not found in license.cjs');
code = code.replace(marker, JSON.stringify(pem));

let Obf;
try { Obf = require('javascript-obfuscator'); } catch { fail('javascript-obfuscator is not installed (run npm install)'); }

const result = Obf.obfuscate(code, {
  target: 'node',
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.3,
  identifierNamesGenerator: 'hexadecimal',
  numbersToExpressions: true,
  renameGlobals: false,
  selfDefending: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  stringArray: true,
  stringArrayEncoding: ['rc4'],
  stringArrayThreshold: 1,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersType: 'function',
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
});
fs.writeFileSync(out, `/* Smart Ledger Pro — protected module */\n${result.getObfuscatedCode()}`, 'utf8');

/* ---------------- اختبار ذاتي ---------------- */
const tmpUd = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-protect-'));
const appVer = (() => { try { return require(path.join(root, 'package.json')).version; } catch { return '0.0.0'; } })();
const handlers = {};
const origLoad = Module._load;
Module._load = function (req, ...a) {
  if (req === 'electron') return { app: { getPath: () => tmpUd, getVersion: () => appVer }, ipcMain: { handle: (n, f) => { handlers[n] = f; } } };
  return origLoad.call(this, req, ...a);
};
try {
  const L = require(out);
  for (const fn of ['registerLicenseIpc', 'status', 'machineCode', 'decodeKey', 'usableCached', 'hasFeature', 'hasLicensedFeature']) {
    if (typeof L[fn] !== 'function') fail(`export ${fn} missing`);
  }
  const code1 = L.machineCode();
  if (!/^[0-9A-F]{5}(-[0-9A-F]{5}){3}$/.test(code1)) fail(`bad machine code ${code1}`);
  if (!L.decodeKey('SL1-abc.def').error) fail('a forged key was accepted');
  const st = L.status();
  if (!['trial', 'trial_expired', 'active', 'expired', 'wrong_device', 'needs_update'].includes(st.state)) fail(`bad status ${st.state}`);
  L.registerLicenseIpc({ isTrusted: () => true });
  if (!handlers['license:activate']) fail('IPC not registered');

  // مع وجود المفتاح الخاص (جهاز المطوّر): مفتاح حقيقي يُقبل، ومعدّل يُرفض
  if (fs.existsSync(privPath)) {
    const priv = crypto.createPrivateKey(fs.readFileSync(privPath, 'utf8'));
    const payload = Buffer.from(JSON.stringify({ v: 1, n: 'self-test', t: 'life', d: [code1], i: '2026-01-01', e: null, id: 'test' }));
    const key = `SL1-${payload.toString('base64url')}.${crypto.sign(null, payload, priv).toString('base64url')}`;
    const ok = L.decodeKey(key);
    if (!ok.data || ok.data.n !== 'self-test') fail('a valid signed key was rejected (public/private key mismatch?)');
    const bad = key.replace('SL1-e', 'SL1-f');
    if (L.decodeKey(bad).data) fail('a tampered key was accepted');
    const r = handlers['license:activate']({}, key);
    if (!r.ok || r.status.state !== 'active') fail('activation self-test failed');
    // مفتاح قديم v1 يحتفظ بالفاتورة الإلكترونية، ولا يسمح بربط جديد
    if (!r.status.features.includes('zatca')) fail('grandfathered feature missing from an old v1 key');
    if ((r.status.licensedFeatures || []).length) fail('an old key must not grant a new ZATCA onboarding');

    // v2: المزايا المكتوبة + منع التفعيل على نسخة أقدم من mv
    const mkKey = (o) => { const b = Buffer.from(JSON.stringify(o)); return `SL1-${b.toString('base64url')}.${crypto.sign(null, b, priv).toString('base64url')}`; };
    const base2 = { v: 2, n: 'self-test-2', t: 'life', d: [code1], i: '2026-11-16', e: null, id: 'test2' };
    const r2 = handlers['license:activate']({}, mkKey({ ...base2, f: ['zatca'], mv: appVer }));
    if (!r2.ok || !r2.status.licensedFeatures.includes('zatca')) fail('a v2 key with the ZATCA feature was not honoured');
    const r3 = handlers['license:activate']({}, mkKey({ ...base2, f: [], mv: appVer }));
    if (!r3.ok || r3.status.features.length) fail('a v2 key without features must not unlock ZATCA');
    const r4 = handlers['license:activate']({}, mkKey({ ...base2, f: [], mv: '999.0.0' }));
    if (r4.ok) fail('a key requiring a newer app version was accepted');
    // Pro 1.x: المفاتيح الصادرة لنسخ 2.x (mv حتى 2.x) تبقى سارية
    const r5 = handlers['license:activate']({}, mkKey({ ...base2, f: [], mv: '2.2.59' }));
    if (!r5.ok) fail('a key issued for Smart Ledger 2.x was rejected by Pro');
    handlers['license:activate']({}, key); // نعيد الحالة للمفتاح الأول
    console.log('[protect] signed-key self-test passed (v1 + v2 + min-version)');
  } else {
    console.log('[protect] private key not on this machine — skipped signed-key test');
  }
} catch (e) {
  fail(e && e.stack ? e.stack : String(e));
} finally {
  Module._load = origLoad;
  fs.rmSync(tmpUd, { recursive: true, force: true });
}
console.log(`[protect] OK → ${path.relative(root, out)} (${fs.statSync(out).size} bytes)`);
