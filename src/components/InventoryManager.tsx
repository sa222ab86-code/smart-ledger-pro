import React, { useState, useMemo, useDeferredValue, useRef } from 'react';
import { beepError } from '../utils/beep';
import { barcodeIssue } from '../utils/barcode';
import DateField from './DateField';
import { scanCandidates } from '../utils/docScan';
import { expiryState, expiryLabel } from '../utils/expiry';
import { usePagedList, Pagination } from '../utils/usePagedList';
import { useFitHeight } from '../utils/useFitHeight';
import { inventorySheetHtml } from '../utils/inventorySheet';
import { printHtmlDocument, exportHtmlAsPdf } from '../utils/printing';
import { usePersistentState } from '../storage/persistence';
import { printStampCss } from '../utils/printStamp';
import { contactLine } from '../utils/contact';

const arCollator = new Intl.Collator('ar');
import { 
  Package, AlertTriangle, AlertCircle, CheckCircle2, Printer, Search, 
  Filter, ArrowUpDown, TrendingDown, DollarSign, Layers, Plus, Minus,
  RefreshCw, FileText, Building2, Eye, X, Check, Boxes
} from 'lucide-react';
import { CompanySettings, Product } from '../types';
import SaudiRiyalSymbol from './SaudiRiyalSymbol';

interface Variant { id: string; name: string; price: number; }
interface ProductUnit { id: string; name: string; factor: number; price: number; barcode: string; }
interface ExtendedProduct extends Product { variants?: Variant[]; units?: ProductUnit[]; }

