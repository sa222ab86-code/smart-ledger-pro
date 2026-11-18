import type { Invoice, PayMethod } from '../types';

/** أسماء طرق الدفع كما تظهر للمستخدم */
export const PAY_METHOD_LABELS: Record<PayMethod, string> = { cash: 'نقدي', card: 'شبكة', bank: 'تحويل بنكي' };
export const payMethodLabel = (m: string | undefined) => PAY_METHOD_LABELS[(m || 'cash') as PayMethod] || 'نقدي';

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const isReturnDoc = (inv: Invoice) => inv.docType === 'return';

/** المتبقي على العميل (0 للفاتورة المسددة وللمرتجع) */
export function invoiceRemaining(inv: Invoice): number {
  if (isReturnDoc(inv)) return 0;
  return Math.max(0, round2(inv.remainingAmount ?? 0));
}

/**
 * ما حُصِّل فعلاً من الفاتورة (لا يتجاوز إجماليها حتى لو دفع العميل أكثر وأخذ باقياً).
 * المرتجع: قيمة سالبة = ما رُدّ للعميل فعلاً (بعد استبعاد ما خُصم من مديونيته).
 */
export function invoiceCollected(inv: Invoice): number {
  if (isReturnDoc(inv)) return round2(Math.min(0, inv.total + (inv.debtOffset || 0)));
  return round2(Math.max(0, inv.total - invoiceRemaining(inv)));
}

export function isUnsettled(inv: Invoice): boolean {
  return invoiceRemaining(inv) > 0.004;
}

export const GENERAL_CUSTOMER = 'عميل عام';

/** الاسم المعروض للعميل: الفواتير القديمة المسجلة باسم «عميل نقدي» تظهر الآن «عميل عام» */
export function customerLabel(name?: string): string {
  const n = (name || '').trim();
  return !n || n === 'عميل نقدي' || n === 'نقدي' ? GENERAL_CUSTOMER : n;
}

/** وصف طريقة الدفع للفاتورة: الآجل يظهر «غير مدفوع» بدل «نقدي» */
export function paymentLabel(inv: Invoice): string {
  const remaining = invoiceRemaining(inv);
  if (remaining > 0.004) {
    const paid = (inv.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
    return inv.paymentStatus === 'unpaid' || paid <= 0 ? 'غير مدفوع (آجل)' : 'مدفوع جزئياً (آجل)';
  }
  if (inv.paymentMethod === 'bank') return 'تحويل بنكي';
  if (inv.paymentMethod === 'card') return 'شبكة / بطاقة';
  if (inv.paymentMethod === 'split') return 'نقدي + شبكة';
  return 'نقدي';
}

/** الدفع المقسّم (نقدي + شبكة): المبلغ لكل طريقة — null لغير المقسّمة */
export function splitParts(inv: Invoice): { cash: number; card: number } | null {
  if (inv.paymentMethod !== 'split' || !Array.isArray(inv.payments)) return null;
  let cash = 0, card = 0;
  for (const p of inv.payments) { if (p.method === 'card') card += Number(p.amount) || 0; else if (p.method !== 'bank') cash += Number(p.amount) || 0; }
  return { cash: round2(cash), card: round2(card) };
}

/** كمية مكوّن الباقة في السطر (كمية المكوّن × كمية الباقة) بلا أصفار زائدة */
export function bundleQty(perBundle: number, lineQty: number): string {
  return String(Math.round(Math.abs((Number(perBundle) || 1) * (Number(lineQty) || 1)) * 1000) / 1000);
}
