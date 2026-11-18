import { printStampCss } from './printStamp';
import type { CashMovement, Customer, Invoice, Product, ProductGroup, PurchaseInvoice, PurchaseReturn } from '../types';

/** ما يلزم من سجل الإقفال لتقرير فروق الجرد */
export interface ZClosing {
  reportNumber?: string; closedAt?: string; cashier?: string; kind?: 'shift' | 'daily';
  expectedCash?: number; countedCash?: number; cashDiff?: number;
}
import { deviceLabelOf, deviceNames, deviceTagOf, NO_DEVICE } from './device';
import { customerLabel, invoiceCollected, invoiceRemaining, isReturnDoc, paymentLabel, round2, splitParts } from './invoiceMath';
import { toCsv, type Cell } from './csv';

export type ReportKind = 'daily' | 'monthly' | 'users' | 'profit' | 'purchases' | 'tax'
  | 'items' | 'groups' | 'returns' | 'discounts' | 'customers' | 'inventory' | 'slow' | 'suppliers' | 'byCustomer' | 'devices' | 'tobacco' | 'losses'
  | 'cashflow' | 'cashbox' | 'cashDiff'
  /** التقارير المحاسبية (Pro) — utils/accounting.ts */
  | 'accounting';
/** تقارير لا تُحصر على مستخدم (الكاشير) */
const NO_USER: ReportKind[] = ['purchases', 'inventory', 'slow', 'suppliers', 'customers'];

export interface ReportOptions {
  /** تكلفة الحبة الحالية لكل صنف — للفواتير القديمة التي لم تُحفظ فيها التكلفة */
  productCost?: Map<string, number>;
  /** حصر التقرير على مستخدم (الكاشير) */
  user?: string;
  /** مرتجعات المشتريات: تُطرح من المشتريات وضريبة المدخلات */
  purchaseReturns?: PurchaseReturn[];
  products?: Product[];
  groups?: ProductGroup[];
  customers?: Customer[];
  /** حصر التقرير على عميل (باسمه كما يظهر في الفواتير) */
  customer?: string;
  /** حصر تقارير المشتريات على مورد */
  supplier?: string;
  /** حصر التقرير على جهاز (رمز الجهاز، أو NO_DEVICE لما قبل الربط) */
  device?: string;
  /** حركات الصندوق اليدوية (تقرير الدخل والخرج وتقرير حركة الصندوق) */
  cashMovements?: CashMovement[];
  /** تقارير الإقفال (تقرير فروق الجرد) */
  zReports?: ZClosing[];
}

/** التقارير التي يُطبَّق عليها فلتر العميل / المورد */
export const CUSTOMER_KINDS: ReportKind[] = ['daily', 'monthly', 'items', 'groups', 'users', 'returns', 'discounts', 'profit', 'customers', 'byCustomer', 'tobacco'];
export const SUPPLIER_KINDS: ReportKind[] = ['purchases', 'suppliers'];

export interface ReportTable {
  kind: ReportKind;
  title: string;
  period: string;
  columns: string[];
  rows: Cell[][];
  totals: Cell[];
  summary: { label: string; value: string }[];
  /** تنسيق خاص لبعض الأسطر (عنوان قسم / إجمالي قسم / صافي) — للإقرار الضريبي */
  rowStyles?: ('section' | 'subtotal' | 'net' | undefined)[];
  /** ملاحظات أسفل التقرير */
  notes?: string[];
  /** إخفاء سطر الإجمالي العام (الإقرار له إجمالياته الخاصة) */
  noTotals?: boolean;
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '0.00');
const dayOf = (inv: Invoice) => (inv.date || '').slice(0, 10);

