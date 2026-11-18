'use strict';
// مكان المفتاح الخاص: خارج مجلد المشروع دائماً (لا يُرفع إلى GitHub ولا يدخل في البرنامج)
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const crypto = require('node:crypto');
const dir = process.env.SL_LICENSE_DIR || path.join(os.homedir(), 'SmartLedgerLicense');
const publicPath = path.join(__dirname, '..', '..', 'electron', 'license-public.pem');
// بصمة المفتاح العام — ملف مرفوع مع الكود: يكشف تغيّر زوج المفاتيح قبل أن يُشحن بناء يُبطل تراخيص العملاء
const keyIdPath = path.join(__dirname, '..', '..', 'electron', 'license-key-id.txt');

/** بصمة ثابتة للمفتاح العام (16 خانة) تُشتق من صيغته الثنائية */
function keyFingerprint(keyLike) {
  // يقبل: PEM عام أو خاص، أو KeyObject عام أو خاص (createPublicKey يرفض KeyObject عاماً في Node 22)
  const k = (keyLike && typeof keyLike === 'object' && keyLike.type === 'public') ? keyLike : crypto.createPublicKey(keyLike);
  const der = k.export({ type: 'spki', format: 'der' });
  return crypto.createHash('sha256').update(der).digest('hex').toUpperCase().slice(0, 16).match(/.{4}/g).join('-');
}
// نسخة احتياطية من المفتاح العام وبصمته داخل مجلد الخزنة: مجلد المشروع يُستبدل مع كل تحديث، وهذا يبقى
const vaultPublicPath = path.join(dir, 'license-public.pem');
const vaultKeyIdPath = path.join(dir, 'key-id.txt');

const readId = (f) => { try { return fs.readFileSync(f, 'utf8').trim().split(/\s+/)[0] || ''; } catch { return ''; } };
/** البصمة المعتمدة: من الخزنة أولاً (تبقى بعد التحديث) ثم من المشروع */
const knownKeyId = () => readId(vaultKeyIdPath) || readId(keyIdPath);

/**
 * الدليل الحقيقي على هوية التراخيص هو سجل licenses.csv لا ملف البصمة:
 * يتحقق هل المفاتيح المسجّلة صادرة من هذا المفتاح الخاص.
 * @returns {{checked:number, ok:number}} checked=0 يعني لا سجل للمقارنة
 */
function logSignedBy(privLike) {
  const logFile = path.join(dir, 'licenses.csv');
  let text = '';
  try { text = fs.readFileSync(logFile, 'utf8'); } catch { return { checked: 0, ok: 0 }; }
  let pub;
  try { pub = crypto.createPublicKey(privLike); } catch { return { checked: 0, ok: 0 }; }
  let checked = 0, ok = 0;
  for (const line of text.trim().split(/\r?\n/).slice(1)) {
    const cells = line.split('","').map((x) => x.replace(/^\uFEFF?"|"$/g, ''));
    const key = String(cells[6] || '').replace(/\s+/g, '').replace(/^SL1[-_.]?/i, '');
    const [pl, sg] = key.split('.');
    if (!pl || !sg) continue;
    checked++;
    try { if (crypto.verify(null, Buffer.from(pl, 'base64url'), pub, Buffer.from(sg, 'base64url'))) ok++; } catch { /* */ }
  }
  return { checked, ok };
}

module.exports = {
  logSignedBy,
  dir,
  privatePath: path.join(dir, 'private.pem'),
  logPath: path.join(dir, 'licenses.csv'),
  publicPath,
  keyIdPath,
  vaultPublicPath,
  vaultKeyIdPath,
  keyFingerprint,
  knownKeyId,
  readKeyId: knownKeyId,
};
