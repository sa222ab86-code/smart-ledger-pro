'use strict';
/**
 * خادم WebSocket صغير بلا مكتبات خارجية — للاختبار فقط (نصوص فقط، بلا تجزئة).
 * يكفي لمحاكاة ممر Cloudflare في اختبارات ربط الفروع.
 */
const crypto = require('node:crypto');
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function accept(req, socket) {
  const key = req.headers['sec-websocket-key'];
  const hash = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + hash + '\r\n\r\n');
  socket.setNoDelay(true);
  const handlers = { message: [], close: [] };
  let buf = Buffer.alloc(0);
  let closed = false;

  const fire = (ev, ...a) => { for (const f of handlers[ev]) { try { f(...a); } catch (e) { console.error('[ws-mini]', e); } } };

  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0, op = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; const big = buf.readBigUInt64BE(2); if (big > 64n * 1024n * 1024n) { destroy(); return; } len = Number(big); off = 10; }
      const maskLen = masked ? 4 : 0;
      if (buf.length < off + maskLen + len) return;
      const mask = masked ? buf.subarray(off, off + 4) : null;
      const payload = Buffer.from(buf.subarray(off + maskLen, off + maskLen + len));
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      buf = buf.subarray(off + maskLen + len);
      if (op === 0x8) { destroy(); return; }
      if (op === 0x9) { send(payload, 0xA); continue; }       // ping → pong
      if (op === 0xA) continue;
      if (!fin) { destroy(); return; }                         // لا نحتاج التجزئة هنا
      if (op === 0x1 || op === 0x2) fire('message', payload.toString('utf8'));
    }
  });
  socket.on('error', () => destroy());
  socket.on('close', () => { if (!closed) { closed = true; fire('close'); } });

  function send(data, opcode = 0x1) {
    if (closed || socket.destroyed) return;
    const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
    let head;
    if (payload.length < 126) { head = Buffer.from([0x80 | opcode, payload.length]); }
    else if (payload.length < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | opcode; head[1] = 126; head.writeUInt16BE(payload.length, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | opcode; head[1] = 127; head.writeBigUInt64BE(BigInt(payload.length), 2); }
    socket.write(Buffer.concat([head, payload]));
  }
  function destroy() { if (closed) return; closed = true; try { socket.destroy(); } catch { /* */ } fire('close'); }

  return { send, close: destroy, on: (ev, fn) => { if (handlers[ev]) handlers[ev].push(fn); } };
}
module.exports = { accept };
