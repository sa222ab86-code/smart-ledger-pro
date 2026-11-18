/**
 * Smart Ledger Pro — المحاسبة الكاملة (القيد المزدوج).
 *
 *  - دليل حسابات شجري (أصول، خصوم، حقوق ملكية، إيرادات، مصروفات) قابل للتعديل
 *  - القيود الآلية تُشتق مباشرة من مستندات البرنامج (لا تُخزَّن): المبيعات، المرتجعات، التحصيل،
 *    المشتريات ومرتجعها، حركات الصندوق، التالف. أي تعديل/حذف لمستند ينعكس فوراً على الحسابات
 *    بلا قيود يتيمة ولا ازدواج.
 *  - القيود اليدوية والسندات (قبض/صرف) والقيد الافتتاحي تُحفظ في مجموعة journalEntries
 *  - التقارير: اليومية، دفتر الأستاذ/كشف الحساب، ميزان المراجعة، قائمة الدخل، الميزانية العمومية،
 *    أرصدة العملاء والموردين — لكل فرع أو موحّدة
 */
import type { CashMovement, Invoice, Product, PurchaseInvoice, PurchaseReturn } from '../types';
import { customerLabel, invoiceCollected, isReturnDoc, round2 } from './invoiceMath';
import type { ReportTable } from './reports';
import type { Cell } from './csv';

/* ------------------------------ الأنواع ------------------------------ */
export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface Account {
  id: string;
  code: string;
  name: string;
  nameEn?: string;
  type: AccountType;
  /** الحساب الأب (للتجميع في التقارير) */
  parentId?: string;
  /** حساب تجميعي: لا يُقيَّد عليه مباشرة */
  isGroup?: boolean;
  /** حساب نظام لا يُحذف (مرتبط بالقيود الآلية) */
  system?: boolean;
  disabled?: boolean;
  note?: string;
}

export interface JournalLine {
  accountId: string;
  debit: number;
  credit: number;
  memo?: string;
  /** حساب فرعي (عميل/مورد) لكشف حساب الطرف */
  partyType?: 'customer' | 'supplier';
  partyId?: string;
  partyName?: string;
}

/** قيد محفوظ (يدوي/سند/افتتاحي) */
export interface JournalEntry {
  id: string;
  number: string;
  date: string;
  kind: 'manual' | 'opening' | 'receipt' | 'payment' | 'adjust';
  memo: string;
  lines: JournalLine[];
  /** مرجع خارجي (رقم شيك، فاتورة مورد...) */
  reference?: string;
  createdBy?: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt?: string;
  /** ربط الأجهزة: الجهاز الذي أنشأه */
  deviceTag?: string;
}

export type EntryKind = JournalEntry['kind'] | 'sale' | 'saleReturn' | 'collection' | 'purchase' | 'purchaseReturn' | 'cash' | 'damage';

/** قيد في دفتر الأستاذ (آلي أو محفوظ) */
export interface LedgerEntry {
  id: string;
  number: string;
  date: string;
  kind: EntryKind;
  memo: string;
  lines: JournalLine[];
  auto: boolean;
  /** معرّف المستند المصدر (فاتورة/شراء...) */
  sourceId?: string;
  /** الفرع (في التقارير الموحّدة) */
  branch?: string;
}

export type AccountRole =
  | 'cash' | 'card' | 'bank' | 'ar' | 'inventory' | 'vatIn' | 'vatOut' | 'ap'
  | 'sales' | 'salesReturns' | 'cogs' | 'otherIncome' | 'miscExpense' | 'cashDiff' | 'damage' | 'invAdjust'
  | 'opening' | 'capital' | 'retained';

export interface AccountingSettings {
  /** ربط أدوار القيود الآلية بالحسابات */
  roles: Partial<Record<AccountRole, string>>;
  /** إقفال الفترة: لا إضافة ولا تعديل ولا حذف لقيود يدوية بتاريخ قبل/يساوي هذا اليوم */
  lockDate?: string;
  /** المستندات التي تُرحَّل آلياً */
  autoPost: { sales: boolean; purchases: boolean; cash: boolean; damage: boolean };
  /** فواتير المشتريات: آجلة على المورد (الافتراضي) أو مدفوعة من الصندوق/البنك */
  purchasesPaidFrom?: 'credit' | 'cash' | 'bank';
  /** بداية الترحيل الآلي: المستندات قبل هذا التاريخ لا تُرحَّل (تُدخل أرصدتها في القيد الافتتاحي) */
  startDate?: string;
  /** تصنيف حركات الصندوق اليدوية: معرّف الحركة → الحساب المقابل */
  cashMap?: Record<string, string>;
}

/** ما يلزم لاشتقاق القيود الآلية (بيانات جهاز/فرع واحد) */
export interface SourceData {
  invoices?: Invoice[];
  purchases?: PurchaseInvoice[];
  purchaseReturns?: PurchaseReturn[];
  cashMovements?: CashMovement[];
  products?: Product[];
  journalEntries?: JournalEntry[];
}

/* ------------------------------ دليل الحسابات الافتراضي ------------------------------ */
const A = (code: string, name: string, type: AccountType, parent?: string, extra: Partial<Account> = {}): Account => ({
  id: `acc-${code}`, code, name, type, ...(parent ? { parentId: `acc-${parent}` } : {}), ...extra,
});
const G = { isGroup: true, system: true } as const;
const S = { system: true } as const;

