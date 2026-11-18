import { useEffect, useState } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import { flushNow } from '../storage/persistence';

/**
 * الجهاز الفرعي:
 *  - تنبيه أحمر عند انقطاع الاتصال بالجهاز الرئيسي
 *  - بعد إعادة تشغيل الرئيسي: البيع والتحديث اللحظي يستمران دون إعادة تحميل الشاشة،
 *    ويظهر زر «تحديث البيانات» اختياري (تحميل كامل) يختفي بعد الضغط
 */
export default function NetworkBanner() {
  const api = typeof window !== 'undefined' ? window.ledger?.network : undefined;
  const [down, setDown] = useState<{ host: string; error: string } | null>(null);
  const [resynced, setResynced] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!api) return;
    let alive = true;
    void api.info().then((i) => { if (alive && i.role === 'client' && i.connection && !i.connection.connected && i.connection.error) setDown({ host: i.host, error: i.connection.error }); }).catch(() => {});
    const off = api.onStatus((s) => setDown(s.connected ? null : { host: s.host, error: s.error }));
    const offR = api.onResync?.(() => setResynced(true));
    return () => { alive = false; off(); offR?.(); };
  }, [api]);

  if (down) return (
    <div dir="rtl" className="print:hidden fixed top-2 left-1/2 -translate-x-1/2 z-[9997] flex items-center gap-2 rounded-xl bg-rose-600 text-white text-sm font-bold px-4 py-2 shadow-2xl max-w-xl">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>{down.error || `انقطع الاتصال بالجهاز الرئيسي (${down.host})`} — التغييرات تُحفظ تلقائياً عند عودة الاتصال، لا تغلق البرنامج.</span>
    </div>
  );
  if (!resynced) return null;
  return (
    <div dir="rtl" data-testid="net-resync" className="print:hidden fixed top-2 left-1/2 -translate-x-1/2 z-[9997] flex items-center gap-3 rounded-xl bg-amber-400 text-slate-950 text-sm font-bold px-4 py-2 shadow-2xl max-w-xl">
      <span>عاد الاتصال بالجهاز الرئيسي — البيع مستمر.</span>
      <button type="button" disabled={busy} data-testid="net-resync-btn"
        onClick={() => { setBusy(true); void flushNow().catch(() => {}).finally(() => window.location.reload()); }}
        className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 text-white text-xs font-black cursor-pointer disabled:opacity-60">
        <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /> تحديث البيانات
      </button>
      <button type="button" onClick={() => setResynced(false)} title="إخفاء" className="text-slate-800 hover:text-black font-black px-1 cursor-pointer">×</button>
    </div>
  );
}
