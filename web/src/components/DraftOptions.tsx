import { useEffect, useState } from 'react';
import type { DraftOpts } from '../App';
import { DEFAULT_DRAFT_OPTS } from '../App';

/** Draft-class generation controls: source (this year vs all-time greats) plus
 *  modifiers (class strength, guaranteed studs, a generational #1). Applied on
 *  demand so slider drags don't trigger a regenerate per tick. */
export function DraftOptions({ opts, busy, onApply }: { opts: DraftOpts; busy: boolean; onApply: (o: DraftOpts) => void }) {
  const [source, setSource] = useState(opts.source);
  const [strength, setStrength] = useState(opts.strength);
  const [studs, setStuds] = useState(opts.studs);
  const [generational, setGenerational] = useState(opts.generational);

  useEffect(() => {
    setSource(opts.source); setStrength(opts.strength); setStuds(opts.studs); setGenerational(opts.generational);
  }, [opts]);

  const next: DraftOpts = { source, strength, studs, generational };
  const dirty = JSON.stringify(next) !== JSON.stringify(opts);
  const strengthLabel = strength < 0.95 ? 'Weaker' : strength > 1.05 ? 'Stronger' : 'Normal';

  const seg = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'bg-primary text-white shadow-sm' : 'text-neutral-400 hover:text-neutral-200'}`;

  return (
    <div className="rounded-lg border border-border bg-surface-1 p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted">Source</span>
          <div className="flex items-center rounded-lg border border-border-strong bg-surface-2 p-0.5">
            <button className={seg(source === 'year')} onClick={() => setSource('year')}>This year</button>
            <button className={seg(source === 'alltime')} onClick={() => setSource('alltime')}>All-Time Greats</button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted">Class strength — <span className="text-neutral-300">{strengthLabel}</span></span>
          <input type="range" min={0.7} max={1.3} step={0.05} value={strength} onChange={(e) => setStrength(Number(e.target.value))} className="w-full accent-primary" />
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted">Guaranteed studs</span>
          <input type="number" min={0} max={20} value={studs} onChange={(e) => setStuds(Math.max(0, Math.min(20, Number(e.target.value))))}
            className="w-24 rounded-md border border-border bg-surface-0 px-2.5 py-1.5 text-sm text-neutral-200 focus:border-primary focus:outline-none" />
        </label>

        <label className="flex items-end gap-2 pb-1.5 text-sm text-neutral-200">
          <input type="checkbox" checked={generational} onChange={(e) => setGenerational(e.target.checked)} />
          Generational #1 (X-Factor)
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button onClick={() => onApply(next)} disabled={busy || !dirty}
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50">
          {busy ? 'Generating…' : 'Generate'}
        </button>
        {JSON.stringify(opts) !== JSON.stringify(DEFAULT_DRAFT_OPTS) && (
          <button onClick={() => onApply(DEFAULT_DRAFT_OPTS)} disabled={busy} className="text-xs text-neutral-500 hover:text-neutral-200">
            Reset to normal
          </button>
        )}
        <span className="ml-auto text-[11px] text-neutral-500">
          {source === 'alltime' ? 'Best players in history, one class' : 'Modifiers apply to the selected year'}
        </span>
      </div>
    </div>
  );
}
