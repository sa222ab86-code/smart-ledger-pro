import React, { useEffect, useMemo, useState } from 'react';
import { Barcode, Printer, X, Search, Plus, Pencil } from 'lucide-react';
import QuickProductModal from './QuickProductModal';
import type { Product, ProductGroup } from '../types';
import type { OsPrinter } from '../storage/persistence';
import { usePersistentState } from '../storage/persistence';
import { barcodeIssue, encodeBarcode, generateInternalEan13, labelsHtml, type LabelItem } from '../utils/barcode';
import { appFontCss, listOsPrinters, printHtmlDocument, type PrintSettings } from '../utils/printing';

interface Props {
  products: Product[];
  initialIds: string[];
  companyName: string;
  taxRatePercent?: number;
  pricesIncludeTax?: boolean;
  printSettings: PrintSettings;
  onChangePrintSettings: (updater: (prev: PrintSettings) => PrintSettings) => void;
  onUpdateProduct?: (id: string, updated: Partial<Product>) => void;
  /** إضافة صنف جديد من شاشة الطباعة (يُحدَّد تلقائياً للطباعة) */
  onAddProduct?: (product: Product) => void;
  groups?: ProductGroup[];
  notify: (msg: string) => void;
  onClose: () => void;
  /** فاتورة مشتريات: عدد الملصقات = الكمية المشتراة (العبوة تُحوَّل لحبات إن كان للصنف ملصق حبة) */
  initialCounts?: { productId: string; qty: number; unitName?: string; factor?: number }[];
  /** عنوان إضافي أعلى النافذة (مثل: فاتورة شراء — المورد) */
  subtitle?: string;
}

interface LabelSettings {
  presetId: string;
  widthMm: number;
  heightMm: number;
  showName: boolean;
  showPrice: boolean;
  showCompany: boolean;
  // ---- تحكم متقدم ----
  barHeightMm?: number;     // 0 = تلقائي
  moduleMm?: number;        // 0 = تلقائي (يملأ العرض)
  nameFontPt?: number;      // 0 = تلقائي
  priceFontPt?: number;
  codeFontPt?: number;
  companyFontPt?: number;
  boldName?: boolean;
  showBarcodeText?: boolean;
  priceBasis?: 'withTax' | 'beforeTax';
  showTaxNote?: boolean;
  taxNoteText?: string;
  currencyMode?: 'riyal' | 'text' | 'none';
  currencyText?: string;
  orientation?: 'normal' | 'landscape' | 'rotate' | 'rotate270';
}

const PRESETS: { id: string; label: string; w: number; h: number }[] = [
  { id: '50x30', label: '50 × 30 مم', w: 50, h: 30 },
  { id: '40x30', label: '40 × 30 مم', w: 40, h: 30 },
  { id: '40x25', label: '40 × 25 مم', w: 40, h: 25 },
  { id: '38x25', label: '38 × 25 مم', w: 38, h: 25 },
  { id: '38x28', label: '38 × 28 مم', w: 38, h: 28 },
  { id: '58x40', label: '58 × 40 مم', w: 58, h: 40 },
  { id: '60x40', label: '60 × 40 مم', w: 60, h: 40 },
  { id: 'custom', label: 'مقاس مخصص', w: 50, h: 30 },
];

const defaultLabelSettings: LabelSettings = {
  presetId: '50x30', widthMm: 50, heightMm: 30, showName: true, showPrice: true, showCompany: false,
  barHeightMm: 0, moduleMm: 0, nameFontPt: 0, priceFontPt: 0, codeFontPt: 0, companyFontPt: 0, boldName: true, showBarcodeText: true,
  priceBasis: 'withTax', showTaxNote: true, taxNoteText: 'شامل الضريبة', currencyMode: 'riyal', currencyText: 'ر.س', orientation: 'normal',
};

const inp = 'w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-cyan-500';

