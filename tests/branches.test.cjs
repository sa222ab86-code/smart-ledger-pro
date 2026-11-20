'use strict';
// اختبار شامل: مركز + فرعان في نفس العملية عبر HTTP حقيقي على localhost
const path = require('node:path'), fs = require('node:fs'), os = require('node:os'), assert = require('node:assert');
const SRC = process.env.SL_ROOT;
const { openStore } = require(SRC + '/electron/db.cjs');
const { createNetwork } = require(SRC + '/electron/network.cjs');
const BS = require(SRC + '/electron/branchsync.cjs');
const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'slt-'));
const PORT = 47000 + Math.floor(Math.random() * 1000);

function device(name, cfgJson) {
  const dir = mk();
  if (cfgJson) fs.writeFileSync(path.join(dir, 'branches.json'), JSON.stringify(cfgJson));
  const store = openStore(dir);
  return { dir, store, name };
}
function boot(d, merged) {
  const events = [];
  const send = (ch, data) => events.push([ch, data]);
  const network = createNetwork({ userDataDir: d.dir, store: d.store, appVersion: '1.0.1', send, merged });
  const bs = BS.createBranchSync({ userDataDir: d.dir, store: d.store, network, appVersion: '1.0.1', deviceName: d.name, send });
  bs.start();
  return { ...d, network, bs, events };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function () {
  // ---- المركز: بيانات موجودة قبل تفعيل وضع المركز ----
  const hqD = device('HQ', { mode: 'hq', hq: { port: PORT, publicHost: '127.0.0.1', name: 'المركز' } });
  hqD.store.applyBatch([
    { t: 'save', name: 'products', items: [{ id: 'p1', nameAr: 'شاي', price: 10, cost: 6, stock: 100 }, { id: 'p2', nameAr: 'قهوة', price: 20, cost: 12, stock: 50 }] },
    { t: 'save', name: 'productGroups', items: [{ id: 'g1', nameAr: 'مشروبات', printerId: 'hq-printer' }] },
    { t: 'save', name: 'invoices', items: [{ id: 'hqinv', total: 99, items: [] }] },
  ]);
  const hq = boot(hqD, false);
  await sleep(300);
  assert.deepStrictEqual(hq.store.sync.tracked().sort(), BS.MASTER.slice().sort());
  const { linkCode, branch } = hq.bs.addBranch({ name: 'فرع جدة' });
  console.log('branch', branch.code, 'link', linkCode.slice(0, 30) + '...');
  assert.throws(() => hq.bs.addBranch({ name: 'x', code: branch.code }));

  // ---- الفرع: جهاز مستقل عنده بيانات سابقة ----
  const brD = device('BR1', null);
  brD.store.applyBatch([
    { t: 'save', name: 'invoices', items: [{ id: 'old1', number: 'INV-1', total: 15, items: [] }] },
    { t: 'save', name: 'productGroups', items: [{ id: 'g1', nameAr: 'قديم', printerId: 'branch-kitchen' }] },
  ]);
  let br0 = boot(brD, false);
  const bad = await br0.bs.testLink('SLB1-garbage');
  assert.strictEqual(bad.ok, false); console.log('bad link →', bad.error);
  const j = await br0.bs.join(linkCode);
  console.log('join', j);
  assert.ok(j.ok && j.needsRestart);
  await br0.bs.dispose();
  // إعادة تشغيل الفرع (كما يحدث بعد الربط)
  const br = boot(brD, true);
  assert.strictEqual(br.network.info().merged, true);
  const r1 = await br.bs.syncNow();
  console.log('first sync', r1);
  assert.ok(r1.ok);
  const brAll = br.store.loadAll().collections;
  const p1 = brAll.products.find((p) => p.id === 'p1');
  assert.strictEqual(p1.price, 10); assert.strictEqual(p1.stock, 0);
  // الكمية تبدأ صفراً (رفّ الفرع غير رفّ المركز)، والتكلفة تنزل بذرةً مرة واحدة ثم تصير ملك الفرع
  assert.strictEqual(p1.cost, 6, 'cost seeded from HQ on first arrival');
  assert.strictEqual(brAll.productGroups[0].printerId, 'branch-kitchen', 'printerId stays local');
  assert.strictEqual(brAll.productGroups[0].nameAr, 'مشروبات');
  assert.ok(!brAll.invoices.find((i) => i.id === 'hqinv'), 'HQ invoices never go to branch');
  // المركز استلم فواتير الفرع القديمة
  assert.deepStrictEqual(hq.bs.branchData(branch.id, ['invoices']).invoices.map((i) => i.id), ['old1']);
  assert.ok(br.events.some(([ch]) => ch === 'net:changes'), 'renderer notified');

  // ---- بيع في الفرع (عبر مسار الواجهة: patch مع base) + تعديل سعر في المركز بنفس الوقت ----
  const base = brAll.products.find((p) => p.id === 'p1');
  hq.network.data.batch([{ t: 'patch', name: 'products', patch: { upserts: [['p1', 0, { ...hq.store.loadAll().collections.products[0], price: 12 }]], removes: [], count: 2 } }]);
  await br.bs.syncNow(); // يصل السعر الجديد
  // الواجهة في الفرع ما زالت تعرف السعر القديم وتبيع حبتين
  await br.network.data.batch([
    { t: 'patch', name: 'products', patch: { upserts: [['p1', 0, { ...base, stock: base.stock - 2 }, base]], removes: [], count: 2 } },
    { t: 'patch', name: 'invoices', patch: { upserts: [['s1', 0, { id: 's1', number: 'B-1', total: 23, items: [{ productId: 'p1', qty: 2, price: 10, cost: 6 }] }, null]], removes: [], count: 2, head: 1 } },
  ]);
  const p1b = br.store.loadAll().collections.products.find((p) => p.id === 'p1');
  console.log('after concurrent edit', p1b);
  assert.strictEqual(p1b.price, 12, 'HQ price kept'); assert.strictEqual(p1b.stock, -2, 'branch sale applied');
  const r2 = await br.bs.syncNow();
  assert.ok(r2.ok, r2.error);
  const hqView = hq.bs.branchData(branch.id, ['invoices', 'products']);
  assert.ok(hqView.invoices.find((i) => i.id === 's1'));
  assert.strictEqual(hqView.products.find((p) => p.id === 'p1').stock, -2, 'HQ sees branch stock');
  // المركز يحذف صنفاً
  hq.store.applyBatch([{ t: 'patch', name: 'products', patch: { upserts: [], removes: ['p2'], count: 1 } }]);
  await br.bs.syncNow();
  assert.ok(!br.store.loadAll().collections.products.find((p) => p.id === 'p2'), 'delete propagated');
  // مخزون المركز لم يتأثر ببيع الفرع
  assert.strictEqual(hq.store.loadAll().collections.products.find((p) => p.id === 'p1').stock, 100);

  // ---- إيقاف الفرع وإعادة المفتاح ----
  hq.bs.setBranchActive(branch.id, false);
  const r3 = await br.bs.syncNow(); console.log('suspended →', r3.error); assert.ok(!r3.ok);
  hq.bs.setBranchActive(branch.id, true);
  hq.bs.rekeyBranch(branch.id);
  const r4 = await br.bs.syncNow(); console.log('rekeyed →', r4.error); assert.ok(!r4.ok);

  // ---- تلاعب: طلب بمفتاح خاطئ / تكرار الطلب ----
  const env = { v: 1, b: branch.id, ...BS.seal(Buffer.alloc(32), { ts: Date.now(), nonce: 'n', op: 'hello' }, `${branch.id}|req`) };
  const res = await fetch(`http://127.0.0.1:${PORT}/sync/v1`, { method: 'POST', body: JSON.stringify(env) });
  assert.strictEqual(res.status, 401);

  // ---- فرع ثانٍ بكمية أصناف كبيرة (مزامنة كاملة على صفحات) ----
  const many = Array.from({ length: 4000 }, (_, i) => ({ id: `x${String(i).padStart(5, '0')}`, nameAr: `صنف ${i}`, price: i, stock: 5 }));
  hq.store.applyBatch([{ t: 'save', name: 'products', items: [...hq.store.loadAll().collections.products, ...many] }]);
  const b2 = hq.bs.addBranch({ name: 'فرع الرياض', code: 'ryd' });
  assert.strictEqual(b2.branch.code, 'RYD');
  const b2D = device('BR2', null);
  const b2a = boot(b2D, false); const jj = await b2a.bs.join(b2.linkCode); assert.ok(jj.ok); await b2a.bs.dispose();
  const b2b = boot(b2D, true);
  const t0 = Date.now(); const rr = await b2b.bs.syncNow(); console.log('4000 products sync', rr, Date.now() - t0, 'ms');
  assert.strictEqual(b2b.store.loadAll().collections.products.length, 4001);
  // بعدها تغيير واحد فقط ينتقل تزايدياً
  hq.store.applyBatch([{ t: 'patch', name: 'products', patch: { upserts: [['x00007', 0, { ...many[7], price: 777 }]], removes: [], count: 4001 } }]);
  const rr2 = await b2b.bs.syncNow(); console.log('incremental', rr2);
  assert.strictEqual(rr2.down, 1);
  assert.strictEqual(b2b.store.loadAll().collections.products.find((p) => p.id === 'x00007').price, 777);
  console.log('branches at HQ:', hq.bs.info().branches.map((b) => `${b.code}:${b.status}:${JSON.stringify(b.counts)}`));
  console.log('branch status:', JSON.stringify(b2b.bs.info().branch.sync));
  for (const d of [hq, br, b2b]) { await d.bs.dispose(); d.network.dispose(); d.store.close(); }
  for (const d of [hqD, brD, b2D]) fs.rmSync(d.dir, { recursive: true, force: true });
  console.log('ربط الفروع: نجحت');
};
