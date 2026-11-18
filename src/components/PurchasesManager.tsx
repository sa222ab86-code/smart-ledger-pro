import React, { useMemo, useRef, useState } from 'react';
import { useVirtualRows, VSpacer } from '../utils/useVirtualRows';
import { beepError } from '../utils/beep';
import DateField from './DateField';
import DatePeriodFilter, { defaultPeriod, inPeriod } from './DatePeriodFilter';
import { latinBarcodeKeyDown } from '../utils/docScan';
import { FileBox, Plus, Search, DollarSign, Trash2, Tag, X, PackagePlus, ScanLine, Eye, Pencil, Printer, FileDown, Barcode } from 'lucide-react';
import { purchaseHtml } from '../utils/purchaseSheet';
import { exportHtmlAsPdf, printHtmlDocument, type PrintSettings } from '../utils/printing';
import { PurchaseInvoice, Supplier, Product, ProductGroup } from '../types';
import SaudiRiyalSymbol from './SaudiRiyalSymbol';
import ProductPicker from './ProductPicker';

/** سطر فاتورة شراء أثناء الإدخال: الكمية والسعر بوحدة الشراء المختارة (حبة/كرتون...) */
interface DraftLine {
  key: string;
  productId: string;
  unitId: string;        // '' = الحبة (الوحدة الأساسية)
  unitName: string;
  factor: number;        // عدد الحبات في وحدة الشراء
  qty: number;
  price: number;         // سعر وحدة الشراء
  expiry?: string;       // تاريخ صلاحية الدفعة (اختياري)
}

/**
 * حقل المجموع القابل للتعديل: اكتب المجموع ثم Enter (أو اخرج من الحقل) → يُحسب سعر الوحدة = المجموع ÷ الكمية
 * بدقة كافية (6 خانات) ليبقى المجموع كما كُتب تماماً بلا زيادة أو نقص هللات. Esc يلغي.
 */
function LineTotalInput({ total, onCommit }: { total: number; onCommit: (t: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const t = Math.round(Number(draft) * 100) / 100;
    setDraft(null);
    if (Number.isFinite(t) && t >= 0 && t !== total) onCommit(t);
  };
  return (
    <input type="number" min="0" step="0.01" data-testid="purchase-line-total"
      value={draft ?? total.toFixed(2)}
      onFocus={(e) => { setDraft(total.toFixed(2)); e.currentTarget.select(); }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); e.currentTarget.blur(); } else if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur(); } }}
      title="اكتب المجموع ثم Enter — يُحسب سعر الوحدة تلقائياً"
      className="w-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 rounded-lg py-1 px-1 font-mono font-black text-center text-emerald-700 dark:text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
  );
}

export interface PurchaseExtras {
  /** تحديث سعر تكلفة الأصناف من هذه الفاتورة (تكلفة الحبة قبل الضريبة) */
  updateCost: boolean;
  /** فاتورة عليها مرتجع: لم يتغيّر إلا وضع الضريبة — يُحدَّث المرتجع المرتبط بنفس الوضع */
  vatOnly?: boolean;
}

/** صنف صارت تكلفته من فاتورة الشراء أعلى من سعر بيعه الحالي */
export interface SalePriceFix { productId: string; unitId?: string; price: number }
interface RiskRow { key: string; productId: string; unitId?: string; name: string; cost: number; oldShown: number; minShown: number; value: string }

