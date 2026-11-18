import type { Invoice } from '../types';
import { invoiceCollected, invoiceRemaining, isReturnDoc, round2 } from './invoiceMath';
import { localTimestamp } from './files';

/** حدّ آخر إقفال: ما بعده (أو عنده وليس ضمن المعرّفات المشمولة) يتبع الوردية الحالية */
export interface ShiftCut { at: string; ids: Set<string> }

const after = (date: string | undefined, id: string, cut: ShiftCut | null) =>
  !cut || (date || '') > cut.at || ((date || '') === cut.at && !cut.ids.has(id));

/**
 * أرقام الوردية (تقرير الإقفال Z):
 *  - المبيعات والضريبة: من مستندات الوردية (المرتجع بقيم سالبة فيُطرح تلقائياً)
 *  - الدرج (نقدي/شبكة/تحويل): ما دخل الصندوق فعلاً خلال الوردية
 *      • فاتورة مدفوعة كاملة: إجماليها حسب طريقة دفعها
 *      • فاتورة آجلة/جزئية: كل دفعة بتاريخها وطريقتها (حتى سداد فاتورة من يوم سابق)
 *      • المرتجع: ما رُدّ فعلاً للعميل (سالب) حسب طريقة الرد
 *  - الآجل: المتبقي على العملاء من فواتير الوردية
 */
export function computeShift(invoices: Invoice[], cut: ShiftCut | null, cashier?: string) {
  // cashier: وردية كاشير واحد — مستنداته ودفعاته فقط (الدفعة القديمة بلا «by» تُنسب لكاشير الفاتورة)
  const mine = (name: string | undefined) => cashier === undefined || (name || '') === cashier;
  const docs = invoices.filter((i) => after(i.date, i.id, cut) && mine(i.cashierName));
  const pay = { cash: 0, card: 0, bank: 0, other: 0 };
  const add = (m: string | undefined, v: number) => {
    if (m === 'cash' || m === 'card' || m === 'bank') pay[m] += v; else pay.other += v;
  };
  let salesTotal = 0, returnsTotal = 0, salesCount = 0, returnsCount = 0, subtotal = 0, totalVat = 0, creditOutstanding = 0, debtCollections = 0, collectionsCount = 0;
  const windowPayments: { id: string; date: string }[] = [];

  for (const i of docs) {
    const ret = isReturnDoc(i);
    const total = Number(i.total) || 0;
    subtotal += i.subtotal !== undefined ? Number(i.subtotal) || 0 : total / 1.15;
    totalVat += i.tax !== undefined ? Number(i.tax) || 0 : total - total / 1.15;
    if (ret) {
      returnsCount++; returnsTotal += -total;
      add(i.paymentMethod, invoiceCollected(i)); // سالب = ما رُدّ للعميل
      continue;
    }
    salesCount++; salesTotal += total;
    creditOutstanding += invoiceRemaining(i);
    if (!Array.isArray(i.payments)) add(i.paymentMethod, invoiceCollected(i)); // مدفوعة عند البيع
  }

  // دفعات الفواتير الآجلة/الجزئية بتاريخها (دفعة البيع الأولى + السداد اللاحق من أي يوم)
  const shiftIds = new Set(docs.map((d) => d.id));
  for (const i of invoices) {
    if (isReturnDoc(i) || !Array.isArray(i.payments)) continue;
    for (const p of i.payments) {
      if (!after(p.date, p.id, cut) || !mine(p.by ?? i.cashierName)) continue;
      const amt = Number(p.amount) || 0;
      add(p.method, amt);
      windowPayments.push({ id: p.id, date: p.date });
      if (!shiftIds.has(i.id)) { debtCollections += amt; collectionsCount++; }
    }
  }

  const grandTotal = salesTotal - returnsTotal;
  const dates = docs.map((d) => d.date || '').filter(Boolean).concat(windowPayments.map((p) => p.date));
  const start = dates.length ? dates.reduce((m, d) => (d < m ? d : m)) : '';
  const last = dates.length ? dates.reduce((m, d) => (d > m ? d : m)) : '';
  return {
    docs,
    /** عمليات الوردية (مستندات + دفعات) — للسماح بالإقفال حتى لو كانت تحصيلات فقط */
    activityCount: docs.length + collectionsCount,
    collectionsCount,
    totalCash: round2(pay.cash),
    totalCard: round2(pay.card),
    totalBank: round2(pay.bank),
    totalOther: round2(pay.other),
    drawerTotal: round2(pay.cash + pay.card + pay.bank + pay.other),
    salesTotal: round2(salesTotal),
    returnsTotal: round2(returnsTotal),
    salesCount,
    returnsCount,
    creditOutstanding: round2(creditOutstanding),
    debtCollections: round2(debtCollections),
    subtotal: round2(subtotal),
    totalVat: round2(totalVat),
    grandTotal: round2(grandTotal),
    invoicesCount: salesCount,
    shiftStart: start,
    /** آخر عملية شملها الإقفال + معرّفات العمليات في نفس الثانية (حتى لا تُحتسب مرتين) */
    cutoff: last,
    cutoffIds: [
      ...docs.filter((d) => d.date === last).map((d) => d.id),
      ...windowPayments.filter((p) => p.date === last).map((p) => p.id),
    ],
  };
}

/** الأحدث من حدّين (حدّ وردية الكاشير وحدّ آخر إقفال يومي) */
export function laterCut(a: ShiftCut | null, b: ShiftCut | null): ShiftCut | null {
  if (!a) return b;
  if (!b) return a;
  if (a.at > b.at) return a;
  if (b.at > a.at) return b;
  return { at: a.at, ids: new Set([...a.ids, ...b.ids]) };
}

/** ملخص مبيعات الكاشيرية داخل نافذة (للإقفال اليومي) */
export function cashierBreakdown(invoices: Invoice[], cut: ShiftCut | null) {
  const names = new Set<string>();
  for (const i of invoices) {
    if (after(i.date, i.id, cut)) names.add(i.cashierName || '');
    if (!isReturnDoc(i) && Array.isArray(i.payments)) for (const p of i.payments) if (after(p.date, p.id, cut)) names.add(p.by ?? i.cashierName ?? '');
  }
  return [...names].map((name) => ({ name, ...computeShift(invoices, cut, name) }))
    .filter((r) => r.activityCount > 0)
    .sort((a, b) => b.grandTotal - a.grandTotal);
}

/** التاريخ والوقت للعرض: «2026-10-27 18:05» بالتوقيت المحلي (بدون T أو Z) */
export function displayTs(s: string | undefined | null): string {
  const v = String(s || '').trim();
  if (!v) return '';
  // توقيت عالمي (ينتهي بـ Z أو فرق توقيت) → محلي
  if (/(Z|[+-]\d\d:?\d\d)$/.test(v)) {
    const t = Date.parse(v);
    if (Number.isFinite(t)) return localTimestamp(new Date(t)).slice(0, 16);
  }
  return v.replace('T', ' ').replace(/\.\d+$/, '').slice(0, 16);
}
