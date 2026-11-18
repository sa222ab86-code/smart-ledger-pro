import React from 'react';
import { undoubleScan } from '../utils/beep';
import { 
  Package, Plus, Trash2, Ruler, Maximize2, Boxes, Sliders, CheckCircle2, 
  HelpCircle, Sparkles, Layers, Info, Split
} from 'lucide-react';
import { ProductUnit } from '../types';
import SaudiRiyalSymbol from './SaudiRiyalSymbol';

const fld = 'w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 rounded-lg px-2.5 py-2 text-sm text-slate-900 dark:text-white font-bold focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 placeholder:text-slate-400 placeholder:font-normal';
const lbl = 'block text-[11px] font-bold text-slate-600 dark:text-slate-300';

export interface PackagingPreset {
  id: string;
  title: string;
  badge: string;
  examples: string;
  icon: 'ruler' | 'maximize' | 'boxes' | 'sliders';
  generate: (basePrice: number, baseBarcode: string) => ProductUnit[];
}

export const PACKAGING_PRESETS: PackagingPreset[] = [
  {
    id: 'sizes',
    title: 'مقاسات (ملابس / مطاعم)',
    badge: 'مقاس',
    examples: 'صغير (S) • وسط (M) • كبير (L)',
    icon: 'ruler',
    generate: (basePrice: number, baseBarcode: string) => [
      { 
        id: `pkg-${Date.now()}-1`, 
        name: 'صغير (Small)', 
        factor: 1, 
        price: basePrice > 0 ? basePrice : 15, 
        barcode: baseBarcode ? `${baseBarcode}-S` : `${Math.floor(Math.random() * 900000 + 100000)}-S`, 
        unitType: 'size' 
      },
      { 
        id: `pkg-${Date.now()}-2`, 
        name: 'وسط (Medium)', 
        factor: 1, 
        price: Math.round(((basePrice > 0 ? basePrice : 15) * 1.35) * 100) / 100, 
        barcode: baseBarcode ? `${baseBarcode}-M` : `${Math.floor(Math.random() * 900000 + 100000)}-M`, 
        unitType: 'size' 
      },
      { 
        id: `pkg-${Date.now()}-3`, 
        name: 'كبير (Large)', 
        factor: 1, 
        price: Math.round(((basePrice > 0 ? basePrice : 15) * 1.7) * 100) / 100, 
        barcode: baseBarcode ? `${baseBarcode}-L` : `${Math.floor(Math.random() * 900000 + 100000)}-L`, 
        unitType: 'size' 
      },
    ]
  },
  {
    id: 'volumes',
    title: 'أحجام وسعات (مشروبات / سوائل)',
    badge: 'حجم / سعة',
    examples: 'كوب 250 مل • وسط 500 مل • جالون 1 لتر',
    icon: 'maximize',
    generate: (basePrice: number, baseBarcode: string) => [
      { 
        id: `pkg-${Date.now()}-1`, 
        name: 'كوب صغير (250 مل)', 
        factor: 1, 
        price: basePrice > 0 ? basePrice : 10, 
        barcode: baseBarcode ? `${baseBarcode}-250` : `${Math.floor(Math.random() * 900000 + 100000)}-250`, 
        unitType: 'volume' 
      },
      { 
        id: `pkg-${Date.now()}-2`, 
        name: 'كوب وسط (500 مل)', 
        factor: 1, 
        price: Math.round(((basePrice > 0 ? basePrice : 10) * 1.4) * 100) / 100, 
        barcode: baseBarcode ? `${baseBarcode}-500` : `${Math.floor(Math.random() * 900000 + 100000)}-500`, 
        unitType: 'volume' 
      },
      { 
        id: `pkg-${Date.now()}-3`, 
        name: 'جالون عائلي (1 لتر)', 
        factor: 1, 
        price: Math.round(((basePrice > 0 ? basePrice : 10) * 2.2) * 100) / 100, 
        barcode: baseBarcode ? `${baseBarcode}-1L` : `${Math.floor(Math.random() * 900000 + 100000)}-1L`, 
        unitType: 'volume' 
      },
    ]
  },
  {
    id: 'packs',
    title: 'عبوات تجزئة وكرتون (بقالة / مستودع)',
    badge: 'تعبئة وتجزئة',
    examples: 'حبة فردي • شدة (6) • كرتون (24)',
    icon: 'boxes',
    generate: (basePrice: number, baseBarcode: string) => [
      { 
        id: `pkg-${Date.now()}-1`, 
        name: 'حبة فردي (قطعة)', 
        factor: 1, 
        price: basePrice > 0 ? basePrice : 3, 
        barcode: baseBarcode || `${Math.floor(Math.random() * 900000 + 100000)}`, 
        unitType: 'pack' 
      },
      { 
        id: `pkg-${Date.now()}-2`, 
        name: 'شدة (6 حبات)', 
        factor: 6, 
        price: Math.round(((basePrice > 0 ? basePrice : 3) * 5.5) * 100) / 100, 
        barcode: baseBarcode ? `${baseBarcode}-6` : `${Math.floor(Math.random() * 900000 + 100000)}-6`, 
        unitType: 'pack' 
      },
      { 
        id: `pkg-${Date.now()}-3`, 
        name: 'كرتون (24 حبة)', 
        factor: 24, 
        price: Math.round(((basePrice > 0 ? basePrice : 3) * 20) * 100) / 100, 
        barcode: baseBarcode ? `${baseBarcode}-24` : `${Math.floor(Math.random() * 900000 + 100000)}-24`, 
        unitType: 'pack' 
      },
    ]
  },
  {
    id: 'flavors',
    title: 'أنواع وإضافات (فطائر / ساندويتشات / عصائر)',
    badge: 'نوع / إضافة',
    examples: 'بيض • بالخضار • بالجبن',
    icon: 'sliders',
    generate: (basePrice: number, baseBarcode: string) => {
      const b = basePrice > 0 ? basePrice : 5;
      const rnd = () => `${Math.floor(Math.random() * 900000 + 100000)}`;
      return [
        { id: `pkg-${Date.now()}-1`, name: 'بيض', factor: 1, price: b, barcode: baseBarcode ? `${baseBarcode}-1` : `${rnd()}-1`, unitType: 'flavor' as const },
        { id: `pkg-${Date.now()}-2`, name: 'بالخضار', factor: 1, price: Math.round((b + 1) * 100) / 100, barcode: baseBarcode ? `${baseBarcode}-2` : `${rnd()}-2`, unitType: 'flavor' as const },
        { id: `pkg-${Date.now()}-3`, name: 'بالجبن', factor: 1, price: Math.round((b + 2) * 100) / 100, barcode: baseBarcode ? `${baseBarcode}-3` : `${rnd()}-3`, unitType: 'flavor' as const },
      ];
    },
  },
  {
    id: 'weights',
    title: 'أوزان ومقادير (خضار / مكسرات / لحوم)',
    badge: 'وزن',
    examples: 'ربع كيلو • نصف كيلو • 1 كيلو',
    icon: 'sliders',
    generate: (basePrice: number, baseBarcode: string) => [
      { 
        id: `pkg-${Date.now()}-1`, 
        name: 'ربع كيلو (250 جم)', 
        factor: 0.25, 
        price: Math.round(((basePrice > 0 ? basePrice : 40) * 0.28) * 100) / 100, 
        barcode: baseBarcode ? `${baseBarcode}-250g` : `${Math.floor(Math.random() * 900000 + 100000)}-250g`, 
        unitType: 'weight' 
      },
      { 
        id: `pkg-${Date.now()}-2`, 
        name: 'نصف كيلو (500 جم)', 
        factor: 0.5, 
        price: Math.round(((basePrice > 0 ? basePrice : 40) * 0.52) * 100) / 100, 
        barcode: baseBarcode ? `${baseBarcode}-500g` : `${Math.floor(Math.random() * 900000 + 100000)}-500g`, 
        unitType: 'weight' 
      },
      { 
        id: `pkg-${Date.now()}-3`, 
        name: 'واحد كيلو (1 كجم)', 
        factor: 1, 
        price: basePrice > 0 ? basePrice : 40, 
        barcode: baseBarcode ? `${baseBarcode}-1kg` : `${Math.floor(Math.random() * 900000 + 100000)}-1kg`, 
        unitType: 'weight' 
      },
    ]
  }
];

