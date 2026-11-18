import React, { useEffect, useMemo, useRef, useState } from 'react';

/** تقسيم قائمة كبيرة إلى صفحات — resetKey يعيد للصفحة الأولى عند تغيّر البحث/الفلترة */
export function usePagedList<T>(items: T[], initialPageSize = 50, resetKey = '') {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  useEffect(() => { setPage(1); }, [resetKey, pageSize]);
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages);
  const visible = useMemo(() => items.slice((current - 1) * pageSize, current * pageSize), [items, current, pageSize]);
  return { visible, page: current, pages, total, pageSize, setPage, setPageSize, from: total ? (current - 1) * pageSize + 1 : 0, to: Math.min(total, current * pageSize) };
}

type Paged = ReturnType<typeof usePagedList<unknown>>;

/** أرقام الصفحات المعروضة: 1 … 4 5 [6] 7 8 … 40 */
function pageWindow(page: number, pages: number): (number | '…')[] {
  const out: (number | '…')[] = [];
  const add = (n: number | '…') => out.push(n);
  const start = Math.max(2, page - 2), end = Math.min(pages - 1, page + 2);
  add(1);
  if (start > 2) add('…');
  for (let i = start; i <= end; i++) add(i);
  if (end < pages - 1) add('…');
  if (pages > 1) add(pages);
  return out;
}

export function Pagination({ pager, sizes = [25, 50, 100, 200], unit = 'صنف' }: { pager: Pick<Paged, 'page' | 'pages' | 'total' | 'pageSize' | 'setPage' | 'setPageSize' | 'from' | 'to'>; sizes?: number[]; unit?: string }) {
  const { page, pages, total, pageSize, setPageSize, from, to } = pager;
  const ref = useRef<HTMLDivElement>(null);
  // الانتقال لصفحة ثم إظهار بداية الجدول
  const setPage = (n: number) => { pager.setPage(n); ref.current?.parentElement?.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
  const btn = 'min-w-[2.25rem] h-9 px-2 rounded-lg text-sm font-bold border transition disabled:opacity-40 disabled:cursor-not-allowed';
  const idle = 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer';
  return (
    <div ref={ref} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 dark:border-slate-800" dir="rtl" data-testid="pagination">
      <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
        عرض <span className="font-mono">{from.toLocaleString('en')}</span>–<span className="font-mono">{to.toLocaleString('en')}</span> من <span className="font-mono">{total.toLocaleString('en')}</span> {unit}
      </div>
      <div className="flex items-center gap-1">
        <button className={`${btn} ${idle}`} disabled={page <= 1} onClick={() => setPage(1)} title="الصفحة الأولى">«</button>
        <button className={`${btn} ${idle}`} disabled={page <= 1} onClick={() => setPage(page - 1)} title="السابقة">‹</button>
        {pageWindow(page, pages).map((n, i) => n === '…'
          ? <span key={`e${i}`} className="px-1 text-slate-400">…</span>
          : <button key={n} onClick={() => setPage(n)} className={`${btn} font-mono ${n === page ? 'bg-teal-700 border-teal-700 text-white' : idle}`} aria-current={n === page ? 'page' : undefined}>{n}</button>)}
        <button className={`${btn} ${idle}`} disabled={page >= pages} onClick={() => setPage(page + 1)} title="التالية">›</button>
        <button className={`${btn} ${idle}`} disabled={page >= pages} onClick={() => setPage(pages)} title="الصفحة الأخيرة">»</button>
      </div>
      <label className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
        لكل صفحة
        <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-slate-700 dark:text-slate-200">
          {sizes.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
    </div>
  );
}
