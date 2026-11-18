'use strict';
/**
 * طلب الشهادة (CSR / PKCS#10) حسب مواصفات الهيئة للختم الرقمي:
 *  Subject: C=SA, OU=اسم الفرع, O=اسم المنشأة, CN=معرّف الجهاز
 *  Extensions:
 *   - certificateTemplateName (1.3.6.1.4.1.311.20.2): TSTZATCA-Code-Signing | PREZATCA-Code-Signing | ZATCA-Code-Signing
 *   - subjectAltName dirName: SN (رقم الجهاز) / UID (الرقم الضريبي) / title (أنواع الفواتير) / registeredAddress / businessCategory
 */
const A = require('./asn1.cjs');
const ec = require('./ec.cjs');

const TEMPLATE_BY_ENV = {
  sandbox: 'TSTZATCA-Code-Signing',
  simulation: 'PREZATCA-Code-Signing',
  production: 'ZATCA-Code-Signing',
};

const rdn = (oidStr, value, printable = false) => A.set(A.seq(A.oid(oidStr), printable ? A.printable(value) : A.utf8(value)));

/**
 * @param {object} o
 *  env, privateKey (BigInt), commonName, orgUnit, orgName, egsSerial ("1-...|2-...|3-..."),
 *  vatNumber, invoiceTypes ("1100" = ضريبية + مبسطة), location, industry
 * @returns {string} CSR بصيغة PEM
 */
function buildCsr(o) {
  const subject = A.seq(
    rdn('2.5.4.6', 'SA', true),
    rdn('2.5.4.11', o.orgUnit),
    rdn('2.5.4.10', o.orgName),
    rdn('2.5.4.3', o.commonName)
  );
  const pub = ec.publicKeyPoint(o.privateKey);
  const spki = ec.spkiDer(pub);

  const template = TEMPLATE_BY_ENV[o.env] || TEMPLATE_BY_ENV.sandbox;
  const extTemplate = A.seq(A.oid('1.3.6.1.4.1.311.20.2'), A.octet(A.utf8(template)));
  const dirName = A.seq(
    rdn('2.5.4.4', o.egsSerial),                       // SN
    rdn('0.9.2342.19200300.100.1.1', o.vatNumber),     // UID
    rdn('2.5.4.12', o.invoiceTypes || '1100'),         // title
    rdn('2.5.4.26', o.location),                       // registeredAddress
    rdn('2.5.4.15', o.industry)                        // businessCategory
  );
  const generalNames = A.seq(A.tlv(0xa4, dirName)); // [4] directoryName
  const extSan = A.seq(A.oid('2.5.29.17'), A.octet(generalNames));
  const extensionRequest = A.seq(A.oid('1.2.840.113549.1.9.14'), A.set(A.seq(extTemplate, extSan)));
  const attributes = A.tlv(0xa0, extensionRequest); // [0] IMPLICIT SET OF Attribute

  const info = A.seq(A.int(0), subject, spki, attributes);
  const sigAlg = A.seq(A.oid('1.2.840.10045.4.3.2')); // ecdsa-with-SHA256
  const signature = ec.signSha256(info, o.privateKey);
  const der = A.seq(info, sigAlg, A.bitString(signature));
  const b64 = der.toString('base64').match(/.{1,64}/g).join('\n');
  return `-----BEGIN CERTIFICATE REQUEST-----\n${b64}\n-----END CERTIFICATE REQUEST-----\n`;
}

module.exports = { buildCsr, TEMPLATE_BY_ENV };
