import { useMemo, useState } from 'react';
import { X, Search, UserPlus, User, Check } from 'lucide-react';
import type { Customer } from '../types';
import CustomerForm, { type CustomerDraft } from './CustomerForm';

interface Props {
  customers: Customer[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (d: CustomerDraft) => void;
  onClose: () => void;
}

const field =
  'w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-cyan-500';

export default function PosCustomerPicker({ customers, selectedId, onSelect, onCreate, onClose }: Props) {
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (q ? customers.filter((c) => c.name.toLowerCase().includes(q) || (c.phone || '').includes(q)) : customers).slice(0, 100);
  }, [customers, search]);


  return (
    <div className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 w-full max-w-md max-h-[85vh] rounded-2xl shadow-2xl flex flex-col text-right overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
          <h3 className="font-black text-slate-900 dark:text-white flex items-center gap-2"><User className="w-5 h-5 text-cyan-500" /> اختيار العميل</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-rose-500"><X className="w-5 h-5" /></button>
        </div>

        {(
          <>
            <div className="p-3 space-y-2">
              <div className="relative">
                <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو الجوال..." className={`${field} pr-9`} />
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              </div>
              <button
                onClick={() => onSelect(null)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm font-bold ${selectedId === null ? 'border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                <span>عميل عام (بدون تسجيل)</span>
                {selectedId === null && <Check className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex-1 min-h-[120px] overflow-y-auto px-3 pb-3 space-y-1.5">
              {list.length === 0 && <div className="py-6 text-center text-xs font-bold text-slate-400">لا يوجد عملاء مطابقون.</div>}
              {list.map((c) => {
                const debt = (c.balance || 0) < -0.004 ? Math.abs(c.balance) : 0;
                const on = selectedId === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => onSelect(c.id)}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border text-right ${on ? 'border-cyan-500 bg-cyan-500/10' : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-black text-slate-900 dark:text-white truncate">{c.name}</div>
                      {c.phone && <div className="text-[11px] font-mono text-slate-500" dir="ltr">{c.phone}</div>}
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      {debt > 0 && <span className="text-[11px] font-black font-mono text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-full px-2 py-0.5">عليه {debt.toFixed(2)}</span>}
                      {on && <Check className="w-4 h-4 text-cyan-500" />}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="p-3 border-t border-slate-200 dark:border-slate-800">
              <button onClick={() => setCreating(true)} className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-black text-sm flex items-center justify-center gap-2">
                <UserPlus className="w-4 h-4" /> عميل جديد
              </button>
            </div>
          </>
        )}
      </div>
      {creating && (
        <CustomerForm
          zIndex="z-[9999]"
          title="إضافة عميل جديد"
          submitLabel="حفظ واختيار العميل"
          onSubmit={onCreate}
          onCancel={() => setCreating(false)}
        />
      )}
    </div>
  );
}
