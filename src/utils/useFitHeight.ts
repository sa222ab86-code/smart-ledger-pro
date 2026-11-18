import { useLayoutEffect, useRef, useState } from 'react';

/**
 * ارتفاع إطار الجدول = المساحة المتبقية من الشاشة تحت بدايته (مع مكان للترقيم تحته).
 * بهذا يبقى شريط التمرير الأفقي ظاهراً أسفل الشاشة دون تمرير الصفحة لآخر الجدول.
 */
export function useFitHeight<T extends HTMLElement>(reserve = 70, min = 260, deps: unknown[] = []) {
  const ref = useRef<T>(null);
  const [h, setH] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const calc = () => {
      const el = ref.current;
      if (!el) return;
      let sp: HTMLElement | null = el.parentElement;
      while (sp && !/(auto|scroll)/.test(getComputedStyle(sp).overflowY)) sp = sp.parentElement;
      const spTop = sp ? sp.getBoundingClientRect().top : 0;
      const top = el.getBoundingClientRect().top - spTop + (sp ? sp.scrollTop : 0) + spTop;
      setH(Math.max(min, Math.round(window.innerHeight * 0.6), Math.floor(window.innerHeight - top - reserve)));
    };
    calc();
    const t = setTimeout(calc, 150);
    window.addEventListener('resize', calc);
    return () => { clearTimeout(t); window.removeEventListener('resize', calc); };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return { ref, style: h ? { maxHeight: `${h}px` } : { maxHeight: 'calc(100vh - 9rem)' } };
}
