'use strict';
/**
 * Smart Ledger Pro — ربط الفروع عن بعد (عبر الإنترنت) بمزامنة لا تحتاج اتصالاً دائماً.
 *
 * الأدوار (مستقلة عن ربط الأجهزة في الشبكة المحلية):
 *  - none   : بلا فروع (الافتراضي)
 *  - hq     : المركز الرئيسي — يفتح خدمة مزامنة على منفذ (47830 افتراضياً) تتصل بها الفروع عبر الإنترنت
 *  - branch : فرع — يبيع على قاعدته المحلية حتى لو انقطع الإنترنت، ويزامن عند توفر الاتصال:
 *               ↑ يرفع مستنداته (فواتير، مشتريات، صندوق، قيود...) ومخزونه للمركز
 *               ↓ يستلم البيانات الرئيسية (الأصناف والأسعار، المجموعات، العملاء، الموردين، العروض، دليل الحسابات)
 *
 * التتبّع: مشغّلات SQLite تسجّل كل تغيير في sync_log (db.cjs — الترحيل v4)، فلا يفوت أي تعديل
 * مهما كان مصدره (الواجهة، أجهزة الشبكة المحلية، الاستيراد...).
 *
 * الأمان: كل فرع له مفتاح سري 256 بت (يُنشئه المركز ويصل للفرع داخل «رمز الربط»).
 * كل طلب ورد مشفّر وموقّع بـ AES-256-GCM بمفتاح مشتق (HKDF) من سر الفرع، مع طابع زمني ورقم عشوائي
 * يمنع إعادة الإرسال، والرد مربوط بالطلب نفسه. لا يمر أي بيان بنص مكشوف حتى بدون HTTPS.
 */
const http = require('node:http');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const DEFAULT_PORT = 47830;
const APP_ID = 'smart-ledger-pro';
const LINK_PREFIX = 'SLB1-';
const MAX_BODY = 300 * 1024 * 1024;
const CLOCK_WINDOW_MS = 60 * 60 * 1000;
const PUSH_BATCH = 400;
const PULL_BATCH = 1000;
const SNAP_PAGE = 1500;
const HQ_LOG_KEEP = 200000;

/** ما يرفعه الفرع للمركز (يُحفظ في المركز منفصلاً لكل فرع) */
const UPLOAD = ['invoices', 'purchases', 'purchaseReturns', 'quotations', 'cashMovements', 'zReports', 'journalEntries', 'customers', 'suppliers', 'products'];
/** البيانات الرئيسية التي يديرها المركز وتنزل لكل الفروع */
const MASTER = ['products', 'productGroups', 'categoriesList', 'customers', 'suppliers', 'promotions', 'accounts'];
/** حقول خاصة بكل فرع لا يمسّها ما يصل من المركز (مخزون الفرع، تكلفته، رصيد العميل لديه، طابعة المطبخ...) */
const LOCAL_FIELDS = {
  products: ['stock', 'cost', 'damaged', 'damageLog', 'expiryDate'],
  customers: ['balance'],
  productGroups: ['printerId'],
  categoriesList: ['printerId'],
};
/** القيمة الابتدائية للحقول الخاصة عند وصول سجل جديد من المركز */
const LOCAL_DEFAULTS = { products: { stock: 0 }, customers: { balance: 0 } };

const nowIso = () => new Date().toISOString();
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s || ''), 'base64url');
const errText = (e) => String((e && e.message) || e);

/* ------------------------------ التشفير ------------------------------ */
function deriveKey(secret, branchId) {
  return Buffer.from(crypto.hkdfSync('sha256', fromB64u(secret), Buffer.from('SLPRO-BRANCH-V1'), Buffer.from(String(branchId)), 32));
}
function seal(key, obj, aad) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(aad));
  const data = Buffer.concat([c.update(zlib.gzipSync(Buffer.from(JSON.stringify(obj), 'utf8'))), c.final()]);
  return { n: b64u(iv), d: data.toString('base64'), t: b64u(c.getAuthTag()) };
}
function unseal(key, env, aad) {
  const d = crypto.createDecipheriv('aes-256-gcm', key, fromB64u(env.n));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(fromB64u(env.t));
  const plain = Buffer.concat([d.update(Buffer.from(String(env.d || ''), 'base64')), d.final()]);
  return JSON.parse(zlib.gunzipSync(plain).toString('utf8'));
}

