import React, { useState, useMemo, useRef } from 'react';
import { localTimestamp } from '../utils/files';
import { useVirtualRows, VSpacer } from '../utils/useVirtualRows';
import { usePersistentState } from '../storage/persistence';
import { computeShift, displayTs, laterCut, cashierBreakdown } from '../utils/shiftReport';
import { 
  Invoice, CompanySettings, AppUser, CashMovement 
} from '../types';
import { 
  generateZReportTlvBase64, 
  generateZatcaTlvBase64, 
  ZReportData, 
  generateQrDataUrl 
} from '../utils/zatca';
import ZatcaQrCodeViewer from './ZatcaQrCodeViewer';
import { 
  LockKeyhole, Printer, CheckCircle2, ShieldCheck, 
  History, Calendar, Clock, DollarSign, CreditCard, 
  FileText, ArrowRightLeft, Sparkles, RefreshCw, AlertTriangle 
} from 'lucide-react';
import SaudiRiyalSymbol from './SaudiRiyalSymbol';

export interface ZReportRecord extends ZReportData {
  /** تفاصيل إضافية للتقرير المطبوع */
  totalOther?: number;
  salesTotal?: number;
  returnsTotal?: number;
  returnsCount?: number;
  creditOutstanding?: number;
  debtCollections?: number;
  taxRate?: number;
  id: string;
  closedAt: string;
  closedBy: string;
  base64Payload: string;
  /** آخر لحظة (توقيت محلي YYYY-MM-DD HH:mm:ss) شملها هذا الإقفال — ما بعدها يدخل في الوردية التالية */
  cutoff?: string;
  /** معرّفات الفواتير التي تاريخها يساوي cutoff تماماً (لتفادي ازدواج فاتورة في نفس الثانية) */
  cutoffIds?: string[];
  /** shift = إقفال وردية كاشير واحد (مبيعاته فقط) — daily/بدون = الإقفال اليومي لكل الكاشيرية */
  kind?: 'daily' | 'shift';
  /** صاحب الوردية (لإقفال الوردية) */
  cashier?: string;
  /** ملخص كل كاشير داخل الإقفال اليومي */
  cashiers?: { name: string; count: number; returns: number; cash: number; card: number; other: number; net: number; open: boolean }[];
  /** العهدة (نقد بداية الوردية) — 0 إن كان الزر مغلقاً */
  openingFloat?: number;
  /** حركات الصندوق خلال الوردية */
  cashIn?: number;
  cashOut?: number;
  /** النقد المتوقع في الدرج = العهدة + نقدي المبيعات + الإدخالات − المصروفات */
  expectedCash?: number;
  /** النقد المعدود فعلياً عند الإقفال والفرق (سالب = عجز) */
  countedCash?: number;
  cashDiff?: number;
  /** تسليم النقدية للإدارة عند الإقفال: المبلغ والمستلم وما بقي في الدرج */
  handover?: number;
  handoverTo?: string;
  keptInDrawer?: number;
}

/** حدّ آخر إقفال: للسجلات القديمة (قبل هذا الإصلاح) نستخدم وقت نهاية ورديتها */
function lastCutoff(records: ZReportRecord[]): { at: string; ids: Set<string> } | null {
  const last = records[0];
  if (!last) return null;
  if (last.cutoff) return { at: last.cutoff, ids: new Set(last.cutoffIds || []) };
  const end = Date.parse(last.shiftEnd);
  return Number.isFinite(end) ? { at: localTimestamp(new Date(end)), ids: new Set() } : null;
}

interface ZReportManagerProps {
  invoices: Invoice[];
  settings: CompanySettings;
  currentUser?: AppUser;
  onPrintZReport?: (record: ZReportRecord) => void;
  onNotify?: (msg: string) => void;
  /** بعد الإقفال (تصفير رقم الطلبات في المطعم) */
  onShiftClosed?: () => void;
  /** حركات الصندوق (إدخال/صرف) لتظهر في الإقفال */
  cashMovements?: CashMovement[];
  /** تسجيل فرق الجرد (عجز/زيادة) حركةَ صندوق عند الإقفال */
  onCashDiff?: (m: CashMovement) => void;

  /** اسم الكاشير الحالي كما يُسجَّل في الفواتير */
  cashierName?: string;
  /** يقفل كل الكاشيرية (الإقفال اليومي) */
  canCloseDaily?: boolean;
  /** يقفل ورديته فقط (مبيعاته) */
  canCloseShift?: boolean;
}

