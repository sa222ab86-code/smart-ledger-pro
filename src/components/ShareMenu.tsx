import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Share2 } from 'lucide-react';
import { SHARE_TARGETS, type ShareTarget } from '../utils/share';

const MENU_W = 230;

/**
 * زر «مشاركة» بقائمة: واتساب / البريد / المجلد.
 * القائمة تُرسم فوق الصفحة (portal بموضع ثابت): داخل شريط قابل للتمرير (معاينة الفاتورة) كانت تُقص
 * فيقع الضغط على خلفية المعاينة فتُغلق بدل المشاركة.
 */
export default function ShareMenu({ onShare, className = '', label = 'مشاركة', up = false }: { onShare: (t: ShareTarget) => void | Promise<void>; className?: string; label?: string; up?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const left = Math.max(8, Math.min(vw - MENU_W - 8, r.left));
    // للأعلى إن طُلب أو لم يتسع المكان أسفل الزر
    const goUp = up || (vh - r.bottom < 230 && r.top > vh - r.bottom);
    setPos(goUp ? { left, bottom: vh - r.top + 4 } : { left, top: r.bottom + 4 });
  };
  useLayoutEffect(() => { if (open) place(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const reposition = () => place();
    document.addEventListener('mousedown', close);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = async (t: ShareTarget) => {
    setOpen(false); setBusy(true);
    try { await onShare(t); } finally { setBusy(false); }
  };
  return (
    <div className="relative" ref={ref} data-testid="share-menu">
      <button ref={btnRef} type="button" disabled={busy} onClick={() => setOpen((v) => !v)} className={className || 'px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-60'}>
        <Share2 className="w-4 h-4" /><span>{busy ? 'جارٍ التجهيز...' : label}</span>
      </button>
      {open && pos && createPortal(
        <div ref={menuRef} dir="rtl" data-testid="share-menu-list" style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: MENU_W }}
          className="no-print z-[10050] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden text-right">
          {SHARE_TARGETS.map((t) => (
            <button key={t.id} type="button" onClick={(e) => { e.stopPropagation(); void pick(t.id); }} data-share={t.id} className="w-full px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2">
              <span>{t.icon}</span><span>{t.label}</span>
            </button>
          ))}
          <div className="px-4 py-2 text-[10.5px] font-semibold text-slate-500 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800">يُنسخ ملف PDF تلقائياً — اضغط Ctrl+V في التطبيق لإرفاقه</div>
        </div>,
        document.body,
      )}
    </div>
  );
}
