import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualRows, VSpacer } from '../utils/useVirtualRows';
import { beepError } from '../utils/beep';
import DateField from './DateField';
import DatePeriodFilter, { defaultPeriod, inPeriod } from './DatePeriodFilter';
import { latinBarcodeKeyDown } from '../utils/docScan';
import { Undo2, Plus, Search, Trash2, X, Printer, FileDown, Eye, ScanLine, AlertTriangle } from 'lucide-react';
import { purchaseHtml } from '../utils/purchaseSheet';
import { exportHtmlAsPdf, printHtmlDocument, type PrintSettings } from '../utils/printing';
import type { PurchaseInvoice, PurchaseReturn, Supplier, Product } from '../types';
import SaudiRiyalSymbol from './SaudiRiyalSymbol';
import ProductPicker from './ProductPicker';

interface Props {
  returns: PurchaseReturn[];
  purchases: PurchaseInvoice[];
  suppliers: Supplier[];
  products: Product[];
  taxRatePercent?: number;
  company?: { name: string; nameEn?: string; vat: string; address?: string; shortAddress?: string; phone?: string; mobile?: string; email?: string; logoUrl?: string; footerInfo?: boolean };
  printSettings?: PrintSettings;
  userName?: string;
  onAdd: (r: PurchaseReturn) => void;
  onDelete: (id: string) => void;
  notify?: (msg: string) => void;
}

/** سطر أثناء الإدخال: الكمية والسعر بوحدة الشراء */
interface Line {
  key: string;
  productId: string;
  productName: string;
  unitName: string;
  factor: number;
  qty: number;
  price: number;
  /** الحد الأقصى المسموح (عند الإرجاع من فاتورة) */
  max?: number;
}

