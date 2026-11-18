'use strict';
/**
 * استرجاع كلمة المرور بمصدر المفاتيح:
 *  - البرنامج يولّد زوج مفاتيح X25519 مؤقتاً ويعرض طلباً (باركود) فيه: كود الجهاز + المستخدم + المفتاح المؤقت
 *  - مصدر المفاتيح (الذي يملك المفتاح الخاص للترخيص Ed25519) يحسب السر المشترك ويُظهر رمزاً من 8 خانات
 *  - البرنامج يحسب الرمز نفسه بالمفتاح العام فقط — لا يستطيع أحد غير صاحب المفتاح الخاص توليده
 *  - الطلب صالح 30 دقيقة ولمرة واحدة، و5 محاولات خاطئة كحد أقصى
 * الملف بلا أسرار: تستخدمه أداة المصدر tools/license/reset-code.cjs أيضاً.
 */
const crypto = require('node:crypto');

const P = (1n << 255n) - 19n;
const X_SPKI = Buffer.from('302a300506032b656e032100', 'hex');
const X_PKCS8 = Buffer.from('302e020100300506032b656e04220420', 'hex');
const PREFIX = 'SLPW1:';
const TTL = 30 * 60 * 1000;
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const modPow = (b, e) => { let r = 1n; b %= P; while (e > 0n) { if (e & 1n) r = r * b % P; b = b * b % P; e >>= 1n; } return r; };
const leToBig = (buf) => { let n = 0n; for (let i = buf.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(buf[i]); return n; };
const bigToLe = (n) => { const b = Buffer.alloc(32); for (let i = 0; i < 32; i++) { b[i] = Number(n & 255n); n >>= 8n; } return b; };

/** مفتاح Ed25519 العام ← مفتاح X25519 العام (u = (1+y)/(1-y)) */
function edPubToX(edPub) {
  const raw = edPub.export({ type: 'spki', format: 'der' }).subarray(-32);
  const yb = Buffer.from(raw); yb[31] &= 0x7f;
  const y = leToBig(yb);
  const u = (1n + y) * modPow((1n - y + P) % P, P - 2n) % P;
  return crypto.createPublicKey({ key: Buffer.concat([X_SPKI, bigToLe(u)]), format: 'der', type: 'spki' });
}
/** مفتاح Ed25519 الخاص ← مفتاح X25519 الخاص (sha512(seed)[0:32]) */
function edPrivToX(edPriv) {
  const seed = edPriv.export({ type: 'pkcs8', format: 'der' }).subarray(-32);
  const k = crypto.createHash('sha512').update(seed).digest().subarray(0, 32);
  return crypto.createPrivateKey({ key: Buffer.concat([X_PKCS8, k]), format: 'der', type: 'pkcs8' });
}
const rawX = (pub) => pub.export({ type: 'spki', format: 'der' }).subarray(-32);
const xPubFromRaw = (raw) => crypto.createPublicKey({ key: Buffer.concat([X_SPKI, raw]), format: 'der', type: 'spki' });

/** الرمز: HMAC(السر المشترك، نص الطلب) ← 8 خانات Crockford */
function codeFrom(shared, request) {
  const h = crypto.createHmac('sha256', shared).update(request).digest();
  let n = 0n; for (let i = 0; i < 5; i++) n = (n << 8n) | BigInt(h[i]);
  let s = ''; for (let i = 0; i < 8; i++) { s = B32[Number(n & 31n)] + s; n >>= 5n; }
  return s;
}
const normCode = (c) => String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
const fmt = (c) => `${c.slice(0, 4)}-${c.slice(4)}`;

/** قراءة الطلب (في أداة المصدر) */
function parseRequest(text) {
  const t = String(text || '').trim().replace(/\s+/g, '');
  if (!t.toUpperCase().startsWith(PREFIX)) throw new Error('ليس طلب استرجاع كلمة مرور');
  const body = JSON.parse(Buffer.from(t.slice(PREFIX.length), 'base64url').toString('utf8'));
  if (!body || !body.e || !body.d) throw new Error('طلب غير مكتمل');
  return { request: PREFIX + t.slice(PREFIX.length), device: body.d, user: body.u || '', name: body.n || '', at: body.t || 0, eph: Buffer.from(body.e, 'base64url') };
}
/** توليد الرمز بالمفتاح الخاص (أداة المصدر) */
function issueCode(edPriv, text) {
  const r = parseRequest(text);
  const shared = crypto.diffieHellman({ privateKey: edPrivToX(edPriv), publicKey: xPubFromRaw(r.eph) });
  return { ...r, code: fmt(codeFrom(shared, r.request)) };
}

/* ───────── جانب البرنامج ───────── */
let pending = null; // { request, expected, exp, tries, user }

function createChallenge({ edPub, deviceCode, user, name }) {
  if (!edPub) return { ok: false, error: 'المفتاح العام غير متوفر في هذه النسخة' };
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
  const body = { v: 1, d: deviceCode, u: String(user || ''), n: String(name || '').slice(0, 24), t: Date.now(), e: rawX(publicKey).toString('base64url') };
  const request = PREFIX + Buffer.from(JSON.stringify(body)).toString('base64url');
  const shared = crypto.diffieHellman({ privateKey, publicKey: edPubToX(edPub) });
  pending = { request, expected: codeFrom(shared, request), exp: Date.now() + TTL, tries: 0, user: body.u };
  return { ok: true, request, expiresAt: pending.exp };
}
function verifyCode(code, user) {
  if (!pending || Date.now() > pending.exp) { pending = null; return { ok: false, error: 'انتهت صلاحية الطلب — أنشئ طلباً جديداً' }; }
  if (String(user || '') !== pending.user) return { ok: false, error: 'الطلب لمستخدم آخر' };
  const a = Buffer.from(normCode(code)); const b = Buffer.from(pending.expected);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) { pending = null; return { ok: true }; }
  pending.tries++;
  if (pending.tries >= 5) { pending = null; return { ok: false, error: 'محاولات كثيرة — أنشئ طلباً جديداً' }; }
  return { ok: false, error: `الرمز غير صحيح (متبقي ${5 - pending.tries} محاولات)` };
}

function registerPwResetIpc({ isTrusted, getPublicKey, getDeviceCode }) {
  const { ipcMain } = require('electron');
  const guard = (e) => { if (!isTrusted(e)) throw new Error('untrusted'); };
  ipcMain.handle('pwreset:challenge', (e, o) => { guard(e); return createChallenge({ edPub: getPublicKey(), deviceCode: getDeviceCode(), user: o && o.user, name: o && o.name }); });
  ipcMain.handle('pwreset:verify', (e, o) => { guard(e); return verifyCode(o && o.code, o && o.user); });
}

module.exports = { edPubToX, edPrivToX, codeFrom, parseRequest, issueCode, createChallenge, verifyCode, registerPwResetIpc, normCode };
