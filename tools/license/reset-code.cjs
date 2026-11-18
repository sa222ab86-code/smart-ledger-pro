'use strict';
/**
 * رمز استرجاع كلمة المرور (للمطوّر فقط — يحتاج المفتاح الخاص).
 *   node tools/license/reset-code.cjs "SLPW1:..."
 * أو بدون معامل: يطلب لصق نص الطلب (يظهر تحت الباركود في شاشة «نسيت كلمة المرور»).
 */
const fs = require('node:fs');
const crypto = require('node:crypto');
const readline = require('node:readline/promises');
const { privatePath } = require('./common.cjs');
const { issueCode } = require('../../electron/pwreset.cjs');

(async () => {
  let text = process.argv.slice(2).join('');
  if (!text) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    text = await rl.question('الصق نص الطلب (SLPW1:...): ');
    rl.close();
  }
  let priv;
  try { priv = crypto.createPrivateKey(fs.readFileSync(privatePath, 'utf8')); }
  catch { console.error(`المفتاح الخاص غير موجود: ${privatePath}`); process.exit(1); }
  try {
    const r = issueCode(priv, text);
    const age = r.at ? Math.round((Date.now() - r.at) / 60000) : null;
    console.log('');
    console.log(`  الجهاز:    ${r.device}`);
    console.log(`  المستخدم:  ${r.name || r.user}`);
    if (age !== null) console.log(`  عمر الطلب: ${age} دقيقة${age > 30 ? '  (منتهي — اطلب طلباً جديداً)' : ''}`);
    console.log('');
    console.log(`  الرمز:  ${r.code}`);
    console.log('');
  } catch (e) { console.error('خطأ:', e.message); process.exit(1); }
})();
