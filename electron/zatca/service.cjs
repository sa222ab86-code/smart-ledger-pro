'use strict';
/**
 * خدمة الربط مع منصة فاتورة (هيئة الزكاة والضريبة والجمارك) — المرحلة الثانية.
 *
 *  التسجيل (onboard):  مفاتيح secp256k1 → CSR → شهادة الامتثال (CCSID) → 6 مستندات فحص → شهادة الإنتاج (PCSID)
 *  التوقيع (sign):     عند كل بيع/مرتجع: عداد ICV + سلسلة PIH + XML موقّع + QR — في معاملة واحدة بقاعدة البيانات
 *  الطابور (queue):    إرسال المبسطة (reporting) والضريبية (clearance) بالترتيب، مع إعادة المحاولة عند انقطاع الإنترنت
 *
 *  المفتاح الخاص يُحفظ مشفّراً بتشفير نظام التشغيل (safeStorage) إن توفر.
 */
const crypto = require('node:crypto');
const ec = require('./ec.cjs');
const { buildCsr } = require('./csr.cjs');
const { parseCertificate } = require('./cert.cjs');
const { buildSignedInvoice, INITIAL_PIH } = require('./ubl.cjs');

const BASE_URLS = {
  sandbox: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
  simulation: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
  production: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core',
};
const ENV_LABEL = { sandbox: 'البيئة التجريبية للمطورين', simulation: 'بيئة المحاكاة', production: 'الإنتاج (الربط الفعلي)' };

const RETRY_DELAYS_S = [30, 60, 120, 300, 600, 1800];