/* ------------------------------ رمز الربط ------------------------------ */
function makeLinkCode({ host, port, id, secret, name, code, hqName, relay }) {
  // relay (اختياري): { url, hqId, branchKey } — وجوده يعني أن الفرع يصل عبر الممر لا بعنوان محلي
  const o = { h: host, p: port, i: id, k: secret, n: name, c: code, q: hqName || '' };
  if (relay && relay.url && relay.hqId && relay.branchKey) o.r = { u: relay.url, g: relay.hqId, y: relay.branchKey };
  return LINK_PREFIX + b64u(Buffer.from(JSON.stringify(o), 'utf8'));
}
function parseLinkCode(text) {
  const t = String(text || '').replace(/\s+/g, '');
  if (!t.startsWith(LINK_PREFIX)) throw new Error('رمز الربط غير صحيح — يجب أن يبدأ بـ SLB1-');
  let o;
  try { o = JSON.parse(fromB64u(t.slice(LINK_PREFIX.length)).toString('utf8')); } catch { throw new Error('رمز الربط تالف أو ناقص — انسخه كاملاً من شاشة الفروع في المركز'); }
  if (!o || !o.h || !o.i || !o.k) throw new Error('رمز الربط ناقص');
  const port = Number(o.p) || DEFAULT_PORT;
  if (!/^[A-Za-z0-9.\-:\[\]]+$/.test(String(o.h))) throw new Error('عنوان المركز في الرمز غير صالح');
  let relay = null;
  if (o.r && o.r.u && o.r.g && o.r.y) {
    let u;
    try { u = new URL(String(o.r.u)); } catch { throw new Error('عنوان الممر في رمز الربط غير صالح'); }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('عنوان الممر في رمز الربط غير صالح');
    relay = { url: u.origin, hqId: String(o.r.g), branchKey: String(o.r.y) };
  }
  return { host: String(o.h), port, id: String(o.i), secret: String(o.k), name: String(o.n || ''), code: String(o.c || ''), hqName: String(o.q || ''), relay };
}

/* ------------------------------ الإعدادات ------------------------------ */
function loadBranchConfig(userDataDir) {
  const file = path.join(userDataDir, 'branches.json');
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* أول تشغيل */ }
  const cfg = {
    mode: ['none', 'hq', 'branch'].includes(raw.mode) ? raw.mode : 'none',
    intervalSec: Math.min(3600, Math.max(15, Number(raw.intervalSec) || 60)),
    hq: {
      port: Number(raw.hq && raw.hq.port) > 1024 && Number(raw.hq.port) < 65536 ? Number(raw.hq.port) : DEFAULT_PORT,
      publicHost: String((raw.hq && raw.hq.publicHost) || ''),
      name: String((raw.hq && raw.hq.name) || ''),
      // الممر السحابي (اختياري): يُمكّن الفروع البعيدة بلا فتح بورت
      relay: raw.hq && raw.hq.relay && raw.hq.relay.url ? {
        url: String(raw.hq.relay.url),
        hqId: String(raw.hq.relay.hqId || ''),
        hqKey: String(raw.hq.relay.hqKey || ''),
        branchKey: String(raw.hq.relay.branchKey || ''),
      } : null,
    },
    branch: raw.branch && raw.branch.id && raw.branch.secret ? {
      host: String(raw.branch.host), port: Number(raw.branch.port) || DEFAULT_PORT, id: String(raw.branch.id), secret: String(raw.branch.secret),
      name: String(raw.branch.name || ''), code: String(raw.branch.code || ''), hqName: String(raw.branch.hqName || ''),
      relay: raw.branch.relay && raw.branch.relay.url && raw.branch.relay.hqId ? {
        url: String(raw.branch.relay.url), hqId: String(raw.branch.relay.hqId), branchKey: String(raw.branch.relay.branchKey || ''),
      } : null,
    } : null,
  };
  if (cfg.mode === 'branch' && !cfg.branch) cfg.mode = 'none';
  const save = (c) => { try { fs.writeFileSync(file, JSON.stringify(c, null, 2), 'utf8'); } catch (e) { console.error('[branches] config save', e); } };
  return { cfg, save };
}

function localIps() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) if (n && n.family === 'IPv4' && !n.internal) out.push(n.address);
  return out;
}

/** يزيل التكرار: آخر عملية لكل سجل (السجل الذي عُدّل 5 مرات يُرسل مرة واحدة بحالته الحالية) */
function collapse(rows, allowed) {
  const last = new Map();
  for (const r of rows) {
    if (allowed && !allowed.has(r.collection)) continue;
    last.set(`${r.collection}\u0000${r.record_id}`, r);
  }
  return Array.from(last.values());
}
function materialize(S, rows) {
  return rows.map((r) => {
    if (r.op === 'd') return { c: r.collection, id: r.record_id, op: 'd' };
    const raw = S.rawRecord(r.collection, r.record_id);
    return raw ? { c: r.collection, id: r.record_id, op: 'u', pos: raw.pos, data: raw.data } : { c: r.collection, id: r.record_id, op: 'd' };
  });
}

