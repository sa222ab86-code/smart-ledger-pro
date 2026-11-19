'use strict';
/** محاكاة ممر Cloudflare بنفس بروتوكول worker.js، لاختبار جانب البرنامج محلياً */
const http = require('node:http');
const crypto = require('node:crypto');
const { accept } = require('./ws-mini.cjs');

const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

function createMockRelay(port) {
  const objects = new Map(); // hqId → { hqKeyHash, branchKeyHash, sockets:Set, pending:Map, seq }
  const obj = (id) => {
    if (!objects.has(id)) objects.set(id, { hqKeyHash: null, branchKeyHash: null, sockets: new Set(), pending: new Map(), seq: 0 });
    return objects.get(id);
  };
  const json = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/' || url.pathname === '/health') return json(res, 200, { ok: true, app: 'smart-ledger-pro-relay', v: 1 });
    if (!url.pathname.startsWith('/b/')) return json(res, 404, { ok: false, error: 'not found' });
    const id = decodeURIComponent(url.pathname.slice(3));
    const o = obj(id);
    if (!o.branchKeyHash || sha(req.headers['x-sl-key'] || '') !== o.branchKeyHash) {
      return json(res, 403, { ok: false, code: 'relay', error: 'رمز الربط لا يطابق هذا المركز — اطلب رمزاً جديداً' });
    }
    if (!o.sockets.size) return json(res, 503, { ok: false, code: 'offline', error: 'جهاز المركز غير متصل بالممر الآن — سيُعاد الإرسال تلقائياً' });
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const rid = `${Date.now().toString(36)}-${(o.seq++).toString(36)}`;
      const timer = setTimeout(() => { o.pending.delete(rid); json(res, 504, { ok: false, code: 'timeout', error: 'المركز لم يرد' }); }, 90000);
      o.pending.set(rid, { res, timer });
      const ws = [...o.sockets][0];
      try { ws.send(JSON.stringify({ t: 'req', rid, env: body })); }
      catch { clearTimeout(timer); o.pending.delete(rid); json(res, 503, { ok: false, code: 'offline', error: 'انقطع الاتصال' }); }
    });
  });

  server.on('upgrade', (req, socket, head) => {
    void head;
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/hq') return socket.destroy();
    const id = url.searchParams.get('id') || '';
    const k = url.searchParams.get('k') || '';
    const bk = url.searchParams.get('bk') || '';
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(id) || k.length < 20) return socket.destroy();
    const o = obj(id);
    if (!o.hqKeyHash) o.hqKeyHash = sha(k);
    else if (o.hqKeyHash !== sha(k)) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); return socket.destroy(); }
    if (bk.length >= 16) o.branchKeyHash = sha(bk);
    const ws = accept(req, socket);
    o.sockets.add(ws);
    ws.on('message', (text) => {
      let m; try { m = JSON.parse(text); } catch { return; }
      if (m.t === 'ping') return ws.send(JSON.stringify({ t: 'pong' }));
      if (m.t !== 'res' || !m.rid) return;
      const p = o.pending.get(m.rid);
      if (!p) return;
      clearTimeout(p.timer); o.pending.delete(m.rid);
      p.res.writeHead(Number(m.status) || 200, { 'content-type': 'application/json' });
      p.res.end(typeof m.body === 'string' ? m.body : JSON.stringify(m.body));
    });
    ws.on('close', () => o.sockets.delete(ws));
    return undefined;
  });

  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${port}`,
    hqOnline: (id) => obj(id).sockets.size,
    dropHq: (id) => { for (const ws of obj(id).sockets) ws.close(); objects.get(id).sockets.clear(); },
    close: () => new Promise((r) => { for (const o of objects.values()) for (const ws of o.sockets) ws.close(); server.close(() => r()); }),
  })));
}
module.exports = { createMockRelay };
