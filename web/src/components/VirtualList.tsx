import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A scrolling list that only renders the rows in view: the pool is 32,000 rows and
 * the whole-file roster list 3,000, so nothing is cut short and no cap hides the
 * back of a sort. Rows must share one fixed height.
 */
export function VirtualList<T>({ items, rowHeight, render, keyOf, overscan = 12, className = '', before, after }: {
  items: T[];
  rowHeight: number;
  render: (item: T, index: number) => ReactNode;
  keyOf: (item: T) => string | number;
  overscan?: number;
  className?: string;
  /** Rendered above the rows (errors, loading) and below them (footers). */
  before?: ReactNode;
  after?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // A hidden pane measures 0: keep the last real height so rows still render.
    const measure = () => { if (el.clientHeight > 0) setHeight(el.clientHeight); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // A filter that shrinks the list leaves the scroll past its end: start over from the top.
  useEffect(() => {
    const el = ref.current;
    if (el && el.scrollTop > Math.max(0, items.length * rowHeight - el.clientHeight)) { el.scrollTop = 0; setScrollTop(0); }
  }, [items.length, rowHeight]);
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(items.length, Math.ceil((scrollTop + height) / rowHeight) + overscan);
  return (
    <div ref={ref} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} className={`min-h-0 flex-1 overflow-auto ${className}`}>
      {before}
      <div style={{ height: items.length * rowHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${start * rowHeight}px)` }}>
          {items.slice(start, end).map((it, i) => <div key={keyOf(it)} style={{ height: rowHeight }}>{render(it, start + i)}</div>)}
        </div>
      </div>
      {after}
    </div>
  );
}
