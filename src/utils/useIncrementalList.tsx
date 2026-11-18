import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * عرض تدريجي للقوائم الكبيرة (آلاف الأصناف):
 * نرسم أول دفعة فقط، ونضيف دفعة جديدة كلما وصل المستخدم لأسفل القائمة.
 * رسم ١٨ ألف عنصر دفعة واحدة كان سبب التهنيج الأساسي.
 *
 * resetKey: عند تغيّره (بحث/تصفية جديدة) نعود لأول دفعة.
 */
export function useIncrementalList<T>(items: T[], pageSize = 120, resetKey?: unknown) {
  const [limit, setLimit] = useState(pageSize);

  useEffect(() => {
    setLimit(pageSize);
  }, [resetKey, pageSize]);

  const showMore = useCallback(() => setLimit((l) => l + pageSize), [pageSize]);
  const hasMore = limit < items.length;

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (el: HTMLElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!el || typeof IntersectionObserver === 'undefined') return;
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) showMore();
        },
        { rootMargin: '600px 0px' }
      );
      io.observe(el);
      observerRef.current = io;
    },
    // نعيد الربط بعد كل دفعة كي يُستدعى المراقب مجدداً إن بقي العنصر ظاهراً
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showMore, limit]
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return {
    visible: hasMore ? items.slice(0, limit) : items,
    hasMore,
    total: items.length,
    shown: Math.min(limit, items.length),
    showMore,
    sentinelRef,
  };
}

/** عنصر أسفل القائمة: يحمّل المزيد تلقائياً عند الظهور، مع زر احتياطي */
export function LoadMoreSentinel({
  hasMore,
  shown,
  total,
  onMore,
  sentinelRef,
  className = '',
}: {
  hasMore: boolean;
  shown: number;
  total: number;
  onMore: () => void;
  sentinelRef: (el: HTMLElement | null) => void;
  className?: string;
}) {
  if (!hasMore) return null;
  return (
    <div ref={sentinelRef} className={`w-full flex justify-center py-3 ${className}`}>
      <button
        type="button"
        onClick={onMore}
        className="px-4 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 cursor-pointer"
      >
        عرض المزيد ({shown.toLocaleString('en-US')} من {total.toLocaleString('en-US')})
      </button>
    </div>
  );
}
