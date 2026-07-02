import { useEffect, useRef, useState } from 'react';
import { api, type PlayerSearchResult } from '../api';
import { Icon, ICONS } from './ui';

/**
 * Global player lookup: search any drafted player by name → jump to their draft
 * class. A popover in the top bar (mirrors YearPicker's open/close behavior).
 */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function PlayerSearch({ onSelect }: { onSelect: (year: number, focusName: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      api
        .playerSearch(q)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  // Close on outside click / Escape; focus input on open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    inputRef.current?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (p: PlayerSearchResult) => {
    onSelect(p.draftYear, norm(`${p.firstName}${p.lastName}`));
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-border-strong bg-surface-2 py-1.5 pl-2.5 pr-3 text-neutral-400 transition-colors hover:bg-surface-3 hover:text-neutral-200"
        title="Find a player across all draft classes"
      >
        <Icon path={ICONS.search} className="h-4 w-4" />
        <span className="hidden text-xs md:inline">Find player</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[26rem] max-w-[90vw] overflow-hidden rounded-xl border border-border-strong bg-surface-1 shadow-[0_16px_48px_rgba(0,0,0,0.55)]">
          <div className="border-b border-border p-3">
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500">
                <Icon path={ICONS.search} className="h-4 w-4" />
              </span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search any player by name…"
                className="w-full rounded-md border border-border bg-surface-0 py-1.5 pl-8 pr-7 text-sm text-neutral-200 placeholder:text-neutral-500 focus:border-primary focus:outline-none"
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
            {loading && <div className="px-4 py-6 text-center text-xs text-neutral-600">Searching…</div>}
            {!loading && query.trim() && results.length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-neutral-600">No player matches “{query}”.</div>
            )}
            {!loading && !query.trim() && (
              <div className="px-4 py-6 text-center text-xs text-neutral-600">
                Type a name to find their draft class.
              </div>
            )}
            {results.map((p, i) => (
              <button
                key={`${p.firstName}${p.lastName}${p.draftYear}${p.draftPick}${i}`}
                onClick={() => choose(p)}
                className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors hover:bg-surface-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-neutral-100">
                    {p.firstName} {p.lastName}
                  </span>
                  <span className="block truncate text-[11px] text-neutral-500">
                    {p.position || '—'} · {p.college || '—'}
                    {p.league && p.league !== 'NFL' ? ` · ${p.league}` : ''}
                    {p.draftRound ? ` · Rd ${p.draftRound}${p.draftPick ? `, Pk ${p.draftPick}` : ''}` : ' · undrafted'}
                  </span>
                </span>
                <span className="shrink-0 rounded-md bg-surface-2 px-2 py-1 text-xs font-bold tabular-nums text-primary-light ring-1 ring-border-strong">
                  {p.draftYear}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
