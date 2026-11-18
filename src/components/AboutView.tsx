import { useEffect, useState } from 'react';
import { Info, RefreshCw, Download, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { flushNow, type UpdateState } from '../storage/persistence';

const STATUS_TEXT: Record<UpdateState['status'], string> = {
  idle: 'لا يوجد تحديث قيد التنزيل',
  checking: 'جاري البحث عن تحديث...',
  available: 'يوجد تحديث جديد — جاري التجهيز',
  downloading: 'جاري تنزيل التحديث',
  downloaded: 'التحديث جاهز للتثبيت',
  'not-available': 'أنت على أحدث إصدار',
  error: 'تعذّر البحث عن تحديث',
};

export default function AboutView({ iconSrc, canManage = true }: { iconSrc: string; canManage?: boolean }) {
  const api = typeof window !== 'undefined' ? window.ledger : undefined;
  const [state, setState] = useState<UpdateState | null>(null);
  const [version, setVersion] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!api) return;
    api.app.getVersion().then(setVersion).catch(() => {});
    api.update.getState().then(setState).catch(() => {});
    return api.update.onStatus(setState);
  }, [api]);

  const auto = state?.autoUpdate !== false;

  const toggleAuto = async () => {
    if (!api?.update.setAuto || busy) return;
    setBusy(true);
    try { setState(await api.update.setAuto(!auto)); } finally { setBusy(false); }
  };

  const install = async () => {
    if (!api) return;
    await flushNow();
    await api.update.install();
  };

  const st = state?.status || 'idle';

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5 text-right" dir="rtl" data-testid="about-page">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-6 flex items-center gap-5">
        <img src={iconSrc} alt="" className="w-20 h-20 rounded-2xl object-contain" />
        <div className="space-y-1">
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">الدفتر الذكي <span className="text-xs align-middle bg-amber-400 text-black font-black rounded-md px-1.5 py-0.5">PRO</span></h2>
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">نقاط البيع والمخزون والفوترة الإلكترونية والمحاسبة الكاملة وربط الفروع</p>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            رقم النسخة: <span className="font-mono text-cyan-700 dark:text-cyan-300" data-testid="app-version">{version || (api ? '...' : 'نسخة المتصفح')}</span>
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-6 space-y-4">
        <h3 className="font-black text-lg flex items-center gap-2 text-slate-800 dark:text-white"><Info className="w-5 h-5 text-cyan-500" /> التحديثات</h3>

        <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700">
          <div>
            <p className="font-bold text-slate-800 dark:text-white">التحديث التلقائي</p>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {auto ? 'مفتوح: يبحث البرنامج عن التحديثات وينزّلها ويثبّتها عند الإغلاق.' : 'مقفل: لن يُحدَّث البرنامج إلا إذا بحثت يدوياً وضغطت «تثبيت».'}
            </p>
          </div>
          <button
            onClick={toggleAuto}
            disabled={!api?.update.setAuto || busy || !canManage}
            data-testid="auto-update-toggle"
            aria-pressed={auto}
            title={auto ? 'إقفال التحديث التلقائي' : 'فتح التحديث التلقائي'}
            className={`w-14 h-7 rounded-full relative shrink-0 transition disabled:opacity-40 ${auto ? 'bg-emerald-500' : 'bg-slate-400'}`}
          >
            <span className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${auto ? 'right-1' : 'right-8'}`} />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
            {st === 'checking' || st === 'downloading' || st === 'available' ? <Loader2 className="w-4 h-4 animate-spin text-cyan-500" />
              : st === 'error' ? <AlertTriangle className="w-4 h-4 text-rose-500" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
            <span>{STATUS_TEXT[st]}{st === 'downloading' && state?.percent != null ? ` (${state.percent}%)` : ''}{state?.newVersion ? ` — الإصدار ${state.newVersion}` : ''}</span>
          </div>
          <div className="flex gap-2">
            <button disabled={!api || st === 'checking' || st === 'downloading'} onClick={() => api?.update.check()} className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-sm flex items-center gap-2 disabled:opacity-50">
              <RefreshCw className="w-4 h-4" /> البحث عن تحديث
            </button>
            {st === 'downloaded' && (
              <button onClick={install} className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center gap-2">
                <Download className="w-4 h-4" /> تثبيت الآن
              </button>
            )}
          </div>
        </div>
        {st === 'error' && state?.error && <p className="text-xs text-rose-600 font-semibold break-words">{state.error}</p>}
      </div>
    </div>
  );
}
