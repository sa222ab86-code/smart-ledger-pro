'use strict';
/**
 * نسخة Pro — ربط عدة أجهزة على الشبكة المحلية (للفروع البعيدة عبر الإنترنت: branchsync.cjs).
 *
 *  - مستقل (الافتراضي): الجهاز يعمل وحده كالنسخة العادية
 *  - رئيسي: يحمل قاعدة البيانات المشتركة ويفتح خدمة على الشبكة المحلية (منفذ 47820) برمز ربط سري
 *  - فرعي: يقرأ ويكتب على الجهاز الرئيسي، ويحتفظ محلياً فقط بإعداداته الخاصة (طابعات، ميزان، مظهر)
 *    وبالفوترة الإلكترونية الخاصة به (كل جهاز «وحدة» مستقلة لدى هيئة الزكاة)
 * الأجهزة تجد الرئيسي تلقائياً عبر بث UDP على المنفذ 47821.
 */
const http = require('node:http');
const dgram = require('node:dgram');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createNetStore, opIsLocal, LOCAL_KV, LOCAL_COLLECTIONS } = require('./netstore.cjs');

const DEFAULT_PORT = 47820;
const DISCOVERY_PORT = 47821;
const DISCOVER_MSG = 'SLPRO_DISCOVER_V1';
const APP_ID = 'smart-ledger';
const MAX_BODY = 200 * 1024 * 1024;
const POLL_WAIT_MS = 25000;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const randomCode = (n) => Array.from(crypto.randomBytes(n), (b) => ALPHABET[b % ALPHABET.length]).join('');
const newToken = () => `${randomCode(4)}-${randomCode(4)}-${randomCode(4)}`;
const normToken = (t) => String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const normTag = (t) => String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 2);

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function localIps() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) if (n && n.family === 'IPv4' && !n.internal) out.push(n.address);
  }
  return out;
}

/* ------------------------------ الإعدادات ------------------------------ */
function loadConfig(userDataDir) {
  const file = path.join(userDataDir, 'network.json');
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* أول تشغيل */ }
  const out = {
    role: ['standalone', 'server', 'client'].includes(cfg.role) ? cfg.role : 'standalone',
    port: Number(cfg.port) > 0 && Number(cfg.port) < 65536 ? Number(cfg.port) : DEFAULT_PORT,
    host: String(cfg.host || ''),
    token: String(cfg.token || ''),
    tag: normTag(cfg.tag),
    deviceId: String(cfg.deviceId || '') || crypto.randomBytes(8).toString('hex'),
    // اسم اختياري يكتبه المستخدم (كاشير 2...) — اسم ويندوز القديم المحفوظ تلقائياً لا يُعتبر اسماً
    deviceName: cfg.deviceName && cfg.deviceName !== os.hostname() ? String(cfg.deviceName) : '',
  };
  if (out.role === 'server' && !out.token) out.token = newToken();
  if (out.role !== 'standalone' && !out.tag) out.tag = out.role === 'server' ? 'A' : 'B';
  const save = (c) => { try { fs.writeFileSync(file, JSON.stringify(c, null, 2), 'utf8'); } catch (e) { console.error('[net] config save', e); } };
  if (JSON.stringify(cfg) !== JSON.stringify(out)) save(out);
  return { cfg: out, save };
}

