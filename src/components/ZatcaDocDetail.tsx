import { useEffect, useState } from 'react';
import { X, AlertTriangle, AlertCircle, Info, CheckCircle2, RotateCcw, FileCode, Loader2 } from 'lucide-react';
import type { ZatcaDocDetail as Detail, ZatcaMsg } from '../storage/persistence';
import { getLanguage } from '../i18n';

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'بانتظار الإرسال', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
  reported: { label: 'مُبلّغة ✓', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' },
  cleared: { label: 'معتمدة ✓', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' },
  warning: { label: 'مقبولة مع تحذيرات', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
  rejected: { label: 'مرفوضة', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200' },
  error: { label: 'خطأ في الإرسال', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200' },
};


const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(getLanguage() === 'en' ? 'en-GB' : 'ar-SA-u-ca-gregory-nu-latn') : '—');

function MsgList({ title, items, tone }: { title: string; items: ZatcaMsg[]; tone: 'error' | 'warning' | 'info' }) {
  if (!items.length) return null;
  const c = tone === 'error' ? 'border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200'
    : tone === 'warning' ? 'border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200'
    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300';
  const Icon = tone === 'error' ? AlertCircle : tone === 'warning' ? AlertTriangle : Info;
  return (
    <div className={`rounded-xl border p-3 space-y-2 ${c}`} data-testid={`zatca-msgs-${tone}`}>
      <div className="font-black text-sm flex items-center gap-1.5"><Icon className="w-4 h-4" /> {title} ({items.length})</div>
      {items.map((m, i) => (
        <div key={i} className="text-xs leading-relaxed">
          {m.code && <span className="font-mono font-black ml-1" dir="ltr">[{m.code}]</span>}
          <span className="font-semibold break-words">{m.message}</span>
          {m.category && <span className="block text-[10px] opacity-70 font-mono" dir="ltr">{m.category}</span>}
        </div>
      ))}
    </div>
  );
}

/** نافذة «رد الهيئة» لفاتورة: الحالة والأخطاء والتحذيرات والملاحظات والرد الكامل */
export default function ZatcaDocDetail({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const api = typeof window !== 'undefined' ? window.ledger?.zatca : undefined;
  const [d, setD] = useState<Detail | null | undefined>(undefined);
  const [showRaw, setShowRaw] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => { api?.docDetail?.(invoiceId).then(setD).catch(() => setD(null)); };
  useEffect(() => {
    load();
    const off = api?.onStatus((s) => { if (s.invoiceId === invoiceId) load(); });
    return () => { off?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  const retry = async () => {
    if (!api || busy) return;
    setBusy(true);
    try { await api.retryDoc(invoiceId); setTimeout(load, 1500); } finally { setBusy(false); }
  };

  const st = d ? STATUS[d.status] || { label: d.status, cls: '' } : null;
  const noMsgs = d && !d.errors.length && !d.warnings.length && !d.infos.length;

  return (
    <div className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} data-testid="zatca-detail">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col text-right overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-black text-lg text-slate-900 dark:text-white">رد هيئة الزكاة على الفاتورة {d?.number || ''}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-rose-500"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 overflow-y-auto space-y-3">
          {d === undefined && <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> جاري التحميل...</div>}
          {d === null && <p className="text-sm text-slate-500">لا توجد بيانات إرسال لهذه الفاتورة (صدرت قبل الربط مع منصة فاتورة أو على جهاز آخر).</p>}
          {d && st && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-sm font-black ${st.cls}`}>{st.label}</span>
                <span className="text-xs text-slate-500 font-semibold">{d.kind === 'standard' ? 'فاتورة ضريبية (اعتماد)' : 'فاتورة مبسطة (إبلاغ)'} — {d.typeCode === 381 ? 'إشعار دائن' : d.typeCode === 383 ? 'إشعار مدين' : 'فاتورة'}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800"><div className="text-slate-500">عدّاد الفاتورة ICV</div><div className="font-mono font-black">{d.icv}</div></div>
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800"><div className="text-slate-500">محاولات الإرسال</div><div className="font-mono font-black">{d.attempts}</div></div>
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800"><div className="text-slate-500">الختم</div><div className="font-mono font-bold">{fmt(d.createdAt)}</div></div>
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800"><div className="text-slate-500">آخر إرسال</div><div className="font-mono font-bold">{fmt(d.submittedAt)}</div></div>
              </div>

              <MsgList title="أخطاء — سبب الرفض" items={d.errors} tone="error" />
              <MsgList title="تحذيرات — الفاتورة مقبولة ويُستحسن التصحيح في الفواتير القادمة" items={d.warnings} tone="warning" />
              <MsgList title="ملاحظات من الهيئة" items={d.infos} tone="info" />

              {noMsgs && d.lastError && (
                <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 p-3 text-sm text-rose-800 dark:text-rose-200 font-semibold break-words">{d.lastError}</div>
              )}
              {noMsgs && !d.lastError && (d.status === 'reported' || d.status === 'cleared') && (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm text-emerald-800 dark:text-emerald-200 font-bold flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> قبلت الهيئة الفاتورة دون أي ملاحظات.</div>
              )}
              {noMsgs && d.status === 'pending' && (
                <p className="text-sm text-slate-500">لم تُرسل بعد — تُرسل تلقائياً عند توفر الاتصال.</p>
              )}

              {d.response != null && (
                <div>
                  <button onClick={() => setShowRaw(!showRaw)} className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline">{showRaw ? 'إخفاء' : 'عرض'} الرد الكامل من الهيئة (JSON)</button>
                  {showRaw && <pre className="mt-2 p-3 rounded-lg bg-slate-950 text-slate-100 text-[11px] overflow-auto max-h-64" dir="ltr">{JSON.stringify(d.response, null, 2)}</pre>}
                </div>
              )}
            </>
          )}
        </div>
        {d && (
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-2 justify-end">
            {(d.status === 'rejected' || d.status === 'error') && (
              <button onClick={retry} disabled={busy} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold flex items-center gap-1.5 disabled:opacity-60"><RotateCcw className="w-4 h-4" /> إعادة الإرسال</button>
            )}
            <button onClick={() => api?.exportXml(invoiceId)} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-bold flex items-center gap-1.5"><FileCode className="w-4 h-4" /> تصدير XML</button>
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-bold">إغلاق</button>
          </div>
        )}
      </div>
    </div>
  );
}
