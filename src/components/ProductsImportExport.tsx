import { useRef, useState } from 'react';
import { Download, Upload, FileSpreadsheet, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { Product, ProductGroup, ProductUnit } from '../types';
import { parseCsv, parseNumber, toCsv } from '../utils/csv';
import { readFileAsText, saveTextFile, todayStamp } from '../utils/files';

export interface ProductsImportResult {
  newProducts: Product[];
  updates: Record<string, Partial<Product>>;
  newGroups: ProductGroup[];
}

interface Props {
  products: Product[];
  groups: ProductGroup[];
  onImport: (result: ProductsImportResult) => void;
  notify?: (msg: string) => void;
}

/**
 * ملف واحد (CSV يفتح في Excel):
 *  - سطر لكل صنف كالمعتاد
 *  - الأحجام/العبوات: سطر تحت صنفها، عمود «خيار لـ» فيه باركود الصنف الأصل (أو اسمه)،
 *    و«الاسم العربي» = اسم الحجم (كبير، كرتون...)، و«المضاعف» = عدد الحبات (1 للحجم، 12 للكرتون مثلاً)
 *  - «يباع الأساسي»: لا = الصنف عنوان فقط ويُباع بأحجامه
 */
const HEADERS = ['المعرف', 'الباركود', 'الاسم العربي', 'الاسم الإنجليزي', 'المجموعة', 'سعر البيع', 'التكلفة', 'المخزون', 'حد التنبيه', 'الوصف', 'خيار لـ', 'المضاعف', 'يباع الأساسي'];

/** توحيد النص للمقارنة: إزالة المسافات والتشكيل وتوحيد الهمزات */
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\s_\-()/.]/g, '');

const ALIASES: Record<string, string[]> = {
  id: ['id', 'المعرف', 'معرف', 'الرقم'],
  barcode: ['barcode', 'الباركود', 'باركود', 'sku'],
  nameAr: ['namear', 'الاسمالعربي', 'الاسم', 'اسم', 'اسمالصنف', 'الصنف', 'اسمالمنتج', 'المنتج', 'name'],
  nameEn: ['nameen', 'الاسمالانجليزي', 'الاسمبالانجليزي', 'englishname'],
  group: ['group', 'المجموعه', 'التصنيف', 'الفئه', 'القسم', 'category'],
  price: ['price', 'سعرالبيع', 'السعر', 'سعر'],
  cost: ['cost', 'التكلفه', 'سعرالتكلفه', 'سعرالشراء', 'تكلفه'],
  stock: ['stock', 'المخزون', 'الكميه', 'الرصيد', 'كميه'],
  minStock: ['minstock', 'حدالتنبيه', 'الحدالادني', 'حدادني'],
  description: ['description', 'الوصف', 'وصف', 'وصفالصنف'],
  parent: ['parent', 'خيارل', 'خيارلـ', 'الصنفالاصل', 'تابعل', 'خيار'],
  factor: ['factor', 'المضاعف', 'عددالحبات', 'الحبات'],
  sellBase: ['sellbase', 'يباعالاساسي', 'بيعالاساسي'],
};

interface Parsed {
  newProducts: Product[];
  updates: Record<string, Partial<Product>>;
  newGroups: ProductGroup[];
  errors: string[];
  created: number;
  updated: number;
  /** عدد الأحجام/العبوات في الملف */
  options?: number;
}

