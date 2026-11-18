import { useEffect, useState } from 'react';
import { Download, RefreshCw, CheckCircle2, AlertTriangle, DatabaseZap } from 'lucide-react';
import { flushNow, onSaveError, type UpdateState } from '../storage/persistence';

/**
 * شريط صغير أسفل الشاشة: حالة التحديث + تنبيه فشل حفظ البيانات.
 * لا يظهر شيء في الوضع العادي، ولا يظهر عند الطباعة.
 */
export default function UpdateBanner() {
  const [state, setState] = useState<UpdateState | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => onSaveError(setSaveFailed), []);

  useEffect(() => {
    const api = window.ledger;
    if (!api) return;
    api.update.getState().then(setState).catch(() => {});
    return api.update.onStatus((s) => {
      setHidden(false);
      setState(s);
    });
  }, []);

  // رسائل "أنت على أحدث إصدار" تختفي وحدها
  useEffect(() => {
    if (state?.status === 'not-available') {
      const t = window.setTimeout(() => setHidden(true), 4000);
      return () => window.clearTimeout(t);
    }
  }, [state]);

  const install = async () => {
    setInstalling(true);
    try {
      await flushNow(); // نضمن حفظ كل البيانات قبل إغلاق التطبيق
      await window.ledger?.update.install();
    } finally {
      setInstalling(false);
    }
  };

  const showUpdate =
    !!state &&
    !hidden &&
    (['available', 'downloading', 'downloaded'].includes(state.status) ||
      (state.manual && ['checking', 'not-available', 'error'].includes(state.status)));

  if (!saveFailed && !showUpdate) return null;

  return (
    <div dir="rtl" className="print:hidden fixed bottom-4 left-4 z-[9999] flex flex-col gap-2 max-w-sm">
      {saveFailed && (
        <div className="flex items-start gap-3 rounded-2xl bg-red-600 text-white px-4 py-3 shadow-2xl">
          <DatabaseZap className="w-5 h-5 mt-0.5 shrink-0" />
          <div className="text-sm font-bold leading-6">
            تعذر حفظ البيانات في قاعدة البيانات. لا تغلق البرنامج، وسنعيد المحاولة تلقائياً.
          </div>
        </div>
      )}

      {showUpdate && state && (
        <div className="flex items-center gap-3 rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 px-4 py-3 shadow-2xl">
          {state.status === 'checking' && <RefreshCw className="w-5 h-5 animate-spin text-sky-600 dark:text-sky-400" />}
          {(state.status === 'available' || state.status === 'downloading') && <Download className="w-5 h-5 text-sky-600 dark:text-sky-400" />}
          {state.status === 'downloaded' && <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
          {state.status === 'not-available' && <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
          {state.status === 'error' && <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />}

          <div className="text-sm leading-6 flex-1">
            {state.status === 'checking' && 'جاري التحقق من وجود تحديث...'}
            {state.status === 'available' && `يوجد إصدار جديد ${state.newVersion ?? ''} — جاري التنزيل...`}
            {state.status === 'downloading' && `جاري تنزيل التحديث... ${state.percent ?? 0}%`}
            {state.status === 'downloaded' && `التحديث ${state.newVersion ?? ''} جاهز للتثبيت`}
            {state.status === 'not-available' && `أنت على أحدث إصدار (${state.version})`}
            {state.status === 'error' && (state.error || 'تعذر التحقق من التحديثات')}
          </div>

          {state.status === 'downloaded' && (
            <button
              onClick={install}
              disabled={installing}
              className="shrink-0 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-black text-xs px-3 py-2"
            >
              {installing ? 'جاري الحفظ...' : 'إعادة التشغيل والتثبيت'}
            </button>
          )}
          {(state.status === 'error' || state.status === 'not-available') && (
            <button onClick={() => setHidden(true)} className="shrink-0 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">
              إغلاق
            </button>
          )}
        </div>
      )}
    </div>
  );
}