/* ------------------------------ المركز (الخادم) ------------------------------ */
function startHq({ store, cfg, appVersion, onBranchSeen }) {
  const S = store.sync;
  const MASTER_SET = new Set(MASTER);
  const UPLOAD_SET = new Set(UPLOAD);
  const nonces = new Map();
  let listening = false;
  let error = null;
  let lastPrune = 0;

  const sendJson = (res, code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(obj));
  };
  const readBody = (req) => new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
  const seenNonce = (n) => {
    const t = Date.now();
    if (nonces.size > 20000) for (const [k, exp] of nonces) if (exp < t) nonces.delete(k);
    if (nonces.has(n)) return true;
    nonces.set(n, t + 2 * CLOCK_WINDOW_MS);
    return false;
  };
  const epoch = () => {
    let e = S.metaGet('hq.epoch');
    if (!e) { e = crypto.randomBytes(6).toString('hex'); S.metaSet('hq.epoch', e); }
    return e;
  };

  function pull(branch, body) {
    const since = Number(body.since) || 0;
    const maxSeq = S.maxSeq();
    const minSeq = S.minSeq();
    const ep = epoch();
    const needSnap = body.snap || !body.init || body.epoch !== ep || since > maxSeq || (minSeq > 0 && since < minSeq - 1);
    if (needSnap) {
      // مزامنة كاملة على صفحات: [رقم المجموعة، آخر معرّف]، و seq = آخر تغيير قبل البدء
      const cur = body.snap && typeof body.snap === 'object' ? body.snap : { ci: 0, after: '', seq: maxSeq };
      let ci = Number(cur.ci) || 0;
      let after = String(cur.after || '');
      const items = [];
      while (ci < MASTER.length && items.length < SNAP_PAGE) {
        const want = SNAP_PAGE - items.length;
        const rows = S.snapshotPage(MASTER[ci], after, want);
        for (const r of rows) items.push({ c: r.collection, id: r.id, op: 'u', pos: r.pos, data: r.data });
        if (rows.length < want) { ci += 1; after = ''; } // انتهت هذه المجموعة
        else after = rows[rows.length - 1].id;
      }
      const done = ci >= MASTER.length;
      return { mode: 'snap', items, snap: done ? null : { ci, after, seq: cur.seq }, seq: Number(cur.seq) || 0, epoch: ep, collections: MASTER, full: !body.snap };
    }
    const rows = S.readLog(since, PULL_BATCH);
    const items = materialize(S, collapse(rows, MASTER_SET));
    const seq = rows.length ? rows[rows.length - 1].seq : since;
    S.branches.setPulled(branch.id, seq);
    return { mode: 'inc', items, seq, more: rows.length === PULL_BATCH, epoch: ep };
  }

  function handle(branch, msg) {
    const body = msg.body || {};
    if (msg.op === 'hello') {
      return { hqName: cfg.hq.name || os.hostname(), version: appVersion, branch: { id: branch.id, code: branch.code, name: branch.name } };
    }
    if (msg.op === 'push') {
      const items = (Array.isArray(body.items) ? body.items : []).filter((it) => it && UPLOAD_SET.has(it.c));
      const n = S.branches.apply(branch.id, items);
      return { applied: n };
    }
    if (msg.op === 'pull') return pull(branch, body);
    throw new Error('عملية غير معروفة');
  }

  /**
   * معالجة ظرف مزامنة واحد. لا تعرف شيئاً عن وسيلة النقل، فيستعملها خادم الشبكة
   * المحلية والممر السحابي معاً: تأخذ الظرف المختوم وتعيد الحالة والرد المختوم.
   */
  function processEnvelope(env, meta = {}) {
    const branch = env && env.b ? S.branches.get(env.b) : null;
    if (!branch) return { status: 401, body: { ok: false, code: 'unknown', error: 'هذا الفرع غير مسجّل في المركز (ربما حُذف) — اطلب رمز ربط جديد' } };
    if (branch.status !== 'active') return { status: 403, body: { ok: false, code: 'revoked', error: 'المركز أوقف ربط هذا الفرع' } };
    const key = deriveKey(branch.secret, branch.id);
    let msg;
    try { msg = unseal(key, env, `${branch.id}|req`); } catch { return { status: 401, body: { ok: false, code: 'key', error: 'مفتاح الفرع غير مطابق — أعد الربط برمز جديد من المركز' } }; }
    if (!msg || typeof msg.nonce !== 'string' || Math.abs(Date.now() - Number(msg.ts)) > CLOCK_WINDOW_MS) {
      return { status: 400, body: { ok: false, code: 'clock', error: 'وقت جهاز الفرع يختلف كثيراً عن وقت المركز — اضبط التاريخ والساعة في الجهازين' } };
    }
    if (seenNonce(msg.nonce)) return { status: 409, body: { ok: false, code: 'replay', error: 'طلب مكرر' } };
    let out; let ok = true; let err = '';
    try { out = handle(branch, msg); } catch (e) { ok = false; err = errText(e); console.error('[branches] hq handle', e); }
    S.branches.touch(branch.id, { ip: meta.ip || '', version: String(msg.version || ''), info: msg.info && typeof msg.info === 'object' ? msg.info : undefined });
    if (onBranchSeen) onBranchSeen(branch.id);
    if (Date.now() - lastPrune > 6 * 3600 * 1000) { lastPrune = Date.now(); try { S.pruneKeep(HQ_LOG_KEEP); } catch { /* */ } }
    return { status: 200, body: seal(key, { ts: Date.now(), ok, error: err, body: out }, `${branch.id}|res|${msg.nonce}`) };
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (req.method === 'GET' && url.pathname === '/sync/v1/ping') return sendJson(res, 200, { ok: true, app: APP_ID });
      if (req.method !== 'POST' || url.pathname !== '/sync/v1') return sendJson(res, 404, { ok: false, error: 'not found' });
      const env = await readBody(req);
      const r = processEnvelope(env, { ip: (req.socket.remoteAddress || '').replace(/^::ffff:/, '') });
      return sendJson(res, r.status, r.body);
    } catch (e) {
      console.error('[branches] request failed', e);
      try { sendJson(res, 500, { ok: false, error: errText(e) }); } catch { /* */ }
      return undefined;
    }
  });
  server.requestTimeout = 10 * 60 * 1000;
  server.on('error', (e) => { listening = false; error = e.code === 'EADDRINUSE' ? `المنفذ ${cfg.hq.port} مستخدم من برنامج آخر` : errText(e); console.error('[branches] server', e); });
  server.listen(cfg.hq.port, '0.0.0.0', () => { listening = true; error = null; });
  epoch();

  return {
    processEnvelope,
    status: () => ({ listening, error, port: cfg.hq.port }),
    /** تغيّرت قائمة البيانات الرئيسية (تحديث للبرنامج): الفروع تعيد المزامنة الكاملة */
    resetEpoch: () => S.metaSet('hq.epoch', crypto.randomBytes(6).toString('hex')),
    close: () => new Promise((r) => { try { server.close(() => r()); } catch { r(); } }),
  };
}

