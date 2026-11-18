'use strict';
/**
 * فاتورة الهيئة (المرحلة الثانية) بصيغة UBL 2.1:
 *  - الأنواع: مبسطة 0200000 / ضريبية 0100000 × فاتورة 388 / إشعار دائن 381 / إشعار مدين 383
 *  - الحسابات والتقريب حسب قواعد BR-DEC و BR-KSA
 *  - البصمة: SHA-256 للصيغة القياسية بعد حذف UBLExtensions و cac:Signature ومرجع QR
 *  - الختم: ECDSA على البصمة + XAdES (SignedProperties) + الشهادة
 *  - رمز QR بالوسوم 1..9
 */
const crypto = require('node:crypto');
const { el, serialize } = require('./xml.cjs');
const ec = require('./ec.cjs');

const NS = {
  xmlns: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  'xmlns:ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
};
const DS = 'http://www.w3.org/2000/09/xmldsig#';
const XADES = 'http://uri.etsi.org/01903/v1.3.2#';
const SHA256_URI = 'http://www.w3.org/2001/04/xmlenc#sha256';

/** بصمة أول فاتورة في السلسلة (معرّفة من الهيئة: base64 لنص SHA-256 للرقم 0) */
const INITIAL_PIH = 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==';

const r2 = (x) => Math.round((x + (x >= 0 ? 1 : -1) * Number.EPSILON) * 100) / 100;
const m2 = (x) => r2(x).toFixed(2);
const qty = (x) => (Math.round(x * 1e6) / 1e6).toString();
const price = (x) => { const v = Math.round(x * 1e6) / 1e6; return Number.isInteger(v) ? v.toFixed(2) : v.toString(); };
const fmtPct = (rate) => String(Math.round(rate * 10000) / 100);
const amt = (name, v) => el(name, { currencyID: 'SAR' }, m2(v));
const taxScheme = (withScheme) => el('cac:TaxScheme', [withScheme ? el('cbc:ID', { schemeAgencyID: '6', schemeID: 'UN/ECE 5153' }, 'VAT') : el('cbc:ID', 'VAT')]);
const categoryId = (withScheme, code) => (withScheme ? el('cbc:ID', { schemeAgencyID: '6', schemeID: 'UN/ECE 5305' }, code) : el('cbc:ID', code));

/* ------------------------------ التحقق ------------------------------ */
function validate(doc, seller) {
  const errs = [];
  const need = (v, msg) => { if (v === undefined || v === null || String(v).trim() === '') errs.push(msg); };
  need(seller.name, 'اسم المنشأة');
  if (!/^3\d{13}3$/.test(seller.vatNumber || '')) errs.push('الرقم الضريبي للمنشأة يجب أن يكون 15 رقماً يبدأ وينتهي بـ 3');
  need(seller.crn, 'رقم السجل التجاري');
  need(seller.street, 'اسم الشارع (المنشأة)');
  if (!/^\d{4}$/.test(seller.building || '')) errs.push('رقم المبنى للمنشأة 4 أرقام');
  need(seller.district, 'الحي (المنشأة)');
  need(seller.city, 'المدينة (المنشأة)');
  if (!/^\d{5}$/.test(seller.postalCode || '')) errs.push('الرمز البريدي للمنشأة 5 أرقام');
  if (!doc.lines || !doc.lines.length) errs.push('الفاتورة بلا أصناف');
  if ((doc.typeCode === 381 || doc.typeCode === 383) && !doc.billingReference) errs.push('رقم الفاتورة الأصلية مطلوب للإشعار');
  if (doc.kind === 'standard') {
    const b = doc.buyer || {};
    need(b.name, 'اسم العميل (فاتورة ضريبية)');
    if (!/^3\d{13}3$/.test(b.vatNumber || '')) errs.push('الرقم الضريبي للعميل 15 رقماً يبدأ وينتهي بـ 3');
    need(b.street, 'شارع العميل');
    if (!/^\d{4}$/.test(b.building || '')) errs.push('رقم مبنى العميل 4 أرقام');
    need(b.district, 'حي العميل');
    need(b.city, 'مدينة العميل');
    if (!/^\d{5}$/.test(b.postalCode || '')) errs.push('الرمز البريدي للعميل 5 أرقام');
  }
  return errs;
}

