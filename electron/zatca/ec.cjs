'use strict';
/**
 * ECDSA على منحنى secp256k1 (المطلوب من الهيئة للختم الرقمي).
 *
 * لماذا تنفيذ خاص؟ Electron مبني على BoringSSL الذي لا يدعم secp256k1،
 * فلا يمكن استخدام crypto.sign من Node هنا. هذا التنفيذ:
 *  - أرقام BigInt، ونقاط بإحداثيات Jacobian
 *  - nonce حتمي حسب RFC 6979 (HMAC-SHA256) — لا يعتمد على مولد عشوائي وقت التوقيع
 *  - توقيع low-S، وترميز DER
 * كل توقيع يُتحقق منه بـ OpenSSL في الاختبارات.
 * ملاحظة: العمليات ليست ثابتة الزمن؛ مقبول لجهاز كاشير محلي (لا خصم يقيس زمن التوقيع عن بُعد).
 */
const crypto = require('node:crypto');
const A = require('./asn1.cjs');

const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const GX = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const GY = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;
const OID_SECP256K1 = '1.3.132.0.10';
const OID_EC_PUBLIC_KEY = '1.2.840.10045.2.1';

const mod = (a, m = P) => { const r = a % m; return r >= 0n ? r : r + m; };
function inv(a, m = P) {
  // خوارزمية إقليدس الموسعة
  let [lm, hm] = [1n, 0n];
  let [low, high] = [mod(a, m), m];
  while (low > 1n) {
    const r = high / low;
    [lm, hm] = [hm - lm * r, lm];
    [low, high] = [high - low * r, low];
  }
  return mod(lm, m);
}

// نقطة Jacobian: [X, Y, Z]؛ اللانهاية = Z = 0
const INF = [0n, 1n, 0n];
function jDouble([X, Y, Z]) {
  if (Z === 0n || Y === 0n) return INF;
  const YY = mod(Y * Y);
  const S = mod(4n * X * YY);
  const M = mod(3n * X * X); // a = 0
  const X3 = mod(M * M - 2n * S);
  const Y3 = mod(M * (S - X3) - 8n * YY * YY);
  const Z3 = mod(2n * Y * Z);
  return [X3, Y3, Z3];
}
function jAdd(p1, p2) {
  if (p1[2] === 0n) return p2;
  if (p2[2] === 0n) return p1;
  const [X1, Y1, Z1] = p1, [X2, Y2, Z2] = p2;
  const Z1Z1 = mod(Z1 * Z1), Z2Z2 = mod(Z2 * Z2);
  const U1 = mod(X1 * Z2Z2), U2 = mod(X2 * Z1Z1);
  const S1 = mod(Y1 * Z2 * Z2Z2), S2 = mod(Y2 * Z1 * Z1Z1);
  if (U1 === U2) return S1 === S2 ? jDouble(p1) : INF;
  const H = mod(U2 - U1), R = mod(S2 - S1);
  const HH = mod(H * H), HHH = mod(H * HH), V = mod(U1 * HH);
  const X3 = mod(R * R - HHH - 2n * V);
  const Y3 = mod(R * (V - X3) - S1 * HHH);
  const Z3 = mod(H * Z1 * Z2);
  return [X3, Y3, Z3];
}
function toAffine([X, Y, Z]) {
  if (Z === 0n) throw new Error('point at infinity');
  const zi = inv(Z), zi2 = mod(zi * zi);
  return [mod(X * zi2), mod(Y * zi2 * zi)];
}
function mul(k, point = [GX, GY, 1n]) {
  let R = INF, Q = point;
  while (k > 0n) {
    if (k & 1n) R = jAdd(R, Q);
    Q = jDouble(Q);
    k >>= 1n;
  }
  return R;
}

const toBig = (buf) => BigInt('0x' + (Buffer.from(buf).toString('hex') || '0'));
const to32 = (n) => Buffer.from(n.toString(16).padStart(64, '0'), 'hex');

function publicKeyPoint(d) {
  const [x, y] = toAffine(mul(d));
  return Buffer.concat([Buffer.from([4]), to32(x), to32(y)]); // غير مضغوط
}

