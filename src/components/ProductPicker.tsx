import React, { useDeferredValue, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { Product } from '../types';

/**
 * اختيار صنف بالبحث (بالاسم أو الباركود) بدل قائمة <select> فيها آلاف الخيارات.
 * يعرض أول ٥٠ نتيجة فقط، ويدعم مسح الباركود ثم Enter لاختيار أول نتيجة.
 */
export default function ProductPicker<P extends Product>({
  products,
  value,
  onChange,
  placeholder = 'ابحث بالاسم أو الباركود...',
  label,
  className = '',
  maxResults = 50,
}: {
  products: P[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  label?: (p: P) => React.ReactNode;
  className?: string;
  maxResults?: number;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const deferred = useDeferredValue(query);

  const selected = useMemo(() => (value ? products.find((p) => p.id === value) : undefined), [products, value]);

  const results = useMemo(() => {
    if (!open) return [];
    const q = deferred.trim().toLowerCase();
    const out: P[] = [];
    if (q) {
      // مطابقة الباركود الكاملة أولاً
      for (const p of products) {
        if ((p.barcode || '').trim() === q || (p.barcodes || []).includes(q) || p.units?.some((u) => (u.barcode || '').trim() === q)) out.push(p);
        if (out.length >= maxResults) return out;
      }
    }
    for (const p of products) {
      if (out.length >= maxResults) break;
      if (out.includes(p)) continue;
      if (
        !q ||
        (p.nameAr || '').toLowerCase().includes(q) ||
        (p.nameEn || '').toLowerCase().includes(q) ||
        (p.barcode || '').includes(q) ||
        (p.barcodes || []).some((b) => b.includes(q))
      ) out.push(p);
    }
    return out;
  }, [products, deferred, open, maxResults]);

  const pick = (p: P) => {
    onChange(p.id);
    setQuery('');
    setOpen(false);
    setActive(0);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.max(0, results.length - 1))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const p = results[active] || results[0];
      if (p) pick(p);
    } else if (e.key === 'Escape') { setOpen(false); }
  };

  const display = open ? query : selected ? selected.nameAr : '';

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={display}
        placeholder={selected && open ? selected.nameAr : placeholder}
        onFocus={() => { setOpen(true); setActive(0); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
        onKeyDown={onKeyDown}
        className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pr-9 pl-8 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 font-bold"
      />
      <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      {value && !open && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          title="إلغاء الاختيار"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl text-right">
          {results.length === 0 ? (
            <div className="p-3 text-xs text-slate-500 font-bold">لا توجد أصناف مطابقة</div>
          ) : (
            results.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(p); }}
                onMouseEnter={() => setActive(i)}
                className={`w-full text-right px-3 py-2 text-xs font-bold flex items-center justify-between gap-2 cursor-pointer ${
                  i === active ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                } ${p.id === value ? 'ring-1 ring-inset ring-cyan-500/50' : ''}`}
              >
                <span className="truncate">{label ? label(p) : p.nameAr}</span>
                {p.barcode && <span className="font-mono text-[10px] text-slate-400 shrink-0" dir="ltr">{p.barcode}</span>}
              </button>
            ))
          )}
          {results.length >= maxResults && (
            <div className="px-3 py-1.5 text-[10px] text-slate-400 border-t border-slate-100 dark:border-slate-800">
              تُعرض أول {maxResults} نتيجة — اكتب أكثر لتضييق البحث
            </div>
          )}
        </div>
      )}
    </div>
  );
}
