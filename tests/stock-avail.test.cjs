'use strict';
// الكمية تبقى للفرع، والتكلفة تنزل بذرةً، وكميات المواقع تصل للاطلاع
const path = require('node:path'), fs = require('node:fs'), os = require('node:os'), assert = require('node:assert');
const SRC = process.env.SL_ROOT;
const { openStore } = require(SRC + '/electron/db.cjs');
const { createNetwork } = require(SRC + '/electron/network.cjs');
const BS = require(SRC + '/electron/branchsync.cjs');
const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'av-'));
const PORT = 47700 + Math.floor(Math.random() * 300);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function device(name, cfgJson) { const dir = mk(); if (cfgJson) fs.writeFileSync(path.join(dir, 'branches.json'), JSON.stringify(cfgJson)); return { dir, store: openStore(dir), name }; }
function boot(d, merged) {
  const network = createNetwork({ userDataDir: d.dir, store: d.store, appVersion: '1.1.0', send: () => {}, merged });
  const bs = BS.createBranchSync({ userDataDir: d.dir, store: d.store, network, appVersion: '1.1.0', deviceName: d.name, send: () => {} });
  bs.start(); return { ...d, network, bs };
}
const prods = (d) => d.store.loadAll().collections.products || [];
const p1 = (d) => prods(d).find((p) => p.id === 'p1');

module.exports = async function () {
  const hqD = device('HQ', { mode: 'hq', hq: { port: PORT, publicHost: '127.0.0.1', name: 'المستودع الرئيسي' } });
  hqD.store.applyBatch([{ t: 'save', name: 'products', items: [
    { id: 'p1', nameAr: 'شاي', price: 10, cost: 6, stock: 100 },
    { id: 'p2', nameAr: 'قهوة', price: 20, cost: 12, stock: 50 },
  ] }]);
  let hq = boot(hqD, false);
  await sleep(300);
  const { linkCode, branch } = hq.bs.addBranch({ name: 'فرع جدة', code: 'JED' });

  const brD = device('BR', null);
  let br = boot(brD, false);
  await br.bs.join(linkCode); await br.bs.dispose();
  br = boot(brD, true);
  assert.ok((await br.bs.syncNow()).ok);

  const a = p1(brD);
  console.log('الصنف عند الفرع بعد أول مزامنة: كمية =', a.stock, '| تكلفة =', a.cost, '| سعر =', a.price);
  assert.strictEqual(a.stock, 0, 'الكمية تبدأ صفراً ولا تُنسخ من المركز');
  assert.strictEqual(a.cost, 6, 'التكلفة تنزل بذرةً من المركز');
  console.log('✓ الكمية صفر (لا ازدواج مخزون) والتكلفة وصلت');

  // الفرع يستلم بضاعته ويغيّر تكلفته، ثم يغيّر المركز تكلفته
  const cur = prods(brD);
  brD.store.applyBatch([{ t: 'save', name: 'products', items: cur.map((p) => (p.id === 'p1' ? { ...p, stock: 25, cost: 7 } : p)) }]);
  await br.bs.syncNow();
  const hqCur = hqD.store.loadAll().collections.products;
  hqD.store.applyBatch([{ t: 'save', name: 'products', items: hqCur.map((p) => (p.id === 'p1' ? { ...p, cost: 9, price: 11, stock: 80 } : p)) }]);
  await br.bs.syncNow();
  const b = p1(brD);
  console.log('بعد تعديل المركز: كمية الفرع =', b.stock, '| تكلفته =', b.cost, '| السعر الجديد =', b.price);
  assert.strictEqual(b.stock, 25, 'كمية الفرع لا يمسّها المركز');
  assert.strictEqual(b.cost, 7, 'تكلفة الفرع لا يمسّها المركز بعد البذرة');
  assert.strictEqual(b.price, 11, 'السعر يتبع المركز');
  console.log('✓ بعد البذرة: الكمية والتكلفة للفرع، والسعر للمركز');

  // كميات المواقع تصل للفرع
  await sleep(100);
  await br.bs.syncNow();
  const av = brD.store.net.getKv('branchAvailability');
  console.log('كميات المواقع عند الفرع:', JSON.stringify({ locs: av && av.locs.map((l) => l.name), p1: av && av.qty.p1 }));
  assert.ok(av && av.locs.length >= 2, 'قائمة المواقع وصلت');
  assert.strictEqual(av.locs[0].name, 'المستودع الرئيسي');
  assert.strictEqual(av.qty.p1[0], 80, 'كمية المركز كما هي');
  const jed = av.locs.findIndex((l) => l.name === 'فرع جدة');
  assert.strictEqual(av.qty.p1[jed], 25, 'كمية الفرع نفسه ضمن القائمة');
  console.log('✓ الفرع يرى: المستودع 80 · فرع جدة 25 — بلا أي تغيير في مخزونه');
  assert.strictEqual(p1(brD).stock, 25, 'عرض كميات المواقع لم يمسّ مخزون الفرع');

  // المركز يحفظ نفس القائمة لشاشاته
  const hqAv = hqD.store.net.getKv('branchAvailability');
  assert.ok(hqAv && hqAv.qty.p1, 'المركز يحفظ القائمة أيضاً');
  console.log('✓ المركز يعرض القائمة نفسها في شاشاته');

  await br.bs.dispose(); await hq.bs.dispose();
  console.log('\n=== الكميات والتكلفة: نجحت ===');
};
