import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import DateField from './DateField';
import { BarChart3, Monitor, Calendar, FileText, UserCircle, Banknote, Printer, FileDown, FileSpreadsheet, FileBox, Loader2, TrendingUp, Package, Layers, Undo2, BadgePercent, Users, Boxes, Snowflake, Truck, Receipt, TrendingDown, Search, X, Wallet, ArrowDownUp, Scale } from 'lucide-react';
import { customerLabel } from '../utils/invoiceMath';
import { deviceNames, deviceTagOf, deviceTitle, NO_DEVICE } from '../utils/device';
import type { Invoice, PurchaseInvoice, PurchaseReturn, Product, ProductGroup, Customer, CashMovement } from '../types';
import { usePagedList, Pagination } from '../utils/usePagedList';
import type { ZClosing } from '../utils/reports';
import { buildReport, CUSTOMER_KINDS, SUPPLIER_KINDS, reportLandscape, reportToCsv, reportToHtml, type ReportKind } from '../utils/reports';
import { saveTextFile, todayStamp } from '../utils/files';
import { exportHtmlAsPdf, printHtmlDocument, type PrintSettings } from '../utils/printing';

interface Props {
  invoices: Invoice[];
  purchases?: PurchaseInvoice[];
  purchaseReturns?: PurchaseReturn[];
  products?: Product[];
  groups?: ProductGroup[];
  customers?: Customer[];
  company: { name: string; nameEn?: string; vat: string; address?: string; shortAddress?: string };
  printSettings: PrintSettings;
  notify: (msg: string) => void;
  /** رسوم التبغ مفعّلة: يظهر تقرير «رسوم التبغ» */
  tobaccoEnabled?: boolean;
  /** حركات الصندوق — لتقرير الدخل والخرج وتقرير حركة الصندوق */
  cashMovements?: CashMovement[];
  /** تقارير الإقفال — لتقرير فروق الجرد */
  zReports?: ZClosing[];
}

const TAB_GROUPS: { label: string; tabs: { id: ReportKind; label: string; icon: ReactNode }[] }[] = [
  { label: 'المبيعات', tabs: [
    { id: 'daily', label: 'اليومي', icon: <Calendar className="w-4 h-4" /> },
    { id: 'monthly', label: 'الشهري', icon: <FileText className="w-4 h-4" /> },
    { id: 'items', label: 'مبيعات الأصناف', icon: <Package className="w-4 h-4" /> },
    { id: 'groups', label: 'مبيعات المجموعات', icon: <Layers className="w-4 h-4" /> },
    { id: 'users', label: 'أداء المستخدمين', icon: <UserCircle className="w-4 h-4" /> },
    { id: 'devices', label: 'حسب الجهاز', icon: <Monitor className="w-4 h-4" /> },
    { id: 'returns', label: 'المرتجعات', icon: <Undo2 className="w-4 h-4" /> },
    { id: 'discounts', label: 'الخصومات', icon: <BadgePercent className="w-4 h-4" /> },
  ] },
  { label: 'الأرباح والمخزون', tabs: [
    { id: 'profit', label: 'الأرباح', icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'inventory', label: 'تقييم المخزون', icon: <Boxes className="w-4 h-4" /> },
    { id: 'slow', label: 'الأصناف الراكدة', icon: <Snowflake className="w-4 h-4" /> },
    { id: 'losses', label: 'الخسائر', icon: <TrendingDown className="w-4 h-4" /> },
  ] },
  { label: 'العملاء والموردين', tabs: [
    { id: 'customers', label: 'العملاء والمديونيات', icon: <Users className="w-4 h-4" /> },
    { id: 'byCustomer', label: 'الفواتير حسب العميل', icon: <Receipt className="w-4 h-4" /> },
    { id: 'purchases', label: 'المشتريات', icon: <FileBox className="w-4 h-4" /> },
    { id: 'suppliers', label: 'حسب المورد', icon: <Truck className="w-4 h-4" /> },
  ] },
  { label: 'الصندوق', tabs: [
    { id: 'cashflow', label: 'الدخل والخرج', icon: <ArrowDownUp className="w-4 h-4" /> },
    { id: 'cashbox', label: 'حركة الصندوق', icon: <Wallet className="w-4 h-4" /> },
    { id: 'cashDiff', label: 'فروق الجرد', icon: <Scale className="w-4 h-4" /> },
  ] },
  { label: 'الضريبة', tabs: [
    { id: 'tax', label: 'الإقرار الضريبي', icon: <Banknote className="w-4 h-4" /> },
    { id: 'tobacco', label: 'رسوم التبغ', icon: <Banknote className="w-4 h-4" /> },
  ] },
];