/* ------------------------------ الممر السحابي ------------------------------ */
/**
 * اتصال المركز الدائم بالممر: يخرج من المركز إلى الإنترنت فلا يحتاج فتح بورت ولا راوتر.
 * ينام خاملاً ولا يُرسل شيئاً حتى يصل طلب فرع، ويعيد الاتصال وحده عند أي انقطاع.
 * ما يمرّ هنا ظرف مختوم: الممر لا يملك مفتاح فكّه.
 */
function createRelayLink({ relay, appVersion, processEnvelope, onStatus }) {
  const st = { enabled: true, connected: false, lastError: '', lastConnectedAt: null, attempts: 0, served: 0 };
  let ws = null, stopped = false, timer = null, pingTimer = null, backoff = 2000;
  const emit = () => { if (onStatus) { try { onStatus({ ...st }); } catch { /* */ } } };

  const wsUrl = () => {
    const u = new URL('/hq', String(relay.url).replace(/\/+$/, '') + '/');
    u.protocol = u.protocol === 'http:' ? 'ws:' : u.protocol === 'https:' ? 'wss:' : u.protocol;
    u.searchParams.set('id', relay.hqId);
    u.searchParams.set('k', relay.hqKey);
    u.searchParams.set('bk', relay.branchKey);
    u.searchParams.set('v', appVersion);
    return u.toString();
  };

  const scheduleReconnect = () => {
    if (stopped || timer) return;
    timer = setTimeout(() => { timer = null; connect(); }, backoff);
    backoff = Math.min(60000, Math.round(backoff * 1.8)); // تراجع تدريجي: لا يُرهق الممر ولا الشبكة
  };

  function connect() {
    if (stopped) return;
    st.attempts++;
    let sock;
    try { sock = new WebSocket(wsUrl()); } catch (e) { st.lastError = errText(e); emit(); return scheduleReconnect(); }
    ws = sock;
    sock.onopen = () => {
      if (ws !== sock) return;
      st.connected = true; st.lastError = ''; st.lastConnectedAt = nowIso(); backoff = 2000; emit();
      clearInterval(pingTimer);
      pingTimer = setInterval(() => { try { sock.send(JSON.stringify({ t: 'ping' })); } catch { /* */ } }, 4 * 60 * 1000);
    };
    sock.onmessage = (ev) => {
      if (ws !== sock) return;
      let m;
      try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8')); } catch { return; }
      if (m.t !== 'req' || !m.rid) return;
      let status = 500, body = { ok: false, error: 'relay handler failed' };
      try {
        const env = typeof m.env === 'string' ? JSON.parse(m.env) : m.env;
        const r = processEnvelope(env, { ip: 'relay' });
        status = r.status; body = r.body;
      } catch (e) { body = { ok: false, error: errText(e) }; console.error('[branches] relay handle', e); }
      try { sock.send(JSON.stringify({ t: 'res', rid: m.rid, status, body })); st.served++; } catch (e) { st.lastError = errText(e); }
      emit();
    };
    sock.onclose = (ev) => {
      if (ws !== sock) return;
      clearInterval(pingTimer);
      st.connected = false;
      // 1008/403 تعني أن المعرّف مسجّل لمركز آخر: إعادة المحاولة لن تنفع
      if (ev && (ev.code === 1008 || ev.code === 4403)) { st.lastError = 'الممر رفض الاتصال: هذا المعرّف مسجّل لمركز آخر'; st.enabled = false; emit(); return; }
      st.lastError = st.lastError || 'انقطع الاتصال بالممر — إعادة المحاولة';
      emit(); scheduleReconnect();
    };
    sock.onerror = (e) => { if (ws === sock) { st.lastError = errText(e && e.error ? e.error : e) || 'تعذّر الوصول للممر'; emit(); } };
  }

  connect();
  return {
    status: () => ({ ...st }),
    close: () => { stopped = true; clearTimeout(timer); clearInterval(pingTimer); try { if (ws) ws.close(); } catch { /* */ } },
  };
}