interface PurchasesManagerProps {
  /** طريقة تحديث التكلفة: متوسط مرجّح أو آخر سعر شراء (من إعدادات التطبيق) */
  costMethod?: 'average' | 'last';
  /** أسعار البيع في بطاقات الأصناف شاملة الضريبة؟ (للمقارنة مع تكلفة الشراء الصافية) */
  salePricesIncludeTax?: boolean;
  /** تعديل أسعار بيع الأصناف التي صارت تكلفتها أعلى من سعر بيعها */
  onUpdateSalePrices?: (fixes: SalePriceFix[]) => void;
  /** طباعة ملصقات باركود أصناف الفاتورة (عدد الملصقات = الكمية المشتراة) */
  onPrintLabels?: (p: PurchaseInvoice) => void;
  purchases: PurchaseInvoice[];
  suppliers: Supplier[];
  products: Product[];
  groups?: ProductGroup[];
  onAddPurchase: (purchase: PurchaseInvoice, extras: PurchaseExtras) => void;
  /** تعديل فاتورة شراء: يُعكس أثر القديمة على المخزون ويُطبَّق أثر الجديدة */
  onUpdatePurchase?: (before: PurchaseInvoice, after: PurchaseInvoice, extras: PurchaseExtras) => void;
  company?: { name: string; nameEn?: string; vat: string; address?: string; shortAddress?: string; phone?: string; mobile?: string; email?: string; logoUrl?: string; footerInfo?: boolean };
  printSettings?: PrintSettings;
  onDeletePurchase: (id: string) => void;
  /** إضافة مورد جديد مباشرة من فاتورة الشراء */
  onAddSupplier?: (supplier: Supplier) => void;
  /** إضافة صنف جديد مباشرة من فاتورة الشراء */
  onAddProduct?: (product: Product) => void;
  /** نسبة الضريبة للمنشأة (لضريبة المدخلات) */
  taxRatePercent?: number;
  notify?: (msg: string) => void;
  /** فواتير عليها مرتجع مشتريات: لا تُعدّل ولا تُحذف */
  lockedIds?: Set<string>;
  /** المنشأة مسجلة في ضريبة القيمة المضافة (لتنبيه إلغاء «خاضعة للضريبة») */
  companyVatRegistered?: boolean;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const todayYmd = () => {
  const d = new Date(); const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const field = 'w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none';
const selectAll = (e: React.FocusEvent<HTMLInputElement>) => { const t = e.currentTarget; setTimeout(() => t.select(), 0); };

/** وحدات الشراء المتاحة للصنف: الحبة + التعبئات المعرّفة (كرتون، علبة...) */
function unitsOf(p?: Product) {
  const base = { id: '', name: 'حبة', factor: 1, cost: p?.cost || 0 };
  if (!p) return [base];
  // كل العبوات والأحجام المعرّفة (كرتون ×12، أو حجم صغير/كبير بلا مضاعف = حبة واحدة)
  const extra = (p.units || []).filter((u) => u.name && u.name.trim()).map((u) => {
    const factor = (u.factor || 0) > 0 ? u.factor : 1;
    return { id: u.id, name: u.name, factor, cost: u.cost ?? r2((p.cost || 0) * factor) };
  });
  // صنف «عنوان فقط» (يُباع بأحجامه): الأحجام وحدها
  return p.sellBaseUnit === false && extra.length ? extra : [base, ...extra];
}

export default function PurchasesManager({
  costMethod = 'average', companyVatRegistered = true, salePricesIncludeTax = false, onUpdateSalePrices, onPrintLabels, purchases, suppliers, products, groups = [], onAddPurchase, onUpdatePurchase, company, printSettings, onDeletePurchase, onAddSupplier, onAddProduct, taxRatePercent = 15, notify, lockedIds,
}: PurchasesManagerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [period, setPeriod] = useState(defaultPeriod); // الافتراضي: فواتير اليوم
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewing, setViewing] = useState<PurchaseInvoice | null>(null);
  const [editingPur, setEditingPur] = useState<PurchaseInvoice | null>(null);

  const sheet = (p: PurchaseInvoice) => purchaseHtml(p, company || { name: '', vat: '' }, suppliers.find((s) => s.id === p.supplierId));
  const a4Printer = printSettings?.a4Printer || '';
  const doPrint = async (p: PurchaseInvoice) => {
    const res = await printHtmlDocument(sheet(p), { silent: !!printSettings?.silent && !!a4Printer, deviceName: a4Printer || undefined, pageSize: 'A4' });
    notify?.(res.ok ? `تم إرسال فاتورة الشراء للطباعة${a4Printer ? ' — ' + a4Printer : ''}` : 'لم تتم الطباعة');
  };
  const doPdf = async (p: PurchaseInvoice) => {
    const name = `فاتورة-شراء-${(p.supplierInvoiceNo || p.date).replace(/[\\/:*?"<>|\s]+/g, '-')}.pdf`;
    if (await exportHtmlAsPdf(sheet(p), name)) notify?.('تم حفظ فاتورة الشراء PDF');
  };

  // رأس الفاتورة
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(todayYmd());
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [vatTaxable, setVatTaxable] = useState(true);
  const [pricesInclusive, setPricesInclusive] = useState(false);
  const [updateCost, setUpdateCost] = useState(true);
  // فاتورة عليها مرتجع مشتريات: يُسمح بتغيير وضع الضريبة فقط (الكميات والأسعار مقفلة)
  const [vatOnly, setVatOnly] = useState(false);
  const [priceFix, setPriceFix] = useState<{ purchase: PurchaseInvoice; rows: RiskRow[] } | null>(null);
  // خصم الفاتورة: مبلغ أو نسبة من مجموع الأسطر (قبل الضريبة)
  const [discountType, setDiscountType] = useState<'amount' | 'percent'>('amount');
  const [discountValue, setDiscountValue] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [formError, setFormError] = useState('');

  // إدخال صنف
  const [currentItemId, setCurrentItemId] = useState('');
  const [currentUnitId, setCurrentUnitId] = useState('');
  const [currentQty, setCurrentQty] = useState('1');
  const [currentPrice, setCurrentPrice] = useState('');
  const [scan, setScan] = useState('');
  const qtyRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const barcodeIndex = useMemo(() => {
    const m = new Map<string, { p: Product; unitId: string }>();
    for (const p of products) for (const u of p.units || []) { const b = (u.barcode || '').trim(); if (b && (u.factor || 0) > 1 && !m.has(b)) m.set(b, { p, unitId: u.id }); }
    for (const p of products) for (const b0 of p.barcodes || []) { const b = (b0 || '').trim(); if (b && !m.has(b)) m.set(b, { p, unitId: '' }); }
    for (const p of products) { const b = (p.barcode || '').trim(); if (b) m.set(b, { p, unitId: '' }); }
    return m;
  }, [products]);

  const calcPurchase = (ls: { qty: number; price: number }[]) => {
    // مجموع الأسطر بعد تقريب كل سطر — يطابق المجموع المُدخل يدوياً بالهللة
    const gross = r2(ls.reduce((s, it) => s + r2(it.qty * it.price), 0));
    // الخصم يُطرح قبل الضريبة (بنفس أساس الأسعار: شاملة أو غير شاملة) ولا يتجاوز المجموع
    const dv = Math.max(0, Number(discountValue) || 0);
    const discount = Math.min(gross, r2(discountType === 'percent' ? gross * Math.min(100, dv) / 100 : dv));
    const sum = r2(gross - discount);
    const base = { gross, discount };
    const rate = vatTaxable ? taxRatePercent / 100 : 0;
    if (!rate) return { ...base, subtotal: sum, vat: 0, total: sum, rate: 0 };
    if (pricesInclusive) { const sub = r2(sum / (1 + rate)); return { ...base, subtotal: sub, vat: r2(sum - sub), total: sum, rate: taxRatePercent }; }
    const vat = r2(sum * rate);
    return { ...base, subtotal: sum, vat, total: r2(sum + vat), rate: taxRatePercent };
  };
  const totals = calcPurchase(lines);

  // مورد جديد من داخل الفاتورة
  const [newSupplierOpen, setNewSupplierOpen] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: '', phone: '', vatNumber: '' });
  const [newSupplierError, setNewSupplierError] = useState('');
  const saveNewSupplier = () => {
    const name = newSupplier.name.trim();
    if (!name) return setNewSupplierError('اكتب اسم المورد');
    const dup = suppliers.find((s) => s.name.trim() === name);
    if (dup) { setSelectedSupplierId(dup.id); setNewSupplierOpen(false); return; }
    const s: Supplier = { id: `sup-${Date.now()}`, name, phone: newSupplier.phone.trim(), email: '', address: '', vatNumber: newSupplier.vatNumber.trim() || undefined };
    onAddSupplier?.(s);
    setSelectedSupplierId(s.id);
    setNewSupplier({ name: '', phone: '', vatNumber: '' });
    setNewSupplierError('');
    setNewSupplierOpen(false);
  };

  // صنف جديد من داخل الفاتورة
  const blankProd = { nameAr: '', barcode: '', price: '', cost: '', groupId: '' };
  const [newProdOpen, setNewProdOpen] = useState(false);
  const [newProd, setNewProd] = useState(blankProd);
  const [newProdError, setNewProdError] = useState('');
  const saveNewProduct = () => {
    const name = newProd.nameAr.trim();
    const barcode = newProd.barcode.trim();
    if (!name) return setNewProdError('اكتب اسم الصنف');
    if (barcode && barcodeIndex.has(barcode)) return setNewProdError(`الباركود مستخدم للصنف «${barcodeIndex.get(barcode)!.p.nameAr}»`);
    if (products.some((p) => p.nameAr.trim() === name)) return setNewProdError('يوجد صنف بنفس الاسم — اختره من البحث');
    const g = groups.find((x) => x.id === newProd.groupId);
    const cost = parseFloat(newProd.cost) || 0;
    const p: Product = {
      id: `p${Date.now()}`, nameAr: name, nameEn: '', price: parseFloat(newProd.price) || 0, cost,
      categoryAr: g ? g.nameAr : '', categoryEn: g ? g.nameEn || g.nameAr : '', groupId: g?.id,
      stock: 0, minStock: 10, barcode: barcode || String(Math.floor(Math.random() * 900000 + 100000)),
    };
    onAddProduct?.(p);
    notify?.(`تمت إضافة الصنف ${name}`);
    setNewProd(blankProd); setNewProdError(''); setNewProdOpen(false);
    setCurrentItemId(p.id); setCurrentUnitId(''); setCurrentPrice(cost ? String(cost) : ''); setCurrentQty('1');
    setTimeout(() => qtyRef.current?.focus(), 0);
  };

  const curProduct = currentItemId ? productById.get(currentItemId) : undefined;
  const curUnits = unitsOf(curProduct);

  const pushLine = (p: Product, unitId: string, qty: number, price: number) => {
    const u = unitsOf(p).find((x) => x.id === unitId) || unitsOf(p)[0];
    setLines((prev) => {
      const i = prev.findIndex((l) => l.productId === p.id && l.unitId === u.id);
      if (i > -1) return prev.map((l, k) => (k === i ? { ...l, qty: r2(l.qty + qty), price } : l));
      return [...prev, { key: `${p.id}-${u.id}-${Date.now()}`, productId: p.id, unitId: u.id, unitName: u.name, factor: u.factor, qty, price }];
    });
    setFormError('');
  };

  const handleProductChange = (productId: string) => {
    setCurrentItemId(productId);
    const prod = productById.get(productId);
    const first = unitsOf(prod)[0];
    setCurrentUnitId(first.id);
    setCurrentPrice(first.cost ? String(r2(first.cost)) : '');
    if (prod) setTimeout(() => qtyRef.current?.focus(), 0);
  };
  const handleUnitChange = (unitId: string) => {
    setCurrentUnitId(unitId);
    const u = curUnits.find((x) => x.id === unitId);
    if (u) setCurrentPrice(u.cost ? String(r2(u.cost)) : '');
  };

  const handleAddItem = () => {
    const qty = parseFloat(currentQty);
    const price = parseFloat(currentPrice);
    if (!curProduct) return setFormError('اختر الصنف أولاً');
    if (!(qty > 0)) return setFormError('أدخل كمية صحيحة');
    if (!(price > 0)) return setFormError('أدخل سعر الشراء للصنف');
    pushLine(curProduct, currentUnitId, qty, price);
    setCurrentItemId(''); setCurrentUnitId(''); setCurrentQty('1'); setCurrentPrice('');
  };

  // مسح باركود: يُضاف الصنف مباشرة بسعر تكلفته (ويمكن تعديل الكمية والسعر في الجدول)
  const onScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') { latinBarcodeKeyDown(e); return; }
    e.preventDefault();
    const code = scan.trim();
    if (!code) return;
    const hit = barcodeIndex.get(code);
    if (!hit) { beepError(); setFormError(`لا يوجد صنف بالباركود ${code} — أضفه بزر «صنف جديد»`); setNewProd({ ...blankProd, barcode: code }); return; }
    const u = unitsOf(hit.p).find((x) => x.id === hit.unitId) || unitsOf(hit.p)[0];
    pushLine(hit.p, u.id, 1, r2(u.cost || 0));
    setScan('');
  };

  const patchLine = (key: string, p: Partial<DraftLine>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...p } : l)));

  const resetForm = () => {
    setSelectedSupplierId(suppliers[0]?.id || '');
    setPurchaseDate(todayYmd());
    setSupplierInvoiceNo('');
    setLines([]);
    setDiscountType('amount'); setDiscountValue('');
    setCurrentItemId(''); setCurrentUnitId(''); setCurrentQty('1'); setCurrentPrice(''); setScan('');
    setFormError(''); setNewProdOpen(false); setNewSupplierOpen(false);
    if (editingPur) { setVatTaxable(true); setPricesInclusive(false); }
    setVatOnly(false);
    setEditingPur(null);
  };

  /** فتح فاتورة شراء محفوظة للتعديل */
  const openEdit = (p: PurchaseInvoice) => {
    const locked = !!lockedIds?.has(p.id);
    resetForm();
    setSelectedSupplierId(p.supplierId);
    setPurchaseDate(p.date);
    setSupplierInvoiceNo(p.supplierInvoiceNo || '');
    setDiscountType(p.discountType || 'amount');
    setDiscountValue(p.discount ? String(p.discountType === 'percent' ? p.discountValue ?? '' : p.discount) : '');
    const linesSum = r2(p.items.reduce((s, i) => s + (i.total || 0), 0));
    const taxable = p.vat === undefined ? false : p.vat > 0 || (p.vatRate || 0) > 0;
    setVatTaxable(taxable);
    // الفواتير القديمة بلا علامة: شاملة إذا كان مجموع الأسطر = الإجمالي مع وجود ضريبة
    setPricesInclusive(p.pricesInclusive ?? (taxable && Math.abs(r2(linesSum - (p.discount || 0)) - p.total) < 0.011));
    setLines(p.items.map((it, k) => {
      const prod = productById.get(it.productId);
      const u = unitsOf(prod).find((x) => x.factor === (it.factor || 1) && (!it.unitName || x.name === it.unitName)) || unitsOf(prod)[0];
      return { key: `${it.productId}-${k}-${Date.now()}`, productId: it.productId, unitId: u.id, unitName: it.unitName || u.name, factor: it.factor || 1, qty: it.qty, price: it.price, expiry: it.expiryDate };
    }));
    setEditingPur(p);
    setVatOnly(locked);
    setShowAddModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const supplier = suppliers.find((s) => s.id === selectedSupplierId);
    if (!supplier) return setFormError('اختر المورد');
    if (lines.length === 0) return setFormError('أضف صنفاً واحداً على الأقل');
    const bad = lines.find((l) => !(l.qty > 0) || !(l.price > 0));
    if (bad) return setFormError(`راجع الكمية والسعر للصنف «${productById.get(bad.productId)?.nameAr || ''}»`);
    const calc = calcPurchase(lines);
    // تكلفة الحبة: بعد الخصم (يوزَّع بنسبة قيمة كل سطر) وبلا ضريبة
    const discFactor = calc.gross > 0 ? (calc.gross - calc.discount) / calc.gross : 1;
    const netFactor = (vatTaxable && pricesInclusive ? 1 / (1 + taxRatePercent / 100) : 1) * discFactor;
    const purchase: PurchaseInvoice = {
      id: editingPur ? editingPur.id : `p-${Date.now()}`,
      supplierId: supplier.id,
      supplierName: supplier.name,
      date: purchaseDate,
      items: lines.map((l) => ({
        productId: l.productId,
        productName: productById.get(l.productId)?.nameAr || 'صنف غير معروف',
        qty: l.qty,
        price: l.price,
        total: r2(l.qty * l.price),
        unitName: l.unitName,
        factor: l.factor,
        pieceCost: Math.round((l.price * netFactor / l.factor) * 10000) / 10000,
        expiryDate: l.expiry || undefined,
      })),
      total: calc.total,
      subtotal: calc.subtotal,
      vat: calc.vat,
      vatRate: calc.rate,
      supplierInvoiceNo: supplierInvoiceNo.trim() || undefined,
      pricesInclusive: vatTaxable && pricesInclusive,
      ...(calc.discount > 0 ? { discount: calc.discount, discountType, discountValue: Number(discountValue) || 0 } : {}),
    };
    // تكلفة الفاتورة أعلى من سعر البيع الحالي؟ نعرضها قبل الحفظ ليُعدَّل السعر (مرة واحدة لكل حفظ)
    const risk = findRisk(purchase);
    if (risk.length) { setPriceFix({ purchase, rows: risk }); return; }
    commitPurchase(purchase);
  };

  /** أصناف (وعبواتها) تكلفتها من هذه الفاتورة أعلى من صافي سعر بيعها */
  const findRisk = (purchase: PurchaseInvoice): RiskRow[] => {
    const k = salePricesIncludeTax ? 1 + taxRatePercent / 100 : 1;
    const top = new Map<string, number>();
    for (const it of purchase.items) if (it.pieceCost && it.pieceCost > 0) top.set(it.productId, Math.max(top.get(it.productId) || 0, it.pieceCost));
    const rows: RiskRow[] = [];
    const up = (n: number) => Math.ceil(n * 100 - 1e-6) / 100;
    for (const [pid, pc] of top) {
      const p = productById.get(pid);
      if (!p || p.isService) continue;
      const check = (unitId: string | undefined, name: string, shown: number, factor: number, oldCost: number) => {
        if (!(shown > 0)) return; // بلا سعر: يُحدَّد عند البيع
        const cost = pc * factor;
        if (shown / k >= cost - 0.005) return;
        // اقتراح: نفس نسبة الربح السابقة فوق التكلفة الجديدة إن عُرفت، وإلا يترك فارغاً
        const sug = oldCost > 0 && shown / k > oldCost ? up(cost * (shown / k / oldCost) * k) : 0;
        rows.push({ key: `${pid}|${unitId || ''}`, productId: pid, unitId, name, cost, oldShown: shown, minShown: up(cost * k), value: sug ? sug.toFixed(2) : '' });
      };
      if (p.sellBaseUnit !== false) check(undefined, p.nameAr, p.price || 0, 1, p.cost || 0);
      for (const u of p.units || []) {
        const fac = (u.factor || 0) > 0 ? u.factor! : 1;
        check(u.id, `${p.nameAr} — ${u.name}`, u.price || 0, fac, u.cost ?? (p.cost || 0) * fac);
      }
    }
    return rows;
  };

  const commitPurchase = (purchase: PurchaseInvoice, fixes?: SalePriceFix[]) => {
    if (fixes?.length) onUpdateSalePrices?.(fixes);
    setPriceFix(null);
    if (editingPur && onUpdatePurchase) {
      onUpdatePurchase(editingPur, purchase, { updateCost, vatOnly });
      notify?.('تم تعديل فاتورة الشراء وتحديث المخزون');
    } else {
      onAddPurchase(purchase, { updateCost });
      notify?.(`تم تسجيل فاتورة الشراء — ${lines.length} صنف أُضيفت للمخزون`);
    }
    resetForm();
    setShowAddModal(false);
  };

  const handleDelete = (p: PurchaseInvoice) => {
    if (lockedIds?.has(p.id)) { notify?.('🔒 لا يمكن حذف فاتورة عليها مرتجع مشتريات — احذف المرتجع أولاً'); return; }
    if (!window.confirm(`حذف فاتورة الشراء من «${p.supplierName}» بتاريخ ${p.date}؟\nسيتم خصم كمياتها من المخزون.`)) return;
    onDeletePurchase(p.id);
  };

  const filteredPurchases = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    // بلا بحث: فواتير الفترة المختارة (اليوم افتراضياً) — البحث يشمل كل التواريخ
    if (!q) return purchases.filter((p) => inPeriod(p.date, period));
    return purchases.filter((p) =>
      p.supplierName.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || (p.supplierInvoiceNo || '').toLowerCase().includes(q) ||
      p.items.some((i) => (i.productName || '').toLowerCase().includes(q)));
  }, [purchases, searchQuery, period]);
  const calculatedTotalPurchase = filteredPurchases.reduce((sum, p) => sum + p.total, 0);
  // إطار ثابت بشريط تمرير + رسم الظاهر فقط (آلاف فواتير الشراء لا تمدّ الصفحة)
  const purchasesTable = useVirtualRows<PurchaseInvoice>(filteredPurchases, (p) => p.id, { resetKey: `${searchQuery}|${JSON.stringify(period)}` });

  return (
    <div className="p-4 2xl:p-6 bg-slate-50 dark:bg-slate-950 text-right text-slate-800 dark:text-slate-100 h-full flex flex-col gap-5" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <FileBox className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            <span>إدارة المشتريات والتوريد</span>
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">تسجيل فواتير شراء المخزون: تُضاف الكميات للمخزون وتُحدَّث تكلفة الأصناف، وحذف الفاتورة يُرجع المخزون.</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowAddModal(true); }}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg transition"
          data-testid="purchase-new"
        >
          <Plus className="w-5 h-5" />
          <span>تسجيل فاتورة شراء</span>
        </button>
      </div>

      <DatePeriodFilter value={period} onChange={setPeriod} searching={!!searchQuery.trim()} />

      {/* Stats and Search Row */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="relative w-full max-w-md">
          <input
            type="text"
            placeholder="البحث بالمورد أو رقم فاتورة المورد أو اسم صنف..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pr-12 pl-4 py-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
          />
          <Search className="w-5 h-5 text-slate-500 absolute right-4 top-3" />
        </div>
        <div className="bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 px-6 py-3 rounded-2xl flex items-center gap-3">
          <DollarSign className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <div className="font-bold">
            <span className="text-xs text-slate-500 dark:text-slate-400 block">إجمالي مشتريات التوريد</span>
            <span className="text-xl text-emerald-600 dark:text-emerald-400 font-mono inline-flex items-center gap-1.5">
              {calculatedTotalPurchase.toFixed(2)} <SaudiRiyalSymbol className="w-4 h-4" />
            </span>
          </div>
        </div>
      </div>

      {/* Purchases Table */}
      <div className="flex-1 min-h-[22rem] flex flex-col bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
        <div ref={purchasesTable.scrollRef} className="flex-1 min-h-0 overflow-auto vlist-scroll" data-testid="purchases-scroll">
          <table className="w-full text-right text-sm">
            <thead className="sticky top-0 z-[3] bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 shadow-[0_1px_0_rgba(100,116,139,0.25)]">
              <tr>
                <th className="p-4 font-bold">التاريخ</th>
                <th className="p-4 font-bold">المورد</th>
                <th className="p-4 font-bold">رقم فاتورة المورد</th>
                <th className="p-4 font-bold">الأصناف</th>
                <th className="p-4 font-bold">ضريبة المدخلات</th>
                <th className="p-4 font-bold">إجمالي الفاتورة</th>
                <th className="p-4 font-bold text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
              {filteredPurchases.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate-500">لا يوجد فواتير شراء مسجلة حالياً.</td></tr>
              ) : (<>
                <VSpacer h={purchasesTable.padTop} />
                {purchasesTable.visible.map((p) => (
                  <tr key={p.id} data-vkey={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition">
                    <td className="p-4 font-mono text-slate-500 dark:text-slate-400">{p.date}</td>
                    <td className="p-4 font-bold text-slate-700 dark:text-slate-200">{p.supplierName}</td>
                    <td className="p-4 font-mono text-slate-500 dark:text-slate-400">{p.supplierInvoiceNo || '—'}</td>
                    <td className="p-4 text-slate-500 dark:text-slate-400">{p.items.length} صنف</td>
                    <td className="p-4 font-mono text-slate-500 dark:text-slate-400">{(p.vat ?? 0).toFixed(2)}</td>
                    <td className="p-4 font-mono font-black text-emerald-600 dark:text-emerald-400">
                      <span className="inline-flex items-center gap-1">{p.total.toFixed(2)} <SaudiRiyalSymbol className="w-3.5 h-3.5" /></span>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-center gap-1.5">
                        {onUpdatePurchase && <button onClick={() => openEdit(p)} title="تعديل الفاتورة" className="p-2 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300 transition" data-testid="purchase-edit"><Pencil className="w-4 h-4" /></button>}
                        <button onClick={() => void doPrint(p)} title="طباعة" className="p-2 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300 transition" data-testid="purchase-print"><Printer className="w-4 h-4" /></button>
                        <button onClick={() => void doPdf(p)} title="حفظ PDF" className="p-2 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300 transition" data-testid="purchase-pdf"><FileDown className="w-4 h-4" /></button>
                        {onPrintLabels && <button onClick={() => onPrintLabels(p)} title="طباعة باركود الأصناف (بعدد الكميات المشتراة)" className="p-2 bg-cyan-50 dark:bg-cyan-950/40 hover:bg-cyan-100 dark:hover:bg-cyan-900/50 rounded-lg text-cyan-700 dark:text-cyan-300 transition" data-testid="purchase-labels"><Barcode className="w-4 h-4" /></button>}
                        <button onClick={() => setViewing(p)} title="عرض الأصناف" className="p-2 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300 transition"><Eye className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(p)} title="حذف الفاتورة وإرجاع المخزون" className="p-2 bg-slate-100 dark:bg-slate-900 hover:bg-rose-100 dark:hover:bg-rose-950 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg text-slate-500 dark:text-slate-400 transition"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                <VSpacer h={purchasesTable.padBottom} />
              </>)}
            </tbody>
          </table>
        </div>
      </div>

      {/* عرض أصناف فاتورة شراء */}
      {viewing && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setViewing(null); }}>
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-black">فاتورة شراء — {viewing.supplierName} <span className="font-mono text-sm text-slate-500">{viewing.date}</span></h3>
              <div className="flex items-center gap-2">
                <button onClick={() => void doPrint(viewing)} className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold flex items-center gap-1"><Printer className="w-4 h-4" /> طباعة</button>
                <button onClick={() => void doPdf(viewing)} className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold flex items-center gap-1"><FileDown className="w-4 h-4" /> PDF</button>
                {onPrintLabels && <button onClick={() => { const v = viewing; setViewing(null); onPrintLabels(v); }} className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold flex items-center gap-1" data-testid="purchase-view-labels"><Barcode className="w-4 h-4" /> طباعة الباركود</button>}
                <button onClick={() => setViewing(null)} className="text-slate-400 hover:text-rose-500"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="overflow-y-auto p-4">
              <table className="w-full text-sm text-right">
                <thead className="text-xs text-slate-500"><tr><th className="p-2">الصنف</th><th className="p-2 text-center">الوحدة</th><th className="p-2 text-center">الكمية</th><th className="p-2 text-center">السعر</th><th className="p-2 text-center">المجموع</th></tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {viewing.items.map((i, k) => (
                    <tr key={k}><td className="p-2 font-bold">{i.productName}</td><td className="p-2 text-center">{i.unitName || 'حبة'}{(i.factor || 1) > 1 ? ` (${i.factor})` : ''}</td><td className="p-2 text-center font-mono">{i.qty}</td><td className="p-2 text-center font-mono">{i.price.toFixed(2)}</td><td className="p-2 text-center font-mono font-bold">{i.total.toFixed(2)}</td></tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 text-sm font-bold flex flex-wrap gap-4 justify-end">
                {!!viewing.discount && <span>الخصم{viewing.discountType === 'percent' ? ` (${viewing.discountValue}%)` : ''}: <b className="font-mono text-rose-600">- {viewing.discount.toFixed(2)}</b></span>}
                {viewing.subtotal !== undefined && <span>قبل الضريبة: <b className="font-mono">{viewing.subtotal.toFixed(2)}</b></span>}
                {viewing.vat !== undefined && <span>الضريبة: <b className="font-mono">{viewing.vat.toFixed(2)}</b></span>}
                <span className="text-emerald-700 dark:text-emerald-400">الإجمالي: <b className="font-mono">{viewing.total.toFixed(2)}</b></span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Register Invoice Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3">
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-800 dark:text-slate-100 max-h-[94vh]" data-testid="purchase-modal">
            <div className="bg-white dark:bg-slate-900 px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-black text-lg flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <FileBox className="w-5 h-5" /> {editingPur ? `تعديل فاتورة شراء — ${editingPur.supplierName}` : 'تسجيل فاتورة شراء جديدة'}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 text-slate-500 dark:text-slate-400 hover:text-rose-500 bg-slate-100 dark:bg-slate-800 rounded-lg"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleSubmit} onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault(); }} className="flex-1 min-h-0 flex flex-col font-bold">
              <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
                {vatOnly && (
                  <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-200" data-testid="purchase-vat-only">
                    <b>🔒 على هذه الفاتورة مرتجع مشتريات:</b> يمكن تعديل وضع الضريبة فقط، والكميات والأسعار مقفلة. سيُحدَّث المرتجع المرتبط بها بنفس الوضع.
                  </div>
                )}
                {/* المورد والتاريخ ورقم فاتورة المورد */}
                <fieldset disabled={vatOnly} className="min-w-0 border-0 p-0 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs text-slate-500 dark:text-slate-400">المورد *</label>
                    <div className="flex gap-2">
                      <select value={selectedSupplierId} onChange={(e) => setSelectedSupplierId(e.target.value)} className={`${field} flex-1 min-w-0`} data-testid="purchase-supplier">
                        <option value="" disabled>{suppliers.length ? '-- اختر المورد --' : '-- لا يوجد موردون: أضف مورداً --'}</option>
                        {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      {onAddSupplier && (
                        <button type="button" onClick={() => { setNewSupplierOpen((v) => !v); setNewSupplierError(''); }} className="shrink-0 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black flex items-center gap-1" title="إضافة مورد جديد">
                          <Plus className="w-4 h-4" /> مورد جديد
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500 dark:text-slate-400">تاريخ الشراء</label>
                    <DateField value={purchaseDate} onChange={(v) => setPurchaseDate(v)} className={`${field} font-mono`} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500 dark:text-slate-400">رقم فاتورة المورد</label>
                    <input value={supplierInvoiceNo} onChange={(e) => setSupplierInvoiceNo(e.target.value)} placeholder="اختياري" className={`${field} font-mono`} />
                  </div>
                </div>

                {newSupplierOpen && (
                  <div className="border border-emerald-500/40 bg-emerald-500/5 rounded-xl p-3 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input autoFocus value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') saveNewSupplier(); }} placeholder="اسم المورد *" className={field} />
                      <input value={newSupplier.phone} onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') saveNewSupplier(); }} placeholder="الجوال" dir="ltr" className={`${field} font-mono text-right`} />
                      <input value={newSupplier.vatNumber} onChange={(e) => setNewSupplier({ ...newSupplier, vatNumber: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') saveNewSupplier(); }} placeholder="الرقم الضريبي (اختياري)" dir="ltr" className={`${field} font-mono text-right`} />
                    </div>
                    {newSupplierError && <p className="text-xs text-rose-600 dark:text-rose-400">{newSupplierError}</p>}
                    <div className="flex gap-2">
                      <button type="button" onClick={saveNewSupplier} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black">حفظ واختيار المورد</button>
                      <button type="button" onClick={() => setNewSupplierOpen(false)} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm">إلغاء</button>
                    </div>
                  </div>
                )}

                </fieldset>

                {/* الضريبة */}
                <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="purchase-vat">
                  <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 cursor-pointer">
                    <input type="checkbox" checked={vatTaxable} onChange={(e) => setVatTaxable(e.target.checked)} /> فاتورة خاضعة للضريبة ({taxRatePercent}%)
                  </label>
                  <select disabled={!vatTaxable} value={pricesInclusive ? 'inc' : 'exc'} onChange={(e) => setPricesInclusive(e.target.value === 'inc')} className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm font-bold disabled:opacity-50">
                    <option value="exc">أسعار الشراء قبل الضريبة</option>
                    <option value="inc">أسعار الشراء شاملة الضريبة</option>
                  </select>
                  <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 cursor-pointer" title="تكلفة الحبة قبل الضريبة تُحفظ في بطاقة الصنف">
                    <input type="checkbox" checked={updateCost} onChange={(e) => setUpdateCost(e.target.checked)} /> تحديث سعر التكلفة للأصناف <span className="text-[11px] text-slate-500" data-testid="cost-method-label">({costMethod === 'average' ? 'متوسط مرجّح' : 'آخر سعر شراء'})</span>
                  </label>
                </div>
                {!vatTaxable && companyVatRegistered && taxRatePercent > 0 && (
                  <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-xs font-bold text-amber-800 dark:text-amber-200 space-y-2" data-testid="purchase-untaxed-warn">
                    <p>تنبيه: الفاتورة غير خاضعة للضريبة، فتُحسب أسعارها كاملة تكلفةً للأصناف ولا تدخل ضريبتها في ضريبة المدخلات بإقرارك.</p>
                    <p className="font-semibold">إن كانت فاتورة المورد فيها ضريبة (المورد له رقم ضريبي) فأبقها خاضعة واختر «أسعار الشراء شاملة الضريبة» ليتطابق الإجمالي مع فاتورة المورد.</p>
                    <button type="button" onClick={() => { setVatTaxable(true); setPricesInclusive(true); }} data-testid="purchase-make-inclusive"
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black cursor-pointer">اجعلها خاضعة وشاملة الضريبة</button>
                  </div>
                )}

                <fieldset disabled={vatOnly} className={vatOnly ? 'min-w-0 border-0 p-0 space-y-4 opacity-60' : 'min-w-0 border-0 p-0 space-y-4'}>

                {/* إضافة الأصناف */}
                <div className="border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/30 p-3 rounded-xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1"><Tag className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> إضافة الأصناف المشتراة</p>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={onScan} placeholder="امسح الباركود + Enter" dir="ltr" className="w-56 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pr-9 pl-3 py-2 text-sm font-mono text-right focus:outline-none focus:border-emerald-500" data-testid="purchase-scan" />
                        <ScanLine className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                      </div>
                      {onAddProduct && (
                        <button type="button" onClick={() => { setNewProdOpen((v) => !v); setNewProdError(''); }} className="px-3 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-black flex items-center gap-1" data-testid="purchase-new-product">
                          <PackagePlus className="w-4 h-4" /> صنف جديد
                        </button>
                      )}
                    </div>
                  </div>

                  {newProdOpen && (
                    <div className="border border-cyan-500/40 bg-cyan-500/5 rounded-xl p-3 space-y-2" data-testid="purchase-product-form">
                      <p className="text-sm font-black text-cyan-700 dark:text-cyan-300">صنف جديد — يُضاف للأصناف ثم للفاتورة</p>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        <input autoFocus value={newProd.nameAr} onChange={(e) => setNewProd({ ...newProd, nameAr: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') saveNewProduct(); }} placeholder="اسم الصنف *" className={`${field} col-span-2`} />
                        <input value={newProd.barcode} onChange={(e) => setNewProd({ ...newProd, barcode: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') saveNewProduct(); else latinBarcodeKeyDown(e); }} placeholder="الباركود" dir="ltr" className={`${field} font-mono text-right`} />
                        <input type="number" min="0" step="0.01" value={newProd.cost} onChange={(e) => setNewProd({ ...newProd, cost: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') saveNewProduct(); }} placeholder="سعر التكلفة" className={`${field} font-mono`} />
                        <input type="number" min="0" step="0.01" value={newProd.price} onChange={(e) => setNewProd({ ...newProd, price: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') saveNewProduct(); }} placeholder="سعر البيع (اختياري)" className={`${field} font-mono`} />
                        {groups.length > 0 && (
                          <select value={newProd.groupId} onChange={(e) => setNewProd({ ...newProd, groupId: e.target.value })} className={`${field} col-span-2 md:col-span-1`}>
                            <option value="">بدون مجموعة</option>
                            {groups.map((g) => <option key={g.id} value={g.id}>{g.nameAr}</option>)}
                          </select>
                        )}
                      </div>
                      {newProdError && <p className="text-xs text-rose-600 dark:text-rose-400">{newProdError}</p>}
                      <div className="flex gap-2">
                        <button type="button" onClick={saveNewProduct} className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-black">حفظ الصنف واختياره</button>
                        <button type="button" onClick={() => setNewProdOpen(false)} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm">إلغاء</button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end">
                    <div className="col-span-2 md:col-span-5 space-y-1">
                      <label className="text-xs text-slate-500 dark:text-slate-400">الصنف</label>
                      <ProductPicker products={products} value={currentItemId} onChange={handleProductChange} placeholder="ابحث عن الصنف بالاسم أو الباركود" />
                    </div>
                    <div className="md:col-span-2 space-y-1">
                      <label className="text-xs text-slate-500 dark:text-slate-400">وحدة الشراء</label>
                      <select value={currentUnitId} onChange={(e) => handleUnitChange(e.target.value)} disabled={curUnits.length < 2} className={`${field} py-2 disabled:opacity-60`} data-testid="purchase-unit">
                        {curUnits.map((u) => <option key={u.id} value={u.id}>{u.name}{u.factor > 1 ? ` (${u.factor} حبة)` : ''}</option>)}
                      </select>
                    </div>
                    <div className="md:col-span-2 space-y-1">
                      <label className="text-xs text-slate-500 dark:text-slate-400">الكمية</label>
                      <input ref={qtyRef} type="number" min="0" step="any" value={currentQty} onChange={(e) => setCurrentQty(e.target.value)} onFocus={selectAll} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); priceRef.current?.focus(); } }} className={`${field} py-2 font-mono`} data-testid="purchase-qty" />
                    </div>
                    <div className="md:col-span-2 space-y-1">
                      <label className="text-xs text-slate-500 dark:text-slate-400">سعر الشراء للوحدة</label>
                      <input ref={priceRef} type="number" step="0.01" min="0" value={currentPrice} onChange={(e) => setCurrentPrice(e.target.value)} onFocus={selectAll} onKeyDown={(e) => { if (e.key === 'Enter') handleAddItem(); }} placeholder="0.00" className={`${field} py-2 font-mono`} data-testid="purchase-price" />
                    </div>
                    <button type="button" onClick={handleAddItem} className="col-span-2 md:col-span-1 h-[42px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black flex items-center justify-center" title="إدراج الصنف" data-testid="purchase-add-line"><Plus className="w-5 h-5" /></button>
                  </div>
                </div>

                </fieldset>

                {formError && <p className="text-sm text-rose-600 dark:text-rose-400 font-black" data-testid="purchase-error">{formError}</p>}

                {/* الأصناف المدرجة */}
                <fieldset disabled={vatOnly} className="min-w-0 border-0 p-0 space-y-4">
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-right text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-900 text-xs text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="p-2.5">الصنف</th>
                        <th className="p-2 text-center w-20">الوحدة</th>
                        <th className="p-2 text-center w-32">الكمية</th>
                        <th className="p-2 text-center w-28">سعر الوحدة</th>
                        <th className="p-2 text-center w-24">يُضاف للمخزون</th>
                        <th className="p-2 text-center w-36">تاريخ الصلاحية</th>
                        <th className="p-2 text-center w-28" title="اكتب المجموع ثم Enter: يُحسب سعر الوحدة تلقائياً بلا زيادة أو نقص هللات">المجموع ✎</th>
                        <th className="w-9" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800" data-testid="purchase-lines">
                      {lines.length === 0 ? (
                        <tr><td colSpan={8} className="p-6 text-center text-slate-400">لا توجد أصناف مضافة — ابحث عن صنف أو امسح الباركود.</td></tr>
                      ) : lines.map((l) => {
                        const p = productById.get(l.productId);
                        return (
                          <tr key={l.key} className={!(l.price > 0) ? 'bg-rose-50 dark:bg-rose-950/30' : ''}>
                            <td className="p-2 font-bold">{p?.nameAr || 'صنف غير معروف'}</td>
                            <td className="p-1.5 text-center text-xs">{l.unitName}{l.factor > 1 ? ` (${l.factor})` : ''}</td>
                            <td className="p-1.5">
                              <div className="flex items-center gap-0.5">
                                <button type="button" onClick={() => patchLine(l.key, { qty: r2(l.qty + 1) })} className="shrink-0 w-6 h-8 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center" title="زيادة"><Plus className="w-3.5 h-3.5" /></button>
                                <input type="number" min="0" step="any" value={l.qty} onChange={(e) => patchLine(l.key, { qty: Number(e.target.value) })} onFocus={selectAll} className={`${field} py-1 px-0.5 font-mono text-center min-w-0`} />
                                <button type="button" onClick={() => patchLine(l.key, { qty: Math.max(1, r2(l.qty - 1)) })} disabled={l.qty <= 1} className="shrink-0 w-6 h-8 rounded-md bg-slate-200 dark:bg-slate-700 font-black disabled:opacity-40" title="إنقاص">−</button>
                              </div>
                            </td>
                            <td className="p-1.5"><input type="number" min="0" step="any" value={Number.isInteger(l.price * 100) ? l.price : +l.price.toFixed(4)} onChange={(e) => patchLine(l.key, { price: Number(e.target.value) })} onFocus={selectAll} className={`${field} py-1 px-1 font-mono text-center text-[13px]`} data-testid="purchase-price" /></td>
                            <td className="p-1.5 text-center font-mono text-xs text-slate-500">{r2(l.qty * l.factor)} حبة</td>
                            <td className="p-1.5"><DateField value={l.expiry || ''} onChange={(v) => patchLine(l.key, { expiry: v || undefined })} title="تاريخ انتهاء صلاحية هذه الدفعة (اختياري)" data-testid="purchase-expiry"
                              className={`${field} py-1.5 px-1 text-xs font-mono ${l.expiry && l.expiry < todayYmd() ? 'border-rose-500 text-rose-600' : ''}`} /></td>
                            <td className="p-1.5"><LineTotalInput total={r2(l.qty * l.price)} onCommit={(t) => { if (l.qty > 0) patchLine(l.key, { price: Math.round((t / l.qty) * 1e6) / 1e6 }); }} /></td>
                            <td className="p-1.5 text-center"><button type="button" onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))} className="text-rose-600 dark:text-rose-400" title="حذف السطر"><Trash2 className="w-4 h-4" /></button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                </fieldset>
              </div>

              {/* الإجماليات والحفظ */}
              <div className="border-t border-slate-200 dark:border-slate-800 px-5 py-3 flex flex-col sm:flex-row justify-between items-center gap-3 bg-slate-50 dark:bg-slate-900">
                <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400">الأصناف: <b className="font-mono text-slate-700 dark:text-slate-200">{lines.length}</b></span>
                  {/* خصم الفاتورة: مبلغ أو نسبة — قبل الضريبة */}
                  <fieldset disabled={vatOnly} className="contents">
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400" data-testid="purchase-discount">
                    <span>الخصم:</span>
                    <span className="w-24 shrink-0"><input type="number" min="0" step="any" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} onFocus={selectAll} placeholder="0"
                      className={`${field} py-1 px-2 font-mono text-center text-[13px]`} data-testid="purchase-discount-value" /></span>
                    <span className="flex shrink-0 whitespace-nowrap rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 text-[11px] font-black">
                      {(['amount', 'percent'] as const).map((t) => (
                        <button key={t} type="button" onClick={() => setDiscountType(t)} data-testid={`purchase-discount-${t}`}
                          className={`px-2.5 py-1 whitespace-nowrap ${discountType === t ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>{t === 'amount' ? 'ريال' : '%'}</button>
                      ))}
                    </span>
                    {totals.discount > 0 && discountType === 'percent' && <b className="font-mono text-rose-600 whitespace-nowrap" dir="ltr">-{totals.discount.toFixed(2)}</b>}
                  </span>
                  </fieldset>
                  <span className="text-xs text-slate-500 dark:text-slate-400">قبل الضريبة: <b className="font-mono text-slate-700 dark:text-slate-200">{totals.subtotal.toFixed(2)}</b></span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">ضريبة المدخلات: <b className="font-mono text-slate-700 dark:text-slate-200">{totals.vat.toFixed(2)}</b></span>
                  <span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">الإجمالي الشامل: </span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 text-xl inline-flex items-center gap-1.5" data-testid="purchase-total">{totals.total.toFixed(2)} <SaudiRiyalSymbol className="w-4 h-4" /></span>
                  </span>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowAddModal(false)} className="px-5 py-3 rounded-xl bg-slate-200 dark:bg-slate-800 font-bold">إلغاء</button>
                  <button type="submit" className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl transition" data-testid="purchase-save">{editingPur ? 'حفظ التعديل وتحديث المخزون' : 'تسجيل الفاتورة وإضافة المخزون'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {priceFix && (() => {
        const k = salePricesIncludeTax ? 1 + taxRatePercent / 100 : 1;
        const setVal = (key: string, value: string) => setPriceFix((cur) => (cur ? { ...cur, rows: cur.rows.map((r) => (r.key === key ? { ...r, value } : r)) } : cur));
        const stillLow = priceFix.rows.filter((r) => !(Number(r.value) > 0) || Number(r.value) / k < r.cost - 0.005).length;
        const apply = () => {
          const fixes = priceFix.rows.filter((r) => Number(r.value) > 0 && Math.abs(Number(r.value) - r.oldShown) > 0.004)
            .map((r) => ({ productId: r.productId, unitId: r.unitId, price: Math.round(Number(r.value) * 100) / 100 }));
          commitPurchase(priceFix.purchase, fixes);
          if (fixes.length) notify?.(`تم تعديل سعر بيع ${fixes.length} صنف`);
        };
        return (
          <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4" data-testid="price-fix">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col border border-rose-300 dark:border-rose-900">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800">
                <h3 className="font-black text-rose-600 dark:text-rose-400">تكلفة الشراء أعلى من سعر البيع</h3>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">
                  {`هذه الأصناف ستُباع بخسارة بسعرها الحالي. عدّل سعر البيع الآن${salePricesIncludeTax ? ' (شامل الضريبة)' : ''} أو احفظ الفاتورة كما هي. السعر المقترح يحافظ على نسبة ربحك السابقة.`}
                </p>
              </div>
              <div className="overflow-auto p-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 dark:text-slate-400 font-bold">
                      <th className="text-right py-1">الصنف</th>
                      <th className="py-1">تكلفة الشراء</th>
                      <th className="py-1">سعر البيع الحالي</th>
                      <th className="py-1">أقل سعر بلا خسارة</th>
                      <th className="py-1">سعر البيع الجديد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceFix.rows.map((r) => {
                      const v = Number(r.value);
                      const low = r.value !== '' && (!(v > 0) || v / k < r.cost - 0.005);
                      return (
                        <tr key={r.key} className="border-t border-slate-100 dark:border-slate-800" data-testid="price-fix-row">
                          <td className="py-2 font-bold text-slate-800 dark:text-slate-100">{r.name}</td>
                          <td className="py-2 text-center font-mono">{r.cost.toFixed(2)}</td>
                          <td className="py-2 text-center font-mono text-rose-600 dark:text-rose-400 font-black">{r.oldShown.toFixed(2)}</td>
                          <td className="py-2 text-center font-mono">
                            <button type="button" onClick={() => setVal(r.key, r.minShown.toFixed(2))} title="استعمل هذا السعر" className="underline cursor-pointer">{r.minShown.toFixed(2)}</button>
                          </td>
                          <td className="py-2 text-center">
                            <input type="number" min="0" step="0.01" value={r.value} placeholder={r.oldShown.toFixed(2)} onChange={(e) => setVal(r.key, e.target.value)} onFocus={selectAll}
                              data-testid="price-fix-input" dir="ltr"
                              className={`w-24 rounded-lg border px-2 py-1.5 font-mono font-black text-center bg-white dark:bg-slate-950 focus:outline-none ${low ? 'border-rose-500 text-rose-600' : 'border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100'}`} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2">
                <button type="button" onClick={apply} data-testid="price-fix-apply" className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black">تعديل الأسعار وحفظ الفاتورة</button>
                <button type="button" onClick={() => commitPurchase(priceFix.purchase)} data-testid="price-fix-skip" className="px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 font-bold">حفظ بدون تعديل الأسعار</button>
                <button type="button" onClick={() => setPriceFix(null)} data-testid="price-fix-back" className="px-4 py-2.5 rounded-xl font-bold text-slate-500">رجوع للفاتورة</button>
                {stillLow > 0 && <span className="text-xs font-black text-rose-600 dark:text-rose-400" data-testid="price-fix-warn">{`${stillLow} صنف ما زال تحت التكلفة`}</span>}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