/** أرقام وتواريخ ونسب بخط الأرقام — النصوص بالخط العادي */
const isNum = (c: unknown) => typeof c === 'number' || /^[-+\d.,%:\s/]+$/.test(String(c ?? '').trim());
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const monthStart = () => { const n = new Date(); return ymd(new Date(n.getFullYear(), n.getMonth(), 1)); };
const monthEnd = () => { const n = new Date(); return ymd(new Date(n.getFullYear(), n.getMonth() + 1, 0)); };
const prevMonthStart = () => { const n = new Date(); return ymd(new Date(n.getFullYear(), n.getMonth() - 1, 1)); };
const prevMonthEnd = () => { const n = new Date(); return ymd(new Date(n.getFullYear(), n.getMonth(), 0)); };

export default function ReportsView({ invoices, purchases = [], purchaseReturns = [], products = [], groups = [], customers = [], company, printSettings, notify, tobaccoEnabled, cashMovements = [], zReports = [] }: Props) {
  const showTobacco = useMemo(() => !!tobaccoEnabled || invoices.some((i) => (i.items || []).some((it) => it.isTobaccoFee)), [tobaccoEnabled, invoices]);
  const [tab, setTab] = useState<ReportKind>('daily');
  // الافتراضي: اليوم — الفترات الأطول من الأزرار (هذا الشهر / هذا الربع / الكل) أو التواريخ
  const [from, setFrom] = useState(() => ymd(new Date()));
  const [to, setTo] = useState(() => ymd(new Date()));
  const [busy, setBusy] = useState(false);

  // الحساب مؤجَّل: الواجهة تبقى سريعة الاستجابة أثناء تغيير التواريخ مع آلاف الفواتير
  const dTab = useDeferredValue(tab), dFrom = useDeferredValue(from), dTo = useDeferredValue(to);
  const dInvoices = useDeferredValue(invoices), dPurchases = useDeferredValue(purchases);
  const q = { from: dFrom, to: dTo };
  const computing = dTab !== tab || dFrom !== from || dTo !== to;
  // فلتر المستخدم (الكاشير): كل التقارير ما عدا المشتريات تُحصر على مبيعاته
  const [user, setUser] = useState('');
  const users = useMemo(() => Array.from(new Set(invoices.map((i) => i.cashierName || 'غير محدد'))).sort(), [invoices]);
  // فلتر الجهاز (ربط الأجهزة): يظهر فقط إن وُجدت فواتير من أكثر من جهاز
  const [device, setDevice] = useState('');
  const devices = useMemo(() => {
    const names = deviceNames(invoices);
    const tags = Array.from(new Set(invoices.map((i) => deviceTagOf(i) || NO_DEVICE))).sort((a, b) => (a === NO_DEVICE ? 1 : b === NO_DEVICE ? -1 : a.localeCompare(b)));
    return tags.map((t) => ({ tag: t, label: deviceTitle(t, names.get(t)) }));
  }, [invoices]);
  const multiDevice = devices.some((d) => d.tag !== NO_DEVICE);
  const productCost = useMemo(() => new Map(products.filter((p) => p.cost > 0).map((p) => [p.id, p.cost])), [products]);
  // فلتر العميل (تقارير المبيعات والعملاء) / المورد (تقارير المشتريات)
  const [customer, setCustomer] = useState('');
  const [supplier, setSupplier] = useState('');
  const customerNames = useMemo(() => {
    const gen = customerLabel('');
    const set = new Set<string>(customers.map((c) => customerLabel(c.name)));
    for (const i of invoices) set.add(customerLabel(i.customerName));
    set.delete(gen);
    return [gen, ...[...set].sort((a, b) => a.localeCompare(b, 'ar'))];
  }, [customers, invoices]);
  const supplierNames = useMemo(() => {
    const set = new Set<string>();
    for (const p of purchases) set.add(p.supplierName || '—');
    for (const x of purchaseReturns) set.add(x.supplierName || '—');
    return [...set].sort((a, b) => a.localeCompare(b, 'ar'));
  }, [purchases, purchaseReturns]);
  const showCustomer = CUSTOMER_KINDS.includes(tab), showSupplier = SUPPLIER_KINDS.includes(tab);
  const dCash = useDeferredValue(cashMovements);
  const dZ = useDeferredValue(zReports);
  const report = useMemo(() => buildReport(dTab, dInvoices, dFrom, dTo, dPurchases, { productCost, user, device, purchaseReturns, products, groups, customers, customer, supplier, cashMovements: dCash, zReports: dZ }), [dTab, dInvoices, dFrom, dTo, dPurchases, productCost, user, device, purchaseReturns, products, groups, customers, customer, supplier, dCash, dZ]);
  // الشاشة تعرض صفحات (50 سطراً) — الطباعة وPDF وExcel تشمل كل الأسطر
  // بحث داخل جدول التقرير (اسم الصنف/العميل/أي خانة، أو باركود الصنف) — للعرض فقط، الطباعة والتصدير للتقرير كاملاً
  const [rowQuery, setRowQuery] = useState('');
  const shown = useMemo(() => {
    const raw = rowQuery.trim();
    const qq = raw.toLowerCase();
    if (!qq) return { rows: report.rows, styles: report.rowStyles };
    const byCode = products.find((p) => p.barcode === raw || (p.barcodes || []).includes(raw) || (p.units || []).some((u) => u.barcode === raw));
    const needles = [qq, ...(byCode ? [byCode.nameAr.toLowerCase()] : [])];
    const idx = report.rows.map((_, i) => i).filter((i) => report.rowStyles?.[i] !== 'section'
      && needles.some((n) => report.rows[i].some((c) => String(c ?? '').toLowerCase().includes(n))));
    return { rows: idx.map((i) => report.rows[i]), styles: report.rowStyles ? idx.map((i) => report.rowStyles![i]) : undefined };
  }, [rowQuery, report, products]);
  const pager = usePagedList(shown.rows, 50, `${report.kind}|${q.from}|${q.to}|${user}|${device}|${customer}|${supplier}|${rowQuery}`);
  const pageOffset = (pager.page - 1) * pager.pageSize;

  const setToday = () => { const t = ymd(new Date()); setFrom(t); setTo(t); };
  const setThisMonth = () => { setFrom(monthStart()); setTo(monthEnd()); };
  /** ربع سنة الإقرار الضريبي الحالي */
  const setThisQuarter = () => {
    const n = new Date(); const qs = Math.floor(n.getMonth() / 3) * 3;
    setFrom(ymd(new Date(n.getFullYear(), qs, 1))); setTo(ymd(new Date(n.getFullYear(), qs + 3, 0)));
  };
  /** الربع السابق (للإقرار الضريبي بعد انتهاء الربع) — يتعامل مع بداية السنة تلقائياً */
  const prevQuarter = () => {
    const n = new Date(); const qs = Math.floor(n.getMonth() / 3) * 3 - 3;
    const start = new Date(n.getFullYear(), qs, 1), end = new Date(n.getFullYear(), qs + 3, 0);
    return { from: ymd(start), to: ymd(end), label: `الربع ${Math.floor(start.getMonth() / 3) + 1} — ${start.getFullYear()}` };
  };
  const setPrevQuarter = () => { const p = prevQuarter(); setFrom(p.from); setTo(p.to); };
  const setAll = () => { setFrom(''); setTo(''); };
  const curQuarter = () => { const n = new Date(); const qs = Math.floor(n.getMonth() / 3) * 3; return { from: ymd(new Date(n.getFullYear(), qs, 1)), to: ymd(new Date(n.getFullYear(), qs + 3, 0)) }; };
  const today = ymd(new Date());
  // أزرار الفترات بألوان مميزة للاستدلال السريع — المحدد منها ممتلئ
  const PERIODS: { id: string; label: string; on: () => void; active: boolean; tone: string; title?: string }[] = [
    { id: 'today', label: 'اليوم', on: setToday, active: from === today && to === today, tone: 'emerald' },
    { id: 'month', label: 'هذا الشهر', on: setThisMonth, active: from === monthStart() && to === monthEnd(), tone: 'sky' },
    { id: 'prev-month', label: 'الشهر السابق', on: () => { setFrom(prevMonthStart()); setTo(prevMonthEnd()); }, active: from === prevMonthStart() && to === prevMonthEnd(), tone: 'sky' },
    { id: 'quarter', label: 'هذا الربع', on: setThisQuarter, active: from === curQuarter().from && to === curQuarter().to, tone: 'violet' },
    { id: 'prev-quarter', label: 'الربع السابق', on: setPrevQuarter, active: from === prevQuarter().from && to === prevQuarter().to, tone: 'amber', title: prevQuarter().label },
    { id: 'all', label: 'الكل', on: setAll, active: !from && !to, tone: 'slate' },
  ];
  const TONES: Record<string, { idle: string; on: string; dot: string }> = {
    emerald: { idle: 'border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800', on: 'bg-emerald-600 border-emerald-600 text-white', dot: 'bg-emerald-500' },
    sky: { idle: 'border-sky-300 text-sky-700 bg-sky-50 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-800', on: 'bg-sky-600 border-sky-600 text-white', dot: 'bg-sky-500' },
    violet: { idle: 'border-violet-300 text-violet-700 bg-violet-50 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-800', on: 'bg-violet-600 border-violet-600 text-white', dot: 'bg-violet-500' },
    amber: { idle: 'border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800', on: 'bg-amber-500 border-amber-500 text-white', dot: 'bg-amber-500' },
    slate: { idle: 'border-slate-300 text-slate-600 bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-600', on: 'bg-slate-700 border-slate-700 text-white', dot: 'bg-slate-400' },
  };

  const fileBase = `${report.kind}-report-${todayStamp()}`;
  const landscape = reportLandscape(report);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { console.error(e); notify('تعذر تنفيذ العملية'); } finally { setBusy(false); }
  };

  const onPrint = () => run(async () => {
    const html = reportToHtml(report, company);
    const res = await printHtmlDocument(html, {
      silent: printSettings.silent && !!printSettings.a4Printer,
      deviceName: printSettings.a4Printer || undefined,
      pageSize: 'A4',
      landscape,
    });
    notify(res.ok ? 'تم إرسال التقرير للطباعة' : 'لم تتم الطباعة');
  });

  const onPdf = () => run(async () => {
    const ok = await exportHtmlAsPdf(reportToHtml(report, company), `${fileBase}.pdf`, landscape);
    if (ok) notify('تم تصدير التقرير');
  });

  const onCsv = () => run(async () => {
    const ok = await saveTextFile(`${fileBase}.csv`, reportToCsv(report, company.name), 'csv');
    if (ok) notify('تم تصدير الملف (يفتح في Excel)');
  });

  const input = 'border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 rounded-xl px-3 py-2 font-mono text-sm outline-none';

  return (
    <div className="p-4 2xl:p-6 min-h-full flex flex-col animate-in fade-in zoom-in-95 max-w-7xl mx-auto dark:text-white">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-xl"><BarChart3 className="w-8 h-8" /></div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 dark:text-white">التقارير</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-semibold mt-1 flex items-center gap-2">{report.period} — {report.rows.length} سطر {computing && <Loader2 className="w-4 h-4 animate-spin text-cyan-500" />}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {showCustomer && (
            <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${customer ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`} data-testid="report-customer">
              <Users className="w-4 h-4" /> العميل:
              <select value={customer} onChange={(e) => setCustomer(e.target.value)} className="bg-transparent font-black outline-none cursor-pointer max-w-[11rem]">
                <option value="" className="text-slate-900">الكل</option>
                {customerNames.map((c) => <option key={c} value={c} className="text-slate-900">{c}</option>)}
              </select>
            </label>
          )}
          {showSupplier && (
            <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${supplier ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`} data-testid="report-supplier">
              <Truck className="w-4 h-4" /> المورد:
              <select value={supplier} onChange={(e) => setSupplier(e.target.value)} className="bg-transparent font-black outline-none cursor-pointer max-w-[11rem]">
                <option value="" className="text-slate-900">الكل</option>
                {supplierNames.map((c) => <option key={c} value={c} className="text-slate-900">{c}</option>)}
              </select>
            </label>
          )}
          <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${user ? 'bg-cyan-600 text-white border-cyan-600' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`} data-testid="report-user">
            <UserCircle className="w-4 h-4" /> المستخدم:
            <select value={user} onChange={(e) => setUser(e.target.value)} className="bg-transparent font-black outline-none cursor-pointer">
              <option value="" className="text-slate-900">الكل</option>
              {users.map((u) => <option key={u} value={u} className="text-slate-900">{u}</option>)}
            </select>
          </label>
          {multiDevice && (
            <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${device ? 'bg-violet-600 text-white border-violet-600' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`} data-testid="report-device">
              <Monitor className="w-4 h-4" /> الجهاز:
              <select value={device} onChange={(e) => setDevice(e.target.value)} className="bg-transparent font-black outline-none cursor-pointer max-w-[10rem]">
                <option value="" className="text-slate-900">الكل</option>
                {devices.map((d) => <option key={d.tag} value={d.tag} className="text-slate-900">{d.label}</option>)}
              </select>
            </label>
          )}
          <DateField value={from} onChange={(v) => setFrom(v)} className={input} />
          <span className="text-slate-400">-</span>
          <DateField value={to} onChange={(v) => setTo(v)} className={input} />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5" data-testid="report-periods">
          {PERIODS.map((p) => {
            const t = TONES[p.tone];
            return (
              <button key={p.id} type="button" onClick={p.on} title={p.title} data-testid={`period-${p.id}`}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black border-2 transition cursor-pointer ${p.active ? `${t.on} shadow-sm` : `${t.idle} hover:brightness-95`}`}>
                <span className={`w-2 h-2 rounded-full ${p.active ? 'bg-white' : t.dot}`} /> {p.label}
              </button>
            );
          })}
        </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-3 mb-4 bg-white dark:bg-slate-800 p-3 rounded-2xl border border-slate-100 dark:border-slate-700" data-testid="report-tabs">
        {TAB_GROUPS.map((g) => (
          <div key={g.label} className="flex flex-col gap-1.5">
            <span className="text-[11px] font-black text-slate-400 pr-1">{g.label}</span>
            <div className="flex flex-wrap gap-1.5">
              {g.tabs.filter((t) => (t.id !== 'devices' || multiDevice) && (t.id !== 'tobacco' || showTobacco)).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  data-testid={`report-tab-${t.id}`}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold transition border-2 ${
                    tab === t.id
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                      : 'border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex-1 min-h-0 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 p-5 flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700 pb-4 mb-4">
          <h3 className="text-xl font-black text-slate-800 dark:text-white">{report.title}</h3>
          <div className="flex gap-2">
            <button disabled={busy} onClick={onPrint} className="px-4 py-2 rounded-xl bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-50"><Printer className="w-4 h-4" /> طباعة</button>
            <button disabled={busy} onClick={onPdf} className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-50"><FileDown className="w-4 h-4" /> PDF</button>
            <button disabled={busy} onClick={onCsv} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-50"><FileSpreadsheet className="w-4 h-4" /> Excel / CSV</button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {report.summary.map((s) => (
            <div key={s.label} className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
              <p className="text-slate-500 dark:text-slate-400 font-bold text-xs mb-1">{s.label}</p>
              <p className={`text-2xl font-black text-slate-800 dark:text-white ${isNum(s.value) ? 'font-mono' : 'text-xl truncate'}`} dir={isNum(s.value) ? 'ltr' : 'rtl'} title={s.value}>{s.value}</p>
            </div>
          ))}
        </div>

        {report.rows.length > 0 && (
          <div className="mb-2 flex items-center gap-2" data-testid="report-search">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input value={rowQuery} onChange={(e) => setRowQuery(e.target.value)} placeholder="ابحث في التقرير: اسم الصنف أو الباركود..."
                className="w-full pr-9 pl-9 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-bold outline-none focus:border-indigo-500" data-testid="report-search-input" />
              {rowQuery && <button type="button" onClick={() => setRowQuery('')} className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-rose-500" title="مسح البحث"><X className="w-4 h-4" /></button>}
            </div>
            {rowQuery.trim() && <span className="text-xs font-bold text-slate-500" data-testid="report-search-count">{shown.rows.length} من {report.rows.length} سطر</span>}
          </div>
        )}
        <div className="flex-1 min-h-[20rem] overflow-auto rounded-xl border border-slate-100 dark:border-slate-700">
          {report.rows.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-400 font-bold p-10">لا توجد بيانات في هذه الفترة.</div>
          ) : (
            <table className="w-full text-sm text-center">
              <thead className="bg-slate-100 dark:bg-slate-900 sticky top-0">
                <tr>{report.columns.map((c) => <th key={c} className="px-3 py-2.5 font-black text-slate-600 dark:text-slate-300 whitespace-nowrap">{c}</th>)}</tr>
              </thead>
              <tbody>
                {shown.rows.length === 0 && <tr><td colSpan={report.columns.length} className="px-3 py-8 text-slate-400 font-bold" data-testid="report-search-empty">لا توجد أسطر تطابق «{rowQuery.trim()}»</td></tr>}
                {pager.visible.map((row, k) => {
                  const st = shown.styles?.[pageOffset + k];
                  if (st === 'section') return (
                    <tr key={k} className="bg-teal-50 dark:bg-teal-900/20 border-t-2 border-teal-700"><td colSpan={report.columns.length} className="px-3 py-2.5 text-right font-black text-teal-900 dark:text-teal-200">{String(row[0])}</td></tr>
                  );
                  return (
                    <tr key={k}
                      onClick={report.kind === 'users' ? () => { setUser(String(row[0])); setTab('daily'); } : undefined}
                      title={report.kind === 'users' ? 'اضغط لعرض تقارير هذا المستخدم' : undefined}
                      className={`border-t border-slate-100 dark:border-slate-700 ${report.kind === 'users' ? 'cursor-pointer hover:bg-cyan-50 dark:hover:bg-cyan-950/30' : ''} ${st === 'net' ? 'bg-teal-900 text-white font-black text-base' : st === 'subtotal' ? 'font-black border-t-2 border-teal-700/50' : 'hover:bg-slate-50 dark:hover:bg-slate-900/40'}`}>
                      {row.map((c, j) => <td key={j} className={`px-3 py-2 ${j === 0 && ['tax', 'profit', 'users', 'items', 'groups', 'customers', 'inventory', 'slow', 'suppliers'].includes(report.kind) ? 'text-right font-bold' : isNum(c) ? 'font-mono' : 'font-semibold'}`}>{String(c ?? '')}{j === 0 && report.kind === 'users' ? <span className="mr-2 text-[10px] text-cyan-700 dark:text-cyan-300 font-black">← تقاريره</span> : null}</td>)}
                    </tr>
                  );
                })}
                {/* إجمالي التقرير كله — يُخفى أثناء البحث حتى لا يُظن أنه إجمالي النتائج */}
                {!report.noTotals && !rowQuery.trim() && pager.page === pager.pages && (
                  <tr className="border-t-2 border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 font-black">
                    {report.totals.map((c, j) => <td key={j} className={`px-3 py-2.5 ${isNum(c) ? 'font-mono' : ''}`}>{String(c ?? '')}</td>)}
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        {shown.rows.length > pager.pageSize && <Pagination pager={pager} unit="سطر" />}
        {report.notes?.length ? (
          <ul className="mt-3 space-y-1 text-xs font-semibold text-slate-500 dark:text-slate-400 list-disc pr-5">
            {report.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