export function analyse(text: string, products: Product[], groups: ProductGroup[], allowUpdate: boolean): Parsed {
  const table = parseCsv(text);
  const out: Parsed = { newProducts: [], updates: {}, newGroups: [], errors: [], created: 0, updated: 0 };
  if (table.length < 2) { out.errors.push('الملف فارغ أو لا يحتوي على صفوف بيانات.'); return out; }

  const headerNorm = table[0].map(norm);
  const col: Record<string, number> = {};
  for (const [key, names] of Object.entries(ALIASES)) {
    const idx = headerNorm.findIndex((h) => names.map(norm).includes(h));
    if (idx >= 0) col[key] = idx;
  }
  if (col.nameAr === undefined) { out.errors.push('لم أجد عمود "الاسم العربي" في الصف الأول. استخدم قالب الاستيراد.'); return out; }
  if (col.price === undefined) { out.errors.push('لم أجد عمود "سعر البيع" في الصف الأول. استخدم قالب الاستيراد.'); return out; }

  const get = (r: string[], k: string) => (col[k] === undefined ? '' : (r[col[k]] ?? '').trim());

  const byId = new Map(products.map((p) => [p.id, p]));
  const byBarcode = new Map(products.filter((p) => p.barcode).map((p) => [p.barcode.trim(), p]));
  const byName = new Map(products.map((p) => [norm(p.nameAr), p]));
  const groupByName = new Map(groups.map((g) => [norm(g.nameAr), g]));
  const seenKeys = new Set<string>();
  const stamp = Date.now();

  const optionRows: { r: string[]; line: number }[] = [];
  /** الصنف الناتج بعد الاستيراد (جديد أو موجود) — لربط الأحجام بأصلها */
  const resolved: { key: string; product: Product; isNew: boolean }[] = [];
  table.slice(1).forEach((r, i) => {
    const line = i + 2;
    if (get(r, 'parent')) { optionRows.push({ r, line }); return; }
    const nameAr = get(r, 'nameAr');
    if (!nameAr) { out.errors.push(`سطر ${line}: الاسم فارغ — تم تجاهله.`); return; }
    const price = parseNumber(get(r, 'price'));
    if (price === null || price < 0) { out.errors.push(`سطر ${line} (${nameAr}): سعر البيع غير صالح — تم تجاهله.`); return; }
    const costRaw = parseNumber(get(r, 'cost'));
    const stockRaw = parseNumber(get(r, 'stock'));
    const minRaw = parseNumber(get(r, 'minStock'));
    const barcode = get(r, 'barcode');
    const id = get(r, 'id');
    const groupName = get(r, 'group');
    const description = get(r, 'description');

    // تكرار نفس الصنف داخل الملف
    const dupKey = barcode ? `b:${barcode}` : `n:${norm(nameAr)}`;
    if (seenKeys.has(dupKey)) { out.errors.push(`سطر ${line} (${nameAr}): مكرر داخل الملف — تم تجاهله.`); return; }
    seenKeys.add(dupKey);

    // المجموعة (تُنشأ تلقائياً إن لم توجد)
    let group: ProductGroup | undefined;
    if (groupName) {
      group = groupByName.get(norm(groupName));
      if (!group) {
        group = { id: `grp-imp-${stamp}-${out.newGroups.length}`, nameAr: groupName, isActive: true, displayOrder: groups.length + out.newGroups.length + 1 };
        groupByName.set(norm(groupName), group);
        out.newGroups.push(group);
      }
    }

    const existing = (id && byId.get(id)) || (barcode && byBarcode.get(barcode)) || byName.get(norm(nameAr));

    if (existing) {
      if (!allowUpdate) { out.errors.push(`سطر ${line} (${nameAr}): موجود مسبقاً — تم تجاهله.`); return; }
      const patch: Partial<Product> = { nameAr, price };
      const nameEn = get(r, 'nameEn');
      if (nameEn) patch.nameEn = nameEn;
      if (barcode) patch.barcode = barcode;
      if (costRaw !== null) patch.cost = costRaw;
      if (stockRaw !== null) patch.stock = stockRaw;
      if (minRaw !== null) patch.minStock = minRaw;
      if (description) patch.description = description;
      if (group) { patch.groupId = group.id; patch.categoryAr = group.nameAr; patch.categoryEn = group.nameEn || existing.categoryEn || ''; }
      const sb = get(r, 'sellBase');
      if (sb) patch.sellBaseUnit = !/^(لا|no|0|false)$/i.test(sb);
      out.updates[existing.id] = patch;
      out.updated++;
      resolved.push({ key: barcode || nameAr, product: existing, isNew: false });
    } else {
      out.newProducts.push({
        id: `prod-imp-${stamp}-${i}`,
        nameAr,
        nameEn: get(r, 'nameEn'),
        price,
        cost: costRaw ?? 0,
        stock: stockRaw ?? 0,
        minStock: minRaw ?? undefined,
        barcode,
        categoryAr: group?.nameAr ?? '',
        categoryEn: group?.nameEn ?? '',
        groupId: group?.id,
        description: description || undefined,
        ...(get(r, 'sellBase') ? { sellBaseUnit: !/^(لا|no|0|false)$/i.test(get(r, 'sellBase')) } : {}),
      });
      out.created++;
      resolved.push({ key: barcode || nameAr, product: out.newProducts[out.newProducts.length - 1], isNew: true });
    }
  });

  // الأحجام والعبوات: تُضاف لصنفها الأصل (من نفس الملف أو الموجود في البرنامج)
  const unitsFor = new Map<string, { product: Product; isNew: boolean; units: ProductUnit[] }>();
  let n = 0, optCount = 0;
  for (const { r, line } of optionRows) {
    const ref = get(r, 'parent');
    const name = get(r, 'nameAr');
    if (!name) { out.errors.push(`سطر ${line}: اسم الحجم فارغ — تم تجاهله.`); continue; }
    const hit = resolved.find((x) => x.key === ref || (x.product.barcode || '').trim() === ref || norm(x.product.nameAr) === norm(ref) || x.product.id === ref);
    const parent = hit?.product || byId.get(ref) || byBarcode.get(ref) || byName.get(norm(ref));
    if (!parent) { out.errors.push(`سطر ${line} (${name}): لم أجد الصنف الأصل «${ref}» — تم تجاهله.`); continue; }
    const isNew = !!hit?.isNew;
    if (!unitsFor.has(parent.id)) unitsFor.set(parent.id, { product: parent, isNew, units: isNew ? [] : [...(parent.units || [])] });
    const entry = unitsFor.get(parent.id)!;
    const price = parseNumber(get(r, 'price'));
    if (price === null || price < 0) { out.errors.push(`سطر ${line} (${parent.nameAr} - ${name}): سعر البيع غير صالح — تم تجاهله.`); continue; }
    const factor = parseNumber(get(r, 'factor'));
    const cost = parseNumber(get(r, 'cost'));
    const barcode = get(r, 'barcode');
    const i = entry.units.findIndex((u) => (barcode && (u.barcode || '').trim() === barcode) || norm(u.name) === norm(name));
    const unit: ProductUnit = {
      id: i >= 0 ? entry.units[i].id : `u-imp-${stamp}-${n++}`,
      name,
      factor: factor && factor > 0 ? factor : 1,
      price,
      barcode: barcode || (i >= 0 ? entry.units[i].barcode || '' : ''),
      ...(cost !== null ? { cost } : i >= 0 && entry.units[i].cost !== undefined ? { cost: entry.units[i].cost } : {}),
      ...(i >= 0 && entry.units[i].unitType ? { unitType: entry.units[i].unitType } : {}),
    };
    optCount++;
    if (i >= 0) { if (!allowUpdate && !isNew) { out.errors.push(`سطر ${line} (${parent.nameAr} - ${name}): الحجم موجود مسبقاً — تم تجاهله.`); continue; } entry.units[i] = unit; }
    else entry.units.push(unit);
  }
  for (const [id, { product, isNew, units }] of unitsFor) {
    if (isNew) product.units = units;
    else {
      if (!(id in out.updates)) out.updated++;
      out.updates[id] = { ...(out.updates[id] || {}), units };
    }
  }
  out.options = optCount;
  return out;
}

