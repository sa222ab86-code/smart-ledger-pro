'use strict';
/**
 * ترميز وقراءة ASN.1 DER (ما يلزم فقط لطلب الشهادة CSR وقراءة شهادة الهيئة والتوقيعات)
 */

function lenBytes(n) {
  if (n < 0x80) return Buffer.from([n]);
  const out = [];
  while (n > 0) { out.unshift(n & 0xff); n = Math.floor(n / 256); }
  return Buffer.from([0x80 | out.length, ...out]);
}

function tlv(tag, content) {
  const c = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return Buffer.concat([Buffer.from([tag]), lenBytes(c.length), c]);
}

const seq = (...items) => tlv(0x30, Buffer.concat(items));
const set = (...items) => tlv(0x31, Buffer.concat(items));
const nul = () => Buffer.from([0x05, 0x00]);
const utf8 = (s) => tlv(0x0c, Buffer.from(String(s), 'utf8'));
const printable = (s) => tlv(0x13, Buffer.from(String(s), 'ascii'));
const octet = (b) => tlv(0x04, b);
const bitString = (b) => tlv(0x03, Buffer.concat([Buffer.from([0]), b]));
/** وسم سياقي صريح [n] مركّب */
const ctx = (n, content) => tlv(0xa0 | n, content);

function int(v) {
  let b;
  if (typeof v === 'bigint') {
    let hex = v.toString(16);
    if (hex.length % 2) hex = '0' + hex;
    b = Buffer.from(hex, 'hex');
  } else if (Buffer.isBuffer(v)) {
    b = v;
  } else {
    b = Buffer.from([v]);
  }
  // إزالة الأصفار الزائدة من البداية ثم إضافة صفر إن كان البت الأعلى 1
  let i = 0;
  while (i < b.length - 1 && b[i] === 0 && (b[i + 1] & 0x80) === 0) i++;
  b = b.subarray(i);
  if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0]), b]);
  return tlv(0x02, b);
}

function oid(str) {
  const parts = str.split('.').map((x) => BigInt(x));
  const bytes = [Number(parts[0] * 40n + parts[1])];
  for (const p of parts.slice(2)) {
    const stack = [];
    let v = p;
    stack.unshift(Number(v & 0x7fn));
    v >>= 7n;
    while (v > 0n) { stack.unshift(Number((v & 0x7fn) | 0x80n)); v >>= 7n; }
    bytes.push(...stack);
  }
  return tlv(0x06, Buffer.from(bytes));
}

/* ------------------------------ القراءة ------------------------------ */
function parse(buf, offset = 0) {
  const tag = buf[offset];
  let len = buf[offset + 1];
  let hdr = 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[offset + 2 + i];
    hdr = 2 + n;
  }
  const start = offset + hdr;
  const end = start + len;
  const node = { tag, start: offset, hdr, len, end, content: buf.subarray(start, end), raw: buf.subarray(offset, end), children: null };
  if (tag & 0x20) {
    node.children = [];
    let p = start;
    while (p < end) { const c = parse(buf, p); node.children.push(c); p = c.end; }
  }
  return node;
}

function oidToString(content) {
  const out = [Math.floor(content[0] / 40), content[0] % 40];
  let v = 0n;
  for (let i = 1; i < content.length; i++) {
    v = (v << 7n) | BigInt(content[i] & 0x7f);
    if (!(content[i] & 0x80)) { out.push(v.toString()); v = 0n; }
  }
  return out.join('.');
}

module.exports = { tlv, seq, set, nul, utf8, printable, octet, bitString, ctx, int, oid, parse, oidToString };
