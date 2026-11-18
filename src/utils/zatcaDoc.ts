import type { Customer, Invoice } from '../types';
import { round2, splitParts } from './invoiceMath';

/** هل الرقم الضريبي صالح (15 رقماً يبدأ وينتهي بـ 3)؟ */
/** تحويل الأرقام العربية/الفارسية إلى لاتينية (٣١٠ → 310) */
export const latinDigits = (v?: string) =>
  (v || '').replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
/** الرقم الضريبي بعد التنظيف: أرقام لاتينية فقط بلا مسافات أو شرطات */
export const normVat = (v?: string) => latinDigits(v).replace(/\D/g, '');
export const isValidVat = (v?: string) => /^3\d{13}3$/.test(normVat(v));

export interface ZatcaDocPayload {
  kind: 'simplified' | 'standard';
  typeCode: 388 | 381 | 383;
  number: string;
  issueDate: string;
  issueTime: string;
  lines: { name: string; qty: number; unitPrice: number; vatPercent: number }[];
  allowance?: { amount: number; reason: string };
  paymentMeansCode: string;
  billingReference?: string;
  instructionNote?: string;
  /** المبلغ الذي دفعه العميل فعلاً — يُضبط فرق الهللات عبر PayableRoundingAmount */
  payableTotal?: number;
  buyer?: { name: string; vatNumber?: string; street?: string; building?: string; district?: string; city?: string; postalCode?: string };
}

/** الحقول الناقصة في عنوان العميل لإصدار فاتورة ضريبية */
export function missingBuyerFields(c: Customer): string[] {
  const m: string[] = [];
  if (!(c.street || '').trim()) m.push('الشارع');
  if (!/^\d{4}$/.test(latinDigits(c.buildingNumber).trim())) m.push('رقم المبنى (4 أرقام)');
  if (!(c.district || '').trim()) m.push('الحي');
  if (!(c.city || '').trim()) m.push('المدينة');
  if (!/^\d{5}$/.test(latinDigits(c.postalCode).trim())) m.push('الرمز البريدي (5 أرقام)');
  return m;
}

/**
 * يحوّل فاتورة البرنامج إلى بيانات فاتورة الهيئة.
 *  - العميل له رقم ضريبي صالح → فاتورة ضريبية (تُعتمد من الهيئة قبل اعتبارها نهائية)، وإلا → مبسطة
 *  - المرتجع يتبع نوع الفاتورة الأصلية (forceKind) ويُرسل إشعاراً دائناً 381
 */
export function buildZatcaDoc(
  inv: Invoice,
  o: { customer?: Customer | null; taxRatePercent: number; forceKind?: 'simplified' | 'standard' }
): { doc: ZatcaDocPayload } | { error: string } {
  const isReturn = inv.docType === 'return';
  const [issueDate, issueTimeRaw] = (inv.date || '').split(' ');
  const issueTime = (issueTimeRaw || '00:00:00').slice(0, 8);
  const c = o.customer || null;
  const kind = o.forceKind || (c && isValidVat(c.vatNumber) ? 'standard' : 'simplified');

  if (kind === 'standard') {
    if (!c) return { error: 'الفاتورة الضريبية تحتاج عميلاً مسجلاً' };
    const miss = missingBuyerFields(c);
    if (!isValidVat(c.vatNumber)) miss.unshift('الرقم الضريبي');
    if (miss.length) return { error: `لإصدار فاتورة ضريبية للعميل «${c.name}» أكمل في شاشة العملاء: ${miss.join('، ')}` };
  }

  const rate = o.taxRatePercent;
  const lines = (inv.items || []).map((it) => ({
    name: it.name,
    qty: Math.abs(it.qty),
    unitPrice: Math.abs(it.price),
    vatPercent: rate,
  }));
  // خصم الفاتورة = مجموع الأسطر (بعد تقريبها) − صافي الفاتورة قبل الضريبة
  const linesNet = lines.reduce((s, l) => s + round2(l.qty * l.unitPrice), 0);
  const net = Math.abs(inv.subtotal ?? 0);
  const allowance = round2(linesNet - net);

  const unpaid = !isReturn && (inv.remainingAmount || 0) > 0 && !(inv.payments || []).length && (inv.paidAmount || 0) <= 0;
  // 10 نقدي، 48 بطاقة، 42 تحويل لحساب بنكي، 30 آجل (تحويل دائن)
  // المقسّم (نقدي + شبكة): رمز الطريقة ذات المبلغ الأكبر
  const split = splitParts(inv);
  const paymentMeansCode = unpaid ? '30' : split ? (split.card >= split.cash ? '48' : '10') : inv.paymentMethod === 'card' ? '48' : inv.paymentMethod === 'bank' ? '42' : '10';

  return {
    doc: {
      kind,
      typeCode: isReturn ? 381 : 388,
      number: inv.invoiceNumber || inv.number,
      issueDate,
      issueTime,
      lines,
      // فرق هللة أو هللتين ناتج عن تقريب الأسعار الشاملة وليس خصماً → يُعالج بتقريب المبلغ المستحق
      allowance: allowance > 0.02 ? { amount: allowance, reason: 'خصم' } : undefined,
      paymentMeansCode,
      billingReference: isReturn ? inv.originalInvoiceNumber : undefined,
      instructionNote: isReturn ? (inv.note || 'إرجاع بضاعة') : undefined,
      payableTotal: round2(Math.abs(inv.total || 0)),
      buyer: kind === 'standard' && c
        ? { name: c.name, vatNumber: normVat(c.vatNumber), street: c.street, building: latinDigits(c.buildingNumber).trim(), district: c.district, city: c.city, postalCode: latinDigits(c.postalCode).trim() }
        : c && c.name ? { name: c.name } : undefined,
    },
  };
}
