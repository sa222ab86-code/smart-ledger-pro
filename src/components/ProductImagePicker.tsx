import React, { useState, useRef } from 'react';
import { 
  Upload, Image as ImageIcon, Trash2, 
  RefreshCw, Check, AlertCircle, Eye, Search, Layers, X, Camera
} from 'lucide-react';
import { compressProductImage } from '../utils/appIcon';

export interface StudioImagePreset {
  id: string;
  name: string;
  category: 'burger' | 'drinks' | 'appetizers' | 'desserts' | 'meals' | 'retail';
  categoryLabel: string;
  url: string;
}

export const STUDIO_IMAGE_PRESETS: StudioImagePreset[] = [
  // Burger
  {
    id: 'pr-burger-1',
    name: 'برجر لحم كلاسيك فاخر',
    category: 'burger',
    categoryLabel: 'برجر',
    url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'pr-burger-2',
    name: 'برجر دجاج كرسبي مقرمش',
    category: 'burger',
    categoryLabel: 'برجر',
    url: 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'pr-burger-3',
    name: 'دبل تشيز برجر مع الجبن الذائب',
    category: 'burger',
    categoryLabel: 'برجر',
    url: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'pr-burger-4',
    name: 'ميني برجر سلايدرز',
    category: 'burger',
    categoryLabel: 'برجر',
    url: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=600&auto=format&fit=crop&q=80',
  },

  // Drinks & Coffee
  {
    id: 'pr-drink-1',
    name: 'قهوة عربية أصيلة مع التمر',
    category: 'drinks',
    categoryLabel: 'مشروبات',
    url: 'https://images.unsplash.com/photo-1578374173705-969cbe6f2d6b?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'pr-drink-2',
    name: 'كابتشينو ولاتيه برسمة رغوة',
    category: 'drinks',
    categoryLabel: 'مشروبات',
    url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'pr-drink-3',
    name: 'إسبريسو غني ومركز',
    category: 'drinks',
    categoryLabel: 'مشروبات',
    url: 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'pr-drink-4',
    name: 'عصير برتقال طبيعي مثلج',
    category: 'drinks',
    categoryLabel: 'مشروبات',
    url: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'pr-drink-5',
    name: 'شاي كرك عدني دافئ',
    category: 'drinks',
    categoryLabel: 'مشروبات',
    url: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'pr-drink-6',
    name: 'مشروب غازي بارد منعش',
    category: 'drinks',
    categoryLabel: 'مشروبات',
    url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'pr-drink-7',
    name: 'مياه معدنية نقية',
    category: 'drinks',
    categoryLabel: 'مشروبات',
    url: 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=600&auto=format&fit=crop&q=80',
  },

  // Appetizers & Sides
  {
    id: 'pr-app-1',
    name: 'بطاطس مقلية ذهبية مقرمشة',
    category: 'appetizers',
    categoryLabel: 'مقبلات',
    url: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'pr-app-2',
    name: 'أصابع جبن موزاريلا مقلية',
    category: 'appetizers',
    categoryLabel: 'مقبلات',
    url: 'https://images.unsplash.com/photo-1531749668029-2db88e4276c7?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'pr-app-3',
    name: 'أجنحة دجاج بصلصة البافلو',
    category: 'appetizers',
    categoryLabel: 'مقبلات',
    url: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'pr-app-4',
    name: 'سلطة سيزر طازجة',
    category: 'appetizers',
    categoryLabel: 'مقبلات',
    url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&auto=format&fit=crop&q=80',
  },

  // Meals & Main Dishes
  {
    id: 'pr-meal-1',
    name: 'بيتزا إيطالية بجبن الموزاريلا',
    category: 'meals',
    categoryLabel: 'وجبات',
    url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'pr-meal-2',
    name: 'شاورما لحم ودجاج بالخبز الصاج',
    category: 'meals',
    categoryLabel: 'وجبات',
    url: 'https://images.unsplash.com/photo-1561651823-34feb02250e4?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'pr-meal-3',
    name: 'وجبة دجاج بروستد مقرمش',
    category: 'meals',
    categoryLabel: 'وجبات',
    url: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'pr-meal-4',
    name: 'ساندوتش كلوب مميز',
    category: 'meals',
    categoryLabel: 'وجبات',
    url: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'pr-meal-5',
    name: 'كبسة لحم ومأكولات شرقية',
    category: 'meals',
    categoryLabel: 'وجبات',
    url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&auto=format&fit=crop&q=80',
  },

  // Desserts
  {
    id: 'pr-des-1',
    name: 'كوكيز شوكولاتة بلجيكية فاخرة',
    category: 'desserts',
    categoryLabel: 'حلويات',
    url: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'pr-des-2',
    name: 'تشيز كيك بالتوت الأحمر',
    category: 'desserts',
    categoryLabel: 'حلويات',
    url: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'pr-des-3',
    name: 'دونات بالشوكولاتة والمكسرات',
    category: 'desserts',
    categoryLabel: 'حلويات',
    url: 'https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'pr-des-4',
    name: 'آيس كريم مثلج بنكهات طبيعية',
    category: 'desserts',
    categoryLabel: 'حلويات',
    url: 'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=600&auto=format&fit=crop&q=80',
  }
];

interface ProductImagePickerProps {
  currentImageUrl?: string;
  productNameAr?: string;
  productNameEn?: string;
  categoryNameAr?: string;
  onSelectImage: (imageUrl: string) => void;
  onRemoveImage: () => void;
}