/* ------------------------------ الخادم (الجهاز الرئيسي) ------------------------------ */
function startServer({ netstore, cfg, appVersion, onClientsChanged }) {
  const clients = new Map(); // deviceId → { tag, name, ip, lastSeen }
  const token = normToken(cfg.token);

  const send = (res, code, obj) => {
    const body = JSON.stringify(obj);
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
  };
  const readBody = (req) => new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });

  const touch = (req, extra = {}) => {
    const id = String(req.headers['x-device'] || '');
    if (!id) return;
    const prev = clients.get(id) || {};
    clients.set(id, { ...prev, ...extra, ip: (req.socket.remoteAddress || '').replace(/^::ffff:/, ''), lastSeen: new Date().toISOString() });
    if (onClientsChanged) onClientsChanged();
  };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!safeEqual(normToken(auth), token)) return send(res, 401, { ok: false, error: 'رمز الربط غير صحيح' });
      const device = String(req.headers['x-device'] || '');

      if (req.method === 'GET' && url.pathname === '/api/hello') {
        touch(req);
        return send(res, 200, { ok: true, app: APP_ID, name: cfg.deviceName || os.hostname(), version: appVersion, epoch: netstore.epoch(), rev: netstore.rev(), tag: cfg.tag });
      }
      if (req.method === 'POST' && url.pathname === '/api/register') {
        const body = await readBody(req);
        const tag = normTag(body.tag);
        if (!tag) return send(res, 400, { ok: false, error: 'رمز الجهاز مطلوب' });
        if (tag === cfg.tag) return send(res, 409, { ok: false, error: `الرمز ${tag} مستخدم للجهاز الرئيسي — اختر رمزاً آخر` });
        for (const [id, c] of clients) if (id !== device && c.tag === tag) return send(res, 409, { ok: false, error: `الرمز ${tag} مستخدم لجهاز آخر (${c.name || c.ip})` });
        touch(req, { tag, name: String(body.name || '') });
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/api/load') {
        touch(req);
        return send(res, 200, netstore.loadShared());
      }
      if (req.method === 'POST' && url.pathname === '/api/batch') {
        touch(req);
        const body = await readBody(req);
        try {
          return send(res, 200, netstore.apply(body.ops, device || 'unknown'));
        } catch (e) {
          return send(res, 400, { ok: false, error: String((e && e.message) || e) });
        }
      }
      if (req.method === 'GET' && url.pathname === '/api/events') {
        touch(req);
        const r = await netstore.waitChanges(url.searchParams.get('since'), url.searchParams.get('epoch'), device, POLL_WAIT_MS);
        if (res.writableEnded || req.destroyed) return undefined;
        return send(res, 200, r);
      }
      return send(res, 404, { ok: false, error: 'not found' });
    } catch (e) {
      console.error('[net] request failed', e);
      try { send(res, 500, { ok: false, error: String((e && e.message) || e) }); } catch { /* */ }
      return undefined;
    }
  });
  server.requestTimeout = 0;
  server.keepAliveTimeout = 30000;
  server.headersTimeout = 60000;

  let listening = false;
  let error = null;
  server.on('error', (e) => {
    error = e.code === 'EADDRINUSE' ? `المنفذ ${cfg.port} مستخدم من برنامج آخر` : String(e.message || e);
    console.error('[net] server error', e);
  });
  server.listen(cfg.port, '0.0.0.0', () => { listening = true; error = null; });

  // الاكتشاف التلقائي: الأجهزة الفرعية تبث سؤالاً والرئيسي يرد بعنوانه
  const udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  udp.on('message', (msg, rinfo) => {
    if (msg.toString() !== DISCOVER_MSG) return;
    const reply = Buffer.from(JSON.stringify({ app: APP_ID, name: cfg.deviceName || os.hostname(), port: cfg.port, version: appVersion }));
    udp.send(reply, rinfo.port, rinfo.address);
  });
  udp.on('error', (e) => console.error('[net] discovery', e));
  try { udp.bind(DISCOVERY_PORT); } catch (e) { console.error('[net] discovery bind', e); }

  return {
    status: () => ({ listening, error, port: cfg.port, ips: localIps() }),
    clients: () => Array.from(clients, ([id, c]) => ({ deviceId: id, ...c })),
    close: () => { try { server.close(); } catch { /* */ } try { udp.close(); } catch { /* */ } },
  };
}

