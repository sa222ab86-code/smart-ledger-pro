import { useState } from 'react';
import { AlertTriangle, RotateCcw, ShieldAlert } from 'lucide-react';

/**
 * إعادة تعيين البيانات (للمدير فقط): المنتجات / العملاء / الفواتير.
 * الفواتير والعملاء مترابطان (المديونيات والأرصدة) — اختيار أحدهما يؤشر الآخر تلقائياً.
 * تُؤخذ نسخة احتياطية قبل الحذف، ويُطلب كتابة كلمة «حذف» للتأكيد.
 */
export interface ResetChoice { products: boolean; groups: boolean; customers: boolean; invoices: boolean; renumber: boolean }

interface Props {
  isAdmin: boolean;
  /** الفوترة الإلكترونية مفعّلة: لا يُعاد الترقيم (أرقام مُبلَّغة للهيئة) */
  zatcaActive: boolean;
  counts: { products: number; groups: number; customers: number; invoices: number };
  onReset: (c: ResetChoice) => Promise<{ ok: boolean; message: string }>;
}

export default function DataResetPanel({ isAdmin, zatcaActive, counts, onReset }: Props) {
  const [c, setC] = useState<ResetChoice>({ products: false, groups: false, customers: false, invoices: false, renumber: false });
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // الفواتير ↔ العملاء: معاً دائماً
  const toggle = (k: 'products' | 'groups' | 'customers' | 'invoices') => setC((p) => {
    const v = !p[k];
    // حذف الأصناف يؤشّر المجموعات تلقائياً (يمكن إلغاؤها)
    if (k === 'products') return { ...p, products: v, groups: v ? true : p.groups };
    if (k === 'groups') return { ...p, groups: v };
    return { ...p, customers: v, invoices: v, renumber: v ? p.renumber : false };
  });
  const any = c.products || c.groups || c.customers || c.invoices;
  const ready = any && confirmText.trim() === 'حذف' && !busy;

  const run = async () => {
    if (!ready) return;
    setBusy(true); setMsg(null);
    try {
      const r = await onReset(c);
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) { setC({ products: false, groups: false, customers: false, invoices: false, renumber: false }); setConfirmText(''); }
    } finally { setBusy(false); }
  };

  const row = (k: 'products' | 'groups' | 'customers' | 'invoices', label: string, hint: string, count: number) => (
    <label className={`flex items-start gap-3 rounded-xl border-2 px-3 py-2.5 cursor-pointer ${c[k] ? 'border-rose-400 bg-rose-50 dark:bg-rose-950/30' : 'border-slate-200 dark:border-slate-700'}`}>
      <input type="checkbox" checked={c[k]} onChange={() => toggle(k)} className="mt-1 w-4 h-4 accent-rose-600" data-testid={`reset-${k}`} />
      <span className="flex-1">
        <span className="block text-sm font-black">{label} <span className="font-mono text-xs text-slate-500">({count})</span></span>
        <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">{hint}</span>
      </span>
    </label>
  );

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border-2 border-rose-200 dark:border-rose-900/60 p-5 space-y-4 mt-5" data-testid="data-reset" dir="rtl">
      <h3 className="font-black text-lg flex items-center gap-2 text-rose-700 dark:text-rose-300"><RotateCcw className="w-5 h-5" /> إعادة تعيين قاعدة البيانات</h3>
      {!isAdmin ? (
        <p className="text-sm font-bold text-slate-500 flex items-center gap-2"><ShieldAlert className="w-4 h-4" /> هذا الإجراء متاح لمدير النظام فقط.</p>
      ) : (
        <>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            لحذف بيانات التجربة قبل بدء العمل الفعلي. تُؤخذ نسخة احتياطية تلقائياً قبل الحذف، ويمكن استرجاعها من «النسخ الاحتياطي» أعلاه.
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {row('products', 'الأصناف', 'كل الأصناف والباقات', counts.products)}
            {row('groups', 'مجموعات الأصناف', c.products || !counts.products ? 'كل المجموعات' : 'كل المجموعات — الأصناف الباقية تصبح بلا مجموعة', counts.groups)}
            {row('invoices', 'الفواتير', 'المبيعات والمرتجعات والطلبات المعلقة وتقارير الإقفال', counts.invoices)}
            {row('customers', 'العملاء', 'كل العملاء وأرصدتهم', counts.customers)}
          </div>
          {(c.invoices || c.customers) && (
            <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> الفواتير والعملاء مترابطان (المديونيات والأرصدة) فيُحذفان معاً.</p>
          )}
          {c.invoices && (
            zatcaActive
              ? <p className="text-[11px] font-bold text-slate-500">الفوترة الإلكترونية مفعّلة: ترقيم الفواتير يستمر ولا يبدأ من 1 (أرقام سابقة مُبلَّغة للهيئة).</p>
              : <label className="flex items-center gap-2 text-sm font-bold cursor-pointer"><input type="checkbox" checked={c.renumber} onChange={() => setC((p) => ({ ...p, renumber: !p.renumber }))} data-testid="reset-renumber" /> إعادة ترقيم الفواتير والمرتجعات من 1</label>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder='اكتب «حذف» للتأكيد' disabled={!any}
              className="w-48 px-3 py-2 rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm font-bold disabled:opacity-50" data-testid="reset-confirm" />
            <button type="button" onClick={run} disabled={!ready} className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-sm disabled:opacity-40 flex items-center gap-2" data-testid="reset-run">
              <RotateCcw className="w-4 h-4" /> {busy ? 'جارٍ الحذف…' : 'حذف البيانات المحددة'}
            </button>
          </div>
          {msg && <p className={`text-sm font-black ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`} data-testid="reset-msg">{msg.text}</p>}
        </>
      )}
    </div>
  );
}