/* ------------------------------ الفرع (العميل) ------------------------------ */
function createBranchAgent({ store, cfg, appVersion, deviceName, applyIncoming, onStatus, infoForHq }) {
  const S = store.sync;
  const B = cfg.branch;
  const key = deriveKey(B.secret, B.id);
  const UPLOAD_SET = new Set(UPLOAD);
  const st = { connected: false, syncing: false, lastSyncAt: S.metaGet('br.lastSyncAt'), lastError: '', lastAttemptAt: null, hqName: B.hqName || '', uploaded: 0, downloaded: 0 };
  let timer = null;
  let nudgeTimer = null;
  let stopped = false;
  let running = null;

  const emit = () => { if (onStatus) { try { onStatus(status()); } catch { /* */ } } };
  const base = () => `http://${B.host.includes(':') && !B.host.startsWith('[') ? `[${B.host}]` : B.host}:${B.port}`;
  const R = B.relay && B.relay.url && B.relay.hqId ? B.relay : null;
  /** عنوان الإرسال: الممر إن كان مضبوطاً، وإلا العنوان المحلي كما كان */
  const target = () => (R ? `${R.url}/b/${encodeURIComponent(R.hqId)}` : `${base()}/sync/v1`);
  const unreachable = () => (R
    ? 'تعذّر الوصول للمركز عبر الممر — تأكد من اتصال الإنترنت في الفرع'
    : `تعذّر الوصول للمركز (${B.host}:${B.port}) — تأكد من الإنترنت وأن جهاز المركز يعمل وأن المنفذ مفتوح`);

  async function call(op, body, timeoutMs = 120000) {
    const nonce = crypto.randomBytes(12).toString('hex');
    const env = { v: 1, b: B.id, ...seal(key, { ts: Date.now(), nonce, op, body, version: appVersion, info: op === 'hello' || op === 'pull' ? infoForHq() : undefined }, `${B.id}|req`) };
    let res;
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (R) headers['x-sl-key'] = R.branchKey;
      res = await fetch(target(), { method: 'POST', headers, body: JSON.stringify(env), signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new Error(unreachable());
    }
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok || !data) throw new Error((data && data.error) || `رد غير متوقع من المركز (${res.status})`);
    let msg;
    try { msg = unseal(key, data, `${B.id}|res|${nonce}`); } catch { throw new Error('رد المركز غير موثوق (فشل التحقق من التشفير)'); }
    if (!msg.ok) throw new Error(msg.error || 'خطأ في المركز');
    return msg.body;
  }

  function resetDownload() { S.metaSet('br.init', false); S.metaSet('br.down', 0); S.metaSet('br.snap', null); }

  /** الرفع: أول مرة كل البيانات الموجودة، ثم التغييرات فقط من السجل */
  async function upload() {
    let sent = 0;
    if (!S.metaGet('br.upInit', false)) {
      const startSeq = S.maxSeq();
      for (const c of UPLOAD) {
        let after = '';
        for (;;) {
          const rows = S.snapshotPage(c, after, PUSH_BATCH);
          if (!rows.length) break;
          await call('push', { items: rows.map((r) => ({ c, id: r.id, op: 'u', pos: r.pos, data: r.data })), full: true });
          sent += rows.length;
          after = rows[rows.length - 1].id;
          if (rows.length < PUSH_BATCH) break;
        }
      }
      S.metaSet('br.up', startSeq);
      S.pruneLog(startSeq);
      S.metaSet('br.upInit', true);
    }
    for (;;) {
      const from = Number(S.metaGet('br.up', 0)) || 0;
      const rows = S.readLog(from, PUSH_BATCH);
      if (!rows.length) break;
      const items = materialize(S, collapse(rows, UPLOAD_SET));
      if (items.length) await call('push', { items });
      const last = rows[rows.length - 1].seq;
      S.metaSet('br.up', last);
      S.pruneLog(last);
      sent += items.length;
      if (rows.length < PUSH_BATCH) break;
    }
    return sent;
  }

  /** الاستلام: مزامنة كاملة أول مرة (أو بعد تغيّر المركز)، ثم التغييرات فقط */
  async function download() {
    let got = 0;
    for (let guard = 0; guard < 10000; guard++) {
      const body = { since: Number(S.metaGet('br.down', 0)) || 0, init: !!S.metaGet('br.init', false), epoch: S.metaGet('br.epoch', ''), snap: S.metaGet('br.snap', null) };
      const r = await call('pull', body);
      if (r.items && r.items.length) { applyIncoming(r.items, { full: r.mode === 'snap' }); got += r.items.length; }
      S.metaSet('br.epoch', r.epoch || '');
      if (r.mode === 'snap') {
        if (r.snap) { S.metaSet('br.snap', r.snap); continue; }
        S.metaSet('br.snap', null);
        S.metaSet('br.down', Number(r.seq) || 0);
        S.metaSet('br.init', true);
        continue; // نكمل بالتغييرات التي حصلت أثناء المزامنة الكاملة
      }
      S.metaSet('br.down', Number(r.seq) || 0);
      if (!r.more) break;
    }
    return got;
  }

  async function syncOnce() {
    if (running) return running;
    running = (async () => {
      st.syncing = true; st.lastAttemptAt = nowIso(); emit();
      try {
        const up = await upload();
        const down = await download();
        st.connected = true; st.lastError = ''; st.lastSyncAt = nowIso();
        st.uploaded += up; st.downloaded += down;
        S.metaSet('br.lastSyncAt', st.lastSyncAt);
        return { ok: true, up, down };
      } catch (e) {
        st.connected = false; st.lastError = errText(e);
        return { ok: false, error: st.lastError };
      } finally {
        st.syncing = false; running = null; emit();
      }
    })();
    return running;
  }

  async function hello() {
    const r = await call('hello', {}, 15000);
    if (r && r.hqName) st.hqName = r.hqName;
    return r;
  }

  function status() {
    return {
      ...st,
      pendingUp: S.pendingAfter(Number(S.metaGet('br.up', 0)) || 0) + (S.metaGet('br.upInit', false) ? 0 : 1),
      initialized: !!S.metaGet('br.init', false),
      host: B.host, port: B.port, branchId: B.id, code: B.code, name: B.name,
    };
  }

  return {
    start() {
      stopped = false;
      const tick = () => { if (stopped) return; void syncOnce().finally(() => { if (!stopped) timer = setTimeout(tick, cfg.intervalSec * 1000); }); };
      timer = setTimeout(tick, 4000);
    },
    stop() { stopped = true; clearTimeout(timer); clearTimeout(nudgeTimer); },
    /** تغيّر شيء محلياً: مزامنة قريبة (بعد 8 ثوانٍ من آخر تغيير) بدل انتظار الدورة */
    nudge() { if (stopped) return; clearTimeout(nudgeTimer); nudgeTimer = setTimeout(() => { void syncOnce(); }, 8000); },
    syncNow: syncOnce,
    hello,
    status,
    resetDownload,
  };
}