/* ------------------------------ العميل (الجهاز الفرعي) ------------------------------ */
function createClient({ cfg, onChanges, onReload, onResync, onStatus }) {
  const base = () => `http://${cfg.host}:${cfg.port}`;
  const headers = { Authorization: `Bearer ${normToken(cfg.token)}`, 'Content-Type': 'application/json', 'X-Device': cfg.deviceId };
  let rev = 0;
  let epoch = '';
  let running = false;
  let connected = false;
  let lastError = '';

  const setStatus = (c, err = '') => {
    if (c === connected && err === lastError) return;
    connected = c; lastError = err;
    if (onStatus) onStatus({ connected, error: lastError, host: cfg.host, port: cfg.port });
  };

  async function call(method, p, body, timeoutMs = 30000) {
    let res;
    try {
      res = await fetch(base() + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      setStatus(false, `تعذّر الاتصال بالجهاز الرئيسي (${cfg.host}) — تأكد أنه يعمل وعلى نفس الشبكة`);
      throw new Error(`تعذّر الاتصال بالجهاز الرئيسي (${cfg.host}:${cfg.port})`);
    }
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok || (data && data.ok === false)) {
      const msg = (data && data.error) || `خطأ من الجهاز الرئيسي (${res.status})`;
      if (res.status === 401) setStatus(false, msg);
      throw new Error(msg);
    }
    setStatus(true);
    return data;
  }

  async function register() {
    return call('POST', '/api/register', { tag: cfg.tag, name: cfg.deviceName }, 10000);
  }

  async function load() {
    await register();
    const r = await call('POST', '/api/load', {}, 120000);
    rev = r.rev; epoch = r.epoch;
    return r;
  }

  async function loop() {
    while (running) {
      try {
        const r = await call('GET', `/api/events?since=${rev}&epoch=${encodeURIComponent(epoch)}`, undefined, POLL_WAIT_MS + 15000);
        if (r.reload) {
          // الجهاز الرئيسي أُعيد تشغيله (جلسة جديدة): نكمل الاستماع من حالته الحالية دون إعادة تحميل الشاشة،
          // ويظهر للكاشير زر «تحديث» اختياري (لو استُعيدت نسخة احتياطية على الرئيسي مثلاً)
          if (epoch && r.epoch && r.epoch !== epoch) { epoch = r.epoch; rev = r.rev; if (onResync) onResync(); continue; }
          running = false; if (onReload) onReload(); return;
        }
        if (r.changes && r.changes.length && onChanges) onChanges(r.changes);
        rev = r.rev;
      } catch {
        await new Promise((res) => setTimeout(res, 3000));
      }
    }
  }

  return {
    load,
    start: () => { if (!running) { running = true; void loop(); } },
    stop: () => { running = false; },
    batch: (ops) => call('POST', '/api/batch', { ops }, 120000),
    status: () => ({ connected, error: lastError, host: cfg.host, port: cfg.port }),
  };
}

