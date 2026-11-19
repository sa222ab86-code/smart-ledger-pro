/**
 * ممر Smart Ledger Pro — Cloudflare Worker + Durable Object.
 *
 * المشكلة: جهاز المركز خلف راوتر، فلا تستطيع الفروع الاتصال به مباشرة بلا فتح بورت.
 * الحل: المركز يفتح اتصالاً خارجاً إلى هذا الممر ويبقيه، والفرع يرسل إلى الممر فيمرّره.
 *
 * الممر لا يفك أي تشفير ولا يخزّن أي بيانات محاسبية: محتوى الرسالة مختوم بـ AES-256-GCM
 * بمفتاح لا يعرفه إلا المركز وفرعه. هنا يُنقل الظرف مغلقاً كما وصل.
 *
 * المسارات:
 *   GET  /                 معلومات
 *   GET  /hq?id=&k=&bk=    (ترقية WebSocket) اتصال المركز الدائم
 *   POST /b/<id>           طلب فرع، مع ترويسة x-sl-key
 */

const MAX_BODY = 24 * 1024 * 1024; // دون حد رسالة WebSocket (32 ميغابايت)
const REPLY_TIMEOUT_MS = 90 * 1000;
const MAX_INFLIGHT = 64;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** مقارنة بزمن ثابت: لا تكشف المفتاح الصحيح عبر فروق التوقيت */
function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
const validId = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(s);

export class HqLink {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.pending = new Map(); // rid → { resolve, timer }
    this.seq = 0;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/hq') return this.connectHq(request, url);
    if (url.pathname === '/b') return this.fromBranch(request);
    return json({ ok: false, error: 'not found' }, 404);
  }

  /** المركز يتصل ويبقى متصلاً */
  async connectHq(request, url) {
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return json({ ok: false, error: 'expected websocket' }, 426);
    const hqKey = url.searchParams.get('k') || '';
    const branchKey = url.searchParams.get('bk') || '';
    if (hqKey.length < 20) return json({ ok: false, error: 'bad key' }, 400);

    const stored = await this.ctx.storage.get('hqKeyHash');
    const incoming = await sha256(hqKey);
    if (!stored) {
      // أول اتصال يملك هذا المعرّف: تُسجَّل هويته ولا يقبل الممر غيره بعدها
      await this.ctx.storage.put('hqKeyHash', incoming);
    } else if (!sameSecret(stored, incoming)) {
      return json({ ok: false, error: 'this id belongs to another HQ' }, 403);
    }
    if (branchKey.length >= 16) await this.ctx.storage.put('branchKeyHash', await sha256(branchKey));

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, ['hq']); // مع الإسبات: الاتصال الخامل لا يكلّف شيئاً
    return new Response(null, { status: 101, webSocket: client });
  }

  /** طلب قادم من فرع: يُمرَّر إلى المركز وينتظر رده */
  async fromBranch(request) {
    if (request.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
    const keyHash = await this.ctx.storage.get('branchKeyHash');
    const given = request.headers.get('x-sl-key') || '';
    if (!keyHash || !sameSecret(keyHash, await sha256(given))) {
      return json({ ok: false, code: 'relay', error: 'رمز الربط لا يطابق هذا المركز — اطلب رمزاً جديداً' }, 403);
    }
    const sockets = this.ctx.getWebSockets('hq');
    if (!sockets.length) {
      return json({ ok: false, code: 'offline', error: 'جهاز المركز غير متصل بالممر الآن — سيُعاد الإرسال تلقائياً' }, 503);
    }
    const body = await request.text();
    if (body.length > MAX_BODY) return json({ ok: false, error: 'too large' }, 413);
    if (this.pending.size >= MAX_INFLIGHT) return json({ ok: false, code: 'busy', error: 'الممر مشغول — أعد المحاولة' }, 429);

    const rid = `${Date.now().toString(36)}-${(this.seq++).toString(36)}`;
    const reply = new Promise((resolve) => {
      const timer = setTimeout(() => { this.pending.delete(rid); resolve(null); }, REPLY_TIMEOUT_MS);
      this.pending.set(rid, { resolve, timer });
    });
    try {
      sockets[0].send(JSON.stringify({ t: 'req', rid, env: body }));
    } catch {
      const p = this.pending.get(rid);
      if (p) { clearTimeout(p.timer); this.pending.delete(rid); }
      return json({ ok: false, code: 'offline', error: 'انقطع اتصال المركز بالممر — سيُعاد الإرسال تلقائياً' }, 503);
    }
    const out = await reply;
    if (!out) return json({ ok: false, code: 'timeout', error: 'المركز لم يرد في الوقت المحدد' }, 504);
    return new Response(out.body, { status: out.status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }

  webSocketMessage(ws, data) {
    let m;
    try { m = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data)); } catch { return; }
    if (m.t === 'ping') { try { ws.send(JSON.stringify({ t: 'pong' })); } catch { /* */ } return; }
    if (m.t !== 'res' || !m.rid) return;
    const p = this.pending.get(m.rid);
    if (!p) return; // تأخر الرد بعد انتهاء المهلة
    clearTimeout(p.timer);
    this.pending.delete(m.rid);
    p.resolve({ status: Number(m.status) || 200, body: typeof m.body === 'string' ? m.body : JSON.stringify(m.body) });
  }

  webSocketClose(ws) { try { ws.close(); } catch { /* */ } }
  webSocketError(ws) { try { ws.close(); } catch { /* */ } }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/health') {
      return json({ ok: true, app: 'smart-ledger-pro-relay', v: 1 });
    }
    let id = null, path = null;
    if (url.pathname === '/hq') { id = url.searchParams.get('id'); path = '/hq'; }
    else if (url.pathname.startsWith('/b/')) { id = decodeURIComponent(url.pathname.slice(3)); path = '/b'; }
    else return json({ ok: false, error: 'not found' }, 404);

    if (!validId(id)) return json({ ok: false, error: 'bad id' }, 400);
    const stub = env.HQ.get(env.HQ.idFromName(id));
    const fwd = new URL(request.url);
    fwd.pathname = path;
    return stub.fetch(new Request(fwd, request));
  },
};
