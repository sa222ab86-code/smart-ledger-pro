'use strict';
/**
 * مولّد مفاتيح الترخيص (للمطوّر فقط).
 * تفاعلي:   node tools/license/generate.cjs
 * بالمعاملات: node tools/license/generate.cjs --name "اسم العميل" --type year|life --years 1 --devices CODE1,CODE2 [--expires 2027-12-31]
 * تحديث أجهزة عميل موجود (نفس النوع وتاريخ الانتهاء):
 *            node tools/license/generate.cjs --from "SL1-..." --add CODE3 [--remove CODE1]
 * فحص: هل صدر المفتاح من مفتاحك الحالي (أي سيبقى يعمل بعد التحديث)؟
 *            node tools/license/generate.cjs --check "SL1-..."
 *            node tools/license/generate.cjs --check-all
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline/promises');
const { dir, privatePath, logPath, keyFingerprint, readKeyId } = require('./common.cjs');

const norm = (s) => String(s || '').toUpperCase().replace(/[^0-9A-F]/g, '');
const pretty = (c) => norm(c).match(/.{1,5}/g).join('-');
const ymd = (d) => d.toISOString().slice(0, 10);

function args() {
  const a = process.argv.slice(2); const o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) o[a[i].slice(2)] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : 'true';
  return o;
}

/* ---------------------------- حمولة v2 ----------------------------
 * f:  المزايا المرخّصة — "zatca" = الفاتورة الإلكترونية (تُباع منفصلة)
 * fx: تاريخ انتهاء اشتراك كل ميزة — { zatca: 'YYYY-MM-DD' }، غيابه = مع عمر الترخيص
 * mv: أقل نسخة من البرنامج تقبل المفتاح — تمنع التفعيل على نسخة قديمة
 */
/** أقل نسخة تقبل المفاتيح الجديدة — 2.2.59 أول نسخة تفهم fx */
const MIN_APP_VERSION = '2.2.59';
const FEATURES_FROM = '2026-11-16';
/** مزايا مفتاح قديم: ما كُتب فيه، أو المكتسبة إن صدر قبل فصل الترخيص */
const featuresOfOld = (d) => (Array.isArray(d.f) ? d.f : ((d.i || '') < FEATURES_FROM ? ['zatca'] : []));
/** تاريخ انتهاء اشتراك الفاتورة الإلكترونية (null = مع عمر الترخيص) */
const featureUntil = (d) => { const v = d && d.fx ? d.fx.zatca : null; return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; };
const withFx = (payload, fx) => (fx ? { ...payload, fx: { zatca: fx } } : payload);

function sign(payload) {
  const priv = crypto.createPrivateKey(fs.readFileSync(privatePath, 'utf8'));
  const p = Buffer.from(JSON.stringify(payload), 'utf8');
  const s = crypto.sign(null, p, priv);
  return `SL1-${p.toString('base64url')}.${s.toString('base64url')}`;
}

/** يفك مفتاحاً سابقاً ويتحقق أنه صادر من مفتاحك الخاص */
function readKey(key) {
  const clean = String(key || '').replace(/\s+/g, '').replace(/^SL1[-_.]?/i, '');
  const [p, sg] = clean.split('.');
  if (!p || !sg) throw new Error('Invalid key format');
  const pub = crypto.createPublicKey(crypto.createPrivateKey(fs.readFileSync(privatePath, 'utf8')));
  if (!crypto.verify(null, Buffer.from(p, 'base64url'), pub, Buffer.from(sg, 'base64url'))) {
    throw new Error([
      'هذا المفتاح لم يصدر من مفتاحك الخاص الحالي.',
      `بصمة مفتاحك الحالي: ${keyFingerprint(pub)}`,
      'غالباً لأن private.pem تغيّر أو أُنشئ من جديد — أعد النسخة الاحتياطية الصحيحة،',
      'أو أصدر للعميل مفتاحاً جديداً بدل تعديل القديم (الخيار 1 = ترخيص جديد).',
    ].join('\n'));
  }
  return JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
}
const splitCodes = (v) => [...new Set(String(v || '').split(/[,;\s]+/).map(norm).filter(Boolean))];