export const DEFAULT_ACCOUNTS: Account[] = [
  A('1', 'الأصول', 'asset', undefined, G),
  A('11', 'الأصول المتداولة', 'asset', '1', G),
  A('1110', 'الصندوق (النقدية)', 'asset', '11', S),
  A('1120', 'البنك', 'asset', '11', S),
  A('1125', 'مدى / الشبكة (تحت التحصيل)', 'asset', '11', S),
  A('1130', 'العملاء (ذمم مدينة)', 'asset', '11', S),
  A('1140', 'المخزون', 'asset', '11', S),
  A('1150', 'ضريبة القيمة المضافة — مدخلات', 'asset', '11', S),
  A('1160', 'عُهد وسُلف الموظفين', 'asset', '11'),
  A('1170', 'مصروفات مدفوعة مقدماً', 'asset', '11'),
  A('12', 'الأصول الثابتة', 'asset', '1', G),
  A('1210', 'الأثاث والتجهيزات', 'asset', '12'),
  A('1220', 'الأجهزة والمعدات', 'asset', '12'),
  A('1230', 'السيارات', 'asset', '12'),
  A('1290', 'مجمع الإهلاك', 'asset', '12'),
  A('2', 'الخصوم', 'liability', undefined, G),
  A('21', 'الخصوم المتداولة', 'liability', '2', G),
  A('2110', 'الموردون (ذمم دائنة)', 'liability', '21', S),
  A('2120', 'ضريبة القيمة المضافة — مخرجات', 'liability', '21', S),
  A('2130', 'مصروفات مستحقة', 'liability', '21'),
  A('2140', 'رواتب مستحقة', 'liability', '21'),
  A('2150', 'قروض قصيرة الأجل', 'liability', '21'),
  A('3', 'حقوق الملكية', 'equity', undefined, G),
  A('3100', 'رأس المال', 'equity', '3', S),
  A('3200', 'جاري المالك / المسحوبات', 'equity', '3'),
  A('3300', 'الأرباح المحتجزة', 'equity', '3', S),
  A('3900', 'أرصدة افتتاحية', 'equity', '3', S),
  A('4', 'الإيرادات', 'revenue', undefined, G),
  A('4100', 'المبيعات', 'revenue', '4', S),
  A('4110', 'مردودات المبيعات', 'revenue', '4', S),
  A('4200', 'إيرادات أخرى', 'revenue', '4', S),
  A('5', 'المصروفات', 'expense', undefined, G),
  A('5100', 'تكلفة البضاعة المباعة', 'expense', '5', S),
  A('52', 'المصروفات التشغيلية', 'expense', '5', G),
  A('5210', 'الرواتب والأجور', 'expense', '52'),
  A('5220', 'الإيجار', 'expense', '52'),
  A('5230', 'الكهرباء والماء', 'expense', '52'),
  A('5240', 'الاتصالات والإنترنت', 'expense', '52'),
  A('5250', 'الصيانة والإصلاح', 'expense', '52'),
  A('5260', 'النقل والتوصيل', 'expense', '52'),
  A('5270', 'رسوم بنكية وعمولات الشبكة', 'expense', '52'),
  A('5280', 'مصروفات متنوعة', 'expense', '52', S),
  A('5290', 'التالف والهالك', 'expense', '52', S),
  A('5291', 'فروقات جرد المخزون', 'expense', '52', S),
  A('5295', 'فروقات الصندوق (عجز/زيادة)', 'expense', '52', S),
  A('5300', 'الإهلاك', 'expense', '52'),
];

export const DEFAULT_ROLES: Record<AccountRole, string> = {
  cash: 'acc-1110', bank: 'acc-1120', card: 'acc-1125', ar: 'acc-1130', inventory: 'acc-1140', vatIn: 'acc-1150',
  ap: 'acc-2110', vatOut: 'acc-2120', capital: 'acc-3100', retained: 'acc-3300', opening: 'acc-3900',
  sales: 'acc-4100', salesReturns: 'acc-4110', otherIncome: 'acc-4200',
  cogs: 'acc-5100', miscExpense: 'acc-5280', damage: 'acc-5290', invAdjust: 'acc-5291', cashDiff: 'acc-5295',
};

export const ROLE_LABELS: Record<AccountRole, string> = {
  cash: 'الصندوق (المبيعات النقدية)', card: 'الشبكة / مدى', bank: 'التحويل البنكي', ar: 'العملاء (الآجل)',
  inventory: 'المخزون', vatIn: 'ضريبة المدخلات', vatOut: 'ضريبة المخرجات', ap: 'الموردون',
  sales: 'المبيعات', salesReturns: 'مردودات المبيعات', cogs: 'تكلفة البضاعة المباعة', otherIncome: 'إدخال للصندوق (افتراضي)',
  miscExpense: 'صرف من الصندوق (افتراضي)', cashDiff: 'فروقات الصندوق', damage: 'التالف', invAdjust: 'فروقات الجرد',
  opening: 'الأرصدة الافتتاحية', capital: 'رأس المال', retained: 'الأرباح المحتجزة',
};

export const DEFAULT_ACCT_SETTINGS: AccountingSettings = {
  roles: {},
  autoPost: { sales: true, purchases: true, cash: true, damage: true },
  purchasesPaidFrom: 'credit',
};

export const TYPE_LABELS: Record<AccountType, string> = { asset: 'أصول', liability: 'خصوم', equity: 'حقوق ملكية', revenue: 'إيرادات', expense: 'مصروفات' };
export const KIND_LABELS: Record<EntryKind, string> = {
  manual: 'قيد يومية', opening: 'قيد افتتاحي', receipt: 'سند قبض', payment: 'سند صرف', adjust: 'قيد تسوية',
  sale: 'فاتورة مبيعات', saleReturn: 'مرتجع مبيعات', collection: 'تحصيل من عميل', purchase: 'فاتورة مشتريات',
  purchaseReturn: 'مرتجع مشتريات', cash: 'حركة صندوق', damage: 'تالف',
};
/** طبيعة الحساب: مدين (أصول/مصروفات) أو دائن */
export const debitNature = (t: AccountType) => t === 'asset' || t === 'expense';

export function roleOf(settings: AccountingSettings | undefined, role: AccountRole): string {
  return settings?.roles?.[role] || DEFAULT_ROLES[role];
}

/* ------------------------------ أدوات ------------------------------ */
const r2 = (n: number) => round2(Number(n) || 0);
const dayOf = (d?: string) => String(d || '').slice(0, 10);
const inRange = (d: string, from?: string, to?: string) => (!from || d >= from) && (!to || d <= to);
export const fmtMoney = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '0.00');