export default function BarcodeLabelsDialog({
  products, initialIds, companyName, taxRatePercent = 15, pricesIncludeTax = false, printSettings, onChangePrintSettings, onUpdateProduct, onAddProduct, groups = [], notify, onClose, initialCounts, subtitle,
}: Props) {
  const [savedSettings, setSettings] = usePersistentState<LabelSettings>('labelSettings', defaultLabelSettings);
  // الإعدادات المحفوظة من إصدار سابق لا تحتوي الحقول الجديدة
  const settings: LabelSettings = { ...defaultLabelSettings, ...savedSettings };
  const [showAdvanced, setShowAdvanced] = useState(false);
  const rate = Math.max(0, taxRatePercent) / 100;
  /** السعر المطبوع على الملصق: شامل الضريبة أو قبلها مهما كانت طريقة إدخال أسعار الأصناف */
  const labelPrice = (p: { price: number }) => {
    const withTax = pricesIncludeTax ? p.price : p.price * (1 + rate);
    const v = settings.priceBasis === 'beforeTax' ? withTax / (1 + rate) : withTax;
    return Math.round(v * 100) / 100;
  };
  /**
   * صفوف الملصقات: الصنف نفسه + كل مقاس/عبوة له (كبير، كرتون...) بباركودها وسعرها.
   * الصنف «عنوان فقط» (المقاسات هي ما يُباع) لا يظهر له صف أساسي.
   */
  type Row = { id: string; product: Product; unit?: NonNullable<Product['units']>[number]; name: string; barcode: string; price: number };
  const allRows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const p of products) {
      if (p.isBundle) continue;
      const units = (p.units || []).filter((u) => u.name && u.name.trim());
      if (!(units.length && p.sellBaseUnit === false)) out.push({ id: p.id, product: p, name: p.nameAr, barcode: p.barcode || '', price: p.price });
      for (const u of units) out.push({ id: `${p.id}::${u.id}`, product: p, unit: u, name: `${p.nameAr} - ${u.name}`, barcode: u.barcode || '', price: u.price });
    }
    return out;
  }, [products]);
  const [selected, setSelected] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    if (initialCounts?.length) {
      const add = (rid: string, n: number) => { init[rid] = Math.min(999, (init[rid] || 0) + Math.max(1, Math.ceil(n))); };
      for (const c of initialCounts) {
        const rows = allRows.filter((r) => r.product.id === c.productId);
        if (!rows.length || !(c.qty > 0)) continue;
        const base = rows.find((r) => !r.unit);
        const unitRow = c.unitName ? rows.find((r) => r.unit && r.unit.name.trim() === c.unitName!.trim()) : undefined;
        const f = c.factor && c.factor > 1 ? c.factor : 1;
        if (f > 1 && base) add(base.id, c.qty * f);       // كرتون 12 × 2 = 24 ملصق حبة
        else if (unitRow) add(unitRow.id, c.qty);
        else add((base || rows[0]).id, c.qty * f);
      }
      return init;
    }
    for (const id of initialIds) {
      const rows = allRows.filter((r) => r.product.id === id);
      // الصنف المحدد: صفه الأساسي، أو كل مقاساته إن كان «عنواناً فقط»
      const base = rows.find((r) => !r.unit);
      for (const r of base ? [base] : rows) init[r.id] = 1;
    }
    return init;
  });
  // الأصناف المفتوح عليها (أو المضافة الآن) أعلى القائمة — ثابتة حتى لا تقفز الأسطر عند التأشير
  const [pinned, setPinned] = useState<string[]>(() => [...initialIds]);
  const [addingProduct, setAddingProduct] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [generated, setGenerated] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  // فلتر الباركود: الكل / بلا باركود / تنسيق غير صالح — لتتبعها وتوليد باركود لها
  const [codeFilter, setCodeFilter] = useState<'all' | 'none' | 'invalid'>('all');
  const [silent, setSilent] = useState(printSettings.silent);
  const [osPrinters, setOsPrinters] = useState<OsPrinter[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void listOsPrinters().then(setOsPrinters); }, []);
  // المعاينة بنفس خط البرنامج المطبوع (الإطار المعزول لا يرى خطوط الصفحة)
  const [fontCss, setFontCss] = useState('');
  useEffect(() => { void appFontCss().then(setFontCss); }, []);

  const barcodeOf = (r: Row) => (generated[r.id] ?? r.barcode ?? '').trim();

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rank = (r: Row) => { const i = pinned.indexOf(r.product.id); return i < 0 ? Infinity : i; };
    return allRows
      .filter((r) => codeFilter === 'all' || barcodeIssue(generated[r.id] ?? r.barcode) === codeFilter)
      .filter((r) => !q || r.name.toLowerCase().includes(q) || (r.product.nameEn || '').toLowerCase().includes(q) || r.barcode.includes(q))
      .map((r, i) => ({ r, i, k: rank(r) }))
      .sort((a, b) => (a.k - b.k) || (a.i - b.i))
      .map((x) => x.r)
      .slice(0, 400);
  }, [allRows, search, pinned, codeFilter, generated]);
  const codeCounts = useMemo(() => {
    let none = 0, invalid = 0;
    for (const r of allRows) { const st = barcodeIssue(generated[r.id] ?? r.barcode); if (st === 'none') none++; else if (st === 'invalid') invalid++; }
    return { none, invalid };
  }, [allRows, generated]);

  const chosen = allRows.filter((r) => selected[r.id] !== undefined);
  const printable = chosen.filter((p) => !!encodeBarcode(barcodeOf(p)));
  const unprintable = chosen.filter((p) => !encodeBarcode(barcodeOf(p)));
  const totalLabels = printable.reduce((n, p) => n + (selected[p.id] || 1), 0);

  const items: LabelItem[] = useMemo(
    () => printable.flatMap((p) => Array.from({ length: selected[p.id] || 1 }, () => ({ name: p.name, barcode: barcodeOf(p), price: labelPrice(p) }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [printable.map((p) => `${p.id}:${selected[p.id]}:${barcodeOf(p)}:${p.price}:${p.name}`).join('|'), settings.priceBasis, rate, pricesIncludeTax]
  );

  const defaultTaxNote = settings.priceBasis === 'beforeTax' ? 'غير شامل الضريبة' : 'شامل الضريبة';
  const labelOpts = {
    widthMm: settings.widthMm, heightMm: settings.heightMm, showName: settings.showName,
    showPrice: settings.showPrice, showCompany: settings.showCompany, company: companyName,
    currencyMode: settings.currencyMode, currency: settings.currencyText,
    taxNote: settings.showTaxNote ? (settings.taxNoteText?.trim() || defaultTaxNote) : '',
    showBarcodeText: settings.showBarcodeText, barHeightMm: settings.barHeightMm, moduleMm: settings.moduleMm,
    nameFontPt: settings.nameFontPt, priceFontPt: settings.priceFontPt, codeFontPt: settings.codeFontPt,
    companyFontPt: settings.companyFontPt, boldName: settings.boldName, orientation: settings.orientation,
  };
  const num = (k: keyof LabelSettings, min: number, max: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setSettings((s) => ({ ...defaultLabelSettings, ...s, [k]: Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : 0 }));
  };
  const setOpt = (patch: Partial<LabelSettings>) => setSettings((s) => ({ ...defaultLabelSettings, ...s, ...patch }));
  // المعاينة دائماً بالاتجاه الطبيعي (كما سيظهر الملصق بعد خروجه من الطابعة)
  // المقاس يُحسب قبل المعاينة: الباركود فيها بخطوط بعدد صحيح من البكسلات (لا ترتعش)
  const previewW0 = settings.widthMm * 3.78;
  const previewScale0 = Math.max(0.6, Math.min(1.6, 340 / Math.max(1, previewW0), 220 / Math.max(1, settings.heightMm * 3.78)));
  const previewRaw = items.length ? labelsHtml([items[0]], { ...labelOpts, orientation: 'normal', screenSnap: { scale: previewScale0, dpr: window.devicePixelRatio || 1 } }) : '';
  const previewHtml = previewRaw && fontCss ? previewRaw.replace('</head>', `<style>${fontCss}</style></head>`) : previewRaw;
  // مفتاح المعاينة: إطار جديد كلما تغيّر محتواها (بعض الأجهزة لا تعيد رسم الإطار عند تغيير srcDoc فتبقى فارغة)
  const previewKey = useMemo(() => { let h = 0; for (let i = 0; i < previewHtml.length; i += 7) h = (h * 31 + previewHtml.charCodeAt(i)) | 0; return `${previewHtml.length}:${h}`; }, [previewHtml]);
  // المعاينة بحجم يناسب اللوحة مهما كان مقاس الملصق
  const previewW = settings.widthMm * 3.78;
  const previewScale = Math.max(0.6, Math.min(1.6, 340 / Math.max(1, previewW), 220 / Math.max(1, settings.heightMm * 3.78)));

  const toggle = (p: Row) =>
    setSelected((s) => {
      const n = { ...s };
      if (n[p.id] !== undefined) delete n[p.id]; else n[p.id] = 1;
      return n;
    });
  const setCopies = (id: string, v: number) => setSelected((s) => ({ ...s, [id]: Math.max(1, Math.min(999, Math.floor(v) || 1)) }));
  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected[p.id] !== undefined);
  const toggleAll = () =>
    setSelected((s) => {
      const n = { ...s };
      if (allVisibleSelected) visible.forEach((p) => delete n[p.id]);
      else visible.forEach((p) => { if (n[p.id] === undefined) n[p.id] = 1; });
      return n;
    });

  const setPreset = (id: string) => {
    const pr = PRESETS.find((x) => x.id === id)!;
    setSettings((s) => (id === 'custom' ? { ...s, presetId: id } : { ...s, presetId: id, widthMm: pr.w, heightMm: pr.h }));
  };

  const generateMissing = () => {
    if (!onUpdateProduct) return;
    const taken = new Set<string>(allRows.map((r) => barcodeOf(r)).filter(Boolean));
    for (const p of products) for (const b of p.barcodes || []) taken.add(b);
    const next: Record<string, string> = {};
    const unitUpdates = new Map<string, NonNullable<Product['units']>>();
    for (const r of chosen) {
      if (barcodeOf(r)) continue;
      const code = generateInternalEan13(taken);
      taken.add(code);
      next[r.id] = code;
      if (!r.unit) onUpdateProduct(r.product.id, { barcode: code });
      else {
        // عدة مقاسات لنفس الصنف: تُجمع ثم تُحفظ مرة واحدة
        const units = unitUpdates.get(r.product.id) || (r.product.units || []).map((u) => ({ ...u }));
        const u = units.find((x) => x.id === r.unit!.id); if (u) u.barcode = code;
        unitUpdates.set(r.product.id, units);
      }
    }
    for (const [pid, units] of unitUpdates) onUpdateProduct(pid, { units });
    if (Object.keys(next).length) {
      setGenerated((g) => ({ ...g, ...next }));
      notify(`تم توليد ${Object.keys(next).length} باركود وحفظه في الأصناف`);
    }
  };

  const doPrint = async () => {
    if (!items.length || busy) return;
    setBusy(true);
    try {
      const html = labelsHtml(items, labelOpts);
      const res = await printHtmlDocument(html, {
        silent,
        deviceName: printSettings.labelPrinter || undefined,
        pageSizeMm: settings.orientation === 'rotate' || settings.orientation === 'rotate270'
          ? { width: settings.heightMm, height: settings.widthMm }
          : { width: settings.widthMm, height: settings.heightMm },
        landscape: settings.orientation === 'landscape',
      });
      notify(res.ok ? `تم إرسال ${items.length} ملصق للطباعة` : `لم تتم الطباعة${res.reason ? ': ' + res.reason : ''}`);
      // بعد الطباعة يرجع عدد الملصقات لكل صنف إلى 1 (يبقى الصنف محدداً)
      if (res.ok) setSelected((sel) => Object.fromEntries(Object.keys(sel).map((k) => [k, 1])));
    } catch (e) {
      console.error(e);
      notify('تعذرت الطباعة');
    } finally {
      setBusy(false);
    }
  };

  const noBarcodeSelected = chosen.filter((p) => !barcodeOf(p)).length;

  return (
    <div className="fixed inset-0 z-[9997] bg-black/70 flex items-center justify-center p-3" dir="rtl">
      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 w-full max-w-5xl max-h-[94vh] rounded-2xl shadow-2xl flex flex-col text-right">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-black text-lg text-cyan-700 dark:text-cyan-300 flex items-center gap-2"><Barcode className="w-5 h-5" /> طباعة ملصقات الباركود{subtitle && <span className="text-xs font-bold text-slate-500 dark:text-slate-400" data-testid="labels-subtitle">— {subtitle}</span>}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-500 dark:text-slate-400" /></button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-5 gap-4 p-4 overflow-y-auto">
          {/* الأصناف */}
          <div className="lg:col-span-3 flex flex-col min-h-0">
            <div className="flex gap-2 mb-2">
              <div className="relative flex-1">
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو الباركود..." className={`${inp} pr-9`} />
                <Search className="w-4 h-4 text-slate-500 absolute right-3 top-2.5" />
              </div>
              <button onClick={toggleAll} className="px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold whitespace-nowrap">{allVisibleSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}</button>
              {onAddProduct && (
                <button type="button" onClick={() => setAddingProduct(true)} data-testid="labels-add-product" className="px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black whitespace-nowrap flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> صنف جديد</button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mb-2" data-testid="labels-code-filter">
              {([['all', `الكل (${allRows.length})`, 'bg-cyan-600'], ['none', `بلا باركود (${codeCounts.none})`, 'bg-slate-700'], ['invalid', `باركود غير صالح (${codeCounts.invalid})`, 'bg-violet-600']] as const).map(([k, label, on]) => (
                <button key={k} type="button" onClick={() => setCodeFilter(k)} data-testid={`labels-filter-${k}`}
                  className={`px-3 py-1 rounded-full text-xs font-black border transition cursor-pointer ${codeFilter === k ? `${on} text-white border-transparent` : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50'}`}>{label}</button>
              ))}
              {codeFilter === 'none' && <span className="text-[11px] font-bold text-slate-500">حدّد الكل ثم «توليد باركود» لإضافة باركود لها دفعة واحدة</span>}
              {codeFilter === 'invalid' && <span className="text-[11px] font-bold text-slate-500">صحّح الباركود من زر التعديل ✎ بجانب الصنف</span>}
            </div>
            <div className="flex-1 min-h-[240px] max-h-[48vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
              {visible.length === 0 && <div className="p-6 text-center text-slate-500 text-sm font-bold">لا توجد أصناف.</div>}
              {visible.map((p) => {
                const code = barcodeOf(p);
                const ok = !!encodeBarcode(code);
                const on = selected[p.id] !== undefined;
                return (
                  <div key={p.id} className={`flex items-center gap-3 px-3 py-2 ${on ? 'bg-cyan-500/5' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(p)} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate flex items-center gap-1.5">
                        <span className="truncate">{p.unit ? p.product.nameAr : p.name}</span>
                        {p.unit && <span className="shrink-0 text-[11px] font-black px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">{p.unit.name}</span>}
                      </div>
                      <div className={`text-[11px] font-mono ${code ? (ok ? 'text-slate-500' : 'text-amber-600 dark:text-amber-400') : 'text-rose-600 dark:text-rose-400'}`} dir="ltr">
                        {code ? (ok ? code : `${code} (غير قابل للترميز)`) : 'بدون باركود'}
                      </div>
                    </div>
                    <span className="text-xs font-mono text-cyan-700 dark:text-cyan-300" title="السعر المطبوع على الملصق">{labelPrice(p).toFixed(2)}</span>
                    {onUpdateProduct && (
                      <button type="button" onClick={() => setEditingProduct(p.product)} title="تعديل الصنف (الاسم، السعر، الباركود...)" data-testid="label-edit" className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-700 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 cursor-pointer"><Pencil className="w-3.5 h-3.5" /></button>
                    )}
                    {on && (
                      <input type="number" min={1} max={999} value={selected[p.id]} onChange={(e) => setCopies(p.id, Number(e.target.value))}
                        onFocus={(e) => { const t = e.currentTarget; setTimeout(() => t.select(), 0); }} onClick={(e) => e.currentTarget.select()}
                        title="عدد الملصقات" data-testid="label-copies" className="w-16 bg-white dark:bg-slate-950 border-2 border-cyan-500/50 rounded-lg px-2 py-1 text-sm text-center font-mono font-black focus:outline-none focus:border-cyan-600 selection:bg-cyan-200" />
                    )}
                  </div>
                );
              })}
            </div>
            {(unprintable.length > 0) && (
              <div className="mt-2 text-xs font-bold text-amber-600 dark:text-amber-400">
                {noBarcodeSelected > 0 ? `${noBarcodeSelected} صنف محدد بدون باركود. ` : ''}
                {unprintable.length - noBarcodeSelected > 0 ? `${unprintable.length - noBarcodeSelected} باركود غير قابل للترميز (حروف غير لاتينية). ` : ''}
                لن تُطبع هذه الأصناف.
              </div>
            )}
            {noBarcodeSelected > 0 && onUpdateProduct && (
              <button onClick={generateMissing} className="mt-2 self-start px-4 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-black hover:bg-amber-500/25">
                توليد باركود (EAN-13) للأصناف المحددة التي بلا باركود وحفظه فيها
              </button>
            )}
          </div>

          {/* الإعدادات والمعاينة */}
          <div className="lg:col-span-2 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400">مقاس الملصق</label>
                <select value={settings.presetId} onChange={(e) => setPreset(e.target.value)} className={inp}>
                  {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
              {settings.presetId === 'custom' && (
                <>
                  <div><label className="text-xs font-bold text-slate-500 dark:text-slate-400">العرض (مم)</label><input type="number" min={20} max={200} value={settings.widthMm} onChange={(e) => setSettings((s) => ({ ...s, widthMm: Math.max(20, Number(e.target.value) || 50) }))} className={`${inp} font-mono`} /></div>
                  <div><label className="text-xs font-bold text-slate-500 dark:text-slate-400">الارتفاع (مم)</label><input type="number" min={15} max={200} value={settings.heightMm} onChange={(e) => setSettings((s) => ({ ...s, heightMm: Math.max(15, Number(e.target.value) || 30) }))} className={`${inp} font-mono`} /></div>
                </>
              )}
              <div className="col-span-2">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400">اتجاه الطباعة <span className="font-normal">(إذا خرج الملصق طولياً أو مقلوباً جرّب خياراً آخر)</span></label>
                <div className="grid grid-cols-4 gap-1.5 mt-1" data-testid="label-orientation">
                  {([['normal', 'عادي'], ['landscape', 'أفقي'], ['rotate', 'تدوير 90°'], ['rotate270', 'تدوير 270°']] as const).map(([v, t]) => (
                    <button key={v} type="button" onClick={() => setOpt({ orientation: v })}
                      className={`py-2 rounded-xl text-xs font-black border ${(settings.orientation || 'normal') === v ? 'bg-cyan-600 text-white border-cyan-600' : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800'}`}>{t}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold">
              <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={settings.showName} onChange={(e) => setSettings((s) => ({ ...s, showName: e.target.checked }))} /> اسم الصنف</label>
              <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={settings.showPrice} onChange={(e) => setSettings((s) => ({ ...s, showPrice: e.target.checked }))} /> السعر</label>
              <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={settings.showCompany} onChange={(e) => setSettings((s) => ({ ...s, showCompany: e.target.checked }))} /> اسم المنشأة</label>
              <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={settings.showBarcodeText !== false} onChange={(e) => setOpt({ showBarcodeText: e.target.checked })} /> رقم الباركود</label>
            </div>

            {/* السعر والضريبة والعملة */}
            {settings.showPrice && (
              <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <div>
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400">السعر المطبوع</label>
                  <select value={settings.priceBasis} onChange={(e) => setOpt({ priceBasis: e.target.value as LabelSettings['priceBasis'] })} className={inp}>
                    <option value="withTax">شامل الضريبة</option>
                    <option value="beforeTax">قبل الضريبة</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400">رمز العملة</label>
                  <select value={settings.currencyMode} onChange={(e) => setOpt({ currencyMode: e.target.value as LabelSettings['currencyMode'] })} className={inp}>
                    <option value="riyal">رمز الريال الرسمي ⃁</option>
                    <option value="text">نص (ر.س / SAR)</option>
                    <option value="none">بدون</option>
                  </select>
                </div>
                {settings.currencyMode === 'text' && (
                  <div className="col-span-2"><input value={settings.currencyText} onChange={(e) => setOpt({ currencyText: e.target.value })} placeholder="ر.س" className={inp} /></div>
                )}
                <label className="col-span-2 flex items-center gap-1.5 text-sm font-bold cursor-pointer">
                  <input type="checkbox" checked={!!settings.showTaxNote} onChange={(e) => setOpt({ showTaxNote: e.target.checked })} /> إظهار عبارة الضريبة تحت السعر
                </label>
                {settings.showTaxNote && (
                  <div className="col-span-2"><input value={settings.taxNoteText} onChange={(e) => setOpt({ taxNoteText: e.target.value })} placeholder={defaultTaxNote} className={inp} /></div>
                )}
              </div>
            )}

            {/* تحكم متقدم: الخطوط والكتابة */}
            <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="text-xs font-black text-cyan-700 dark:text-cyan-300 hover:underline">
              {showAdvanced ? '▲ إخفاء' : '▼ إظهار'} التحكم بالخطوط والكتابة
            </button>
            {showAdvanced && (
              <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <div><label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">ارتفاع خطوط الباركود (مم)</label><input type="number" min={0} max={150} step={1} value={settings.barHeightMm} onChange={num('barHeightMm', 0, 150)} className={`${inp} font-mono`} /></div>
                <div><label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">سماكة الخط (مم)</label><input type="number" min={0} max={1} step={0.05} value={settings.moduleMm} onChange={num('moduleMm', 0, 1)} className={`${inp} font-mono`} /></div>
                <div><label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">حجم اسم الصنف (pt)</label><input type="number" min={0} max={40} step={0.5} value={settings.nameFontPt} onChange={num('nameFontPt', 0, 40)} className={`${inp} font-mono`} /></div>
                <div><label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">حجم السعر (pt)</label><input type="number" min={0} max={40} step={0.5} value={settings.priceFontPt} onChange={num('priceFontPt', 0, 40)} className={`${inp} font-mono`} /></div>
                <div><label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">حجم رقم الباركود (pt)</label><input type="number" min={0} max={30} step={0.5} value={settings.codeFontPt} onChange={num('codeFontPt', 0, 30)} className={`${inp} font-mono`} /></div>
                <div><label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">حجم اسم المنشأة (pt)</label><input type="number" min={0} max={30} step={0.5} value={settings.companyFontPt} onChange={num('companyFontPt', 0, 30)} className={`${inp} font-mono`} /></div>
                <label className="col-span-2 flex items-center gap-1.5 text-sm font-bold cursor-pointer"><input type="checkbox" checked={settings.boldName !== false} onChange={(e) => setOpt({ boldName: e.target.checked })} /> اسم الصنف بخط عريض</label>
                <p className="col-span-2 text-[11px] text-slate-400">القيمة 0 = تلقائي حسب مقاس الملصق. سماكة الخط تحدد عرض الباركود (0.25–0.35 مم مناسبة لمعظم القارئات).</p>
                <button type="button" onClick={() => setOpt({ barHeightMm: 0, moduleMm: 0, nameFontPt: 0, priceFontPt: 0, codeFontPt: 0, companyFontPt: 0, boldName: true })} className="col-span-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold">إرجاع الكل للتلقائي</button>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400">طابعة الملصقات</label>
              {osPrinters.length > 0 ? (
                <select value={printSettings.labelPrinter} onChange={(e) => onChangePrintSettings((p) => ({ ...p, labelPrinter: e.target.value }))} className={inp} dir="ltr">
                  <option value="">طابعة النظام الافتراضية</option>
                  {osPrinters.map((p) => <option key={p.name} value={p.name}>{p.displayName}</option>)}
                </select>
              ) : (
                <input value={printSettings.labelPrinter} onChange={(e) => onChangePrintSettings((p) => ({ ...p, labelPrinter: e.target.value }))} placeholder={window.ledger ? 'لم تُكتشف طابعات — اكتب الاسم' : 'متاح في النسخة المكتبية'} className={inp} dir="ltr" />
              )}
              <label className="flex items-center gap-2 mt-2 text-sm font-bold cursor-pointer">
                <input type="checkbox" checked={silent} onChange={(e) => setSilent(e.target.checked)} disabled={!window.ledger} />
                طباعة صامتة (مباشرة بدون نافذة الطباعة)
              </label>
            </div>

            <div>
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">معاينة (أول ملصق)</div>
              <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex items-center justify-center min-h-[150px] overflow-hidden">
                {previewHtml ? (
                  // الإطار مثبّت في الزاوية العلوية اليسرى قبل التكبير — في الواجهة العربية كان يُزاح لليمين فيظهر الملصق مقصوصاً أو أبيض
                  <div style={{ width: `${previewW * previewScale}px`, height: `${settings.heightMm * 3.78 * previewScale}px` }} className="bg-white shadow relative overflow-hidden" dir="ltr" data-testid="label-preview">
                    <iframe
                      key={previewKey}
                      title="معاينة"
                      srcDoc={previewHtml}
                      sandbox=""
                      style={{ position: 'absolute', left: 0, top: 0, width: `${previewW}px`, height: `${settings.heightMm * 3.78}px`, border: 0, transform: `scale(${previewScale})`, transformOrigin: 'top left' }}
                    />
                  </div>
                ) : (
                  <span className="text-xs font-bold text-slate-500">حدّد صنفاً له باركود لعرض المعاينة</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-3 justify-between">
          <span className="text-sm font-bold text-slate-500 dark:text-slate-400">إجمالي الملصقات: <span className="font-mono text-cyan-700 dark:text-cyan-300 text-base">{totalLabels}</span></span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-sm">إغلاق</button>
            <button disabled={!items.length || busy} onClick={doPrint} className="px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-black text-sm flex items-center gap-2 disabled:opacity-40">
              <Printer className="w-4 h-4" /> {silent && window.ledger ? 'طباعة صامتة' : 'طباعة'}
            </button>
          </div>
        </div>
      </div>
      {editingProduct && onUpdateProduct && (
        <QuickProductModal
          groups={groups}
          products={products}
          pricesIncludeTax={pricesIncludeTax}
          taxRatePercent={taxRatePercent}
          hideAddToCart
          editing={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSave={(p) => {
            const { id, ...rest } = p;
            onUpdateProduct(id, rest);
            setGenerated((g) => { const n = { ...g }; delete n[id]; return n; });
            setEditingProduct(null);
            notify(`تم تعديل «${p.nameAr}»`);
          }}
        />
      )}
      {addingProduct && onAddProduct && (
        <QuickProductModal
          groups={groups}
          products={products}
          pricesIncludeTax={pricesIncludeTax}
          taxRatePercent={taxRatePercent}
          hideAddToCart
          onClose={() => setAddingProduct(false)}
          onSave={(p) => {
            onAddProduct(p);
            setAddingProduct(false);
            setSearch('');
            setPinned((x) => [p.id, ...x]);
            setSelected((s) => ({ ...s, [p.id]: 1 }));
            notify(`تمت إضافة «${p.nameAr}» وتحديده للطباعة`);
          }}
        />
      )}
    </div>
  );
}