/* ------------------------------ الحسابات ------------------------------ */
function computeTotals(doc) {
  const lines = doc.lines.map((l, i) => {
    const net = r2(l.qty * l.unitPrice);
    const rate = (l.vatPercent ?? 15) / 100;
    const tax = r2(net * rate);
    return { ...l, index: i + 1, net, tax, rate };
  });
  const lineExtension = r2(lines.reduce((s, l) => s + l.net, 0));
  const allowance = r2(Math.max(0, doc.allowance?.amount || 0));
  // نسبة ضريبة واحدة للفاتورة (البرنامج يستخدم نسبة المنشأة لكل الأصناف)
  const rate = lines[0]?.rate ?? 0.15;
  const taxable = r2(lineExtension - allowance);
  const tax = r2(taxable * rate);
  const taxInclusive = r2(taxable + tax);
  // تقريب المبلغ المستحق ليطابق ما دفعه العميل فعلاً (فرق هللات ناتج عن الأسعار الشاملة) — بحد أقصى 0.10
  let rounding = 0;
  if (typeof doc.payableTotal === 'number' && isFinite(doc.payableTotal)) {
    const d = r2(doc.payableTotal - taxInclusive);
    if (Math.abs(d) <= 0.1) rounding = d;
  }
  return { lines, lineExtension, allowance, rate, taxable, tax, taxInclusive, rounding, payable: r2(taxInclusive + rounding) };
}

/* ------------------------------ الأجزاء ------------------------------ */
function partyAddress(a) {
  return el('cac:PostalAddress', [
    el('cbc:StreetName', a.street),
    el('cbc:BuildingNumber', a.building),
    a.plot ? el('cbc:PlotIdentification', a.plot) : null,
    el('cbc:CitySubdivisionName', a.district),
    el('cbc:CityName', a.city),
    el('cbc:PostalZone', a.postalCode),
    el('cac:Country', [el('cbc:IdentificationCode', a.country || 'SA')]),
  ]);
}

function supplier(seller) {
  return el('cac:AccountingSupplierParty', [el('cac:Party', [
    el('cac:PartyIdentification', [el('cbc:ID', { schemeID: 'CRN' }, seller.crn)]),
    partyAddress(seller),
    el('cac:PartyTaxScheme', [el('cbc:CompanyID', seller.vatNumber), taxScheme(true)]),
    el('cac:PartyLegalEntity', [el('cbc:RegistrationName', seller.name)]),
  ])]);
}

function customer(doc) {
  const b = doc.buyer;
  if (doc.kind !== 'standard' || !b) {
    // المبسطة: اسم العميل اختياري
    if (b && b.name) return el('cac:AccountingCustomerParty', [el('cac:Party', [el('cac:PartyLegalEntity', [el('cbc:RegistrationName', b.name)])])]);
    return el('cac:AccountingCustomerParty', [el('cac:Party', [])]);
  }
  return el('cac:AccountingCustomerParty', [el('cac:Party', [
    partyAddress(b),
    el('cac:PartyTaxScheme', [el('cbc:CompanyID', b.vatNumber), taxScheme(true)]),
    el('cac:PartyLegalEntity', [el('cbc:RegistrationName', b.name)]),
  ])]);
}

/**
 * يبني عناصر الفاتورة.
 * parts.extensions / parts.qr / parts.signatureRef يمكن حذفها (لحساب البصمة)
 */