export default function ProductImagePicker({
  currentImageUrl,
  productNameAr = '',
  productNameEn = '',
  categoryNameAr = '',
  onSelectImage,
  onRemoveImage,
}: ProductImagePickerProps) {
  const [activeTab, setActiveTab] = useState<'upload' | 'presets'>('upload');
  const [presetCategory, setPresetCategory] = useState<string>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);


  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // حد أعلى للملف الأصلي (يُصغَّر بعدها تلقائياً قبل الحفظ)
    if (file.size > 15 * 1024 * 1024) {
      alert('حجم الصورة كبير جداً! يرجى اختيار صورة أقل من 15 ميجابايت.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      if (typeof reader.result === 'string') {
        onSelectImage(await compressProductImage(reader.result));
      }
    };
    reader.readAsDataURL(file);
  };

  const filteredPresets = presetCategory === 'all'
    ? STUDIO_IMAGE_PRESETS
    : STUDIO_IMAGE_PRESETS.filter(p => p.category === presetCategory);

  return (
    <div className="col-span-2 md:col-span-4 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 rounded-2xl p-4 sm:p-5 space-y-4 text-right">
      
      {/* Top Banner: Image Preview & Actions */}
      <div className="flex flex-col sm:flex-row items-center gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800/80">
        
        {/* Preview Frame */}
        <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 border-2 border-slate-300/80 dark:border-slate-700/80 shrink-0 shadow-md flex items-center justify-center group">
          {currentImageUrl ? (
            <>
              <img 
                src={currentImageUrl} 
                alt={productNameAr || 'صورة الصنف'} 
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                referrerPolicy="no-referrer"
              />
              <button
                type="button"
                onClick={onRemoveImage}
                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 transition-opacity cursor-pointer font-bold text-xs"
                title="حذف الصورة الحالية"
              >
                <Trash2 className="w-5 h-5" />
                <span>حذف الصورة</span>
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-500 gap-1.5 p-2 text-center">
              <ImageIcon className="w-8 h-8 text-slate-400 dark:text-slate-600" />
              <span className="text-[10px] font-bold">لا توجد صورة</span>
            </div>
          )}
        </div>

        {/* Info & Status */}
        <div className="flex-1 space-y-1 text-center sm:text-right">
          <div className="flex items-center justify-center sm:justify-start gap-2">
            <h4 className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
              <Camera className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>صورة الصنف للمنيو ونقطة البيع</span>
            </h4>
            {currentImageUrl && (
              <span className="text-[10px] font-black bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                <Check className="w-2.5 h-2.5" />
                <span>محددة</span>
              </span>
            )}
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed">
            صورة تظهر على بطاقة الصنف في شاشة البيع وقائمة الأصناف: ارفعها من جهازك، أو اختر صورة جاهزة من المكتبة.
          </p>

          {currentImageUrl && (
            <div className="pt-1">
              <button
                type="button"
                onClick={onRemoveImage}
                className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 font-bold inline-flex items-center gap-1 cursor-pointer transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>إزالة الصورة والاعتماد على اللون التلقائي</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mode Selector Tabs */}
      <div className="grid grid-cols-2 gap-1.5 bg-slate-100 dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('upload')}
          className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'upload'
              ? 'bg-cyan-600 text-white font-black shadow-md'
              : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800'
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          <span>رفع من الجهاز</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('presets')}
          className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'presets'
              ? 'bg-cyan-600 text-white font-black shadow-md'
              : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>صور جاهزة ({STUDIO_IMAGE_PRESETS.length})</span>
        </button>

      </div>

      {/* Tab 2: Curated Studio Presets Library */}
      {activeTab === 'presets' && (
        <div className="space-y-3 bg-white/60 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-4 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>اختر صورة احترافية جاهزة بنقرة واحدة:</span>
            </span>

            {/* Category filter pills */}
            <div className="flex items-center gap-1 overflow-x-auto max-w-full pb-1">
              {[
                { id: 'all', label: 'الكل' },
                { id: 'burger', label: 'برجر' },
                { id: 'drinks', label: 'مشروبات وقهوة' },
                { id: 'appetizers', label: 'مقبلات وبطاطس' },
                { id: 'meals', label: 'وجبات ومأكولات' },
                { id: 'desserts', label: 'حلويات' },
              ].map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setPresetCategory(cat.id)}
                  className={`text-[10px] font-bold px-2 py-1 rounded-lg transition whitespace-nowrap cursor-pointer ${
                    presetCategory === cat.id
                      ? 'bg-cyan-500 text-slate-950 font-black'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Grid of Preset Images */}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5 max-h-[260px] overflow-y-auto pr-1">
            {filteredPresets.map(preset => {
              const isSelected = currentImageUrl === preset.url;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onSelectImage(preset.url)}
                  className={`group relative rounded-xl overflow-hidden aspect-square border-2 transition-all cursor-pointer text-right flex flex-col justify-end p-2 ${
                    isSelected 
                      ? 'border-cyan-400 ring-2 ring-cyan-400/40 shadow-lg' 
                      : 'border-slate-200 dark:border-slate-800 hover:border-cyan-500/60'
                  }`}
                >
                  <img 
                    src={preset.url} 
                    alt={preset.name}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent"></div>
                  
                  {isSelected && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center shadow-md">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  )}

                  <span className="relative z-10 text-[9.5px] font-bold text-slate-900 dark:text-white leading-tight line-clamp-2 drop-shadow-md">
                    {preset.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 3: Upload from Device */}
      {activeTab === 'upload' && (
        <div className="space-y-3 bg-white/60 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-5 animate-in fade-in duration-200 text-center">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept="image/*" 
            className="hidden" 
          />
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-cyan-400 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 transition-colors cursor-pointer group bg-black/40"
          >
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <p className="font-bold text-sm text-slate-900 dark:text-white">انقر هنا لاختيار صورة من جهازك أو التقاطها بالكاميرا</p>
              <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">يدعم ملفات JPG, PNG, WEBP, GIF (حتى 5 ميجابايت)</p>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}
