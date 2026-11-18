import { useEffect, useRef } from 'react';
import { ScanLine, Eye, Printer, RotateCcw, Wallet, X, FileText, CornerDownLeft } from 'lucide-react';
import type { Invoice } from '../types';
import { customerLabel, paymentLabel, isReturnDoc, isUnsettled } from '../utils/invoiceMath';
import SaudiRiyalSymbol from './SaudiRiyalSymbol';

/**
 * نافذة نتيجة مسح باركود فاتورة/مرتجع: ملخص المستند وأزرار الإجراءات المتاحة له مباشرة
 * (عرض، إعادة طباعة، مرتجع، سداد، فتح الفاتورة الأصلية أو مرتجعاتها).
 */
export default function ScannedInvoicePanel({
  invoice, related, canReturn, returnedAll, onClose, onView, onPrint, onReturn, onPay, onOpen,
}: {
  invoice: Invoice;
  /** الفاتورة الأصلية (للمرتجع) أو مرتجعات هذه الفاتورة */
  related: Invoice[];
  canReturn: boolean;
  /** كل الكميات أُرجعت سابقاً */
  returnedAll: boolean;
  onClose: () => void;
  onView: () => void;
  onPrint?: () => void;
  onReturn?: () => void;
  onPay?: () => void;
  onOpen: (inv: Invoice) => void;
}) {
  const isRet = isReturnDoc(invoice);
  const num = invoice.invoiceNumber || invoice.number;
  const unsettled = !isRet && isUnsettled(invoice);
  // التركيز على الإجراء الأساسي بعد انتهاء قراءة القارئ (Enter القارئ نفسه لا يضغطه)
  const primary = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialog.current?.focus();
    const t = setTimeout(() => primary.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [invoice.id]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const btn = 'flex-1 min-w-[8.5rem] py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition';
  return (
    <div className="fixed inset-0 z-[9990] bg-black/60 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} data-testid="scan-panel">
      <div ref={dialog} tabIndex={-1} role="dialog" className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150 outline-none" dir="rtl">
        <div className={`px-5 py-3 flex items-center justify-between ${isRet ? 'bg-rose-600' : 'bg-teal-700'} text-white`}>
          <div className="flex items-center gap-2 font-black"><ScanLine className="w-5 h-5" /> {isRet ? 'مرتجع مبيعات' : 'فاتورة'} — تم المسح</div>
          <button type="button" onClick={onClose} title="إغلاق (Esc)" className="p-1 rounded-lg hover:bg-white/15"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-mono font-black text-2xl text-slate-900 dark:text-white" dir="ltr" data-testid="scan-number">{num}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-bold mt-0.5 font-mono" dir="ltr">{invoice.date}</div>
              {isRet && invoice.originalInvoiceNumber && <div className="text-xs font-bold text-rose-600 mt-1">مرتجع عن {invoice.originalInvoiceNumber}</div>}
            </div>
            <div className="text-left">
              <div className={`font-mono font-black text-2xl ${isRet ? 'text-rose-600' : 'text-emerald-600'} inline-flex items-center gap-1`} dir="ltr">{Math.abs(invoice.total || 0).toFixed(2)} <SaudiRiyalSymbol className="w-5 h-5" /></div>
              <div className="text-xs font-bold text-slate-500">{paymentLabel(invoice)}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs font-bold">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800 px-3 py-2"><span className="text-slate-500">العميل: </span>{customerLabel(invoice.customerName)}</div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800 px-3 py-2"><span className="text-slate-500">الأصناف: </span>{invoice.items?.length || 0}</div>
          </div>
          {unsettled && <div className="rounded-xl bg-amber-50 dark:bg-amber-900/30 border border-amber-300/60 px-3 py-2 text-xs font-black text-amber-800 dark:text-amber-200">متبقٍ على العميل: {(invoice.remainingAmount || 0).toFixed(2)}</div>}
          {!isRet && returnedAll && <div className="rounded-xl bg-rose-50 dark:bg-rose-900/30 border border-rose-300/60 px-3 py-2 text-xs font-black text-rose-700 dark:text-rose-200">أُرجعت كل أصناف هذه الفاتورة سابقاً</div>}

          <div className="flex flex-wrap gap-2">
            {canReturn && onReturn && (
              <button ref={primary} type="button" data-testid="scan-return" onClick={onReturn} className={`${btn} bg-rose-600 hover:bg-rose-700 text-white`}><RotateCcw className="w-4 h-4" /> مرتجع</button>
            )}
            {unsettled && onPay && (
              <button type="button" data-testid="scan-pay" onClick={onPay} className={`${btn} bg-amber-500 hover:bg-amber-600 text-white`}><Wallet className="w-4 h-4" /> سداد</button>
            )}
            <button type="button" data-testid="scan-view" onClick={onView} className={`${btn} bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700`}><Eye className="w-4 h-4" /> عرض</button>
            {onPrint && (
              <button type="button" data-testid="scan-print" onClick={onPrint} className={`${btn} bg-slate-800 hover:bg-slate-900 text-white`}><Printer className="w-4 h-4" /> إعادة طباعة</button>
            )}
          </div>

          {related.length > 0 && (
            <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
              <div className="text-[11px] font-black text-slate-500 mb-1.5">{isRet ? 'الفاتورة الأصلية' : 'مرتجعات هذه الفاتورة'}</div>
              <div className="flex flex-wrap gap-1.5">
                {related.map((r) => (
                  <button key={r.id} type="button" onClick={() => onOpen(r)} className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1" dir="ltr">
                    {isRet ? <FileText className="w-3.5 h-3.5" /> : <CornerDownLeft className="w-3.5 h-3.5" />}{r.invoiceNumber || r.number}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
