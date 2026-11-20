import React, { useEffect, useMemo, useState } from 'react';
import DateField from './DateField';
import { InvoicePaymentModal } from './PaymentModals';
import SalesReturnModal, { type SalesReturnRequest } from './SalesReturnModal';
import { isReturnDoc, isUnsettled } from '../utils/invoiceMath';
import { hasReturnableQty, returnedQtyByLine } from '../utils/returns';
import { hqBranches, hqBranchData, type BranchBundle } from '../storage/persistence';
import { useVirtualRows, VSpacer } from '../utils/useVirtualRows';
import { Receipt, Search, Eye, Printer, Coins, ArrowRightLeft, Zap, Wallet, RotateCcw, FileCode, FileDown, Plus, Building2, GitBranch, Loader2 } from 'lucide-react';
import { Invoice, MultiCurrencySettings, CurrencyConfig, PayMethod } from '../types';
import { defaultCurrencies } from '../data';
import { deviceNames, deviceTagOf, deviceTitle, NO_DEVICE } from '../utils/device';
import SaudiRiyalSymbol from './SaudiRiyalSymbol';
import { customerLabel, paymentLabel, invoiceRemaining } from '../utils/invoiceMath';
import ZatcaDocDetail from './ZatcaDocDetail';
import ScannedInvoicePanel from './ScannedInvoicePanel';
import { findInvoiceByCode, serialHit, useBarcodeScanner, type ScanRequest } from '../utils/docScan';

const ZATCA_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: 'فاتورة: بانتظار الإرسال', cls: 'text-amber-600 dark:text-amber-400' },
  reported: { label: 'فاتورة: مُبلّغة ✓', cls: 'text-emerald-600 dark:text-emerald-400' },
  cleared: { label: 'فاتورة: معتمدة ✓', cls: 'text-emerald-600 dark:text-emerald-400' },
  warning: { label: 'فاتورة: مقبولة مع تحذيرات', cls: 'text-amber-600 dark:text-amber-400' },
  rejected: { label: 'فاتورة: مرفوضة', cls: 'text-rose-600 dark:text-rose-400' },
  error: { label: 'فاتورة: خطأ', cls: 'text-rose-600 dark:text-rose-400' },
};

interface InvoicesListProps {
  invoices: Invoice[];
  onViewInvoice: (invoice: Invoice) => void;
  onPrintInvoice?: (invoice: Invoice, currencyCode?: string) => void;
  /** حفظ الفاتورة كملف PDF */
  onPdfInvoice?: (invoice: Invoice, currencyCode?: string) => void;
  multiCurrencySettings?: MultiCurrencySettings;
  /** سداد فاتورة آجلة/جزئية */
  onPayInvoice?: (invoiceId: string, amount: number, method: PayMethod) => void;
  /** إنشاء فاتورة جديدة (يفتح شاشة البيع) */
  onNewInvoice?: () => void;
  /** شاشة «الفواتير الآجلة»: غير المسددة فقط، بلا مُصفّي حالة */
  creditOnly?: boolean;
  /** إنشاء مرتجع مبيعات من فاتورة */
  onCreateReturn?: (invoiceId: string, req: SalesReturnRequest) => void;
  /** باركود مستند مُسح من شاشة أخرى (شاشة البيع) — يفتح نافذة إجراءاته */
  scan?: ScanRequest | null;
  notify?: (msg: string) => void;
}

