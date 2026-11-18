import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type FocusEvent } from 'react';
import DateField from './DateField';
import {
  FileText, Plus, Search, Printer, FileDown, Pencil, Trash2, Copy, ArrowLeftRight, X, Eye, Receipt, PackagePlus,
} from 'lucide-react';
import type { Customer, Product, ProductGroup, Quotation, QuotationItem, QuotationStatus } from '../types';
import { useVirtualRows, useGridCols, chunkRows } from '../utils/useVirtualRows';
import {
  DEFAULT_TERMS, STATUS_LABEL, addDaysYmd, calcQuotation, shownUnitPrice, netFromShown, isExpired, nextQuotationNumber, quotationHtml, quotationPrintSize,
  quotationThermalHtml, quotationPreviewCss, type QuotePaper,
} from '../utils/quotations';
import { localTimestamp } from '../utils/files';
import { exportHtmlAsPdf, printHtmlDocument, listOsPrinters, printThermalHtml, receiptModeOf, measureHtmlHeightMm, thermalDims, appFontCss, withAppFont, CONTINUOUS_PAPERS, previewPaperOn, visiblePreviewPaper, type PrintSettings, type AfterSaleMode } from '../utils/printing';
import type { OsPrinter } from '../storage/persistence';
import CustomerForm, { type CustomerDraft } from './CustomerForm';
import QuickProductModal from './QuickProductModal';
import ShareMenu from './ShareMenu';
import { shareDocument, type ShareTarget } from '../utils/share';
import { round2, GENERAL_CUSTOMER, customerLabel } from '../utils/invoiceMath';
import { checkDiscount, type DiscountRules } from '../utils/discountRules';
import { findQuotationByCode, useBarcodeScanner, scanCandidates, type ScanRequest } from '../utils/docScan';

export interface ConvertOptions { method: 'cash' | 'card'; credit: boolean; paid: number }

interface Props {
  /** الرقم التالي (عرض فقط) والحجز الفعلي عند الحفظ — تسلسل لا يتكرر */
  peekNumber?: () => string;
  allocateNumber?: () => string;
  quotations: Quotation[];
  setQuotations: (updater: (prev: Quotation[]) => Quotation[]) => void;
  /** الترخيص: false = وضع القراءة فقط (يعرض رسالته بنفسه) */
  canWrite?: () => boolean;
  customers: Customer[];
  products: Product[];
  taxRatePercent: number;
  /** أسعار الأصناف شاملة الضريبة؟ (بنود العرض تُخزَّن قبل الضريبة) */
  pricesIncludeTax?: boolean;
  /** قواعد الخصم من إعدادات التطبيق */
  discountRules?: DiscountRules;
  company: { name: string; nameEn?: string; vat: string; address?: string; shortAddress?: string; phone?: string; mobile?: string; email?: string; logoUrl?: string; footerInfo?: boolean };
  printSettings: PrintSettings;
  onChangePrintSettings?: (s: PrintSettings) => void;
  /** المقاس الذي تُفتح عليه معاينة الفواتير (إيصال / A4 / A5) — معاينة عرض السعر تبدأ عليه أيضاً */
  invoicePreviewPaper?: 'thermal' | 'A4' | 'A5';
  /** نفس آلية «بعد البيع» في الفواتير: إيصال/A4/A5 مباشرة، نافذة، PDF، أو بدون */
  afterSaleMode?: AfterSaleMode;
  /** إضافة عميل جديد من داخل عرض السعر (نفس بطاقة العملاء) — يعيد العميل المحفوظ */
  onAddCustomer?: (d: CustomerDraft) => Customer;
  /** مجموعات الأصناف (لبطاقة إضافة/تعديل الصنف من داخل العرض) */
  groups?: ProductGroup[];
  /** إضافة صنف جديد للأصناف من داخل العرض */
  onAddProduct?: (p: Product) => void;
  /** تعديل صنف موجود من داخل العرض */
  onUpdateProduct?: (p: Product) => void;
  notify: (msg: string) => void;
  onConvert: (q: Quotation, opts: ConvertOptions) => void;
  /** باركود عرض سعر مُسح من شاشة البيع */
  scan?: ScanRequest | null;
}

const STATUS_STYLE: Record<QuotationStatus, string> = {
  draft: 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30',
  sent: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  accepted: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  rejected: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  invoiced: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
};

const inp = 'w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-cyan-500';

const DEFAULT_CUSTOMER = GENERAL_CUSTOMER; // «عميل عام» — نفس الفواتير

const blank = (all: Quotation[], taxRate: number, pricesIncludeTax: boolean): Quotation => ({
  id: `qt-${Date.now()}`,
  number: nextQuotationNumber(all),
  date: localTimestamp(),
  validUntil: addDaysYmd(15),
  customerName: DEFAULT_CUSTOMER,
  items: [],
  discountType: 'fixed',
  discountValue: 0,
  taxRate,
  pricesIncludeTax,
  rawSubtotal: 0, discount: 0, subtotal: 0, tax: 0, total: 0,
  notes: '',
  terms: DEFAULT_TERMS,
  status: 'draft',
});