/** يدمج سجلاً وصل من المركز مع النسخة المحلية مع إبقاء حقول الفرع الخاصة */
function mergeIncoming(collection, local, incoming) {
  const keep = LOCAL_FIELDS[collection] || [];
  const out = { ...incoming };
  for (const k of keep) {
    if (local && Object.prototype.hasOwnProperty.call(local, k)) out[k] = local[k];
    else delete out[k];
  }
  if (!local && LOCAL_DEFAULTS[collection]) Object.assign(out, LOCAL_DEFAULTS[collection]);
  return out;
}

/** يحوّل ما وصل من المركز إلى عمليات حفظ (patch) لكل مجموعة */
function incomingToOps(store, items) {
  const by = new Map();
  for (const it of items || []) {
    if (!it || !MASTER.includes(it.c)) continue;
    if (!by.has(it.c)) by.set(it.c, { upserts: [], removes: [] });
    const g = by.get(it.c);
    if (it.op === 'd') { if (store.net.getRecord(it.c, it.id)) g.removes.push(String(it.id)); continue; }
    let inc;
    try { inc = JSON.parse(it.data); } catch { continue; }
    if (!inc || typeof inc !== 'object') continue;
    const cur = store.net.getRecord(it.c, it.id);
    const merged = mergeIncoming(it.c, cur && cur.item, inc);
    if (cur && cur.item && JSON.stringify(cur.item) === JSON.stringify(merged)) continue;
    g.upserts.push(merged);
  }
  const ops = [];
  for (const [name, g] of by) {
    if (!g.upserts.length && !g.removes.length) continue;
    const n = g.upserts.length;
    ops.push({ t: 'patch', name, patch: { upserts: g.upserts.map((item, i) => [String(item.id), i, item]), removes: g.removes, count: n, tail: n } });
  }
  return ops;
}

/* ------------------------------ المدير العام ------------------------------ */
/**
 * network: موجّه البيانات (network.cjs) — يُستعمل لكتابة ما يصل من المركز عبر الدمج وبثّه للشاشة
 */