function save(payload, key, note = '') {
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(logPath)) fs.writeFileSync(logPath, '﻿date,id,customer,type,expires,devices,key,note\n');
  const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  fs.appendFileSync(logPath, [payload.i, payload.id, payload.n, payload.t, payload.e || 'lifetime', payload.d.join(' '), key, note].map(csv).join(',') + '\n');
  const safe = (payload.n || 'customer').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60);
  const txt = path.join(dir, `${safe}-${payload.id}.txt`);
  fs.writeFileSync(txt, [
    `العميل: ${payload.n}`,
    `النوع: ${payload.t === 'life' ? 'شراء كامل (بدون انتهاء)' : `اشتراك سنوي حتى ${payload.e}`}`,
    `الأجهزة (${payload.d.length}): ${payload.d.join(' ، ')}`,
    `الفاتورة الإلكترونية: ${(payload.f || []).includes('zatca') ? (featureUntil(payload) ? `اشتراك حتى ${featureUntil(payload)}` : 'مرخّصة بلا انتهاء') : 'غير مرخّصة'}`,
    ...(payload.mv ? [`يحتاج نسخة البرنامج ${payload.mv} أو أحدث`] : []),
    note ? `ملاحظة: ${note}` : '',
    '',
    'مفتاح التفعيل (انسخه كاملاً والصقه في كل الأجهزة المذكورة):',
    key,
    '',
  ].join('\r\n'), 'utf8');
  console.log('\n===== LICENSE KEY =====\n');
  console.log(key);
  console.log('\nCustomer:', payload.n, '| Type:', payload.t === 'life' ? 'Lifetime' : `Yearly until ${payload.e}`, '| Devices:', payload.d.length,
    '| ZATCA:', (payload.f || []).includes('zatca') ? 'yes' : 'no', '| needs app', payload.mv || '-');
  console.log('Saved:', txt);
  console.log('Log:  ', logPath);
  try {
    const id = keyFingerprint(crypto.createPublicKey(crypto.createPrivateKey(fs.readFileSync(privatePath, 'utf8'))));
    const known = readKeyId();
    console.log('Key fingerprint:', id, known && known !== id ? `(تحذير: البناء يتوقع ${known} — المفاتيح مختلفة!)` : '(matches the build)');
  } catch { /* */ }
}

async function updateExisting(o, ask) {
  const oldKey = o.from ?? await ask("Paste the customer's CURRENT key (الصق مفتاح العميل الحالي)");
  let old;
  try { old = readKey(oldKey); } catch (e) { console.error(e.message); process.exit(1); }
  console.log(`\nCustomer: ${old.n} | ${old.t === 'life' ? 'Lifetime' : 'Yearly until ' + old.e} | Devices: ${old.d.join(', ')}`);
  const add = splitCodes(o.add ?? await ask('Device codes to ADD (رموز أجهزة تضاف) — or empty'));
  const remove = new Set(splitCodes(o.remove ?? (o.from ? '' : await ask('Device codes to REMOVE (رموز أجهزة تُحذف) — or empty'))));
  const bad = add.filter((d) => d.length !== 20);
  if (bad.length) { console.error('Invalid device code(s):', bad.join(', ')); process.exit(1); }
  const devices = [...new Set([...old.d.map(norm).filter((d) => !remove.has(d)), ...add])];
  if (!devices.length) { console.error('No devices left'); process.exit(1); }
  // نفس النوع وتاريخ الانتهاء — إضافة جهاز لا تمدّد الاشتراك
  // المزايا تُنقل من المفتاح القديم فلا يفقدها العميل عند التجديد أو تبديل الجهاز
  const payload = withFx({ v: 2, n: old.n, t: old.t, d: devices.map(pretty), i: ymd(new Date()), e: old.e ?? null, id: crypto.randomBytes(4).toString('hex'), f: featuresOfOld(old), mv: MIN_APP_VERSION }, featureUntil(old));
  save(payload, sign(payload), `update of ${old.id || '?'}: +${add.length} -${remove.size}`);
}

/** فحص مفتاح واحد مقابل المفتاح الخاص الحالي */
function checkOne(key, label) {
  try {
    const d = readKey(key);
    const when = d.t === 'life' ? 'شراء كامل' : 'سنوي حتى ' + d.e;
    console.log('[سليم]   ' + (d.n || label) + ' | ' + when + ' | أجهزة: ' + d.d.join(' , ') + (featuresOfOld(d).includes('zatca') ? ' | فاتورة إلكترونية' + (featureUntil(d) ? ' حتى ' + featureUntil(d) : '') : ''));
    return true;
  } catch {
    console.log('[لا يعمل] ' + (label || 'هذا المفتاح') + ' — لم يصدر من مفتاحك الحالي، يحتاج مفتاحاً جديداً');
    return false;
  }
}