function createZatcaService({ store, safeStorage, appVersion, send, fetchImpl, onXml, licensed }) {
  /** الفاتورة الإلكترونية بترخيص منفصل — افتراضياً متاحة (للاختبارات وبيئة التطوير) */
  const featureOn = () => { try { return licensed ? !!licensed() : true; } catch { return true; } };
  const db = store.db;
  const doFetch = fetchImpl || ((...a) => fetch(...a));
  const q = {
    getState: db.prepare('SELECT value FROM zatca_state WHERE key = ?'),
    setState: db.prepare('INSERT INTO zatca_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value'),
    delState: db.prepare('DELETE FROM zatca_state WHERE key = ?'),
    getDoc: db.prepare('SELECT * FROM zatca_docs WHERE invoice_id = ?'),
    insertDoc: db.prepare(`INSERT INTO zatca_docs (invoice_id, icv, uuid, number, kind, type_code, hash, xml, qr, env, status, created_at, invoice_json)
                           VALUES (@invoice_id, @icv, @uuid, @number, @kind, @type_code, @hash, @xml, @qr, @env, 'pending', @created_at, @invoice_json)`),
    unsent: db.prepare(`SELECT COUNT(*) AS c, MIN(created_at) AS oldest FROM zatca_docs WHERE env = ? AND status IN ('pending','error','rejected')`),
    allDocIds: db.prepare(`SELECT invoice_id, invoice_json, number, created_at, uuid, icv, hash, qr, kind, status, last_error, xml FROM zatca_docs WHERE invoice_json IS NOT NULL`),
    nextPending: db.prepare(`SELECT * FROM zatca_docs WHERE status IN ('pending','error') AND env = ? ORDER BY icv LIMIT 1`),
    updateDoc: db.prepare(`UPDATE zatca_docs SET status = @status, attempts = attempts + 1, last_error = @last_error, response = @response,
                           cleared_xml = COALESCE(@cleared_xml, cleared_xml), submitted_at = @submitted_at WHERE invoice_id = @invoice_id`),
    counts: db.prepare(`SELECT status, COUNT(*) AS c FROM zatca_docs WHERE env = ? GROUP BY status`),
    recentProblems: db.prepare(`SELECT invoice_id, number, status, last_error, created_at, attempts FROM zatca_docs WHERE env = ? AND status IN ('rejected','error','pending','warning') ORDER BY CASE status WHEN 'rejected' THEN 0 WHEN 'error' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END, icv DESC LIMIT 50`),
    detail: db.prepare(`SELECT invoice_id, icv, uuid, number, kind, type_code, env, status, attempts, last_error, response, created_at, submitted_at FROM zatca_docs WHERE invoice_id = ?`),
    statuses: db.prepare(`SELECT invoice_id, status, last_error FROM zatca_docs`),
  };
  const get = (k) => { const r = q.getState.get(k); return r ? r.value : null; };
  const getJson = (k) => { const v = get(k); if (!v) return null; try { return JSON.parse(v); } catch { return null; } };
  const set = (k, v) => q.setState.run(k, typeof v === 'string' ? v : JSON.stringify(v));

  /* ---------------------------- المفتاح الخاص ---------------------------- */
  function saveSecret(key, plain) {
    if (safeStorage && safeStorage.isEncryptionAvailable()) set(key, 'enc:' + safeStorage.encryptString(plain).toString('base64'));
    else set(key, 'plain:' + Buffer.from(plain).toString('base64'));
  }
  function loadSecret(key) {
    const v = get(key);
    if (!v) return null;
    if (v.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(v.slice(4), 'base64'));
    if (v.startsWith('plain:')) return Buffer.from(v.slice(6), 'base64').toString();
    return v;
  }

  /* ------------------------------- الحالة ------------------------------- */
  function config() { return getJson('config'); }
  function isActive() { const c = config(); return !!(c && c.onboardedAt && get('pcsid_token')); }
  let signer = null; // يُحمَّل عند أول توقيع
  function getSigner() {
    if (signer) return signer;
    const token = get('pcsid_token');
    if (!token) throw new Error('الجهاز غير مسجّل في منصة فاتورة');
    const certB64 = Buffer.from(token, 'base64').toString();
    signer = { privateKey: ec.privateKeyFromPem(loadSecret('private_key')), cert: parseCertificate(certB64), token, secret: loadSecret('pcsid_secret') };
    return signer;
  }

  function status() {
    const c = config();
    const env = c?.env;
    const counts = {};
    if (env) for (const r of q.counts.all(env)) counts[r.status] = r.c;
    let certInfo = null;
    try { if (get('pcsid_token')) { const s = getSigner(); certInfo = { issuer: s.cert.issuer, serial: s.cert.serialNumber }; } } catch { /* تجاهل */ }
    return {
      active: isActive(),
      env, envLabel: env ? ENV_LABEL[env] : null,
      seller: c?.seller || null,
      egs: c?.egs || null,
      onboardedAt: c?.onboardedAt || null,
      icv: Number(get('icv') || 0),
      counts,
      problems: env ? q.recentProblems.all(env) : [],
      unsent: env ? q.unsent.get(env) : { c: 0, oldest: null },
      certInfo,
      queue: { running: queueRunning, lastRunAt, lastError: lastQueueError },
    };
  }

  /* ------------------------------- الاتصال ------------------------------- */
  async function api(env, path, { body, auth, headers = {} }) {
    const h = { 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Version': 'V2', 'Accept-Language': 'ar', ...headers };
    if (auth) h.Authorization = 'Basic ' + Buffer.from(`${auth.token}:${auth.secret}`).toString('base64');
    let res;
    try {
      res = await doFetch(BASE_URLS[env] + path, { method: 'POST', headers: h, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    } catch (err) {
      const e = new Error('تعذّر الاتصال بمنصة فاتورة — تحقق من الإنترنت'); e.network = true; e.cause = err; throw e;
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    return { status: res.status, data };
  }

  const messagesOf = (data) => {
    const v = data?.validationResults || {};
    const pick = (arr) => (arr || []).map((m) => `${m.code ? `[${m.code}] ` : ''}${m.message || ''}`.trim()).filter(Boolean);
    return { errors: pick(v.errorMessages), warnings: pick(v.warningMessages), status: v.status };
  };

  /* ------------------------------- التسجيل ------------------------------- */
  const progress = (step, detail) => send && send('zatca:onboardProgress', { step, detail, at: new Date().toISOString() });

  function sampleDocs(seller) {
    const lines = [{ name: 'صنف اختبار', qty: 1, unitPrice: 100, vatPercent: 15 }];
    const buyer = { name: 'عميل اختبار', vatNumber: '399999999800003', street: 'شارع الاختبار', building: '1111', district: 'الحي', city: 'الرياض', postalCode: '11111' };
    const now = new Date();
    const date = ksaDate(now), time = ksaTime(now);
    const base = (o) => ({ issueDate: date, issueTime: time, paymentMeansCode: '10', lines, ...o });
    return [
      base({ kind: 'standard', typeCode: 388, number: 'CMP-STD-INV', buyer }),
      base({ kind: 'standard', typeCode: 381, number: 'CMP-STD-CRN', buyer, billingReference: 'CMP-STD-INV', instructionNote: 'إرجاع' }),
      base({ kind: 'standard', typeCode: 383, number: 'CMP-STD-DBN', buyer, billingReference: 'CMP-STD-INV', instructionNote: 'تعديل' }),
      base({ kind: 'simplified', typeCode: 388, number: 'CMP-SMP-INV' }),
      base({ kind: 'simplified', typeCode: 381, number: 'CMP-SMP-CRN', billingReference: 'CMP-SMP-INV', instructionNote: 'إرجاع' }),
      base({ kind: 'simplified', typeCode: 383, number: 'CMP-SMP-DBN', billingReference: 'CMP-SMP-INV', instructionNote: 'تعديل' }),
    ];
  }

  /**
   * input: { env, otp, seller{name,vatNumber,crn,street,building,plot,district,city,postalCode}, egs{branch, industry, location} }
   */
  async function onboard(input) {
    const env = input.env;
    if (!BASE_URLS[env]) throw new Error('بيئة غير معروفة');
    const otp = String(input.otp || '').trim();
    if (!/^\d{6}$/.test(otp)) throw new Error('رمز OTP يجب أن يكون 6 أرقام (من بوابة فاتورة)');
    const seller = input.seller;

    progress('keys', 'إنشاء مفاتيح التشفير وطلب الشهادة');
    const privateKey = ec.generatePrivateKey();
    const egsUuid = crypto.randomUUID();
    const egs = {
      uuid: egsUuid,
      serial: `1-SmartLedger|2-${appVersion}|3-${egsUuid}`,
      commonName: `SL-${seller.vatNumber}-${egsUuid.slice(0, 8)}`,
      branch: input.egs?.branch || 'الفرع الرئيسي',
      industry: input.egs?.industry || 'Retail',
      location: input.egs?.location || seller.city || 'SA',
    };
    const csr = buildCsr({
      env, privateKey, commonName: egs.commonName, orgUnit: egs.branch, orgName: seller.name,
      egsSerial: egs.serial, vatNumber: seller.vatNumber, invoiceTypes: '1100', location: egs.location, industry: egs.industry,
    });

    progress('ccsid', 'طلب شهادة الامتثال من الهيئة');
    const r1 = await api(env, '/compliance', { body: { csr: Buffer.from(csr).toString('base64') }, headers: { OTP: otp } });
    if (r1.status !== 200 || !r1.data?.binarySecurityToken) {
      const m = messagesOf(r1.data);
      throw new Error(`رفضت الهيئة طلب الشهادة (${r1.status}): ${[...m.errors, r1.data?.message, r1.data?.dispositionMessage, r1.data?.errors && JSON.stringify(r1.data.errors)].filter(Boolean).join(' — ') || 'تحقق من رمز OTP وبيانات المنشأة'}`);
    }
    const ccsid = { token: r1.data.binarySecurityToken, secret: r1.data.secret, requestId: r1.data.requestID };
    const ccert = parseCertificate(Buffer.from(ccsid.token, 'base64').toString());
    const cSigner = { privateKey, cert: ccert };

    progress('checks', 'فحوصات الامتثال (6 مستندات)');
    let pih = INITIAL_PIH;
    const results = [];
    const docs = sampleDocs(seller);
    for (let i = 0; i < docs.length; i++) {
      const res = buildSignedInvoice(docs[i], seller, { icv: i + 1, pih }, cSigner);
      const r = await api(env, '/compliance/invoices', {
        auth: ccsid,
        body: { invoiceHash: res.invoiceHash, uuid: res.uuid, invoice: Buffer.from(res.xml).toString('base64') },
      });
      const m = messagesOf(r.data);
      const label = `${docs[i].kind === 'standard' ? 'ضريبية' : 'مبسطة'} ${docs[i].typeCode === 388 ? 'فاتورة' : docs[i].typeCode === 381 ? 'إشعار دائن' : 'إشعار مدين'}`;
      results.push({ label, httpStatus: r.status, status: m.status, errors: m.errors, warnings: m.warnings });
      progress('check', `${label}: ${r.status === 200 || r.status === 202 ? (m.warnings.length ? 'مقبول مع تحذيرات' : 'مقبول') : 'مرفوض'}`);
      if (r.status !== 200 && r.status !== 202) {
        const e = new Error(`فشل فحص الامتثال في «${label}»: ${m.errors.join(' — ') || JSON.stringify(r.data)}`);
        e.results = results; throw e;
      }
      pih = res.invoiceHash;
    }

    progress('pcsid', 'طلب شهادة الإنتاج');
    const r3 = await api(env, '/production/csids', { auth: ccsid, body: { compliance_request_id: ccsid.requestId } });
    if (r3.status !== 200 || !r3.data?.binarySecurityToken) {
      throw new Error(`تعذر الحصول على شهادة الإنتاج (${r3.status}): ${r3.data?.message || r3.data?.dispositionMessage || JSON.stringify(r3.data)}`);
    }

    // الحفظ: كل جهاز جديد يبدأ سلسلة جديدة
    db.transaction(() => {
      saveSecret('private_key', ec.privateKeyToPem(privateKey));
      set('pcsid_token', r3.data.binarySecurityToken);
      saveSecret('pcsid_secret', r3.data.secret);
      set('icv', '0');
      set('pih', INITIAL_PIH);
      set('config', { env, seller, egs, onboardedAt: new Date().toISOString() });
    })();
    signer = null;
    progress('done', 'تم ربط الجهاز بنجاح');
    kick();
    return { ok: true, results, status: status() };
  }

  /* ------------------------------- التوقيع ------------------------------- */
  /** يوقّع مستنداً ويضعه في الطابور. idempotent: نفس الفاتورة لا تُوقَّع مرتين */
  function sign({ invoiceId, doc, snapshot }) {
    if (!isActive()) throw new Error('الربط مع منصة فاتورة غير مفعّل');
    const c = config();
    const s = getSigner();
    const result = db.transaction(() => {
      const existing = q.getDoc.get(invoiceId);
      if (existing) return { uuid: existing.uuid, icv: existing.icv, invoiceHash: existing.hash, qr: existing.qr, status: existing.status, reused: true };
      const icv = Number(get('icv') || 0) + 1;
      const pih = get('pih') || INITIAL_PIH;
      const res = buildSignedInvoice(doc, c.seller, { icv, pih }, s);
      q.insertDoc.run({
        invoice_id: invoiceId, icv, uuid: res.uuid, number: doc.number, kind: doc.kind, type_code: doc.typeCode,
        hash: res.invoiceHash, xml: res.xml, qr: res.qr, env: c.env, created_at: new Date().toISOString(),
        invoice_json: snapshot ? JSON.stringify(snapshot) : null,
      });
      set('icv', String(icv));
      set('pih', res.invoiceHash);
      return { uuid: res.uuid, icv, invoiceHash: res.invoiceHash, qr: res.qr, totals: res.totals, status: 'pending', _xml: res.xml };
    })();
    // أرشفة ملف XML المختوم (خارج المعاملة — فشل الكتابة لا يُلغي الفاتورة)
    if (result._xml) { try { onXml && onXml({ invoiceId, number: doc.number, issueDate: doc.issueDate, xml: result._xml }); } catch { /* تجاهل */ } }
    delete result._xml;
    kick();
    return result;
  }

  /* ------------------------------- الطابور ------------------------------- */
  let queueRunning = false, lastRunAt = null, lastQueueError = null, timer = null, retryIdx = 0;

  function schedule(sec) {
    clearTimeout(timer);
    timer = setTimeout(() => void runQueue(), sec * 1000);
  }
  function kick() { schedule(1); }

  async function submitOne(doc) {
    const s = getSigner();
    const isStandard = doc.kind === 'standard';
    const path = isStandard ? '/invoices/clearance/single' : '/invoices/reporting/single';
    const r = await api(doc.env, path, {
      auth: { token: s.token, secret: s.secret },
      headers: { 'Clearance-Status': isStandard ? '1' : '0' },
      body: { invoiceHash: doc.hash, uuid: doc.uuid, invoice: Buffer.from(doc.xml).toString('base64') },
    });
    const m = messagesOf(r.data);
    const now = new Date().toISOString();
    let st, err = null, clearedXml = null, qr = null;
    if (r.status === 200 || r.status === 202) {
      st = m.warnings.length || r.status === 202 ? 'warning' : isStandard ? 'cleared' : 'reported';
      err = m.warnings.join(' — ') || null;
      if (isStandard && r.data?.clearedInvoice) {
        clearedXml = Buffer.from(r.data.clearedInvoice, 'base64').toString('utf8');
        const mq = clearedXml.match(/<cbc:ID>QR<\/cbc:ID>[\s\S]*?<cbc:EmbeddedDocumentBinaryObject[^>]*>([^<]+)</);
        if (mq) qr = mq[1];
      }
    } else if (r.status === 400) {
      st = 'rejected'; err = m.errors.join(' — ') || JSON.stringify(r.data);
    } else if (r.status === 401 || r.status === 403) {
      st = 'error'; err = 'رفضت الهيئة بيانات الدخول — قد تكون الشهادة منتهية أو أُلغيت. أعد تسجيل الجهاز.';
    } else if (r.status === 409) {
      // سبق إرسالها
      st = isStandard ? 'cleared' : 'reported'; err = 'سبق إرسال هذه الفاتورة';
    } else {
      st = 'error'; err = `خطأ من المنصة (${r.status}) ${m.errors.join(' — ')}`.trim();
    }
    q.updateDoc.run({ invoice_id: doc.invoice_id, status: st, last_error: err, response: JSON.stringify(r.data || null).slice(0, 20000), cleared_xml: clearedXml, submitted_at: now });
    // الفاتورة الضريبية المعتمدة: نستبدل الملف المؤرشف بنسخة الهيئة المعتمدة
    if (clearedXml) { try { onXml && onXml({ invoiceId: doc.invoice_id, number: doc.number, issueDate: (clearedXml.match(/<cbc:IssueDate>([^<]+)</) || [])[1], xml: clearedXml }); } catch { /* تجاهل */ } }
    send && send('zatca:status', { invoiceId: doc.invoice_id, status: st, message: err, qr });
    return st;
  }

  async function runQueue() {
    if (queueRunning || !isActive() || !featureOn()) return;
    queueRunning = true;
    lastRunAt = new Date().toISOString();
    const env = config().env;
    try {
      for (let guard = 0; guard < 500; guard++) {
        const doc = q.nextPending.get(env);
        if (!doc) break;
        const st = await submitOne(doc);
        if (st === 'error') { lastQueueError = 'فشل الإرسال — ستُعاد المحاولة تلقائياً'; throw Object.assign(new Error('retry'), { retry: true }); }
      }
      retryIdx = 0;
      lastQueueError = null;
      schedule(300); // فحص دوري كل 5 دقائق
    } catch (err) {
      if (err.network || err.retry) {
        lastQueueError = err.network ? err.message : lastQueueError;
        schedule(RETRY_DELAYS_S[Math.min(retryIdx++, RETRY_DELAYS_S.length - 1)]);
      } else {
        lastQueueError = String(err.message || err);
        schedule(600);
      }
    } finally {
      queueRunning = false;
      send && send('zatca:queue', { lastRunAt, lastError: lastQueueError });
    }
  }

  /**
   * فواتير مختومة (وربما أُرسلت للهيئة) غير موجودة في بيانات البرنامج — يحدث فقط إن انقطعت الكهرباء
   * في اللحظة بين الختم وحفظ الفاتورة. تُعاد نسخة الفاتورة المحفوظة مع الختم لاسترجاعها.
   */
  function orphans(knownIds) {
    const known = new Set((knownIds || []).map(String));
    const out = [];
    for (const r of q.allDocIds.all()) {
      if (known.has(r.invoice_id)) continue;
      try {
        const num = (re) => { const m = r.xml.match(re); return m ? Number(m[1]) : null; };
        out.push({
          invoiceId: r.invoice_id, number: r.number, createdAt: r.created_at, invoice: JSON.parse(r.invoice_json),
          zatca: { uuid: r.uuid, icv: r.icv, hash: r.hash, qr: r.qr, kind: r.kind, status: r.status, message: r.last_error },
          totals: { taxable: num(/<cbc:TaxExclusiveAmount[^>]*>([\d.]+)</), tax: num(/<cac:TaxTotal><cbc:TaxAmount[^>]*>([\d.]+)</) },
        });
      } catch { /* تجاهل */ }
    }
    return out;
  }

  function docStatuses() {
    const out = {};
    for (const r of q.statuses.all()) out[r.invoice_id] = { status: r.status, message: r.last_error };
    return out;
  }
  /** تفاصيل رد الهيئة على مستند: الحالة والرسائل (أخطاء/تحذيرات/معلومات) والرد الكامل */
  function docDetail(invoiceId) {
    const d = q.detail.get(String(invoiceId));
    if (!d) return null;
    let response = null;
    try { response = d.response ? JSON.parse(d.response) : null; } catch { response = d.response; }
    const v = (response && response.validationResults) || {};
    const pick = (arr) => (arr || []).map((m) => ({ code: m.code || '', category: m.category || '', message: m.message || '', status: m.status || '' }));
    return {
      invoiceId: d.invoice_id, number: d.number, icv: d.icv, uuid: d.uuid, kind: d.kind, typeCode: d.type_code, env: d.env,
      status: d.status, attempts: d.attempts, lastError: d.last_error, createdAt: d.created_at, submittedAt: d.submitted_at,
      errors: pick(v.errorMessages), warnings: pick(v.warningMessages), infos: pick(v.infoMessages),
      reportingStatus: response && (response.reportingStatus || response.clearanceStatus) || null,
      response,
    };
  }

  function getXml(invoiceId) {
    const d = q.getDoc.get(invoiceId);
    return d ? { xml: d.cleared_xml || d.xml, number: d.number } : null;
  }
  function retryRejected(invoiceId) {
    db.prepare(`UPDATE zatca_docs SET status = 'pending' WHERE invoice_id = ? AND status IN ('rejected','error')`).run(invoiceId);
    kick();
  }
  function disconnect() {
    db.transaction(() => { for (const k of ['config', 'pcsid_token', 'pcsid_secret', 'private_key']) q.delState.run(k); })();
    signer = null;
  }

  // بدء الطابور عند التشغيل
  schedule(5);

  return { status, onboard, sign, runQueue, kick, docStatuses, docDetail, getXml, retryRejected, disconnect, isActive, orphans, _api: api };
}

/* توقيت السعودية (UTC+3) لتاريخ ووقت الإصدار */
function ksa(d) { return new Date(d.getTime() + 3 * 3600 * 1000).toISOString(); }
const ksaDate = (d) => ksa(d).slice(0, 10);
const ksaTime = (d) => ksa(d).slice(11, 19);

module.exports = { createZatcaService, BASE_URLS, ENV_LABEL, ksaDate, ksaTime };