function buildRoot(doc, seller, chain, t, parts) {
  const typeName = doc.kind === 'standard' ? '0100000' : '0200000';
  const pct = fmtPct(t.rate);
  const children = [
    parts.extensions || null,
    el('cbc:ProfileID', 'reporting:1.0'),
    el('cbc:ID', doc.number),
    el('cbc:UUID', doc.uuid),
    el('cbc:IssueDate', doc.issueDate),
    el('cbc:IssueTime', doc.issueTime),
    el('cbc:InvoiceTypeCode', { name: typeName }, String(doc.typeCode)),
    el('cbc:DocumentCurrencyCode', 'SAR'),
    el('cbc:TaxCurrencyCode', 'SAR'),
    doc.billingReference ? el('cac:BillingReference', [el('cac:InvoiceDocumentReference', [el('cbc:ID', doc.billingReference)])]) : null,
    el('cac:AdditionalDocumentReference', [el('cbc:ID', 'ICV'), el('cbc:UUID', String(chain.icv))]),
    el('cac:AdditionalDocumentReference', [el('cbc:ID', 'PIH'), el('cac:Attachment', [el('cbc:EmbeddedDocumentBinaryObject', { mimeCode: 'text/plain' }, chain.pih)])]),
    parts.qr ? el('cac:AdditionalDocumentReference', [el('cbc:ID', 'QR'), el('cac:Attachment', [el('cbc:EmbeddedDocumentBinaryObject', { mimeCode: 'text/plain' }, parts.qr)])]) : null,
    parts.signatureRef ? el('cac:Signature', [el('cbc:ID', 'urn:oasis:names:specification:ubl:signature:Invoice'), el('cbc:SignatureMethod', 'urn:oasis:names:specification:ubl:dsig:enveloped:xades')]) : null,
    supplier(seller),
    customer(doc),
    // تاريخ التوريد إلزامي للفاتورة الضريبية (BR-KSA-15)
    doc.kind === 'standard' && doc.typeCode === 388 ? el('cac:Delivery', [el('cbc:ActualDeliveryDate', doc.supplyDate || doc.issueDate)]) : null,
    el('cac:PaymentMeans', [
      el('cbc:PaymentMeansCode', doc.paymentMeansCode || '10'),
      doc.instructionNote ? el('cbc:InstructionNote', doc.instructionNote) : null,
    ]),
    t.allowance > 0 ? el('cac:AllowanceCharge', [
      el('cbc:ChargeIndicator', 'false'),
      el('cbc:AllowanceChargeReason', doc.allowance?.reason || 'discount'),
      amt('cbc:Amount', t.allowance),
      el('cac:TaxCategory', [categoryId(true, 'S'), el('cbc:Percent', pct), taxScheme(true)]),
    ]) : null,
    el('cac:TaxTotal', [amt('cbc:TaxAmount', t.tax)]),
    el('cac:TaxTotal', [
      amt('cbc:TaxAmount', t.tax),
      el('cac:TaxSubtotal', [
        amt('cbc:TaxableAmount', t.taxable),
        amt('cbc:TaxAmount', t.tax),
        el('cac:TaxCategory', [categoryId(true, 'S'), el('cbc:Percent', pct), taxScheme(true)]),
      ]),
    ]),
    el('cac:LegalMonetaryTotal', [
      amt('cbc:LineExtensionAmount', t.lineExtension),
      amt('cbc:TaxExclusiveAmount', t.taxable),
      amt('cbc:TaxInclusiveAmount', t.taxInclusive),
      amt('cbc:AllowanceTotalAmount', t.allowance),
      amt('cbc:ChargeTotalAmount', 0),
      amt('cbc:PrepaidAmount', 0),
      amt('cbc:PayableRoundingAmount', t.rounding),
      amt('cbc:PayableAmount', t.payable),
    ]),
    ...t.lines.map((l) => el('cac:InvoiceLine', [
      el('cbc:ID', String(l.index)),
      el('cbc:InvoicedQuantity', { unitCode: 'PCE' }, qty(l.qty)),
      amt('cbc:LineExtensionAmount', l.net),
      el('cac:TaxTotal', [amt('cbc:TaxAmount', l.tax), amt('cbc:RoundingAmount', r2(l.net + l.tax))]),
      el('cac:Item', [
        el('cbc:Name', l.name),
        el('cac:ClassifiedTaxCategory', [categoryId(true, 'S'), el('cbc:Percent', fmtPct(l.rate)), taxScheme(true)]),
      ]),
      el('cac:Price', [el('cbc:PriceAmount', { currencyID: 'SAR' }, price(l.unitPrice))]),
    ])),
  ];
  return el('Invoice', NS, children);
}

