'use strict';
/**
 * مفاتيح توقيع التراخيص (تُنشأ مرة واحدة في العمر):
 *  - المفتاح الخاص  → %USERPROFILE%\SmartLedgerLicense\private.pem   (سرّي — احفظ منه نسخة احتياطية)
 *  - المفتاح العام  → electron/license-public.pem                    (يدخل في البرنامج للتحقق فقط)
 *  - نسخة احتياطية من العام + بصمته → مجلد SmartLedgerLicense (يبقى بعد تحديث مجلد المشروع)
 *
 * مجلد المشروع يُستبدل مع كل تحديث، أما مجلد SmartLedgerLicense فيبقى — لذلك الهوية تُقرأ منه.
 * لا يُنشأ زوج جديد إن سبق إصدار تراخيص: إنشاؤه يُبطل تفعيل كل العملاء.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  dir, privatePath, publicPath, logPath,
  keyIdPath, vaultPublicPath, vaultKeyIdPath,
  keyFingerprint, knownKeyId, logSignedBy,
} = require('./common.cjs');

const force = process.argv.includes('--force-new');
const knownId = knownKeyId();
const issuedBefore = knownId || fs.existsSync(logPath);

fs.mkdirSync(dir, { recursive: true });

const stop = (lines) => {
  console.error('\n==================== توقّف ====================');
  for (const l of lines) console.error(l);
  console.error('==============================================\n');
  process.exit(1);
};

let priv = null, pubPem = null;

if (fs.existsSync(privatePath)) {
  priv = crypto.createPrivateKey(fs.readFileSync(privatePath, 'utf8'));
  pubPem = crypto.createPublicKey(priv).export({ type: 'spki', format: 'pem' });
  console.log('Private key found (kept as is):', privatePath);
} else if (fs.existsSync(vaultPublicPath) && !force) {
  // المفتاح الخاص مفقود لكن النسخة الاحتياطية من المفتاح العام موجودة:
  // نكمل البناء بنفس المفتاح العام → تفعيل العملاء الحاليين يبقى سليماً، لكن لا يمكن إصدار مفاتيح جديدة.
  pubPem = fs.readFileSync(vaultPublicPath, 'utf8');
  console.warn('\n[تحذير] المفتاح الخاص غير موجود:', privatePath);
  console.warn('        سيُستخدم المفتاح العام الاحتياطي، فيبقى تفعيل العملاء الحاليين يعمل،');
  console.warn('        لكنك لن تستطيع إصدار مفاتيح جديدة حتى تعيد private.pem من نسختك الاحتياطية.\n');
} else if (issuedBefore && !force) {
  stop([
    'المفتاح الخاص غير موجود على هذا الجهاز:',
    '  ' + privatePath,
    '',
    knownId ? `وهذا المشروع أصدر تراخيص ببصمة: ${knownId}` : 'وهذا المشروع سبق أن أصدر تراخيص (licenses.csv موجود).',
    'إنشاء مفتاح جديد الآن يُبطل تفعيل كل العملاء الحاليين.',
    '',
    `الحل: أعد نسخة private.pem الاحتياطية إلى: ${dir}`,
    'ثم شغّل make_license_keys.bat من جديد.',
    '',
    'وإن ضاع المفتاح الخاص نهائياً ولا بد من البدء من الصفر',
    '(وسيحتاج كل عميل إلى مفتاح جديد):',
    '  node tools\\license\\keygen.cjs --force-new',
  ]);
} else {
  const kp = crypto.generateKeyPairSync('ed25519');
  priv = kp.privateKey;
  fs.writeFileSync(privatePath, priv.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  pubPem = crypto.createPublicKey(priv).export({ type: 'spki', format: 'pem' });
  console.log('NEW private key created:', privatePath);
  console.log('>>> خذ نسخة احتياطية من المجلد الآن (فلاش / سحابة). ضياعه = لا يمكن إصدار مفاتيح جديدة.');
  if (issuedBefore) console.log('>>> تنبيه: الهوية تغيّرت — كل عميل حالي يحتاج مفتاحاً جديداً.');
}

const id = keyFingerprint(pubPem);
if (knownId && knownId !== id && !force) {
  // ملف البصمة قد يكون قديماً من مفتاح خاطئ؛ الدليل الحقيقي هو سجل التراخيص نفسه
  const log = priv ? logSignedBy(priv) : { checked: 0, ok: 0 };
  if (log.checked && log.ok === log.checked) {
    console.log(`[keygen] البصمة المسجّلة (${knownId}) قديمة — كل التراخيص (${log.ok}) صادرة من المفتاح الحالي ${id}؛ صُحّحت البصمة.`);
  } else if (log.checked && log.ok) {
    stop([
      'تحذير: سجل التراخيص يحوي مفاتيح من هويتين مختلفتين.',
      `  من المفتاح الحالي (${id}): ${log.ok} من ${log.checked}`,
      `  البصمة المسجّلة سابقاً: ${knownId}`,
      '',
      `${log.checked - log.ok} ترخيصاً لن يعمل على بناء بهذا المفتاح — افحصها أولاً:`,
      '  node tools\\license\\generate.cjs --check-all',
      'ثم أعد إصدار المفاتيح التي لا تعمل، أو أعد نسخة private.pem الصحيحة.',
      'أو أضف --force-new للمتابعة بهذا المفتاح على أي حال.',
    ]);
  } else {
    stop([
      'المفتاح الخاص الموجود لا يطابق التراخيص التي أُصدرت سابقاً:',
      `  بصمة التراخيص السابقة: ${knownId}`,
      `  بصمة المفتاح الحالي:   ${id}`,
      log.checked ? `  ولا واحد من ${log.checked} ترخيص في السجل صادر من المفتاح الحالي.` : '  (لا يوجد سجل تراخيص للمقارنة)',
      '',
      `هذا ليس المفتاح الصحيح. أعد نسخة private.pem الصحيحة إلى: ${dir}`,
      'أو أضف --force-new إن كنت تقصد البدء من الصفر (كل العملاء سيحتاجون مفاتيح جديدة).',
    ]);
  }
}

// المشروع (يُستبدل مع كل تحديث)
fs.writeFileSync(publicPath, pubPem);
fs.writeFileSync(keyIdPath, `${id}\n`, 'utf8');
// الخزنة (تبقى بعد التحديث) — منها تُعرف الهوية الصحيحة دائماً
fs.writeFileSync(vaultPublicPath, pubPem);
fs.writeFileSync(vaultKeyIdPath, `${id}\n`, 'utf8');

console.log('Public key written to:', publicPath);
console.log('Backup of public key:  ', vaultPublicPath);
console.log('Key fingerprint (بصمة المفاتيح):', id);
console.log('');
console.log('احتفظ بهذه البصمة؛ إن ظهرت للعميل بصمة مختلفة فالبناء بمفاتيح أخرى.');
console.log('Now build the app (build_desktop.bat) so it contains this public key.');
void path;
