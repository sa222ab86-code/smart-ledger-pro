'use strict';
// إعدادات المنشأة تنزل من المركز، والعنوان والهاتف يبقيان للفرع
const path = require('node:path'), fs = require('node:fs'), os = require('node:os'), assert = require('node:assert');
const SRC = process.env.SL_ROOT;
const { openStore } = require(SRC + '/electron/db.cjs');
const { createNetwork } = require(SRC + '/electron/network.cjs');
const BS = require(SRC + '/electron/branchsync.cjs');
const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'set-'));
const PORT = 47200 + Math.floor(Math.random() * 500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function device(name, cfgJson) { const dir = mk(); if (cfgJson) fs.writeFileSync(path.join(dir, 'branches.json'), JSON.stringify(cfgJson)); return { dir, store: openStore(dir), name }; }
function boot(d, merged) {
  const network = createNetwork({ userDataDir: d.dir, store: d.store, appVersion: '1.0.1', send: () => {}, merged });
  const bs = BS.createBranchSync({ userDataDir: d.dir, store: d.store, network, appVersion: '1.0.1', deviceName: d.name, send: () => {} });
  bs.start(); return { ...d, network, bs };
}
module.exports = async function () {
  const hqD = device('HQ', { mode: 'hq', hq: { port: PORT, publicHost: '127.0.0.1', name: 'المركز' } });
  hqD.store.applyBatch([
    { t: 'save', name: 'products', items: [{ id: 'p1', nameAr: 'شاي', price: 10, cost: 6, stock: 5 }] },
    { t: 'kv', key: 'companySettings', value: {
      companyName: 'مؤسسة النور', vatNumber: '300000000000003', grNumber: '1010101010',
      logoUrl: 'data:image/png;base64,AAA', taxRate: 15, activityType: 'retail',
      invoiceTerms: 'لا يُرد المبلغ بعد 7 أيام', showTerms: true, bankIban: 'SA0380000000608010167519',
      address: 'الرياض — طريق الملك فهد', phone: '0111111111', mobile: '0500000000',
      printerSettings: { cashierPrinter: 'HQ-POS-80' },
    } },
  ]);
  let hq = boot(hqD, false);
  await sleep(300);
  const { linkCode, branch } = hq.bs.addBranch({ name: 'فرع جدة', code: 'JED' });
  console.log('رمز الفرع:', branch.code);

  // الفرع: له عنوانه وهاتفه وطابعته قبل الربط
  const brD = device('BR', null);
  brD.store.applyBatch([{ t: 'kv', key: 'companySettings', value: {
    companyName: 'اسم قديم', taxRate: 5,
    address: 'جدة — حي الروضة', phone: '0122222222', mobile: '0555555555',
    printerSettings: { cashierPrinter: 'JED-POS-58' },
  } }]);
  let br = boot(brD, false);
  await br.bs.join(linkCode); await br.bs.dispose();
  br = boot(brD, true);
  const r = await br.bs.syncNow();
  assert.ok(r.ok, 'المزامنة');
  const s = brD.store.net.getKv('companySettings');
  console.log('\nبعد المزامنة، إعدادات الفرع:');
  for (const k of ['companyName', 'vatNumber', 'grNumber', 'taxRate', 'invoiceTerms', 'bankIban', 'logoUrl']) console.log('  [من المركز] ' + k + ' =', k === 'logoUrl' ? String(s[k]).slice(0, 20) + '…' : s[k]);
  for (const k of ['address', 'phone', 'mobile']) console.log('  [خاص بالفرع] ' + k + ' =', s[k]);
  console.log('  [خاص بالفرع] طابعة الكاشير =', s.printerSettings && s.printerSettings.cashierPrinter);
  assert.strictEqual(s.companyName, 'مؤسسة النور');
  assert.strictEqual(s.vatNumber, '300000000000003');
  assert.strictEqual(s.taxRate, 15);
  assert.strictEqual(s.bankIban, 'SA0380000000608010167519');
  assert.strictEqual(s.address, 'جدة — حي الروضة', 'عنوان الفرع يجب ألا يتغيّر');
  assert.strictEqual(s.phone, '0122222222', 'هاتف الفرع يجب ألا يتغيّر');
  assert.strictEqual(s.printerSettings.cashierPrinter, 'JED-POS-58', 'طابعة الفرع تبقى');
  console.log('✓ الهوية والضريبة نزلت، والعنوان والهاتف والطابعة بقيت للفرع');

  // تغيير في المركز ينزل للفرع
  const cur = hqD.store.net.getKv('companySettings');
  hqD.store.applyBatch([{ t: 'kv', key: 'companySettings', value: { ...cur, taxRate: 20, companyName: 'مؤسسة النور الحديثة' } }]);
  await br.bs.syncNow();
  const s2 = brD.store.net.getKv('companySettings');
  console.log('\nبعد تعديل المركز: الاسم =', s2.companyName, '| الضريبة =', s2.taxRate, '| العنوان =', s2.address);
  assert.strictEqual(s2.taxRate, 20); assert.strictEqual(s2.companyName, 'مؤسسة النور الحديثة');
  assert.strictEqual(s2.address, 'جدة — حي الروضة');
  console.log('✓ تعديل المركز ينزل للفرع بلا مساس بعنوانه');

  // رمز قصير يُرفض
  assert.throws(() => hq.bs.addBranch({ name: 'فرع قصير', code: 'A' }), /3 خانات/);
  console.log('✓ رمز الفرع من خانة واحدة مرفوض (يتعارض مع ترقيم أجهزة الشبكة)');

  await br.bs.dispose(); await hq.bs.dispose();
  console.log('\n=== إعدادات المنشأة: نجحت ===');
};
