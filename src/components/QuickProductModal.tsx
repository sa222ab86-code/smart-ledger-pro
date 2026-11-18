import { useState } from 'react';
import { undoubleScan } from '../utils/beep';
import { latinBarcodeKeyDown } from '../utils/docScan';
import { X, PackagePlus } from 'lucide-react';
import type { Product, ProductGroup } from '../types';
import { generateInternalEan13 } from '../utils/barcode';
import ProfitHint from './ProfitHint';

interface Props {
  groups: ProductGroup[];
  products: Product[];
  onSave: (product: Product, addToCartNow: boolean) => void;
  onClose: () => void;
  /** إعداد المنشأة: الأسعار المدخلة شاملة الضريبة؟ */
  pricesIncludeTax?: boolean;
  taxRatePercent?: number;
  /** بلا خيار «إضافته إلى السلة» (مثل الإضافة من شاشة طباعة الباركود) */
  hideAddToCart?: boolean;
  /** تعديل صنف موجود (الاسم، السعر، التكلفة، المجموعة، الباركود، الوصف) — المخزون يُعدَّل من الجرد */
  editing?: Product;
  /** المجموعة المفتوحة في شاشة البيع: الصنف الجديد يُضاف إليها */
  defaultGroupId?: string;
}

const field =
  'w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-cyan-500';
const label = 'block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1';

