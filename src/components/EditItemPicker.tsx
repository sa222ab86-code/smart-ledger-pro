import { useMemo, useState } from 'react';
import { PencilLine, Search, X } from 'lucide-react';
import type { Product } from '../types';
import { undoubleScan } from '../utils/beep';

interface Props {
  products: Product[];
  onPick: (p: Product) => void;
  onClose: () => void;
}

/** اختيار صنف لتعديله من شاشة البيع: بحث بالاسم أو مسح الباركود */
export default function EditItemPicker({ products, onPick, onClose }: Props) {
  const [q, setQ] = useState('');
  const codeOf = (p: Product) => [p.barcode, ...(p.barcodes || []), ...((p.units || []).map((u) => u.barcode))].filter(Boolean).map((s) => String(s).trim());
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return products.slice(0, 60);
    return products.filter((p) =>
      (p.nameAr || '').toLowerCase().includes(t) || ((p as any).nameEn || '').toLowerCase().includes(t) || codeOf(p).some((c) => c.toLowerCase().includes(t)),
    ).slice(0, 60);
  }, [q, products]);

  const submit = () => {
    const code = undoubleScan(q.trim());
    const exact = products.find((p) => codeOf(p).includes(code));
    if (exact) { onPick(exact); return; }
    if (list.length === 1) onPick(list[0]);
  };

  return (
    <div className="fixed inset-0 z-[9990] bg-black/50 flex items-center justify-center p-4 print:hidden" onClick={onClose}>
      <div dir="rtl" data-testid="edit-item-picker" className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-black text-slate-900 dark:text-white flex items-center gap-2"><PencilLine className="w-5 h-5 text-amber-500" /> تعديل صنف</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 right-3 text-slate-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} data-testid="edit-item-search"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
              placeholder="ابحث باسم الصنف أو امسح الباركود..."
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl pr-9 pl-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 text-slate-800 dark:text-slate-100" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
          {list.length === 0 && <p className="text-center text-sm text-slate-400 py-6">لا توجد أصناف مطابقة</p>}
          {list.map((p) => (
            <button key={p.id} type="button" onClick={() => onPick(p)} data-testid="edit-item-row"
              className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-500/10 border border-transparent hover:border-amber-200 text-right cursor-pointer">
              <span className="min-w-0">
                <span className="block font-bold text-sm text-slate-800 dark:text-slate-100 truncate">{p.nameAr}</span>
                <span className="block text-[11px] font-mono text-slate-400 truncate" dir="ltr">{p.barcode || '—'}</span>
              </span>
              <span className="shrink-0 font-black text-sm text-emerald-600 dark:text-emerald-400">{Number(p.price || 0).toFixed(2)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
