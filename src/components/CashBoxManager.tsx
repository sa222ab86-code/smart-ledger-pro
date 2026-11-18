import { useMemo, useState } from 'react';
import { Wallet, ArrowDownCircle, ArrowUpCircle, Trash2, X, Banknote, Calendar, Pencil, Scale } from 'lucide-react';
import type { CashMovement, Invoice } from '../types';
import type { ZReportRecord } from './ZReportManager';
import { round2, invoiceCollected, isReturnDoc } from '../utils/invoiceMath';
import { computeShift, displayTs, type ShiftCut } from '../utils/shiftReport';
import { useVirtualRows, VSpacer } from '../utils/useVirtualRows';
import { usePersistentState } from '../storage/persistence';
import { localTimestamp } from '../utils/files';

/** أسباب جاهزة تُسرّع التسجيل (يمكن كتابة أي سبب آخر) */
const IN_REASONS = ['رأس مال / عهدة', 'إيداع من المالك', 'تحصيل دين', 'فكّة للصندوق', 'أخرى'];
const OUT_REASONS = ['شراء بضاعة', 'مصروف تشغيلي', 'رواتب / سلفة', 'إيجار وفواتير', 'توريد للبنك', 'سحب المالك', 'أخرى'];

export interface CashBoxManagerProps {
  movements: CashMovement[];
  invoices: Invoice[];
  cashierName: string;
  currency: string;
  /** هل زر العهدة مفعّل (تُعرض بطاقة العهدة) */
  floatEnabled?: boolean;
  /** صلاحية تسجيل الحركات وحذفها */
  canWrite?: boolean;
  canDelete?: boolean;
  onAdd: (m: CashMovement) => void;
  onDelete: (id: string) => void;
  /** تعديل حركة قائمة (المبلغ/السبب/الملاحظة) مع إبقاء أثر التعديل */
  onEdit?: (m: CashMovement) => void;
  notify?: (msg: string) => void;
}

type Period = 'shift' | 'today' | 'month' | 'all';
const PERIODS: { id: Period; label: string }[] = [
  { id: 'shift', label: 'منذ آخر إقفال' },
  { id: 'today', label: 'اليوم' },
  { id: 'month', label: 'هذا الشهر' },
  { id: 'all', label: 'الكل' },
];

