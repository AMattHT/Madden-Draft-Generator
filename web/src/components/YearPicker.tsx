import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, ICONS } from './ui';

/**
 * Compact draft-year selector: a single button in the top bar that opens a
 * searchable, decade-grouped popover. Replaces the old full-height sidebar.
 */
export function YearPicker({
  years,
  selected,
  onSelect,
  cached,
}: {
  years: number[];
  selected: number | null;
  onSelect: (y: number) => void;
  cached: Set<number>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = query.trim();
  const filtered = useMemo(
    () => (q ? years.filter((y) => String(y).includes(q)) : years),
    [years, q]
  );

  const decades = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const y of filtered) {
      const d = Math.floor(y / 10) * 10;
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(y);
    }
    return Array.from(map.entries())
      .map(([d, ys]) => [d, ys.sort((a, b) => b - a)] as const)
      .sort((a, b) => b[0] - a[0]); // newest decade first
  }, [filtered]);

  // Newest matching year — the one Enter jumps to.
  const topMatch = filtered.length ? Math.max(...filtered) : undefined;

  // Close on outside click or Escape; focus the search box when opening.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    inputRef.current?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (y: number) => {
    onSelect(y);
    setOpen(false);
    setQuery('');
  };

  const selectedMerge = selected != null && selected >= 1960 && selected <= 1969;

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-lg border border-border-strong bg-surface-2 py-1.5 pl-3 pr-2.5 text-left transition-colors hover:bg-surface-3 focus:border-primary focus:outline-none"
      >
        <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Draft</span>
        <span className="flex items-baseline gap-1.5">
          <span className="text-lg font-bold tabular-nums leading-none text-neutral-100">
            {selected ?? '—'}
          </span>
          {selectedMerge && (
            <span className="rounded bg-info/20 px-1 text-[8px] font-bold leading-tight text-info">AFL</span>
          )}
        </span>
        <Icon
          path={ICONS.chevronDown}
          className={`h-4 w-4 text-neutral-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[22rem] overflow-hidden rounded-xl border border-border-strong bg-surface-1 shadow-[0_16px_48px_rgba(0,0,0,0.55)]">
          <div className="border-b border-border p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">
                Choose a draft year
              </span>
              <span className="text-[11px] tabular-nums text-neutral-500">
                {years.length ? `${years.length} classes` : 'loading…'}
              </span>
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500">
                <Icon path={ICONS.search} className="h-4 w-4" />
              </span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value.replace(/[^0-9]/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && topMatch != null) choose(topMatch);
                }}
                inputMode="numeric"
                placeholder="Jump to year…"
                className="w-full rounded-md border border-border bg-surface-0 py-1.5 pl-8 pr-7 text-sm tabular-nums text-neutral-200 placeholder:text-neutral-500 focus:border-primary focus:outline-none"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-500 hover:text-neutral-200"
                  aria-label="Clear"
                >
                  <Icon path={ICONS.close} className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[60vh] overflow-auto py-1">
            {decades.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-neutral-600">
                No year matches “{query}”.
              </div>
            )}
            {decades.map(([d, ys]) => {
              const cachedInDecade = ys.filter((y) => cached.has(y)).length;
              return (
                <section key={d} className="mb-1">
                  <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-surface-1 px-4 py-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                      {d}s
                    </span>
                    {cachedInDecade > 0 && (
                      <span className="inline-flex items-center gap-1 text-[9px] tabular-nums text-success-light">
                        <span className="h-1.5 w-1.5 rounded-full bg-success" />
                        {cachedInDecade}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-2 px-2.5 pb-2 pt-1">
                    {ys.map((y) => {
                      const merge = y >= 1960 && y <= 1969;
                      const active = selected === y;
                      const isCached = cached.has(y);
                      return (
                        <button
                          key={y}
                          onClick={() => choose(y)}
                          aria-pressed={active}
                          className={`group relative flex h-9 items-center justify-center rounded-md border px-2 text-center transition-all duration-150 ${
                            active
                              ? 'border-primary bg-primary text-white shadow-[0_2px_12px_rgba(47,107,255,0.35)]'
                              : isCached
                                ? 'border-border-strong bg-surface-2 text-neutral-200 hover:border-primary/50 hover:bg-surface-3'
                                : 'border-transparent text-neutral-400 hover:bg-surface-2 hover:text-neutral-200'
                          }`}
                        >
                          <span className="text-[13px] font-semibold tabular-nums">{y}</span>
                          {merge && (
                            <span
                              className={`absolute -right-0.5 -top-0.5 rounded px-1 text-[7px] font-bold leading-tight ${
                                active ? 'bg-white/25 text-white' : 'bg-info/20 text-info'
                              }`}
                              title="AFL + NFL drafts merged"
                            >
                              AFL
                            </span>
                          )}
                          {isCached && !active && (
                            <span
                              className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-success"
                              title="Cached locally"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