export default function ZReportManager({
  invoices,
  settings,
  currentUser,
  onPrintZReport,
  onNotify,
  onShiftClosed,
  cashMovements = [],
  onCashDiff,
  cashierName = 'المدير العام',
  canCloseDaily = true,
  canCloseShift = false,
}: ZReportManagerProps) {
  // Shift state and history
  const [activeTab, setActiveTab] = useState<'current' | 'history' | 'simulator'>('current');
  const [selectedHistoricalReport, setSelectedHistoricalReport] = useState<ZReportRecord | null>(null);
  
  // Custom simulator form state for testing any ZATCA invoice QR
  const [testSeller, setTestSeller] = useState(settings.companyName || 'مؤسسة كاشير البدر للتجارة');
  const [testVat, setTestVat] = useState(settings.vatNumber || '300000000000003');
  const [testTotal, setTestTotal] = useState('115.00');
  const [testTax, setTestTax] = useState('15.00');
  const [testDate, setTestDate] = useState(new Date().toISOString().slice(0, 19));

  // Past Z-reports archive
  const [pastZReports, setPastZReports] = usePersistentState<ZReportRecord[]>('zReports', []);

  // نوعا الإقفال: «ورديتي» = مبيعات الكاشير الحالي فقط منذ آخر إقفال لورديته (أو آخر إقفال يومي)،
  // و«اليومي» = كل ما حدث بعد آخر إقفال يومي لكل الكاشيرية (لا تؤثر عليه إقفالات الورديات)
  const [mode, setMode] = useState<'shift' | 'daily'>(canCloseDaily ? 'daily' : 'shift');
  const isShift = mode === 'shift' && canCloseShift;
  const dailyRecords = useMemo(() => pastZReports.filter((r) => r.kind !== 'shift'), [pastZReports]);
  const shiftRecordsOf = (name: string) => pastZReports.filter((r) => r.kind === 'shift' && r.cashier === name);
  const dailyCut = useMemo(() => lastCutoff(dailyRecords), [dailyRecords]);
  const myShiftRecords = useMemo(() => shiftRecordsOf(cashierName), [pastZReports, cashierName]); // eslint-disable-line react-hooks/exhaustive-deps
  const cut = useMemo(() => (isShift ? laterCut(lastCutoff(myShiftRecords), dailyCut) : dailyCut), [isShift, myShiftRecords, dailyCut]);
  const shiftMetrics = useMemo(() => computeShift(invoices, cut, isShift ? cashierName : undefined), [invoices, cut, isShift, cashierName]);
  const lastOfMode = isShift ? myShiftRecords[0] : dailyRecords[0];
  // ملخص الكاشيرية في الإقفال اليومي + هل ما زالت وردية كل واحد مفتوحة
  const byCashier = useMemo(() => isShift ? [] : cashierBreakdown(invoices, dailyCut).map((r) => {
    const own = laterCut(lastCutoff(pastZReports.filter((x) => x.kind === 'shift' && x.cashier === r.name)), dailyCut);
    return { ...r, open: computeShift(invoices, own, r.name).activityCount > 0 };
  }), [isShift, invoices, dailyCut, pastZReports]);
  // الكاشير يرى إقفالات ورديته فقط في السجل
  const visibleHistory = canCloseDaily ? pastZReports : myShiftRecords;
  const historyTable = useVirtualRows<ZReportRecord>(visibleHistory, (r) => r.id);
  const closingRef = useRef(false);
  const taxRate = settings.taxRate ?? 15;

  // حركات الصندوق داخل هذه الوردية + النقد المتوقع في الدرج
  // (إقفال الوردية يخص مبيعات الكاشير فقط، أما حركات الصندوق فهي للصندوق كله → تظهر في الإقفال اليومي)
  const cashFlow = useMemo(() => {
    const mine = cashMovements.filter((m) => !cut || (m.date || '') > cut.at);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const sum = (f: (m: CashMovement) => boolean) => r2(mine.filter(f).reduce((s, m) => s + (Number(m.amount) || 0), 0));
    // العهدة حركة مستقلة (kind='float') لا تُحسب ضمن الإدخالات
    return { cashIn: sum((m) => m.type === 'in' && m.kind !== 'float'), cashOut: sum((m) => m.type === 'out'), float: sum((m) => m.kind === 'float'), count: mine.length };
  }, [cashMovements, cut]);
  // العهدة والإدخالات والمصروفات كلها مقيّدة بما بعد «القطع»، فهي تخصّ هذه الوردية
  // أو هذا اليوم — وتدخل في نقد الدرج في الحالتين (الدرج واحد فعلياً).
  const floatAmount = cashFlow.float;
  const expectedCash = Math.round((floatAmount + shiftMetrics.totalCash + cashFlow.cashIn - cashFlow.cashOut) * 100) / 100;

  // Current active Z-Report data model (التوقيت محلي بصيغة ISO بدون Z — العرض عبر displayTs)
  const nowIso = localTimestamp().replace(' ', 'T');
  const currentZReportData: ZReportData = useMemo(() => ({
    reportNumber: isShift
      ? `S-${localTimestamp().slice(0, 10).replace(/-/g, '')}-${(pastZReports.filter((r) => r.kind === 'shift').length + 1).toString().padStart(3, '0')}`
      : `Z-${localTimestamp().slice(0, 10).replace(/-/g, '')}-${(dailyRecords.length + 1).toString().padStart(3, '0')}`,
    sellerName: settings.companyName,
    vatNumber: settings.vatNumber,
    posTerminalId: 'POS-MAIN-01',
    cashierName: isShift ? cashierName : (currentUser?.fullName || 'المدير العام'),
    shiftStart: shiftMetrics.shiftStart ? shiftMetrics.shiftStart.replace(' ', 'T') : nowIso,
    shiftEnd: nowIso,
    totalCash: shiftMetrics.totalCash,
    totalCard: shiftMetrics.totalCard,
    totalBank: shiftMetrics.totalBank,
    subtotal: shiftMetrics.subtotal,
    totalVat: shiftMetrics.totalVat,
    grandTotal: shiftMetrics.grandTotal,
    invoicesCount: shiftMetrics.invoicesCount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [settings, currentUser, shiftMetrics, pastZReports.length, isShift, cashierName, dailyRecords.length]);

  const currentZReportBase64 = useMemo(() => {
    return generateZReportTlvBase64(currentZReportData);
  }, [currentZReportData]);

  /** النقد المعدود فعلياً في الدرج عند الإقفال — فرقه عن المتوقع عجز أو زيادة */
  const [counted, setCounted] = useState('');
  const countedNum = counted.trim() === '' ? null : Math.round((Number(counted) || 0) * 100) / 100;
  const cashDiff = countedNum === null ? 0 : Math.round((countedNum - expectedCash) * 100) / 100;
  /** تسليم النقد للإدارة عند انتهاء الوردية — تبقى العهدة في الدرج للوردية التالية */
  const [handover, setHandover] = useState(false);
  const [handoverTo, setHandoverTo] = useState('');
  const [handoverAmt, setHandoverAmt] = useState('');
  const suggestedHandover = Math.max(0, Math.round(((countedNum ?? expectedCash) - floatAmount) * 100) / 100);
  const handoverNum = handoverAmt.trim() === '' ? suggestedHandover : Math.max(0, Math.round((Number(handoverAmt) || 0) * 100) / 100);
  const keptInDrawer = Math.round(((countedNum ?? expectedCash) - handoverNum) * 100) / 100;

  // Handle shift closure
  const handleCloseShift = () => {
    if (closingRef.current) return; // منع الضغط المزدوج
    if (shiftMetrics.activityCount === 0) {
      onNotify?.(isShift ? 'لا توجد عمليات جديدة في ورديتك منذ آخر إقفال' : 'لا توجد عمليات جديدة منذ آخر إقفال — تم الإقفال مسبقاً');
      return;
    }
    closingRef.current = true;
    setTimeout(() => { closingRef.current = false; }, 1500);
    // الحدّ = آخر عملية شملها الإقفال (فاتورة أو دفعة) — وليس الساعة الآن — حتى لا تضيع عملية صدرت لحظة الإقفال
    const newRecord: ZReportRecord = {
      ...currentZReportData,
      id: `${currentZReportData.reportNumber}-${Date.now()}`,
      closedAt: localTimestamp(),
      closedBy: currentUser?.fullName || 'المدير العام',
      base64Payload: currentZReportBase64,
      cutoff: shiftMetrics.cutoff,
      cutoffIds: shiftMetrics.cutoffIds,
      totalOther: shiftMetrics.totalOther,
      salesTotal: shiftMetrics.salesTotal,
      returnsTotal: shiftMetrics.returnsTotal,
      returnsCount: shiftMetrics.returnsCount,
      creditOutstanding: shiftMetrics.creditOutstanding,
      debtCollections: shiftMetrics.debtCollections,
      taxRate,
      openingFloat: floatAmount || undefined,
      cashIn: cashFlow.cashIn || undefined,
      cashOut: cashFlow.cashOut || undefined,
      expectedCash,
      countedCash: countedNum ?? undefined,
      cashDiff: countedNum === null ? undefined : cashDiff,
      handover: handover && handoverNum > 0 ? handoverNum : undefined,
      handoverTo: handover && handoverNum > 0 ? (handoverTo.trim() || 'الإدارة') : undefined,
      keptInDrawer: handover && handoverNum > 0 ? keptInDrawer : undefined,
      kind: isShift ? 'shift' : 'daily',
      ...(isShift ? { cashier: cashierName } : {
        cashiers: byCashier.map((r) => ({ name: r.name || '—', count: r.salesCount, returns: r.returnsCount, cash: r.totalCash, card: r.totalCard, other: r.totalOther + r.totalBank, net: r.grandTotal, open: r.open })),
      }),
    };

    // فرق الجرد يُسجَّل حركةَ صندوق باسم الكاشير حتى يبقى الرصيد مطابقاً للواقع
    if (countedNum !== null && Math.abs(cashDiff) >= 0.01) {
      onCashDiff?.({
        id: `cm-diff-${Date.now()}`, date: localTimestamp(),
        type: cashDiff < 0 ? 'out' : 'in', amount: Math.abs(cashDiff),
        reason: cashDiff < 0 ? 'عجز في الصندوق' : 'زيادة في الصندوق',
        kind: 'diff',
        note: `جرد الإقفال ${newRecord.reportNumber}: المتوقع ${expectedCash.toFixed(2)} والمعدود ${countedNum.toFixed(2)}`,
        by: isShift ? cashierName : (currentUser?.fullName || 'المدير العام'),
      });
    }
    // التوريد: يخرج من الصندوق فعلياً فيعود الرصيد إلى ما بقي في الدرج
    if (handover && handoverNum > 0) {
      onCashDiff?.({
        id: `cm-hand-${Date.now()}`, date: localTimestamp(), type: 'out', amount: handoverNum,
        reason: 'توريد للخزنة', kind: 'handover',
        note: `تسليم نقدية عند ${isShift ? 'إقفال الوردية' : 'الإقفال اليومي'} ${newRecord.reportNumber} إلى ${handoverTo.trim() || 'الإدارة'} — بقي في الدرج ${keptInDrawer.toFixed(2)}`,
        by: isShift ? cashierName : (currentUser?.fullName || 'المدير العام'),
      });
    }
    setCounted(''); setHandover(false); setHandoverAmt(''); setHandoverTo('');
    setPastZReports(prev => [newRecord, ...prev]);
    if (!isShift) onShiftClosed?.(); // تصفير رقم الطلبات مع الإقفال اليومي فقط
    if (onNotify) {
      onNotify(isShift ? `تم إقفال ورديتك (${cashierName}) — تقرير #${newRecord.reportNumber}` : `تم الإقفال اليومي وتوليد تقرير Z بنجاح (#${newRecord.reportNumber})`);
    }
    if (onPrintZReport) {
      onPrintZReport(newRecord);
    }
  };

  // Test custom simulator QR Base64
  const testInvoiceQrBase64 = useMemo(() => {
    return generateZatcaTlvBase64({
      sellerName: testSeller,
      vatNumber: testVat,
      timestamp: testDate,
      totalWithVat: testTotal,
      vatAmount: testTax
    });
  }, [testSeller, testVat, testDate, testTotal, testTax]);

  return (
    <div className="p-4 2xl:p-6 bg-slate-50 dark:bg-slate-950 text-right text-slate-800 dark:text-slate-100 min-h-full space-y-6" dir="rtl">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <LockKeyhole className="w-6 h-6 text-rose-500" />
              <span>{isShift ? `إقفال ورديتي — ${cashierName}` : 'الإقفال اليومي وتقرير Z-Report (متوافق مع هيئة الزكاة)'}</span>
            </h1>
            <span className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs px-2.5 py-0.5 rounded-full font-bold">
              ZATCA FATOORA Phase 1
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            {isShift
              ? 'يُقفل مبيعاتك ومرتجعاتك وتحصيلاتك فقط منذ آخر إقفال لورديتك — ويبقى للمدير الإقفال اليومي الذي يجمع كل الكاشيرية.'
              : 'إقفال صندوق اليوم لكل الكاشيرية وتوليد رمز الاستجابة السريعة المشفر بنظام TLV والطباعة الحرارية المعتمدة.'}
          </p>
          {canCloseShift && canCloseDaily && (
            <div className="mt-3 inline-flex bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-black" data-testid="z-mode">
              <button type="button" onClick={() => { setMode('shift'); setActiveTab('current'); }} data-testid="z-mode-shift"
                className={`px-3.5 py-2 rounded-lg cursor-pointer ${isShift ? 'bg-cyan-600 text-white shadow' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>إقفال ورديتي ({cashierName})</button>
              <button type="button" onClick={() => { setMode('daily'); setActiveTab('current'); }} data-testid="z-mode-daily"
                className={`px-3.5 py-2 rounded-lg cursor-pointer ${!isShift ? 'bg-rose-500 text-white shadow' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>الإقفال اليومي (كل الكاشيرية)</button>
            </div>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setActiveTab('current')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === 'current'
                ? 'bg-rose-500 text-white shadow-md'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {isShift ? 'ورديتي الحالية' : 'الوردية الحالية'}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === 'history'
                ? 'bg-rose-500 text-white shadow-md'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            سجل الإقفالات السابقة ({visibleHistory.length})
          </button>
          {canCloseDaily && <button
            onClick={() => setActiveTab('simulator')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === 'simulator'
                ? 'bg-rose-500 text-white shadow-md'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            مولد وفاحص أكواد ZATCA
          </button>}
        </div>
      </div>

      {/* TAB 1: CURRENT ACTIVE SHIFT & Z-REPORT */}
      {activeTab === 'current' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Shift Financial Summary */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-800/60 pb-3">
                <span className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                  بيانات الوردية النشطة
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  معرّف التقرير: <span className="font-mono">{currentZReportData.reportNumber}</span>
                </span>
              </div>

              {/* Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-white/60 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 block mb-1">الكاشير النشط:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{currentZReportData.cashierName}</span>
                </div>
                <div className="bg-white/60 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 block mb-1">نقطة البيع (POS):</span>
                  <span className="font-bold text-slate-900 dark:text-white font-mono">{currentZReportData.posTerminalId}</span>
                </div>
                <div className="bg-white/60 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 block mb-1">عدد الفواتير الصادرة:</span>
                  <span className="font-bold text-cyan-600 dark:text-cyan-400 text-sm"><span className="font-mono">{shiftMetrics.invoicesCount}</span> فاتورة{shiftMetrics.returnsCount ? <> · <span className="font-mono">{shiftMetrics.returnsCount}</span> مرتجع</> : null}</span>
                </div>
                <div className="bg-white/60 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800 col-span-2 sm:col-span-3 flex flex-wrap gap-x-6 gap-y-1">
                  <span><span className="text-slate-500">بداية الوردية: </span><span className="font-bold font-mono" dir="ltr" data-testid="z-start">{displayTs(shiftMetrics.shiftStart) || '—'}</span></span>
                  <span><span className="text-slate-500">{isShift ? 'آخر إقفال لورديتك: ' : 'آخر إقفال يومي: '}</span><span className="font-bold font-mono" dir="ltr">{lastOfMode ? displayTs(lastOfMode.closedAt) : '—'}</span></span>
                </div>
              </div>

              {/* Breakdown Amounts */}
              <div className="space-y-2.5 bg-white/40 dark:bg-slate-900/40 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800/60 text-xs font-bold">
                <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                  <span className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    المبيعات النقدية (كاش):
                  </span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 text-sm inline-flex items-center gap-1">
                    {shiftMetrics.totalCash.toFixed(2)} <SaudiRiyalSymbol className="w-3.5 h-3.5" />
                  </span>
                </div>

                <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                  <span className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    مبيعات مدى والشبكة (بطاقة):
                  </span>
                  <span className="font-mono text-blue-600 dark:text-blue-400 text-sm inline-flex items-center gap-1">
                    {shiftMetrics.totalCard.toFixed(2)} <SaudiRiyalSymbol className="w-3.5 h-3.5" />
                  </span>
                </div>

                {shiftMetrics.totalBank > 0 && (
                  <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                    <span className="flex items-center gap-2">🏦 تحويلات بنكية:</span>
                    <span className="font-mono text-indigo-600 dark:text-indigo-400 text-sm inline-flex items-center gap-1">{shiftMetrics.totalBank.toFixed(2)} <SaudiRiyalSymbol className="w-3.5 h-3.5" /></span>
                  </div>
                )}

                {shiftMetrics.totalOther !== 0 && (
                  <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                    <span>دفع مختلط / أخرى:</span>
                    <span className="font-mono text-sm inline-flex items-center gap-1">{shiftMetrics.totalOther.toFixed(2)} <SaudiRiyalSymbol className="w-3.5 h-3.5" /></span>
                  </div>
                )}
                <div className="flex justify-between items-center text-slate-900 dark:text-white pt-2 border-t border-slate-200/40 dark:border-slate-800/40" data-testid="z-drawer">
                  <span>إجمالي المبيعات المحصّلة (نقدي + شبكة):</span>
                  <span className="font-mono text-sm font-black inline-flex items-center gap-1">{shiftMetrics.drawerTotal.toFixed(2)} <SaudiRiyalSymbol className="w-3.5 h-3.5" /></span>
                </div>
                {floatAmount > 0 && (
                  <div className="flex justify-between items-center text-slate-600 dark:text-slate-300" data-testid="z-float">
                    <span className="flex items-center gap-2">🪙 العهدة (بداية الوردية):</span>
                    <span className="font-mono text-sm inline-flex items-center gap-1">{floatAmount.toFixed(2)} <SaudiRiyalSymbol className="w-3.5 h-3.5" /></span>
                  </div>
                )}
                {cashFlow.cashIn > 0 && (
                  <div className="flex justify-between items-center text-emerald-700 dark:text-emerald-300" data-testid="z-cash-in">
                    <span className="flex items-center gap-2">⬇️ إدخالات الصندوق:</span>
                    <span className="font-mono text-sm inline-flex items-center gap-1">{cashFlow.cashIn.toFixed(2)} <SaudiRiyalSymbol className="w-3.5 h-3.5" /></span>
                  </div>
                )}
                {cashFlow.cashOut > 0 && (
                  <div className="flex justify-between items-center text-rose-600 dark:text-rose-400" data-testid="z-cash-out">
                    <span className="flex items-center gap-2">⬆️ مصروفات من الصندوق:</span>
                    <span className="font-mono text-sm inline-flex items-center gap-1" dir="ltr">-{cashFlow.cashOut.toFixed(2)} <SaudiRiyalSymbol className="w-3.5 h-3.5" /></span>
                  </div>
                )}
                {(floatAmount > 0 || cashFlow.cashIn > 0 || cashFlow.cashOut > 0 || shiftMetrics.totalCash > 0) && (
                  <div className="pt-2 border-t border-slate-200/40 dark:border-slate-800/40" data-testid="z-expected-cash">
                    <div className="flex justify-between items-center text-slate-900 dark:text-white">
                      <span>النقد المتوقع في الدرج:</span>
                      <span className="font-mono text-sm font-black inline-flex items-center gap-1">{expectedCash.toFixed(2)} <SaudiRiyalSymbol className="w-3.5 h-3.5" /></span>
                    </div>
                    <p className="text-[10.5px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5 leading-snug" dir="rtl">
                      نقدي {shiftMetrics.totalCash.toFixed(2)}{floatAmount > 0 ? ` + عهدة ${floatAmount.toFixed(2)}` : ''}{cashFlow.cashIn > 0 ? ` + إدخالات ${cashFlow.cashIn.toFixed(2)}` : ''}{cashFlow.cashOut > 0 ? ` − مصروفات ${cashFlow.cashOut.toFixed(2)}` : ''} = {expectedCash.toFixed(2)} — الشبكة لا تدخل في نقد الدرج
                    </p>
                    {/* جرد الدرج: الفرق يُسجَّل عجزاً أو زيادة */}
                    <div className="mt-2 pt-2 border-t border-dashed border-slate-300/60 dark:border-slate-700/60 space-y-1.5" data-testid="z-count">
                      <label className="flex justify-between items-center gap-2 text-slate-900 dark:text-white">
                        <span>النقد المعدود في الدرج:</span>
                        <span className="inline-flex items-center gap-1">
                          <input type="number" min="0" step="any" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="اختياري"
                            data-testid="z-counted" dir="ltr"
                            className="w-28 px-2 py-1 rounded-lg border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 font-mono text-center text-sm font-black" />
                          <SaudiRiyalSymbol className="w-3.5 h-3.5" />
                        </span>
                      </label>
                      {countedNum !== null && (
                        <div className={`flex justify-between items-center font-black ${Math.abs(cashDiff) < 0.01 ? 'text-emerald-600 dark:text-emerald-400' : cashDiff < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`} data-testid="z-diff">
                          <span>{Math.abs(cashDiff) < 0.01 ? 'مطابق — لا عجز ولا زيادة' : cashDiff < 0 ? 'عجز:' : 'زيادة:'}</span>
                          {Math.abs(cashDiff) >= 0.01 && <span className="font-mono text-sm inline-flex items-center gap-1">{Math.abs(cashDiff).toFixed(2)} <SaudiRiyalSymbol className="w-3.5 h-3.5" /></span>}
                        </div>
                      )}
                      <p className="text-[10.5px] font-semibold text-slate-500 dark:text-slate-400 leading-snug">
                        عُدّ النقد في الدرج قبل الإقفال واكتبه هنا. الفرق يُسجَّل حركةَ صندوق ({isShift ? cashierName : 'باسمك'}) ويظهر في التقرير، فيبقى رصيد الصندوق مطابقاً للواقع. اتركه فارغاً لتتخطى الجرد.
                      </p>

                      {/* تسليم النقدية للإدارة — يفرّغ الدرج ويُبقي العهدة */}
                      <div className="pt-2 border-t border-dashed border-slate-300/60 dark:border-slate-700/60 space-y-1.5" data-testid="z-handover">
                        <label className="flex items-center gap-2 cursor-pointer text-slate-900 dark:text-white">
                          <input type="checkbox" checked={handover} onChange={(e) => setHandover(e.target.checked)} data-testid="z-handover-on" className="w-4 h-4 accent-emerald-600" />
                          <span className="font-black">تسليم النقدية للإدارة الآن</span>
                        </label>
                        {handover && (
                          <div className="space-y-1.5 pr-6">
                            <label className="flex justify-between items-center gap-2">
                              <span>المبلغ المسلَّم:</span>
                              <span className="inline-flex items-center gap-1">
                                <input type="number" min="0" step="any" value={handoverAmt} onChange={(e) => setHandoverAmt(e.target.value)}
                                  placeholder={suggestedHandover.toFixed(2)} data-testid="z-handover-amt" dir="ltr"
                                  className="w-28 px-2 py-1 rounded-lg border-2 border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-950 font-mono text-center text-sm font-black" />
                                <SaudiRiyalSymbol className="w-3.5 h-3.5" />
                              </span>
                            </label>
                            <label className="flex justify-between items-center gap-2">
                              <span>المستلم:</span>
                              <input value={handoverTo} onChange={(e) => setHandoverTo(e.target.value)} placeholder="الإدارة" data-testid="z-handover-to"
                                className="w-40 px-2 py-1 rounded-lg border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 text-sm font-bold" />
                            </label>
                            <div className="flex justify-between items-center font-black text-emerald-700 dark:text-emerald-400" data-testid="z-handover-kept">
                              <span>يبقى في الدرج:</span>
                              <span className="font-mono text-sm inline-flex items-center gap-1">{keptInDrawer.toFixed(2)} <SaudiRiyalSymbol className="w-3.5 h-3.5" /></span>
                            </div>
                            <p className="text-[10.5px] font-semibold text-slate-500 dark:text-slate-400 leading-snug">
                              المقترح = المعدود − العهدة ({floatAmount.toFixed(2)})، فتبقى العهدة للوردية التالية. يُسجَّل «توريد للخزنة» في الصندوق ويُطبع في التقرير بتوقيع المسلِّم والمستلم.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {shiftMetrics.debtCollections > 0 && (
                  <div className="flex justify-between items-center text-violet-700 dark:text-violet-300 text-[11px]">
                    <span>منها سداد فواتير آجلة سابقة:</span>
                    <span className="font-mono inline-flex items-center gap-1">{shiftMetrics.debtCollections.toFixed(2)} <SaudiRiyalSymbol className="w-3 h-3" /></span>
                  </div>
                )}
                {shiftMetrics.creditOutstanding > 0 && (
                  <div className="flex justify-between items-center text-amber-700 dark:text-amber-300">
                    <span>مبيعات آجلة (غير محصّلة):</span>
                    <span className="font-mono text-sm inline-flex items-center gap-1">{shiftMetrics.creditOutstanding.toFixed(2)} <SaudiRiyalSymbol className="w-3.5 h-3.5" /></span>
                  </div>
                )}
                {shiftMetrics.returnsCount > 0 && (
                  <div className="flex justify-between items-center text-rose-600 dark:text-rose-400">
                    <span>المرتجعات ({shiftMetrics.returnsCount}):</span>
                    <span className="font-mono text-sm inline-flex items-center gap-1" dir="ltr">-{shiftMetrics.returnsTotal.toFixed(2)} <SaudiRiyalSymbol className="w-3.5 h-3.5" /></span>
                  </div>
                )}

                <div className="flex justify-between items-center text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200/40 dark:border-slate-800/40">
                  <span>المجموع الخاضع للضريبة (غير شامل):</span>
                  <span className="font-mono text-slate-600 dark:text-slate-300 inline-flex items-center gap-1">
                    {shiftMetrics.subtotal.toFixed(2)} <SaudiRiyalSymbol className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                  </span>
                </div>

                <div className="flex justify-between items-center text-rose-600 dark:text-rose-400">
                  <span>ضريبة القيمة المضافة ({taxRate}%):</span>
                  <span className="font-mono font-bold inline-flex items-center gap-1">
                    {shiftMetrics.totalVat.toFixed(2)} <SaudiRiyalSymbol className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                  </span>
                </div>

                <div className="flex justify-between items-center text-slate-900 dark:text-white text-base pt-3 border-t border-slate-200 dark:border-slate-800 font-black">
                  <span>صافي مبيعات الوردية (شامل الضريبة):</span>
                  <span className="font-mono text-cyan-600 dark:text-cyan-400 text-xl font-black inline-flex items-center gap-1.5">
                    {shiftMetrics.grandTotal.toFixed(2)} <SaudiRiyalSymbol className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                  </span>
                </div>
              </div>

              {/* الإقفال اليومي: ملخص كل كاشير وحالة ورديته */}
              {!isShift && byCashier.length > 0 && (byCashier.length > 1 || byCashier[0].name) && (
                <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/60 overflow-hidden" data-testid="z-cashiers">
                  <div className="px-3 py-2 bg-slate-50 dark:bg-slate-900/60 text-xs font-black text-slate-700 dark:text-slate-200">حسب الكاشير</div>
                  <table className="w-full text-xs text-right">
                    <thead className="text-slate-500 dark:text-slate-400"><tr>
                      <th className="p-2">الكاشير</th><th className="p-2">الفواتير</th><th className="p-2">نقدي</th><th className="p-2">شبكة</th><th className="p-2">الصافي</th><th className="p-2">ورديته</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {byCashier.map((r) => (
                        <tr key={r.name}>
                          <td className="p-2 font-bold">{r.name || '—'}</td>
                          <td className="p-2 font-mono">{r.salesCount}{r.returnsCount ? <span className="text-rose-500"> · {r.returnsCount}م</span> : null}</td>
                          <td className="p-2 font-mono text-emerald-600 dark:text-emerald-400">{r.totalCash.toFixed(2)}</td>
                          <td className="p-2 font-mono text-blue-600 dark:text-blue-400">{r.totalCard.toFixed(2)}</td>
                          <td className="p-2 font-mono font-black">{r.grandTotal.toFixed(2)}</td>
                          <td className="p-2">{r.open
                            ? <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-bold text-[11px]">مفتوحة</span>
                            : <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-bold text-[11px]">مُقفلة</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Close Shift Action Button */}
              <div className="pt-2">
                {shiftMetrics.activityCount === 0 ? (
                  <div className="w-full py-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-black text-sm flex items-center justify-center gap-2" data-testid="z-closed">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>{lastOfMode ? `تم الإقفال (${lastOfMode.reportNumber}) — لا توجد عمليات جديدة منذ آخر إقفال` : 'لا توجد عمليات للإقفال بعد'}</span>
                  </div>
                ) : (
                <button
                  type="button"
                  onClick={handleCloseShift}
                  data-testid="z-close"
                  className="w-full py-4 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white font-black rounded-xl text-base flex items-center justify-center gap-2 transition shadow-lg shadow-rose-500/20 active:scale-95 cursor-pointer"
                >
                  <LockKeyhole className="w-5 h-5" />
                  <span>{isShift ? `إقفال ورديتي (${shiftMetrics.activityCount} عملية) وطباعة التقرير` : `الإقفال اليومي (${shiftMetrics.activityCount} عملية) وطباعة تقرير Z`}</span>
                </button>
                )}
                <p className="text-[11px] text-slate-500 text-center mt-2">
                  عند الإقفال يتم تشفير بيانات الإقفال في رمز QR معتمد وحفظ سجل الإقفال للتدقيق المحاسبي.
                </p>
              </div>
            </div>
          </div>

          {/* QR Code Audit Preview */}
          <div className="lg:col-span-5 space-y-4">
            <ZatcaQrCodeViewer
              base64Payload={currentZReportBase64}
              title="رمز التحقق المشفر لتقرير Z (ZATCA QR)"
              subtitle="يحتوي على بصمة الإقفال المحاسبي والضريبي"
              size={180}
            />

            <div className="bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 text-xs space-y-3">
              <span className="font-bold text-slate-600 dark:text-slate-300 block">شروط المطابقة لـ ZATCA:</span>
              <ul className="space-y-1.5 text-slate-500 dark:text-slate-400 list-disc pr-4 text-[11px]">
                <li>ترميز البيانات بنظام Base64 المشتق من وسوم TLV الثنائية.</li>
                <li>إدراج الختم الزمني بدقة متناهية وفق معيار ISO 8601.</li>
                <li>تطابق مبالغ الضريبة مع النسبة النظامية المعتمدة (15%).</li>
                <li>الرقم الضريبي للمنشأة مسجل ومكون من 15 رقماً ويبدأ وينتهي بالرقم 3.</li>
              </ul>
            </div>
          </div>

        </div>
      )}

      {/* TAB 2: HISTORICAL Z-REPORTS ARCHIVE */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">سجلات الإقفالات اليومية السابقة</h3>
              <span className="text-xs text-slate-500 dark:text-slate-400">{visibleHistory.length} تقرير مؤرشف</span>
            </div>

            <div ref={historyTable.scrollRef} className="overflow-auto vlist-scroll" style={{ maxHeight: 'max(22rem, calc(100vh - 19rem))' }} data-testid="zhistory-scroll">
              <table className="w-full text-xs text-right">
                <thead className="sticky top-0 z-[3] bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 font-bold shadow-[0_1px_0_rgba(100,116,139,0.25)]">
                  <tr>
                    <th className="p-3">رقم التقرير</th>
                    <th className="p-3">النوع</th>
                    <th className="p-3">تاريخ الإقفال</th>
                    <th className="p-3">الكاشير</th>
                    <th className="p-3">عدد الفواتير</th>
                    <th className="p-3">نقدي</th>
                    <th className="p-3">شبكة</th>
                    <th className="p-3">الضريبة</th>
                    <th className="p-3">الإجمالي</th>
                    <th className="p-3 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
                  <VSpacer h={historyTable.padTop} />
                  {historyTable.visible.map((report) => (
                    <tr key={report.id} data-vkey={report.id} className="hover:bg-white/40 dark:hover:bg-slate-900/40 transition">
                      <td className="p-3 font-mono font-bold text-cyan-600 dark:text-cyan-400">{report.reportNumber}</td>
                      <td className="p-3">{report.kind === 'shift'
                        ? <span className="px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 font-bold text-[11px]">وردية</span>
                        : <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 font-bold text-[11px]">يومي</span>}</td>
                      <td className="p-3 font-mono text-slate-600 dark:text-slate-300" dir="ltr">{displayTs(report.closedAt)}</td>
                      <td className="p-3 font-bold text-slate-900 dark:text-white">{report.cashierName}</td>
                      <td className="p-3 font-mono">{report.invoicesCount}</td>
                      <td className="p-3 font-mono text-emerald-600 dark:text-emerald-400">
                        <span className="inline-flex items-center gap-1">{report.totalCash.toFixed(2)} <SaudiRiyalSymbol className="w-3 h-3" /></span>
                      </td>
                      <td className="p-3 font-mono text-blue-600 dark:text-blue-400">
                        <span className="inline-flex items-center gap-1">{report.totalCard.toFixed(2)} <SaudiRiyalSymbol className="w-3 h-3" /></span>
                      </td>
                      <td className="p-3 font-mono text-rose-600 dark:text-rose-400">
                        <span className="inline-flex items-center gap-1">{report.totalVat.toFixed(2)} <SaudiRiyalSymbol className="w-3 h-3" /></span>
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-900 dark:text-white">
                        <span className="inline-flex items-center gap-1">{report.grandTotal.toFixed(2)} <SaudiRiyalSymbol className="w-3.5 h-3.5" /></span>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedHistoricalReport(report)}
                          className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-cyan-600 dark:text-cyan-400 rounded-lg font-bold transition text-xs cursor-pointer inline-flex items-center gap-1"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>معاينة الرمز</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                  <VSpacer h={historyTable.padBottom} />
                </tbody>
              </table>
            </div>
          </div>

          {/* Historical modal preview */}
          {selectedHistoricalReport && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-lg w-full space-y-4">
                <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                    معاينة تقرير Z: {selectedHistoricalReport.reportNumber}
                  </h3>
                  <button 
                    onClick={() => setSelectedHistoricalReport(null)}
                    className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-bold"
                  >
                    ✕
                  </button>
                </div>
                
                <ZatcaQrCodeViewer
                  base64Payload={selectedHistoricalReport.base64Payload}
                  title={`تقرير إقفال #${selectedHistoricalReport.reportNumber}`}
                  subtitle={`أقفل بواسطة: ${selectedHistoricalReport.closedBy}`}
                />

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => {
                      if (onPrintZReport) onPrintZReport(selectedHistoricalReport);
                      setSelectedHistoricalReport(null);
                    }}
                    className="flex-1 py-3 bg-cyan-500 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>إعادة طباعة التقرير</span>
                  </button>
                  <button
                    onClick={() => setSelectedHistoricalReport(null)}
                    className="px-5 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl cursor-pointer"
                  >
                    إغلاق
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: CUSTOM ZATCA QR SIMULATOR & TESTER */}
      {activeTab === 'simulator' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <Sparkles className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              أداة اختبار وتوليد باركود الفاتورة الضريبية المبسطة (ZATCA Phase 1 Tester)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              يمكنك كتابة بيانات أي فاتورة يدوياً لتوليد رمز QR مشفر بنظام TLV والتحقق من توافقه الفوري مع تطبيق هيئة الزكاة.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">اسم المورد (Tag 1):</label>
                <input
                  type="text"
                  value={testSeller}
                  onChange={(e) => setTestSeller(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-bold outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">الرقم الضريبي VAT (Tag 2 - 15 رقماً):</label>
                <input
                  type="text"
                  value={testVat}
                  onChange={(e) => setTestVat(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-cyan-600 dark:text-cyan-400 font-mono font-bold outline-none focus:border-cyan-500"
                  dir="ltr"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">الإجمالي شامل الضريبة (Tag 4):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={testTotal}
                    onChange={(e) => setTestTotal(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono font-bold outline-none focus:border-cyan-500"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">مبلغ الضريبة 15% (Tag 5):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={testTax}
                    onChange={(e) => setTestTax(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-rose-600 dark:text-rose-400 font-mono font-bold outline-none focus:border-cyan-500"
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">التوقيت ISO 8601 (Tag 3):</label>
                <input
                  type="text"
                  value={testDate}
                  onChange={(e) => setTestDate(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-600 dark:text-slate-300 font-mono text-xs outline-none focus:border-cyan-500"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setTestDate(new Date().toISOString().slice(0, 19))}
                className="text-xs text-cyan-600 dark:text-cyan-400 font-bold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>تحديث التوقيت إلى اللحظة الحالية</span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-5">
            <ZatcaQrCodeViewer
              base64Payload={testInvoiceQrBase64}
              title="الرمز المولد للاختبار (Simulated QR)"
              subtitle="امسح الرمز بكاميرا الجوال أو تطبيق الزكاة للتحقق"
              size={180}
            />
          </div>
        </div>
      )}

    </div>
  );
}