/** اختبار اتصال قبل الحفظ (من شاشة الإعدادات) */
async function testConnection({ host, port, token }) {
  try {
    const res = await fetch(`http://${host}:${Number(port) || DEFAULT_PORT}/api/hello`, {
      headers: { Authorization: `Bearer ${normToken(token)}` }, signal: AbortSignal.timeout(6000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.ok) return { ok: false, error: (data && data.error) || `رد غير متوقع (${res.status})` };
    return { ok: true, name: data.name, version: data.version, tag: data.tag };
  } catch {
    return { ok: false, error: `لا يوجد رد من ${host} — تأكد أن الجهاز الرئيسي يعمل وأن جدار الحماية يسمح للبرنامج` };
  }
}

/** البحث عن الأجهزة الرئيسية على الشبكة (بث UDP) */
function discover(timeoutMs = 1800) {
  return new Promise((resolve) => {
    const found = new Map();
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    sock.on('message', (msg, rinfo) => {
      try {
        const d = JSON.parse(msg.toString());
        if (d.app === APP_ID) found.set(`${rinfo.address}:${d.port}`, { host: rinfo.address, port: d.port, name: d.name, version: d.version });
      } catch { /* */ }
    });
    sock.on('error', () => { /* */ });
    sock.bind(0, () => {
      try {
        sock.setBroadcast(true);
        const m = Buffer.from(DISCOVER_MSG);
        sock.send(m, DISCOVERY_PORT, '255.255.255.255');
        // بث على كل شبكة محلية أيضاً (بعض الراوترات تحجب 255.255.255.255)
        for (const ip of localIps()) {
          const parts = ip.split('.');
          if (parts.length === 4) sock.send(m, DISCOVERY_PORT, `${parts[0]}.${parts[1]}.${parts[2]}.255`);
        }
      } catch { /* */ }
    });
    setTimeout(() => { try { sock.close(); } catch { /* */ } resolve(Array.from(found.values())); }, timeoutMs);
  });
}

/* ------------------------------ موجّه البيانات ------------------------------ */
/**
 * واجهة موحدة لأوامر db:* حسب دور الجهاز. كل الدوال قد تعيد Promise.
 *  - مستقل: قاعدة البيانات المحلية مباشرة (كالنسخة العادية)
 *  - رئيسي: عبر netstore (كتابة متسامحة + بث التغييرات للأجهزة الفرعية)
 *  - فرعي: الإعدادات الخاصة محلياً، وكل ما عداها على الجهاز الرئيسي
 */
function createNetwork({ userDataDir, store, appVersion, send, merged = false }) {
  const { cfg, save } = loadConfig(userDataDir);
  let netstore = null;
  let server = null;
  let client = null;
  let clientStatus = { connected: false, error: '' };
  /*
   * merged (ربط الفروع — الجهاز فرع): حتى الجهاز المستقل يكتب عبر netstore (دمج حقلاً بحقل)
   * كي لا يمسح بيعٌ محلي معلّق سعراً جديداً وصل من المركز في نفس اللحظة.
   */
  const useMerge = cfg.role === 'standalone' && !!merged;

  const emit = (channel, data) => { try { send(channel, data); } catch { /* */ } };

  if (cfg.role === 'server' || useMerge) {
    netstore = createNetStore(store);
    if (cfg.role === 'server') server = startServer({ netstore, cfg, appVersion, onClientsChanged: () => {} });
    // تغييرات الأجهزة الفرعية (أو المركز) → شاشة هذا الجهاز نفسه
    netstore.onChange((e) => { if (e.origin !== 'self') emit('net:changes', e.changes); });
  } else if (cfg.role === 'client') {
    client = createClient({
      cfg,
      onChanges: (changes) => emit('net:changes', changes),
      onReload: () => emit('net:reload', {}),
      onResync: () => emit('net:resync', {}),
      onStatus: (s) => { clientStatus = s; emit('net:status', s); },
    });
  }

  const splitLocal = (ops) => {
    const local = [], remote = [];
    for (const op of ops || []) (opIsLocal(op) ? local : remote).push(op);
    return { local, remote };
  };

  const data = {
    async loadAll() {
      if (cfg.role !== 'client') return store.loadAll();
      const remote = await client.load();
      const mine = store.loadAll();
      const collections = { ...remote.collections };
      for (const k of LOCAL_COLLECTIONS) if (mine.collections[k]) collections[k] = mine.collections[k];
      const kv = { ...remote.kv };
      for (const k of LOCAL_KV) if (k in mine.kv) kv[k] = mine.kv[k];
      client.start();
      return { collections, kv };
    },
    async batch(ops) {
      if (cfg.role === 'standalone' && !useMerge) { store.applyBatch(ops); return true; }
      if (cfg.role === 'server' || useMerge) return netstore.apply(ops, 'self', { self: true });
      const { local, remote } = splitLocal(ops);
      if (local.length) store.applyBatch(local);
      if (!remote.length) return { ok: true, changes: [] };
      return client.batch(remote);
    },
    /** الحفظ المتزامن عند الإغلاق: غير متاح للجهاز الفرعي (يُحفظ قبل الإغلاق عبر app:flushBeforeClose) */
    batchSync(ops) {
      if (cfg.role === 'standalone' && !useMerge) { store.applyBatch(ops); return true; }
      if (cfg.role === 'server' || useMerge) { netstore.apply(ops, 'self', { self: true }); return true; }
      return false;
    },
    saveCollection: (name, items) => data.batch([{ t: 'save', name, items }]),
    patchCollection: (name, patch) => data.batch([{ t: 'patch', name, patch }]),
    saveKv: (key, value) => data.batch([{ t: 'kv', key, value }]),
  };

  function info() {
    return {
      edition: 'pro',
      role: cfg.role,
      /** الحفظ بالدمج مفعّل (الجهاز فرع مرتبط بالمركز) — الواجهة ترسل «ما كانت تعرفه» مع كل تعديل */
      merged: useMerge,
      tag: cfg.role === 'standalone' ? '' : cfg.tag,
      deviceId: cfg.deviceId,
      deviceName: cfg.deviceName,
      host: cfg.host,
      port: cfg.port,
      // رمز الربط يظهر فقط على الجهاز الرئيسي (لإدخاله في الأجهزة الفرعية)
      token: cfg.role === 'server' ? cfg.token : '',
      hasToken: !!cfg.token,
      server: server ? server.status() : null,
      clients: server ? server.clients() : [],
      connection: client ? client.status() : null,
      localIps: localIps(),
    };
  }

  /** يحفظ الإعدادات الجديدة — تسري بعد إعادة تشغيل البرنامج */
  function configure(input = {}) {
    const role = ['standalone', 'server', 'client'].includes(input.role) ? input.role : cfg.role;
    const next = { ...cfg, role };
    if (input.deviceName != null) next.deviceName = String(input.deviceName).slice(0, 40);
    if (role !== 'standalone') {
      const tag = normTag(input.tag != null ? input.tag : cfg.tag);
      if (!tag) return { ok: false, error: 'اختر رمزاً قصيراً لهذا الجهاز (حرف أو رقم، مثل A أو B)' };
      next.tag = tag;
    }
    if (input.port != null) {
      const p = Number(input.port);
      if (!(p > 1024 && p < 65536)) return { ok: false, error: 'رقم المنفذ غير صالح' };
      next.port = p;
    }
    if (role === 'server') {
      if (input.regenerateToken || !next.token) next.token = newToken();
    }
    if (role === 'client') {
      const host = String(input.host != null ? input.host : cfg.host).trim();
      if (!/^[A-Za-z0-9.\-]+$/.test(host)) return { ok: false, error: 'عنوان الجهاز الرئيسي غير صالح' };
      if (input.token != null) next.token = String(input.token).trim();
      if (!normToken(next.token)) return { ok: false, error: 'أدخل رمز الربط الظاهر في الجهاز الرئيسي' };
      next.host = host;
    }
    const changed = JSON.stringify(next) !== JSON.stringify(cfg);
    Object.assign(cfg, next);
    save(cfg);
    return { ok: true, needsRestart: changed };
  }

  return {
    data,
    info,
    configure,
    discover,
    test: testConnection,
    role: () => cfg.role,
    tag: () => (cfg.role === 'standalone' ? '' : cfg.tag),
    /** مخزن الدمج (الجهاز الرئيسي أو الفرع) — null للجهاز المستقل العادي والجهاز الفرعي */
    netstore: () => netstore,
    /**
     * كتابة تغييرات وصلت من خارج الجهاز (المركز): عبر الدمج فتُبث للشاشة وللأجهزة الفرعية في الشبكة المحلية،
     * أو مباشرة على القاعدة إن لم يوجد مخزن دمج
     */
    applyExternal(ops, origin = 'hq') {
      if (netstore) return netstore.apply(ops, origin);
      store.applyBatch(ops);
      return { ok: true, changes: [] };
    },
    dispose: () => { if (server) server.close(); if (client) client.stop(); },
  };
}

module.exports = { createNetwork, testConnection, discover, loadConfig, startServer, createClient, DEFAULT_PORT };
