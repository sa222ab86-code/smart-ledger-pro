'use strict';
/**
 * اختبارات Smart Ledger Pro بلا Electron (تحتاج Node 22.5+ و npm install لأجل typescript):
 *   npm test
 *  - ربط الفروع: مركز + فرعان عبر HTTP حقيقي على هذا الجهاز (التشفير، المزامنة الأولى، الدمج، الحذف، الإيقاف...)
 *  - المحاسبة: توازن كل قيد، ميزان المراجعة، الميزانية، قائمة الدخل، أرصدة العملاء والموردين
 * better-sqlite3 المبني لـ Electron لا يعمل في Node العادي، لذا تُستعمل محاكاة فوق node:sqlite.
 */
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const shim = path.join(__dirname, 'sqlite-shim.cjs');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...a) { return req === 'better-sqlite3' ? shim : origResolve.call(this, req, ...a); };
// تحميل ملفات TypeScript مباشرة (utils/accounting.ts)
let ts;
try { ts = require('typescript'); } catch { console.error('شغّل npm install أولاً (يلزم typescript)'); process.exit(1); }
require.extensions['.ts'] = (m, file) => {
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: file });
  m._compile(out.outputText, file);
};
const origResolve2 = Module._resolveFilename;
Module._resolveFilename = function (req, parent, ...a) {
  try { return origResolve2.call(this, req, parent, ...a); } catch (e) {
    if (req.startsWith('.') && parent && parent.filename) { const p = path.resolve(path.dirname(parent.filename), `${req}.ts`); if (fs.existsSync(p)) return p; }
    throw e;
  }
};
process.env.SL_ROOT = path.join(__dirname, '..');
(async () => {
  for (const t of ['accounting.test.cjs', 'branches.test.cjs', 'relay.test.cjs', 'hq-settings.test.cjs']) {
    console.log(`\n=== ${t} ===`);
    await require(path.join(__dirname, t))();
  }
  console.log('\n✓ كل الاختبارات نجحت');
  process.exit(0);
})().catch((e) => { console.error('\n✗ فشل:', e); process.exit(1); });
