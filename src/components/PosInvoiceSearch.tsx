import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { Invoice } from '../types';
import { customerLabel, isReturnDoc } from '../utils/invoiceMath';
import { findInvoiceByCode, normDocCode, scanCandidates, serialHit } from '../utils/docScan';

/**
 * «ابحث عن فاتورة» في شاشة البيع: برقم الفاتورة (أو جزء منه) أو اسم العميل أو جواله،
 * أو بمسح باركود الإيصال داخل الخانة — النتيجة تفتح نافذة الفاتورة (مرتجع، إعادة طباعة...).
 */
export default function PosInvoiceSearch({ invoices, onOpen }: { invoices: Invoice[]; onOpen: (inv: Invoice) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const results = useMemo(() => {
    const raw = q.trim();
    if (!raw) return [];
    const codes = scanCandidates(raw).map(normDocCode).filter(Boolean);
    const text = raw.toLowerCase();
    const out: Invoice[] = [];
    // الأحدث أولاً
    for (let i = invoices.length - 1; i >= 0 && out.length < 8; i--) {
      const inv = invoices[i];
      const num = normDocCode(inv.invoiceNumber || inv.number);
      const name = String(inv.customerName || '').toLowerCase();
      const phone = String((inv as Invoice & { customerPhone?: string }).customerPhone || '');
      if (codes.some((c) => num.includes(c)) || (text.length >= 2 && (name.includes(text) || (phone && phone.includes(raw)))) || serialHit(inv, raw, true)) out.push(inv);
    }
    return out;
  }, [q, invoices]);
  useEffect(() => { setHi(0); }, [q]);

  const pick = (inv: Invoice) => { setOpen(false); setQ(''); onOpen(inv); };

  return (
    <div ref={box} className="relative" data-testid="pos-invoice-search">
      <div className="relative">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, results.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
            else if (e.key === 'Escape') { setOpen(false); setQ(''); }
            else if (e.key === 'Enter') {
              e.preventDefault();
              // رقم كامل (أو باركود الإيصال) → مباشرة، وإلا النتيجة المحددة
              const exact = findInvoiceByCode(invoices, q);
              const inv = exact || results[hi];
              if (inv) pick(inv);
            }
          }}
          placeholder="ابحث عن فاتورة…"
          title="برقم الفاتورة أو اسم العميل أو جواله أو الرقم التسلسلي للصنف (S/N) — أو امسح باركود الإيصال"
          className="pos-pill-input w-36 lg:w-44 pr-8 pl-7 text-xs font-bold outline-none"
          data-testid="pos-invoice-search-input"
        />
        <Search className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        {q && <button type="button" onClick={() => { setQ(''); setOpen(false); }} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500"><X className="w-3.5 h-3.5" /></button>}
      </div>
      {open && q.trim() && (
        <div className="absolute z-50 mt-1 left-0 w-80 max-h-96 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl text-right" dir="rtl" data-testid="pos-invoice-results">
          {results.length === 0 && <div className="px-4 py-3 text-sm font-bold text-slate-500">لا توجد فاتورة مطابقة</div>}
          {results.map((inv, idx) => {
            const ret = isReturnDoc(inv);
            return (
              <button key={inv.id} type="button" onMouseEnter={() => setHi(idx)} onClick={() => pick(inv)}
                className={`w-full px-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0 flex items-center justify-between gap-2 ${idx === hi ? 'bg-cyan-500/15' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                <div className="min-w-0 text-right">
                  <div className="font-mono font-black text-sm text-slate-800 dark:text-white" dir="ltr" style={{ textAlign: 'right' }}>
                    {inv.invoiceNumber || inv.number}{ret && <span className="mr-1.5 text-[10px] font-sans font-black text-rose-600 bg-rose-500/10 rounded px-1">مرتجع</span>}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold truncate">{customerLabel(inv.customerName)} · <span className="font-mono" dir="ltr">{String(inv.date || '').slice(0, 16)}</span></div>
                  {(() => { const sn = serialHit(inv, q, true); if (!sn) return null; const it = inv.items.find((x) => x.serial === sn); return <div className="text-[11px] font-black text-slate-700 dark:text-slate-200 truncate" data-testid="pos-invoice-serial">{it?.name} · <span className="font-mono" dir="ltr">S/N: {sn}</span></div>; })()}
                </div>
                <div className={`font-mono font-black text-sm shrink-0 ${ret ? 'text-rose-600' : 'text-emerald-600'}`} dir="ltr">{Math.abs(inv.total || 0).toFixed(2)}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
