import { useMemo, useState } from 'react';
import { X, RotateCcw, Banknote, CreditCard, PackageCheck } from 'lucide-react';
import type { Invoice } from '../types';
import { customerLabel, invoiceRemaining } from '../utils/invoiceMath';
import { computeReturn, returnedQtyByLine } from '../utils/returns';

export interface SalesReturnRequest {
  selection: Record<number, number>;
  refundMethod: 'cash' | 'card';
  restock: boolean;
  note?: string;
}

/** نافذة مرتجع مبيعات: اختيار الكميات المرتجعة من فاتورة سابقة */
export default function SalesReturnModal({
  invoice, allInvoices, onConfirm, onClose,
}: {
  invoice: Invoice;
  allInvoices: Invoice[];
  onConfirm: (req: SalesReturnRequest) => void;
  onClose: () => void;
}) {
  const returned = useMemo(() => returnedQtyByLine(allInvoices, invoice.id), [allInvoices, invoice.id]);
  const maxOf = (i: number) => Math.max(0, Math.round((invoice.items[i].qty - (returned[i] || 0)) * 1000) / 1000);
  const [sel, setSel] = useState<Record<number, number>>({});
  const [refundMethod, setRefundMethod] = useState<'cash' | 'card'>(invoice.paymentMethod === 'card' ? 'card' : 'cash');
  const [restock, setRestock] = useState(true);
  const [note, setNote] = useState('');

  const calc = useMemo(() => computeReturn(invoice, allInvoices, sel), [invoice, allInvoices, sel]);
  const setQty = (i: number, v: number) => setSel((s) => ({ ...s, [i]: Math.max(0, Math.min(maxOf(i), v)) }));
  const all = () => setSel(Object.fromEntries(invoice.items.map((_, i) => [i, maxOf(i)])));
  const due = invoiceRemaining(invoice);

  return (
    <div className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 w-full max-w-2xl max-h-[94vh] rounded-2xl shadow-2xl overflow-hidden text-right flex flex-col">
        <div className="bg-slate-50 dark:bg-slate-950 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <span className="font-black text-lg text-rose-600 dark:text-rose-400 flex items-center gap-2"><RotateCcw className="w-5 h-5" /> مرتجع مبيعات — {invoice.invoiceNumber || invoice.number}</span>
          <button onClick={onClose} className="text-slate-500 dark:text-slate-400 hover:text-rose-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          <div className="flex justify-between text-xs font-bold text-slate-500">
            <span>العميل: {customerLabel(invoice.customerName)}</span>
            <span>{invoice.date}</span>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-950 text-[11px] text-slate-500">
                <tr><th className="p-2 text-right">الصنف</th><th className="p-2">المباع</th><th className="p-2">سبق إرجاعه</th><th className="p-2">سعر الوحدة</th><th className="p-2">كمية المرتجع</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {invoice.items.map((it, i) => {
                  const max = maxOf(i);
                  return (
                    <tr key={i} className={max <= 0 ? 'opacity-40' : ''}>
                      <td className="p-2 font-bold">{it.name}</td>
                      <td className="p-2 text-center font-mono">{it.qty}</td>
                      <td className="p-2 text-center font-mono">{returned[i] || 0}</td>
                      <td className="p-2 text-center font-mono">{it.price.toFixed(2)}</td>
                      <td className="p-2 text-center">
                        <input
                          type="number" min={0} max={max} step="1" disabled={max <= 0}
                          value={sel[i] ?? 0}
                          onChange={(e) => setQty(i, Number(e.target.value))}
                          onFocus={(e) => e.target.select()}
                          className="w-20 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-center font-mono"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button onClick={all} className="text-xs font-black text-rose-600 dark:text-rose-400 hover:underline">إرجاع كل الكميات المتبقية</button>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setRefundMethod('cash')} className={`py-2 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border ${refundMethod === 'cash' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-300' : 'border-slate-300 dark:border-slate-700'}`}><Banknote className="w-4 h-4" /> ردّ كاش</button>
            <button onClick={() => setRefundMethod('card')} className={`py-2 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border ${refundMethod === 'card' ? 'bg-blue-500/20 border-blue-500 text-blue-700 dark:text-blue-300' : 'border-slate-300 dark:border-slate-700'}`}><CreditCard className="w-4 h-4" /> ردّ شبكة</button>
          </div>
          <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
            <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
            <PackageCheck className="w-4 h-4 text-emerald-600" /> إعادة الكميات إلى المخزون (ألغِ التحديد إن كانت البضاعة تالفة)
          </label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="سبب الإرجاع (اختياري)" className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm" />

          <div className="bg-slate-50 dark:bg-slate-950 rounded-xl p-3 border border-slate-200 dark:border-slate-800 space-y-1 text-sm">
            <div className="flex justify-between"><span>قبل الضريبة{calc.rawNet - calc.net > 0.004 ? ' (بعد خصم الفاتورة)' : ''}</span><span className="font-mono">{calc.net.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>الضريبة</span><span className="font-mono">{calc.tax.toFixed(2)}</span></div>
            <div className="flex justify-between font-black text-base text-rose-600 dark:text-rose-400"><span>إجمالي المرتجع</span><span className="font-mono">{calc.total.toFixed(2)}</span></div>
            {calc.debtOffset > 0 && (
              <div className="flex justify-between text-amber-700 dark:text-amber-300 font-bold"><span>يُخصم من المتبقي على العميل ({due.toFixed(2)})</span><span className="font-mono">{calc.debtOffset.toFixed(2)}</span></div>
            )}
            <div className="flex justify-between font-black"><span>المبلغ المردود للعميل ({refundMethod === 'card' ? 'شبكة' : 'كاش'})</span><span className="font-mono">{calc.refund.toFixed(2)}</span></div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex gap-2">
          <button onClick={onClose} className="px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-sm">إلغاء</button>
          <button
            disabled={calc.lines.length === 0}
            onClick={() => onConfirm({ selection: sel, refundMethod, restock, note: note.trim() || undefined })}
            className="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black disabled:opacity-40"
          >
            تأكيد المرتجع
          </button>
        </div>
      </div>
    </div>
  );
}