function createBranchSync({ userDataDir, store, network, appVersion, deviceName, send }) {
  const { cfg, save } = loadBranchConfig(userDataDir);
  const S = store.sync;
  const emit = (ch, d) => { try { send(ch, d); } catch { /* */ } };
  let hq = null;
  let agent = null;
  let relayLink = null;

  /** بيانات الممر التي تُوضع في رمز الربط (بلا المفتاح السرّي للمركز) */
  function relayPublic() {
    const r = cfg.hq.relay;
    return r && r.url && r.hqId && r.branchKey ? { url: r.url, hqId: r.hqId, branchKey: r.branchKey } : null;
  }
  let blocked = '';
  let unsubscribe = null;

  const lanRole = () => (network && network.role ? network.role() : 'standalone');

  function infoForHq() {
    // ملخص صغير يظهر في شاشة المركز (بلا بيانات حساسة)
    return { device: deviceName || os.hostname(), lan: lanRole() };
  }

  function start() {
    const tracked = cfg.mode === 'branch' ? UPLOAD : cfg.mode === 'hq' ? MASTER : [];
    if (lanRole() === 'client' && cfg.mode !== 'none') {
      blocked = 'هذا الجهاز «فرعي» في الشبكة المحلية — المزامنة مع المركز تتم من الجهاز الرئيسي لهذا الموقع';
      return;
    }
    const changed = S.setTracked(tracked);
    if (cfg.mode === 'hq') {
      hq = startHq({ store, cfg, appVersion, onBranchSeen: () => emit('branches:changed', {}) });
      if (changed) hq.resetEpoch();
      if (cfg.hq.relay && cfg.hq.relay.url && cfg.hq.relay.hqId && cfg.hq.relay.hqKey) {
        relayLink = createRelayLink({
          relay: cfg.hq.relay, appVersion, processEnvelope: hq.processEnvelope,
          onStatus: (s) => emit('branches:relay', s),
        });
      }
    } else if (cfg.mode === 'branch') {
      if (changed) S.metaSet('br.upInit', false); // مجموعة جديدة تُرفع: رفع كامل مرة واحدة (لا يتكرر شيء في المركز)
      agent = createBranchAgent({
        store, cfg, appVersion, deviceName, infoForHq,
        applyIncoming: (items) => {
          const ops = incomingToOps(store, items);
          if (ops.length) network.applyExternal(ops, 'hq');
        },
        onStatus: (s) => emit('branches:status', s),
      });
      agent.start();
      const ns = network.netstore && network.netstore();
      if (ns) unsubscribe = ns.onChange((e) => { if (e.origin !== 'hq' && e.changes.some((c) => c.t === 'c' && UPLOAD.includes(c.name))) agent.nudge(); });
    } else if (changed) {
      S.clearLog();
    }
  }

  function info() {
    const out = { mode: cfg.mode, intervalSec: cfg.intervalSec, blocked, lanRole: lanRole(), localIps: localIps(), defaultPort: DEFAULT_PORT };
    if (cfg.mode === 'hq' || cfg.hq.publicHost) {
      // المفتاح السرّي للمركز لا يخرج إلى الواجهة
      const r = cfg.hq.relay;
      out.hq = { ...cfg.hq, relay: r ? { url: r.url, hqId: r.hqId, configured: !!r.hqKey } : null, server: hq ? hq.status() : null, relayStatus: relayLink ? relayLink.status() : null };
    }
    if (cfg.mode === 'hq') out.branches = listBranches();
    if (cfg.branch) out.branch = { host: cfg.branch.host, port: cfg.branch.port, id: cfg.branch.id, name: cfg.branch.name, code: cfg.branch.code, hqName: cfg.branch.hqName, viaRelay: !!(cfg.branch.relay && cfg.branch.relay.url), sync: agent ? agent.status() : null };
    return out;
  }

  function listBranches() {
    return S.branches.list().map((b) => {
      let extra = null;
      try { extra = b.info ? JSON.parse(b.info) : null; } catch { extra = null; }
      const counts = {};
      for (const r of S.branches.counts(b.id)) counts[r.collection] = r.c;
      return { id: b.id, code: b.code, name: b.name, status: b.status, createdAt: b.created_at, lastSeenAt: b.last_seen_at, lastIp: b.last_ip, appVersion: b.app_version, pulledSeq: b.pulled_seq, info: extra, counts };
    });
  }

  function hostForLinks() {
    return cfg.hq.publicHost || localIps()[0] || '127.0.0.1';
  }
  function linkCodeFor(id) {
    const b = S.branches.get(id);
    if (!b) throw new Error('الفرع غير موجود');
    return makeLinkCode({ host: hostForLinks(), port: cfg.hq.port, id: b.id, secret: b.secret, name: b.name, code: b.code, hqName: cfg.hq.name, relay: relayPublic() });
  }

  const normCode = (c) => String(c || '').trim().toUpperCase().replace(/[^A-Z0-9\-]/g, '').slice(0, 12);

  /** حفظ الدور — يسري بعد إعادة التشغيل */
  function configure(input = {}) {
    const next = JSON.parse(JSON.stringify(cfg));
    const mode = ['none', 'hq'].includes(input.mode) ? input.mode : input.mode === 'branch' ? 'branch' : cfg.mode;
    if (mode === 'branch' && !cfg.branch) return { ok: false, error: 'للتحويل إلى فرع الصق «رمز الربط» من المركز' };
    next.mode = mode;
    if (input.publicHost != null) {
      const h = String(input.publicHost).trim();
      if (h && !/^[A-Za-z0-9.\-]+$/.test(h)) return { ok: false, error: 'العنوان العام غير صالح (اكتب IP أو اسم نطاق مثل shop.ddns.net بلا http)' };
      next.hq.publicHost = h;
    }
    if (input.port != null) {
      const p = Number(input.port);
      if (!(p > 1024 && p < 65536)) return { ok: false, error: 'رقم المنفذ غير صالح' };
      next.hq.port = p;
    }
    if (input.hqName != null) next.hq.name = String(input.hqName).trim().slice(0, 60);
    if (input.relayUrl != null) {
      const raw = String(input.relayUrl).trim();
      if (!raw) {
        next.hq.relay = null; // إيقاف الممر: الفروع الجديدة ترجع للعنوان المحلي
      } else {
        let u;
        try { u = new URL(raw.includes('://') ? raw : `https://${raw}`); } catch { return { ok: false, error: 'عنوان الممر غير صالح' }; }
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, error: 'عنوان الممر يجب أن يبدأ بـ https' };
        const cur = next.hq.relay;
        next.hq.relay = {
          url: u.origin,
          // تُولَّد مرة واحدة وتبقى: تغييرها يُبطل رموز الربط الموزّعة على الفروع
          hqId: (cur && cur.hqId) || crypto.randomBytes(12).toString('base64url'),
          hqKey: (cur && cur.hqKey) || crypto.randomBytes(32).toString('base64url'),
          branchKey: (cur && cur.branchKey) || crypto.randomBytes(24).toString('base64url'),
        };
      }
    }
    if (input.intervalSec != null) next.intervalSec = Math.min(3600, Math.max(15, Number(input.intervalSec) || 60));
    if (mode === 'none' && cfg.mode === 'branch') next.branch = null;
    const relayChanged = JSON.stringify(next.hq.relay || null) !== JSON.stringify(cfg.hq.relay || null);
    const needsRestart = next.mode !== cfg.mode || next.hq.port !== cfg.hq.port || next.intervalSec !== cfg.intervalSec || relayChanged;
    if (next.mode !== cfg.mode) { S.metaSet('br.upInit', false); resetBranchMeta(); }
    Object.assign(cfg, next);
    save(cfg);
    return { ok: true, needsRestart };
  }

  function resetBranchMeta() {
    for (const k of ['br.up', 'br.down', 'br.epoch', 'br.lastSyncAt']) S.metaSet(k, k === 'br.epoch' || k === 'br.lastSyncAt' ? '' : 0);
    S.metaSet('br.init', false); S.metaSet('br.upInit', false); S.metaSet('br.snap', null);
  }

  /** الفرع: اختبار رمز الربط بالاتصال بالمركز (دون حفظ) */
  async function testLink(code) {
    let link;
    try { link = parseLinkCode(code); } catch (e) { return { ok: false, error: errText(e) }; }
    const tmp = createBranchAgent({ store, cfg: { ...cfg, branch: link }, appVersion, deviceName, infoForHq, applyIncoming: () => {}, onStatus: null });
    try {
      const r = await tmp.hello();
      return { ok: true, hqName: r.hqName, version: r.version, branch: r.branch, host: link.host, port: link.port };
    } catch (e) {
      return { ok: false, error: errText(e) };
    }
  }

  /** الفرع: ربط هذا الجهاز بالمركز برمز الربط — يسري بعد إعادة التشغيل */
  async function join(code) {
    if (lanRole() === 'client') return { ok: false, error: 'هذا الجهاز «فرعي» في الشبكة المحلية — اربط الجهاز الرئيسي لهذا الموقع بالمركز' };
    if (cfg.mode === 'hq') return { ok: false, error: 'هذا الجهاز مركز رئيسي — ألغِ وضع المركز أولاً' };
    const t = await testLink(code);
    if (!t.ok) return t;
    const link = parseLinkCode(code);
    cfg.branch = { ...link, hqName: t.hqName || link.hqName, name: (t.branch && t.branch.name) || link.name, code: (t.branch && t.branch.code) || link.code };
    cfg.mode = 'branch';
    resetBranchMeta();
    save(cfg);
    return { ok: true, needsRestart: true, hqName: cfg.branch.hqName, branch: t.branch };
  }

  /* --------- إدارة الفروع (المركز) --------- */
  function addBranch({ name, code } = {}) {
    if (cfg.mode !== 'hq') throw new Error('فعّل وضع «المركز الرئيسي» أولاً');
    const nm = String(name || '').trim().slice(0, 60);
    if (!nm) throw new Error('اكتب اسم الفرع');
    let cd = normCode(code);
    if (!cd) { let i = S.branches.list().length + 1; do { cd = `B${String(i).padStart(2, '0')}`; i++; } while (S.branches.byCode(cd)); }
    if (S.branches.byCode(cd)) throw new Error(`الرمز ${cd} مستخدم لفرع آخر`);
    const id = crypto.randomBytes(8).toString('hex');
    S.branches.add({ id, code: cd, name: nm, secret: b64u(crypto.randomBytes(32)) });
    return { branch: listBranches().find((b) => b.id === id), linkCode: linkCodeFor(id) };
  }
  function updateBranch(id, { name, code }) {
    const b = S.branches.get(id);
    if (!b) throw new Error('الفرع غير موجود');
    const cd = code != null ? normCode(code) : b.code;
    const other = S.branches.byCode(cd);
    if (other && other.id !== b.id) throw new Error(`الرمز ${cd} مستخدم لفرع آخر`);
    S.branches.update(id, { name: name != null ? String(name).trim().slice(0, 60) || b.name : b.name, code: cd || b.code });
    return true;
  }
  /** مفتاح جديد: الرمز القديم يتوقف فوراً (جهاز مسروق/موظف سابق) */
  function rekeyBranch(id) {
    const b = S.branches.get(id);
    if (!b) throw new Error('الفرع غير موجود');
    store.db.prepare('UPDATE branches SET secret = ? WHERE id = ?').run(b64u(crypto.randomBytes(32)), b.id);
    return linkCodeFor(id);
  }

  return {
    start,
    info,
    configure,
    testLink,
    join,
    addBranch,
    updateBranch,
    rekeyBranch,
    setBranchActive: (id, on) => S.branches.setStatus(id, on ? 'active' : 'suspended'),
    removeBranch: (id, purge) => S.branches.remove(id, !!purge),
    linkCode: linkCodeFor,
    /** بيانات فرع (كما رفعها) لشاشات المركز والتقارير الموحّدة */
    branchData(id, collections) {
      const out = {};
      for (const c of Array.isArray(collections) ? collections : UPLOAD) if (UPLOAD.includes(c)) out[c] = S.branches.read(id, c);
      return out;
    },
    syncNow: () => (agent ? agent.syncNow() : Promise.resolve({ ok: false, error: blocked || 'هذا الجهاز ليس فرعاً مرتبطاً' })),
    mode: () => cfg.mode,
    dispose: async () => { if (unsubscribe) unsubscribe(); if (agent) agent.stop(); if (relayLink) relayLink.close(); if (hq) await hq.close(); },
  };
}

module.exports = {
  createBranchSync, loadBranchConfig, startHq, createBranchAgent, incomingToOps, mergeIncoming,
  makeLinkCode, parseLinkCode, deriveKey, seal, unseal, UPLOAD, MASTER, LOCAL_FIELDS, DEFAULT_PORT,
};
