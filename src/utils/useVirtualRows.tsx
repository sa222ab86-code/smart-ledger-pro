import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

/**
 * تمرير افتراضي (Virtual Scrolling) لجداول بآلاف الصفوف داخل حاوية بارتفاع ثابت:
 * يُرسم فقط ما يظهر في الحاوية (+ هامش صغير)، وتُعوَّض بقية الصفوف بمسافة فارغة أعلى وأسفل
 * فيبقى شريط التمرير بحجمه الحقيقي والبرنامج سريعاً مهما كثرت الفواتير.
 * ارتفاع كل صف يُقاس بعد رسمه (الصفوف ليست متساوية: شارات الهيئة/المرتجع…).
 *
 * الاستخدام: ضع scrollRef على الحاوية القابلة للتمرير، و data-vkey={key} على كل صف مرسوم.
 */
export function useVirtualRows<T>(
  items: T[],
  keyOf: (t: T) => string,
  { estimate = 56, overscan = 8, resetKey }: { estimate?: number; overscan?: number; resetKey?: unknown } = {},
) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [view, setView] = useState({ top: 0, height: 900 });
  const heights = useRef(new Map<string, number>());
  const [ver, setVer] = useState(0);

  useLayoutEffect(() => {
    if (!el) return;
    let raf = 0;
    const read = () => setView((v) => (v.top === el.scrollTop && v.height === el.clientHeight ? v : { top: el.scrollTop, height: el.clientHeight }));
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; read(); }); };
    read();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(read) : null;
    ro?.observe(el);
    return () => { el.removeEventListener('scroll', onScroll); ro?.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [el]);

  // بحث/تصفية جديدة → أعلى القائمة
  useEffect(() => { if (el) el.scrollTop = 0; }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const offsets = useMemo(() => {
    const map = heights.current;
    let sum = 0, cnt = 0;
    map.forEach((h) => { sum += h; cnt++; });
    const est = cnt ? sum / cnt : estimate; // متوسط الصفوف المقاسة لتقدير غير المرسومة
    const o = new Float64Array(items.length + 1);
    for (let i = 0; i < items.length; i++) o[i + 1] = o[i] + (map.get(keyOf(items[i])) ?? est);
    return o;
  }, [items, ver, estimate]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = items.length;
  const firstAfter = (y: number) => { // أول صف ينتهي بعد y
    let lo = 0, hi = n;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (offsets[mid + 1] > y) hi = mid; else lo = mid + 1; }
    return lo;
  };
  const start = Math.max(0, firstAfter(view.top) - overscan);
  const end = Math.min(n, firstAfter(view.top + view.height) + 1 + overscan);

  // قياس الصفوف المرسومة بعد كل رسم؛ يتوقف تلقائياً حين تثبت المقاسات
  useLayoutEffect(() => {
    if (!el) return;
    let changed = false;
    el.querySelectorAll<HTMLElement>('[data-vkey]').forEach((r) => {
      const k = r.dataset.vkey as string;
      const h = r.getBoundingClientRect().height;
      if (h > 0 && Math.abs((heights.current.get(k) ?? -1) - h) > 0.5) { heights.current.set(k, h); changed = true; }
    });
    if (changed) setVer((v) => v + 1);
  });

  return {
    scrollRef: setEl,
    visible: items.slice(start, end),
    padTop: offsets[start],
    padBottom: offsets[n] - offsets[end],
    total: n,
  };
}

/** صف فارغ يعوّض الصفوف غير المرسومة داخل جدول */
export function VSpacer({ h, cols = 20 }: { h: number; cols?: number }) {
  return h > 0 ? <tr aria-hidden><td colSpan={cols} style={{ height: h, padding: 0, border: 0 }} /></tr> : null;
}

/**
 * عدد أعمدة شبكة البطاقات حسب عرض الشاشة (نفس نقاط Tailwind): [افتراضي, md, lg, xl]
 * لتقسيم البطاقات إلى صفوف يُرسم منها الظاهر فقط.
 */
export function useGridCols(spec: { base: number; md?: number; lg?: number; xl?: number }) {
  const calc = () => {
    const w = typeof window === 'undefined' ? 1280 : window.innerWidth;
    if (spec.xl && w >= 1280) return spec.xl;
    if (spec.lg && w >= 1024) return spec.lg;
    if (spec.md && w >= 768) return spec.md;
    return spec.base;
  };
  const [cols, setCols] = useState(calc);
  useEffect(() => {
    const on = () => setCols(calc());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return cols;
}

/** تقسيم قائمة إلى صفوف بعدد أعمدة ثابت */
export function chunkRows<T>(items: T[], cols: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += cols) out.push(items.slice(i, i + cols));
  return out;
}
