'use strict';
// المزامنة عبر الممر: ربط، بيع، انقطاع الممر، عودة، ومنع الدخلاء
const path = require('node:path'), fs = require('node:fs'), os = require('node:os'), assert = require('node:assert');
const SRC = process.env.SL_ROOT;
const { openStore } = require(SRC + '/electron/db.cjs');
const { createNetwork } = require(SRC + '/electron/network.cjs');
const BS = require(SRC + '/electron/branchsync.cjs');
const { createMockRelay } = require('./mock-relay.cjs');
const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rly-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HQ_PORT = 49000 + Math.floor(Math.random() * 500);
const RELAY_PORT = HQ_PORT + 1;

function device(name, cfgJson) {
  const dir = mk();
  if (cfgJson) fs.writeFileSync(path.join(dir, 'branches.json'), JSON.stringify(cfgJson));
  return { dir, store: openStore(dir), name };
}
function boot(d, merged) {
  const network = createNetwork({ userDataDir: d.dir, store: d.store, appVersion: '1.0.1', send: () => {}, merged });
  const bs = BS.createBranchSync({ userDataDir: d.dir, store: d.store, network, appVersion: '1.0.1', deviceName: d.name, send: () => {} });
  bs.start();
  return { ...d, network, bs };
}
const invs = (st) => st.loadAll().collections.invoices || [];
const sell = (d, id, number, total) => d.store.applyBatch([{ t: 'save', name: 'invoices', items: [...invs(d.store), { id, number, total, items: [] }] }]);

module.exports = async function () {
  const relay = await createMockRelay(RELAY_PORT);
  console.log('ممر وهمي يعمل على', relay.url);

  // ---- المركز: يفعّل الممر ----
  const hqD = device('HQ', { mode: 'hq', hq: { port: HQ_PORT, publicHost: '127.0.0.1', name: 'المركز' } });
  hqD.store.applyBatch([{ t: 'save', name: 'products', items: [{ id: 'p1', nameAr: 'شاي', price: 10, cost: 6, stock: 100 }] }]);
  let hq = boot(hqD, false);
  const cfgRes = hq.bs.configure({ relayUrl: relay.url });
  console.log('تفعيل الممر:', JSON.stringify(cfgRes));
  assert.ok(cfgRes.ok && cfgRes.needsRestart);
  await hq.bs.dispose();
  hq = boot(hqD, false);           // إعادة التشغيل كما يحدث في البرنامج
  await sleep(900);
  const hinfo = hq.bs.info();
  console.log('حالة الممر في المركز:', JSON.stringify(hinfo.hq.relayStatus));
  assert.ok(hinfo.hq.relayStatus && hinfo.hq.relayStatus.connected, 'المركز يجب أن يكون متصلاً بالممر');
  assert.ok(!('hqKey' in (hinfo.hq.relay || {})), 'المفتاح السرّي يجب ألا يخرج للواجهة');
  console.log('✓ المركز متصل بالممر، والمفتاح السرّي محجوب');

  // ---- رمز الربط يحمل الممر ----
  const { linkCode, branch } = hq.bs.addBranch({ name: 'فرع بعيد' });
  const parsed = BS.parseLinkCode ? BS.parseLinkCode(linkCode) : null;
  console.log('رمز الربط يحوي الممر:', /\"r\"|r"/.test(Buffer.from(linkCode.slice(5), 'base64url').toString('utf8')));

  // ---- الفرع: لا يعرف عنوان المركز المحلي إطلاقاً ----
  const brD = device('BR', null);
  let br = boot(brD, false);
  const j = await br.bs.join(linkCode);
  console.log('انضمام الفرع عبر الممر:', JSON.stringify({ ok: j.ok, hqName: j.hqName }));
  assert.ok(j.ok, 'الانضمام عبر الممر يجب أن ينجح');
  await br.bs.dispose();
  br = boot(brD, true);
  assert.ok(br.bs.info().branch.viaRelay, 'الفرع يجب أن يكون عبر الممر');
  const r1 = await br.bs.syncNow();
  console.log('أول مزامنة عبر الممر:', JSON.stringify(r1));
  assert.ok(r1.ok);
  const prods = brD.store.loadAll().collections.products || [];
  assert.ok(prods.find((p) => p.id === 'p1'), 'أصناف المركز يجب أن تصل الفرع');
  console.log('✓ المزامنة الأولى نجحت وأصناف المركز وصلت');

  // ---- بيع ورفع ----
  for (let i = 1; i <= 12; i++) sell(brD, 'r' + i, 'REL-' + i, i * 5);
  await br.bs.syncNow();
  let atHq = (hq.bs.branchData(branch.id, ['invoices']).invoices || []).filter((x) => /^REL-/.test(x.number || ''));
  console.log('وصل المركز عبر الممر:', atHq.length, 'من 12');
  assert.strictEqual(atHq.length, 12);
  console.log('✓ فواتير الفرع وصلت المركز عبر الممر');

  // ---- انقطاع الممر عن المركز ----
  relay.dropHq(hinfo.hq.relay.hqId);
  await sleep(200);
  for (let i = 13; i <= 20; i++) sell(brD, 'r' + i, 'REL-' + i, 5);
  const rOff = await br.bs.syncNow();
  console.log('مزامنة والمركز مفصول عن الممر:', rOff.ok ? 'نجحت (غير متوقع)' : 'فشلت: ' + String(rOff.error).slice(0, 60));
  assert.ok(!rOff.ok);
  assert.strictEqual(invs(brD.store).length, 20, 'بيع الفرع يستمر رغم انقطاع الممر');
  console.log('✓ البيع استمر والبيانات سليمة');

  // ---- إعادة الاتصال التلقائية ----
  console.log('بانتظار إعادة اتصال المركز تلقائياً...');
  let online = 0;
  for (let i = 0; i < 40 && !online; i++) { await sleep(500); online = relay.hqOnline(hinfo.hq.relay.hqId); }
  console.log('المركز عاد للممر تلقائياً بعد', online ? 'إعادة محاولة' : 'فشل', '| متصل:', !!online);
  assert.ok(online, 'المركز يجب أن يعيد الاتصال وحده');
  const r2 = await br.bs.syncNow();
  console.log('مزامنة بعد العودة:', JSON.stringify(r2));
  atHq = (hq.bs.branchData(branch.id, ['invoices']).invoices || []).filter((x) => /^REL-/.test(x.number || ''));
  const ids = new Set(atHq.map((x) => x.id));
  console.log('المجموع في المركز:', atHq.length, 'من 20 | بلا تكرار:', ids.size === atHq.length);
  assert.strictEqual(atHq.length, 20); assert.strictEqual(ids.size, 20);
  console.log('✓ عاد الاتصال وحده ووصلت كل الفواتير بلا تكرار');

  // ---- دخيل بمفتاح خاطئ ----
  const fake = await fetch(`${relay.url}/b/${hinfo.hq.relay.hqId}`, { method: 'POST', headers: { 'x-sl-key': 'wrong-key' }, body: '{}' });
  console.log('طلب بمفتاح خاطئ →', fake.status, JSON.stringify((await fake.json()).code));
  assert.strictEqual(fake.status, 403);
  console.log('✓ الممر يرفض من لا يملك رمز الربط');

  await br.bs.dispose(); await hq.bs.dispose(); await relay.close();
  console.log('\n=== الممر: نجحت كل الفحوص ===');
};