export default function ProductsImportExport({ products, groups, onImport, notify }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [allowUpdate, setAllowUpdate] = useState(true);

  const parsed = text === null ? null : analyse(text, products, groups, allowUpdate);

  const exportProducts = async () => {
    const groupName = (p: Product) => groups.find((g) => g.id === p.groupId)?.nameAr || p.categoryAr || '';
    const rows = [
      HEADERS,
      ...products.filter((p) => !p.isBundle).flatMap((p) => {
        const units = (p.units || []).filter((u) => u.name && u.name.trim());
        const ref = (p.barcode || '').trim() || p.nameAr;
        return [
          [p.id, p.barcode, p.nameAr, p.nameEn, groupName(p), p.price, p.cost, p.stock, p.minStock ?? '', p.description ?? '', '', '', units.length ? (p.sellBaseUnit === false ? 'لا' : 'نعم') : ''],
          // كل حجم/عبوة في سطر تحت صنفه
          ...units.map((u) => ['', u.barcode || '', u.name, '', '', u.price, u.cost ?? '', '', '', '', ref, u.factor || 1, '']),
        ];
      }),
    ];
    const ok = await saveTextFile(`products-${todayStamp()}.csv`, toCsv(rows), 'csv');
    const opts = rows.slice(1).filter((r) => r[10]).length;
    if (ok) notify?.(`تم تصدير ${rows.length - 1 - opts} صنف${opts ? ` و${opts} حجم/عبوة` : ''}`);
  };

  const downloadTemplate = async () => {
    await saveTextFile('products-template.csv', toCsv([HEADERS]), 'csv');
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      setText(await readFileAsText(f));
      setFileName(f.name);
    } catch {
      notify?.('تعذر قراءة الملف');
    }
  };

  const close = () => { setText(null); setFileName(''); };

  const confirm = () => {
    if (!parsed) return;
    onImport({ newProducts: parsed.newProducts, updates: parsed.updates, newGroups: parsed.newGroups });
    notify?.(`تم الاستيراد: ${parsed.created} جديد، ${parsed.updated} محدَّث`);
    close();
  };

  const btn = 'px-3 py-2 bg-slate-800 hover:bg-slate-700 font-bold rounded-xl text-xs flex items-center gap-1.5 transition border cursor-pointer';

  return (
    <>
      <input ref={fileRef} type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={onPick} />
      <button onClick={() => fileRef.current?.click()} className={`${btn} text-emerald-400 border-emerald-500/20`}><Upload className="w-4 h-4" /><span>استيراد</span></button>
      <button onClick={exportProducts} className={`${btn} text-amber-400 border-amber-500/20`}><Download className="w-4 h-4" /><span>تصدير</span></button>
      <button onClick={downloadTemplate} title={"قالب فارغ بالأعمدة المطلوبة.\nالأحجام والعبوات: سطر تحت الصنف، اكتب في «خيار لـ» باركود الصنف الأصل (أو اسمه)، وفي «الاسم العربي» اسم الحجم، وفي «المضاعف» عدد الحبات (1 للحجم، 12 للكرتون)."} className={`${btn} text-slate-300 border-slate-600/40`}><FileSpreadsheet className="w-4 h-4" /><span>القالب</span></button>

      {parsed && (
        <div className="fixed inset-0 z-[9998] bg-black/60 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-black text-lg">استيراد الأصناف — {fileName}</h3>
              <button onClick={close} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 overflow-y-auto space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-3"><div className="text-2xl font-black text-emerald-600">{parsed.created}</div><div className="text-xs font-bold">صنف جديد</div></div>
                <div className="rounded-xl bg-sky-50 dark:bg-sky-900/20 p-3"><div className="text-2xl font-black text-sky-600">{parsed.updated}</div><div className="text-xs font-bold">سيتم تحديثه</div></div>
                <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 p-3"><div className="text-2xl font-black text-amber-600">{parsed.errors.length}</div><div className="text-xs font-bold">تنبيه / متجاهَل</div></div>
              </div>
              {!!parsed.options && <p className="text-xs font-bold text-cyan-700 dark:text-cyan-300" data-testid="import-options">يشمل {parsed.options} حجم/عبوة مربوطة بأصنافها</p>}
              {parsed.newGroups.length > 0 && (
                <p className="text-xs font-bold text-slate-500">ستُنشأ {parsed.newGroups.length} مجموعة جديدة: {parsed.newGroups.map((g) => g.nameAr).join('، ')}</p>
              )}
              <label className="flex items-center gap-2 font-bold cursor-pointer">
                <input type="checkbox" checked={allowUpdate} onChange={(e) => setAllowUpdate(e.target.checked)} />
                تحديث الأصناف الموجودة (بالمعرف أو الباركود أو الاسم)
              </label>
              {parsed.errors.length > 0 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/10 p-3 max-h-40 overflow-y-auto space-y-1">
                  {parsed.errors.slice(0, 50).map((m, i) => (
                    <div key={i} className="flex gap-2 text-xs"><AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" /><span>{m}</span></div>
                  ))}
                  {parsed.errors.length > 50 && <div className="text-xs text-slate-500">... و{parsed.errors.length - 50} تنبيه آخر</div>}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex gap-2 justify-end">
              <button onClick={close} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-sm">إلغاء</button>
              <button
                disabled={parsed.created + parsed.updated === 0}
                onClick={confirm}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm flex items-center gap-2 disabled:opacity-40"
              >
                <CheckCircle2 className="w-4 h-4" /> تأكيد الاستيراد
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
