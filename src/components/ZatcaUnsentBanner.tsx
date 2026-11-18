import { useEffect, useState } from 'react';
import { AlertTriangle, Send, Loader2 } from 'lucide-react';
import type { ZatcaStatus } from '../storage/persistence';

const PENDING_GRACE_MS = 5 * 60 * 1000; // الفاتورة تُرسل عادة خلال ثوانٍ؛ ننبّه إن بقيت معلّقة أكثر من 5 دقائق

function ageText(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} دقيقة`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h} ساعة`;
  return `${Math.floor(h / 24)} يوم`;
}

/**
 * شريط أحمر أعلى البرنامج عند وجود فواتير لم تُرسل لمنصة فاتورة:
 *  - مرفوضة أو فشل إرسالها، أو
 *  - بانتظار الإرسال منذ أكثر من 5 دقائق (انقطاع إنترنت مثلاً)
 * المهلة النظامية للإبلاغ عن الفاتورة المبسطة 24 ساعة.
 */
export default function ZatcaUnsentBanner({ onOpen }: { onOpen: () => void }) {
  const api = typeof window !== 'undefined' ? window.ledger?.zatca : undefined;
  const [st, setSt] = useState<ZatcaStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!api) return;
    let alive = true;
    const load = () => api.status().then((s) => { if (alive) setSt(s); }).catch(() => {});
    void load();
    const t = setInterval(() => { void load(); tick((x) => x + 1); }, 60000);
    const off1 = api.onStatus(() => void load());
    const off2 = api.onQueue ? api.onQueue(() => void load()) : () => {};
    return () => { alive = false; clearInterval(t); off1(); off2(); };
  }, [api]);

  if (!st?.active || !st.unsent || st.unsent.c === 0) return null;
  const failed = (st.counts.rejected || 0) + (st.counts.error || 0);
  const oldest = st.unsent.oldest;
  const stale = !!oldest && Date.now() - new Date(oldest).getTime() > PENDING_GRACE_MS;
  if (!failed && !stale) return null;
  const nearDeadline = !!oldest && Date.now() - new Date(oldest).getTime() > 20 * 3600 * 1000;

  const sendNow = async () => {
    if (!api || busy) return;
    setBusy(true);
    try { setSt(await api.runQueue()); } finally { setBusy(false); }
  };

  return (
    <div className="no-print bg-rose-600 text-white px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold shadow-md z-40" dir="rtl" role="alert" data-testid="zatca-unsent-banner">
      <AlertTriangle className="w-5 h-5 shrink-0 animate-pulse" />
      <span>
        يوجد <span className="font-mono">{st.unsent.c}</span> فاتورة لم تُرسل لمنصة فاتورة
        {oldest && <> — أقدمها منذ {ageText(oldest)}</>}
        {failed > 0 && <> ({failed} مرفوضة أو فشل إرسالها)</>}
        {nearDeadline && <span className="mr-1 underline">— اقتربت مهلة الإبلاغ (24 ساعة)</span>}
      </span>
      {st.queue.lastError && <span className="text-rose-100 text-xs font-semibold">{st.queue.lastError}</span>}
      <div className="flex gap-2 mr-auto">
        <button onClick={sendNow} disabled={busy} className="px-3 py-1 rounded-lg bg-white text-rose-700 font-black text-xs flex items-center gap-1.5 disabled:opacity-60">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} إرسال الآن
        </button>
        <button onClick={onOpen} className="px-3 py-1 rounded-lg bg-rose-700 hover:bg-rose-800 border border-rose-400 font-black text-xs">التفاصيل</button>
      </div>
    </div>
  );
}