export default function QuotationsManager({
  quotations, setQuotations, customers, products, taxRatePercent, pricesIncludeTax, company, discountRules, printSettings, notify, onConvert,
  peekNumber, allocateNumber, onChangePrintSettings, invoicePreviewPaper, onAddCustomer, canWrite, scan, afterSaleMode,
  groups = [], onAddProduct, onUpdateProduct,
}: Props) {
  const [addingCustomer, setAddingCustomer] = useState(false);
  /** بطاقة الصنف من داخل العرض: صنف جديد أو تعديل صنف موجود */
  const [productCard, setProductCard] = useState<null | { mode: 'new' } | { mode: 'edit'; product: Product; lineId: string }>(null);
  const [afterSave, setAfterSave] = useState<Quotation | null>(null);
  const [search, setSearch] = useState('');
  // الافتراضي: عروض اليوم فقط — الأقدم تظهر بتغيير التاريخ أو بالبحث (البحث يشمل كل التواريخ)
  const todayYmd = localTimestamp().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(todayYmd);
  const [dateTo, setDateTo] = useState(todayYmd);
  const [osPrinters, setOsPrinters] = useState<OsPrinter[]>([]);
  useEffect(() => { void listOsPrinters().then(setOsPrinters); }, []);
  const quotePrinter = printSettings.quotationPrinter || printSettings.a4Printer || '';
  // الإيصال الحراري يذهب لطابعة الإيصالات
  const receiptPrinter = printSettings.receiptPrinter || '';
  // نافذة المعاينة: اختيار الورق (إيصال حراري / A4 أو المتصل مع الإبرية / A5) — يُحفظ آخر اختيار
  const [preview, setPreview] = useState<Quotation | null>(null);
  const [qPaper, setQPaperState] = useState<QuotePaper>(((printSettings.quotationPaper as string) === 'plain' ? 'A4' : printSettings.quotationPaper) || 'A4');
  const setQPaper = (p: QuotePaper) => { setQPaperState(p); onChangePrintSettings?.({ ...printSettings, quotationPaper: p }); };
  const [previewH, setPreviewH] = useState(600);
  // خط البرنامج (Tajawal) داخل المعاينة — نفس خط الطباعة وPDF
  const [fontCss, setFontCss] = useState('');
  useEffect(() => { if (preview && !fontCss) void appFontCss().then(setFontCss); }, [preview, fontCss]);
  // المقاس المحفوظ مخفي من الإعدادات → أول مقاس ظاهر
  // عند فتح المعاينة: نفس المقاس الذي تُفتح عليه معاينة الفاتورة (ثم يغيّره المستخدم من الأزرار كما يشاء)
  useEffect(() => {
    if (!preview) return;
    const v = visiblePreviewPaper(printSettings, invoicePreviewPaper || qPaper);
    if (v !== qPaper) setQPaperState(v);
  }, [preview?.id, printSettings.previewPapers]); // eslint-disable-line react-hooks/exhaustive-deps
  const dmPaper = printSettings.dotMatrix ? (printSettings.dotMatrixPaper || 'cf11') : null;
  const bigPaperLabel = dmPaper === 'cf11' || dmPaper === 'cf12' ? CONTINUOUS_PAPERS[dmPaper].label : 'A4';
  const thermalLabel = `إيصال ${thermalDims().page}مم`;
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setPreview(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);
  const [statusFilter, setStatusFilter] = useState<'all' | QuotationStatus | 'expired'>('all');
  const [editing, setEditing] = useState<Quotation | null>(null);
  // عند إضافة بند جديد: يتمرّر جدول البنود لآخره ليظهر البند المضاف
  const itemsBoxRef = useRef<HTMLDivElement | null>(null);
  const itemCount = editing?.items.length ?? 0;
  const editingId = editing?.id;
  const prevCount = useRef({ id: undefined as string | undefined, n: 0 });
  useEffect(() => {
    // فتح عرض آخر: لا تمرير — فقط عند إضافة بند للعرض نفسه
    if (prevCount.current.id === editingId && itemCount > prevCount.current.n && itemsBoxRef.current) itemsBoxRef.current.scrollTop = itemsBoxRef.current.scrollHeight;
    prevCount.current = { id: editingId, n: itemCount };
  }, [itemCount, editingId]);
  const [isNew, setIsNew] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [converting, setConverting] = useState<Quotation | null>(null);
  const [convMethod, setConvMethod] = useState<'cash' | 'card'>('cash');
  const [convCredit, setConvCredit] = useState(false);
  const [convPaid, setConvPaid] = useState('');

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return quotations.filter((x) => {
      if (statusFilter === 'expired' ? !isExpired(x) : statusFilter !== 'all' && x.status !== statusFilter) return false;
      if (!q) {
        const day = (x.date || '').slice(0, 10);
        if (dateFrom && day < dateFrom) return false;
        if (dateTo && day > dateTo) return false;
        return true;
      }
      return x.number.toLowerCase().includes(q) || x.customerName.toLowerCase().includes(q);
    });
  }, [quotations, search, statusFilter, dateFrom, dateTo]);
  // البطاقات داخل إطار بشريط تمرير، ويُرسم الظاهر منها فقط
  const gridCols = useGridCols({ base: 1, xl: 2 });
  const quoteRows = useMemo(() => chunkRows<Quotation>(list, gridCols), [list, gridCols]);
  const quotesTable = useVirtualRows<Quotation[]>(quoteRows, (r) => `${gridCols}:${r[0].id}`, { estimate: 170, overscan: 4, resetKey: `${search}|${statusFilter}|${dateFrom}|${dateTo}` });

  const totals = useMemo(
    () => (editing ? calcQuotation(editing.items, editing.discountType, editing.discountValue, editing.taxRate, editing.pricesIncludeTax) : null),
    [editing]
  );

  /* ---------------- تحرير ---------------- */
  const openNew = () => {
    const b = blank(quotations, taxRatePercent, !!pricesIncludeTax);
    setEditing(peekNumber ? { ...b, number: peekNumber() } : b);
    setIsNew(true); setProductQuery('');
  };
  const openEdit = (q: Quotation) => { setEditing({ ...q, items: q.items.map((i) => ({ ...i })) }); setIsNew(false); setProductQuery(''); };
  const patch = (p: Partial<Quotation>) => setEditing((e) => (e ? { ...e, ...p } : e));
  const patchItem = (id: string, p: Partial<QuotationItem>) =>
    setEditing((e) => (e ? { ...e, items: e.items.map((i) => (i.id === id ? { ...i, ...p } : i)) } : e));

  /** خيار في نتائج البحث: الصنف نفسه أو أحد مقاساته/عبواته */
  type Option = { key: string; product: Product; unit?: NonNullable<Product['units']>[number]; label: string; price: number };
  const addProduct = (o: Option) => {
    setEditing((e) => {
      if (!e) return e;
      const unitId = o.unit?.id;
      const existing = e.items.find((i) => i.productId === o.product.id && (i.unitId || undefined) === unitId);
      if (existing) return { ...e, items: e.items.map((i) => (i === existing ? { ...i, qty: i.qty + 1 } : i)) };
      const net = pricesIncludeTax ? Math.round((o.price / (1 + (e.taxRate || 0) / 100)) * 1e6) / 1e6 : o.price;
      return { ...e, items: [...e.items, {
        id: `ql-${Date.now()}-${e.items.length}`, productId: o.product.id, name: o.label, qty: 1, price: net,
        ...(o.unit ? { unitId: o.unit.id, unitName: o.unit.name, factor: o.unit.factor && o.unit.factor > 0 ? o.unit.factor : 1 } : {}),
      }] };
    });
    setProductQuery('');
  };
  const addFreeLine = () =>
    setEditing((e) => (e ? { ...e, items: [...e.items, { id: `ql-${Date.now()}-${e.items.length}`, name: '', qty: 1, price: 0 }] } : e));

  const [hi, setHi] = useState(0);
  useEffect(() => { setHi(0); }, [productQuery]);
  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, Math.max(0, matches.length - 1))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Escape') setProductQuery('');
    else if (e.key === 'Enter') {
      e.preventDefault();
      const code = productQuery.trim();
      // باركود الصنف أو باركود أحد مقاساته
      const codes = code ? scanCandidates(code) : [];
      const exact = code ? matches.find((o) => codes.some((c) => (o.unit ? o.unit.barcode === c : o.product.barcode === c || (o.product.barcodes || []).includes(c)))) : undefined;
      const pick = exact || matches[hi];
      if (pick) addProduct(pick); else if (code) notify('لا يوجد صنف مطابق');
    }
  };
  const selectAll = (e: FocusEvent<HTMLInputElement>) => { const t = e.currentTarget; setTimeout(() => t.select(), 0); };
  const stepQty = (id: string, d: number) =>
    setEditing((e) => (e ? { ...e, items: e.items.map((i) => (i.id === id ? { ...i, qty: Math.max(1, Math.round(((Number(i.qty) || 0) + d) * 1000) / 1000) } : i)) } : e));

  const matches = useMemo<Option[]>(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return [];
    // باركود مقروء بلوحة مفاتيح عربية: نطابقه أيضاً بعد التصحيح
    const codes = scanCandidates(productQuery.trim());
    const out: Option[] = [];
    for (const p of products) {
      if (p.disabled) continue;
      const units = (p.units || []).filter((u) => u.name && u.name.trim());
      const nameHit = p.nameAr.toLowerCase().includes(q) || (p.nameEn || '').toLowerCase().includes(q) || codes.some((c) => (p.barcode || '').includes(c) || (p.barcodes || []).includes(c));
      const unitHits = units.filter((u) => nameHit || u.name.toLowerCase().includes(q) || codes.some((c) => (u.barcode || '').includes(c)) || `${p.nameAr} ${u.name}`.toLowerCase().includes(q));
      if (!nameHit && !unitHits.length) continue;
      // الصنف الأساسي (إلا إذا كان «عنواناً فقط» للمقاسات)
      if (nameHit && !(units.length && p.sellBaseUnit === false)) out.push({ key: p.id, product: p, label: p.nameAr, price: p.price });
      // كل مقاس/عبوة نتيجة مستقلة
      for (const u of unitHits) out.push({ key: `${p.id}:${u.id}`, product: p, unit: u, label: `${p.nameAr} - ${u.name}`, price: u.price });
      if (out.length >= 40) break;
    }
    return out.slice(0, 40);
  }, [productQuery, products]);

  const save = (status?: QuotationStatus) => {
    if (canWrite && !canWrite()) return;
    if (!editing || !totals) return;
    if (editing.items.length === 0) { notify('أضف بنداً واحداً على الأقل'); return; }
    const noPrice = editing.items.filter((i) => !(Number(i.price) > 0));
    if (noPrice.length) { notify(`لا يمكن حفظ العرض — صنف بدون سعر: ${noPrice.map((i) => i.name.trim() || 'بند بلا اسم').join('، ')}`); return; }
    if (editing.items.some((i) => !i.name.trim() || i.qty <= 0)) { notify('راجع البنود: الاسم والكمية'); return; }
    const inc = !!editing.pricesIncludeTax;
    const dErr = checkDiscount(discountRules, { type: editing.discountType, value: editing.discountValue, scope: inc ? 'total' : 'subtotal', rawSubtotal: totals.rawSubtotal, rawTotalWithTax: inc ? totals.grossRaw || 0 : totals.rawSubtotal });
    if (dErr) { notify(`لا يمكن حفظ العرض — ${dErr}`); return; }
    const { grossRaw: _g, grossDiscount: _d, ...tot } = totals;
    const final: Quotation = { ...editing, customerName: editing.customerName.trim() || DEFAULT_CUSTOMER, ...tot, status: status ?? editing.status, ...(isNew && allocateNumber ? { number: allocateNumber() } : {}) };
    setQuotations((prev) => (isNew ? [final, ...prev] : prev.map((x) => (x.id === final.id ? final : x))));
    setEditing(null);
    notify(isNew ? `تم إنشاء ${final.number}` : `تم حفظ ${final.number}`);
    // نفس آلية «بعد البيع» في الفواتير (إعدادات الطابعات)
    const mode: AfterSaleMode = afterSaleMode || (printSettings.silent ? 'printA4' : 'ask');
    if (mode === 'print80') void doPrint(final, true, 'thermal');
    else if (mode === 'printA4') void doPrint(final, true, 'A4');
    else if (mode === 'printA5') void doPrint(final, true, 'A5');
    else if (mode === 'pdf') void doPdf(final, 'A4');
    else if (mode === 'ask') setAfterSave(final);
  };

  /* ---------------- إجراءات القائمة ---------------- */
  const setStatus = (id: string, status: QuotationStatus) =>
    setQuotations((prev) => prev.map((x) => (x.id === id ? { ...x, status } : x)));

  const duplicate = (q: Quotation) => {
    if (canWrite && !canWrite()) return;
    const dupNumber = allocateNumber ? allocateNumber() : '';
    setQuotations((prev) => [
      { ...q, id: `qt-${Date.now()}`, number: allocateNumber ? dupNumber : nextQuotationNumber(prev), date: localTimestamp(), validUntil: addDaysYmd(15), status: 'draft', invoiceId: undefined, invoiceNumber: undefined, items: q.items.map((i, n) => ({ ...i, id: `ql-${Date.now()}-${n}` })) },
      ...prev,
    ]);
    notify('تم نسخ العرض كمسودة جديدة');
  };

  const remove = (q: Quotation) => {
    if (window.confirm(`حذف عرض السعر ${q.number}؟`)) setQuotations((prev) => prev.filter((x) => x.id !== q.id));
  };

  const doPrint = async (q: Quotation, direct = false, paper: QuotePaper = qPaper) => {
    // direct: من نافذة ما بعد الحفظ — مباشرة للطابعة المحددة دون نافذة ويندوز
    const thermal = paper === 'thermal';
    const dev = thermal ? receiptPrinter : quotePrinter;
    const silent = (printSettings.silent || direct) && !!dev;
    const res = thermal
      ? await printThermalHtml((h, raster) => quotationThermalHtml(q, company, { heightMm: h, raster }), { deviceName: dev || undefined, silent, mode: receiptModeOf(printSettings) })
      : await printHtmlDocument(quotationHtml(q, company, { paper }), { silent, deviceName: dev || undefined, ...quotationPrintSize(paper) });
    notify(res.ok ? `تم إرسال العرض للطباعة${dev ? ' — ' + dev : ''}` : `لم تتم الطباعة${res.reason ? ' — ' + res.reason : ''}`);
  };
  /** الإيصال الحراري كـ PDF: بطول محتواه الفعلي */
  const thermalDoc = async (q: Quotation) => {
    const h = Math.max(60, (await measureHtmlHeightMm(await withAppFont(quotationThermalHtml(q, company)), thermalDims().page)) ?? 200);
    return { html: quotationThermalHtml(q, company, { heightMm: h }), h };
  };
  const doShare = async (q: Quotation, target: ShareTarget, paper: QuotePaper = qPaper) => {
    const cust = q.customerId ? customers.find((c) => c.id === q.customerId) : undefined;
    const doc = paper === 'thermal' ? await thermalDoc(q) : null;
    const r = await shareDocument({
      fileName: `${q.number}.pdf`, target,
      ...(doc ? { html: doc.html, pageSize: 'thermal' as const, heightMm: doc.h } : { html: quotationHtml(q, company, { full: true, paper: paper as 'A4' | 'A5' }), pageSize: paper === 'A5' ? 'A5' as const : 'A4' as const }),
      phone: q.customerPhone || cust?.phone, email: cust?.email, subject: `عرض سعر ${q.number} — ${company.name || ''}`,
      text: `عرض سعر رقم ${q.number} بمبلغ ${q.total.toFixed(2)} ريال — ${company.name || ''}`,
    });
    notify(r.message);
  };
  const doPdf = async (q: Quotation, paper: QuotePaper = qPaper) => {
    const html = paper === 'thermal' ? (await thermalDoc(q)).html : quotationHtml(q, company, { full: true, paper });
    if (await exportHtmlAsPdf(html, `${q.number}.pdf`)) notify('تم تصدير العرض');
  };
  /** HTML المعاينة: شكل الطباعة نفسه (الترويسة الجاهزة/الإبرية) داخل ورقة على الشاشة */
  const previewHtml = (q: Quotation, paper: QuotePaper) => {
    const html = paper === 'thermal' ? quotationThermalHtml(q, company) : quotationHtml(q, company, { paper });
    return html.replace('</head>', `<style>${fontCss}${quotationPreviewCss(paper)}</style></head>`);
  };
  const fitPreview = (e: { currentTarget: HTMLIFrameElement }) => {
    try { const d = e.currentTarget.contentDocument; if (d) setPreviewH(Math.max(300, d.documentElement.scrollHeight + 24)); } catch { /* تجاهل */ }
  };

  const startConvert = (q: Quotation) => { setConverting(q); setConvMethod('cash'); setConvCredit(false); setConvPaid(''); };

  /** مسح باركود عرض السعر المطبوع: يظهر العرض، وإن لم يُحوَّل بعد تُفتح نافذة تحويله لفاتورة مباشرة */
  const openScannedQuote = (code: string): boolean => {
    const q = findQuotationByCode(quotations, code);
    if (!q) return false;
    setSearch(q.number); setStatusFilter('all');
    if (q.status === 'invoiced') notify(`العرض ${q.number} حُوِّل إلى فاتورة سابقاً`);
    else if (!canWrite || canWrite()) startConvert(q);
    return true;
  };
  useEffect(() => {
    if (!scan) return;
    if (!openScannedQuote(scan.code)) notify(`لا يوجد عرض سعر بالرقم ${scan.code}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan?.ts]);
  useBarcodeScanner((code) => {
    if (editing || converting) return;
    if (!openScannedQuote(code)) notify(`لا يوجد عرض سعر بالرقم ${code}`);
  });
  const convPaidNum = Number(convPaid) || 0;
  const convError = !converting ? '' :
    converting.items.some((i) => !(Number(i.price) > 0)) ? 'يوجد صنف بدون سعر — عدّل العرض وأدخل السعر قبل التحويل لفاتورة' :
    convCredit && !converting.customerId ? 'البيع الآجل يتطلب عميلاً مسجلاً — عدّل العرض واختر العميل من القائمة' :
    convCredit && (convPaidNum < 0 || convPaidNum >= converting.total - 0.004) ? 'المبلغ المدفوع يجب أن يكون أقل من الإجمالي' : '';

  const confirmConvert = () => {
    if (!converting || convError) return;
    onConvert(converting, { method: convMethod, credit: convCredit, paid: convCredit ? round2(convPaidNum) : converting.total });
    setConverting(null);
  };

  /* ---------------- الواجهة ---------------- */
  const FILTERS: { id: typeof statusFilter; label: string }[] = [
    { id: 'all', label: 'الكل' }, { id: 'draft', label: 'مسودة' }, { id: 'sent', label: 'مُرسل' },
    { id: 'accepted', label: 'مقبول' }, { id: 'rejected', label: 'مرفوض' }, { id: 'expired', label: 'منتهي' }, { id: 'invoiced', label: 'محوَّل' },
  ];

  return (
    <div className="p-4 2xl:p-6 bg-slate-50 dark:bg-slate-950 text-right text-slate-800 dark:text-slate-100 h-full flex flex-col gap-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2"><FileText className="w-6 h-6 text-cyan-600 dark:text-cyan-400" /><span>عروض الأسعار</span></h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">أنشئ عرض سعر للعميل، اطبعه أو صدّره PDF، وحوّله إلى فاتورة عند الموافقة.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {window.ledger && (
            <label className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-slate-500" data-testid="quote-printer">
              <Printer className="w-4 h-4 text-cyan-600" /> طابعة العروض:
              <select
                value={printSettings.quotationPrinter || ''}
                onChange={(e) => onChangePrintSettings?.({ ...printSettings, quotationPrinter: e.target.value })}
                className="bg-transparent font-black text-slate-700 dark:text-slate-200 outline-none max-w-[200px]"
              >
                <option value="">{printSettings.a4Printer ? `طابعة A4 (${printSettings.a4Printer})` : 'الطابعة الافتراضية'}</option>
                {osPrinters.map((p) => <option key={p.name} value={p.name}>{p.displayName || p.name}</option>)}
              </select>
            </label>
          )}
          <button onClick={openNew} className="bg-cyan-600 hover:bg-cyan-700 text-white px-5 py-2.5 rounded-xl font-black flex items-center gap-2"><Plus className="w-5 h-5" /> عرض سعر جديد</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative basis-full" data-testid="quote-search">
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && findQuotationByCode(quotations, search)) { e.preventDefault(); openScannedQuote(search); } }} placeholder="بحث برقم العرض أو اسم العميل..." className={`${inp} pr-11 py-3`} />
          <Search className="w-5 h-5 text-slate-500 absolute right-4 top-3" />
        </div>
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500" data-testid="quote-dates">
          <span>من</span>
          <DateField value={dateFrom} onChange={(v) => setDateFrom(v)} className={`${inp} py-2.5 !w-40 font-mono`} />
          <span>إلى</span>
          <DateField value={dateTo} onChange={(v) => setDateTo(v)} className={`${inp} py-2.5 !w-40 font-mono`} />
          <button onClick={() => { setDateFrom(todayYmd); setDateTo(todayYmd); }} className={`px-3 py-2 rounded-lg border ${dateFrom === todayYmd && dateTo === todayYmd ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-500/40' : 'border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>اليوم</button>
          <button onClick={() => { setDateFrom(''); setDateTo(''); }} className={`px-3 py-2 rounded-lg border ${!dateFrom && !dateTo ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-500/40' : 'border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>كل التواريخ</button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setStatusFilter(f.id)} className={`px-3 py-2 rounded-xl text-xs font-bold border ${statusFilter === f.id ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-500/40' : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>{f.label}</button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="py-16 text-center text-slate-500 font-bold">{quotations.length === 0 ? 'لا توجد عروض أسعار بعد. اضغط «عرض سعر جديد» للبدء.' : (search.trim() ? 'لا توجد عروض مطابقة للبحث.' : 'لا توجد عروض في هذا التاريخ — غيّر التاريخ أو اختر «كل التواريخ» أو ابحث برقم العرض/اسم العميل.')}</div>
      ) : (
        <div ref={quotesTable.scrollRef} className="flex-1 min-h-[22rem] overflow-auto vlist-scroll px-1" data-testid="quotes-scroll">
          <div style={{ height: quotesTable.padTop }} aria-hidden />
          {quotesTable.visible.map((row) => (
          <div key={`${gridCols}:${row[0].id}`} data-vkey={`${gridCols}:${row[0].id}`} className="grid gap-4 pb-4" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
          {row.map((q) => {
            const expired = isExpired(q);
            return (
              <div key={q.id} className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono font-black text-cyan-700 dark:text-cyan-300">{q.number}</div>
                    <div className="font-black text-slate-900 dark:text-white mt-0.5">{customerLabel(q.customerName)}</div>
                    <div className="text-[11px] text-slate-500 font-bold mt-1">{q.date.slice(0, 10)} — صالح حتى <span className={expired ? 'text-rose-600 dark:text-rose-400' : ''}>{q.validUntil}</span>{expired && ' (منتهي)'}</div>
                  </div>
                  <div className="text-left shrink-0">
                    <div className="font-mono font-black text-xl text-slate-900 dark:text-white">{q.total.toFixed(2)}</div>
                    <span className={`inline-block mt-1 text-[11px] font-black px-2.5 py-0.5 rounded-full border ${STATUS_STYLE[q.status]}`}>{STATUS_LABEL[q.status]}{q.invoiceNumber ? ` ${q.invoiceNumber}` : ''}</span>
                  </div>
                </div>
                <div className="text-xs text-slate-500 font-semibold truncate">{q.items.map((i) => `${i.qty}× ${i.name}`).join('، ')}</div>
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200 dark:border-slate-800">
                  {q.status !== 'invoiced' && (
                    <select value={q.status} onChange={(e) => setStatus(q.id, e.target.value as QuotationStatus)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
                      {(['draft', 'sent', 'accepted', 'rejected'] as QuotationStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  )}
                  <button onClick={() => setPreview(q)} title="معاينة وطباعة (إيصال / A4 / A5)" data-testid="quote-preview-btn" className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"><Printer className="w-4 h-4" /></button>
                  <button onClick={() => doPdf(q)} title="PDF" className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"><FileDown className="w-4 h-4" /></button>
                  <ShareMenu onShare={(t) => doShare(q, t)} label="" up className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 flex items-center" />
                  <button onClick={() => (q.status === 'invoiced' ? setEditing({ ...q }) : openEdit(q))} title={q.status === 'invoiced' ? 'عرض' : 'تعديل'} className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700">{q.status === 'invoiced' ? <Eye className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}</button>
                  <button onClick={() => duplicate(q)} title="نسخ" className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"><Copy className="w-4 h-4" /></button>
                  {q.status !== 'invoiced' && (
                    <button onClick={() => startConvert(q)} className="px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-black flex items-center gap-1.5"><ArrowLeftRight className="w-4 h-4" /> تحويل إلى فاتورة</button>
                  )}
                  <button onClick={() => remove(q)} title="حذف" className="p-2 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 mr-auto"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            );
          })}
          </div>
          ))}
          <div style={{ height: quotesTable.padBottom }} aria-hidden />
        </div>
      )}

      {addingCustomer && onAddCustomer && (
        <CustomerForm
          zIndex="z-[9999]"
          title="إضافة عميل جديد"
          submitLabel="حفظ واختيار العميل"
          onCancel={() => setAddingCustomer(false)}
          onSubmit={(d) => {
            const c = onAddCustomer(d);
            patch({ customerId: c.id, customerName: c.name, customerPhone: c.phone });
            setAddingCustomer(false);
            notify(`تمت إضافة العميل ${c.name}`);
          }}
        />
      )}

      {productCard && (
        <QuickProductModal
          key={productCard.mode === 'edit' ? productCard.product.id : 'new-product'}
          editing={productCard.mode === 'edit' ? productCard.product : undefined}
          hideAddToCart
          groups={groups}
          products={products}
          pricesIncludeTax={pricesIncludeTax}
          taxRatePercent={taxRatePercent}
          onClose={() => setProductCard(null)}
          onSave={(p) => {
            if (productCard.mode === 'edit') {
              onUpdateProduct?.(p);
              // السطر يأخذ الاسم والسعر الجديدين (مع مراعاة المقاس إن وُجد)
              setEditing((e) => (e ? { ...e, items: e.items.map((i) => {
                if (i.id !== productCard.lineId) return i;
                const u = (p.units || []).find((x) => x.id === i.unitId);
                const shown = u ? u.price : p.price;
                const net = pricesIncludeTax ? round2(shown / (1 + (e.taxRate || 0) / 100)) : shown;
                return { ...i, name: u ? `${p.nameAr} - ${u.name}` : p.nameAr, price: net };
              }) } : e));
              notify(`تم تعديل الصنف ${p.nameAr}`);
            } else {
              onAddProduct?.(p);
              addProduct({ key: p.id, product: p, label: p.nameAr, price: p.price });
              notify(`تمت إضافة الصنف ${p.nameAr} وإدخاله في العرض`);
            }
            setProductCard(null);
          }}
        />
      )}

      {/* ---------- نافذة التحرير ---------- */}
      {editing && totals && (
        <div className="fixed inset-0 z-[9997] bg-black/70 flex items-center justify-center p-3">
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 w-full max-w-4xl max-h-[94vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden" data-testid="quote-editor">
            <div className="shrink-0 flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-black text-lg text-cyan-700 dark:text-cyan-300">{isNew ? `عرض سعر جديد — ${editing.number}` : `${editing.status === 'invoiced' ? 'عرض' : 'تعديل'} ${editing.number}`}</h3>
              <button onClick={() => setEditing(null)}><X className="w-5 h-5 text-slate-500 dark:text-slate-400" /></button>
            </div>
            {/* الجسم يتمرّر داخل النافذة — الرأس والأزرار ثابتة مهما كثرت البنود */}
            <div className="flex-1 min-h-0 overflow-y-auto" data-testid="quote-editor-body">
            <fieldset disabled={editing.status === 'invoiced'} className="p-4 space-y-4 min-w-0 border-0">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400">العميل</label>
                    {onAddCustomer && editing.status !== 'invoiced' && (
                      <button type="button" onClick={() => setAddingCustomer(true)} className="text-xs font-black text-cyan-700 dark:text-cyan-300 hover:underline flex items-center gap-1" data-testid="quote-add-customer">
                        <Plus className="w-3.5 h-3.5" /> عميل جديد
                      </button>
                    )}
                  </div>
                  <select
                    value={editing.customerId || ''}
                    onChange={(e) => {
                      const c = customers.find((x) => x.id === e.target.value);
                      patch(c ? { customerId: c.id, customerName: c.name, customerPhone: c.phone } : { customerId: undefined, customerName: DEFAULT_CUSTOMER, customerPhone: '' });
                    }}
                    className={inp}
                  >
                    <option value="">{DEFAULT_CUSTOMER} (افتراضي)</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input value={editing.customerName} onChange={(e) => patch({ customerName: e.target.value, customerId: undefined })} placeholder="اسم العميل (اختياري — الافتراضي: عميل عام)" className={`${inp} mt-2`} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400">الجوال</label>
                  <input value={editing.customerPhone || ''} onChange={(e) => patch({ customerPhone: e.target.value })} className={`${inp} font-mono`} dir="ltr" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400">صالح حتى</label>
                  <DateField value={editing.validUntil} onChange={(v) => patch({ validUntil: v })} className={`${inp} font-mono`} />
                </div>
              </div>

              <div className="relative rounded-2xl border-2 border-cyan-500/40 bg-cyan-50/60 dark:bg-cyan-950/20 p-3" data-testid="quote-search-box">
                <label className="text-sm font-black text-cyan-800 dark:text-cyan-200 flex items-center gap-1.5 mb-1.5"><Search className="w-4 h-4" /> إضافة صنف للعرض</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-5 h-5 text-cyan-600 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input value={productQuery} onChange={(e) => setProductQuery(e.target.value)} onKeyDown={onSearchKey}
                      placeholder="اكتب اسم الصنف أو المقاس أو امسح الباركود — ↑↓ للتنقل و Enter للإضافة"
                      className="w-full h-12 bg-white dark:bg-slate-950 border-2 border-cyan-500/60 rounded-xl pr-11 pl-4 text-base font-bold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 placeholder:font-semibold placeholder:text-sm focus:outline-none focus:border-cyan-600 focus:ring-4 focus:ring-cyan-500/15"
                      data-testid="quote-product-search" autoComplete="off" />
                  </div>
                  {onAddProduct && (
                    <button type="button" onClick={() => setProductCard({ mode: 'new' })} data-testid="quote-new-product" title="إضافة صنف جديد للأصناف وإدخاله في العرض"
                      className="shrink-0 px-4 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-black flex items-center gap-1.5"><PackagePlus className="w-4 h-4" /> صنف جديد</button>
                  )}
                  <button onClick={addFreeLine} className="shrink-0 px-4 h-12 rounded-xl bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm font-black">+ بند حر</button>
                </div>
                {productQuery.trim() && matches.length === 0 && <div className="mt-2 text-sm font-bold text-slate-500">لا توجد أصناف مطابقة</div>}
                {matches.length > 0 && (
                  <div className="absolute z-30 left-3 right-3 mt-1 max-h-80 overflow-y-auto bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xl" data-testid="quote-matches">
                    {matches.map((o, idx) => (
                      <button key={o.key} type="button" onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setHi(idx)} onClick={() => addProduct(o)}
                        className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-[15px] font-bold text-right border-b border-slate-100 dark:border-slate-800 last:border-0 ${idx === hi ? 'bg-cyan-500/15 text-cyan-900 dark:text-cyan-100' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="truncate">{o.product.nameAr}</span>
                          {o.unit && <span className="shrink-0 text-xs font-black px-2 py-0.5 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">{o.unit.name}</span>}
                        </span>
                        <span className="shrink-0 font-mono text-cyan-700 dark:text-cyan-300">{o.price.toFixed(2)}{pricesIncludeTax ? ' شامل' : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* جدول البنود بارتفاع محدود وتمرير داخلي (رأسه ثابت) — يبقى الإجمالي والأزرار ظاهرة */}
              <div ref={itemsBoxRef} className="overflow-auto max-h-[40vh] rounded-xl border border-slate-200 dark:border-slate-800" data-testid="quote-items-box">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 text-xs shadow-[0_1px_0_rgba(0,0,0,0.06)]"><tr><th className="p-2 text-right">الصنف / الوصف</th><th className="p-2 w-40">الكمية</th><th className="p-2 w-32">السعر ({editing.pricesIncludeTax ? 'شامل الضريبة' : 'قبل الضريبة'})</th><th className="p-2 w-28">الإجمالي</th><th className="w-10" /></tr></thead>
                  <tbody>
                    {editing.items.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-500 font-bold">لم تُضف أي بنود بعد</td></tr>}
                    {editing.items.map((it) => (
                      <tr key={it.id} className={`border-t border-slate-200 dark:border-slate-800 ${!(Number(it.price) > 0) ? 'bg-rose-50 dark:bg-rose-950/30' : ''}`} data-noprice={!(Number(it.price) > 0) || undefined}>
                        <td className="p-1.5"><input value={it.name} onChange={(e) => patchItem(it.id, { name: e.target.value })} onFocus={selectAll} className={inp} /></td>
                        <td className="p-1.5">
                          <div className="flex items-center gap-1" data-testid="qty-ctl">
                            <button type="button" onClick={() => stepQty(it.id, 1)} title="زيادة الكمية" className="shrink-0 w-9 h-10 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white flex items-center justify-center"><Plus className="w-4 h-4" /></button>
                            <input type="number" min="0" step="any" value={it.qty} onChange={(e) => patchItem(it.id, { qty: Number(e.target.value) })} onFocus={selectAll} className={`${inp} font-mono text-center px-1`} />
                            <button type="button" onClick={() => stepQty(it.id, -1)} disabled={it.qty <= 1} title="إنقاص الكمية" className="shrink-0 w-9 h-10 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 font-black text-lg disabled:opacity-40">−</button>
                          </div>
                        </td>
                        <td className="p-1.5"><input type="number" min="0" step="0.01" value={editing.pricesIncludeTax ? shownUnitPrice(it.price, editing.taxRate, true) : it.price} onChange={(e) => patchItem(it.id, { price: netFromShown(Number(e.target.value), editing.taxRate, editing.pricesIncludeTax) })} onFocus={selectAll} className={`${inp} font-mono text-center`} /></td>
                        <td className="p-1.5 text-center font-mono font-bold">{(it.qty * shownUnitPrice(it.price, editing.taxRate, editing.pricesIncludeTax)).toFixed(2)}</td>
                        <td className="p-1.5">
                          <div className="flex items-center gap-0.5">
                            {onUpdateProduct && it.productId && products.some((p) => p.id === it.productId) && (
                              <button type="button" title="تعديل الصنف في الأصناف (الاسم، السعر، التكلفة...)" data-testid="quote-edit-product"
                                onClick={() => { const p = products.find((x) => x.id === it.productId); if (p) setProductCard({ mode: 'edit', product: p, lineId: it.id }); }}
                                className="text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10 rounded-lg p-1"><Pencil className="w-3.5 h-3.5" /></button>
                            )}
                            <button onClick={() => setEditing((e) => (e ? { ...e, items: e.items.filter((x) => x.id !== it.id) } : e))} className="text-rose-600 dark:text-rose-400 p-1"><X className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400">ملاحظات</label>
                  <textarea value={editing.notes || ''} onChange={(e) => patch({ notes: e.target.value })} rows={2} className={inp} />
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400">الشروط والأحكام</label>
                  <textarea value={editing.terms || ''} onChange={(e) => patch({ terms: e.target.value })} rows={3} className={inp} />
                </div>
                <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-2 text-sm font-bold">
                  <label className="flex items-center gap-2 text-xs cursor-pointer select-none" data-testid="quote-incl">
                    <input type="checkbox" checked={!!editing.pricesIncludeTax} onChange={(e) => patch({ pricesIncludeTax: e.target.checked })} className="w-4 h-4 accent-cyan-600" />
                    <span className="text-slate-600 dark:text-slate-300">الأسعار شاملة الضريبة</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 dark:text-slate-400 text-xs">الخصم{editing.pricesIncludeTax ? ' (شامل)' : ''}</span>
                    <input type="number" min="0" step="0.01" value={editing.discountValue || ''} onChange={(e) => patch({ discountValue: Number(e.target.value) })} className={`${inp} font-mono w-28`} />
                    <select value={editing.discountType} onChange={(e) => patch({ discountType: e.target.value as 'fixed' | 'percent' })} className={`${inp} w-24`}>
                      <option value="fixed">مبلغ</option><option value="percent">٪</option>
                    </select>
                  </div>
                  {(() => {
                    const inc = !!editing.pricesIncludeTax;
                    const gross = inc ? totals.grossRaw || 0 : totals.rawSubtotal;
                    const disc = inc ? totals.grossDiscount || 0 : totals.discount;
                    return (
                      <>
                        {disc > 0 && <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">المجموع{inc ? ' (شامل)' : ''}</span><span className="font-mono">{gross.toFixed(2)}</span></div>}
                        {disc > 0 && <div className="flex justify-between text-amber-600 dark:text-amber-400"><span>الخصم</span><span className="font-mono">- {disc.toFixed(2)}</span></div>}
                        <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">غير شامل الضريبة</span><span className="font-mono">{totals.subtotal.toFixed(2)}</span></div>
                      </>
                    );
                  })()}
                  <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">الضريبة ({editing.taxRate}%)</span><span className="font-mono">{totals.tax.toFixed(2)}</span></div>
                  <div className="flex justify-between text-lg font-black text-cyan-700 dark:text-cyan-300 border-t border-slate-200 dark:border-slate-800 pt-2"><span>الإجمالي</span><span className="font-mono">{totals.total.toFixed(2)}</span></div>
                </div>
              </div>
            </fieldset>
            </div>
            <div className="shrink-0 p-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2 justify-end">
              <span className="me-auto text-sm font-black text-cyan-700 dark:text-cyan-300" data-testid="quote-footer-total">{editing.items.length} بند · الإجمالي <span className="font-mono">{totals.total.toFixed(2)}</span></span>
              <button onClick={() => setEditing(null)} className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-sm">{editing.status === 'invoiced' ? 'إغلاق' : 'إلغاء'}</button>
              {editing.status !== 'invoiced' && (
                <>
                  <button onClick={() => save()} className="px-5 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 font-black text-sm">حفظ</button>
                  <button onClick={() => save('sent')} className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-black text-sm">حفظ وتعليمه «مُرسل»</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------- معاينة عرض السعر — بنفس أسلوب معاينة الفواتير ---------- */}
      {preview && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[9999] overflow-y-auto p-4 sm:p-6 flex flex-col items-center justify-start" dir="rtl"
          onClick={(e) => { if (e.target === e.currentTarget) setPreview(null); }} data-testid="quote-preview">
          <div className="bg-slate-900 border border-slate-700 text-white px-3.5 py-3 rounded-2xl mb-4 max-w-[900px] w-full flex flex-col items-center gap-2.5 shadow-2xl" data-testid="quote-preview-bar">
            <div className="text-center leading-tight">
              <span className="block text-white font-black text-sm">معاينة الطباعة — عرض سعر <span className="font-mono">#{preview.number}</span></span>
              <span className="text-[11px] text-slate-400">الطابعة: {(qPaper === 'thermal' ? receiptPrinter : quotePrinter) || 'الافتراضية في ويندوز'}{qPaper === 'thermal' ? ' (طابعة الإيصالات)' : ''}</span>
            </div>
            <div className="flex items-center justify-center gap-2 flex-nowrap w-full overflow-x-auto">
              <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs font-bold shrink-0" data-testid="quote-paper">
                {([['thermal', thermalLabel], ['A4', bigPaperLabel], ['A5', 'A5']] as [QuotePaper, string][]).filter(([k]) => previewPaperOn(printSettings, k)).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setQPaper(k)} data-testid={`quote-paper-${k}`}
                    className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${qPaper === k ? 'bg-cyan-500 text-slate-950 font-black shadow' : 'text-slate-300 hover:text-white'}`}>
                    {k === 'thermal' ? <Receipt className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => void doPrint(preview, false)} data-testid="quote-preview-print"
                title={(qPaper === 'thermal' ? receiptPrinter : quotePrinter) || 'الطابعة الافتراضية'}
                className="shrink-0 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-xl text-xs cursor-pointer shadow-lg shadow-cyan-500/20 flex items-center gap-1.5 active:scale-95 transition">
                <Printer className="w-4 h-4" />
                <span className="max-w-[11rem] truncate">طباعة{(qPaper === 'thermal' ? receiptPrinter : quotePrinter) ? ` ← ${qPaper === 'thermal' ? receiptPrinter : quotePrinter}` : ''}</span>
              </button>
              <div className="shrink-0"><ShareMenu onShare={(t) => doShare(preview, t)} /></div>
              <button type="button" onClick={() => void doPdf(preview)}
                className="shrink-0 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-black rounded-xl text-xs cursor-pointer flex items-center gap-1.5 active:scale-95 transition whitespace-nowrap">
                <FileDown className="w-4 h-4" /><span>حفظ PDF</span>
              </button>
              <button type="button" onClick={() => setPreview(null)} data-testid="quote-preview-close" title="إغلاق المعاينة (Esc)"
                className="shrink-0 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold rounded-xl text-xs cursor-pointer border border-slate-700 transition flex items-center gap-1 whitespace-nowrap">
                <X className="w-4 h-4" /><span>إغلاق</span>
              </button>
            </div>
          </div>
          <div className="w-full max-w-[900px] flex justify-center pb-8">
            <iframe key={`${preview.id}-${qPaper}`} title="معاينة عرض السعر" srcDoc={previewHtml(preview, qPaper)} onLoad={fitPreview} data-testid="quote-preview-frame"
              className="block w-full border-0 bg-transparent" style={{ height: previewH, colorScheme: 'light' }} />
          </div>
        </div>
      )}

      {/* ---------- نافذة التحويل لفاتورة ---------- */}
      {afterSave && (
        <div className="fixed inset-0 z-[9998] bg-black/60 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setAfterSave(null); }} data-testid="quote-after-save">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4 text-right" dir="rtl">
            <div>
              <h3 className="font-black text-lg text-slate-900 dark:text-white">تم حفظ عرض السعر {afterSave.number}</h3>
              <p className="text-sm text-slate-500 font-semibold">{customerLabel(afterSave.customerName)} — الإجمالي <span className="font-mono font-black">{afterSave.total.toFixed(2)}</span></p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => { void doPrint(afterSave, true); setAfterSave(null); }} className="py-3 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-black text-sm flex flex-col items-center justify-center gap-0.5" data-testid="after-print" title={(qPaper === 'thermal' ? receiptPrinter : quotePrinter) || ''}><span className="flex items-center gap-1.5"><Printer className="w-4 h-4" /> طباعة</span><span className="text-[10px] font-bold opacity-90">{qPaper === 'thermal' ? thermalLabel : qPaper === 'A5' ? 'A5' : bigPaperLabel}</span></button>
              <button onClick={() => { setPreview(afterSave); setAfterSave(null); }} className="py-3 rounded-xl bg-slate-200 dark:bg-slate-800 font-black text-sm flex items-center justify-center gap-1.5" data-testid="after-preview"><Eye className="w-4 h-4" /> معاينة</button>
              <button onClick={() => { void doPdf(afterSave); }} className="py-3 rounded-xl bg-slate-200 dark:bg-slate-800 font-black text-sm flex items-center justify-center gap-1.5"><FileDown className="w-4 h-4" /> PDF</button>
            </div>
            <ShareMenu onShare={(t) => doShare(afterSave, t)} label="مشاركة (واتساب / بريد)" className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm flex items-center justify-center gap-1.5" />
            <button onClick={() => setAfterSave(null)} className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-sm">إغلاق</button>
          </div>
        </div>
      )}

      {converting && (
        <div className="fixed inset-0 z-[9998] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-950 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <span className="font-black text-violet-700 dark:text-violet-300">تحويل {converting.number} إلى فاتورة</span>
              <button onClick={() => setConverting(null)}><X className="w-5 h-5 text-slate-500 dark:text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex justify-between bg-slate-50 dark:bg-slate-950 rounded-xl p-3 border border-slate-200 dark:border-slate-800"><span className="text-xs font-bold text-slate-500 dark:text-slate-400">{customerLabel(converting.customerName)}</span><span className="font-mono font-black text-xl">{converting.total.toFixed(2)}</span></div>
              <div className="flex gap-2">
                <button onClick={() => setConvMethod('cash')} className={`flex-1 py-2 rounded-xl font-bold text-sm border ${convMethod === 'cash' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-300' : 'border-slate-300 dark:border-slate-700'}`}>نقدي</button>
                <button onClick={() => setConvMethod('card')} className={`flex-1 py-2 rounded-xl font-bold text-sm border ${convMethod === 'card' ? 'bg-blue-500/20 border-blue-500 text-blue-700 dark:text-blue-300' : 'border-slate-300 dark:border-slate-700'}`}>شبكة</button>
              </div>
              <label className="flex items-center gap-2 text-sm font-bold cursor-pointer"><input type="checkbox" checked={convCredit} onChange={(e) => setConvCredit(e.target.checked)} /> بيع آجل / دفع جزئي (يُسجَّل المتبقي على العميل)</label>
              {convCredit && (
                <input type="number" min="0" step="0.01" value={convPaid} onChange={(e) => setConvPaid(e.target.value)} placeholder="المبلغ المدفوع الآن (0 = آجل بالكامل)" className={`${inp} font-mono`} dir="ltr" />
              )}
              {convError && <p className="text-xs font-bold text-amber-600 dark:text-amber-400">{convError}</p>}
              <p className="text-[11px] text-slate-500 font-bold">تُنشأ الفاتورة بتاريخ اليوم وتظهر في سجل المبيعات، ويُقفل العرض بعد التحويل.</p>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex gap-2">
              <button onClick={() => setConverting(null)} className="px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-sm">إلغاء</button>
              <button disabled={!!convError} onClick={confirmConvert} className="flex-1 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-black disabled:opacity-40">إنشاء الفاتورة</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