export default function QuickProductModal({ groups, products, onSave, onClose, pricesIncludeTax, taxRatePercent, hideAddToCart, editing, defaultGroupId }: Props) {
  const [nameAr, setNameAr] = useState(editing?.nameAr ?? '');
  const [price, setPrice] = useState(editing ? String(editing.price ?? '') : '');
  // التكلفة تُدخل شاملة الضريبة حين تكون الأسعار شاملة، وتُخزَّن صافية
  const costK = pricesIncludeTax && (taxRatePercent ?? 15) > 0 ? 1 + (taxRatePercent ?? 15) / 100 : 1;
  const loadedCost = editing?.cost ? (costK === 1 ? String(editing.cost) : String(+(editing.cost * costK).toFixed(2))) : '';
  const [cost, setCost] = useState(loadedCost);
  const netCost = () => (editing?.cost && cost === loadedCost ? editing.cost : costK === 1 ? parseFloat(cost) || 0 : Math.round(((parseFloat(cost) || 0) / costK) * 10000) / 10000);
  const [stock, setStock] = useState('');
  const [barcode, setBarcode] = useState(editing?.barcode ?? '');
  const [groupId, setGroupId] = useState(editing?.groupId ?? defaultGroupId ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [addNow, setAddNow] = useState(true);
  // صنف خدمي (بلا مخزون) — غير محدد افتراضياً = صنف مخزني
  const [isService, setIsService] = useState(!!editing?.isService);
  const [error, setError] = useState('');

  const activeGroups = groups.filter((g) => g.isActive !== false);

  const genBarcode = () => setBarcode(generateInternalEan13(products.map((p) => p.barcode || '')));

  const submit = () => {
    const priceNum = price.trim() ? parseFloat(price) : 0; // السعر اختياري
    if (!nameAr.trim()) { setError('اكتب اسم الصنف'); return; }
    if (!Number.isFinite(priceNum) || priceNum < 0) { setError('اكتب سعر بيع صحيحاً'); return; }
    const code = barcode.trim() || generateInternalEan13(products.map((p) => p.barcode || ''));
    if (products.some((p) => p.id !== editing?.id && ((p.barcode || '').trim() === code || (p.barcodes || []).includes(code) || (p.units || []).some((u) => (u.barcode || '').trim() === code)))) { setError('هذا الباركود مستخدم لصنف آخر'); return; }
    const g = groups.find((x) => x.id === groupId);
    if (editing) {
      onSave({ ...editing, nameAr: nameAr.trim(), description: description.trim() || undefined, price: priceNum, cost: netCost(), categoryAr: g?.nameAr ?? '', categoryEn: g?.nameEn ?? '', groupId: g?.id, barcode: code, isService: isService || undefined, ...(isService ? { stock: 0, expiryDate: undefined } : {}) }, false);
      return;
    }
    const product: Product = {
      id: `prod-${Date.now()}`,
      nameAr: nameAr.trim(),
      nameEn: '',
      description: description.trim() || undefined,
      price: priceNum,
      cost: netCost(),
      categoryAr: g?.nameAr ?? '',
      categoryEn: g?.nameEn ?? '',
      groupId: g?.id,
      stock: isService ? 0 : parseInt(stock) || 0,
      isService: isService || undefined,
      minStock: 10,
      barcode: code,
    };
    onSave(product, addNow);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl" data-testid="quick-product-modal">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 w-full max-w-lg max-h-[92vh] rounded-2xl shadow-2xl flex flex-col text-right overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
          <h3 className="font-black text-slate-900 dark:text-white flex items-center gap-2"><PackagePlus className="w-5 h-5 text-emerald-500" /> {editing ? 'تعديل الصنف' : 'إضافة صنف جديد'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-rose-500"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 overflow-y-auto space-y-3">
          <div>
            <label className={label}>اسم الصنف *</label>
            <input autoFocus value={nameAr} onChange={(e) => setNameAr(e.target.value)} data-testid="quick-name" className={field} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label} data-testid="quick-price-label">{!taxRatePercent ? 'سعر البيع' : pricesIncludeTax ? 'سعر البيع (شامل الضريبة)' : 'سعر البيع (قبل الضريبة)'}</label>
              <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} data-testid="quick-price" className={`${field} font-mono`} dir="ltr" />
            </div>
            <div>
              <label className={label}>التكلفة <span className="font-semibold opacity-60">{costK === 1 ? '(بدون ضريبة)' : '(شاملة الضريبة)'}</span></label>
              <input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} className={`${field} font-mono`} dir="ltr" />
            </div>
            <div>
              <label className={label}>المخزون</label>
              {isService
                ? <div className={`${field} opacity-60 text-xs`} data-testid="quick-stock-service">بدون مخزون</div>
                : editing
                ? <div className={`${field} font-mono opacity-70`} title="يُعدَّل المخزون من شاشة المخزون والجرد">{editing.stock ?? 0}</div>
                : <input type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)} className={`${field} font-mono`} dir="ltr" />}
            </div>
          </div>
          <ProfitHint price={price} cost={cost} pricesIncludeTax={pricesIncludeTax} taxRatePercent={taxRatePercent ?? 15} unitLabel={isService ? 'للخدمة' : 'للحبة'} costIncludesTax={costK !== 1} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>المجموعة</label>
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={field}>
                <option value="">— بدون مجموعة —</option>
                {activeGroups.map((g) => <option key={g.id} value={g.id}>{g.nameAr}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>الباركود</label>
              <div className="flex gap-1.5">
                <input value={barcode} onChange={(e) => setBarcode(undoubleScan(e.target.value))} onFocus={(e) => e.currentTarget.select()} onKeyDown={latinBarcodeKeyDown} placeholder="يُولَّد تلقائياً" className={`${field} font-mono`} dir="ltr" />
                <button type="button" onClick={genBarcode} className="shrink-0 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-black hover:bg-slate-200 dark:hover:bg-slate-700">توليد</button>
              </div>
            </div>
          </div>
          <div>
            <label className={label}>وصف الصنف (اختياري — يظهر في الفاتورة)</label>
            <textarea rows={2} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} className={`${field} resize-none`} />
          </div>
          <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200 cursor-pointer" title="الصنف الخدمي (تركيب، توصيل، صيانة...) يُباع ويُفوتر دون أن يُخصم من المخزون">
            <input type="checkbox" checked={isService} onChange={(e) => setIsService(e.target.checked)} data-testid="quick-service" /> 🛠️ صنف خدمي (بدون مخزون)
          </label>
          {!hideAddToCart && <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
            <input type="checkbox" checked={addNow} onChange={(e) => setAddNow(e.target.checked)} /> إضافته إلى السلة مباشرة بعد الحفظ
          </label>}
          {error && <p className="text-xs font-bold text-amber-600 dark:text-amber-400">{error}</p>}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex gap-2">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-sm">إلغاء</button>
          <button onClick={submit} data-testid="quick-save" className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm">حفظ الصنف</button>
        </div>
      </div>
    </div>
  );
}