const REASONS = ['تالف', 'منتهي الصلاحية', 'خطأ في التوريد (صنف أو كمية)', 'عيب مصنعي', 'فائض عن الحاجة', 'أخرى'];
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const todayYmd = () => {
  const d = new Date(); const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const field = 'w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-rose-500 focus:outline-none';
const lineKey = (productId: string, unitName: string, factor: number) => `${productId}|${unitName}|${factor}`;
const selectAll = (e: React.FocusEvent<HTMLInputElement>) => { const t = e.currentTarget; setTimeout(() => t.select(), 0); };

export default function PurchaseReturnsManager({
  returns, purchases, suppliers, products, taxRatePercent = 15, company, printSettings, userName, onAdd, onDelete, notify,
}: Props) {
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState(defaultPeriod); // الافتراضي: مرتجعات اليوم
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<PurchaseReturn | null>(null);
  const [confirmDel, setConfirmDel] = useState<PurchaseReturn | null>(null);

  // ---- نموذج المرتجع ----
  const [supplierId, setSupplierId] = useState('');
  const [source, setSource] = useState<'invoice' | 'free'>('invoice');
  const [purchaseId, setPurchaseId] = useState('');
  const [date, setDate] = useState(todayYmd());
  const [reason, setReason] = useState(REASONS[0]);
  const [reasonNote, setReasonNote] = useState('');
  const [taxable, setTaxable] = useState(true);
  const [inclusive, setInclusive] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState('');
  const [pickId, setPickId] = useState('');
  const [scan, setScan] = useState('');
  const scanRef = useRef<HTMLInputElement>(null);
  // أي تعديل على الأسطر يزيل رسالة الخطأ السابقة
  useEffect(() => { setError(''); }, [lines]);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const supplierPurchases = useMemo(() => purchases.filter((p) => p.supplierId === supplierId), [purchases, supplierId]);
  const purchase = purchases.find((p) => p.id === purchaseId);

  /** ما أُرجع سابقاً من فاتورة الشراء لكل (صنف + وحدة) */
  const returnedFrom = (pid: string) => {
    const m = new Map<string, number>();
    for (const r of returns) if (r.purchaseId === pid) for (const it of r.items) {
      const k = lineKey(it.productId, it.unitName || 'حبة', it.factor || 1);
      m.set(k, (m.get(k) || 0) + it.qty);
    }
    return m;
  };

  const reset = () => {
    setSupplierId(''); setSource('invoice'); setPurchaseId(''); setDate(todayYmd()); setReason(REASONS[0]); setReasonNote('');
    setTaxable(true); setInclusive(false); setLines([]); setError(''); setPickId(''); setScan('');
  };

  const loadPurchase = (pid: string) => {
    setPurchaseId(pid);
    setError('');
    const p = purchases.find((x) => x.id === pid);
    if (!p) { setLines([]); return; }
    setTaxable((p.vat ?? 0) > 0 || p.vat === undefined);
    setInclusive(!!p.pricesInclusive);
    const done = returnedFrom(pid);
    // خصم فاتورة الشراء: الإرجاع بالسعر بعد الخصم
    const gross = p.items.reduce((s, it) => s + (it.total || 0), 0);
    const discF = p.discount && gross > 0 ? (gross - p.discount) / gross : 1;
    // الكمية المتبقية القابلة للإرجاع — تبدأ بصفر ويحدد المستخدم ما يرجعه
    const agg = new Map<string, Line>();
    for (const it of p.items) {
      const unit = it.unitName || 'حبة';
      const f = it.factor || 1;
      const k = lineKey(it.productId, unit, f);
      const prev = agg.get(k);
      if (prev) { prev.max = (prev.max || 0) + it.qty; continue; }
      agg.set(k, { key: k, productId: it.productId, productName: it.productName, unitName: unit, factor: f, qty: 0, price: discF === 1 ? it.price : Math.round(it.price * discF * 10000) / 10000, max: it.qty });
    }
    setLines([...agg.values()].map((l) => ({ ...l, max: r2((l.max || 0) - (done.get(l.key) || 0)) })));
  };

  const addFree = (id: string, unitIdx = -1) => {
    const p = productById.get(id);
    if (!p) return;
    const u = unitIdx >= 0 ? p.units?.[unitIdx] : undefined;
    const unit = u?.name || 'حبة';
    const f = u?.factor && u.factor > 0 ? u.factor : 1;
    const k = lineKey(p.id, unit, f);
    setLines((ls) => {
      const ex = ls.find((l) => l.key === k);
      if (ex) return ls.map((l) => (l.key === k ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { key: k, productId: p.id, productName: p.nameAr, unitName: unit, factor: f, qty: 1, price: r2((p.cost || 0) * f) }];
    });
    setPickId('');
  };

  const onScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') { latinBarcodeKeyDown(e); return; }
    const code = scan.trim();
    if (!code) return;
    let hit: { p: Product; idx: number } | undefined;
    for (const p of products) {
      if ((p.barcode || '').trim() === code || (p.barcodes || []).includes(code)) { hit = { p, idx: -1 }; break; }
      const idx = (p.units || []).findIndex((u) => (u.barcode || '').trim() === code);
      if (idx >= 0) { hit = { p, idx }; break; }
    }
    if (hit) {
      if (source === 'invoice') {
        // من الفاتورة: يزيد كمية السطر المطابق بدل إضافة سطر جديد
        const k = lines.find((l) => l.productId === hit!.p.id)?.key;
        if (k) setLines((ls) => ls.map((l) => (l.key === k ? { ...l, qty: Math.min(l.max ?? Infinity, l.qty + 1) } : l)));
        else setError(`الصنف «${hit.p.nameAr}» غير موجود في فاتورة الشراء المختارة`);
      } else addFree(hit.p.id, hit.idx);
    } else { beepError(); setError('لم يُعثر على صنف بهذا الباركود'); }
    setScan('');
  };

  const active = lines.filter((l) => l.qty > 0);
  const sum = r2(active.reduce((s, l) => s + l.qty * l.price, 0));
  const rate = taxable ? taxRatePercent / 100 : 0;
  const totals = !rate
    ? { subtotal: sum, vat: 0, total: sum }
    : inclusive
      ? { subtotal: r2(sum / (1 + rate)), vat: r2(sum - sum / (1 + rate)), total: sum }
      : { subtotal: sum, vat: r2(sum * rate), total: r2(sum * (1 + rate)) };

  /** تحذير المخزون: الكمية المرتجعة أكبر من المتوفر */
  const stockWarnings = active
    .map((l) => ({ l, stock: productById.get(l.productId)?.stock ?? 0 }))
    .filter(({ l, stock }) => l.qty * l.factor > stock + 1e-9);

  const nextNumber = () => {
    const max = returns.reduce((m, r) => Math.max(m, Number(String(r.number).replace(/\D/g, '')) || 0), 0);
    return `PR-${String(max + 1).padStart(5, '0')}`;
  };

  const save = () => {
    setError('');
    if (!supplierId) return setError('اختر المورد');
    if (source === 'invoice' && !purchaseId) return setError('اختر فاتورة الشراء أو غيّر المصدر إلى «بدون فاتورة»');
    if (!active.length) return setError('حدد كمية صنف واحد على الأقل للإرجاع');
    const over = active.find((l) => l.max !== undefined && l.qty > l.max + 1e-9);
    if (over) return setError(`كمية «${over.productName}» أكبر من المتبقي في الفاتورة (${over.max})`);
    const zeroPrice = active.find((l) => !(l.price > 0));
    if (zeroPrice) return setError(`حدد سعر «${zeroPrice.productName}»`);
    const sup = suppliers.find((s) => s.id === supplierId);
    const r: PurchaseReturn = {
      id: `pr-${Date.now()}`,
      number: nextNumber(),
      date,
      supplierId,
      supplierName: sup?.name || '',
      purchaseId: source === 'invoice' ? purchaseId : undefined,
      supplierInvoiceNo: source === 'invoice' ? purchase?.supplierInvoiceNo : undefined,
      items: active.map((l) => ({ productId: l.productId, productName: l.productName, qty: l.qty, price: l.price, total: r2(l.qty * l.price), unitName: l.unitName, factor: l.factor })),
      subtotal: totals.subtotal,
      vat: totals.vat,
      vatRate: rate ? taxRatePercent : 0,
      total: totals.total,
      pricesInclusive: inclusive || undefined,
      reason: reason === 'أخرى' ? reasonNote.trim() || 'أخرى' : reasonNote.trim() ? `${reason} — ${reasonNote.trim()}` : reason,
      createdBy: userName,
    };
    onAdd(r);
    setOpen(false);
    reset();
    notify?.(`تم حفظ مرتجع المشتريات ${r.number} وخصم الكميات من المخزون`);
  };

  // ---- الطباعة ----
  const sheet = (r: PurchaseReturn) =>
    purchaseHtml(
      { id: r.id, supplierId: r.supplierId, supplierName: r.supplierName, date: r.date, items: r.items, total: r.total, subtotal: r.subtotal, vat: r.vat, vatRate: r.vatRate, pricesInclusive: r.pricesInclusive, supplierInvoiceNo: r.supplierInvoiceNo },
      company || { name: '', vat: '' },
      suppliers.find((s) => s.id === r.supplierId),
      { title: 'مرتجع مشتريات', number: r.number, reason: r.reason, foot: 'إشعار مرتجع مشتريات — مستند داخلي' }
    );
  const a4 = printSettings?.a4Printer || '';
  const doPrint = async (r: PurchaseReturn) => {
    const res = await printHtmlDocument(sheet(r), { silent: !!printSettings?.silent && !!a4, deviceName: a4 || undefined, pageSize: 'A4' });
    notify?.(res.ok ? 'تم إرسال المرتجع للطباعة' : 'لم تتم الطباعة');
  };
  const doPdf = async (r: PurchaseReturn) => {
    if (await exportHtmlAsPdf(sheet(r), `مرتجع-مشتريات-${r.number}.pdf`)) notify?.('تم حفظ المرتجع PDF');
  };

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return returns.filter((r) => inPeriod(r.date, period)); // البحث يشمل كل التواريخ
    return returns.filter((r) => r.number.toLowerCase().includes(q) || r.supplierName.toLowerCase().includes(q) || (r.supplierInvoiceNo || '').toLowerCase().includes(q) || r.items.some((i) => i.productName.toLowerCase().includes(q)));
  }, [returns, search, period]);
  const grand = r2(list.reduce((s, r) => s + r.total, 0));
  const listTable = useVirtualRows<PurchaseReturn>(list, (r) => r.id, { resetKey: `${search}|${JSON.stringify(period)}` });

  return (
    <div className="p-6 h-full overflow-y-auto flex flex-col gap-5 animate-in fade-in max-w-7xl mx-auto dark:text-white text-right" dir="rtl" data-testid="purchase-returns">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 rounded-xl"><Undo2 className="w-8 h-8" /></div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 dark:text-white">مرتجع المشتريات</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-semibold mt-1">إرجاع أصناف للمورد — تُخصم الكميات من المخزون</p>
          </div>
        </div>
        <button type="button" onClick={() => { reset(); setOpen(true); }} data-testid="pr-new" className="px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black flex items-center gap-2 shadow">
          <Plus className="w-5 h-5" /> مرتجع جديد
        </button>
      </div>

      <DatePeriodFilter value={period} onChange={setPeriod} searching={!!search.trim()} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700"><div className="text-xs font-bold text-slate-500">عدد المرتجعات</div><div className="text-2xl font-black mt-1">{list.length}</div></div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700"><div className="text-xs font-bold text-slate-500">إجمالي المرتجع (شامل الضريبة)</div><div className="text-2xl font-black mt-1 text-rose-600 flex items-center gap-1">{grand.toFixed(2)} <SaudiRiyalSymbol className="w-5 h-5" /></div></div>
        <div className="relative bg-white dark:bg-slate-800 rounded-2xl p-3 border border-slate-100 dark:border-slate-700 flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute right-6" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالرقم أو المورد أو الصنف..." className={`${field} pr-9`} />
        </div>
      </div>

      <div ref={listTable.scrollRef} className="flex-1 min-h-[22rem] overflow-auto vlist-scroll bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700" data-testid="pr-scroll">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-[3] bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 text-xs shadow-[0_1px_0_rgba(100,116,139,0.25)]">
            <tr>
              <th className="p-3 text-right">الإجراءات</th><th className="p-3 text-right">الرقم</th><th className="p-3 text-right">التاريخ</th><th className="p-3 text-right">المورد</th>
              <th className="p-3 text-right">فاتورة الشراء</th><th className="p-3 text-right">الأصناف</th><th className="p-3 text-right">السبب</th><th className="p-3 text-left">الإجمالي</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            <VSpacer h={listTable.padTop} />
            {listTable.visible.map((r) => (
              <tr key={r.id} data-vkey={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                <td className="p-2">
                  <div className="flex gap-1">
                    <button title="عرض" onClick={() => setViewing(r)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><Eye className="w-4 h-4" /></button>
                    <button title="طباعة" onClick={() => void doPrint(r)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><Printer className="w-4 h-4" /></button>
                    <button title="حفظ PDF" onClick={() => void doPdf(r)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><FileDown className="w-4 h-4" /></button>
                    <button title="حذف وإعادة الكميات للمخزون" onClick={() => setConfirmDel(r)} className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
                <td className="p-3 font-mono font-black">{r.number}</td>
                <td className="p-3 font-mono text-xs">{r.date}</td>
                <td className="p-3 font-bold">{r.supplierName}</td>
                <td className="p-3 font-mono text-xs">{r.purchaseId ? (r.supplierInvoiceNo || 'مرتبط') : <span className="text-slate-400">بدون</span>}</td>
                <td className="p-3">{r.items.length}</td>
                <td className="p-3 text-xs max-w-[14rem] truncate" title={r.reason}>{r.reason}</td>
                <td className="p-3 text-left font-black font-mono">{r.total.toFixed(2)}</td>
              </tr>
            ))}
            <VSpacer h={listTable.padBottom} />
            {!list.length && <tr><td colSpan={8} className="p-10 text-center text-slate-400 font-bold">لا توجد مرتجعات مشتريات</td></tr>}
          </tbody>
        </table>
      </div>

      {/* نافذة مرتجع جديد */}
      {open && (
        <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-3" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-5xl max-h-[94vh] rounded-2xl shadow-2xl flex flex-col" data-testid="pr-modal">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-black text-lg text-rose-700 dark:text-rose-300 flex items-center gap-2"><Undo2 className="w-5 h-5" /> مرتجع مشتريات جديد</h3>
              <button onClick={() => setOpen(false)}><X className="w-5 h-5 text-slate-500" /></button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-1">المورد</label>
                  <select value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setPurchaseId(''); setLines([]); }} className={field} data-testid="pr-supplier">
                    <option value="">اختر المورد...</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">التاريخ</label>
                  <DateField value={date} onChange={(v) => setDate(v)} className={field} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">المصدر</label>
                  <div className="grid grid-cols-2 gap-1">
                    {([['invoice', 'من فاتورة شراء'], ['free', 'بدون فاتورة']] as const).map(([v, t]) => (
                      <button key={v} type="button" data-source={v} onClick={() => { setSource(v); setPurchaseId(''); setLines([]); setError(''); }}
                        className={`py-2.5 rounded-xl text-xs font-black border ${source === v ? 'bg-rose-600 text-white border-rose-600' : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-700'}`}>{t}</button>
                    ))}
                  </div>
                </div>
              </div>

              {source === 'invoice' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">فاتورة الشراء</label>
                  <select value={purchaseId} onChange={(e) => loadPurchase(e.target.value)} disabled={!supplierId} className={field} data-testid="pr-purchase">
                    <option value="">{supplierId ? (supplierPurchases.length ? 'اختر الفاتورة...' : 'لا توجد فواتير شراء لهذا المورد') : 'اختر المورد أولاً'}</option>
                    {supplierPurchases.map((p) => <option key={p.id} value={p.id}>{p.date} — {p.supplierInvoiceNo ? `رقم ${p.supplierInvoiceNo}` : 'بدون رقم'} — {p.total.toFixed(2)} ر.س ({p.items.length} صنف)</option>)}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">إضافة صنف</label>
                    <ProductPicker products={products} value={pickId} onChange={(id) => addFree(id)} placeholder="ابحث باسم الصنف..." />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">أو امسح الباركود</label>
                    <div className="relative">
                      <ScanLine className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                      <input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={onScan} placeholder="امسح ثم Enter" className={`${field} pr-9 font-mono`} data-testid="pr-scan" />
                    </div>
                  </div>
                </div>
              )}

              {source === 'invoice' && purchaseId && (
                <div className="relative max-w-md">
                  <ScanLine className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  <input value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={onScan} placeholder="امسح باركود الصنف لزيادة كميته المرتجعة" className={`${field} pr-9 font-mono`} />
                </div>
              )}

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
                <table className="w-full text-sm" data-testid="pr-lines">
                  <thead className="bg-slate-50 dark:bg-slate-950 text-xs text-slate-500">
                    <tr><th className="p-2 text-right">الصنف</th><th className="p-2">الوحدة</th>{source === 'invoice' && <th className="p-2">المتبقي للإرجاع</th>}<th className="p-2">الكمية المرتجعة</th><th className="p-2">سعر الوحدة</th><th className="p-2">المجموع</th><th className="p-2 w-10" /></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {lines.map((l) => {
                      const over = l.max !== undefined && l.qty > l.max + 1e-9;
                      return (
                        <tr key={l.key} className={l.qty > 0 ? 'bg-rose-50/50 dark:bg-rose-900/10' : ''}>
                          <td className="p-2 font-bold">{l.productName}</td>
                          <td className="p-2 text-center text-xs">{l.unitName}{l.factor > 1 ? ` (${l.factor})` : ''}</td>
                          {source === 'invoice' && <td className="p-2 text-center font-mono">{l.max}</td>}
                          <td className="p-2 text-center">
                            <div className="inline-flex items-center gap-1">
                              <button type="button" onClick={() => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, qty: Math.max(0, x.qty - 1) } : x)))} className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 font-black">−</button>
                              <input type="number" min={0} step="any" value={l.qty} onFocus={selectAll} data-testid="pr-qty"
                                onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, qty: Math.max(0, Number(e.target.value) || 0) } : x)))}
                                className={`w-16 text-center rounded-lg border px-1 py-1 font-mono font-black bg-white dark:bg-slate-950 ${over ? 'border-rose-500 text-rose-600' : 'border-slate-200 dark:border-slate-700'}`} />
                              <button type="button" onClick={() => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, qty: Math.min(x.max ?? Infinity, x.qty + 1) } : x)))} className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 font-black">+</button>
                              {source === 'invoice' && (l.max || 0) > 0 && <button type="button" onClick={() => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, qty: x.max || 0 } : x)))} className="text-[11px] font-black text-rose-600 px-1">الكل</button>}
                            </div>
                          </td>
                          <td className="p-2 text-center">
                            <input type="number" min={0} step="any" value={l.price} onFocus={selectAll} disabled={source === 'invoice'}
                              onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, price: Math.max(0, Number(e.target.value) || 0) } : x)))}
                              className="w-24 text-center rounded-lg border border-slate-200 dark:border-slate-700 px-1 py-1 font-mono bg-white dark:bg-slate-950 disabled:opacity-70" />
                          </td>
                          <td className="p-2 text-center font-mono font-black">{r2(l.qty * l.price).toFixed(2)}</td>
                          <td className="p-2">{source === 'free' && <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="text-rose-500"><Trash2 className="w-4 h-4" /></button>}</td>
                        </tr>
                      );
                    })}
                    {!lines.length && <tr><td colSpan={7} className="p-6 text-center text-slate-400 font-bold">{source === 'invoice' ? 'اختر فاتورة الشراء لعرض أصنافها' : 'أضف الأصناف المرتجعة'}</td></tr>}
                  </tbody>
                </table>
              </div>

              {stockWarnings.length > 0 && (
                <div className="flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 p-3 text-xs font-bold text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>الكمية المرتجعة أكبر من المخزون الحالي — سيصبح المخزون بالسالب: {stockWarnings.map(({ l, stock }) => `${l.productName} (المتوفر ${stock})`).join('، ')}</div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">سبب الإرجاع</label>
                  <select value={reason} onChange={(e) => setReason(e.target.value)} className={field}>{REASONS.map((r) => <option key={r}>{r}</option>)}</select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-1">ملاحظة {reason === 'أخرى' ? '(اكتب السبب)' : '(اختياري)'}</label>
                  <input value={reasonNote} onChange={(e) => setReasonNote(e.target.value)} className={field} />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-sm font-bold">
                <label className="flex items-center gap-2"><input type="checkbox" checked={taxable} disabled={source === 'invoice'} onChange={(e) => setTaxable(e.target.checked)} /> خاضع للضريبة ({taxRatePercent}%)</label>
                {taxable && <label className="flex items-center gap-2"><input type="checkbox" checked={inclusive} disabled={source === 'invoice'} onChange={(e) => setInclusive(e.target.checked)} /> الأسعار شاملة الضريبة</label>}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-4">
              <div className="flex gap-5 text-sm font-bold" data-testid="pr-totals">
                <span>قبل الضريبة: <b className="font-mono">{totals.subtotal.toFixed(2)}</b></span>
                <span>الضريبة: <b className="font-mono">{totals.vat.toFixed(2)}</b></span>
                <span className="text-rose-600 text-base">الإجمالي: <b className="font-mono">{totals.total.toFixed(2)}</b></span>
              </div>
              {error && <div className="text-rose-600 text-sm font-bold" data-testid="pr-error">{error}</div>}
              <div className="mr-auto flex gap-2">
                <button type="button" onClick={() => setOpen(false)} className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold">إلغاء</button>
                <button type="button" onClick={save} data-testid="pr-save" className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black">حفظ المرتجع</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* عرض مرتجع */}
      {viewing && (
        <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-3" onClick={(e) => e.target === e.currentTarget && setViewing(null)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-lg">مرتجع {viewing.number}</h3>
              <button onClick={() => setViewing(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="text-sm font-bold text-slate-600 dark:text-slate-300">{viewing.supplierName} — {viewing.date}{viewing.supplierInvoiceNo ? ` — عن فاتورة ${viewing.supplierInvoiceNo}` : ''}</div>
            <div className="text-sm">السبب: <b>{viewing.reason}</b>{viewing.createdBy ? <span className="text-slate-500"> — بواسطة {viewing.createdBy}</span> : null}</div>
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500"><tr><th className="text-right p-1">الصنف</th><th className="p-1">الوحدة</th><th className="p-1">الكمية</th><th className="p-1">السعر</th><th className="p-1">المجموع</th></tr></thead>
              <tbody>{viewing.items.map((i, k) => <tr key={k} className="border-t border-slate-100 dark:border-slate-800"><td className="p-1 font-bold">{i.productName}</td><td className="p-1 text-center">{i.unitName}</td><td className="p-1 text-center font-mono">{i.qty}</td><td className="p-1 text-center font-mono">{i.price.toFixed(2)}</td><td className="p-1 text-center font-mono">{i.total.toFixed(2)}</td></tr>)}</tbody>
            </table>
            <div className="flex justify-between font-black border-t pt-2"><span>الإجمالي شامل الضريبة</span><span className="font-mono">{viewing.total.toFixed(2)}</span></div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => void doPrint(viewing)} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold flex items-center gap-1"><Printer className="w-4 h-4" /> طباعة</button>
              <button onClick={() => void doPdf(viewing)} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold flex items-center gap-1"><FileDown className="w-4 h-4" /> PDF</button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-[85] bg-black/60 flex items-center justify-center p-3">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl p-5 space-y-4">
            <h3 className="font-black text-lg">حذف المرتجع {confirmDel.number}؟</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">ستُعاد الكميات المرتجعة إلى المخزون.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDel(null)} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold">إلغاء</button>
              <button onClick={() => { onDelete(confirmDel.id); setConfirmDel(null); }} data-testid="pr-confirm-del" className="px-4 py-2 rounded-xl bg-rose-600 text-white font-black">حذف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