type StockStatus = 'available' | 'all' | 'low' | 'out' | 'in_stock' | 'negative' | 'abnormal' | 'expired' | 'expiring' | 'no_barcode' | 'bad_barcode' | 'damaged';
/** رصيد غير منطقي: أكبر من مليون حبة (غالباً أُدخل الباركود في خانة الكمية) */
const ABNORMAL = 1_000_000;
const isAbnormal = (s: number) => !Number.isFinite(s) || s >= ABNORMAL;
const fmtN = (n: number) => (Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—');

interface InventoryManagerProps {
  products: ExtendedProduct[];
  onUpdateStock: (productId: string, newStock: number) => void;
  /** تعديل سعر تكلفة الصنف (للحبة، قبل الضريبة) */
  onUpdateCost?: (productId: string, cost: number) => void;
  /** اعتماد جلسة جرد: تحديث أرصدة عدة أصناف دفعة واحدة */
  onApplyCount?: (entries: { id: string; stock: number }[]) => void;
  companySettings: CompanySettings;
  /** أيام التنبيه قبل انتهاء الصلاحية */
  expiryWarnDays?: number;
  /** تعديل تاريخ الصلاحية من الجدول */
  onUpdateExpiry?: (productId: string, expiry: string | undefined) => void;
  /** تسجيل تالف: يُخصم من الرصيد ويُضاف إلى «التالف» */
  onRecordDamage?: (productId: string, qty: number, note?: string) => void;
}

export default function InventoryManager({
  products,
  onUpdateStock,
  onApplyCount,
  onUpdateCost,
  companySettings,
  expiryWarnDays = 30,
  onUpdateExpiry,
  onRecordDamage,
}: InventoryManagerProps) {
  // نافذة تسجيل التالف
  const [damageFor, setDamageFor] = useState<ExtendedProduct | null>(null);
  const [damageQty, setDamageQty] = useState('1');
  const [damageNote, setDamageNote] = useState('');
  const tableFit = useFitHeight<HTMLDivElement>(70, 260);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchHi, setSearchHi] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState('الكل');
  // الافتراضي: الأصناف الموجودة فعلاً (رصيد > 0) — بدل إغراق الشاشة بآلاف الأصناف النافدة
  const [selectedStatus, setSelectedStatus] = useState<StockStatus>('available');
  const [sortBy, setSortBy] = useState<'stock_asc' | 'stock_desc' | 'name' | 'value_desc'>('stock_asc');
  const [defaultThreshold, setDefaultThreshold] = useState<number>(15);
  
  // Quick stock edit state
  const [editingStockProduct, setEditingStockProduct] = useState<ExtendedProduct | null>(null);
  const [stockAdjustmentQty, setStockAdjustmentQty] = useState<number>(0);
  const [costEdit, setCostEdit] = useState('');
  // تعديل التكلفة مباشرة من الجدول
  const [inlineCostId, setInlineCostId] = useState<string | null>(null);
  const [inlineCost, setInlineCost] = useState('');
  const saveInlineCost = (id: string) => {
    const v = parseFloat(inlineCost);
    if (Number.isFinite(v) && v >= 0) onUpdateCost?.(id, Math.round(v * 10000) / 10000);
    setInlineCostId(null);
  };
  const [adjustmentReason, setAdjustmentReason] = useState<'purchase' | 'audit' | 'damage' | 'return'>('audit');
  
  // Print Inventory Modal State
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.categoryAr) set.add(p.categoryAr);
    });
    return ['الكل', ...Array.from(set)];
  }, [products]);

  // Inventory Metrics
  const metrics = useMemo(() => {
    const totalItems = products.length;
    let totalUnits = 0, totalCostValue = 0, totalRetailValue = 0;
    let lowStockCount = 0, outOfStockCount = 0, availableCount = 0, negativeCount = 0, abnormalCount = 0, noCostCount = 0;
    let maxAbnormal = 0, expiredCount = 0, expiringCount = 0;

    products.forEach(p => {
      const stock = Number(p.stock) || 0;
      if (stock > 0) { const es = expiryState(p.expiryDate, expiryWarnDays); if (es === 'expired') expiredCount++; else if (es === 'soon') expiringCount++; }
      const minStock = p.minStock ?? defaultThreshold;
      if (isAbnormal(stock)) { abnormalCount++; if (stock > maxAbnormal) maxAbnormal = stock; return; } // لا يدخل في الإجماليات
      if (stock < 0) { negativeCount++; return; }
      if (stock === 0) { outOfStockCount++; return; }
      availableCount++;
      if (stock <= minStock) lowStockCount++;
      totalUnits += stock;
      if (!(p.cost > 0)) noCostCount++;
      totalCostValue += stock * (p.cost || 0);
      totalRetailValue += stock * (p.price || 0);
    });

    return { totalItems, totalUnits, totalCostValue, totalRetailValue, lowStockCount, outOfStockCount, availableCount, negativeCount, abnormalCount, maxAbnormal, noCostCount, expiredCount, expiringCount, potentialProfit: totalRetailValue - totalCostValue };
  }, [products, defaultThreshold]);

  // Filtered and Sorted Products
  const deferredSearch = useDeferredValue(searchQuery);
  // القائمة المنسدلة للبحث: أول 10 أصناف مطابقة (بالاسم أو الباركود) من كل الأصناف
  const searchSuggest = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    if (!q) return [] as ExtendedProduct[];
    const exact = products.filter(p => (p.barcode || '') === q || (p.barcodes || []).includes(q));
    const rest = products.filter(p => !exact.includes(p) && ((p.nameAr || '').toLowerCase().includes(q) || (p.nameEn || '').toLowerCase().includes(q) || (p.barcode || '').includes(q)));
    return [...exact, ...rest].slice(0, 10);
  }, [products, deferredSearch]);
  const barcodeCounts = useMemo(() => {
    let none = 0, invalid = 0;
    for (const p of products) {
      const st = barcodeIssue(p.barcode);
      if (st === 'none') none++;
      if (st === 'invalid' || (p.units || []).some((u) => barcodeIssue(u.barcode) === 'invalid')) invalid++;
    }
    return { none, invalid };
  }, [products]);
  const filteredProducts = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    return products.filter(p => {
      const minStock = p.minStock ?? defaultThreshold;
      const stock = Number(p.stock) || 0;

      // Search match
      const matchesSearch = !query || 
        (p.nameAr || '').toLowerCase().includes(query) || 
        p.nameEn?.toLowerCase().includes(query) || 
        (p.barcode || '').toLowerCase().includes(query) ||
        (p.units || []).some(u => (u.barcode || '').toLowerCase().includes(query)) ||
        (p.categoryAr || '').toLowerCase().includes(query);

      // Category match
      const matchesCategory = selectedCategory === 'الكل' || p.categoryAr === selectedCategory;

      // Status match
      let matchesStatus = true;
      const abn = isAbnormal(stock);
      if (selectedStatus === 'available') matchesStatus = stock > 0 && !abn;
      else if (selectedStatus === 'low') matchesStatus = stock > 0 && stock <= minStock;
      else if (selectedStatus === 'out') matchesStatus = stock === 0;
      else if (selectedStatus === 'in_stock') matchesStatus = stock > minStock && !abn;
      else if (selectedStatus === 'negative') matchesStatus = stock < 0;
      else if (selectedStatus === 'abnormal') matchesStatus = abn;
      else if (selectedStatus === 'expired') matchesStatus = stock > 0 && expiryState(p.expiryDate, expiryWarnDays) === 'expired';
      else if (selectedStatus === 'expiring') matchesStatus = stock > 0 && expiryState(p.expiryDate, expiryWarnDays) === 'soon';
      else if (selectedStatus === 'no_barcode') matchesStatus = barcodeIssue(p.barcode) === 'none';
      else if (selectedStatus === 'damaged') matchesStatus = (p.damaged || 0) > 0;
      else if (selectedStatus === 'bad_barcode') matchesStatus = barcodeIssue(p.barcode) === 'invalid' || (p.units || []).some((u) => barcodeIssue(u.barcode) === 'invalid');

      return matchesSearch && matchesCategory && matchesStatus;
    }).sort((a, b) => {
      const stockA = a.stock || 0;
      const stockB = b.stock || 0;
      const valueA = stockA * (a.cost || 0);
      const valueB = stockB * (b.cost || 0);

      // تبويبات الصلاحية: الأقرب انتهاءً أولاً
      if (selectedStatus === 'expired' || selectedStatus === 'expiring') return (a.expiryDate || '').localeCompare(b.expiryDate || '');
      if (sortBy === 'stock_asc') return stockA - stockB;
      if (sortBy === 'stock_desc') return stockB - stockA;
      if (sortBy === 'name') return arCollator.compare(a.nameAr || '', b.nameAr || '');
      if (sortBy === 'value_desc') return valueB - valueA;
      return 0;
    });
  }, [products, deferredSearch, selectedCategory, selectedStatus, sortBy, defaultThreshold]);
  const inventoryTable = usePagedList(filteredProducts, 50, `${deferredSearch}|${selectedCategory}|${selectedStatus}|${sortBy}`);
  // معاينة الطباعة تعرض صفحات؛ الطباعة/PDF تُبنى كمستند مقسّم صفحات A4 لكل الأصناف المصفّاة
  const previewPager = usePagedList(filteredProducts, 50, `preview|${deferredSearch}|${selectedCategory}|${selectedStatus}|${sortBy}`);
  const sheetHtml = () => {
    const parts = [
      selectedCategory !== 'الكل' ? `التصنيف: ${selectedCategory}` : 'كل التصنيفات',
      ({ available: 'الموجود', low: 'منخفض', out: 'نافد', in_stock: 'متوفر', negative: 'رصيد سالب', abnormal: 'رصيد غير منطقي', all: '' } as Record<StockStatus, string>)[selectedStatus],
      deferredSearch.trim() ? `بحث: ${deferredSearch.trim()}` : '',
    ].filter(Boolean);
    return inventorySheetHtml(filteredProducts, companySettings, defaultThreshold, parts.join(' — '));
  };

  // Handle Quick Stepper
  const handleStepStock = (productId: string, delta: number) => {
    const prod = products.find(p => p.id === productId);
    if (!prod) return;
    const current = prod.stock || 0;
    const updated = Math.max(0, current + delta);
    onUpdateStock(productId, updated);
  };

  // Handle Modal Stock Save
  const handleSaveStockAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStockProduct) return;
    const newStock = Math.max(0, stockAdjustmentQty);
    const old = editingStockProduct.stock || 0;
    if (adjustmentReason === 'damage' && onRecordDamage && newStock < old) onRecordDamage(editingStockProduct.id, old - newStock, 'تعديل الرصيد');
    else onUpdateStock(editingStockProduct.id, newStock);
    const c = parseFloat(costEdit);
    if (onUpdateCost && Number.isFinite(c) && c >= 0 && c !== (editingStockProduct.cost || 0)) onUpdateCost(editingStockProduct.id, Math.round(c * 10000) / 10000);
    setEditingStockProduct(null);
    setTimeout(() => scanRef.current?.focus(), 50); // متابعة الجرد بالمسح التالي
  };

  // 📷 جرد بالباركود: مسح الباركود (أو كتابته + Enter) يفتح تعديل رصيد الصنف مباشرة
  const [scanCode, setScanCode] = useState('');
  const [scanMsg, setScanMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  // جلسة الجرد: كل مسح يضيف للكمية المعدودة، ثم «اعتماد الجرد» يحدّث كل الأرصدة مرة واحدة (محفوظة حتى لو أُغلق البرنامج)
  const [scanMode, setScanMode] = useState<'session' | 'single'>('session');
  const [countSession, setCountSession] = usePersistentState<{ lines: { id: string; counted: number }[] }>('inventoryCountSession', { lines: [] });
  const [lastCountedId, setLastCountedId] = useState<string | null>(null);
  const productById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const addToCount = (prod: ExtendedProduct, qty: number) => {
    setCountSession(prev => {
      const i = prev.lines.findIndex(l => l.id === prod.id);
      const lines = i > -1 ? prev.lines.map((l, k) => (k === i ? { ...l, counted: Math.round((l.counted + qty) * 1000) / 1000 } : l)) : [{ id: prod.id, counted: qty }, ...prev.lines];
      return { ...prev, lines };
    });
    setLastCountedId(prod.id);
  };
  const setCounted = (id: string, counted: number) => setCountSession(prev => ({ ...prev, lines: prev.lines.map(l => (l.id === id ? { ...l, counted } : l)) }));
  const removeCounted = (id: string) => setCountSession(prev => ({ ...prev, lines: prev.lines.filter(l => l.id !== id) }));
  const applyCount = () => {
    const entries = countSession.lines.filter(l => productById.has(l.id)).map(l => ({ id: l.id, stock: Math.max(0, l.counted) }));
    if (!entries.length) return;
    if (!window.confirm(`اعتماد الجرد وتحديث رصيد ${entries.length} صنف إلى الكميات المعدودة؟\nالأصناف غير المعدودة لن تتغير.`)) return;
    if (onApplyCount) onApplyCount(entries); else entries.forEach(e => onUpdateStock(e.id, e.stock));
    setCountSession({ lines: [] });
    setLastCountedId(null);
    setScanMsg({ ok: true, text: `تم اعتماد الجرد — ${entries.length} صنف` });
  };

  const handleScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    // منع Enter من الوصول لحقل الكمية في نافذة التعديل (كان يحفظها ويغلقها فوراً)
    e.preventDefault();
    const code = scanCode.trim();
    if (!code) return;
    // الباركود كما قُرئ ثم بعد تصحيح لوحة المفاتيح العربية (÷آ{ ← INV)
    let bc = code;
    let prod: (typeof products)[number] | undefined;
    for (const c of scanCandidates(code)) {
      prod = products.find(p => p.barcode === c || (p.barcodes || []).includes(c)) || products.find(p => (p.units || []).some(u => u.barcode === c));
      if (prod) { bc = c; break; }
    }
    const unit = prod && prod.barcode !== bc && !(prod.barcodes || []).includes(bc) ? (prod.units || []).find(u => u.barcode === bc) : undefined;
    if (!prod) {
      // بحث بالاسم: نتيجة واحدة فقط تُضاف مباشرة
      const q = code.toLowerCase();
      const hits = products.filter(p => (p.nameAr || '').toLowerCase().includes(q));
      if (hits.length === 1) prod = hits[0];
      else { if (!hits.length) beepError(); setScanMsg({ ok: false, text: hits.length ? `${hits.length} صنف مطابق — اكتب الاسم بدقة أكثر أو امسح الباركود` : `لا يوجد صنف بالباركود أو الاسم «${code}»` }); setScanCode(''); return; }
    }
    setScanCode('');
    if (scanMode === 'session') {
      const f = unit?.factor && unit.factor > 0 ? unit.factor : 1;
      const prev = countSession.lines.find(l => l.id === prod!.id)?.counted || 0;
      addToCount(prod as ExtendedProduct, f);
      setScanMsg({ ok: true, text: `✓ ${prod.nameAr}${unit ? ` (+${f} ${unit.name})` : ''} — المعدود: ${fmtN(prev + f)} | بالنظام: ${fmtN(Number(prod.stock) || 0)}` });
      return;
    }
    setScanMsg({ ok: true, text: `${prod.nameAr}${unit ? ` (${unit.name} — الرصيد بالحبة)` : ''} — الرصيد الحالي ${prod.stock ?? 0}` });
    const target = prod;
    setTimeout(() => handleOpenStockEdit(target as ExtendedProduct), 60);
  };

  // Open modal with pre-filled quantity
  const handleOpenStockEdit = (prod: ExtendedProduct) => {
    setEditingStockProduct(prod);
    setStockAdjustmentQty(prod.stock || 0);
    setCostEdit(prod.cost ? String(prod.cost) : '');
    setAdjustmentReason('audit');
  };

  return (
    <div className="p-4 sm:p-6 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 min-h-full space-y-6 select-none font-sans" dir="rtl">
      
      {/* 1. Header with Title & Print Button */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 text-cyan-600 dark:text-cyan-400 rounded-2xl border border-cyan-500/30">
              <Boxes className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>إدارة ومراقبة المخزون</span>
                <span className="text-xs bg-slate-100 dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 px-2.5 py-0.5 rounded-full font-bold">
                  مستودع حي ومباشر
                </span>
              </h1>
              <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">
                متابعة أرصدة الأصناف بدقة، تنبيهات النواقص، وتقارير الجرد المعتمدة للطباعة.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setIsPrintModalOpen(true)}
            className="flex-1 sm:flex-initial px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/15 transition cursor-pointer active:scale-95"
            title="طباعة كشف جرد المستودع"
          >
            <Printer className="w-4.5 h-4.5" />
            <span>طباعة كشف جرد المخزون</span>
          </button>
        </div>
      </div>

      {/* 2. Critical Alert Banner if Low Stock or Out of Stock */}
      {(metrics.lowStockCount > 0 || metrics.outOfStockCount > 0) && (
        <div className="bg-gradient-to-l from-amber-500/15 via-rose-500/10 to-transparent border border-amber-500/40 rounded-2xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl shrink-0">
              <AlertTriangle className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <h3 className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <span>تنبيه نواقص المخزون في المستودع!</span>
                {metrics.outOfStockCount > 0 && (
                  <span className="bg-rose-500 text-white font-mono text-[10px] px-2 py-0.5 rounded-full">
                    {metrics.outOfStockCount} أصناف نفدت بالكامل
                  </span>
                )}
                {metrics.lowStockCount > 0 && (
                  <span className="bg-amber-500 text-slate-950 font-mono text-[10px] px-2 py-0.5 rounded-full">
                    {metrics.lowStockCount} أصناف قاربت على النفاد (أقل من {defaultThreshold})
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                يُرجى عمل أوامر شراء جديدة لتغذية المخزون وتفادي توقف عمليات البيع في الكاشير.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedStatus('low')}
              className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg transition cursor-pointer shadow-sm"
            >
              عرض المنخفض فقط
            </button>
            {metrics.outOfStockCount > 0 && (
              <button
                type="button"
                onClick={() => setSelectedStatus('out')}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg transition cursor-pointer shadow-sm"
              >
                عرض النافذ فقط
              </button>
            )}
            {selectedStatus !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedStatus('all')}
                className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-bold rounded-lg transition cursor-pointer"
              >
                عرض الكل
              </button>
            )}
          </div>
        </div>
      )}

      {metrics.abnormalCount > 0 && (
        <div className="rounded-2xl border-2 border-rose-400 bg-rose-50 dark:bg-rose-950/30 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3" data-testid="inv-abnormal">
          <div className="text-sm">
            <div className="font-black text-rose-800 dark:text-rose-200">⚠ {fmtN(metrics.abnormalCount)} صنف برصيد غير منطقي (أعلى رصيد: <span className="font-mono">{fmtN(metrics.maxAbnormal)}</span>)</div>
            <div className="text-xs font-bold text-rose-700 dark:text-rose-300 mt-0.5">غالباً أُدخل الباركود في خانة «الكمية» بالخطأ. هذه الأصناف مستبعدة من إجماليات الوحدات والقيمة حتى تصحّح رصيدها.</div>
          </div>
          <button type="button" onClick={() => { setSelectedStatus('abnormal'); setSearchQuery(''); }} className="shrink-0 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black">عرض وتصحيح</button>
        </div>
      )}

      {/* 3. KPI Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">إجمالي الأصناف (SKU)</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono font-black text-2xl text-slate-900 dark:text-white">{fmtN(metrics.totalItems)}</span>
            <span className="text-[10px] text-slate-500 font-bold">صنف مسجل</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">إجمالي الوحدات بالمستودع</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono font-black text-xl text-cyan-600 dark:text-cyan-400 break-all" data-testid="inv-total-units">{fmtN(metrics.totalUnits)}</span>
            <span className="text-[10px] text-cyan-600 font-bold">قطعة</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">قيمة المخزون (بالتكلفة)</span>
          <div className="mt-2">
            <span className="font-mono font-black text-xl text-emerald-600 dark:text-emerald-400 block">{fmtN(Math.round(metrics.totalCostValue * 100) / 100)}</span>
            <span className="text-[10px] text-slate-500 font-bold flex items-center gap-1 mt-0.5">
              <SaudiRiyalSymbol className="w-3 h-3 text-slate-500 dark:text-slate-400" />
              <span>(رأس المال المحجوز){metrics.noCostCount > 0 ? ` — ${fmtN(metrics.noCostCount)} صنف بلا تكلفة` : ''}</span>
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">القيمة البيعية المتوقعة</span>
          <div className="mt-2">
            <span className="font-mono font-black text-xl text-blue-600 dark:text-blue-400 block">{fmtN(Math.round(metrics.totalRetailValue * 100) / 100)}</span>
            <span className="text-[10px] text-slate-500 font-bold flex items-center gap-1 mt-0.5">
              <SaudiRiyalSymbol className="w-3 h-3 text-slate-500 dark:text-slate-400" />
              <span>(شامل هامش الربح)</span>
            </span>
          </div>
        </div>

        <div className={`border rounded-2xl p-4 flex flex-col justify-between transition-all ${
          metrics.lowStockCount > 0 
            ? 'bg-amber-950/20 border-amber-500/40 text-amber-700 dark:text-amber-300' 
            : 'bg-white dark:bg-slate-950 border-slate-200/80 dark:border-slate-800/80 text-slate-500 dark:text-slate-400'
        }`}>
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-bold">منخفض المخزون</span>
            {metrics.lowStockCount > 0 && <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />}
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className={`font-mono font-black text-2xl ${metrics.lowStockCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
              {metrics.lowStockCount}
            </span>
            <span className="text-[10px] font-bold opacity-80">&lt; {defaultThreshold} قطع</span>
          </div>
        </div>

        <div className={`border rounded-2xl p-4 flex flex-col justify-between transition-all ${
          metrics.outOfStockCount > 0 
            ? 'bg-rose-950/20 border-rose-500/40 text-rose-700 dark:text-rose-300' 
            : 'bg-white dark:bg-slate-950 border-slate-200/80 dark:border-slate-800/80 text-slate-500 dark:text-slate-400'
        }`}>
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-bold">نفد من المخزون</span>
            {metrics.outOfStockCount > 0 && <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />}
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className={`font-mono font-black text-2xl ${metrics.outOfStockCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>
              {metrics.outOfStockCount}
            </span>
            <span className="text-[10px] font-bold opacity-80">0 قطع</span>
          </div>
        </div>
      </div>

      {/* 4. Search and Filter Bar */}
      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
        {/* جرد بالباركود */}
        <div className="flex flex-col md:flex-row md:flex-wrap md:items-center gap-3 p-3 rounded-xl bg-cyan-50/60 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-900">
          <div className="relative w-full md:w-72 shrink-0">
            <input
              ref={scanRef}
              type="text"
              value={scanCode}
              onChange={(e) => setScanCode(e.target.value)}
              onKeyDown={handleScan}
              placeholder={scanMode === 'session' ? '📷 جرد: امسح الباركود (+1 لكل مسحة)' : '📷 امسح الباركود ثم Enter'}
              title={scanMode === 'session' ? 'جرد: امسح الباركود (كل مسحة = +1) أو اكتب الباركود/الاسم ثم Enter' : 'امسح الباركود أو اكتبه ثم Enter لفتح تعديل رصيد الصنف'}
              className="w-full bg-white dark:bg-slate-900 border-2 border-cyan-500 rounded-xl px-4 py-2.5 text-sm font-mono font-bold placeholder:font-sans placeholder:text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              data-testid="inv-scan"
            />
          </div>
          {/* البحث عن صنف (مع قائمة منسدلة) */}
          <div className="relative flex-1 min-w-[14rem]" data-testid="inv-search">
            <input 
              type="text" 
              placeholder="البحث باسم الصنف أو الباركود أو التصنيف..." 
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); setSearchHi(0); }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              onKeyDown={(e) => {
                if (!searchOpen || !searchSuggest.length) return;
                if (e.key === 'ArrowDown') { e.preventDefault(); setSearchHi(h => Math.min(h + 1, searchSuggest.length - 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setSearchHi(h => Math.max(0, h - 1)); }
                else if (e.key === 'Enter') { e.preventDefault(); const p = searchSuggest[searchHi]; if (p) { setSearchOpen(false); handleOpenStockEdit(p); } }
                else if (e.key === 'Escape') setSearchOpen(false);
              }}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pr-11 pl-9 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-cyan-500 font-bold"
            />
            <Search className="w-4.5 h-4.5 text-slate-500 absolute right-4 top-3" />
            {searchQuery && (
              <button 
                type="button" 
                onClick={() => { setSearchQuery(''); setSearchOpen(false); }}
                className="absolute left-3 top-2.5 p-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {searchOpen && searchQuery.trim() && (
              <div className="absolute z-30 mt-1 right-0 left-0 max-h-80 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl" data-testid="inv-search-dropdown">
                {searchSuggest.length === 0 && <div className="px-4 py-3 text-sm font-bold text-slate-500">لا توجد أصناف مطابقة</div>}
                {searchSuggest.map((p, i) => (
                  <button key={p.id} type="button" onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setSearchHi(i)}
                    onClick={() => { setSearchOpen(false); handleOpenStockEdit(p); }}
                    className={`w-full px-3 py-2 flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 last:border-0 text-right cursor-pointer ${i === searchHi ? 'bg-cyan-500/15' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                    <span className="min-w-0">
                      <span className="block text-sm font-black text-slate-800 dark:text-white truncate">{p.nameAr}</span>
                      <span className="block text-[11px] font-mono text-slate-400" dir="ltr" style={{ textAlign: 'right' }}>{p.barcode || '—'}</span>
                    </span>
                    <span className={`shrink-0 font-mono font-black text-sm ${(p.stock || 0) <= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{fmtN(p.stock || 0)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Category filter */}
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5">
            <Filter className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
            <span className="text-xs text-slate-500 dark:text-slate-400 font-bold">التصنيف:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent text-sm font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
            >
              {categories.map((cat, idx) => (
                <option key={idx} value={cat} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">{cat}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-cyan-200 dark:border-cyan-900 p-1 rounded-xl shrink-0" data-testid="inv-scan-mode">
            <button type="button" onClick={() => setScanMode('session')} className={`px-3 py-1.5 rounded-lg text-xs font-black ${scanMode === 'session' ? 'bg-cyan-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}>جلسة جرد (عدّ بالمسح)</button>
            <button type="button" onClick={() => setScanMode('single')} className={`px-3 py-1.5 rounded-lg text-xs font-black ${scanMode === 'single' ? 'bg-cyan-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}>تعديل صنف واحد</button>
          </div>
        </div>
        {scanMsg && <div className={`text-xs font-black px-1 ${scanMsg.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`} data-testid="inv-scan-msg">{scanMsg.text}</div>}
        {countSession.lines.length > 0 && (
          <div className="rounded-xl border-2 border-cyan-500/60 bg-white dark:bg-slate-900 overflow-hidden" data-testid="count-session">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-cyan-50 dark:bg-cyan-950/30 border-b border-cyan-200 dark:border-cyan-900">
              <div className="text-sm font-black text-cyan-900 dark:text-cyan-100">جلسة الجرد الحالية — {countSession.lines.length} صنف معدود <span className="text-xs font-bold text-slate-500">(محفوظة تلقائياً)</span></div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { if (window.confirm('إلغاء جلسة الجرد ومسح الكميات المعدودة؟')) { setCountSession({ lines: [] }); setLastCountedId(null); } }} className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold">إلغاء الجلسة</button>
                <button type="button" onClick={applyCount} className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black" data-testid="count-apply">اعتماد الجرد وتحديث الأرصدة</button>
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-xs text-right">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-950 text-slate-500 font-black">
                  <tr><th className="p-2">الصنف</th><th className="p-2">الباركود</th><th className="p-2 text-center">بالنظام</th><th className="p-2 text-center w-32">المعدود</th><th className="p-2 text-center">الفرق</th><th className="w-8" /></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-bold">
                  {countSession.lines.map(l => {
                    const p = productById.get(l.id);
                    const sys = Number(p?.stock) || 0;
                    const diff = Math.round((l.counted - sys) * 1000) / 1000;
                    return (
                      <tr key={l.id} className={l.id === lastCountedId ? 'bg-cyan-50 dark:bg-cyan-950/30' : ''}>
                        <td className="p-2 text-slate-900 dark:text-white">{p?.nameAr || 'صنف محذوف'}</td>
                        <td className="p-2 font-mono text-slate-500">{p?.barcode || '—'}</td>
                        <td className={`p-2 text-center font-mono ${isAbnormal(sys) ? 'text-rose-600' : ''}`}>{fmtN(sys)}</td>
                        <td className="p-2"><input type="number" min="0" step="any" value={l.counted} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setCounted(l.id, Number(e.target.value) || 0)} className="w-full text-center font-mono font-black bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 focus:outline-none focus:border-cyan-500" /></td>
                        <td className={`p-2 text-center font-mono font-black ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-600' : 'text-slate-400'}`}>{diff > 0 ? '+' : ''}{fmtN(diff)}</td>
                        <td className="p-2 text-center"><button type="button" onClick={() => removeCounted(l.id)} className="text-rose-500 hover:text-rose-700" title="إزالة من الجرد"><X className="w-4 h-4" /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="flex flex-col md:flex-row gap-3">
          {/* Status filter tabs */}
          <div className="flex flex-wrap items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 rounded-xl" data-testid="inv-status">
            <button
              type="button"
              onClick={() => setSelectedStatus('available')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                selectedStatus === 'available'
                  ? 'bg-emerald-600 text-white font-black shadow-sm'
                  : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
              }`}
              data-status="available"
            >
              الموجود ({fmtN(metrics.availableCount)})
            </button>
            {metrics.negativeCount > 0 && (
              <button type="button" onClick={() => setSelectedStatus('negative')} data-status="negative"
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${selectedStatus === 'negative' ? 'bg-purple-600 text-white font-black shadow-sm' : 'text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/30'}`}
                title="أصناف بيعت أكثر من رصيدها — تحتاج جرد أو تسجيل مشتريات">
                سالب ({fmtN(metrics.negativeCount)})
              </button>
            )}
            {metrics.abnormalCount > 0 && (
              <button type="button" onClick={() => setSelectedStatus('abnormal')} data-status="abnormal"
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${selectedStatus === 'abnormal' ? 'bg-rose-700 text-white font-black shadow-sm' : 'text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'}`}>
                ⚠ غير منطقي ({fmtN(metrics.abnormalCount)})
              </button>
            )}
            {metrics.expiredCount > 0 && (
              <button type="button" onClick={() => setSelectedStatus('expired')} data-status="expired"
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${selectedStatus === 'expired' ? 'bg-rose-600 text-white font-black shadow-sm' : 'text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'}`}>
                📅 منتهي ({fmtN(metrics.expiredCount)})
              </button>
            )}
            {metrics.expiringCount > 0 && (
              <button type="button" onClick={() => setSelectedStatus('expiring')} data-status="expiring"
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${selectedStatus === 'expiring' ? 'bg-amber-500 text-slate-950 font-black shadow-sm' : 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30'}`}
                title={`تنتهي خلال ${expiryWarnDays} يوم`}>
                ⏳ قارب على الانتهاء ({fmtN(metrics.expiringCount)})
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedStatus('all')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                selectedStatus === 'all'
                  ? 'bg-cyan-500 text-slate-950 font-black shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              الكل ({fmtN(products.length)})
            </button>
            <button
              type="button"
              onClick={() => setSelectedStatus('low')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 ${
                selectedStatus === 'low'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                  : 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>منخفض ({fmtN(metrics.lowStockCount)})</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedStatus('out')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 ${
                selectedStatus === 'out'
                  ? 'bg-rose-500 text-white font-black shadow-sm'
                  : 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'
              }`}
            >
              <AlertCircle className="w-3 h-3" />
              <span>نافد ({fmtN(metrics.outOfStockCount)})</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedStatus('in_stock')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                selectedStatus === 'in_stock'
                  ? 'bg-emerald-500 text-slate-950 font-black shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              متوفر
            </button>
            {/* فلاتر الباركود: أصناف بلا باركود / باركود بتنسيق غير صالح (لن يقرأه الماسح أو لا يُطبع) */}
            <button type="button" onClick={() => setSelectedStatus('no_barcode')} data-testid="inv-no-barcode"
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${selectedStatus === 'no_barcode' ? 'bg-slate-700 text-white font-black shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
              بلا باركود ({fmtN(barcodeCounts.none)})
            </button>
            <button type="button" onClick={() => setSelectedStatus('bad_barcode')} data-testid="inv-bad-barcode"
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${selectedStatus === 'bad_barcode' ? 'bg-violet-600 text-white font-black shadow-sm' : 'text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/30'}`}>
              باركود غير صالح ({fmtN(barcodeCounts.invalid)})
            </button>
            <button type="button" onClick={() => setSelectedStatus('damaged')} data-testid="inv-damaged"
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${selectedStatus === 'damaged' ? 'bg-orange-600 text-white font-black shadow-sm' : 'text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/30'}`}>
              التالف ({fmtN(products.filter(p => (p.damaged || 0) > 0).length)})
            </button>
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5">
            <ArrowUpDown className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
            <span className="text-xs text-slate-500 dark:text-slate-400 font-bold">الترتيب:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
            >
              <option value="stock_asc" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">الأقل كمية أولاً (الأولوية)</option>
              <option value="stock_desc" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">الأكثر كمية أولاً</option>
              <option value="name" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">الاسم أبجدياً</option>
              <option value="value_desc" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">الأعلى قيمة مخزون</option>
            </select>
          </div>
        </div>

        {/* Global Alert Threshold config */}
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 font-bold">
          <div className="flex items-center gap-2">
            <span>حد التنبيه الافتراضي لانخفاض المخزون:</span>
            <input 
              type="number" 
              min="1" 
              max="500"
              value={defaultThreshold}
              onChange={(e) => setDefaultThreshold(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-center font-mono font-bold text-cyan-600 dark:text-cyan-400 focus:outline-none focus:border-cyan-500"
            />
            <span>قطعة</span>
          </div>
          <span>المعروض: {filteredProducts.length} من أصل {products.length} صنف</span>
        </div>
      </div>

      {/* 5. Real-Time Stock Table */}
      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {/* الجدول داخل إطار بارتفاع الشاشة: شريط التمرير الأفقي يبقى ظاهراً أسفل الإطار */}
        <div ref={tableFit.ref} className="overflow-auto" style={tableFit.style} data-testid="inv-table-scroll">
          <table className="w-full text-right border-collapse text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 font-black border-b border-slate-200 dark:border-slate-800">
                <th className="p-3.5 pr-4">الباركود</th>
                <th className="p-3.5">اسم الصنف</th>
                <th className="p-3.5">التصنيف</th>
                <th className="p-3.5 text-center">سعر التكلفة</th>
                <th className="p-3.5 text-center">سعر البيع</th>
                <th className="p-3.5 text-center">الرصيد الحالي</th>
                <th className="p-3.5 text-center">حالة المخزون</th>
                <th className="p-3.5 text-center">التالف</th>
                <th className="p-3.5 text-center">الصلاحية</th>
                <th className="p-3.5 text-center">قيمة المخزون</th>
                <th className="p-3.5 text-center pl-4">تعديل سريع</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60 font-bold">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500 font-bold">
                    لا توجد أصناف تطابق معايير البحث والفلترة المحددة
                  </td>
                </tr>
              ) : (
                inventoryTable.visible.map((p) => {
                  const stock = p.stock || 0;
                  const minStock = p.minStock ?? defaultThreshold;
                  const cost = p.cost || 0;
                  const stockValue = stock * cost;
                  const isOutOfStock = stock <= 0;
                  const isLowStock = !isOutOfStock && stock <= minStock;

                  return (
                    <tr 
                      key={p.id}
                      className={`hover:bg-white/40 dark:hover:bg-slate-900/40 transition-colors ${
                        isOutOfStock 
                          ? 'bg-rose-950/10' 
                          : isLowStock 
                            ? 'bg-amber-950/10' 
                            : ''
                      }`}
                    >
                      {/* Barcode */}
                      <td className="p-3.5 pr-4 font-mono text-slate-500 dark:text-slate-400 text-[11px]">
                        {p.barcode || '—'}
                      </td>

                      {/* Name */}
                      <td className="p-3.5 text-slate-900 dark:text-white">
                        <div className="font-bold text-sm">{p.nameAr}</div>
                        {p.nameEn && p.nameEn.trim() !== (p.nameAr || '').trim() && (
                          <div className="text-[11px] text-slate-500 font-normal">{p.nameEn}</div>
                        )}
                      </td>

                      {/* Category */}
                      <td className="p-3.5">
                        <span className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300 text-[11px]">
                          {p.categoryAr}
                        </span>
                      </td>

                      {/* Cost */}
                      <td className="p-3.5 text-center font-mono text-slate-500 dark:text-slate-400">
                        {inlineCostId === p.id ? (
                          <input autoFocus type="number" min="0" step="0.01" value={inlineCost} onChange={(e) => setInlineCost(e.target.value)}
                            onFocus={(e) => e.currentTarget.select()} onBlur={() => saveInlineCost(p.id)}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveInlineCost(p.id); if (e.key === 'Escape') setInlineCostId(null); }}
                            className="w-24 text-center font-mono font-black bg-white dark:bg-slate-900 border-2 border-cyan-500 rounded-lg px-2 py-1 text-slate-900 dark:text-white focus:outline-none" data-testid="inv-cost-input" />
                        ) : (
                          <button type="button" disabled={!onUpdateCost} onClick={() => { setInlineCostId(p.id); setInlineCost(cost ? String(cost) : ''); }}
                            title="اضغط لتعديل سعر التكلفة" data-testid="inv-cost"
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed ${cost > 0 ? 'border-slate-300 dark:border-slate-700' : 'border-amber-400 text-amber-600'} hover:border-cyan-500 hover:bg-cyan-50 dark:hover:bg-cyan-950/30 cursor-pointer`}>
                            {cost > 0 ? cost.toFixed(2) : 'أدخل التكلفة'} <SaudiRiyalSymbol className="w-3 h-3 text-slate-500" />
                          </button>
                        )}
                      </td>

                      {/* Price */}
                      <td className="p-3.5 text-center font-mono text-slate-700 dark:text-slate-200">
                        <span className="inline-flex items-center gap-1">{p.price.toFixed(2)} <SaudiRiyalSymbol className="w-3 h-3 text-slate-500 dark:text-slate-400" /></span>
                      </td>

                      {/* Current Stock */}
                      <td className="p-3.5 text-center">
                        <div className="inline-flex items-center justify-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1 rounded-xl">
                          <button
                            type="button"
                            onClick={() => handleStepStock(p.id, -1)}
                            disabled={stock <= 0}
                            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-rose-600 dark:text-rose-400 rounded disabled:opacity-30 cursor-pointer"
                            title="إنقاص وحدة"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          
                          <span className={`font-mono font-black text-sm px-1.5 ${
                            isOutOfStock 
                              ? 'text-rose-500 animate-pulse' 
                              : isLowStock 
                                ? 'text-amber-600 dark:text-amber-400' 
                                : 'text-slate-900 dark:text-white'
                          }`}>
                            {fmtN(stock)}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleStepStock(p.id, 1)}
                            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded cursor-pointer"
                            title="زيادة وحدة"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </td>

                      {/* Stock Status Badge */}
                      <td className="p-3.5 text-center">
                        {isOutOfStock ? (
                          <span className="inline-flex items-center gap-1 bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 px-2.5 py-1 rounded-full text-[10px] font-bold">
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            <span>نفد من المخزون</span>
                          </span>
                        ) : isLowStock ? (
                          <span className="inline-flex items-center gap-1 bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 px-2.5 py-1 rounded-full text-[10px] font-bold">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span>منخفض ({stock}/{minStock})</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 px-2.5 py-1 rounded-full text-[10px] font-bold">
                            <CheckCircle2 className="w-3 h-3 shrink-0" />
                            <span>متوفر ({stock})</span>
                          </span>
                        )}
                      </td>

                      {/* التالف */}
                      <td className="p-3.5 text-center" data-testid="inv-damaged-cell">
                        <div className="inline-flex items-center gap-1.5">
                          <span className={`font-mono font-black ${(p.damaged || 0) > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-slate-400'}`} title={(p.damageLog || []).slice(-5).map(d => `${d.date}: ${d.qty}${d.note ? ` — ${d.note}` : ''}`).join('\n') || undefined}>{fmtN(p.damaged || 0)}</span>
                          {onRecordDamage && !p.isService && (
                            <button type="button" onClick={() => { setDamageFor(p); setDamageQty('1'); setDamageNote(''); }} data-testid="inv-damage-btn"
                              className="px-2 py-1 rounded-lg text-[11px] font-black border border-orange-300 text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/30 hover:bg-orange-100 cursor-pointer" title="تسجيل كمية تالفة (تُخصم من الرصيد)">+ تالف</button>
                          )}
                        </div>
                      </td>

                      {/* Expiry */}
                      <td className="p-3.5 text-center">
                        {(() => {
                          const es = expiryState(p.expiryDate, expiryWarnDays);
                          return (
                            <div className="flex flex-col items-center gap-0.5">
                              <DateField value={p.expiryDate || ''} onChange={(v) => onUpdateExpiry?.(p.id, v || undefined)} disabled={!onUpdateExpiry}
                                data-testid="inv-expiry" title="تاريخ انتهاء الصلاحية"
                                className={`w-36 text-xs font-mono rounded-lg px-1.5 py-1 border bg-white dark:bg-slate-900 ${es === 'expired' ? 'border-rose-500 text-rose-600 font-black' : es === 'soon' ? 'border-amber-500 text-amber-700 dark:text-amber-300 font-black' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`} />
                              {es && es !== 'ok' && p.expiryDate && <span className={`text-[10px] font-black ${es === 'expired' ? 'text-rose-600' : 'text-amber-600'}`}>{expiryLabel(p.expiryDate)}</span>}
                            </div>
                          );
                        })()}
                      </td>

                      {/* Stock Value */}
                      <td className="p-3.5 text-center font-mono text-cyan-600 dark:text-cyan-400 font-bold">
                        <span className="inline-flex items-center gap-1">{stockValue.toFixed(2)} <SaudiRiyalSymbol className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" /></span>
                      </td>

                      {/* Quick Action */}
                      <td className="p-3.5 text-center pl-4">
                        <button
                          type="button"
                          onClick={() => handleOpenStockEdit(p)}
                          className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-lg transition text-xs font-bold border border-slate-300 dark:border-slate-700 cursor-pointer"
                          title="تعديل مباشر لرصيد المخزون"
                        >
                          تعديل الرصيد
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination pager={inventoryTable} />
      </div>

      {/* 6. Quick Stock Adjustment Modal */}
      {editingStockProduct && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 text-slate-800 dark:text-slate-100 shadow-2xl relative">
            <div className="flex justify-between items-start border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-black text-base text-slate-900 dark:text-white">تعديل رصيد المخزون</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-bold mt-0.5">{editingStockProduct.nameAr}</p>
              </div>
              <button 
                type="button"
                onClick={() => setEditingStockProduct(null)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStockAdjustment} className="mt-4 space-y-4">
              <div className="bg-white/60 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold space-y-1.5">
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>الرصيد الحالي المسجل:</span>
                  <span className="font-mono text-slate-900 dark:text-white text-sm">{editingStockProduct.stock || 0} قطعة</span>
                </div>
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>الباركود:</span>
                  <span className="font-mono text-cyan-600 dark:text-cyan-400">{editingStockProduct.barcode}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-600 dark:text-slate-300 mb-1">
                  الرصيد الفعلي الجديد *
                </label>
                <input
                  type="number"
                  min="0"
                  value={stockAdjustmentQty}
                  onChange={(e) => setStockAdjustmentQty(parseInt(e.target.value) || 0)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 font-mono font-black text-lg text-slate-900 dark:text-white text-center focus:outline-none focus:border-cyan-500"
                  autoFocus
                  required
                />
              </div>

              {onUpdateCost && (
                <div>
                  <label className="block text-xs font-black text-slate-600 dark:text-slate-300 mb-1">سعر التكلفة للحبة (قبل الضريبة)</label>
                  <input type="number" min="0" step="0.01" value={costEdit} onChange={(e) => setCostEdit(e.target.value)} placeholder="0.00"
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2 font-mono font-black text-slate-900 dark:text-white text-center focus:outline-none focus:border-cyan-500" data-testid="inv-modal-cost" />
                </div>
              )}

              <div>
                <label className="block text-xs font-black text-slate-600 dark:text-slate-300 mb-1">
                  سبب التعديل:
                </label>
                <select
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value as any)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
                >
                  <option value="audit">مطابقة جرد مستودع دوري</option>
                  <option value="purchase">استلام شحنة بضاعة جديدة</option>
                  <option value="return">مرتجع مبيعات من عميل</option>
                  <option value="damage">شطب أصناف تالفة أو منتهية</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-xl text-sm transition cursor-pointer shadow-md shadow-cyan-500/20"
                >
                  حفظ وتحديث الرصيد
                </button>
                <button
                  type="button"
                  onClick={() => setEditingStockProduct(null)}
                  className="px-4 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-xl text-sm transition cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* تسجيل تالف */}
      {damageFor && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setDamageFor(null)}>
          <form className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm p-5 space-y-3 text-right shadow-2xl" onClick={(e) => e.stopPropagation()} data-testid="damage-modal"
            onSubmit={(e) => { e.preventDefault(); const q = parseFloat(damageQty); if (!(q > 0)) return; onRecordDamage?.(damageFor.id, q, damageNote.trim() || undefined); setDamageFor(null); }}>
            <h3 className="font-black text-lg text-slate-900 dark:text-white">تسجيل تالف — {damageFor.nameAr}</h3>
            <p className="text-xs font-bold text-slate-500">الرصيد الحالي: <span className="font-mono">{fmtN(damageFor.stock || 0)}</span> — التالف المسجّل: <span className="font-mono">{fmtN(damageFor.damaged || 0)}</span></p>
            <label className="block text-xs font-black text-slate-600 dark:text-slate-300">الكمية التالفة (تُخصم من الرصيد)
              <input autoFocus type="number" min="0" step="any" value={damageQty} onChange={(e) => setDamageQty(e.target.value)} onFocus={(e) => e.currentTarget.select()}
                className="mt-1 w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 font-mono font-black text-center" data-testid="damage-qty" />
            </label>
            <label className="block text-xs font-black text-slate-600 dark:text-slate-300">السبب (اختياري)
              <input value={damageNote} onChange={(e) => setDamageNote(e.target.value)} placeholder="كسر، انتهاء صلاحية، تلف أثناء النقل..." maxLength={80}
                className="mt-1 w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-bold" />
            </label>
            <div className="flex gap-2 pt-1">
              <button type="submit" className="flex-1 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-black text-sm cursor-pointer" data-testid="damage-save">تسجيل التالف</button>
              <button type="button" onClick={() => setDamageFor(null)} className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-sm cursor-pointer">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      {/* 7. Dedicated Printable Inventory List Modal (Warehouse Management Audit) */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white text-black rounded-2xl w-full max-w-4xl p-8 my-auto shadow-2xl relative font-sans text-right" dir="rtl">
            
            {/* Top Toolbar (Hidden during actual print) */}
            <div className="flex justify-between items-center border-b border-gray-200 pb-4 mb-6 print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-cyan-600" />
                <h3 className="font-black text-lg text-gray-900">معاينة كشف جرد المستودع والمخزون للطباعة</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { void printHtmlDocument(sheetHtml(), { pageSize: 'A4' }); }}
                  className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-black rounded-xl text-sm flex items-center gap-2 cursor-pointer shadow-md"
                  data-testid="inv-print"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة ({filteredProducts.length} صنف)</span>
                </button>
                <button
                  type="button"
                  onClick={() => { void exportHtmlAsPdf(sheetHtml(), `inventory-${new Date().toISOString().slice(0, 10)}.pdf`); }}
                  className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-black rounded-xl text-sm cursor-pointer"
                >
                  PDF
                </button>
                <button
                  type="button"
                  onClick={() => setIsPrintModalOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-900 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Document Body */}
            <div className="printable-inventory-sheet space-y-4">
              {/* Header */}
              <div className="flex justify-between items-start border-b-[3px] border-teal-900 pb-4">
                <div className="flex items-center gap-4">
                  {companySettings.logoUrl && (
                    <img 
                      src={companySettings.logoUrl} 
                      alt={companySettings.companyName} 
                      className="h-16 w-auto max-w-[120px] object-contain border border-gray-300 p-0.5 rounded"
                    />
                  )}
                  <div>
                    <h2 className="text-xl font-black text-black">{companySettings.companyName}</h2>
                    <p className="text-xs text-black">{companySettings.address}</p>
                    {companySettings.shortAddress?.trim() && <p className="text-xs text-black">العنوان المختصر: <span className="font-mono" dir="ltr">{companySettings.shortAddress.trim()}</span></p>}
                    <p className="text-xs text-black">الرقم الضريبي: {companySettings.vatNumber}</p>
                    {contactLine(companySettings) && <p className="text-xs text-black">{contactLine(companySettings)}</p>}
                  </div>
                </div>

                <div className="text-left font-mono text-xs space-y-1" dir="ltr">
                  <span className="inline-block bg-black text-white px-3 py-1 font-bold text-sm uppercase rounded">
                    WAREHOUSE AUDIT REPORT
                  </span>
                  <p>Date: {new Date().toLocaleDateString('ar-SA-u-ca-gregory-nu-latn')}</p>
                  <p>Time: {new Date().toLocaleTimeString('ar-SA-u-ca-gregory-nu-latn')}</p>
                  <p>Total Items: {filteredProducts.length} SKUs</p>
                </div>
              </div>

              {/* Title */}
              <div className="text-center py-2 bg-gray-100 rounded-lg border border-black">
                <h1 className="text-base font-black text-black">
                  كشف جرد ومطابقة أرصدة المستودع (Inventory Stocktake Sheet)
                </h1>
                <p className="text-[11px] text-black font-bold mt-0.5">
                  قسم إدارة المستودعات وسلاسل الإمداد - مطابقة الرصيد الدفتري مع العد الفعلي
                </p>
              </div>

              {/* Summary KPIs for Warehouse Staff */}
              <div className="grid grid-cols-4 gap-3 border border-black p-3 rounded-lg text-xs font-bold bg-gray-50">
                <div>
                  <span className="text-black block text-[10px]">إجمالي الأصناف:</span>
                  <span className="font-mono text-sm">{filteredProducts.length} صنف</span>
                </div>
                <div>
                  <span className="text-black block text-[10px]">إجمالي الرصيد بالنظام:</span>
                  <span className="font-mono text-sm">{filteredProducts.reduce((s, p) => s + (p.stock || 0), 0)} قطعة</span>
                </div>
                <div>
                  <span className="text-black block text-[10px]">إجمالي القيمة التقديرية (تكلفة):</span>
                  <span className="font-mono text-sm inline-flex items-center gap-1">
                    {filteredProducts.reduce((s, p) => s + ((p.stock || 0) * (p.cost || 0)), 0).toFixed(2)} <SaudiRiyalSymbol className="w-3.5 h-3.5 text-black" />
                  </span>
                </div>
                <div>
                  <span className="text-black block text-[10px]">أصناف بحاجة لإعادة طلب:</span>
                  <span className="font-mono text-sm text-red-600 font-black">
                    {filteredProducts.filter(p => (p.stock || 0) <= (p.minStock ?? defaultThreshold)).length} صنف
                  </span>
                </div>
              </div>

              {/* Inventory Table */}
              <table className="w-full text-center border-collapse border border-black text-[11px] my-3">
                <thead>
                  <tr className="bg-teal-900 border-b border-teal-900 font-black text-white">
                    <th className="border-r border-black p-2 w-8">م</th>
                    <th className="border-r border-black p-2 text-right pr-3">اسم الصنف</th>
                    <th className="border-r border-black p-2">الباركود</th>
                    <th className="border-r border-black p-2">التصنيف</th>
                    <th className="border-r border-black p-2">التكلفة</th>
                    <th className="border-r border-black p-2 bg-yellow-50">رصيد النظام</th>
                    <th className="border-r border-black p-2 bg-white w-20">العد الفعلي</th>
                    <th className="border-r border-black p-2 bg-white w-20">فرق الجرد</th>
                    <th className="border-r border-black p-2">الحالة</th>
                    <th className="p-2">الملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black font-bold">
                  {previewPager.visible.map((p, k) => {
                    const idx = (previewPager.page - 1) * previewPager.pageSize + k;
                    const stock = p.stock || 0;
                    const minStock = p.minStock ?? defaultThreshold;
                    const isOut = stock === 0;
                    const isLow = !isOut && stock <= minStock;

                    return (
                      <tr key={p.id} className="border-b border-gray-400">
                        <td className="border-r border-black p-1.5 font-mono text-[10px]">{idx + 1}</td>
                        <td className="border-r border-black p-1.5 text-right pr-3 font-bold">{p.nameAr}</td>
                        <td className="border-r border-black p-1.5 font-mono text-[10px]">{p.barcode}</td>
                        <td className="border-r border-black p-1.5">{p.categoryAr}</td>
                        <td className="border-r border-black p-1.5 font-mono">{(p.cost || 0).toFixed(2)}</td>
                        <td className="border-r border-black p-1.5 font-mono font-black bg-yellow-50">{stock}</td>
                        
                        {/* Blank Physical Count Box for Manual Warehouse Stocktaking */}
                        <td className="border-r border-black p-1.5 bg-white">
                          <div className="border border-dashed border-gray-400 h-6 rounded flex items-center justify-center"></div>
                        </td>

                        {/* Blank Variance Box */}
                        <td className="border-r border-black p-1.5 bg-white">
                          <div className="border border-dashed border-gray-400 h-6 rounded flex items-center justify-center"></div>
                        </td>

                        {/* Status */}
                        <td className="border-r border-black p-1.5 text-[10px]">
                          {isOut ? (
                            <span className="text-red-700 font-black">نافذ (0)</span>
                          ) : isLow ? (
                            <span className="text-amber-700 font-bold">منخفض ({stock})</span>
                          ) : (
                            <span className="text-green-700">متوفر</span>
                          )}
                        </td>

                        {/* Notes */}
                        <td className="p-1.5">
                          <div className="border-b border-gray-300 h-4"></div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {filteredProducts.length > previewPager.pageSize && (
                <div className="no-print"><Pagination pager={previewPager} unit="صنف" /></div>
              )}

              {/* Signatures & Auditor Sign-off */}
              <div className="grid grid-cols-3 gap-6 pt-6 mt-6 border-t-2 border-black text-xs text-center font-bold">
                <div>
                  <p className="text-gray-700">أمين المستودع (القائم بالجرد):</p>
                  <p className="text-gray-400 mt-6 border-b border-dashed border-gray-500 pb-1">الاسم والتوقيع: ............................</p>
                </div>
                <div>
                  <p className="text-gray-700">المحاسب المالي / المدقق:</p>
                  <p className="text-gray-400 mt-6 border-b border-dashed border-gray-500 pb-1">الاسم والتوقيع: ............................</p>
                </div>
                <div>
                  <p className="text-gray-700">اعتماد مدير العمليات / الإدارة:</p>
                  <p className="text-gray-400 mt-6 border-b border-dashed border-gray-500 pb-1">الاسم والختم: ............................</p>
                </div>
              </div>

              {/* Footer */}
              <div className="text-center text-[10px] text-black pt-4 border-t border-gray-300">
                <p>تم استخراج هذا التقرير آلياً عبر نظام الدفتر الذكي لإدارة المخزون ونقاط البيع • {new Date().toLocaleString('ar-SA-u-ca-gregory-nu-latn')}</p>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Global Print Styles for Clean Paper Output */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .printable-inventory-sheet, .printable-inventory-sheet * {
            visibility: visible;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .printable-inventory-sheet {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 10mm;
            background: white !important;
            color: black !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm 10mm 14mm;
            @bottom-center { content: "صفحة " counter(page) " من " counter(pages); font: 10px Tahoma, Arial, sans-serif; color: #000; }
            ${printStampCss()}
          }
        }
      `}</style>

    </div>
  );
}
