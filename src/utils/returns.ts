import type { Invoice, InvoiceItem } from '../types';
import { invoiceRemaining, isReturnDoc, round2 } from './invoiceMath';

/** الكميات المرتجعة سابقاً من كل سطر في الفاتورة الأصلية */
export function returnedQtyByLine(allInvoices: Invoice[], originalId: string): number[] {
  const out: number[] = [];
  for (const r of allInvoices) {
    if (!isReturnDoc(r) || r.originalInvoiceId !== originalId) continue;
    for (const it of r.items || []) {
      if (it.sourceLine === undefined) continue;
      out[it.sourceLine] = round3((out[it.sourceLine] || 0) + Math.abs(it.qty));
    }
  }
  return out;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** هل بقي في الفاتورة ما يمكن إرجاعه؟ */
export function hasReturnableQty(inv: Invoice, returned: number[] | undefined): boolean {
  if (isReturnDoc(inv)) return false;
  return (inv.items || []).some((it, i) => it.qty - (returned?.[i] || 0) > 0.0005);
}

export interface ReturnComputation {
  lines: { index: number; qty: number }[];
  rawNet: number;     // قبل خصم الفاتورة وقبل الضريبة
  net: number;        // بعد خصم الفاتورة (نسبياً) وقبل الضريبة
  tax: number;
  total: number;      // الإجمالي المرتجع (موجب)
  debtOffset: number; // يُخصم من مديونية العميل على الفاتورة
  refund: number;     // يُرد للعميل نقداً/شبكة
  completesInvoice: boolean;
}

/**
 * حساب قيمة المرتجع بنفس أسعار الفاتورة الأصلية:
 *  - خصم الفاتورة (إن وُجد) يُوزَّع نسبياً على الأسطر
 *  - نسبة الضريبة = نسبة الفاتورة الأصلية (حتى لو تغيّرت الإعدادات لاحقاً)
 *  - إن أكمل هذا المرتجع إرجاع كل الفاتورة نأخذ الباقي بالضبط (بلا فروقات تقريب)
 *  - المرتجع يسدّد أولاً المتبقي على العميل من الفاتورة، والباقي يُرد له
 */
export function computeReturn(orig: Invoice, allInvoices: Invoice[], selection: Record<number, number>): ReturnComputation {
  const items = orig.items || [];
  const returned = returnedQtyByLine(allInvoices, orig.id);
  const lines: { index: number; qty: number }[] = [];
  items.forEach((it, i) => {
    const max = round3(it.qty - (returned[i] || 0));
    const q = Math.min(max, Math.max(0, Number(selection[i]) || 0));
    if (q > 0) lines.push({ index: i, qty: round3(q) });
  });

  const lineBase = items.reduce((s, it) => s + it.price * it.qty, 0);
  const ratio = lineBase > 0 && orig.subtotal !== undefined ? orig.subtotal / lineBase : 1;
  const rate = orig.subtotal ? (orig.tax || 0) / orig.subtotal : 0;

  const rawNet = round2(lines.reduce((s, l) => s + items[l.index].price * l.qty, 0));
  let net = round2(rawNet * ratio);
  let tax = round2(net * rate);
  let total = round2(net + tax);

  const completesInvoice =
    lines.length > 0 &&
    items.every((it, i) => round3((returned[i] || 0) + (lines.find((l) => l.index === i)?.qty || 0)) >= round3(it.qty));
  if (completesInvoice) {
    const prior = allInvoices.filter((r) => isReturnDoc(r) && r.originalInvoiceId === orig.id);
    total = round2(orig.total - prior.reduce((s, r) => s + Math.abs(r.total), 0));
    tax = round2((orig.tax || 0) - prior.reduce((s, r) => s + Math.abs(r.tax || 0), 0));
    net = round2(total - tax);
  }

  const debtOffset = round2(Math.min(invoiceRemaining(orig), Math.max(0, total)));
  return { lines, rawNet, net, tax, total, debtOffset, refund: round2(Math.max(0, total - debtOffset)), completesInvoice };
}

/** يبني مستند المرتجع (قيم سالبة) */
export function buildReturnDoc(
  orig: Invoice,
  c: ReturnComputation,
  o: { id: string; number: string; date: string; refundMethod: 'cash' | 'card'; restock: boolean; cashierName?: string; note?: string }
): Invoice {
  const rate = orig.subtotal ? (orig.tax || 0) / orig.subtotal : 0;
  const items: InvoiceItem[] = c.lines.map(({ index, qty }) => {
    const it = orig.items[index];
    return {
      productId: it.productId,
      factor: it.factor,
      sourceLine: index,
      name: it.name,
      description: it.description,
      ...(it.bundle?.length ? { bundle: it.bundle } : {}),
      qty: -qty,
      price: it.price,
      tax: -round2(it.price * qty * rate),
      total: -round2(it.price * qty * (1 + rate)),
    };
  });
  const discount = round2(c.rawNet - c.net);
  return {
    id: o.id,
    docType: 'return',
    originalInvoiceId: orig.id,
    originalInvoiceNumber: orig.invoiceNumber || orig.number,
    number: o.number,
    invoiceNumber: o.number,
    date: o.date,
    customerName: orig.customerName,
    ...(orig.customerId ? { customerId: orig.customerId } : {}),
    items,
    rawSubtotal: -c.rawNet,
    subtotal: -c.net,
    tax: -c.tax,
    total: -c.total,
    ...(discount > 0.004 ? { discount: -discount } : {}),
    paymentMethod: o.refundMethod,
    debtOffset: c.debtOffset > 0 ? c.debtOffset : undefined,
    restocked: o.restock,
    cashierName: o.cashierName,
    note: o.note,
  };
}