export function filterInvoices(invoices: Invoice[], from: string, to: string): Invoice[] {
  return invoices.filter((inv) => {
    const d = dayOf(inv);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

function periodLabel(from: string, to: string): string {
  if (!from && !to) return 'كل الفترات';
  if (from && to) return `من ${from} إلى ${to}`;
  return from ? `من ${from}` : `حتى ${to}`;
}

interface Bucket {
  count: number; subtotal: number; discount: number; tax: number; total: number;
  cash: number; card: number; bank: number; credit: number;
  returnsCount: number; returns: number;
}
const emptyBucket = (): Bucket => ({ count: 0, subtotal: 0, discount: 0, tax: 0, total: 0, cash: 0, card: 0, bank: 0, credit: 0, returnsCount: 0, returns: 0 });

function addToBucket(b: Bucket, inv: Invoice) {
  const collected = invoiceCollected(inv);
  // المرتجع قيمه سالبة: يُطرح من الإجماليات والضريبة والنقدية، ولا يُحسب كفاتورة
  if (isReturnDoc(inv)) { b.returnsCount += 1; b.returns += Math.abs(inv.total ?? 0); }
  else b.count += 1;
  b.subtotal += inv.subtotal ?? 0;
  b.discount += inv.discount ?? 0;
  b.tax += inv.tax ?? 0;
  b.total += inv.total ?? 0;
  const split = splitParts(inv);
  if (split) { b.cash += split.cash; b.card += split.card; } // نقدي + شبكة: كل جزء في خانته
  else if (inv.paymentMethod === 'card') b.card += collected;
  else if (inv.paymentMethod === 'bank') b.bank += collected;
  else b.cash += collected;
  b.credit += invoiceRemaining(inv);
}

function group(invoices: Invoice[], keyOf: (i: Invoice) => string): [string, Bucket][] {
  const map = new Map<string, Bucket>();
  for (const inv of invoices) {
    const k = keyOf(inv) || '—';
    if (!map.has(k)) map.set(k, emptyBucket());
    addToBucket(map.get(k)!, inv);
  }
  return Array.from(map.entries());
}

function summaryOf(invoices: Invoice[]) {
  const t = emptyBucket();
  invoices.forEach((i) => addToBucket(t, i));
  return {
    totals: t,
    summary: [
      { label: 'صافي المبيعات (بعد المرتجعات)', value: fmt(t.total) },
      ...(t.returnsCount ? [{ label: `المرتجعات (${t.returnsCount})`, value: fmt(t.returns) }] : []),
      { label: 'إجمالي الضريبة', value: fmt(t.tax) },
      { label: 'عدد الفواتير', value: String(t.count) },
      { label: 'المبالغ الآجلة (غير المسددة)', value: fmt(t.credit) },
    ],
  };
}

export function filterPurchases(purchases: PurchaseInvoice[], from: string, to: string): PurchaseInvoice[] {
  return purchases.filter((p) => {
    const d = (p.date || '').slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

/** مبالغ فاتورة الشراء: الفواتير القديمة بلا بيانات ضريبة تُعامل كغير خاضعة (لا تُخصم لها ضريبة مدخلات) */
export function purchaseAmounts(p: PurchaseInvoice) {
  const known = typeof p.vat === 'number' && typeof p.subtotal === 'number';
  return { known, subtotal: known ? p.subtotal! : p.total || 0, vat: known ? p.vat! : 0, total: p.total || 0 };
}

const filterReturns = (rs: PurchaseReturn[] = [], from: string, to: string) =>
  rs.filter((r) => { const d = (r.date || '').slice(0, 10); return !(from && d < from) && !(to && d > to); });

export function buildReport(kind: ReportKind, allInvoices: Invoice[], from: string, to: string, allPurchases: PurchaseInvoice[] = [], opts: ReportOptions = {}): ReportTable {
  const userFilter = opts.user && !NO_USER.includes(kind) ? opts.user : '';
  const custFilter = opts.customer && CUSTOMER_KINDS.includes(kind) ? opts.customer : '';
  const supFilter = opts.supplier && SUPPLIER_KINDS.includes(kind) ? opts.supplier : '';
  if (custFilter) {
    allInvoices = allInvoices.filter((i) => customerLabel(i.customerName) === custFilter);
    opts = { ...opts, customers: (opts.customers || []).filter((c) => customerLabel(c.name) === custFilter) };
  }
  if (supFilter) {
    allPurchases = allPurchases.filter((p) => (p.supplierName || '—') === supFilter);
    opts = { ...opts, purchaseReturns: (opts.purchaseReturns || []).filter((x) => (x.supplierName || '—') === supFilter) };
  }
  const devFilter = opts.device && !NO_USER.includes(kind) ? opts.device : '';
  const invoices = filterInvoices(allInvoices, from, to)
    .filter((i) => !userFilter || (i.cashierName || 'غير محدد') === userFilter)
    .filter((i) => !devFilter || (deviceTagOf(i) || NO_DEVICE) === devFilter);
  const { totals: T, summary } = summaryOf(invoices);
  const period = periodLabel(from, to) + (userFilter ? ` — المستخدم: ${userFilter}` : '') + (devFilter ? ` — الجهاز: ${devFilter}` : '') + (custFilter ? ` — العميل: ${custFilter}` : '') + (supFilter ? ` — المورد: ${supFilter}` : '');

  if (kind === 'profit') {
    // الربح = صافي البيع (قبل الضريبة وبعد خصم الفاتورة موزعاً على الأسطر) − تكلفة البضاعة المباعة
    type P = { name: string; qty: number; sales: number; cost: number; noCost: boolean };
    const map = new Map<string, P>();
    let missing = 0;
    for (const inv of invoices) {
      const sign = isReturnDoc(inv) ? -1 : 1;
      const lines = inv.items || [];
      const linesNet = lines.reduce((t, it) => t + Math.abs((it.price || 0) * (it.qty || 0)), 0);
      const factor = linesNet > 0 ? Math.abs(inv.subtotal ?? linesNet) / linesNet : 1; // توزيع خصم الفاتورة
      for (const it of lines) {
        const qty = Math.abs(it.qty || 0);
        const key = it.productId || it.name;
        if (!map.has(key)) map.set(key, { name: it.name, qty: 0, sales: 0, cost: 0, noCost: false });
        const p = map.get(key)!;
        const unitCost = it.cost ?? (it.productId && opts.productCost?.has(it.productId) ? opts.productCost.get(it.productId)! * (it.factor || 1) : undefined);
        if (unitCost === undefined || !(unitCost > 0)) { p.noCost = true; missing++; }
        p.qty += sign * qty;
        p.sales += sign * Math.abs((it.price || 0) * qty) * factor;
        p.cost += sign * (unitCost || 0) * qty;
      }
    }
    const rows = Array.from(map.values()).sort((a, b) => (b.sales - b.cost) - (a.sales - a.cost));
    const S = rows.reduce((t, r) => t + r.sales, 0), C = rows.reduce((t, r) => t + r.cost, 0);
    const pct = (sales: number, profit: number) => (sales > 0 ? `${((profit / sales) * 100).toFixed(1)}%` : '—');
    return {
      kind, period,
      title: 'تقرير الأرباح (حسب الصنف)',
      columns: ['الصنف', 'الكمية المباعة', 'صافي المبيعات', 'التكلفة', 'الربح', 'هامش الربح'],
      rows: rows.map((r) => [r.name + (r.noCost ? ' ⚠' : ''), round2(r.qty), fmt(r.sales), fmt(r.cost), fmt(r.sales - r.cost), pct(r.sales, r.sales - r.cost)]),
      totals: ['الإجمالي', round2(rows.reduce((t, r) => t + r.qty, 0)), fmt(S), fmt(C), fmt(S - C), pct(S, S - C)],
      summary: [
        { label: 'صافي المبيعات (قبل الضريبة)', value: fmt(S) },
        { label: 'تكلفة البضاعة المباعة', value: fmt(C) },
        { label: 'مجمل الربح', value: fmt(S - C) },
        { label: 'هامش الربح', value: pct(S, S - C) },
      ],
      notes: [
        'صافي المبيعات بعد الخصومات والمرتجعات وقبل ضريبة القيمة المضافة.',
        'التكلفة: تكلفة الصنف وقت البيع (للفواتير الجديدة)، أو تكلفته الحالية في بطاقة الصنف للفواتير القديمة.',
        ...(missing ? ['⚠ أصناف بلا سعر تكلفة — ربحها يظهر أعلى من الحقيقي. أدخل التكلفة في بطاقة الصنف أو عبر فواتير المشتريات.'] : []),
      ],
    };
  }

  if (kind === 'purchases') {
    const list = filterPurchases(allPurchases, from, to);
    const rets = filterReturns(opts.purchaseReturns, from, to);
    let sub = 0, vat = 0, tot = 0, legacy = 0, rSub = 0, rVat = 0, rTot = 0;
    const bySupplier = new Map<string, number>();
    type Row = { date: string; cells: Cell[] };
    const out: Row[] = list.map((p) => {
      const a = purchaseAmounts(p);
      sub += a.subtotal; vat += a.vat; tot += a.total; if (!a.known) legacy++;
      bySupplier.set(p.supplierName || '—', (bySupplier.get(p.supplierName || '—') || 0) + a.total);
      const qty = p.items.reduce((s, it) => s + (it.qty || 0), 0);
      return { date: p.date || '', cells: [(p.date || '').slice(0, 10), 'فاتورة شراء', p.supplierInvoiceNo || '—', p.supplierName || '—', p.items.length, qty, fmt(a.subtotal), a.known ? fmt(a.vat) : '—', fmt(a.total)] };
    });
    // المرتجعات بقيم سالبة لتظهر الصافي مباشرة
    for (const r of rets) {
      rSub += r.subtotal; rVat += r.vat; rTot += r.total;
      bySupplier.set(r.supplierName || '—', (bySupplier.get(r.supplierName || '—') || 0) - r.total);
      const qty = r.items.reduce((s, it) => s + (it.qty || 0), 0);
      out.push({ date: r.date || '', cells: [(r.date || '').slice(0, 10), 'مرتجع مشتريات', `${r.number}${r.supplierInvoiceNo ? ' ← ' + r.supplierInvoiceNo : ''}`, r.supplierName || '—', r.items.length, -qty, fmt(-r.subtotal), fmt(-r.vat), fmt(-r.total)] });
    }
    out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const top = [...bySupplier.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      kind, period,
      title: 'تقرير المشتريات',
      summary: [
        { label: 'إجمالي المشتريات', value: fmt(tot) },
        { label: 'مرتجع المشتريات', value: fmt(rTot) },
        { label: 'صافي المشتريات', value: fmt(tot - rTot) },
        { label: 'صافي ضريبة المدخلات', value: fmt(vat - rVat) },
        { label: 'أكبر مورد (صافي)', value: top ? `${top[0]} (${fmt(top[1])})` : '—' },
      ],
      columns: ['التاريخ', 'النوع', 'رقم المستند', 'المورد', 'عدد الأصناف', 'الكميات', 'قبل الضريبة', 'ضريبة المدخلات', 'الإجمالي'],
      rows: out.map((r) => r.cells),
      totals: ['الصافي', '', `${list.length} فاتورة${rets.length ? ` / ${rets.length} مرتجع` : ''}`, '', '', '', fmt(sub - rSub), fmt(vat - rVat), fmt(tot - rTot)],
      notes: [
        ...(rets.length ? [`مرتجعات المشتريات (${rets.length}) تظهر بالسالب وتُطرح من الإجماليات وضريبة المدخلات.`] : []),
        ...(legacy ? [`${legacy} فاتورة شراء مسجلة قبل إضافة بيانات الضريبة — تظهر بإجماليها ولا تُحتسب لها ضريبة مدخلات.`] : []),
      ],
    };
  }

  if (kind === 'tax') {
    // الإقرار الضريبي (بنفس ترتيب نموذج هيئة الزكاة): المبيعات ثم المشتريات ثم صافي الضريبة المستحقة
    let salesAmt = 0, salesVat = 0, retAmt = 0, retVat = 0, salesCount = 0, retCount = 0;
    for (const i of invoices) {
      if (isReturnDoc(i)) { retAmt += Math.abs(i.subtotal ?? 0); retVat += Math.abs(i.tax ?? 0); retCount++; }
      else { salesAmt += i.subtotal ?? 0; salesVat += i.tax ?? 0; salesCount++; }
    }
    let purAmt = 0, purVat = 0, purCount = 0, legacyAmt = 0, legacyCount = 0;
    for (const p of filterPurchases(allPurchases, from, to)) {
      const a = purchaseAmounts(p);
      if (!a.known) { legacyAmt += a.total; legacyCount++; continue; }
      if (a.vat > 0) { purAmt += a.subtotal; purVat += a.vat; purCount++; }
      else legacyAmt += a.total, legacyCount++;
    }
    // مرتجع المشتريات يخفّض المشتريات الخاضعة وضريبة المدخلات (عمود التعديلات)
    let pRetAmt = 0, pRetVat = 0, pRetCount = 0;
    for (const r of filterReturns(opts.purchaseReturns, from, to)) {
      if (r.vat > 0) { pRetAmt += r.subtotal; pRetVat += r.vat; pRetCount++; }
    }
    const outVat = salesVat - retVat;
    const inVat = purVat - pRetVat;
    const net = outVat - inVat;
    const z = fmt(0);
    const rows: Cell[][] = [
      ['ضريبة القيمة المضافة على المبيعات', '', '', ''],
      ['1. المبيعات الخاضعة للنسبة الأساسية (15%)', fmt(salesAmt), `- ${fmt(retAmt)}`, fmt(outVat)],
      ['2. المبيعات للمواطنين (الخدمات الصحية/التعليم الخاص)', z, z, z],
      ['3. المبيعات المحلية الخاضعة للنسبة الصفرية', z, z, '—'],
      ['4. الصادرات', z, z, '—'],
      ['5. المبيعات المعفاة', z, z, '—'],
      ['6. إجمالي المبيعات', fmt(salesAmt), `- ${fmt(retAmt)}`, fmt(outVat)],
      ['ضريبة القيمة المضافة على المشتريات', '', '', ''],
      ['7. المشتريات الخاضعة للنسبة الأساسية (15%)', fmt(purAmt), pRetAmt ? `- ${fmt(pRetAmt)}` : z, fmt(inVat)],
      ['8. الاستيرادات الخاضعة للضريبة (تدفع في الجمارك)', z, z, z],
      ['9. الاستيرادات الخاضعة للتحصيل العكسي', z, z, z],
      ['10. المشتريات الخاضعة للنسبة الصفرية', z, z, '—'],
      ['11. المشتريات المعفاة / غير الخاضعة', fmt(legacyAmt), z, '—'],
      ['12. إجمالي المشتريات', fmt(purAmt + legacyAmt), pRetAmt ? `- ${fmt(pRetAmt)}` : z, fmt(inVat)],
      ['13. إجمالي ضريبة القيمة المضافة المستحقة عن الفترة الحالية', '', '', fmt(net)],
      ['14. تصحيحات الفترات السابقة', '', '', z],
      ['15. ضريبة القيمة المضافة المرحّلة من الفترة/الفترات السابقة', '', '', z],
      [net >= 0 ? 'صافي الضريبة المستحقة (واجبة السداد)' : 'صافي الضريبة (رصيد دائن قابل للترحيل/الاسترداد)', '', '', fmt(net)],
    ];
    const rowStyles: ReportTable['rowStyles'] = rows.map((r, i) =>
      i === 0 || i === 7 ? 'section' : i === 6 || i === 13 || i === 14 ? 'subtotal' : i === rows.length - 1 ? 'net' : undefined);
    const notes = [
      `المبيعات: ${salesCount} فاتورة، والمرتجعات (إشعارات دائنة): ${retCount} — تظهر في عمود التعديلات.`,
      `المشتريات الخاضعة: ${purCount} فاتورة شراء بضريبة مدخلات.`,
      ...(pRetCount ? [`مرتجعات المشتريات: ${pRetCount} — خُصمت من المشتريات وضريبة المدخلات (عمود التعديلات).`] : []),
      ...(legacyCount ? [`${legacyCount} فاتورة شراء بلا ضريبة مسجلة (أو مسجلة قبل إضافة بيانات الضريبة) أُدرجت في البند 11 ولم تُخصم لها ضريبة.`] : []),
      'هذا ملخص مساعد لتعبئة الإقرار في بوابة هيئة الزكاة والضريبة والجمارك؛ راجع الأرقام قبل التقديم.',
    ];
    return {
      kind, period,
      title: 'الإقرار الضريبي — ضريبة القيمة المضافة',
      summary: [
        { label: 'ضريبة المخرجات (المبيعات)', value: fmt(outVat) },
        { label: 'ضريبة المدخلات (المشتريات)', value: fmt(inVat) },
        { label: net >= 0 ? 'صافي الضريبة المستحقة' : 'رصيد دائن', value: fmt(net) },
        { label: 'صافي المبيعات قبل الضريبة', value: fmt(salesAmt - retAmt) },
      ],
      columns: ['البند', 'المبلغ (ريال)', 'التعديلات (ريال)', 'مبلغ ضريبة القيمة المضافة (ريال)'],
      rows, rowStyles, notes, noTotals: true, totals: [],
    };
  }

  const extra = buildExtra(kind, invoices, allInvoices, from, to, allPurchases, opts, period);
  if (extra) return extra;

  if (kind === 'devices') {
    const names = deviceNames(allInvoices);
    const rows = group(invoices, (i) => deviceLabelOf(i, names)).sort((a, b) => b[1].total - a[1].total);
    return {
      kind, period, summary,
      title: 'المبيعات حسب الجهاز',
      columns: ['الجهاز', 'عدد الفواتير', 'الإجمالي', 'متوسط الفاتورة', 'نقداً', 'شبكة', 'تحويل بنكي', 'آجل'],
      rows: rows.map(([k, b]) => [k, b.count, fmt(b.total), fmt(b.count ? b.total / b.count : 0), fmt(b.cash), fmt(b.card), fmt(b.bank), fmt(b.credit)]),
      totals: ['الإجمالي', T.count, fmt(T.total), fmt(T.count ? T.total / T.count : 0), fmt(T.cash), fmt(T.card), fmt(T.bank), fmt(T.credit)],
      notes: ['كل فاتورة تُنسب للجهاز الذي أصدرها (الرمز في رقمها). «بدون ربط» = فواتير صدرت قبل ربط الأجهزة.'],
    };
  }

  if (kind === 'users') {
    const rows = group(invoices, (i) => i.cashierName || 'غير محدد').sort((a, b) => b[1].total - a[1].total);
    return {
      kind, period, summary,
      title: 'مبيعات الكاشير والمستخدمين',
      columns: ['المستخدم', 'عدد الفواتير', 'الإجمالي', 'متوسط الفاتورة', 'نقداً', 'شبكة', 'تحويل بنكي', 'آجل'],
      rows: rows.map(([k, b]) => [k, b.count, fmt(b.total), fmt(b.count ? b.total / b.count : 0), fmt(b.cash), fmt(b.card), fmt(b.bank), fmt(b.credit)]),
      totals: ['الإجمالي', T.count, fmt(T.total), fmt(T.count ? T.total / T.count : 0), fmt(T.cash), fmt(T.card), fmt(T.bank), fmt(T.credit)],
    };
  }

  const isMonthly = kind === 'monthly';
  const rows = group(invoices, (i) => (isMonthly ? dayOf(i).slice(0, 7) : dayOf(i))).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return {
    kind, period, summary,
    title: isMonthly ? 'إجمالي المبيعات الشهرية' : 'ملخص الحركة اليومية',
    columns: [isMonthly ? 'الشهر' : 'التاريخ', 'عدد الفواتير', 'قبل الضريبة', 'الخصومات', 'الضريبة', 'الإجمالي', 'نقداً', 'شبكة', 'تحويل بنكي', 'آجل'],
    rows: rows.map(([k, b]) => [k, b.count, fmt(b.subtotal), fmt(b.discount), fmt(b.tax), fmt(b.total), fmt(b.cash), fmt(b.card), fmt(b.bank), fmt(b.credit)]),
    totals: ['الإجمالي', T.count, fmt(T.subtotal), fmt(T.discount), fmt(T.tax), fmt(T.total), fmt(T.cash), fmt(T.card), fmt(T.bank), fmt(T.credit)],
  };
}

export function reportToCsv(r: ReportTable, company: string): string {
  return toCsv([
    [company || 'الدفتر الذكي'],
    [r.title],
    [r.period],
    [],
    r.columns,
    ...r.rows,
    ...(r.noTotals ? [] : [r.totals]),
    ...(r.notes?.length ? [[], ...r.notes.map((n) => [n])] : []),
  ]);
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** التقارير اليومية والشهرية (وأي تقرير بأعمدة كثيرة) تُطبع بالعرض */
export const reportLandscape = (r: Pick<ReportTable, 'kind' | 'columns'>) => r.kind === 'daily' || r.kind === 'monthly' || r.kind === 'cashbox' || r.columns.length > 7;

export function reportToHtml(r: ReportTable, company: { name: string; nameEn?: string; vat: string; address?: string; shortAddress?: string }): string {
  const head = r.columns.map((c) => `<th>${esc(c)}</th>`).join('');
  const body = r.rows.map((row, i) => {
    const st = r.rowStyles?.[i];
    if (st === 'section') return `<tr class="section"><td colspan="${r.columns.length}">${esc(row[0])}</td></tr>`;
    return `<tr${st ? ` class="${st}"` : ''}>${row.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`;
  }).join('');
  const notes = r.notes?.length ? `<ul class="notes">${r.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '';
  const foot = `<tr class="tot">${r.totals.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`;
  const cards = r.summary
    .map((s) => `<div class="card"><div class="l">${esc(s.label)}</div><div class="v">${esc(s.value)}</div></div>`)
    .join('');
  const empty = r.rows.length === 0 ? '<p class="empty">لا توجد بيانات في هذه الفترة.</p>' : '';
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(r.title)}</title>
<style>
  @page { size: ${reportLandscape(r) ? 'A4 landscape' : 'A4'}; margin: ${reportLandscape(r) ? '10mm 10mm 14mm' : '12mm 12mm 16mm'}; @bottom-center { content: "صفحة " counter(page) " من " counter(pages); font: 10px Tahoma, Arial, sans-serif; color: #000; } ${printStampCss()} }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Tajawal, Tahoma, Arial, sans-serif; color: #000; margin: 0; font-size: 12px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #134e4a; padding-bottom: 8px; margin-bottom: 12px; }
  header h1 { margin: 0; font-size: 20px; }
  header .co { font-size: 15px; font-weight: 700; }
  header small { color: #000; display: block; margin-top: 2px; }
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
  .card { border: 1px solid #94a3b8; border-radius: 8px; padding: 8px 10px; }
  .card .l { color: #000; font-size: 11px; }
  .card .v { font-size: 17px; font-weight: 800; direction: ltr; text-align: right; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #134e4a; color: #fff; padding: 6px 5px; font-size: 11px; }
  td { padding: 5px; border-bottom: 1px solid #e2e8f0; text-align: center; }
  tr:nth-child(even) td { background: #f8fafc; }
  tr.tot td { font-weight: 800; background: #134e4a; color: #fff; }
  tr.section td { background: #f0fdfa; color: #134e4a; font-weight: 800; text-align: right; border-top: 2px solid #134e4a; }
  tr.subtotal td { font-weight: 800; border-top: 1.5px solid #134e4a; }
  tr.net td { font-weight: 900; font-size: 14px; background: #134e4a; color: #fff; }
  td:first-child { text-align: right; }
  .notes { margin: 12px 0 0; padding-right: 18px; font-size: 11px; color: #000; }
  .empty { text-align: center; color: #000; padding: 30px; }
  footer { margin-top: 14px; color: #000; font-size: 10px; display: flex; justify-content: space-between; }
</style></head><body>
<header>
  <div><h1>${esc(r.title)}</h1><small>الفترة: ${esc(r.period)}</small></div>
  <div style="text-align:left"><div class="co">${esc(company.name || '')}</div>
    ${company.nameEn?.trim() ? `<small dir="ltr" style="font-weight:700">${esc(company.nameEn.trim())}</small>` : ''}
    ${company.vat ? `<small>الرقم الضريبي: ${esc(company.vat)}</small>` : ''}
    ${company.address ? `<small>${esc(company.address)}</small>` : ''}
    ${company.shortAddress?.trim() ? `<small>العنوان المختصر: <bdi dir="ltr">${esc(company.shortAddress.trim())}</bdi></small>` : ''}</div>
</header>
<div class="cards">${cards}</div>
<table><thead><tr>${head}</tr></thead><tbody>${body}${r.rows.length && !r.noTotals ? foot : ''}</tbody></table>
${empty}${notes}
<footer><span>طُبع بتاريخ ${esc(new Date().toLocaleString('ar-SA-u-ca-gregory-nu-latn'))}</span><span>الدفتر الذكي</span></footer>
</body></html>`;
}

export { round2 };

/* ------------------------------------------------------------------ *
 * تقارير إضافية: الأصناف، المجموعات، المرتجعات، الخصومات، العملاء،
 * تقييم المخزون، الأصناف الراكدة، الموردين
 * ------------------------------------------------------------------ */
const pctOf = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '—');
const daysSince = (d: string) => { const t = Date.parse(String(d).replace(' ', 'T')); return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 86400000)) : 0; };

/** سطور الفاتورة بصافيها قبل الضريبة بعد توزيع خصم الفاتورة، وشاملها، بإشارة المرتجع */
function netLines(inv: Invoice) {
  const sign = isReturnDoc(inv) ? -1 : 1;
  const lines = inv.items || [];
  const linesNet = lines.reduce((t, it) => t + Math.abs((it.price || 0) * (it.qty || 0)), 0);
  const factor = linesNet > 0 ? Math.abs(inv.subtotal ?? linesNet) / linesNet : 1;
  const totalFactor = lines.reduce((t, it) => t + Math.abs(it.total || 0), 0);
  const tFactor = totalFactor > 0 ? Math.abs(inv.total || 0) / totalFactor : 1;
  return lines.map((it) => ({
    it, sign, qty: Math.abs(it.qty || 0),
    net: Math.abs((it.price || 0) * (it.qty || 0)) * factor,
    total: Math.abs(it.total || 0) * tFactor,
  }));
}

/** النقد الداخل والخارج في فترة: دفعات البيع والتحصيل والمرتجعات، كل دفعة بتاريخها */
function cashWindow(allInvoices: Invoice[], from: string, to: string, user?: string) {
  const inRange = (d: string | undefined) => { const day = (d || '').slice(0, 10); return !!day && !(from && day < from) && !(to && day > to); };
  const mine = (name: string | undefined) => !user || (name || 'غير محدد') === user;
  const z = () => ({ cash: 0, card: 0, bank: 0 });
  const sale = z(), debt = z(), refund = z();
  let saleCount = 0, debtCount = 0, refundCount = 0;
  const add = (b: { cash: number; card: number; bank: number }, m: string | undefined, v: number) => {
    if (m === 'card') b.card += v; else if (m === 'bank') b.bank += v; else b.cash += v;
  };
  for (const i of allInvoices) {
    if (!mine(i.cashierName)) continue;
    if (isReturnDoc(i)) {
      // المرتجع: ما رُدّ للعميل (قيمته سالبة) بتاريخ المستند
      if (!inRange(i.date)) continue;
      refundCount++; add(refund, i.paymentMethod, Math.abs(invoiceCollected(i)));
      continue;
    }
    // فاتورة بلا سجل دفعات: محصّلة عند البيع
    if (!Array.isArray(i.payments)) {
      if (!inRange(i.date)) continue;
      const v = invoiceCollected(i);
      if (v > 0) { saleCount++; add(sale, i.paymentMethod, v); }
    }
  }
  // الدفعات المسجّلة (دفعة البيع + سداد لاحق) كل واحدة بتاريخها
  for (const i of allInvoices) {
    if (isReturnDoc(i) || !Array.isArray(i.payments)) continue;
    for (const pm of i.payments) {
      if (!inRange(pm.date) || !mine(pm.by ?? i.cashierName)) continue;
      const v = Number(pm.amount) || 0;
      if (!v) continue;
      // دفعة على فاتورة من الفترة = تحصيل بيع، وعلى فاتورة أقدم = تحصيل دين
      if (inRange(i.date)) { saleCount++; add(sale, pm.method, v); }
      else { debtCount++; add(debt, pm.method, v); }
    }
  }
  const sum = (b: { cash: number; card: number; bank: number }) => round2(b.cash + b.card + b.bank);
  return { sale, debt, refund, saleCount, debtCount, refundCount, sum, inRange };
}

/** حركات الصندوق اليدوية مجمّعة حسب السبب */
function byReason(list: CashMovement[]) {
  const map = new Map<string, { total: number; count: number }>();
  for (const m of list) {
    const k = (m.reason || '').trim() || 'بدون سبب';
    const cur = map.get(k) || { total: 0, count: 0 };
    cur.total += Number(m.amount) || 0; cur.count++;
    map.set(k, cur);
  }
  return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
}

function buildExtra(kind: ReportKind, invoices: Invoice[], allInvoices: Invoice[], from: string, to: string, allPurchases: PurchaseInvoice[], opts: ReportOptions, period: string): ReportTable | null {
  const products = opts.products || [];
  const byId = new Map(products.map((p) => [p.id, p]));
  const groupName = (gid?: string) => (opts.groups || []).find((g) => g.id === gid)?.nameAr || 'بدون مجموعة';
  const sales = invoices.filter((i) => !isReturnDoc(i));
  const salesTotal = sales.reduce((t, i) => t + (i.total || 0), 0);

  if (kind === 'cashDiff') {
    const inRange = (d: string | undefined) => { const day = (d || '').slice(0, 10); return !!day && !(from && day < from) && !(to && day > to); };
    const all = (opts.zReports || [])
      .filter((z) => typeof z.countedCash === 'number' && inRange(z.closedAt))
      .filter((z) => !opts.user || (z.cashier || 'غير محدد') === opts.user)
      .slice()
      .sort((a, b) => ((a.closedAt || '') < (b.closedAt || '') ? -1 : 1));
    const diffOf = (z: ZClosing) => round2(typeof z.cashDiff === 'number' ? z.cashDiff : (z.countedCash || 0) - (z.expectedCash || 0));

    const rows: Cell[][] = []; const styles: ('section' | 'subtotal' | 'net' | undefined)[] = [];
    const push = (r: Cell[], st?: 'section' | 'subtotal' | 'net') => { rows.push(r); styles.push(st); };
    const label = (d: number) => (Math.abs(d) < 0.005 ? 'مطابق' : d < 0 ? 'عجز' : 'زيادة');

    let shortSum = 0, overSum = 0, matched = 0;
    const byCashier = new Map<string, { n: number; short: number; over: number; matched: number; worst: number }>();
    for (const z of all) {
      const d = diffOf(z);
      if (d < -0.005) shortSum += -d; else if (d > 0.005) overSum += d; else matched++;
      const who = z.cashier || 'غير محدد';
      const c = byCashier.get(who) || { n: 0, short: 0, over: 0, matched: 0, worst: 0 };
      c.n++;
      if (d < -0.005) c.short += -d; else if (d > 0.005) c.over += d; else c.matched++;
      if (Math.abs(d) > Math.abs(c.worst)) c.worst = d;
      byCashier.set(who, c);
    }

    push(['سجل عمليات الجرد', '', '', '', '', ''], 'section');
    for (const z of all) {
      const d = diffOf(z);
      push([
        (z.closedAt || '').slice(0, 16), z.cashier || 'غير محدد',
        `${z.reportNumber || '—'}${z.kind === 'shift' ? ' (وردية)' : ''}`,
        fmt(z.expectedCash || 0), fmt(z.countedCash || 0),
        `${label(d)}${Math.abs(d) >= 0.005 ? ' ' + fmt(Math.abs(d)) : ''}`,
      ]);
    }
    if (!all.length) push(['—', 'لا توجد عمليات جرد في هذه الفترة', '', '', '', ''], undefined);

    if (byCashier.size) {
      push(['ملخص بالكاشير — من يتكرر عنده الفرق', '', '', '', '', ''], 'section');
      const list = [...byCashier.entries()].sort((a, b) => (b[1].short - b[1].over) - (a[1].short - a[1].over));
      for (const [who, c] of list) {
        const net = round2(c.over - c.short);
        push([
          who, `${c.n} جرد`, `مطابق ${c.matched}`,
          c.short ? `عجز ${fmt(round2(c.short))}` : '—',
          c.over ? `زيادة ${fmt(round2(c.over))}` : '—',
          `${net < 0 ? 'صافي عجز ' : net > 0 ? 'صافي زيادة ' : 'متوازن '}${net ? fmt(Math.abs(net)) : ''}${Math.abs(c.worst) >= 0.005 ? ` — أكبر فرق ${fmt(Math.abs(c.worst))}` : ''}`,
        ], 'subtotal');
      }
    }

    const net = round2(overSum - shortSum);
    return {
      kind, period, title: 'تقرير فروق الجرد (العجز والزيادة)',
      columns: ['التاريخ', 'الكاشير', 'رقم التقرير', 'المتوقع', 'المعدود', 'الفرق'],
      rows, rowStyles: styles, totals: [], noTotals: true,
      summary: [
        { label: 'عمليات الجرد', value: String(all.length) },
        { label: 'مطابقة بلا فرق', value: String(matched) },
        { label: 'إجمالي العجز', value: fmt(round2(shortSum)) },
        { label: 'إجمالي الزيادة', value: fmt(round2(overSum)) },
        { label: net < 0 ? 'صافي العجز' : 'صافي الزيادة', value: fmt(Math.abs(net)) },
      ],
      notes: [
        'يُحسب من عمليات الإقفال التي أُدخل فيها «النقد المعدود في الدرج» — الإقفالات بلا جرد لا تظهر.',
        'العجز = المعدود أقل من المتوقع، والزيادة = أكثر منه. وكل فرق مسجَّل حركةَ صندوق فلا يختل الرصيد.',
        'فرق صغير متكرر عند كاشير واحد يستحق المراجعة ولو كان مبلغه يسيراً.',
      ],
    };
  }

  if (kind === 'cashflow' || kind === 'cashbox') {
    const W = cashWindow(allInvoices, from, to, opts.user);
    const all = (opts.cashMovements || []).filter((m) => !opts.user || (m.by || 'غير محدد') === opts.user);
    const mv = all.filter((m) => W.inRange(m.date)).sort((a, b) => ((a.date || '') < (b.date || '') ? -1 : 1));
    const floats = mv.filter((m) => m.kind === 'float');
    const ins = mv.filter((m) => m.type === 'in' && !m.kind);
    const outs = mv.filter((m) => m.type === 'out' && m.kind !== 'handover' && m.kind !== 'diff');
    const handed = mv.filter((m) => m.kind === 'handover');
    const diffs = mv.filter((m) => m.kind === 'diff');
    const sumOf = (l: CashMovement[]) => round2(l.reduce((t, m) => t + (Number(m.amount) || 0), 0));
    const F = sumOf(floats), I = sumOf(ins), O = sumOf(outs);
    const H = sumOf(handed);
    const D = round2(diffs.reduce((t, m) => t + (m.type === 'in' ? 1 : -1) * (Number(m.amount) || 0), 0));
    const netCash = round2(F + I + W.sale.cash + W.debt.cash - W.refund.cash - O - H + D);

    if (kind === 'cashbox') {
      // رصيد الحركات اليدوية قبل بداية الفترة (لمتابعة الرصيد التراكمي)
      const before = all.filter((m) => from && (m.date || '').slice(0, 10) < from);
      const opening = round2(before.reduce((t, m) => t + (m.type === 'out' ? -1 : 1) * (Number(m.amount) || 0), 0));
      let run = opening;
      const rows: Cell[][] = []; const styles: ('section' | 'subtotal' | 'net' | undefined)[] = [];
      if (from) { rows.push(['—', 'رصيد الحركات قبل الفترة', '', '', fmt(opening), '', '']); styles.push('subtotal'); }
      for (const m of mv) {
        const v = Number(m.amount) || 0;
        run = round2(run + (m.type === 'out' ? -v : v));
        rows.push([
          (m.date || '').slice(0, 16),
          m.kind === 'float' ? 'عهدة' : m.kind === 'handover' ? 'توريد' : m.kind === 'diff' ? (m.type === 'out' ? 'عجز جرد' : 'زيادة جرد') : m.type === 'in' ? 'إدخال' : 'صرف',
          (m.reason || '').trim() || '—',
          `${m.type === 'out' ? '-' : '+'}${fmt(v)}`,
          fmt(run), m.by || '—', m.note || '',
        ]);
        styles.push(undefined);
      }
      if (!mv.length) { rows.push(['—', 'لا توجد حركات في هذه الفترة', '', '', '', '', '']); styles.push(undefined); }
      return {
        kind, period, title: 'تقرير حركة الصندوق',
        columns: ['التاريخ', 'النوع', 'السبب', 'المبلغ', 'رصيد الحركات', 'المستخدم', 'ملاحظة'],
        rows, rowStyles: styles,
        totals: ['الإجمالي', `${mv.length} حركة`, '', `+${fmt(round2(F + I + (D > 0 ? D : 0)))} / -${fmt(round2(O + H + (D < 0 ? -D : 0)))}`, fmt(run), '', ''],
        summary: [
          { label: 'نقدية بداية الوردية (عهدة)', value: fmt(F) },
          { label: 'إدخالات يدوية', value: fmt(I) },
          { label: 'مصروفات من الصندوق', value: fmt(O) },
          ...(H ? [{ label: 'مُسلَّم للخزنة', value: fmt(H) }] : []),
          ...(Math.abs(D) >= 0.005 ? [{ label: D < 0 ? 'عجز جرد' : 'زيادة جرد', value: fmt(Math.abs(D)) }] : []),
          { label: 'صافي الحركات اليدوية', value: fmt(round2(F + I - O - H + D)) },
          { label: 'نقدي المبيعات والتحصيل', value: fmt(round2(W.sale.cash + W.debt.cash - W.refund.cash)) },
          { label: 'صافي النقد في الفترة', value: fmt(netCash) },
        ],
        notes: [
          'الحركات اليدوية فقط (إدخال / صرف / عهدة) — نقدي المبيعات يظهر في الملخص وفي تقرير الدخل والخرج.',
          'رصيد الحركات تراكمي من أول الفترة (مع رصيد ما قبلها إن حُدّد تاريخ بداية).',
          ...(O > 0 ? [] : ['لم تُسجَّل مصروفات في هذه الفترة.']),
        ],
      };
    }

    // ── تقرير الدخل والخرج ──────────────────────────────────────────────
    const rows: Cell[][] = []; const styles: ('section' | 'subtotal' | 'net' | undefined)[] = [];
    const push = (r: Cell[], st?: 'section' | 'subtotal' | 'net') => { rows.push(r); styles.push(st); };
    const line = (label: string, cash: number, card: number, bank: number, note = '') => {
      if (!(Math.abs(cash) > 0.004 || Math.abs(card) > 0.004 || Math.abs(bank) > 0.004)) return;
      push([label, fmt(cash), fmt(card), fmt(bank), fmt(round2(cash + card + bank)), note]);
    };
    const overage = D > 0.005 ? D : 0;
    const inTotal = round2(W.sum(W.sale) + W.sum(W.debt) + F + I + overage);
    const outTotal = round2(W.sum(W.refund) + O + H + (D < 0 ? -D : 0));

    push(['الدخل', '', '', '', '', ''], 'section');
    line(`تحصيل المبيعات (${W.saleCount} دفعة)`, W.sale.cash, W.sale.card, W.sale.bank, 'ما حُصّل فعلاً من فواتير الفترة');
    line(`تحصيل ديون سابقة (${W.debtCount} دفعة)`, W.debt.cash, W.debt.card, W.debt.bank, 'سداد فواتير آجلة من فترات سابقة');
    if (F > 0) line(`نقدية بداية الوردية (${floats.length})`, F, 0, 0, 'عهدة الدرج — ليست إيراداً');
    for (const [r, v] of byReason(ins)) line(`إدخال: ${r}`, round2(v.total), 0, 0, `${v.count} حركة`);
    if (overage) line(`زيادة جرد (${diffs.length})`, overage, 0, 0, 'النقد المعدود أكثر من المتوقع');
    if (!inTotal) push(['—', '', '', '', '0.00', 'لا يوجد دخل في هذه الفترة']);
    push(['إجمالي الدخل', fmt(round2(W.sale.cash + W.debt.cash + F + I + overage)), fmt(round2(W.sale.card + W.debt.card)), fmt(round2(W.sale.bank + W.debt.bank)), fmt(inTotal), ''], 'subtotal');

    push(['الخرج', '', '', '', '', ''], 'section');
    line(`مرتجعات مستردة (${W.refundCount})`, W.refund.cash, W.refund.card, W.refund.bank, 'ما رُدّ للعملاء');
    for (const [r, v] of byReason(outs)) line(`صرف: ${r}`, round2(v.total), 0, 0, `${v.count} حركة`);
    if (H) line(`توريد للخزنة (${handed.length})`, H, 0, 0, 'تحويل للإدارة — ليس مصروفاً');
    if (D < -0.005) line(`عجز جرد (${diffs.length})`, -D, 0, 0, 'فرق النقد المعدود عند الإقفال');
    if (!outTotal) push(['—', '', '', '', '0.00', 'لا يوجد خرج في هذه الفترة']);
    push(['إجمالي الخرج', fmt(round2(W.refund.cash + O + H + (D < 0 ? -D : 0))), fmt(W.refund.card), fmt(W.refund.bank), fmt(outTotal), ''], 'subtotal');

    push(['الصافي (دخل − خرج)', fmt(netCash), fmt(round2(W.sale.card + W.debt.card - W.refund.card)), fmt(round2(W.sale.bank + W.debt.bank - W.refund.bank)), fmt(round2(inTotal - outTotal)), 'النقد في الدرج + الشبكة + البنك'], 'net');

    // المشتريات للعلم: لا تُجمع مع الصافي لتفادي العدّ مرتين مع مصروفات الصندوق
    const pList = filterPurchases(allPurchases, from, to);
    const pTotal = round2(pList.reduce((t, x) => t + (x.total || 0), 0));
    const pRet = round2(filterReturns(opts.purchaseReturns, from, to).reduce((t, x) => t + (x.total || 0), 0));
    if (pList.length || pRet > 0.004) {
      push(['المشتريات (للعلم)', '', '', '', '', ''], 'section');
      push([`فواتير مشتريات الفترة (${pList.length})`, '', '', '', fmt(pTotal), 'من شاشة المشتريات — غير محسوبة في الصافي أعلاه']);
      if (pRet > 0.004) push(['مرتجعات المشتريات', '', '', '', fmt(pRet), 'تُطرح من المشتريات']);
      push(['صافي المشتريات', '', '', '', fmt(round2(pTotal - pRet)), ''], 'subtotal');
    }

    const credit = round2(invoices.filter((i) => !isReturnDoc(i)).reduce((t, i) => t + invoiceRemaining(i), 0));
    return {
      kind, period, title: 'تقرير الدخل والخرج',
      columns: ['البيان', 'نقداً', 'شبكة', 'تحويل بنكي', 'الإجمالي', 'التفاصيل'],
      rows, rowStyles: styles, totals: [], noTotals: true,
      summary: [
        { label: 'إجمالي الدخل', value: fmt(inTotal) },
        { label: 'إجمالي الخرج', value: fmt(outTotal) },
        { label: 'الصافي', value: fmt(round2(inTotal - outTotal)) },
        { label: 'صافي النقد في الدرج', value: fmt(netCash) },
        ...(credit > 0.004 ? [{ label: 'مبيعات آجلة لم تُحصّل', value: fmt(credit) }] : []),
      ],
      notes: [
        'تقرير نقدي: يحسب ما دخل وخرج فعلاً في الفترة — الدفعة تُحسب بتاريخها لا بتاريخ الفاتورة.',
        'المبيعات الآجلة لا تدخل في الدخل حتى تُحصَّل، وتظهر في الملخص.',
        'نقدية بداية الوردية (العهدة) تدخل في النقد الموجود بالدرج وليست إيراداً.',
        ...(H ? ['«توريد للخزنة» تحويل للإدارة لا مصروف — يخرج من الدرج ويظهر هنا ليتطابق الرصيد.'] : []),
        ...(pList.length ? ['قسم المشتريات للعلم فقط: إن سجّلت دفع المشتريات كمصروف في الصندوق فهي محسوبة في الخرج أعلاه ولا تُجمع مرتين.'] : []),
      ],
    };
  }

  if (kind === 'items') {
    type R = { name: string; group: string; sold: number; ret: number; net: number; total: number };
    const map = new Map<string, R>();
    for (const inv of invoices) for (const l of netLines(inv)) {
      const key = l.it.productId ? `${l.it.productId}|${l.it.name}` : l.it.name;
      const p = l.it.productId ? byId.get(l.it.productId) : undefined;
      if (!map.has(key)) map.set(key, { name: l.it.name, group: groupName(p?.groupId), sold: 0, ret: 0, net: 0, total: 0 });
      const r = map.get(key)!;
      if (l.sign > 0) r.sold += l.qty; else r.ret += l.qty;
      r.net += l.sign * l.net; r.total += l.sign * l.total;
    }
    const rows = [...map.values()].sort((a, b) => b.total - a.total);
    const N = rows.reduce((t, r) => t + r.net, 0), TT = rows.reduce((t, r) => t + r.total, 0);
    const Q = rows.reduce((t, r) => t + r.sold - r.ret, 0);
    return {
      kind, period, title: 'مبيعات الأصناف',
      columns: ['الصنف', 'المجموعة', 'الكمية المباعة', 'المرتجع', 'صافي الكمية', 'قبل الضريبة', 'الإجمالي (شامل)', 'متوسط السعر', 'النسبة'],
      rows: rows.map((r) => [r.name, r.group, round2(r.sold), round2(r.ret), round2(r.sold - r.ret), fmt(r.net), fmt(r.total), fmt(r.sold - r.ret > 0 ? r.total / (r.sold - r.ret) : 0), pctOf(r.total, TT)]),
      totals: ['الإجمالي', `${rows.length} صنف`, round2(rows.reduce((t, r) => t + r.sold, 0)), round2(rows.reduce((t, r) => t + r.ret, 0)), round2(Q), fmt(N), fmt(TT), '', '100%'],
      summary: [
        { label: 'أصناف مباعة', value: String(rows.filter((r) => r.sold > 0).length) },
        { label: 'صافي الكميات', value: String(round2(Q)) },
        { label: 'صافي المبيعات (شامل)', value: fmt(TT) },
        { label: 'الأكثر مبيعاً', value: rows[0] ? rows[0].name : '—' },
      ],
      notes: ['المبالغ بعد خصم الفاتورة موزعاً على الأسطر، والمرتجعات مطروحة.'],
    };
  }

  if (kind === 'groups') {
    type R = { items: Set<string>; qty: number; net: number; total: number };
    const map = new Map<string, R>();
    for (const inv of invoices) for (const l of netLines(inv)) {
      const p = l.it.productId ? byId.get(l.it.productId) : undefined;
      const g = groupName(p?.groupId);
      if (!map.has(g)) map.set(g, { items: new Set(), qty: 0, net: 0, total: 0 });
      const r = map.get(g)!;
      r.items.add(l.it.productId || l.it.name); r.qty += l.sign * l.qty; r.net += l.sign * l.net; r.total += l.sign * l.total;
    }
    const rows = [...map.entries()].sort((a, b) => b[1].total - a[1].total);
    const TT = rows.reduce((t, [, r]) => t + r.total, 0), N = rows.reduce((t, [, r]) => t + r.net, 0);
    return {
      kind, period, title: 'مبيعات المجموعات',
      columns: ['المجموعة', 'عدد الأصناف', 'صافي الكمية', 'قبل الضريبة', 'الضريبة', 'الإجمالي (شامل)', 'النسبة'],
      rows: rows.map(([g, r]) => [g, r.items.size, round2(r.qty), fmt(r.net), fmt(r.total - r.net), fmt(r.total), pctOf(r.total, TT)]),
      totals: ['الإجمالي', rows.reduce((t, [, r]) => t + r.items.size, 0), round2(rows.reduce((t, [, r]) => t + r.qty, 0)), fmt(N), fmt(TT - N), fmt(TT), '100%'],
      summary: [
        { label: 'عدد المجموعات', value: String(rows.length) },
        { label: 'الأعلى مبيعاً', value: rows[0] ? `${rows[0][0]} (${pctOf(rows[0][1].total, TT)})` : '—' },
        { label: 'صافي المبيعات (شامل)', value: fmt(TT) },
        { label: 'قبل الضريبة', value: fmt(N) },
      ],
    };
  }

  if (kind === 'byCustomer') {
    // فواتير كل عميل تحت اسمه ثم إجماليه — العميل العام آخراً
    const gen = customerLabel('');
    const map = new Map<string, Invoice[]>();
    for (const i of invoices) { const k = customerLabel(i.customerName); if (!map.has(k)) map.set(k, []); map.get(k)!.push(i); }
    const sum = (l: Invoice[]) => l.reduce((t, i) => t + (i.total || 0), 0);
    const ordered = [...map.entries()].sort((a, b) => (a[0] === gen ? 1 : b[0] === gen ? -1 : sum(b[1]) - sum(a[1])));
    const rows: Cell[][] = [];
    const rowStyles: ReportTable['rowStyles'] = [];
    let T = 0, P = 0, Rm = 0, n = 0;
    for (const [name, list] of ordered) {
      rows.push([`${name} — ${list.length} مستند`, '', '', '', '', '', '']); rowStyles.push('section');
      let t = 0, p = 0, r = 0;
      for (const i of [...list].sort((a, b) => (a.date < b.date ? -1 : 1))) {
        const ret = isReturnDoc(i);
        const paid = ret ? i.total || 0 : invoiceCollected(i);
        const rem = invoiceRemaining(i);
        t += i.total || 0; p += paid; r += rem; n++;
        rows.push([i.invoiceNumber || i.number, (i.date || '').slice(0, 16), ret ? 'مرتجع' : 'بيع', fmt(i.total || 0), fmt(paid), fmt(rem), ret ? '—' : paymentLabel(i)]); rowStyles.push(undefined);
      }
      rows.push([`إجمالي ${name}`, '', '', fmt(t), fmt(p), fmt(r), '']); rowStyles.push('subtotal');
      T += t; P += p; Rm += r;
    }
    return {
      kind, period, title: 'فواتير المبيعات حسب العميل',
      columns: ['الفاتورة', 'التاريخ', 'النوع', 'الإجمالي', 'المدفوع', 'المتبقي', 'طريقة الدفع'],
      rows, rowStyles,
      totals: ['الإجمالي', `${n} مستند`, `${ordered.length} عميل`, fmt(T), fmt(P), fmt(Rm), ''],
      summary: [
        { label: 'عدد العملاء', value: String(ordered.filter(([k]) => k !== gen).length) },
        { label: 'صافي المبيعات', value: fmt(T) },
        { label: 'المحصّل', value: fmt(P) },
        { label: 'المتبقي على العملاء', value: fmt(Rm) },
      ],
      notes: ['المرتجعات بالسالب تحت عميلها. المتبقي حسب الوضع الحالي لكل فاتورة.'],
    };
  }

  if (kind === 'losses') {
    // الخسائر: التالف (بالتكلفة) + البيع تحت التكلفة، وفي الملخص الخصومات والمرتجعات
    const rows: Cell[][] = []; const styles: ('section' | 'subtotal' | 'net' | undefined)[] = [];
    const push = (r: Cell[], st?: 'section' | 'subtotal' | 'net') => { rows.push(r); styles.push(st); };
    const inRange = (d: string) => { const day = (d || '').slice(0, 10); return !(from && day < from) && !(to && day > to); };
    // 1) التالف
    const dmg: { date: string; name: string; qty: number; cost: number; note?: string }[] = [];
    for (const p of opts.products || []) for (const e of p.damageLog || []) if (inRange(e.date)) dmg.push({ date: e.date, name: p.nameAr, qty: e.qty, cost: e.cost ?? p.cost ?? 0, note: e.note });
    dmg.sort((a, b) => (a.date < b.date ? -1 : 1));
    const DV = dmg.reduce((t, d) => t + d.qty * d.cost, 0), DQ = dmg.reduce((t, d) => t + d.qty, 0);
    push(['التالف', '', '', '', '', ''], 'section');
    if (!dmg.length) push(['—', 'لا يوجد تالف في هذه الفترة', '', '', '', '']);
    for (const d of dmg) push([d.date.slice(0, 16), d.name, round2(d.qty), fmt(d.cost), fmt(d.qty * d.cost), d.note || '—']);
    push(['إجمالي التالف', `${dmg.length} تسجيل`, round2(DQ), '', fmt(DV), ''], 'subtotal');
    // 2) البيع تحت التكلفة
    const below: { date: string; inv: string; name: string; qty: number; net: number; cost: number }[] = [];
    for (const i of sales) for (const it of i.items || []) {
      if (!it.productId || it.isTobaccoFee || it.isDeliveryFee) continue;
      const unitCost = it.cost ?? (opts.productCost?.has(it.productId) ? opts.productCost.get(it.productId)! * (it.factor || 1) : undefined);
      if (!unitCost || !(unitCost > 0)) continue;
      const net = (it.total || 0) - (it.tax || 0), c = unitCost * (it.qty || 0);
      if (c - net > 0.004) below.push({ date: i.date || '', inv: i.invoiceNumber || i.number, name: it.name, qty: it.qty || 0, net, cost: c });
    }
    below.sort((a, b) => (a.date < b.date ? -1 : 1));
    const BV = below.reduce((t, b) => t + (b.cost - b.net), 0);
    push(['البيع تحت التكلفة', '', '', '', '', ''], 'section');
    if (!below.length) push(['—', 'لا توجد مبيعات تحت التكلفة في هذه الفترة', '', '', '', '']);
    for (const b of below) push([b.date.slice(0, 16), `${b.name} — ${b.inv}`, round2(b.qty), `${fmt(b.net)} / ${fmt(b.cost)}`, fmt(b.cost - b.net), 'المبيع / التكلفة (قبل الضريبة)']);
    push(['إجمالي البيع تحت التكلفة', `${below.length} سطر`, '', '', fmt(BV), ''], 'subtotal');
    // 3) الخصومات والمرتجعات (مجمّعة — تفاصيلها في تقريريهما)
    const DISC = sales.reduce((t, i) => t + (i.discount || 0) + (i.items || []).reduce((s2, it) => s2 + (it.lineDiscount || 0), 0), 0);
    const rets = invoices.filter(isReturnDoc), RV = rets.reduce((t, r) => t + Math.abs(r.total || 0), 0);
    push(['الخصومات والمرتجعات', '', '', '', '', ''], 'section');
    push(['—', 'الخصومات (فاتورة + أصناف)', `${sales.filter((i) => (i.discount || 0) > 0.004 || (i.items || []).some((it) => (it.lineDiscount || 0) > 0.004)).length} فاتورة`, '', fmt(DISC), 'التفاصيل في تقرير الخصومات']);
    push(['—', 'المرتجعات', `${rets.length} مرتجع`, '', fmt(RV), 'التفاصيل في تقرير المرتجعات']);
    const ALL = DV + BV + DISC + RV;
    push(['إجمالي الخسائر', '', '', '', fmt(ALL), pctOf(ALL, salesTotal) + ' من المبيعات'], 'net');
    return {
      kind, period, title: 'تقرير الخسائر',
      columns: ['التاريخ', 'الصنف / البيان', 'الكمية', 'التكلفة', 'القيمة', 'التفاصيل'],
      rows, rowStyles: styles, totals: [], noTotals: true,
      summary: [
        { label: 'التالف (بالتكلفة)', value: fmt(DV) },
        { label: 'البيع تحت التكلفة', value: fmt(BV) },
        { label: 'الخصومات', value: fmt(DISC) },
        { label: 'المرتجعات', value: fmt(RV) },
        { label: 'إجمالي الخسائر', value: `${fmt(ALL)} (${pctOf(ALL, salesTotal)})` },
      ],
      notes: ['التالف بسعر التكلفة وقت تسجيله (التسجيلات القديمة بالتكلفة الحالية). البيع تحت التكلفة بالقيم قبل الضريبة. الخصومات بطريقة عرض الأسعار، والمرتجعات بقيمتها الإجمالية.'],
    };
  }

  if (kind === 'tobacco') {
    // رسوم تقديم منتجات التبغ: كل فاتورة فيها سطر رسوم — المرتجعات بالسالب
    const tobaccoIds = new Set((opts.products || []).filter((p) => p.isTobacco).map((p) => p.id));
    const net = (it: { total?: number; tax?: number }) => (it.total || 0) - (it.tax || 0);
    const docs = invoices.filter((i) => (i.items || []).some((it) => it.isTobaccoFee)).sort((a, b) => (a.date < b.date ? -1 : 1));
    let U = 0, S = 0, F = 0, FT = 0;
    const byProduct = new Map<string, { qty: number; fee: number }>();
    const rows = docs.map((i) => {
      const items = i.items || [];
      const prods = items.filter((it, k) => !it.isTobaccoFee && ((it.productId && tobaccoIds.has(it.productId)) || items[k + 1]?.isTobaccoFee));
      const fees = items.filter((it) => it.isTobaccoFee);
      const units = prods.reduce((t, it) => t + (it.qty || 0) * (it.factor || 1), 0);
      const sales = prods.reduce((t, it) => t + net(it), 0);
      const fee = fees.reduce((t, it) => t + net(it), 0);
      const feeTax = fees.reduce((t, it) => t + (it.tax || 0), 0);
      U += units; S += sales; F += fee; FT += feeTax;
      items.forEach((it, k) => {
        if (it.isTobaccoFee) return;
        const nextFee = items[k + 1]?.isTobaccoFee ? items[k + 1] : undefined;
        if (!nextFee && !(it.productId && tobaccoIds.has(it.productId))) return;
        const b = byProduct.get(it.name) || { qty: 0, fee: 0 };
        b.qty += (it.qty || 0) * (it.factor || 1); b.fee += nextFee ? net(nextFee) : 0;
        byProduct.set(it.name, b);
      });
      return [(i.date || '').slice(0, 16), (i.invoiceNumber || i.number) + (isReturnDoc(i) ? ' (مرتجع)' : ''), prods.map((it) => `${it.name} ×${round2(Math.abs(it.qty || 0))}`).join('، ') || '—', round2(units), fmt(sales), fmt(fee), fmt(feeTax), fmt(fee + feeTax)];
    });
    const top = [...byProduct.entries()].sort((a, b) => b[1].qty - a[1].qty)[0];
    return {
      kind, period, title: 'تقرير رسوم تقديم منتجات التبغ',
      columns: ['التاريخ', 'الفاتورة', 'منتجات التبغ', 'الوحدات', 'مبيعات التبغ (قبل الضريبة)', 'الرسوم (قبل الضريبة)', 'ضريبة الرسوم', 'الرسوم شاملة الضريبة'],
      rows,
      totals: ['الإجمالي', `${docs.length} فاتورة`, '', round2(U), fmt(S), fmt(F), fmt(FT), fmt(F + FT)],
      summary: [
        { label: 'إجمالي الرسوم (قبل الضريبة)', value: fmt(F) },
        { label: 'ضريبة القيمة المضافة على الرسوم', value: fmt(FT) },
        { label: 'وحدات التبغ المباعة', value: String(round2(U)) },
        { label: 'الأكثر مبيعاً', value: top ? `${top[0]} (${round2(top[1].qty)})` : '—' },
      ],
      notes: ['الرسوم تُحسب لكل وحدة (النسبة من السعر أو الحد الأدنى أيهما أكبر) وتخضع للضريبة، ولا يشملها خصم الفاتورة. المرتجعات تظهر بالسالب وتُطرح من الإجماليات.'],
    };
  }

  if (kind === 'returns') {
    const rets = invoices.filter(isReturnDoc).sort((a, b) => (a.date < b.date ? -1 : 1));
    const RT = rets.reduce((t, r) => t + Math.abs(r.total || 0), 0);
    const method = (r: Invoice) => (r.debtOffset && r.debtOffset > 0 ? `خصم من المديونية ${fmt(r.debtOffset)}` : r.paymentMethod === 'card' ? 'شبكة' : r.paymentMethod === 'bank' ? 'تحويل' : 'نقدي');
    return {
      kind, period, title: 'تقرير المرتجعات',
      columns: ['التاريخ', 'رقم المرتجع', 'عن الفاتورة', 'العميل', 'الكمية', 'المبلغ', 'طريقة الرد', 'الكاشير', 'السبب / الملاحظة'],
      rows: rets.map((r) => [(r.date || '').slice(0, 16), r.invoiceNumber || r.number, r.originalInvoiceNumber || '—', customerLabel(r.customerName), round2((r.items || []).reduce((t, it) => t + Math.abs(it.qty || 0), 0)), fmt(Math.abs(r.total || 0)), method(r), r.cashierName || '—', r.note || '—']),
      totals: ['الإجمالي', `${rets.length} مرتجع`, '', '', round2(rets.reduce((t, r) => t + (r.items || []).reduce((s, it) => s + Math.abs(it.qty || 0), 0), 0)), fmt(RT), '', '', ''],
      summary: [
        { label: 'عدد المرتجعات', value: String(rets.length) },
        { label: 'قيمة المرتجعات', value: fmt(RT) },
        { label: 'نسبتها من المبيعات', value: pctOf(RT, salesTotal) },
        { label: 'المبيعات قبل المرتجع', value: fmt(salesTotal) },
      ],
    };
  }

  if (kind === 'discounts') {
    const rows = sales
      .map((i) => ({ i, inv: i.discount || 0, line: (i.items || []).reduce((t, it) => t + (it.lineDiscount || 0), 0) }))
      .filter((x) => x.inv > 0.004 || x.line > 0.004)
      .sort((a, b) => (a.i.date < b.i.date ? -1 : 1));
    const D1 = rows.reduce((t, x) => t + x.inv, 0), D2 = rows.reduce((t, x) => t + x.line, 0);
    const byCashier = new Map<string, number>();
    for (const x of rows) byCashier.set(x.i.cashierName || 'غير محدد', (byCashier.get(x.i.cashierName || 'غير محدد') || 0) + x.inv + x.line);
    const top = [...byCashier.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      kind, period, title: 'تقرير الخصومات',
      columns: ['التاريخ', 'الفاتورة', 'الكاشير', 'العميل', 'خصم الفاتورة', 'خصومات الأصناف', 'إجمالي الخصم', 'الإجمالي بعد الخصم'],
      rows: rows.map((x) => [(x.i.date || '').slice(0, 16), x.i.invoiceNumber || x.i.number, x.i.cashierName || '—', customerLabel(x.i.customerName), fmt(x.inv), fmt(x.line), fmt(x.inv + x.line), fmt(x.i.total || 0)]),
      totals: ['الإجمالي', `${rows.length} فاتورة`, '', '', fmt(D1), fmt(D2), fmt(D1 + D2), fmt(rows.reduce((t, x) => t + (x.i.total || 0), 0))],
      summary: [
        { label: 'فواتير بخصم', value: `${rows.length} من ${sales.length}` },
        { label: 'إجمالي الخصومات', value: fmt(D1 + D2) },
        { label: 'نسبتها من المبيعات', value: pctOf(D1 + D2, salesTotal + D1 + D2) },
        { label: 'أكثر كاشير خصماً', value: top ? `${top[0]} (${fmt(top[1])})` : '—' },
      ],
      notes: ['خصم الفاتورة قبل الضريبة أو من الإجمالي حسب ما اختاره الكاشير، وخصم الصنف بطريقة عرض الأسعار.'],
    };
  }

  if (kind === 'customers') {
    const customers = opts.customers || [];
    type R = { name: string; phone: string; count: number; total: number; paid: number; owed: number; oldest: string };
    const map = new Map<string, R>();
    const keyOf = (i: Invoice) => i.customerId || `n:${customerLabel(i.customerName)}`;
    for (const i of sales) {
      const k = keyOf(i);
      if (k === `n:${customerLabel('')}`) continue; // العميل العام
      const c = i.customerId ? customers.find((x) => x.id === i.customerId) : undefined;
      if (!map.has(k)) map.set(k, { name: c?.name || customerLabel(i.customerName), phone: c?.phone || '', count: 0, total: 0, paid: 0, owed: 0, oldest: '' });
      const r = map.get(k)!;
      r.count++; r.total += i.total || 0; r.paid += invoiceCollected(i);
    }
    // المديونية الحالية وأقدم فاتورة غير مسددة (من كل الفواتير، لا الفترة فقط)
    for (const c of customers) {
      const owed = (c.balance || 0) < -0.004 ? -c.balance : 0;
      if (owed <= 0 && !map.has(c.id)) continue;
      if (!map.has(c.id)) map.set(c.id, { name: c.name, phone: c.phone || '', count: 0, total: 0, paid: 0, owed: 0, oldest: '' });
      const r = map.get(c.id)!;
      r.owed = owed;
      const open = allInvoices.filter((i) => i.customerId === c.id && invoiceRemaining(i) > 0.004).map((i) => i.date).sort();
      r.oldest = open[0] || '';
    }
    const rows = [...map.values()].sort((a, b) => b.owed - a.owed || b.total - a.total);
    const O = rows.reduce((t, r) => t + r.owed, 0);
    return {
      kind, period, title: 'العملاء والمديونيات',
      columns: ['العميل', 'الجوال', 'فواتير الفترة', 'مشتريات الفترة', 'المحصّل', 'المديونية الحالية', 'أقدم فاتورة غير مسددة', 'عمرها (يوم)'],
      rows: rows.map((r) => [r.name, r.phone || '—', r.count, fmt(r.total), fmt(r.paid), fmt(r.owed), r.oldest ? r.oldest.slice(0, 10) : '—', r.oldest ? daysSince(r.oldest) : '—']),
      totals: ['الإجمالي', `${rows.length} عميل`, rows.reduce((t, r) => t + r.count, 0), fmt(rows.reduce((t, r) => t + r.total, 0)), fmt(rows.reduce((t, r) => t + r.paid, 0)), fmt(O), '', ''],
      summary: [
        { label: 'عملاء لديهم حركة', value: String(rows.filter((r) => r.count).length) },
        { label: 'إجمالي المديونيات', value: fmt(O) },
        { label: 'عملاء مدينون', value: String(rows.filter((r) => r.owed > 0).length) },
        { label: 'متأخرة أكثر من 30 يوماً', value: String(rows.filter((r) => r.oldest && daysSince(r.oldest) > 30).length) },
      ],
      notes: ['المديونية وعمرها حسب الوضع الحالي (كل الفترات)، والمشتريات والمحصّل حسب الفترة المختارة. العميل العام غير مشمول.'],
    };
  }

  if (kind === 'inventory') {
    const list = products.filter((p) => !p.isBundle && !p.isService).sort((a, b) => (b.stock || 0) * (b.cost || 0) - (a.stock || 0) * (a.cost || 0));
    let CV = 0, SV = 0, out = 0, low = 0;
    const rows = list.map((p) => {
      const stock = p.stock || 0, cv = Math.max(0, stock) * (p.cost || 0), sv = Math.max(0, stock) * (p.price || 0);
      CV += cv; SV += sv;
      const min = p.minStock ?? 10;
      const state = stock <= 0 ? 'نافد' : stock <= min ? 'منخفض' : 'متوفر';
      if (stock <= 0) out++; else if (stock <= min) low++;
      return [p.nameAr, groupName(p.groupId), p.barcode || '—', round2(stock), fmt(p.cost || 0), fmt(cv), fmt(p.price || 0), fmt(sv), state];
    });
    return {
      kind, period: 'الوضع الحالي', title: 'تقييم المخزون',
      columns: ['الصنف', 'المجموعة', 'الباركود', 'المخزون', 'التكلفة', 'القيمة بالتكلفة', 'سعر البيع', 'القيمة بسعر البيع', 'الحالة'],
      rows,
      totals: ['الإجمالي', `${list.length} صنف`, '', round2(list.reduce((t, p) => t + Math.max(0, p.stock || 0), 0)), '', fmt(CV), '', fmt(SV), ''],
      summary: [
        { label: 'قيمة المخزون بالتكلفة', value: fmt(CV) },
        { label: 'قيمته بسعر البيع', value: fmt(SV) },
        { label: 'الربح المتوقع', value: fmt(SV - CV) },
        { label: 'نافد / منخفض', value: `${out} / ${low}` },
      ],
      notes: ['تقرير لحظي لا يتأثر بالفترة. سعر البيع كما في بطاقة الصنف (شامل الضريبة إن كانت الأسعار شاملة). الكميات السالبة تُحسب صفراً في القيمة.'],
    };
  }

  if (kind === 'slow') {
    const soldInPeriod = new Set<string>();
    for (const i of sales) for (const it of i.items || []) if (it.productId) soldInPeriod.add(it.productId);
    const lastSale = new Map<string, string>();
    for (const i of allInvoices) if (!isReturnDoc(i)) for (const it of i.items || []) if (it.productId && (!lastSale.has(it.productId) || i.date > lastSale.get(it.productId)!)) lastSale.set(it.productId, i.date);
    const list = products
      .filter((p) => !p.isBundle && !p.isService && !p.disabled && (p.stock || 0) > 0 && !soldInPeriod.has(p.id))
      .map((p) => ({ p, value: (p.stock || 0) * (p.cost || 0), last: lastSale.get(p.id) || '' }))
      .sort((a, b) => b.value - a.value);
    const V = list.reduce((t, x) => t + x.value, 0);
    return {
      kind, period, title: 'الأصناف الراكدة (بلا مبيعات في الفترة)',
      columns: ['الصنف', 'المجموعة', 'المخزون', 'التكلفة', 'قيمة المخزون', 'آخر بيع', 'منذ (يوم)'],
      rows: list.map(({ p, value, last }) => [p.nameAr, groupName(p.groupId), round2(p.stock || 0), fmt(p.cost || 0), fmt(value), last ? last.slice(0, 10) : 'لم يُبع', last ? daysSince(last) : '—']),
      totals: ['الإجمالي', `${list.length} صنف`, round2(list.reduce((t, x) => t + (x.p.stock || 0), 0)), '', fmt(V), '', ''],
      summary: [
        { label: 'أصناف راكدة', value: String(list.length) },
        { label: 'قيمتها بالتكلفة', value: fmt(V) },
        { label: 'لم تُبع إطلاقاً', value: String(list.filter((x) => !x.last).length) },
        { label: 'أكبرها قيمة', value: list[0] ? list[0].p.nameAr : '—' },
      ],
      notes: ['أصناف عليها مخزون ولم تُبع خلال الفترة المختارة — مرشحة للعروض أو إيقاف الشراء.'],
    };
  }

  if (kind === 'suppliers') {
    type R = { count: number; total: number; vat: number; ret: number; retVat: number; retCount: number };
    const map = new Map<string, R>();
    const get = (n: string) => { if (!map.has(n)) map.set(n, { count: 0, total: 0, vat: 0, ret: 0, retVat: 0, retCount: 0 }); return map.get(n)!; };
    for (const p of filterPurchases(allPurchases, from, to)) { const a = purchaseAmounts(p); const r = get(p.supplierName || '—'); r.count++; r.total += a.total; r.vat += a.vat; }
    for (const x of filterReturns(opts.purchaseReturns, from, to)) { const r = get(x.supplierName || '—'); r.retCount++; r.ret += x.total; r.retVat += x.vat; }
    const rows = [...map.entries()].sort((a, b) => (b[1].total - b[1].ret) - (a[1].total - a[1].ret));
    const T = rows.reduce((t, [, r]) => t + r.total, 0), R0 = rows.reduce((t, [, r]) => t + r.ret, 0);
    return {
      kind, period, title: 'المشتريات حسب المورد',
      columns: ['المورد', 'عدد الفواتير', 'المشتريات', 'عدد المرتجعات', 'المرتجع', 'الصافي', 'صافي ضريبة المدخلات', 'النسبة'],
      rows: rows.map(([n, r]) => [n, r.count, fmt(r.total), r.retCount, fmt(r.ret), fmt(r.total - r.ret), fmt(r.vat - r.retVat), pctOf(r.total - r.ret, T - R0)]),
      totals: ['الإجمالي', rows.reduce((t, [, r]) => t + r.count, 0), fmt(T), rows.reduce((t, [, r]) => t + r.retCount, 0), fmt(R0), fmt(T - R0), fmt(rows.reduce((t, [, r]) => t + r.vat - r.retVat, 0)), '100%'],
      summary: [
        { label: 'عدد الموردين', value: String(rows.length) },
        { label: 'صافي المشتريات', value: fmt(T - R0) },
        { label: 'المرتجعات', value: fmt(R0) },
        { label: 'أكبر مورد', value: rows[0] ? rows[0][0] : '—' },
      ],
    };
  }
  return null;
}
