import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * حاوية بتمرير أفقي بمقبض منفصل متزامن مع المحتوى (ويُخفى شريط المحتوى الأصلي).
 * stickyBottom: المقبض مثبّت أسفل الشاشة ويبقى ظاهراً أثناء التمرير العمودي للجدول الطويل.
 */
export default function TopScrollX({ children, className = '', stickyBottom = false }: { children: ReactNode; className?: string; stickyBottom?: boolean }) {
  const top = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [needed, setNeeded] = useState(false);
  const syncing = useRef(false);

  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const measure = () => { setWidth(el.scrollWidth); setNeeded(el.scrollWidth > el.clientWidth + 1); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);

  const link = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (!from || !to) return;
    if (syncing.current) { syncing.current = false; return; }
    syncing.current = true;
    to.scrollLeft = from.scrollLeft;
  };

  const bar = (
    <div
      ref={top}
      onScroll={() => link(top.current, body.current)}
      className={`overflow-x-auto overflow-y-hidden ${stickyBottom ? 'sticky-hbar' : ''}`}
      // الارتفاع تلقائي = سُمك شريط التمرير (يختلف في وضع اللمس والشاشات اللمسية)
      style={needed ? { minHeight: stickyBottom ? 16 : 12 } : { height: 0 }}
      data-testid="top-scroll"
      aria-hidden
    >
      <div style={{ width, height: 1 }} />
    </div>
  );

  return (
    <div className={className}>
      {!stickyBottom && bar}
      <div ref={body} onScroll={() => link(body.current, top.current)} className="overflow-x-auto top-scroll-body">
        {children}
      </div>
      {stickyBottom && bar}
    </div>
  );
}