export default function InvoicesList({ 
  invoices: hqInvoices, 
  onNewInvoice: onNewInvoiceProp,
  creditOnly,
  onViewInvoice, 
  onPrintInvoice, 
  multiCurrencySettings,
  onPayInvoice: onPayInvoiceProp,
  onCreateReturn: onCreateReturnProp,
  onPdfInvoice,
  scan,
  notify,
}: InvoicesListProps) {
  // ---- نطاق العرض: المركز وحده أو فرع ----
  // فواتير الفرع تُعرض للاطلاع والطباعة فقط: السداد والمرتجع يتمّان في الفرع نفسه،
  // لأن تعديلها هنا لن يصل إليه ولأن المزامنة تمشي من الفرع إلى المركز لا العكس.
  const [branches, setBranches] = useState<{ id: string; code: string; name: string }[]>([]);
  const [scope, setScope] = useState<string>('hq');
  const [bundles, setBundles] = useState<Record<string, BranchBundle>>({});
  const [scopeBusy, setScopeBusy] = useState(false);
  useEffect(() => { let on = true; void hqBranches().then((b) => { if (on) setBranches(b); }); return () => { on = false; }; }, []);
  useEffect(() => {
    if (scope === 'hq' || bundles[scope]) return;
    let on = true;
    setScopeBusy(true);
    void hqBranchData(scope)
      .then((d) => { if (on) setBundles((p) => ({ ...p, [scope]: d })); })
      .finally(() => { if (on) setScopeBusy(false); });
    return () => { on = false; };
  }, [scope, bundles]);
  const readOnlyScope = branches.length > 0 && scope !== 'hq';
  const invoices = useMemo(
    () => (readOnlyScope ? ((bundles[scope]?.invoices || []) as Invoice[]) : hqInvoices),
    [readOnlyScope, bundles, scope, hqInvoices],
  );
  const onNewInvoice = readOnlyScope ? undefined : onNewInvoiceProp;
  const onPayInvoice = readOnlyScope ? undefined : onPayInvoiceProp;
  const onCreateReturn = readOnlyScope ? undefined : onCreateReturnProp;
  const zatcaApi = typeof window !== "undefined" ? window.ledger?.zatca : undefined;
  const [zatcaDetailId, setZatcaDetailId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'returns'>(creditOnly ? 'unpaid' : 'all');
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
  const [returningInvoice, setReturningInvoice] = useState<Invoice | null>(null);
  // الكميات المرتجعة لكل فاتورة (لإخفاء زر المرتجع عند اكتمال الإرجاع)
  const returnedMap = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const r of invoices) if (isReturnDoc(r) && r.originalInvoiceId && !m.has(r.originalInvoiceId)) m.set(r.originalInvoiceId, returnedQtyByLine(invoices, r.originalInvoiceId));
    return m;
  }, [invoices]);
  const [searchQuery, setSearchQuery] = useState('');
  // مسح باركود الفاتورة/المرتجع (من الورقة المطبوعة): يفتح نافذة إجراءاتها مهما كان فلتر التاريخ
  const [scanned, setScanned] = useState<Invoice | null>(null);
  const openScan = (code: string): boolean => {
    const inv = findInvoiceByCode(invoices, code);
    if (inv) { setScanned(inv); return true; }
    return false;
  };
  useEffect(() => {
    if (!scan) return;
    if (!openScan(scan.code)) notify?.(`لا توجد فاتورة بالرقم ${scan.code}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan?.ts]);
  useBarcodeScanner((code) => {
    if (payingInvoice || returningInvoice) return;
    if (!openScan(code)) notify?.(`لا توجد فاتورة بالرقم ${code}`);
  });
  const [selectedMethod, setSelectedMethod] = useState('الكل');
  // الافتراضي: مبيعات اليوم فقط
  const [dateMode, setDateMode] = useState<'today' | 'yesterday' | 'week' | 'all' | 'custom' | 'month' | 'range'>(creditOnly ? 'all' : 'today');
  const [rangeFrom, setRangeFrom] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; });
  const [rangeTo, setRangeTo] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const [customDate, setCustomDate] = useState('');

  // تعدد العملات مغلق (أو لم يفعّله المستخدم): العملة الأساسية فقط
  const multiOn = !!(multiCurrencySettings?.enabled && multiCurrencySettings?.configured);
  const allCurrencies: CurrencyConfig[] = multiCurrencySettings?.currencies && multiCurrencySettings.currencies.length > 0 ? multiCurrencySettings.currencies : defaultCurrencies;
  const baseCodeForList = multiCurrencySettings?.baseCurrency || 'SAR';
  const availableCurrencies: CurrencyConfig[] = (() => {
    const l = allCurrencies.filter(c => c.code === baseCodeForList || (multiOn && c.isEnabled));
    return l.length ? l : [{ code: baseCodeForList, nameAr: baseCodeForList, symbol: baseCodeForList === 'SAR' ? '﷼' : baseCodeForList, exchangeRate: 1, isBase: true, isEnabled: true }];
  })();

  const baseCurrencyCode = multiCurrencySettings?.baseCurrency || 'SAR';
  const [displayCurrencyCode, setDisplayCurrencyCode] = useState<string>(baseCurrencyCode);

  const baseCurrObj = availableCurrencies.find(c => c.code === baseCurrencyCode) || availableCurrencies[0];
  const activeCurrObj = availableCurrencies.find(c => c.code === displayCurrencyCode) || baseCurrObj;

  const renderCurr = (code?: string, symbol?: string, className = "w-3 h-3 inline-block mx-0.5 align-middle") => {
    if (code === 'SAR' || symbol === 'ر.س' || symbol === '⃁' || symbol === '﷼') {
      return <SaudiRiyalSymbol raw className={className} />;
    }
    return <span>{symbol || code}</span>;
  };
  const isNonBase = activeCurrObj.code !== baseCurrObj.code;
  const exchangeRate = activeCurrObj.exchangeRate || 1.0;

  const convertAmount = (amountInBase: number) => {
    if (!isNonBase || exchangeRate <= 0) return amountInBase;
    return amountInBase / exchangeRate;
  };

  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayStr = ymd(new Date());
  const yesterdayStr = ymd(new Date(Date.now() - 86400000));
  const weekStartStr = ymd(new Date(Date.now() - 6 * 86400000));

  const matchesDate = (inv: Invoice) => {
    const day = (inv.date || '').slice(0, 10);
    switch (dateMode) {
      case 'today': return day === todayStr;
      case 'yesterday': return day === yesterdayStr;
      case 'week': return day >= weekStartStr && day <= todayStr;
      case 'custom': return !customDate || day === customDate;
      case 'month': return day.slice(0, 7) === todayStr.slice(0, 7);
      case 'range': return (!rangeFrom || day >= rangeFrom) && (!rangeTo || day <= rangeTo);
      default: return true;
    }
  };

  // ربط الأجهزة: فلتر بالجهاز الذي أصدر الفاتورة (يظهر فقط مع أكثر من جهاز)
  const [deviceFilter, setDeviceFilter] = useState('');
  const deviceOptions = useMemo(() => {
    const names = deviceNames(invoices);
    const tags = Array.from(new Set(invoices.map((i) => deviceTagOf(i) || NO_DEVICE))).sort((a, b) => (a === NO_DEVICE ? 1 : b === NO_DEVICE ? -1 : a.localeCompare(b)));
    return tags.map((t) => ({ tag: t, label: deviceTitle(t, names.get(t)) }));
  }, [invoices]);
  const multiDevice = deviceOptions.some((d) => d.tag !== NO_DEVICE);

  const filteredInvoices = invoices.filter(inv => {
    if (deviceFilter && (deviceTagOf(inv) || NO_DEVICE) !== deviceFilter) return false;
    if (statusFilter === 'unpaid' && !isUnsettled(inv)) return false;
    if (statusFilter === 'returns' && !isReturnDoc(inv)) return false;
    // الآجل غير المسدد يُعرض من كل الفترات (فواتير قديمة لم تُسدَّد بعد)
    // البحث بالرقم التسلسلي يشمل كل الفترات (قطعة بيعت قبل أشهر)
    const snMatch = searchQuery.trim().length >= 3 && !!serialHit(inv, searchQuery, true);
    if (statusFilter !== 'unpaid' && !snMatch && !matchesDate(inv)) return false;
    const invNum = inv.invoiceNumber || inv.number || '';
    const matchesSearch = invNum.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (inv.customerName && inv.customerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
                          (!!inv.vehicle?.plate && inv.vehicle.plate.replace(/\s+/g, '').toLowerCase().includes(searchQuery.replace(/\s+/g, '').toLowerCase())) ||
                          snMatch;
    const matchesMethod = selectedMethod === 'الكل' || inv.paymentMethod === selectedMethod;
    return matchesSearch && matchesMethod;
  });
  // الجدول داخل إطار ثابت الارتفاع بشريط تمرير خاص، ويُرسم منه فقط ما يظهر (تمرير افتراضي):
  // ١٠٠٠ فاتورة باليوم أو أكثر لا تمدّ الصفحة للأسفل ولا تبطّئ البرنامج، والإجماليات على كل المطابق
  const invoicesTable = useVirtualRows(filteredInvoices, (i) => i.id, { resetKey: `${searchQuery}|${selectedMethod}|${dateMode}|${customDate}|${rangeFrom}|${rangeTo}|${statusFilter}|${deviceFilter}` });

  return (
    <div className="p-4 2xl:p-6 bg-slate-50 dark:bg-slate-950 text-right text-slate-800 dark:text-slate-100 h-full flex flex-col gap-5" dir="rtl">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            {creditOnly
              ? <><Wallet className="w-6 h-6 text-rose-600 dark:text-rose-400" /><span>الفواتير الآجلة</span></>
              : <><Receipt className="w-6 h-6 text-cyan-600 dark:text-cyan-400" /><span>سجل الفواتير والمبيعات</span></>}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{readOnlyScope
            ? `فواتير ${branches.find((b) => b.id === scope)?.name || 'الفرع'} كما وصلت بآخر مزامنة — للاطلاع والطباعة فقط، والسداد والمرتجع يتمّان في الفرع نفسه.`
            : creditOnly
              ? 'الفواتير غير المسددة أو المسددة جزئياً من كل الفترات — اضغط «سداد» لتحصيل المبلغ.'
              : 'مراجعة والبحث في الفواتير الضريبية المبسطة الصادرة من الكاشير.'}</p>
          {/* محدّد النطاق — يظهر في المركز فقط */}
          {branches.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-3" data-testid="invoices-scope">
              <button type="button" onClick={() => setScope('hq')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold border ${scope === 'hq' ? 'bg-cyan-600 text-white border-cyan-600' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                <Building2 className="w-3.5 h-3.5" />المركز
              </button>
              {branches.map((b) => (
                <button key={b.id} type="button" onClick={() => setScope(b.id)} title={`فرع ${b.name} (${b.code})`}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold border ${scope === b.id ? 'bg-cyan-600 text-white border-cyan-600' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                  <GitBranch className="w-3.5 h-3.5" />{b.name}
                </button>
              ))}
              {scopeBusy && <Loader2 className="w-4 h-4 animate-spin text-cyan-500" />}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onNewInvoice && (
            <button type="button" onClick={onNewInvoice} data-testid="new-invoice"
              className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-black flex items-center gap-2 shadow-md">
              <Plus className="w-5 h-5" /> فاتورة جديدة
            </button>
          )}
        {creditOnly && (() => {
          const due = filteredInvoices.reduce((t, i) => t + invoiceRemaining(i), 0);
          const names = new Set(filteredInvoices.map((i) => customerLabel(i.customerName)));
          return (
            <div className="bg-rose-500/10 border border-rose-500/30 px-4 py-2 rounded-xl text-rose-700 dark:text-rose-300 text-sm font-black flex items-center gap-2" data-testid="credit-summary">
              <Wallet className="w-4 h-4" />
              <span>المتبقي على العملاء <span className="font-mono">{convertAmount(due).toFixed(2)}</span> من {filteredInvoices.length} فاتورة لـ{names.size} عميل</span>
            </div>
          );
        })()}
        {/* Currency badge if non-base */}
        {isNonBase && (
          <div className="bg-amber-500/10 border border-amber-500/30 px-3.5 py-1.5 rounded-xl text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4" />
            <span className="flex items-center gap-1">عرض المبالغ بسعر صرف: 1 {activeCurrObj.code} = {exchangeRate} {renderCurr(baseCurrObj.code, baseCurrObj.symbol)}</span>
          </div>
        )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[16rem]" data-testid="invoice-search">
          <input 
            type="text" 
            placeholder="البحث برقم الفاتورة أو اسم العميل أو رقم اللوحة أو الرقم التسلسلي..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              // قارئ الباركود يكتب الرقم ثم Enter: تطابق تام → نافذة إجراءات الفاتورة
              if (e.key === 'Enter' && openScan(searchQuery)) { e.preventDefault(); setSearchQuery(''); }
            }}
            className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pr-12 pl-4 py-3.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
          />
          <Search className="w-5 h-5 text-slate-500 absolute right-4 top-3.5" />
        </div>
        
        {/* Date filter (default: today) */}
        <div className="flex items-center gap-2">
          <select
            value={dateMode}
            onChange={(e) => setDateMode(e.target.value as typeof dateMode)}
            className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            <option value="today">اليوم</option>
            <option value="yesterday">أمس</option>
            <option value="week">آخر 7 أيام</option>
            <option value="month">هذا الشهر</option>
            <option value="custom">تاريخ محدد</option>
            <option value="range">فترة (من – إلى)</option>
            <option value="all">كل الفترات</option>
          </select>
          {dateMode === 'range' && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500" data-testid="invoice-range">
              <span>من</span>
              <DateField value={rangeFrom} onChange={(v) => setRangeFrom(v)} className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-600 dark:text-slate-300 font-mono focus:outline-none focus:border-cyan-500" />
              <span>إلى</span>
              <DateField value={rangeTo} onChange={(v) => setRangeTo(v)} className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-600 dark:text-slate-300 font-mono focus:outline-none focus:border-cyan-500" />
            </div>
          )}
          {dateMode === 'custom' && (
            <DateField value={customDate}
              onChange={(v) => setCustomDate(v)}
              className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-600 dark:text-slate-300 font-mono focus:outline-none focus:border-cyan-500"
            />
          )}
        </div>

        {/* Status filter */}
        {!creditOnly && <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className={`border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-500 cursor-pointer font-bold ${statusFilter === 'unpaid' ? 'bg-rose-500/10 border-rose-500/40 text-rose-700 dark:text-rose-300' : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'}`}
        >
          <option value="all">كل المستندات</option>
          <option value="unpaid">آجل غير مسدد (كل الفترات)</option>
          <option value="returns">المرتجعات فقط</option>
        </select>}

        {/* Payment Method select Filter */}
        <select 
          value={selectedMethod}
          onChange={(e) => setSelectedMethod(e.target.value)}
          className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
        >
          <option value="الكل">كل طرق الدفع</option>
          <option value="cash">نقدي (Cash)</option>
          <option value="card">شبكة (Card)</option>
          <option value="bank">تحويل بنكي</option>
          <option value="split">نقدي + شبكة</option>
        </select>

        {multiDevice && (
          <select value={deviceFilter} onChange={(e) => setDeviceFilter(e.target.value)} data-testid="invoices-device"
            className={`border rounded-xl px-4 py-3 text-sm focus:outline-none cursor-pointer ${deviceFilter ? 'bg-violet-600 text-white border-violet-600' : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'}`}>
            <option value="" className="text-slate-900">كل الأجهزة</option>
            {deviceOptions.map((d) => <option key={d.tag} value={d.tag} className="text-slate-900">{d.label}</option>)}
          </select>
        )}

        {/* Currency Display Selector — يظهر فقط عند تفعيل تعدد العملات */}
        {availableCurrencies.length > 1 && <div className="flex items-center gap-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5">
          <Coins className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
          <span className="text-xs text-slate-500 dark:text-slate-400 font-bold whitespace-nowrap">العملة:</span>
          <select
            value={displayCurrencyCode}
            onChange={(e) => setDisplayCurrencyCode(e.target.value)}
            className="bg-transparent text-cyan-700 dark:text-cyan-300 font-black text-sm focus:outline-none cursor-pointer"
          >
            {availableCurrencies.map(c => (
              <option key={c.code} value={c.code} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                {c.nameAr} ({c.code === 'SAR' ? '⃁' : c.symbol})
              </option>
            ))}
          </select>
        </div>}
      </div>

      {/* Invoices table (rows) */}
      {filteredInvoices.length === 0 ? (
        <div className="py-12 text-center text-slate-500 font-bold">
          {dateMode === 'all' ? 'لا توجد فواتير مطابقة لعملية البحث' : 'لا توجد فواتير في هذه الفترة — اختر «كل الفترات» لعرض الأقدم'}
        </div>
      ) : (
        <div className="flex-1 min-h-[22rem] flex flex-col bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl overflow-hidden" data-testid="invoices-table-box">
          <div ref={invoicesTable.scrollRef} className="flex-1 min-h-0 overflow-auto vlist-scroll" data-testid="invoices-scroll">
            <table className="w-full text-sm text-right whitespace-nowrap">
              <thead className="sticky top-0 z-[3] bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 text-xs shadow-[0_1px_0_rgba(100,116,139,0.25)]">
                <tr>
                  <th className="px-2 py-2.5 font-black sticky right-0 z-[1] bg-white dark:bg-slate-900">إجراءات</th>
                  <th className="px-3 py-2.5 font-black">رقم الفاتورة</th>
                  <th className="px-3 py-2.5 font-black">التاريخ</th>
                  <th className="px-3 py-2.5 font-black">العميل</th>
                  <th className="px-3 py-2.5 font-black hidden 2xl:table-cell">الكاشير</th>
                  <th className="px-3 py-2.5 font-black">طريقة الدفع</th>
                  <th className="px-3 py-2.5 font-black">قبل الضريبة</th>
                  <th className="px-3 py-2.5 font-black">الخصم</th>
                  <th className="px-3 py-2.5 font-black">الضريبة</th>
                  <th className="px-3 py-2.5 font-black">الإجمالي</th>
                  <th className="px-3 py-2.5 font-black">الحالة</th>
                </tr>
              </thead>
              <tbody>
                <VSpacer h={invoicesTable.padTop} />
                {invoicesTable.visible.map(invoice => {
                  const invoiceNum = invoice.invoiceNumber || invoice.number || 'INV-0000';
                  const subTotalAmount = invoice.subtotal !== undefined ? invoice.subtotal : (invoice.total / 1.15);
                  const taxAmount = invoice.tax !== undefined ? invoice.tax : (invoice.total - subTotalAmount);
                  const isRet = isReturnDoc(invoice);
                  const remaining = !isRet && invoice.remainingAmount && invoice.remainingAmount > 0 ? invoice.remainingAmount : 0;
                  const returnedLines = returnedMap.get(invoice.id);
                  const canReturn = !!onCreateReturn && !isRet && hasReturnableQty(invoice, returnedLines);
                  const fmt = (n: number) => convertAmount(n).toFixed(2);

                  return (
                    <tr key={invoice.id} data-vkey={invoice.id} data-testid="inv-row" className={`border-t border-slate-200/70 dark:border-slate-800/70 hover:bg-white/60 dark:hover:bg-slate-900/60 transition-colors ${isRet ? 'bg-rose-500/5' : ''}`}>
                      <td className="px-2 py-2 sticky right-0 z-[1] bg-white dark:bg-slate-950 shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.15)]" data-testid="inv-actions">
                        <div className="flex gap-1 justify-start">
                          {remaining > 0 && onPayInvoice && (
                            <button
                              onClick={() => setPayingInvoice(invoice)}
                              className="px-2 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition text-xs font-black flex items-center gap-1 cursor-pointer"
                              title="سداد الفاتورة"
                            >
                              <Wallet className="w-4 h-4" /> سداد
                            </button>
                          )}
                          {canReturn && (
                            <button
                              onClick={() => setReturningInvoice(invoice)}
                              className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg transition border border-rose-500/30 cursor-pointer"
                              title="مرتجع مبيعات"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => onViewInvoice(invoice)}
                            className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition border border-slate-300 dark:border-slate-700 cursor-pointer"
                            title="عرض الفاتورة وتغيير العملة"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {invoice.zatca && zatcaApi && (
                            <button
                              onClick={async () => { const r = await zatcaApi.exportXml(invoice.id); if (!r.ok && !r.canceled) alert(r.error || 'تعذّر التصدير'); }}
                              className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition border border-slate-300 dark:border-slate-700 cursor-pointer"
                              title="تصدير ملف XML المختوم"
                            >
                              <FileCode className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => onPrintInvoice && onPrintInvoice(invoice, displayCurrencyCode)}
                            className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition border border-slate-300 dark:border-slate-700 cursor-pointer"
                            title="إعادة طباعة"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          {onPdfInvoice && (
                            <button
                              onClick={() => onPdfInvoice(invoice, displayCurrencyCode)}
                              className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition border border-slate-300 dark:border-slate-700 cursor-pointer"
                              title="حفظ PDF"
                            >
                              <FileDown className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className={`px-4 py-3 font-mono font-bold ${isRet ? 'text-rose-700 dark:text-rose-300' : 'text-cyan-700 dark:text-cyan-300'}`}>
                        <button type="button" onClick={() => onViewInvoice(invoice)} className="font-mono font-bold hover:underline cursor-pointer" title="فتح الفاتورة" data-testid="inv-open">{invoiceNum}</button>
                        {isRet && <span className="block text-[10px] font-sans text-rose-600 dark:text-rose-400">مرتجع عن {invoice.originalInvoiceNumber}</span>}
                        {!isRet && returnedLines && <span className="block text-[10px] font-sans text-amber-600 dark:text-amber-400">{canReturn ? 'عليها مرتجع جزئي' : 'مرتجعة بالكامل'}</span>}
                        {invoice.zatca && (
                          <button
                            type="button"
                            data-testid="zatca-badge"
                            onClick={() => zatcaApi && setZatcaDetailId(invoice.id)}
                            className={`block text-[10px] font-sans font-bold hover:underline cursor-pointer text-right ${ZATCA_BADGE[invoice.zatca.status]?.cls || ''}`}
                            title={(invoice.zatca.message ? invoice.zatca.message + ' — ' : '') + 'اضغط لعرض رد الهيئة'}
                          >
                            {ZATCA_BADGE[invoice.zatca.status]?.label || invoice.zatca.status}
                            {(invoice.zatca.status === 'warning' || invoice.zatca.status === 'rejected' || invoice.zatca.status === 'error') && <span className="mr-1">— عرض الرسالة</span>}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-600 dark:text-slate-300 text-xs leading-tight">{(invoice.date || '').slice(0, 10)}<span className="block text-[10px] text-slate-400">{(invoice.date || '').slice(11, 16)}</span></td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200 font-bold max-w-[11rem] 2xl:max-w-[16rem] truncate" title={customerLabel(invoice.customerName)}>
                        {customerLabel(invoice.customerName)}
                        {invoice.note && <span title={invoice.note} className="mr-1.5 cursor-help">📝</span>}
                        {invoice.vehicle?.plate && <span title={`${invoice.vehicle.plate}${invoice.vehicle.model ? ' — ' + invoice.vehicle.model : ''}`} className="mr-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-700 dark:text-sky-300" dir="auto">🚗 {invoice.vehicle.plate}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 text-xs font-bold hidden 2xl:table-cell">{invoice.cashierName || '—'}{multiDevice && deviceTagOf(invoice) ? <span className="mr-1.5 px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 font-mono text-[10px]" title="الجهاز">{deviceTagOf(invoice)}</span> : null}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2.5 py-0.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                          {paymentLabel(invoice)}
                          {invoice.paymentMethod === 'cash' && invoice.isQuickPay && !((invoice.remainingAmount || 0) > 0) && (
                            <span className="text-[9px] bg-amber-500/20 text-amber-700 dark:text-amber-300 px-1 rounded flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" />سريع</span>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-600 dark:text-slate-300">{fmt(subTotalAmount)}</td>
                      <td className="px-3 py-2.5 font-mono text-amber-600 dark:text-amber-400">
                        {invoice.discount && invoice.discount > 0
                          ? `- ${fmt(invoice.discount)}${invoice.discountType === 'percent' ? ` (${invoice.discountValue}%)` : ''}`
                          : <span className="text-slate-400 dark:text-slate-600">—</span>}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-rose-600 dark:text-rose-400">{fmt(taxAmount)}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">{fmt(invoice.total)}</span>
                        {isNonBase && (
                          <span className="block text-[10px] text-slate-500 font-mono">({invoice.total.toFixed(2)} {baseCurrObj.code})</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isRet ? (
                          <span className="inline-flex flex-col">
                            <span className="text-[11px] font-black text-rose-700 dark:text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded px-2 py-0.5">مرتجع مبيعات</span>
                            {invoice.debtOffset ? <span className="text-[10px] font-mono text-amber-700 dark:text-amber-300 mt-0.5">خُصم من المديونية {fmt(invoice.debtOffset)}</span> : null}
                          </span>
                        ) : remaining > 0 ? (
                          <span className="inline-flex flex-col">
                            <span className="text-[11px] font-black text-rose-700 dark:text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded px-2 py-0.5">
                              {invoice.paymentStatus === 'unpaid' ? 'آجل' : 'دفع جزئي'}
                            </span>
                            <span className="text-[10px] font-mono text-rose-700 dark:text-rose-300 mt-0.5">المتبقي {fmt(remaining)}</span>
                          </span>
                        ) : (
                          <span className="text-[11px] font-black text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded px-2 py-0.5">مسددة</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <VSpacer h={invoicesTable.padBottom} />
              </tbody>
              <tfoot className="sticky bottom-0 z-[3] bg-white dark:bg-slate-900 font-black text-sm shadow-[0_-2px_0_rgba(6,182,212,0.4)]">
                <tr>
                  <td className="sticky right-0 bg-white dark:bg-slate-900" /><td className="hidden 2xl:table-cell" /><td className="px-3 py-2.5 text-cyan-700 dark:text-cyan-300" colSpan={4}>الإجمالي ({filteredInvoices.length} فاتورة) — العملة: {activeCurrObj.code}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-700 dark:text-slate-200">{convertAmount(filteredInvoices.reduce((t, i) => t + (i.subtotal !== undefined ? i.subtotal : i.total / 1.15), 0)).toFixed(2)}</td>
                  <td className="px-3 py-2.5 font-mono text-amber-600 dark:text-amber-400">{convertAmount(filteredInvoices.reduce((t, i) => t + (i.discount || 0), 0)).toFixed(2)}</td>
                  <td className="px-3 py-2.5 font-mono text-rose-600 dark:text-rose-400">{convertAmount(filteredInvoices.reduce((t, i) => t + (i.tax !== undefined ? i.tax : i.total - i.total / 1.15), 0)).toFixed(2)}</td>
                  <td className="px-3 py-2.5 font-mono text-emerald-600 dark:text-emerald-400">{convertAmount(filteredInvoices.reduce((t, i) => t + i.total, 0)).toFixed(2)}</td>
                  <td className="px-3 py-2.5 font-mono text-rose-700 dark:text-rose-300 text-xs">
                    {(() => { const r = filteredInvoices.reduce((t, i) => t + (i.remainingAmount && i.remainingAmount > 0 ? i.remainingAmount : 0), 0); return r > 0 ? `آجل ${convertAmount(r).toFixed(2)}` : ''; })()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {payingInvoice && onPayInvoice && (
        <InvoicePaymentModal
          invoice={payingInvoice}
          onClose={() => setPayingInvoice(null)}
          onConfirm={(amount, method) => { onPayInvoice(payingInvoice.id, amount, method); setPayingInvoice(null); }}
        />
      )}
      {returningInvoice && onCreateReturn && (
        <SalesReturnModal
          invoice={returningInvoice}
          allInvoices={invoices}
          onClose={() => setReturningInvoice(null)}
          onConfirm={(req) => { onCreateReturn(returningInvoice.id, req); setReturningInvoice(null); }}
        />
      )}
      {scanned && (() => {
        const live = invoices.find((i) => i.id === scanned.id) || scanned;
        const isRet = isReturnDoc(live);
        const returnedLines = returnedMap.get(live.id);
        const canRet = !!onCreateReturn && !isRet && hasReturnableQty(live, returnedLines);
        const related = isRet
          ? invoices.filter((i) => i.id === live.originalInvoiceId)
          : invoices.filter((i) => isReturnDoc(i) && i.originalInvoiceId === live.id);
        return (
          <ScannedInvoicePanel
            invoice={live}
            related={related}
            canReturn={canRet}
            returnedAll={!isRet && !!returnedLines && !hasReturnableQty(live, returnedLines)}
            onClose={() => setScanned(null)}
            onView={() => { setScanned(null); onViewInvoice(live); }}
            onPrint={onPrintInvoice ? () => { setScanned(null); onPrintInvoice(live, displayCurrencyCode); } : undefined}
            onReturn={canRet ? () => { setScanned(null); setReturningInvoice(live); } : undefined}
            onPay={onPayInvoice ? () => { setScanned(null); setPayingInvoice(live); } : undefined}
            onOpen={(inv) => setScanned(inv)}
          />
        );
      })()}
      {zatcaDetailId && <ZatcaDocDetail invoiceId={zatcaDetailId} onClose={() => setZatcaDetailId(null)} />}
    </div>
  );
}
