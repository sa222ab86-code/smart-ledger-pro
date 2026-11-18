import { useMemo, useState } from 'react';
import { X, UserPlus, Banknote, CreditCard, Wallet, Landmark } from 'lucide-react';
import type { Customer, Invoice, PayMethod } from '../types';
import { round2, invoiceRemaining, customerLabel, payMethodLabel } from '../utils/invoiceMath';

export interface PartialPaymentData {
  customerId: string;
  newCustomer?: { name: string; phone: string };
  paid: number;
  method: PayMethod;
}

const box = 'fixed inset-0 z-[9998] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4';
const card = 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden text-right';
const field = 'w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-400 text-slate-800 dark:text-slate-100 font-bold';

/* ------------------------------------------------------------------ *
 * دفع جزئي / آجل عند البيع
 * ------------------------------------------------------------------ */
export function PartialPaymentModal({
  total, customers, initialCustomerId, onConfirm, onClose,
}: {
  total: number;
  initialCustomerId?: string;
  customers: Customer[];
  onConfirm: (d: PartialPaymentData) => void;
  onClose: () => void;
}) {
  const [customerId, setCustomerId] = useState(initialCustomerId || '');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [paidText, setPaidText] = useState('');
  const [method, setMethod] = useState<PayMethod>('cash');
  const [search, setSearch] = useState('');

  const paid = Number(paidText) || 0;
  const remaining = round2(total - paid);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? customers.filter((c) => c.name.toLowerCase().includes(q) || (c.phone || '').includes(q)) : customers;
  }, [customers, search]);

  const error = useMemo(() => {
    if (!creating && !customerId) return 'اختر العميل أو أضف عميلاً جديداً';
    if (creating && !newName.trim()) return 'اكتب اسم العميل الجديد';
    if (paid < 0) return 'المبلغ المدفوع غير صالح';
    if (paid >= total - 0.004) return 'المبلغ المدفوع يساوي الإجمالي أو يزيد — استخدم الدفع العادي';
    return '';
  }, [creating, customerId, newName, paid, total]);

  const submit = () => {
    if (error) return;
    onConfirm({
      customerId: creating ? '' : customerId,
      newCustomer: creating ? { name: newName.trim(), phone: newPhone.trim() } : undefined,
      paid: round2(paid),
      method,
    });
  };

  return (
    <div className={box} dir="rtl">
      <div className={card}>
        <div className="bg-slate-50 dark:bg-slate-950 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <span className="font-black text-lg text-amber-600 dark:text-amber-400 flex items-center gap-2"><Wallet className="w-5 h-5" /> دفع جزئي / آجل</span>
          <button onClick={onClose} className="text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-950 rounded-xl p-3 border border-slate-200 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">إجمالي الفاتورة</span>
            <span className="font-mono font-black text-xl text-slate-900 dark:text-white">{total.toFixed(2)}</span>
          </div>

          {/* العميل */}
          {!creating ? (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400">العميل *</label>
                <button onClick={() => setCreating(true)} className="text-xs font-bold text-cyan-600 dark:text-cyan-400 flex items-center gap-1"><UserPlus className="w-3.5 h-3.5" /> عميل جديد</button>
              </div>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو الجوال..." className={field} />
              <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
                {filtered.length === 0 && <div className="p-3 text-xs text-slate-500 text-center">لا يوجد عملاء. أضف عميلاً جديداً.</div>}
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCustomerId(c.id)}
                    className={`w-full flex justify-between items-center px-3 py-2 text-sm font-bold text-right ${customerId === c.id ? 'bg-amber-400/15 text-amber-700 dark:text-amber-300' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                  >
                    <span>{c.name}</span>
                    {(c.balance || 0) < 0 && <span className="text-[11px] text-rose-600 dark:text-rose-400 font-mono">عليه {Math.abs(c.balance).toFixed(2)}</span>}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400">عميل جديد</label>
                <button onClick={() => setCreating(false)} className="text-xs font-bold text-slate-500 dark:text-slate-400">اختيار من القائمة</button>
              </div>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="اسم العميل *" className={field} />
              <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="رقم الجوال" className={`${field} font-mono`} dir="ltr" />
            </div>
          )}

          {/* المبلغ */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400">المبلغ المدفوع الآن (اتركه 0 للبيع الآجل بالكامل)</label>
            <input
              type="number" min="0" step="0.01" inputMode="decimal"
              value={paidText} onChange={(e) => setPaidText(e.target.value)}
              placeholder="0.00" className={`${field} font-mono text-lg`} dir="ltr"
            />
            <div className="flex gap-2">
              {[0, 0.25, 0.5, 0.75].map((f) => (
                <button key={f} onClick={() => setPaidText(f === 0 ? '' : String(round2(total * f)))} className="flex-1 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold">
                  {f === 0 ? 'آجل' : `${f * 100}%`}
                </button>
              ))}
            </div>
          </div>

          {paid > 0 && (
            <div className="flex gap-2">
              <button onClick={() => setMethod('cash')} className={`flex-1 py-2 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border ${method === 'cash' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-300' : 'border-slate-300 dark:border-slate-700'}`}><Banknote className="w-4 h-4" /> كاش</button>
              <button onClick={() => setMethod('card')} className={`flex-1 py-2 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border ${method === 'card' ? 'bg-blue-500/20 border-blue-500 text-blue-700 dark:text-blue-300' : 'border-slate-300 dark:border-slate-700'}`}><CreditCard className="w-4 h-4" /> شبكة</button>
              <button onClick={() => setMethod('bank')} data-testid="partial-pay-bank" className={`flex-1 py-2 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border ${method === 'bank' ? 'bg-violet-500/20 border-violet-500 text-violet-700 dark:text-violet-300' : 'border-slate-300 dark:border-slate-700'}`}><Landmark className="w-4 h-4" /> تحويل بنكي</button>
            </div>
          )}

          <div className="flex justify-between items-center bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">
            <span className="text-xs font-bold text-rose-700 dark:text-rose-300">المتبقي على العميل</span>
            <span className="font-mono font-black text-xl text-rose-700 dark:text-rose-300">{Math.max(0, remaining).toFixed(2)}</span>
          </div>

          {error && <p className="text-xs font-bold text-amber-600 dark:text-amber-400">{error}</p>}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex gap-2">
          <button onClick={onClose} className="px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-sm">إلغاء</button>
          <button disabled={!!error} onClick={submit} className="flex-1 py-3 rounded-xl bg-gradient-to-l from-amber-500 to-orange-600 text-white font-black disabled:opacity-40">
            إتمام البيع
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * تسجيل دفعة سداد من عميل عليه مديونية
 * ------------------------------------------------------------------ */
export function CustomerPaymentModal({
  customer, onConfirm, onClose,
}: {
  customer: Customer;
  onConfirm: (amount: number, method: PayMethod) => void;
  onClose: () => void;
}) {
  const debt = round2(Math.abs(Math.min(0, customer.balance || 0)));
  const [text, setText] = useState(debt.toFixed(2));
  const [method, setMethod] = useState<PayMethod>('cash');
  const amount = Number(text) || 0;
  const error = amount <= 0 ? 'أدخل مبلغاً أكبر من صفر' : amount > debt + 0.004 ? 'المبلغ أكبر من المديونية' : '';

  return (
    <div className={box} dir="rtl">
      <div className={card}>
        <div className="bg-slate-50 dark:bg-slate-950 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <span className="font-black text-lg text-emerald-600 dark:text-emerald-400">تسجيل دفعة — {customer.name}</span>
          <button onClick={onClose} className="text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-950 rounded-xl p-3 border border-slate-200 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">المديونية الحالية</span>
            <span className="font-mono font-black text-xl text-rose-600 dark:text-rose-400">{debt.toFixed(2)}</span>
          </div>
          <input type="number" min="0" step="0.01" value={text} onChange={(e) => setText(e.target.value)} className={`${field} font-mono text-lg`} dir="ltr" />
          <div className="flex gap-2">
            <button onClick={() => setText(debt.toFixed(2))} className="flex-1 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold">سداد كامل</button>
            <button onClick={() => setText(round2(debt / 2).toFixed(2))} className="flex-1 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold">النصف</button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setMethod('cash')} className={`flex-1 py-2 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border ${method === 'cash' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-300' : 'border-slate-300 dark:border-slate-700'}`}><Banknote className="w-4 h-4" /> كاش</button>
            <button onClick={() => setMethod('card')} className={`flex-1 py-2 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border ${method === 'card' ? 'bg-blue-500/20 border-blue-500 text-blue-700 dark:text-blue-300' : 'border-slate-300 dark:border-slate-700'}`}><CreditCard className="w-4 h-4" /> شبكة</button>
            <button onClick={() => setMethod('bank')} data-testid="pay-bank" className={`flex-1 py-2 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border ${method === 'bank' ? 'bg-violet-500/20 border-violet-500 text-violet-700 dark:text-violet-300' : 'border-slate-300 dark:border-slate-700'}`}><Landmark className="w-4 h-4" /> تحويل بنكي</button>
          </div>
          {error && <p className="text-xs font-bold text-amber-600 dark:text-amber-400">{error}</p>}
          <p className="text-[11px] text-slate-500 font-bold">تُوزَّع الدفعة تلقائياً على أقدم الفواتير غير المسددة لهذا العميل.</p>
        </div>
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex gap-2">
          <button onClick={onClose} className="px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-sm">إلغاء</button>
          <button disabled={!!error} onClick={() => onConfirm(round2(amount), method)} className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black disabled:opacity-40">تأكيد الدفعة</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * سداد فاتورة آجلة / جزئية مباشرة من قائمة الفواتير
 * ------------------------------------------------------------------ */
export function InvoicePaymentModal({
  invoice, onConfirm, onClose,
}: {
  invoice: Invoice;
  onConfirm: (amount: number, method: PayMethod) => void;
  onClose: () => void;
}) {
  const due = invoiceRemaining(invoice);
  const [text, setText] = useState(due.toFixed(2));
  const [method, setMethod] = useState<PayMethod>('cash');
  const amount = Number(text) || 0;
  const error = amount <= 0 ? 'أدخل مبلغاً أكبر من صفر' : amount > due + 0.004 ? 'المبلغ أكبر من المتبقي على الفاتورة' : '';
  const paidSoFar = round2(invoice.total - due);

  return (
    <div className={box} dir="rtl">
      <div className={card}>
        <div className="bg-slate-50 dark:bg-slate-950 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <span className="font-black text-lg text-emerald-600 dark:text-emerald-400">سداد الفاتورة {invoice.invoiceNumber || invoice.number}</span>
          <button onClick={onClose} className="text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-slate-50 dark:bg-slate-950 rounded-xl p-2 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] font-bold text-slate-500">الإجمالي</div>
              <div className="font-mono font-black">{invoice.total.toFixed(2)}</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-950 rounded-xl p-2 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] font-bold text-slate-500">المدفوع</div>
              <div className="font-mono font-black text-emerald-600 dark:text-emerald-400">{paidSoFar.toFixed(2)}</div>
            </div>
            <div className="bg-rose-500/10 rounded-xl p-2 border border-rose-500/30">
              <div className="text-[11px] font-bold text-rose-600 dark:text-rose-400">المتبقي</div>
              <div className="font-mono font-black text-rose-600 dark:text-rose-400">{due.toFixed(2)}</div>
            </div>
          </div>
          <div className="text-xs font-bold text-slate-500">العميل: {customerLabel(invoice.customerName)} — {invoice.date}</div>
          <input type="number" min="0" step="0.01" value={text} onChange={(e) => setText(e.target.value)} onFocus={(e) => e.target.select()} className={`${field} font-mono text-lg`} dir="ltr" autoFocus />
          <div className="flex gap-2">
            <button onClick={() => setText(due.toFixed(2))} className="flex-1 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold">سداد كامل</button>
            <button onClick={() => setText(round2(due / 2).toFixed(2))} className="flex-1 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold">النصف</button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setMethod('cash')} className={`flex-1 py-2 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border ${method === 'cash' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-300' : 'border-slate-300 dark:border-slate-700'}`}><Banknote className="w-4 h-4" /> كاش</button>
            <button onClick={() => setMethod('card')} className={`flex-1 py-2 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border ${method === 'card' ? 'bg-blue-500/20 border-blue-500 text-blue-700 dark:text-blue-300' : 'border-slate-300 dark:border-slate-700'}`}><CreditCard className="w-4 h-4" /> شبكة</button>
            <button onClick={() => setMethod('bank')} data-testid="pay-bank" className={`flex-1 py-2 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border ${method === 'bank' ? 'bg-violet-500/20 border-violet-500 text-violet-700 dark:text-violet-300' : 'border-slate-300 dark:border-slate-700'}`}><Landmark className="w-4 h-4" /> تحويل بنكي</button>
          </div>
          {error && <p className="text-xs font-bold text-amber-600 dark:text-amber-400">{error}</p>}
          {(invoice.payments?.length || 0) > 0 && (
            <div className="text-[11px] text-slate-500 font-bold space-y-0.5 max-h-24 overflow-y-auto">
              <div>الدفعات السابقة:</div>
              {invoice.payments!.map((p) => (
                <div key={p.id} className="flex justify-between font-mono"><span>{p.date}</span><span>{payMethodLabel(p.method)} {p.amount.toFixed(2)}</span></div>
              ))}
            </div>
          )}
        </div>
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex gap-2">
          <button onClick={onClose} className="px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-sm">إلغاء</button>
          <button disabled={!!error} onClick={() => onConfirm(round2(amount), method)} className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black disabled:opacity-40">تأكيد السداد</button>
        </div>
      </div>
    </div>
  );
}