/** يضيف سطراً إن لم يكن صفراً (السالب يُقلب للجهة الأخرى) */
function push(lines: JournalLine[], accountId: string, amount: number, side: 'D' | 'C', extra: Partial<JournalLine> = {}) {
  let a = r2(amount);
  if (Math.abs(a) < 0.005) return;
  if (a < 0) { a = -a; side = side === 'D' ? 'C' : 'D'; }
  lines.push({ accountId, debit: side === 'D' ? a : 0, credit: side === 'C' ? a : 0, ...extra });
}

/** فرق التقريب (هللة) يُحمَّل على آخر سطر بنفس الجهة كي يتوازن القيد دائماً */
function balance(lines: JournalLine[], fallbackAccount: string) {
  const d = r2(lines.reduce((t, l) => t + l.debit, 0));
  const c = r2(lines.reduce((t, l) => t + l.credit, 0));
  const diff = r2(d - c);
  if (Math.abs(diff) < 0.005) return;
  if (Math.abs(diff) <= 0.05) {
    const l = diff > 0 ? [...lines].reverse().find((x) => x.credit > 0) : [...lines].reverse().find((x) => x.debit > 0);
    if (l) { if (diff > 0) l.credit = r2(l.credit + diff); else l.debit = r2(l.debit - diff); return; }
  }
  push(lines, fallbackAccount, diff, 'C', { memo: 'فرق تقريب' });
}

export function lineTotals(lines: JournalLine[]) {
  const debit = r2(lines.reduce((t, l) => t + (Number(l.debit) || 0), 0));
  const credit = r2(lines.reduce((t, l) => t + (Number(l.credit) || 0), 0));
  return { debit, credit, diff: r2(debit - credit) };
}

const methodRole = (m?: string): AccountRole => (m === 'card' ? 'card' : m === 'bank' ? 'bank' : 'cash');

/* ------------------------------ القيود الآلية ------------------------------ */
export interface AutoOptions {
  /** تكلفة الحبة الحالية لكل صنف — للفواتير القديمة بلا تكلفة محفوظة */
  productCost?: Map<string, number>;
  branch?: string;
}

function saleEntries(inv: Invoice, st: AccountingSettings, o: AutoOptions): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  const R = (r: AccountRole) => roleOf(st, r);
  const day = dayOf(inv.date);
  const party: Partial<JournalLine> = { partyType: 'customer', partyId: inv.customerId, partyName: customerLabel(inv.customerName) };
  const T = r2(inv.total);
  const V = r2(inv.tax || 0);
  const net = r2(T - V);
  const ret = isReturnDoc(inv);
  const lines: JournalLine[] = [];

  // تكلفة البضاعة (للمرتجع تُعاد للمخزون فقط إن أُرجعت الكميات)
  let cogs = 0;
  for (const it of inv.items || []) {
    if (it.isTobaccoFee || it.isDeliveryFee) continue;
    const unit = it.cost ?? (it.productId && o.productCost?.has(it.productId) ? o.productCost.get(it.productId)! * (it.factor || 1) : 0);
    cogs += (Number(unit) || 0) * Math.abs(Number(it.qty) || 0);
  }
  cogs = r2(cogs);

  if (!ret) {
    push(lines, R('sales'), net, 'C');
    push(lines, R('vatOut'), V, 'C');
    const collected = r2(invoiceCollected(inv));
    const pays = Array.isArray(inv.payments) ? inv.payments : [];
    const later = pays.filter((p) => dayOf(p.date) > day);
    const laterSum = r2(later.reduce((t, p) => t + (Number(p.amount) || 0), 0));
    const initial = Math.max(0, r2(collected - laterSum));
    // طرق دفع البيع: من دفعات يوم البيع، وإلا من طريقة دفع الفاتورة
    const same = pays.filter((p) => dayOf(p.date) <= day);
    const sameSum = same.reduce((t, p) => t + (Number(p.amount) || 0), 0);
    if (initial > 0) {
      if (sameSum > 0) {
        let left = initial;
        same.forEach((p, i) => {
          const part = i === same.length - 1 ? left : r2((initial * (Number(p.amount) || 0)) / sameSum);
          left = r2(left - part);
          push(lines, R(methodRole(p.method)), part, 'D');
        });
      } else {
        push(lines, R(methodRole(inv.paymentMethod === 'split' ? 'cash' : inv.paymentMethod)), initial, 'D');
      }
    }
    push(lines, R('ar'), r2(T - initial), 'D', party);
    if (st.autoPost.sales !== false && cogs > 0) { push(lines, R('cogs'), cogs, 'D'); push(lines, R('inventory'), cogs, 'C'); }
    balance(lines, R('sales'));
    out.push({ id: `auto:sale:${inv.id}`, number: inv.number || inv.invoiceNumber, date: inv.date, kind: 'sale', memo: `فاتورة ${inv.number || ''} — ${customerLabel(inv.customerName)}`, lines, auto: true, sourceId: inv.id, branch: o.branch });
    // التحصيلات اللاحقة
    for (const p of later) {
      const pl: JournalLine[] = [];
      push(pl, R(methodRole(p.method)), Number(p.amount) || 0, 'D');
      push(pl, R('ar'), Number(p.amount) || 0, 'C', party);
      if (pl.length) out.push({ id: `auto:col:${inv.id}:${p.id}`, number: inv.number, date: p.date, kind: 'collection', memo: `تحصيل على فاتورة ${inv.number || ''} — ${customerLabel(inv.customerName)}${p.note ? ` (${p.note})` : ''}`, lines: pl, auto: true, sourceId: inv.id, branch: o.branch });
    }
  } else {
    // مرتجع: القيم سالبة في المستند
    const refund = r2(-invoiceCollected(inv)); // ما رُدّ نقداً/شبكة
    const total = Math.abs(T);
    push(lines, R('salesReturns'), Math.abs(net), 'D');
    push(lines, R('vatOut'), Math.abs(V), 'D');
    const refundMethod = (inv as Invoice & { refundMethod?: string }).refundMethod || inv.paymentMethod;
    push(lines, R(methodRole(refundMethod)), refund, 'C');
    push(lines, R('ar'), r2(total - refund), 'C', party);
    if (inv.restocked && cogs > 0) { push(lines, R('inventory'), cogs, 'D'); push(lines, R('cogs'), cogs, 'C'); }
    balance(lines, R('salesReturns'));
    out.push({ id: `auto:ret:${inv.id}`, number: inv.number || inv.invoiceNumber, date: inv.date, kind: 'saleReturn', memo: `مرتجع ${inv.number || ''}${inv.originalInvoiceNumber ? ` على ${inv.originalInvoiceNumber}` : ''}`, lines, auto: true, sourceId: inv.id, branch: o.branch });
  }
  return out;
}