export default function CashBoxManager({
  movements, invoices, cashierName, currency, floatEnabled = false,
  canWrite = true, canDelete = true, onAdd, onDelete, onEdit, notify,
}: CashBoxManagerProps) {
  // حدّ آخر إقفال يومي: الوردية الحالية تبدأ بعده
  const [zReports] = usePersistentState<ZReportRecord[]>('zReports', []);
  const cut = useMemo<ShiftCut | null>(() => {
    const last = zReports.filter((r) => r.kind !== 'shift')[0];
    if (!last) return null;
    if (last.cutoff) return { at: last.cutoff, ids: new Set(last.cutoffIds || []) };
    const end = Date.parse(last.shiftEnd);
    return Number.isFinite(end) ? { at: localTimestamp(new Date(end)), ids: new Set<string>() } : null;
  }, [zReports]);

  const [period, setPeriod] = useState<Period>('shift');
  const [form, setForm] = useState<null | 'in' | 'out' | 'float'>(null);
  /** الحركة قيد التعديل (الحذف للمدير، والتعديل لمن يملك الصندوق) */
  const [editing, setEditing] = useState<CashMovement | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  /** هل تدخل الحركة ضمن الفترة المختارة */
  const inPeriod = (date: string) => {
    if (period === 'all') return true;
    if (period === 'today') return (date || '').slice(0, 10) === today;
    if (period === 'month') return (date || '').slice(0, 7) === month;
    return !cut || (date || '') > cut.at; // الوردية الحالية
  };

  const rows = useMemo(
    () => movements.filter((m) => inPeriod(m.date)).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [movements, period, cut?.at], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // نقدي المبيعات في نفس الفترة — بنفس قواعد تقرير الإقفال:
  // المرتجع من المستند (سالب)، والفاتورة الآجلة/المقسّمة من دفعاتها بتاريخها، والمدفوعة كاملاً من إجماليها
  const salesCash = useMemo(() => {
    if (period === 'shift') return computeShift(invoices, cut).totalCash;
    const within = (d: string | undefined) => inPeriod(d || '');
    let cash = 0;
    for (const i of invoices) {
      const ret = isReturnDoc(i);
      if (ret) {
        if (within(i.date) && i.paymentMethod === 'cash') cash += invoiceCollected(i); // سالب = ما رُدّ للعميل
        continue;
      }
      if (Array.isArray(i.payments)) {
        for (const p of i.payments) if (p.method === 'cash' && within(p.date)) cash += Number(p.amount) || 0;
      } else if (within(i.date) && i.paymentMethod === 'cash') {
        cash += invoiceCollected(i);
      }
    }
    return round2(cash);
  }, [invoices, period, cut?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  // أي قيمة غير صالحة تُحسب صفراً حتى لا يظهر الرصيد NaN أو فارغاً
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const sumOf = (f: (m: CashMovement) => boolean) => round2(rows.filter(f).reduce((s, m) => s + num(m.amount), 0));
  // العهدة وفرق الجرد حركتان مميّزتان فلا تُحسبان ضمن الإدخالات/المصروفات اليدوية
  const totalIn = sumOf((m) => m.type === 'in' && !m.kind);
  const totalOut = sumOf((m) => m.type === 'out' && !m.kind);
  const float = sumOf((m) => m.kind === 'float');
  const diffIn = sumOf((m) => m.kind === 'diff' && m.type === 'in');
  const diffOut = sumOf((m) => m.kind === 'diff' && m.type === 'out');
  // التوريد للخزنة تحويل لا مصروف: يخرج من الدرج ولا يُحسب ضمن المصروفات
  const handedOver = sumOf((m) => m.kind === 'handover');
  const balance = round2(float + num(salesCash) + totalIn + diffIn - totalOut - diffOut - handedOver);

  const money = (n: number) => (Number.isFinite(n) ? n : 0).toFixed(2);
  const openForm = (t: 'in' | 'out' | 'float') => { setEditing(null); setForm(t); setAmount(''); setReason(t === 'float' ? 'نقدية بداية الوردية' : ''); setNote(''); };
  const openEdit = (m: CashMovement) => {
    setEditing(m); setForm(m.kind === 'float' ? 'float' : m.type);
    setAmount(String(num(m.amount))); setReason(m.reason || ''); setNote(m.note || '');
  };
  const submit = () => {
    const v = round2(Number(amount) || 0);
    if (!form || v <= 0) return;
    const isFloat = form === 'float';
    const r = reason.trim() || (isFloat ? 'نقدية بداية الوردية' : form === 'in' ? 'إدخال مبلغ' : 'صرف مبلغ');
    if (editing) {
      // التعديل لا يمحو الحركة: يبقى المبلغ الأصلي ومن عدّل ومتى
      const was = num(editing.amount);
      onEdit?.({
        ...editing, amount: v, reason: r, note: note.trim() || undefined,
        origAmount: editing.origAmount ?? was, editedBy: cashierName, editedAt: localTimestamp(),
      });
      notify?.(was === v ? `عُدّلت الحركة «${r}»` : `عُدّلت الحركة: ${money(was)} ← ${money(v)} ${currency}`);
    } else {
      onAdd({ id: `cm-${Date.now()}`, date: localTimestamp(), type: isFloat ? 'in' : form, amount: v, reason: r, kind: isFloat ? 'float' : undefined, note: note.trim() || undefined, by: cashierName });
      notify?.(`${isFloat ? 'سُجّلت نقدية بداية الوردية' : form === 'in' ? 'أُدخل مبلغ' : 'صُرف مبلغ'} ${money(v)} ${currency}${isFloat ? '' : ` — ${r}`}`);
    }
    setForm(null); setEditing(null);
  };

  const table = useVirtualRows<CashMovement>(rows, (m) => m.id, { estimate: 48, resetKey: period });
  const cards: { label: string; value: number; cls: string; icon: React.ReactNode; hint?: string }[] = [
    { label: 'رصيد الصندوق', value: balance, cls: balance < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400', icon: <Wallet className="w-5 h-5" />, hint: `${float > 0 ? 'العهدة + ' : ''}نقدي المبيعات + الإدخالات − المصروفات${diffIn || diffOut ? ' ± فروق الجرد' : ''}` },
    ...(float > 0 || floatEnabled ? [{ label: 'العهدة', value: float, cls: 'text-amber-600 dark:text-amber-400', icon: <span className="text-base leading-none">🪙</span> as React.ReactNode, hint: 'النقدية المسجّلة عند بداية الوردية' }] : []),
    { label: 'نقدي المبيعات', value: salesCash, cls: 'text-slate-700 dark:text-slate-200', icon: <Banknote className="w-5 h-5" />, hint: 'ما دخل الصندوق من البيع والتحصيل' },
    { label: 'إدخالات يدوية', value: totalIn, cls: 'text-emerald-600 dark:text-emerald-400', icon: <ArrowDownCircle className="w-5 h-5" /> },
    { label: 'مصروفات', value: totalOut, cls: 'text-rose-600 dark:text-rose-400', icon: <ArrowUpCircle className="w-5 h-5" /> },
    ...(diffIn || diffOut ? [{ label: diffOut > diffIn ? 'عجز الجرد' : 'زيادة الجرد', value: round2(diffIn - diffOut), cls: diffOut > diffIn ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400', icon: <Scale className="w-5 h-5" /> as React.ReactNode, hint: 'فرق النقد المعدود عند الإقفال' }] : []),
    ...(handedOver ? [{ label: 'مُسلَّم للخزنة', value: handedOver, cls: 'text-indigo-600 dark:text-indigo-400', icon: <Banknote className="w-5 h-5" /> as React.ReactNode, hint: 'نقد خرج من الدرج للإدارة — ليس مصروفاً' }] : []),
  ];

  const inp = 'w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-cyan-500';

  return (
    <div className="p-4 2xl:p-6 bg-slate-50 dark:bg-slate-950 text-right text-slate-800 dark:text-slate-100 h-full flex flex-col gap-5" dir="rtl">
      {/* العنوان والأزرار */}
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Wallet className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            <span>الصندوق</span>
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">إدخال مبلغ للصندوق أو صرف مبلغ منه، ومتابعة الرصيد النقدي.</p>
        </div>
        <div className="flex gap-2">
          {canWrite && (
            <>
              <button onClick={() => openForm('in')} data-testid="cash-in-btn" className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg transition">
                <ArrowDownCircle className="w-5 h-5" /><span>إدخال مبلغ</span>
              </button>
              <button onClick={() => openForm('out')} data-testid="cash-out-btn" className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg transition">
                <ArrowUpCircle className="w-5 h-5" /><span>صرف مبلغ</span>
              </button>
              {floatEnabled && (
                <button onClick={() => openForm('float')} data-testid="cash-float-btn" title="النقد الموجود في الدرج قبل البيع" className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg transition">
                  <span className="text-base leading-none">🪙</span><span>نقدية البداية</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* الفترة */}
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar className="w-4 h-4 text-slate-400" />
        <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-xl text-xs font-black">
          {PERIODS.map((p) => (
            <button key={p.id} onClick={() => setPeriod(p.id)} data-period={p.id}
              className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${period === p.id ? 'bg-white dark:bg-slate-950 text-cyan-600 dark:text-cyan-400 shadow' : 'text-slate-500 dark:text-slate-400'}`}>
              {p.label}
            </button>
          ))}
        </div>
        {period === 'shift' && <span className="text-[11px] font-bold text-slate-400">{cut ? `بعد ${displayTs(cut.at)}` : 'لا يوجد إقفال سابق — كل الحركات'}</span>}
      </div>

      {/* البطاقات */}
      <div className={`grid grid-cols-2 gap-3 ${cards.length >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
        {cards.map((c) => (
          <div key={c.label} className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 shadow-sm" data-testid={`cash-card-${c.label}`}>
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-bold">{c.icon}<span>{c.label}</span></div>
            <div className={`font-mono font-black text-2xl mt-1 ${c.cls}`} dir="ltr">{money(c.value)}</div>
            {c.hint && <p className="text-[10.5px] text-slate-400 mt-1 leading-snug">{c.hint}</p>}
          </div>
        ))}
      </div>

      {/* جدول الحركات */}
      <div className="flex-1 min-h-[16rem] flex flex-col bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
        <div ref={table.scrollRef} className="flex-1 min-h-0 overflow-auto vlist-scroll" data-testid="cash-scroll">
          <table className="w-full text-right text-sm">
            <thead className="sticky top-0 z-[3] bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 text-xs shadow-[0_1px_0_rgba(100,116,139,0.25)]">
              <tr>
                <th className="p-3 font-bold">التاريخ</th>
                <th className="p-3 font-bold">الحركة</th>
                <th className="p-3 font-bold">السبب</th>
                <th className="p-3 font-bold text-center">المبلغ</th>
                <th className="p-3 font-bold">المستخدم</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="p-10 text-center text-slate-500 font-bold">لا توجد حركات في هذه الفترة</td></tr>
              ) : (<>
                <VSpacer h={table.padTop} />
                {table.visible.map((m) => (
                  <tr key={m.id} data-vkey={m.id} data-testid="cash-row" className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition">
                    <td className="p-3 font-mono text-xs text-slate-500" dir="ltr">{displayTs(m.date)}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-lg text-[11px] font-black ${m.kind === 'float' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : m.type === 'in' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'}`}>
                        {m.kind === 'float' ? 'عهدة' : m.kind === 'handover' ? 'توريد' : m.kind === 'diff' ? (m.type === 'out' ? 'عجز جرد' : 'زيادة جرد') : m.type === 'in' ? 'إدخال' : 'صرف'}
                      </span>
                    </td>
                    <td className="p-3 font-bold">{m.reason}
                      {m.note && <span className="block text-[11px] font-semibold text-slate-400">{m.note}</span>}
                      {m.editedBy && <span className="block text-[10.5px] font-bold text-cyan-600 dark:text-cyan-400" data-testid="cash-edited">عُدّلت بواسطة {m.editedBy}{typeof m.origAmount === 'number' ? ` — كانت ${money(m.origAmount)}` : ''}</span>}
                    </td>
                    <td className={`p-3 text-center font-mono font-black ${m.kind === 'float' ? 'text-amber-600 dark:text-amber-400' : m.kind === 'handover' ? 'text-indigo-600 dark:text-indigo-400' : m.kind === 'diff' ? (m.type === 'out' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400') : m.type === 'in' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`} dir="ltr">
                      {m.type === 'in' ? '+' : '−'}{money(num(m.amount))}
                    </td>
                    <td className="p-3 text-xs font-bold text-slate-500">{m.by || '—'}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-0.5">
                        {canWrite && onEdit && !m.kind && (
                          <button onClick={() => openEdit(m)} data-testid="cash-edit" title="تعديل الحركة"
                            className="text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 p-1.5 rounded-lg transition">
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => { if (confirm(`حذف الحركة «${m.reason}» بمبلغ ${money(num(m.amount))}؟\n\nالحذف يمحو الحركة من السجل نهائياً — إن أردت تصحيح المبلغ فاستخدم «تعديل».`)) onDelete(m.id); }}
                            data-testid="cash-del" className="text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 p-1.5 rounded-lg transition" title="حذف الحركة (المدير فقط)">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                <VSpacer h={table.padBottom} />
              </>)}
            </tbody>
          </table>
        </div>
      </div>

      {/* نافذة الإدخال/الصرف */}
      {form && (
        <div className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden text-right" data-testid="cash-modal">
            <div className="bg-slate-50 dark:bg-slate-950 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <span className={`font-black text-lg flex items-center gap-2 ${form === 'float' ? 'text-amber-600 dark:text-amber-400' : form === 'in' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {form === 'float' ? <span className="text-xl leading-none">🪙</span> : form === 'in' ? <ArrowDownCircle className="w-5 h-5" /> : <ArrowUpCircle className="w-5 h-5" />}
                {editing ? 'تعديل حركة' : form === 'float' ? 'نقدية بداية الوردية' : form === 'in' ? 'إدخال مبلغ للصندوق' : 'صرف مبلغ من الصندوق'}
              </span>
              <button onClick={() => { setForm(null); setEditing(null); }} className="text-slate-500 hover:text-rose-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <label className="block space-y-1">
                <span className="text-xs font-bold text-slate-500">المبلغ ({currency})</span>
                <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} onFocus={(e) => e.target.select()}
                  autoFocus data-testid="cash-amount" className={`${inp} font-mono text-lg text-center`} dir="ltr" />
              </label>
              {form === 'float' && <p className="text-xs font-bold text-amber-600 dark:text-amber-400">النقد الموجود في الدرج قبل البيع — يُحسب في الرصيد وفي النقد المتوقع عند الإقفال، ولا يُحسب ضمن الإدخالات.</p>}
              <label className="block space-y-1">
                <span className="text-xs font-bold text-slate-500">السبب</span>
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={form === 'in' ? 'رأس مال / عهدة' : form === 'float' ? 'نقدية بداية الوردية' : 'شراء بضاعة'} data-testid="cash-reason" className={inp} />
              </label>
              <div className={`flex flex-wrap gap-1.5 ${form === 'float' ? 'hidden' : ''}`}>
                {(form === 'out' ? OUT_REASONS : IN_REASONS).map((r) => (
                  <button key={r} type="button" onClick={() => setReason(r)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${reason === r ? 'bg-cyan-500/15 border-cyan-500 text-cyan-700 dark:text-cyan-300' : 'border-slate-300 dark:border-slate-700 text-slate-500'}`}>
                    {r}
                  </button>
                ))}
              </div>
              <label className="block space-y-1">
                <span className="text-xs font-bold text-slate-500">ملاحظة (اختياري)</span>
                <input value={note} onChange={(e) => setNote(e.target.value)} className={inp} />
              </label>
              {Number(amount) > 0 && form === 'out' && round2(Number(amount)) > balance && (
                <p className="text-xs font-bold text-amber-600 dark:text-amber-400">المبلغ أكبر من رصيد الصندوق ({money(balance)}) — سيصبح الرصيد سالباً.</p>
              )}
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex gap-2">
              <button onClick={() => { setForm(null); setEditing(null); }} className="px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-sm">إلغاء</button>
              <button onClick={submit} disabled={!(Number(amount) > 0)} data-testid="cash-confirm"
                className={`flex-1 py-3 rounded-xl font-black disabled:opacity-40 ${form === 'float' ? 'bg-amber-500 hover:bg-amber-400 text-slate-950' : form === 'in' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-rose-600 hover:bg-rose-700 text-white'}`}>
                {editing ? 'حفظ التعديل' : form === 'float' ? 'تأكيد نقدية البداية' : form === 'in' ? 'تأكيد الإدخال' : 'تأكيد الصرف'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