function checkMode(o) {
  const id = keyFingerprint(crypto.createPrivateKey(fs.readFileSync(privatePath, 'utf8')));
  console.log('بصمة مفتاحك الحالي: ' + id + '\n');
  let keys = [];
  if (o['check-all'] !== undefined) {
    if (!fs.existsSync(logPath)) { console.error('لا يوجد سجل تراخيص: ' + logPath); process.exit(1); }
    keys = fs.readFileSync(logPath, 'utf8').trim().split(/\r?\n/).slice(1).map((line) => {
      const c = line.split('","').map((x) => x.replace(/^"|"$/g, ''));
      return { key: c[6], label: c[2] + ' (' + c[5] + ')' };
    });
  } else {
    keys = [{ key: o.check, label: '' }];
  }
  let bad = 0;
  for (const k of keys) if (!checkOne(k.key, k.label)) bad++;
  console.log('\nالنتيجة: ' + (keys.length - bad) + ' سليم' + (bad ? ' و ' + bad + ' يحتاج مفتاحاً جديداً' : ' — لا أحد يتأثر بالتحديث'));
}

async function main() {
  if (!fs.existsSync(privatePath)) {
    console.error('Private key not found. Run make_license_keys.bat first.\n', privatePath);
    process.exit(1);
  }
  const o = args();
  if (o.check || o['check-all'] !== undefined) { checkMode(o); return; }
  let rl = null;
  const ask = async (q, def = '') => {
    if (!rl) rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const v = (await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim();
    return v || def;
  };
  const interactive = !o.devices && !o.from;
  if (o.from || (interactive && (await ask('1 = New license (ترخيص جديد), 2 = Add/replace devices for existing customer (تعديل أجهزة عميل)', '1')) === '2')) {
    await updateExisting(o, ask);
    if (rl) rl.close();
    return;
  }

  const name = o.name ?? (interactive ? await ask('Customer name (اسم العميل)') : '');
  let type = o.type ?? (interactive ? await ask('Type: 1 = Yearly (سنوي), 2 = Lifetime (شراء كامل)', '1') : 'year');
  type = type === '2' || /^life/i.test(type) ? 'life' : 'year';

  let expires = null;
  if (type === 'year') {
    if (o.expires) expires = o.expires;
    else {
      const years = Number(o.years ?? (interactive ? await ask('Years (عدد السنوات)', '1') : '1')) || 1;
      const d = new Date(); d.setFullYear(d.getFullYear() + years);
      expires = ymd(d);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)) { console.error('Bad expiry date'); process.exit(1); }
  }

  const rawDevices = o.devices ?? (interactive ? await ask('Device codes, separated by comma (رموز الأجهزة مفصولة بفاصلة)') : '');
  const devices = [...new Set(String(rawDevices).split(/[,;\s]+/).map(norm).filter(Boolean))];
  const bad = devices.filter((d) => d.length !== 20);
  if (!devices.length || bad.length) { console.error('Invalid device code(s):', bad.join(', ') || '(none)'); process.exit(1); }
  if (rl) rl.close();

  const zatcaArg = o.zatca ?? (interactive ? await ask('الفاتورة الإلكترونية (الربط مع منصة فاتورة)? y/n', 'n') : 'n');
  const features = /^(y|yes|1|true|نعم)$/i.test(String(zatcaArg)) ? ['zatca'] : [];
  // اشتراك الميزة مستقل: --zatca-until=YYYY-MM-DD أو --zatca-years=1 (بلا شيء = مع عمر الترخيص)
  let zUntil = features.length ? (o['zatca-until'] || '') : '';
  if (features.length && !zUntil) {
    const zy = Number(o['zatca-years'] ?? (interactive ? await ask('مدة اشتراك الفاتورة بالسنوات (0 = مع النسخة بلا انتهاء)', '0') : '0')) || 0;
    if (zy) { const dd = new Date(); dd.setFullYear(dd.getFullYear() + zy); zUntil = ymd(dd); }
  }
  if (zUntil && !/^\d{4}-\d{2}-\d{2}$/.test(zUntil)) { console.error('Bad ZATCA expiry date'); process.exit(1); }
  const payload = withFx({ v: 2, n: name, t: type, d: devices.map(pretty), i: ymd(new Date()), e: expires, id: crypto.randomBytes(4).toString('hex'), f: features, mv: MIN_APP_VERSION }, zUntil);
  const key = sign(payload);

  save(payload, key);
}

main().catch((e) => { console.error(e); process.exit(1); });