/** RFC 6979: k حتمي من المفتاح والرسالة */
function rfc6979k(d, h1) {
  const x = to32(d);
  const hm = to32(mod(toBig(h1), N));
  let V = Buffer.alloc(32, 1), K = Buffer.alloc(32, 0);
  const hmac = (key, ...parts) => crypto.createHmac('sha256', key).update(Buffer.concat(parts)).digest();
  K = hmac(K, V, Buffer.from([0]), x, hm); V = hmac(K, V);
  K = hmac(K, V, Buffer.from([1]), x, hm); V = hmac(K, V);
  for (;;) {
    V = hmac(K, V);
    const k = toBig(V);
    if (k > 0n && k < N) return k;
    K = hmac(K, V, Buffer.from([0])); V = hmac(K, V);
  }
}

/** يوقّع رسالة: ECDSA-SHA256 (تُحسب SHA-256 للرسالة ثم يُوقَّع الناتج) — يعيد توقيع DER */
function signSha256(message, d) {
  const h = crypto.createHash('sha256').update(message).digest();
  const z = mod(toBig(h), N);
  for (let extra = 0; ; extra++) {
    const k = extra === 0 ? rfc6979k(d, h) : mod(rfc6979k(d, crypto.createHash('sha256').update(Buffer.concat([h, Buffer.from([extra])])).digest()), N);
    const [x] = toAffine(mul(k));
    const r = mod(x, N);
    if (r === 0n) continue;
    let s = mod(inv(k, N) * (z + r * d), N);
    if (s === 0n) continue;
    if (s > N / 2n) s = N - s; // low-S
    return A.seq(A.int(r), A.int(s));
  }
}

/** تحقق (للاختبارات وللتأكد بعد التوقيع) */
function verifySha256(message, derSig, pubUncompressed) {
  const node = A.parse(derSig);
  const r = toBig(node.children[0].content), s = toBig(node.children[1].content);
  if (r <= 0n || r >= N || s <= 0n || s >= N) return false;
  const h = crypto.createHash('sha256').update(message).digest();
  const z = mod(toBig(h), N);
  const w = inv(s, N);
  const Q = [toBig(pubUncompressed.subarray(1, 33)), toBig(pubUncompressed.subarray(33, 65)), 1n];
  const pt = jAdd(mul(mod(z * w, N)), mul(mod(r * w, N), Q));
  if (pt[2] === 0n) return false;
  return mod(toAffine(pt)[0], N) === r;
}

function generatePrivateKey() {
  for (;;) {
    const d = toBig(crypto.randomBytes(32));
    if (d > 0n && d < N) return d;
  }
}

/** SubjectPublicKeyInfo DER (يُستخدم في CSR وفي رمز QR الوسم 8) */
function spkiDer(pubUncompressed) {
  return A.seq(A.seq(A.oid(OID_EC_PUBLIC_KEY), A.oid(OID_SECP256K1)), A.bitString(pubUncompressed));
}

/** حفظ المفتاح الخاص بصيغة SEC1 PEM (متوافقة مع OpenSSL) */
function privateKeyToPem(d) {
  const der = A.seq(A.int(1), A.octet(to32(d)), A.ctx(0, A.oid(OID_SECP256K1)), A.tlv(0xa1, A.bitString(publicKeyPoint(d))));
  const b64 = der.toString('base64').match(/.{1,64}/g).join('\n');
  return `-----BEGIN EC PRIVATE KEY-----\n${b64}\n-----END EC PRIVATE KEY-----\n`;
}
function privateKeyFromPem(pem) {
  const b64 = String(pem).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const node = A.parse(Buffer.from(b64, 'base64'));
  // SEC1: version, privateKey OCTET STRING, ...
  const octetNode = node.children.find((c) => c.tag === 0x04);
  if (!octetNode) throw new Error('صيغة المفتاح الخاص غير معروفة');
  return toBig(octetNode.content);
}

module.exports = { N, signSha256, verifySha256, generatePrivateKey, publicKeyPoint, spkiDer, privateKeyToPem, privateKeyFromPem, OID_SECP256K1 };