function purchaseAmounts(p: { total: number; subtotal?: number; vat?: number }) {
  const total = r2(p.total);
  const vat = r2(p.vat || 0);
  const net = p.vat != null ? r2(p.subtotal ?? total - vat) : total;
  return { total, vat, net };
}

export function buildAutoEntries(src: SourceData, st: AccountingSettings, o: AutoOptions = {}): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  const R = (r: AccountRole) => roleOf(st, r);
  const start = st.startDate || '';
  const ok = (d: string) => !start || dayOf(d) >= start;

  if (st.autoPost.sales !== false) {
    for (const inv of src.invoices || []) if (inv && ok(inv.date)) out.push(...saleEntries(inv, st, o));
  }
  if (st.autoPost.purchases !== false) {
    const payAcc = st.purchasesPaidFrom === 'cash' ? R('cash') : st.purchasesPaidFrom === 'bank' ? R('bank') : R('ap');
    for (const p of src.purchases || []) {
      if (!p || !ok(p.date)) continue;
      const { total, vat, net } = purchaseAmounts(p);
      const lines: JournalLine[] = [];
      push(lines, R('inventory'), net, 'D');
      push(lines, R('vatIn'), vat, 'D');
      push(lines, payAcc, total, 'C', payAcc === R('ap') ? { partyType: 'supplier', partyId: p.supplierId, partyName: p.supplierName } : {});
      balance(lines, R('inventory'));
      out.push({ id: `auto:pur:${p.id}`, number: p.supplierInvoiceNo || p.id.slice(-6), date: p.date, kind: 'purchase', memo: `مشتريات من ${p.supplierName || 'مورد'}${p.supplierInvoiceNo ? ` — فاتورة ${p.supplierInvoiceNo}` : ''}`, lines, auto: true, sourceId: p.id, branch: o.branch });
    }
    for (const r of src.purchaseReturns || []) {
      if (!r || !ok(r.date)) continue;
      const { total, vat, net } = purchaseAmounts(r);
      const lines: JournalLine[] = [];
      push(lines, payAcc, total, 'D', payAcc === R('ap') ? { partyType: 'supplier', partyId: r.supplierId, partyName: r.supplierName } : {});
      push(lines, R('inventory'), net, 'C');
      push(lines, R('vatIn'), vat, 'C');
      balance(lines, R('inventory'));
      out.push({ id: `auto:pret:${r.id}`, number: r.number, date: r.date, kind: 'purchaseReturn', memo: `مرتجع مشتريات ${r.number} — ${r.supplierName || ''}`, lines, auto: true, sourceId: r.id, branch: o.branch });
    }
  }
  if (st.autoPost.cash !== false) {
    for (const m of src.cashMovements || []) {
      if (!m || !ok(m.date) || m.kind === 'float' || m.kind === 'handover') continue;
      const counter = st.cashMap?.[m.id] || (m.kind === 'diff' ? R('cashDiff') : m.type === 'in' ? R('otherIncome') : R('miscExpense'));
      const lines: JournalLine[] = [];
      if (m.type === 'in') { push(lines, R('cash'), m.amount, 'D'); push(lines, counter, m.amount, 'C'); }
      else { push(lines, counter, m.amount, 'D'); push(lines, R('cash'), m.amount, 'C'); }
      out.push({ id: `auto:cash:${m.id}`, number: '', date: m.date, kind: 'cash', memo: `${m.type === 'in' ? 'إدخال للصندوق' : 'صرف من الصندوق'}: ${m.reason || ''}${m.note ? ` — ${m.note}` : ''}`, lines, auto: true, sourceId: m.id, branch: o.branch });
    }
  }
  if (st.autoPost.damage !== false) {
    for (const p of src.products || []) {
      (p.damageLog || []).forEach((d, i) => {
        if (!ok(d.date)) return;
        const amount = r2((Number(d.qty) || 0) * (Number(d.cost ?? p.cost) || 0));
        if (amount <= 0) return;
        const lines: JournalLine[] = [];
        push(lines, R('damage'), amount, 'D');
        push(lines, R('inventory'), amount, 'C');
        out.push({ id: `auto:dmg:${p.id}:${i}`, number: '', date: d.date, kind: 'damage', memo: `تالف: ${p.nameAr} × ${d.qty}${d.note ? ` — ${d.note}` : ''}`, lines, auto: true, sourceId: p.id, branch: o.branch });
      });
    }
  }
  return out;
}

export function manualToLedger(entries: JournalEntry[] | undefined, branch?: string): LedgerEntry[] {
  return (entries || []).filter((e) => e && Array.isArray(e.lines)).map((e) => ({
    id: e.id, number: e.number, date: e.date, kind: e.kind, memo: e.memo, lines: e.lines, auto: false, branch,
  }));
}