/* ------------------------------ التوقيع ------------------------------ */
/** نص SignedProperties كما تحسب الهيئة بصمته (نطاقات ds على كل عنصر، DigestMethod مغلق ذاتياً) */
function signedPropertiesForHash(sp) {
  const d = ` xmlns:ds="${DS}"`;
  return `<xades:SignedProperties xmlns:xades="${XADES}" Id="xadesSignedProperties"><xades:SignedSignatureProperties><xades:SigningTime>${sp.time}</xades:SigningTime><xades:SigningCertificate><xades:Cert><xades:CertDigest><ds:DigestMethod${d} Algorithm="${SHA256_URI}"/><ds:DigestValue${d}>${sp.certHash}</ds:DigestValue></xades:CertDigest><xades:IssuerSerial><ds:X509IssuerName${d}>${escapeText(sp.issuer)}</ds:X509IssuerName><ds:X509SerialNumber${d}>${sp.serial}</ds:X509SerialNumber></xades:IssuerSerial></xades:Cert></xades:SigningCertificate></xades:SignedSignatureProperties></xades:SignedProperties>`;
}
const escapeText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function extensionsNode(v) {
  const xp = 'http://www.w3.org/TR/1999/REC-xpath-19991116';
  const transform = (x) => el('ds:Transform', { Algorithm: xp }, [el('ds:XPath', x)]);
  return el('ext:UBLExtensions', [el('ext:UBLExtension', [
    el('ext:ExtensionURI', 'urn:oasis:names:specification:ubl:dsig:enveloped:xades'),
    el('ext:ExtensionContent', [el('sig:UBLDocumentSignatures', {
      'xmlns:sac': 'urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2',
      'xmlns:sbc': 'urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2',
      'xmlns:sig': 'urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2',
    }, [el('sac:SignatureInformation', [
      el('cbc:ID', 'urn:oasis:names:specification:ubl:signature:1'),
      el('sbc:ReferencedSignatureID', 'urn:oasis:names:specification:ubl:signature:Invoice'),
      el('ds:Signature', { 'xmlns:ds': DS, Id: 'signature' }, [
        el('ds:SignedInfo', [
          el('ds:CanonicalizationMethod', { Algorithm: 'http://www.w3.org/2006/12/xml-c14n11' }),
          el('ds:SignatureMethod', { Algorithm: 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256' }),
          el('ds:Reference', { Id: 'invoiceSignedData', URI: '' }, [
            el('ds:Transforms', [
              transform('not(//ancestor-or-self::ext:UBLExtensions)'),
              transform('not(//ancestor-or-self::cac:Signature)'),
              transform("not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])"),
              el('ds:Transform', { Algorithm: 'http://www.w3.org/2006/12/xml-c14n11' }),
            ]),
            el('ds:DigestMethod', { Algorithm: SHA256_URI }),
            el('ds:DigestValue', v.invoiceHash),
          ]),
          el('ds:Reference', { Type: 'http://www.w3.org/2000/09/xmldsig#SignatureProperties', URI: '#xadesSignedProperties' }, [
            el('ds:DigestMethod', { Algorithm: SHA256_URI }),
            el('ds:DigestValue', v.signedPropsHash),
          ]),
        ]),
        el('ds:SignatureValue', v.signature),
        el('ds:KeyInfo', [el('ds:X509Data', [el('ds:X509Certificate', v.certificate)])]),
        el('ds:Object', [el('xades:QualifyingProperties', { 'xmlns:xades': XADES, Target: 'signature' }, [
          el('xades:SignedProperties', { Id: 'xadesSignedProperties' }, [el('xades:SignedSignatureProperties', [
            el('xades:SigningTime', v.sp.time),
            el('xades:SigningCertificate', [el('xades:Cert', [
              el('xades:CertDigest', [el('ds:DigestMethod', { Algorithm: SHA256_URI }), el('ds:DigestValue', v.sp.certHash)]),
              el('xades:IssuerSerial', [el('ds:X509IssuerName', v.sp.issuer), el('ds:X509SerialNumber', v.sp.serial)]),
            ])]),
          ])]),
        ])]),
      ]),
    ])])]),
  ])]);
}

/* ------------------------------ QR ------------------------------ */
function tlv(tag, value) {
  const v = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  if (v.length > 255) throw new Error(`QR tag ${tag} too long (${v.length})`);
  return Buffer.concat([Buffer.from([tag, v.length]), v]);
}
function buildQr({ seller, doc, t, invoiceHash, signature, cert }) {
  return Buffer.concat([
    tlv(1, seller.name),
    tlv(2, seller.vatNumber),
    tlv(3, `${doc.issueDate}T${doc.issueTime}`),
    tlv(4, m2(t.payable)), // BT-115 المبلغ المستحق (يشمل تقريب الأسعار الشاملة)
    tlv(5, m2(t.tax)),
    tlv(6, invoiceHash),
    tlv(7, signature),
    tlv(8, cert.publicKeySpki),
    // الوسم 9 (توقيع شهادة الهيئة) للفواتير المبسطة فقط — كما في فواتير SDK الرسمية
    doc.kind === 'standard' ? Buffer.alloc(0) : tlv(9, cert.signature),
  ]).toString('base64');
}

/* ------------------------------ الواجهة ------------------------------ */
/**
 * @param doc     بيانات الفاتورة (انظر validate/computeTotals)
 * @param seller  بيانات المنشأة
 * @param chain   { icv, pih }
 * @param signer  { privateKey: BigInt, cert: parseCertificate(...) }
 * @param now     تاريخ التوقيع (للاختبارات)
 */
function buildSignedInvoice(doc, seller, chain, signer, now = new Date()) {
  const errors = validate(doc, seller);
  if (errors.length) { const e = new Error('بيانات الفاتورة ناقصة: ' + errors.join('، ')); e.code = 'VALIDATION'; e.details = errors; throw e; }
  doc = { ...doc, uuid: doc.uuid || crypto.randomUUID() };
  const t = computeTotals(doc);

  // 1) البصمة على الصيغة القياسية دون UBLExtensions / cac:Signature / QR
  const pure = serialize(buildRoot(doc, seller, chain, t, {}));
  const digest = crypto.createHash('sha256').update(pure, 'utf8').digest();
  const invoiceHash = digest.toString('base64');

  // 2) التوقيع على البصمة
  const signature = ec.signSha256(digest, signer.privateKey).toString('base64');

  // 3) الخصائص الموقعة
  const sp = {
    time: now.toISOString().slice(0, 19),
    certHash: signer.cert.hash,
    issuer: signer.cert.issuer,
    serial: signer.cert.serialNumber,
  };
  const signedPropsHash = Buffer.from(crypto.createHash('sha256').update(signedPropertiesForHash(sp), 'utf8').digest('hex')).toString('base64');

  // 4) QR ثم الفاتورة النهائية
  const qr = buildQr({ seller, doc, t, invoiceHash, signature, cert: signer.cert });
  const extensions = extensionsNode({ invoiceHash, signedPropsHash, signature, certificate: signer.cert.base64, sp });
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + serialize(buildRoot(doc, seller, chain, t, { extensions, qr, signatureRef: true }));

  return {
    uuid: doc.uuid,
    xml,
    invoiceHash,
    qr,
    signature,
    totals: { lineExtension: t.lineExtension, allowance: t.allowance, taxable: t.taxable, tax: t.tax, total: t.taxInclusive, payable: t.payable, rounding: t.rounding },
    _pure: pure,
    _signedPropertiesForHash: signedPropertiesForHash(sp),
  };
}

module.exports = { buildSignedInvoice, computeTotals, validate, INITIAL_PIH, signedPropertiesForHash };
