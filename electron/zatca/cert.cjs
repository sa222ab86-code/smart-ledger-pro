'use strict';
/**
 * قراءة شهادة الهيئة (X.509) بلا مكتبات: المُصدِر، الرقم التسلسلي، المفتاح العام، توقيع الشهادة، وبصمتها.
 * (crypto.X509Certificate في Electron مبني على BoringSSL وقد يفشل مع مفاتيح secp256k1)
 */
const crypto = require('node:crypto');
const A = require('./asn1.cjs');

const NAMES = {
  '2.5.4.3': 'CN', '2.5.4.6': 'C', '2.5.4.7': 'L', '2.5.4.8': 'ST', '2.5.4.10': 'O', '2.5.4.11': 'OU',
  '2.5.4.5': 'serialNumber', '0.9.2342.19200300.100.1.25': 'DC', '1.2.840.113549.1.9.1': 'emailAddress',
};

/** نص الشهادة base64 بلا رؤوس PEM ولا أسطر */
const cleanCert = (s) => String(s).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');

function nameToString(nameNode) {
  // نفس صيغة الحلول المعتمدة: عناصر الاسم بترتيب معكوس مفصولة بـ ", "
  const parts = nameNode.children.map((rdnSet) =>
    rdnSet.children.map((atv) => {
      const type = A.oidToString(atv.children[0].content);
      return `${NAMES[type] || type}=${atv.children[1].content.toString('utf8')}`;
    }).join('+')
  );
  return parts.reverse().join(', ');
}

function parseCertificate(certB64OrPem) {
  const b64 = cleanCert(certB64OrPem);
  const der = Buffer.from(b64, 'base64');
  const cert = A.parse(der);
  const tbs = cert.children[0];
  let i = 0;
  if (tbs.children[0].tag === 0xa0) i = 1; // version
  const serialNode = tbs.children[i];
  const issuerNode = tbs.children[i + 2];
  const subjectNode = tbs.children[i + 4];
  const spkiNode = tbs.children[i + 5];
  const sigBits = cert.children[2]; // BIT STRING
  return {
    base64: b64,
    issuer: nameToString(issuerNode),
    subject: nameToString(subjectNode),
    serialNumber: BigInt('0x' + serialNode.content.toString('hex')).toString(10),
    publicKeySpki: Buffer.from(spkiNode.raw),
    publicKeyPoint: Buffer.from(spkiNode.children[1].content.subarray(1)),
    signature: Buffer.from(sigBits.content.subarray(1)),
    /** بصمة الشهادة حسب الهيئة: SHA-256 hex لنص base64 ثم base64 لذلك النص */
    hash: Buffer.from(crypto.createHash('sha256').update(b64).digest('hex')).toString('base64'),
  };
}

module.exports = { parseCertificate, cleanCert };
