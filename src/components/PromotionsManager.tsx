import { useMemo, useState } from 'react';
import { BadgePercent, Plus, Edit, Trash2, X } from 'lucide-react';
import type { Product, ProductGroup } from '../types';
import ProductPicker from './ProductPicker';
import { promoLabel, promoStatus, todayStr, type Promotion, type PromoType } from '../utils/promotions';

interface Props {
  promotions: Promotion[];
  setPromotions: (fn: (prev: Promotion[]) => Promotion[]) => void;
  products: Product[];
  groups: ProductGroup[];
  pricesIncludeTax?: boolean;
  notify?: (msg: string) => void;
}

const TYPES: { k: PromoType; label: string; hint: string }[] = [
  { k: 'percent', label: 'خصم بنسبة %', hint: 'مثال: 20% على كل حبة' },
  { k: 'fixed', label: 'خصم مبلغ', hint: 'مثال: 2 ريال من سعر كل حبة' },
  { k: 'buyXgetY', label: 'اشترِ واحصل مجاناً', hint: 'مثال: اشترِ 2 واحصل على 1 مجاناً' },
  { k: 'multiBuy', label: 'كمية بسعر', hint: 'مثال: 3 حبات بـ 10 ريال' },
];

const STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: 'فعّال الآن', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  scheduled: { label: 'مجدول', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300' },
  expired: { label: 'منتهي', cls: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
  stopped: { label: 'موقوف', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
};

const field = 'w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-rose-500';
const lbl = 'block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1';

export default function PromotionsManager({ promotions, setPromotions, products, groups, pricesIncludeTax, notify }: Props) {
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'scheduled' | 'ended'>('all');
  const today = todayStr();
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const groupName = (id?: string) => groups.find((g) => g.id === id)?.nameAr || '—';

  const list = promotions.filter((p) => {
    const st = promoStatus(p, today);
    if (filter === 'active') return st === 'active';
    if (filter === 'scheduled') return st === 'scheduled';
    if (filter === 'ended') return st === 'expired' || st === 'stopped';
    return true;
  });

  const blank = (): Promotion => ({ id: `promo-${Date.now()}`, name: '', type: 'percent', value: 10, buyQty: 2, freeQty: 1, multiQty: 3, multiPrice: 10, scope: 'products', productIds: [], active: true, from: today, createdAt: new Date().toISOString() });

  const save = (p: Promotion) => {
    setPromotions((prev) => (prev.some((x) => x.id === p.id) ? prev.map((x) => (x.id === p.id ? p : x)) : [p, ...prev]));
    setEditing(null);
    notify?.(`تم حفظ العرض «${p.name}»`);
  };

  return (
    <div className="p-6 h-full overflow-y-auto flex flex-col gap-5 max-w-6xl mx-auto dark:text-white text-right" data-testid="promotions-view">
      <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
        <div className="p-3 bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-xl"><BadgePercent className="w-8 h-8" /></div>
        <div className="flex-1 min-w-[14rem]">
          <h2 className="text-2xl font-black text-slate-800 dark:text-white">العروض والتخفيضات</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-semibold mt-1">تُطبَّق تلقائياً في شاشة البيع خلال مدة العرض، وتظهر في الفاتورة باسم العرض ومقدار التوفير.</p>
        </div>
        <button type="button" onClick={() => setEditing(blank())} data-testid="promo-add"
          className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-black flex items-center gap-2 cursor-pointer">
          <Plus className="w-4 h-4" /> عرض جديد
        </button>
      </div>

      <div className="flex flex-wrap gap-2 text-xs font-black">
        {([['all', 'الكل'], ['active', 'الفعّالة الآن'], ['scheduled', 'المجدولة'], ['ended', 'المنتهية والموقوفة']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setFilter(k)}
            className={`px-3 py-1.5 rounded-full border cursor-pointer ${filter === k ? 'bg-rose-600 text-white border-rose-600' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600'}`}>{l}</button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 p-10 text-center text-slate-500 font-bold">
          لا توجد عروض {filter !== 'all' ? 'في هذا التصنيف' : 'بعد — أضف عرضاً جديداً'}
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(20rem, 1fr))' }}>
          {list.map((p) => {
            const st = STATUS[promoStatus(p, today)];
            const target = p.scope === 'all' ? 'كل الأصناف' : p.scope === 'group' ? `مجموعة: ${groupName(p.groupId)}` : `${(p.productIds || []).length} صنف: ${(p.productIds || []).slice(0, 3).map((id) => byId.get(id)?.nameAr || '؟').join('، ')}${(p.productIds || []).length > 3 ? '…' : ''}`;
            return (
              <div key={p.id} data-testid="promo-card" className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-black text-slate-900 dark:text-white truncate">{p.name}</div>
                    <div className="text-sm font-black text-rose-600 dark:text-rose-400">{promoLabel(p)}</div>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-black ${st.cls}`}>{st.label}</span>
                </div>
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400 truncate" title={target}>{target}</div>
                <div className="text-[11px] font-bold text-slate-400">من <span className="font-mono" dir="ltr">{p.from || '—'}</span> · {p.to ? <>إلى <span className="font-mono" dir="ltr">{p.to}</span></> : 'بدون تاريخ نهاية'}</div>
                <div className="flex items-center gap-2 mt-1">
                  <button type="button" onClick={() => setPromotions((prev) => prev.map((x) => (x.id === p.id ? { ...x, active: !x.active } : x)))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black cursor-pointer ${p.active ? 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200' : 'bg-emerald-600 text-white'}`}>{p.active ? 'إيقاف' : 'تشغيل'}</button>
                  <button type="button" onClick={() => setEditing({ ...p })} className="px-3 py-1.5 rounded-lg text-xs font-black bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-1 cursor-pointer"><Edit className="w-3.5 h-3.5" /> تعديل</button>
                  <button type="button" onClick={() => { if (window.confirm(`حذف العرض «${p.name}»؟`)) setPromotions((prev) => prev.filter((x) => x.id !== p.id)); }}
                    className="mr-auto p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer" title="حذف"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && <PromoForm initial={editing} products={products} groups={groups} pricesIncludeTax={pricesIncludeTax} onSave={save} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PromoForm({ initial, products, groups, pricesIncludeTax, onSave, onClose }: { initial: Promotion; products: Product[]; groups: ProductGroup[]; pricesIncludeTax?: boolean; onSave: (p: Promotion) => void; onClose: () => void }) {
  const [p, setP] = useState<Promotion>(initial);
  const [pick, setPick] = useState('');
  const [err, setErr] = useState('');
  const set = (patch: Partial<Promotion>) => setP((x) => ({ ...x, ...patch }));
  const byId = new Map(products.map((x) => [x.id, x]));
  const sellable = products.filter((x) => !x.disabled);
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
  const taxNote = pricesIncludeTax ? '(شامل الضريبة)' : '(قبل الضريبة)';

  const submit = () => {
    if (!p.name.trim()) return setErr('اكتب اسم العرض');
    if (p.type === 'percent' && !((p.value || 0) > 0 && (p.value || 0) <= 100)) return setErr('النسبة بين 1 و100');
    if (p.type === 'fixed' && !((p.value || 0) > 0)) return setErr('اكتب مبلغ الخصم');
    if (p.type === 'buyXgetY' && !((p.buyQty || 0) >= 1 && (p.freeQty || 0) >= 1)) return setErr('اكتب الكمية المشتراة والمجانية');
    if (p.type === 'multiBuy' && !((p.multiQty || 0) >= 2 && (p.multiPrice || 0) > 0)) return setErr('الكمية 2 أو أكثر واكتب سعرها');
    if (p.scope === 'products' && !(p.productIds || []).length) return setErr('اختر صنفاً واحداً على الأقل');
    if (p.scope === 'group' && !p.groupId) return setErr('اختر المجموعة');
    if (p.from && p.to && p.to < p.from) return setErr('تاريخ النهاية قبل البداية');
    onSave({ ...p, name: p.name.trim() });
  };

  return (
    <div className="fixed inset-0 z-[9990] bg-black/60 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white dark:bg-slate-900 w-full max-w-xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden" data-testid="promo-form">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-black text-slate-900 dark:text-white flex items-center gap-2"><BadgePercent className="w-5 h-5 text-rose-500" /> {initial.name ? 'تعديل العرض' : 'عرض جديد'}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-rose-500 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 overflow-y-auto space-y-4">
          <div>
            <label className={lbl}>اسم العرض (يظهر في الفاتورة)</label>
            <input autoFocus value={p.name} onChange={(e) => set({ name: e.target.value })} placeholder="مثال: عرض نهاية الأسبوع" className={field} data-testid="promo-name" />
          </div>
          <div>
            <span className={lbl}>نوع العرض</span>
            <div className="grid grid-cols-2 gap-2">
              {TYPES.map((t) => (
                <button key={t.k} type="button" onClick={() => set({ type: t.k })} data-testid={`promo-type-${t.k}`}
                  className={`p-2.5 rounded-xl border-2 text-right cursor-pointer ${p.type === t.k ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/30' : 'border-slate-200 dark:border-slate-700'}`}>
                  <div className="text-sm font-black text-slate-800 dark:text-slate-100">{t.label}</div>
                  <div className="text-[11px] font-bold text-slate-500">{t.hint}</div>
                </button>
              ))}
            </div>
          </div>
          {p.type === 'percent' && (
            <div><label className={lbl}>نسبة الخصم %</label><input type="number" min={1} max={100} value={p.value ?? ''} onChange={(e) => set({ value: num(e.target.value) })} className={`${field} font-mono`} dir="ltr" data-testid="promo-value" /></div>
          )}
          {p.type === 'fixed' && (
            <div><label className={lbl}>المبلغ المخصوم من سعر الحبة {taxNote}</label><input type="number" min={0} step={0.5} value={p.value ?? ''} onChange={(e) => set({ value: num(e.target.value) })} className={`${field} font-mono`} dir="ltr" data-testid="promo-value" /></div>
          )}
          {p.type === 'buyXgetY' && (
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>اشترِ (عدد)</label><input type="number" min={1} value={p.buyQty ?? ''} onChange={(e) => set({ buyQty: num(e.target.value) })} className={`${field} font-mono`} dir="ltr" data-testid="promo-buy" /></div>
              <div><label className={lbl}>واحصل مجاناً على</label><input type="number" min={1} value={p.freeQty ?? ''} onChange={(e) => set({ freeQty: num(e.target.value) })} className={`${field} font-mono`} dir="ltr" data-testid="promo-free" /></div>
            </div>
          )}
          {p.type === 'multiBuy' && (
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>الكمية</label><input type="number" min={2} value={p.multiQty ?? ''} onChange={(e) => set({ multiQty: num(e.target.value) })} className={`${field} font-mono`} dir="ltr" data-testid="promo-mqty" /></div>
              <div><label className={lbl}>بسعر {taxNote}</label><input type="number" min={0} step={0.5} value={p.multiPrice ?? ''} onChange={(e) => set({ multiPrice: num(e.target.value) })} className={`${field} font-mono`} dir="ltr" data-testid="promo-mprice" /></div>
            </div>
          )}
          <div>
            <span className={lbl}>يُطبَّق على</span>
            <div className="flex gap-2 text-xs font-black mb-2">
              {([['products', 'أصناف محددة'], ['group', 'مجموعة'], ['all', 'كل الأصناف']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => set({ scope: k })} data-testid={`promo-scope-${k}`}
                  className={`px-3 py-1.5 rounded-lg border cursor-pointer ${p.scope === k ? 'bg-rose-600 text-white border-rose-600' : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300'}`}>{l}</button>
              ))}
            </div>
            {p.scope === 'products' && (
              <div className="space-y-2">
                <ProductPicker products={sellable} value={pick} onChange={(id) => { if (id && !(p.productIds || []).includes(id)) set({ productIds: [...(p.productIds || []), id] }); setPick(''); }} placeholder="ابحث بالاسم أو امسح الباركود لإضافة صنف..." />
                <div className="flex flex-wrap gap-1.5" data-testid="promo-products">
                  {(p.productIds || []).map((id) => (
                    <span key={id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs font-bold">
                      {byId.get(id)?.nameAr || 'صنف محذوف'}
                      <button type="button" onClick={() => set({ productIds: (p.productIds || []).filter((x) => x !== id) })} className="text-rose-500 cursor-pointer"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {p.scope === 'group' && (
              <select value={p.groupId || ''} onChange={(e) => set({ groupId: e.target.value || undefined })} className={field} data-testid="promo-group">
                <option value="">— اختر المجموعة —</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.nameAr}</option>)}
              </select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>يبدأ من</label><input type="date" value={p.from || ''} onChange={(e) => set({ from: e.target.value || undefined })} className={field} /></div>
            <div><label className={lbl}>ينتهي في (اختياري)</label><input type="date" value={p.to || ''} onChange={(e) => set({ to: e.target.value || undefined })} className={field} data-testid="promo-to" /></div>
          </div>
          <label className="flex items-center gap-2 text-sm font-bold cursor-pointer"><input type="checkbox" checked={p.active} onChange={(e) => set({ active: e.target.checked })} /> العرض مُشغَّل</label>
          <p className="text-[11px] font-bold text-slate-500">عند انطباق أكثر من عرض على صنف يُطبَّق الأوفر للعميل. تعديل السعر أو خصم الصنف يدوياً في السلة يلغي العرض على ذلك السطر.</p>
          {err && <p className="text-xs font-bold text-rose-600" data-testid="promo-err">{err}</p>}
        </div>
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-sm cursor-pointer">إلغاء</button>
          <button type="button" onClick={submit} className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-sm cursor-pointer" data-testid="promo-save">حفظ العرض</button>
        </div>
      </div>
    </div>
  );
}