/** كل قيود مصدر واحد (آلية + يدوية) مرتبة بالتاريخ */
export function buildLedger(src: SourceData, st: AccountingSettings, o: AutoOptions = {}): LedgerEntry[] {
  const all = [...buildAutoEntries(src, st, o), ...manualToLedger(src.journalEntries, o.branch)];
  return all.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/* ------------------------------ الأرصدة ------------------------------ */
export interface Bal { open: number; debit: number; credit: number }
/** أرصدة كل حساب: open = صافي (مدين − دائن) قبل from، والحركة داخل الفترة */
export function computeBalances(entries: LedgerEntry[], from?: string, to?: string): Map<string, Bal> {
  const m = new Map<string, Bal>();
  const get = (id: string) => { let b = m.get(id); if (!b) { b = { open: 0, debit: 0, credit: 0 }; m.set(id, b); } return b; };
  for (const e of entries) {
    const d = dayOf(e.date);
    if (to && d > to) continue;
    const before = !!from && d < from;
    for (const l of e.lines) {
      const b = get(l.accountId);
      if (before) b.open += (Number(l.debit) || 0) - (Number(l.credit) || 0);
      else { b.debit += Number(l.debit) || 0; b.credit += Number(l.credit) || 0; }
    }
  }
  for (const b of m.values()) { b.open = r2(b.open); b.debit = r2(b.debit); b.credit = r2(b.credit); }
  return m;
}
/** الرصيد الختامي بطبيعة الحساب (موجب = على طبيعته) */
export const closingNet = (b: Bal | undefined) => (b ? r2(b.open + b.debit - b.credit) : 0);
export const natural = (acc: Account, net: number) => (debitNature(acc.type) ? net : -net);

/** الحسابات الفرعية لكل حساب (بالترتيب) */
export function childrenMap(accounts: Account[]) {
  const m = new Map<string, Account[]>();
  for (const a of accounts) {
    const k = a.parentId || '';
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(a);
  }
  for (const list of m.values()) list.sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
  return m;
}
/** شجرة الحسابات مسطّحة بالترتيب مع العمق */
export function flattenTree(accounts: Account[]): { acc: Account; depth: number }[] {
  const kids = childrenMap(accounts);
  const ids = new Set(accounts.map((a) => a.id));
  const out: { acc: Account; depth: number }[] = [];
  const walk = (pid: string, depth: number) => { for (const a of kids.get(pid) || []) { out.push({ acc: a, depth }); walk(a.id, depth + 1); } };
  walk('', 0);
  // حسابات أبوها محذوف تظهر في الجذر
  for (const a of accounts) if (a.parentId && !ids.has(a.parentId) && !out.some((x) => x.acc.id === a.id)) { out.push({ acc: a, depth: 0 }); walk(a.id, 1); }
  return out;
}
/** صافي حساب مع كل أبنائه */
export function rollupNet(accounts: Account[], bals: Map<string, Bal>, part: 'closing' | 'period' = 'closing'): Map<string, number> {
  const kids = childrenMap(accounts);
  const memo = new Map<string, number>();
  const val = (b?: Bal) => (!b ? 0 : part === 'closing' ? b.open + b.debit - b.credit : b.debit - b.credit);
  const calc = (a: Account): number => {
    if (memo.has(a.id)) return memo.get(a.id)!;
    let v = val(bals.get(a.id));
    for (const c of kids.get(a.id) || []) v += calc(c);
    v = r2(v);
    memo.set(a.id, v);
    return v;
  };
  for (const a of accounts) calc(a);
  return memo;
}

/* ------------------------------ التحقق ------------------------------ */
export function validateEntry(e: Pick<JournalEntry, 'date' | 'lines'>, accounts: Account[], lockDate?: string): string[] {
  const errs: string[] = [];
  const byId = new Map(accounts.map((a) => [a.id, a]));
  if (!e.date || !/^\d{4}-\d{2}-\d{2}/.test(e.date)) errs.push('التاريخ غير صالح');
  if (lockDate && dayOf(e.date) <= lockDate) errs.push(`الفترة حتى ${lockDate} مقفلة — لا يمكن القيد بتاريخ داخلها`);
  const lines = (e.lines || []).filter((l) => (Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0);
  if (lines.length < 2) errs.push('القيد يحتاج سطرين على الأقل (مدين ودائن)');
  lines.forEach((l, i) => {
    const a = byId.get(l.accountId);
    if (!a) errs.push(`السطر ${i + 1}: اختر الحساب`);
    else if (a.isGroup) errs.push(`السطر ${i + 1}: «${a.name}» حساب تجميعي — اختر حساباً فرعياً`);
    if ((Number(l.debit) || 0) < 0 || (Number(l.credit) || 0) < 0) errs.push(`السطر ${i + 1}: المبالغ لا تكون سالبة`);
    if ((Number(l.debit) || 0) > 0 && (Number(l.credit) || 0) > 0) errs.push(`السطر ${i + 1}: إما مدين أو دائن وليس الاثنين`);
  });
  const t = lineTotals(lines);
  if (Math.abs(t.diff) >= 0.01) errs.push(`القيد غير متوازن: المدين ${fmtMoney(t.debit)} والدائن ${fmtMoney(t.credit)} (الفرق ${fmtMoney(Math.abs(t.diff))})`);
  if (t.debit <= 0) errs.push('القيد بلا مبالغ');
  return errs;
}

/** الرقم التالي لنوع قيد (JV-000001، RV-…، PV-…) */
export const ENTRY_PREFIX: Record<JournalEntry['kind'], string> = { manual: 'JV', opening: 'OB', receipt: 'RV', payment: 'PV', adjust: 'AJ' };
export function nextEntryNumber(entries: JournalEntry[], kind: JournalEntry['kind'], tag = ''): string {
  const prefix = `${ENTRY_PREFIX[kind]}${tag ? `-${tag}` : ''}-`;
  let max = 0;
  for (const e of entries) if (e.number?.startsWith(prefix)) max = Math.max(max, Number(e.number.slice(prefix.length)) || 0);
  return `${prefix}${String(max + 1).padStart(6, '0')}`;
}

/** قيمة المخزون الفعلية (الكمية × التكلفة) — للمطابقة مع رصيد حساب المخزون */
export function stockValuation(products: Product[] | undefined): number {
  let v = 0;
  for (const p of products || []) {
    if (!p || p.isService || p.isBundle) continue;
    const q = Number(p.stock) || 0;
    if (q > 0) v += q * (Number(p.cost) || 0);
  }
  return r2(v);
}

/* ------------------------------ التقارير ------------------------------ */
const periodLabel = (from?: string, to?: string) => (from && to ? `من ${from} إلى ${to}` : from ? `من ${from}` : to ? `حتى ${to}` : 'كل الفترات');
const accTitle = (a?: Account) => (a ? `${a.code} — ${a.name}` : '—');
const DC = (net: number): [Cell, Cell] => (net >= 0 ? [fmtMoney(net), ''] : ['', fmtMoney(-net)]);
const base = (title: string, period: string): Pick<ReportTable, 'kind' | 'title' | 'period'> => ({ kind: 'accounting', title, period });

export function trialBalanceReport(accounts: Account[], entries: LedgerEntry[], from?: string, to?: string, opts: { hideZero?: boolean; scope?: string } = {}): ReportTable {
  const bals = computeBalances(entries, from, to);
  const rows: Cell[][] = [];
  const T = { od: 0, oc: 0, d: 0, c: 0, cd: 0, cc: 0 };
  const known = new Set(accounts.map((a) => a.id));
  const leaves = flattenTree(accounts).filter((x) => !x.acc.isGroup).map((x) => x.acc);
  // حسابات مستخدمة في قيود لكنها محذوفة من الدليل
  for (const id of bals.keys()) if (!known.has(id)) leaves.push({ id, code: '؟', name: `حساب محذوف (${id})`, type: 'asset' });
  for (const a of leaves) {
    const b = bals.get(a.id);
    const close = closingNet(b);
    if (opts.hideZero !== false && (!b || (Math.abs(b.open) < 0.005 && b.debit === 0 && b.credit === 0))) continue;
    const [od, oc] = DC(b?.open || 0);
    const [cd, cc] = DC(close);
    T.od += Math.max(0, b?.open || 0); T.oc += Math.max(0, -(b?.open || 0)); T.d += b?.debit || 0; T.c += b?.credit || 0; T.cd += Math.max(0, close); T.cc += Math.max(0, -close);
    rows.push([a.code, a.name, od, oc, fmtMoney(b?.debit || 0), fmtMoney(b?.credit || 0), cd, cc]);
  }
  const ok = Math.abs(r2(T.d - T.c)) < 0.01 && Math.abs(r2(T.cd - T.cc)) < 0.01;
  return {
    ...base('ميزان المراجعة', periodLabel(from, to) + (opts.scope ? ` — ${opts.scope}` : '')),
    columns: ['الكود', 'الحساب', 'افتتاحي مدين', 'افتتاحي دائن', 'حركة مدين', 'حركة دائن', 'ختامي مدين', 'ختامي دائن'],
    rows,
    totals: ['', 'الإجمالي', fmtMoney(T.od), fmtMoney(T.oc), fmtMoney(T.d), fmtMoney(T.c), fmtMoney(T.cd), fmtMoney(T.cc)],
    summary: [
      { label: 'إجمالي الحركة المدينة', value: fmtMoney(T.d) },
      { label: 'إجمالي الحركة الدائنة', value: fmtMoney(T.c) },
      { label: 'عدد الحسابات', value: String(rows.length) },
      { label: 'التوازن', value: ok ? 'متوازن ✓' : 'غير متوازن ✗' },
    ],
  };
}

export interface IncomeFigures { revenue: number; cogs: number; gross: number; expenses: number; net: number }
export function incomeFigures(accounts: Account[], entries: LedgerEntry[], from?: string, to?: string, st?: AccountingSettings): IncomeFigures {
  const bals = computeBalances(entries, from, to);
  const cogsId = roleOf(st, 'cogs');
  let revenue = 0, cogs = 0, expenses = 0;
  const byId = new Map(accounts.map((a) => [a.id, a]));
  for (const [id, b] of bals) {
    const a = byId.get(id);
    if (!a) continue;
    const mv = b.debit - b.credit;
    if (a.type === 'revenue') revenue -= mv;
    else if (a.type === 'expense') { if (id === cogsId) cogs += mv; else expenses += mv; }
  }
  revenue = r2(revenue); cogs = r2(cogs); expenses = r2(expenses);
  return { revenue, cogs, gross: r2(revenue - cogs), expenses, net: r2(revenue - cogs - expenses) };
}

export function incomeStatementReport(accounts: Account[], entries: LedgerEntry[], from?: string, to?: string, st?: AccountingSettings, scope?: string): ReportTable {
  const bals = computeBalances(entries, from, to);
  const cogsId = roleOf(st, 'cogs');
  const rows: Cell[][] = [];
  const styles: ReportTable['rowStyles'] = [];
  const add = (r: Cell[], s?: 'section' | 'subtotal' | 'net') => { rows.push(r); styles.push(s); };
  const leaves = flattenTree(accounts).map((x) => x.acc).filter((a) => !a.isGroup);
  const mv = (a: Account) => { const b = bals.get(a.id); return b ? r2(b.debit - b.credit) : 0; };
  const F = incomeFigures(accounts, entries, from, to, st);

  add(['الإيرادات', '', ''], 'section');
  for (const a of leaves.filter((x) => x.type === 'revenue')) { const v = -mv(a); if (Math.abs(v) >= 0.005) add([a.code, a.name, fmtMoney(v)]); }
  add(['', 'صافي الإيرادات', fmtMoney(F.revenue)], 'subtotal');
  add(['تكلفة المبيعات', '', ''], 'section');
  for (const a of leaves.filter((x) => x.id === cogsId)) add([a.code, a.name, fmtMoney(mv(a))]);
  add(['', 'مجمل الربح', fmtMoney(F.gross)], 'subtotal');
  add(['المصروفات', '', ''], 'section');
  for (const a of leaves.filter((x) => x.type === 'expense' && x.id !== cogsId)) { const v = mv(a); if (Math.abs(v) >= 0.005) add([a.code, a.name, fmtMoney(v)]); }
  add(['', 'إجمالي المصروفات', fmtMoney(F.expenses)], 'subtotal');
  add(['', F.net >= 0 ? 'صافي الربح' : 'صافي الخسارة', fmtMoney(Math.abs(F.net))], 'net');
  const pct = (n: number) => (F.revenue > 0 ? `${((n / F.revenue) * 100).toFixed(1)}%` : '—');
  return {
    ...base('قائمة الدخل (الأرباح والخسائر)', periodLabel(from, to) + (scope ? ` — ${scope}` : '')),
    columns: ['الكود', 'البند', 'المبلغ'],
    rows, rowStyles: styles, totals: [], noTotals: true,
    summary: [
      { label: 'صافي الإيرادات', value: fmtMoney(F.revenue) },
      { label: 'مجمل الربح', value: `${fmtMoney(F.gross)} (${pct(F.gross)})` },
      { label: 'المصروفات', value: fmtMoney(F.expenses) },
      { label: F.net >= 0 ? 'صافي الربح' : 'صافي الخسارة', value: `${fmtMoney(F.net)} (${pct(F.net)})` },
    ],
  };
}

export interface BalanceFigures { assets: number; liabilities: number; equity: number; earnings: number; diff: number }
export function balanceSheetReport(accounts: Account[], entries: LedgerEntry[], asOf?: string, scope?: string): ReportTable & { figures: BalanceFigures } {
  const bals = computeBalances(entries, undefined, asOf);
  const roll = rollupNet(accounts, bals);
  const rows: Cell[][] = [];
  const styles: ReportTable['rowStyles'] = [];
  const add = (r: Cell[], s?: 'section' | 'subtotal' | 'net') => { rows.push(r); styles.push(s); };
  const tree = flattenTree(accounts);
  const known = new Set(accounts.map((a) => a.id));
  let orphan = 0;
  for (const [id, b] of bals) if (!known.has(id)) orphan += closingNet(b);

  const section = (type: AccountType, title: string) => {
    add([title, '', ''], 'section');
    let total = 0;
    for (const { acc, depth } of tree) {
      if (acc.type !== type) continue;
      const v = natural(acc, roll.get(acc.id) || 0);
      if (Math.abs(v) < 0.005) continue;
      if (!acc.parentId || !known.has(acc.parentId)) total += v;
      add([acc.code, `${'   '.repeat(depth)}${acc.name}`, acc.isGroup ? `(${fmtMoney(v)})` : fmtMoney(v)]);
    }
    return r2(total);
  };
  const assets = r2(section('asset', 'الأصول') + orphan);
  add(['', 'إجمالي الأصول', fmtMoney(assets)], 'net');
  const liabilities = section('liability', 'الخصوم');
  add(['', 'إجمالي الخصوم', fmtMoney(liabilities)], 'subtotal');
  const equityBase = section('equity', 'حقوق الملكية');
  // صافي ربح كل الفترات حتى التاريخ (لم يُقفل في الأرباح المحتجزة بعد)
  let earnings = 0;
  for (const a of accounts) if (a.type === 'revenue' || a.type === 'expense') earnings -= closingNet(bals.get(a.id));
  earnings = r2(earnings);
  add(['', earnings >= 0 ? 'صافي الربح المتراكم (غير مُقفل)' : 'صافي الخسارة المتراكمة (غير مُقفلة)', fmtMoney(earnings)]);
  const equity = r2(equityBase + earnings);
  add(['', 'إجمالي حقوق الملكية', fmtMoney(equity)], 'subtotal');
  const le = r2(liabilities + equity);
  add(['', 'إجمالي الخصوم وحقوق الملكية', fmtMoney(le)], 'net');
  const diff = r2(assets - le);
  return {
    ...base('الميزانية العمومية (قائمة المركز المالي)', `${asOf ? `كما في ${asOf}` : 'حتى تاريخه'}${scope ? ` — ${scope}` : ''}`),
    columns: ['الكود', 'الحساب', 'الرصيد'],
    rows, rowStyles: styles, totals: [], noTotals: true,
    summary: [
      { label: 'إجمالي الأصول', value: fmtMoney(assets) },
      { label: 'إجمالي الخصوم', value: fmtMoney(liabilities) },
      { label: 'حقوق الملكية', value: fmtMoney(equity) },
      { label: 'التوازن', value: Math.abs(diff) < 0.01 ? 'متوازنة ✓' : `فرق ${fmtMoney(diff)} ✗` },
    ],
    notes: orphan ? ['توجد أرصدة على حسابات محذوفة من الدليل — أضيفت للأصول. أعد إنشاء الحساب أو انقل رصيده بقيد.'] : undefined,
    figures: { assets, liabilities, equity, earnings, diff },
  };
}

export interface StatementFilter { accountId: string; partyId?: string; partyName?: string; partyType?: 'customer' | 'supplier' }
export function accountStatementReport(accounts: Account[], entries: LedgerEntry[], f: StatementFilter, from?: string, to?: string, scope?: string): ReportTable {
  const acc = accounts.find((a) => a.id === f.accountId);
  const ids = new Set<string>([f.accountId]);
  if (acc?.isGroup) { const kids = childrenMap(accounts); const walk = (id: string) => { for (const c of kids.get(id) || []) { ids.add(c.id); walk(c.id); } }; walk(acc.id); }
  const match = (l: JournalLine) => ids.has(l.accountId) && (!f.partyId && !f.partyName ? true : (f.partyId ? l.partyId === f.partyId : (l.partyName || '') === f.partyName));
  const sign = acc && !debitNature(acc.type) ? -1 : 1;
  let open = 0;
  const rows: Cell[][] = [];
  let D = 0, C = 0;
  const inPeriod: { e: LedgerEntry; l: JournalLine }[] = [];
  for (const e of entries) {
    const d = dayOf(e.date);
    if (to && d > to) continue;
    for (const l of e.lines) {
      if (!match(l)) continue;
      if (from && d < from) open += (l.debit || 0) - (l.credit || 0);
      else inPeriod.push({ e, l });
    }
  }
  open = r2(open);
  let run = open;
  rows.push(['', '', 'رصيد أول المدة', '', '', fmtMoney(sign * run)]);
  for (const { e, l } of inPeriod) {
    D += l.debit || 0; C += l.credit || 0;
    run = r2(run + (l.debit || 0) - (l.credit || 0));
    rows.push([e.date.slice(0, 16), e.number || '—', `${KIND_LABELS[e.kind] || ''}: ${l.memo || e.memo}${e.branch ? ` [${e.branch}]` : ''}`, l.debit ? fmtMoney(l.debit) : '', l.credit ? fmtMoney(l.credit) : '', fmtMoney(sign * run)]);
  }
  const who = f.partyName ? ` — ${f.partyName}` : '';
  return {
    ...base(`كشف حساب: ${accTitle(acc)}${who}`, periodLabel(from, to) + (scope ? ` — ${scope}` : '')),
    columns: ['التاريخ', 'رقم المستند', 'البيان', 'مدين', 'دائن', 'الرصيد'],
    rows,
    totals: ['', '', 'الإجمالي', fmtMoney(D), fmtMoney(C), fmtMoney(sign * run)],
    summary: [
      { label: 'رصيد أول المدة', value: fmtMoney(sign * open) },
      { label: 'مدين الفترة', value: fmtMoney(D) },
      { label: 'دائن الفترة', value: fmtMoney(C) },
      { label: 'الرصيد الختامي', value: fmtMoney(sign * run) },
    ],
    notes: acc ? [`طبيعة الحساب: ${debitNature(acc.type) ? 'مدينة' : 'دائنة'} — الرصيد الموجب على طبيعة الحساب.`] : undefined,
  };
}

export function journalReport(accounts: Account[], entries: LedgerEntry[], from?: string, to?: string, scope?: string): ReportTable {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const rows: Cell[][] = [];
  let D = 0, C = 0, n = 0;
  for (const e of entries) {
    if (!inRange(dayOf(e.date), from, to)) continue;
    n++;
    e.lines.forEach((l, i) => {
      D += l.debit || 0; C += l.credit || 0;
      rows.push([i === 0 ? e.date.slice(0, 16) : '', i === 0 ? (e.number || '—') : '', i === 0 ? `${KIND_LABELS[e.kind]}${e.branch ? ` [${e.branch}]` : ''}` : '', accTitle(byId.get(l.accountId)) + (l.partyName ? ` / ${l.partyName}` : ''), l.memo || (i === 0 ? e.memo : ''), l.debit ? fmtMoney(l.debit) : '', l.credit ? fmtMoney(l.credit) : '']);
    });
  }
  return {
    ...base('دفتر اليومية العامة', periodLabel(from, to) + (scope ? ` — ${scope}` : '')),
    columns: ['التاريخ', 'الرقم', 'النوع', 'الحساب', 'البيان', 'مدين', 'دائن'],
    rows,
    totals: ['', '', '', '', 'الإجمالي', fmtMoney(D), fmtMoney(C)],
    summary: [
      { label: 'عدد القيود', value: String(n) },
      { label: 'إجمالي المدين', value: fmtMoney(D) },
      { label: 'إجمالي الدائن', value: fmtMoney(C) },
      { label: 'التوازن', value: Math.abs(r2(D - C)) < 0.01 ? 'متوازن ✓' : 'غير متوازن ✗' },
    ],
  };
}

/** أرصدة العملاء أو الموردين من حسابهم الرقابي (العملاء/الموردون) */
export function partyBalancesReport(accounts: Account[], entries: LedgerEntry[], type: 'customer' | 'supplier', st?: AccountingSettings, to?: string, scope?: string): ReportTable {
  const accId = roleOf(st, type === 'customer' ? 'ar' : 'ap');
  const m = new Map<string, { name: string; id?: string; d: number; c: number }>();
  for (const e of entries) {
    if (to && dayOf(e.date) > to) continue;
    for (const l of e.lines) {
      if (l.accountId !== accId) continue;
      const key = l.partyId || `n:${l.partyName || 'غير محدد'}`;
      const p = m.get(key) || { name: l.partyName || 'غير محدد', id: l.partyId, d: 0, c: 0 };
      p.d += l.debit || 0; p.c += l.credit || 0;
      if (l.partyName) p.name = l.partyName;
      m.set(key, p);
    }
  }
  const sign = type === 'customer' ? 1 : -1;
  const list = Array.from(m.values()).map((p) => ({ ...p, bal: r2(sign * (p.d - p.c)) })).filter((p) => Math.abs(p.bal) >= 0.005 || p.d || p.c).sort((a, b) => b.bal - a.bal);
  const T = list.reduce((t, p) => ({ d: t.d + p.d, c: t.c + p.c, b: t.b + p.bal }), { d: 0, c: 0, b: 0 });
  return {
    ...base(type === 'customer' ? 'أرصدة العملاء (من حساب العملاء)' : 'أرصدة الموردين (من حساب الموردين)', `${to ? `حتى ${to}` : 'حتى تاريخه'}${scope ? ` — ${scope}` : ''}`),
    columns: [type === 'customer' ? 'العميل' : 'المورد', 'مدين', 'دائن', type === 'customer' ? 'الرصيد المستحق لنا' : 'الرصيد المستحق له'],
    rows: list.map((p) => [p.name, fmtMoney(p.d), fmtMoney(p.c), fmtMoney(p.bal)]),
    totals: ['الإجمالي', fmtMoney(T.d), fmtMoney(T.c), fmtMoney(T.b)],
    summary: [
      { label: type === 'customer' ? 'عدد العملاء' : 'عدد الموردين', value: String(list.length) },
      { label: 'إجمالي الرصيد', value: fmtMoney(T.b) },
      { label: 'أرصدة دائنة (عكسية)', value: String(list.filter((p) => p.bal < 0).length) },
      { label: 'أكبر رصيد', value: list[0] ? `${list[0].name}: ${fmtMoney(list[0].bal)}` : '—' },
    ],
  };
}

/** ملخص لوحة المحاسبة */
export function dashboardFigures(accounts: Account[], entries: LedgerEntry[], st: AccountingSettings, from?: string, to?: string) {
  const all = computeBalances(entries, undefined, to);
  const bal = (role: AccountRole) => closingNet(all.get(roleOf(st, role)));
  const inc = incomeFigures(accounts, entries, from, to, st);
  return {
    income: inc,
    cash: bal('cash'), bank: bal('bank'), card: bal('card'),
    ar: bal('ar'), ap: -bal('ap'), inventory: bal('inventory'),
    vatPayable: r2(-bal('vatOut') - bal('vatIn')),
  };
}