interface PackagingEditorProps {
  hasPackaging: boolean;
  onToggleHasPackaging: (enabled: boolean) => void;
  packagingList: ProductUnit[];
  basePrice: number;
  baseBarcode: string;
  onAddRow: (type?: 'size' | 'volume' | 'pack' | 'weight' | 'unit' | 'flavor') => void;
  onUpdateRow: (id: string, updates: Partial<ProductUnit>) => void;
  onRemoveRow: (id: string) => void;
  onApplyPreset: (presetId: string) => void;
  /** تحويل خيار إلى صنف مستقل (في تعديل صنف محفوظ فقط) */
  onDetachRow?: (unit: ProductUnit) => void;
}

export default function PackagingEditor({
  hasPackaging,
  onToggleHasPackaging,
  packagingList,
  basePrice,
  baseBarcode,
  onAddRow,
  onUpdateRow,
  onRemoveRow,
  onApplyPreset,
  onDetachRow
}: PackagingEditorProps) {
  return (
    <div className="col-span-2 md:col-span-4 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 rounded-2xl p-4 sm:p-5 space-y-4">
      
      {/* Header and Toggle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400 shrink-0">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-black text-sm text-slate-900 dark:text-white">نظام التعبئة والمقاسات والأحجام</h4>
              <span className="text-[10px] font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-full">
                اختيار سريع عند البيع
              </span>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
              تحديد مقاسات (صغير/وسط/كبير)، أو أحجام وسعات (250مل/1لتر)، أو تعبئات (حبة/شدة/كرتون) للصنف.
            </p>
          </div>
        </div>

        {/* Toggle Button */}
        <label className="inline-flex items-center gap-2 cursor-pointer shrink-0 self-end sm:self-center">
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
            {hasPackaging ? 'مفعل' : 'معطل'}
          </span>
          <div className="relative">
            <input 
              type="checkbox" 
              checked={hasPackaging}
              onChange={(e) => onToggleHasPackaging(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-100 dark:bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
          </div>
        </label>
      </div>

      {hasPackaging && (
        <div className="space-y-4 animate-in fade-in duration-200">
          
          {/* Quick Preset Buttons */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-bold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                <span>قوالب تعبئة ومقاسات جاهزة بنقرة واحدة:</span>
              </span>
              <span className="text-[11px] text-slate-500">
                (يتم توليد الأسعار والباركود تلقائياً)
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {PACKAGING_PRESETS.map(preset => {
                const getIcon = () => {
                  switch (preset.icon) {
                    case 'ruler': return <Ruler className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />;
                    case 'maximize': return <Maximize2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />;
                    case 'boxes': return <Boxes className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />;
                    case 'sliders': return <Sliders className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />;
                  }
                };

                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onApplyPreset(preset.id)}
                    className="p-2.5 bg-white/90 dark:bg-slate-900/90 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 hover:border-cyan-500/50 rounded-xl text-right transition-all flex flex-col justify-between group cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-1 w-full mb-1">
                      <div className="flex items-center gap-1.5">
                        {getIcon()}
                        <span className="font-bold text-xs text-slate-700 dark:text-slate-200 group-hover:text-cyan-700 dark:group-hover:text-cyan-300">
                          {preset.title.split(' ')[0]}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1 py-0.5 rounded">
                        +{preset.generate(10, '').length}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 group-hover:text-slate-500 dark:group-hover:text-slate-400 truncate">
                      {preset.examples}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* List of Packaging Options */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                <span>خيارات التعبئة والمقاسات للصنف ({packagingList.length}):</span>
              </span>

              <button
                type="button"
                onClick={() => onAddRow('size')}
                className="text-xs text-white font-bold flex items-center gap-1 cursor-pointer bg-cyan-600 hover:bg-cyan-700 px-3 py-1.5 rounded-lg transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة خيار يدوي</span>
              </button>
            </div>

            {packagingList.length === 0 ? (
              <div className="p-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-center text-slate-500 space-y-2">
                <Boxes className="w-8 h-8 mx-auto text-slate-400 dark:text-slate-600 opacity-60" />
                <p className="text-xs font-bold">لم تتم إضافة أي خيارات تعبئة أو مقاسات بعد</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-600">
                  اختر أحد القوالب الجاهزة بالأعلى أو اضغط &quot;إضافة خيار يدوي&quot; لتعريف المقاسات أو العبوات.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {packagingList.map((unit, index) => (
                  <div
                    key={unit.id}
                    className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl grid grid-cols-2 md:grid-cols-12 gap-2 items-end text-xs"
                    data-testid="pack-row"
                  >
                    <label className="md:col-span-3 space-y-1">
                      <span className={lbl}><b className="font-mono text-cyan-700 dark:text-cyan-300">{index + 1}.</b> النوع</span>
                      <select value={unit.unitType || 'size'} onChange={(e) => onUpdateRow(unit.id, { unitType: e.target.value as ProductUnit['unitType'] })} className={`${fld} cursor-pointer`}>
                        <option value="size">مقاس</option>
                        <option value="volume">حجم / سعة</option>
                        <option value="pack">عبوة / كرتون</option>
                        <option value="weight">وزن</option>
                        <option value="flavor">نوع / إضافة</option>
                        <option value="unit">وحدة أخرى</option>
                      </select>
                    </label>
                    <label className="md:col-span-3 space-y-1">
                      <span className={lbl}>الاسم *</span>
                      <input type="text" required placeholder="اسم المقاس أو العبوة" value={unit.name} onChange={(e) => onUpdateRow(unit.id, { name: e.target.value })} className={fld} />
                    </label>
                    <label className="md:col-span-1 space-y-1">
                      <span className={lbl}>عدد القطع</span>
                      <input type="number" step="any" min="0.1" title="عدد الحبات في هذه التعبئة (الكرتون = 24 مثلاً)" value={unit.factor} onFocus={(e) => e.currentTarget.select()} onChange={(e) => onUpdateRow(unit.id, { factor: parseFloat(e.target.value) || 1 })} className={`${fld} font-mono text-center px-1`} />
                    </label>
                    <label className="md:col-span-2 space-y-1">
                      <span className={lbl}>سعر البيع *</span>
                      <input type="number" step="0.01" required value={unit.price} onFocus={(e) => e.currentTarget.select()} onChange={(e) => onUpdateRow(unit.id, { price: parseFloat(e.target.value) || 0 })} className={`${fld} font-mono text-center text-cyan-800 dark:text-cyan-200`} />
                    </label>
                    <label className="md:col-span-2 space-y-1">
                      <span className={lbl}>الباركود</span>
                      <input type="text" placeholder="اختياري" value={unit.barcode} onChange={(e) => onUpdateRow(unit.id, { barcode: undoubleScan(e.target.value) })} onFocus={(e) => e.currentTarget.select()} className={`${fld} font-mono text-center`} dir="ltr" />
                    </label>
                    <div className="md:col-span-1 flex gap-1">
                      {onDetachRow && (
                        <button type="button" onClick={() => onDetachRow(unit)} data-testid="pack-detach" className="flex-1 h-[38px] flex items-center justify-center text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-lg transition cursor-pointer" title="تحويل هذا الخيار إلى صنف مستقل (بمخزونه وسعره وباركوده)">
                          <Split className="w-4 h-4" />
                        </button>
                      )}
                      <button type="button" onClick={() => onRemoveRow(unit.id)} className="flex-1 h-[38px] flex items-center justify-center text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 rounded-lg transition cursor-pointer" title="حذف هذا الخيار">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Helpful Information Notice */}
          <div className="bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900/60 rounded-xl p-3 flex items-start gap-2 text-[11px] text-cyan-800 dark:text-cyan-200">
            <Info className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold">
                كيف تظهر التعبئة في نقطة البيع (POS)؟
              </p>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                عند النقر على الصنف في شاشة الكاشير، ستظهر نافذة فورية تسأل عن المقاس أو الحجم المطلوب (مثل: سنجل / دبل، أو حبة / شدة / كرتون). كما يمكنك مسح باركود التعبئة بالماسح لإدراجها مباشرة.
              </p>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
