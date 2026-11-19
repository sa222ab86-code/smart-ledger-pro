'use strict';
/**
 * تشخيص هوية مفاتيح الترخيص قبل البناء.
 * يعرض: المفتاح الخاص، المفتاح العام في المشروع، البصمة المسجّلة، وسجل التراخيص.
 * ثم يقول أيّ إجراء آمن — لأن البناء بمفتاح خاطئ يُبطل تفعيل كل العملاء.
 * التشغيل: check_license_keys.bat   أو   node tools\license\doctor.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  dir, privatePath, logPath, publicPath, keyIdPath,
  vaultPublicPath, vaultKeyIdPath, keyFingerprint, logSignedBy,
} = require('./common.cjs');

const line = (s = '') => console.log(s);
const idOf = (file, how) => {
  try { return keyFingerprint(how(fs.readFileSync(file, 'utf8'))); } catch { return ''; }
};
const read = (f) => { try { return fs.readFileSync(f, 'utf8').trim().split(/\s+/)[0] || ''; } catch { return ''; } };

line('================ تشخيص مفاتيح الترخيص ================');
line('مجلد المفاتيح: ' + dir);
line('');

const privId = idOf(privatePath, (t) => crypto.createPrivateKey(t));
const pemId = idOf(publicPath, (t) => t);
const vaultPemId = idOf(vaultPublicPath, (t) => t);
const vaultId = read(vaultKeyIdPath);
const projId = read(keyIdPath);

const show = (label, value, file) => line(
  '  ' + label.padEnd(34, '.') + ' ' + (value || '(غير موجود)') + (value ? '' : '   ← ' + file)
);
show('المفتاح الخاص (private.pem)', privId, privatePath);
show('المفتاح العام في المشروع', pemId, publicPath);
show('نسخة المفتاح العام في الخزنة', vaultPemId, vaultPublicPath);
show('البصمة المسجّلة في الخزنة', vaultId, vaultKeyIdPath);
show('البصمة المسجّلة في المشروع', projId, keyIdPath);
line('');

let issued = { checked: 0, ok: 0 };
if (fs.existsSync(logPath)) {
  issued = privId ? logSignedBy(fs.readFileSync(privatePath, 'utf8')) : { checked: 0, ok: 0 };
  line('سجل التراخيص: ' + logPath);
  if (!privId) line('  (لا يمكن فحصه بلا مفتاح خاص)');
  else line(`  ${issued.checked} ترخيصاً مسجّلاً — منها ${issued.ok} صادر من مفتاحك الحالي.`);
} else {
  line('سجل التراخيص: لا يوجد (لم تُصدر أي تراخيص بعد) — ' + logPath);
}
line('');
line('--------------------- الخلاصة ---------------------');

const bad = issued.checked - issued.ok;
if (!privId) {
  line('✗ لا يوجد مفتاح خاص على هذا الجهاز، فلا يمكنك إصدار مفاتيح جديدة.');
  line('  أعد نسخة private.pem الاحتياطية إلى:');
  line('  ' + dir);
} else if (bad > 0) {
  // الأخطر أولاً: التراخيص المصدَّرة هي الدليل، حتى لو طابق المفتاح العام المفتاح الخاص
  line('✗ قف — لا تبنِ الآن.');
  line(`  ${bad} من ${issued.checked} ترخيصاً ليست صادرة من مفتاحك الحالي (${privId}).`);
  line('  معناه أن المفتاح الخاص الصحيح مفتاح آخر، والبناء بهذا سيُبطل تفعيل هؤلاء العملاء.');
  line('  أعد نسخة private.pem الصحيحة إلى: ' + dir);
  line('  ولمعرفة أيّ التراخيص تتأثر:  node tools\\license\\generate.cjs --check-all');
} else if (pemId === privId) {
  line('✓ المفتاح العام في المشروع مطابق لمفتاحك الخاص. البناء جاهز.');
  if (vaultId && vaultId !== privId && issued.checked && issued.ok === issued.checked)
    line('  (البصمة المسجّلة قديمة وستُصحَّح تلقائياً عند البناء.)');
} else if (issued.checked === 0) {
  line('✓ المفتاح العام في المشروع قديم أو من جهاز آخر، ولم تُصدر أي تراخيص بعد.');
  line('  لا أحد يتأثر. شغّل make_license_keys.bat ثم أعد البناء.');
} else {
  line(`✓ كل التراخيص (${issued.ok}) صادرة من مفتاحك الحالي ${privId}.`);
  line('  المفتاح العام في المشروع قديم فقط. شغّل make_license_keys.bat ثم أعد البناء.');
  line('  تفعيل عملائك الحاليين لن يتأثر.');
}
line('===================================================');
