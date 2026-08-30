import { useEffect, useRef, useState } from 'react';
import type { GeneratedClass, PlayerRow } from '../types';
import { PositionBreakdown } from './PositionBreakdown';

const TIERS = [
  { c: 'bg-gold', t: '90+', d: 'HOF / elite' },
  { c: 'bg-success', t: '80–89', d: 'star starter' },
  { c: 'bg-primary', t: '70–79', d: 'contributor' },
  { c: 'bg-slate-600', t: '60–69', d: 'rotational' },
  { c: 'bg-neutral-700', t: '<60', d: 'fringe' },
];

/** OVR tier key as an on-demand popover (was a permanent card eating board space). */
function TierKey() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="OVR tier key + how ratings work"
        className="grid h-6 w-6 place-items-center rounded-full border border-border-strong text-[11px] font-bold text-neutral-400 transition-colors hover:bg-surface-2 hover:text-neutral-200"
      >
        ?
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-border-strong bg-surface-1 p-3.5 shadow-[0_16px_48px_rgba(0,0,0,0.55)]">
          <div className="flex flex-col gap-1.5">
            {TIERS.map((i) => (
              <div key={i.t} className="flex items-center gap-2">
                <span className={`inline-block h-3 w-3 rounded ${i.c}`} />
                <span className="text-xs">
                  <b className="tabular-nums text-neutral-200">{i.t}</b>{' '}
                  <span className="text-muted">{i.d}</span>
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2.5 border-t border-border pt-2.5 text-[11px] leading-relaxed text-neutral-400">
            Ratings derive from each player's career <b className="text-neutral-300">weighted Approximate Value</b> —
            near-zero wAV ⇒ a bust, Hall-of-Fame wAV ⇒ a superstar. wAV tag:{' '}
            <span className="text-info">A</span> actual · <span className="text-neutral-400">P</span> predicted ·{' '}
            <span className="text-gold">EA</span> official 2026 rookie rating.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * One slim meta strip under the class header: class stats inline + position-group
 * filter chips + the tier key. Replaces the old StatsBar / PositionBreakdown /
 * WavLegend stack so the board itself starts near the top of the viewport.
 */
export function MetaStrip({
  data,
  rows,
  pos,
  onPickPos,
  onShowDropped,
  spoilers = true,
}: {
  data: GeneratedClass;
  rows: PlayerRow[];
  pos: string;
  onPickPos: (group: string) => void;
  onShowDropped?: () => void;
  /** false masks the class's average OVR and its dev-trait counts. */
  spoilers?: boolean;
}) {
  const dev = [0, 0, 0, 0];
  let ovrSum = 0;
  let ovrMax = 0;
  for (const r of data.rows) {
    dev[r.devTrait] = (dev[r.devTrait] || 0) + 1;
    ovrSum += r.overall;
    if (r.overall > ovrMax) ovrMax = r.overall;
  }
  const avg = Math.round(ovrSum / (data.rows.length || 1));

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-surface-1 px-3 py-2">
      <span className="flex items-baseline gap-1.5 text-xs text-neutral-400">
        <b className="tabular-nums text-sm text-neutral-100">{data.count}</b> prospects
      </span>
      <span className="h-4 w-px bg-border" />
      {/* The class average and its dev-trait counts describe how strong the class
          is, which is the whole thing blind scouting is meant to withhold. The
          "top rated" tooltip leaked it too. Dot colours track the badges. */}
      <span
        className="flex items-baseline gap-1.5 text-xs text-neutral-400"
        title={spoilers ? `Top rated: ${ovrMax}` : 'Hidden — tick Spoilers to reveal'}
      >
        avg OVR <b className="tabular-nums text-sm text-neutral-100">{spoilers ? avg : '?'}</b>
      </span>
      <span className="h-4 w-px bg-border" />
      <span
        className="flex items-center gap-2 text-[11px] text-neutral-400"
        title={spoilers ? 'Dev traits: X-Factor / Superstar / Star' : 'Hidden — tick Spoilers to reveal'}
      >
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /><b className="tabular-nums text-neutral-200">{spoilers ? dev[3] : '?'}</b></span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-gold" /><b className="tabular-nums text-neutral-200">{spoilers ? dev[2] : '?'}</b></span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-300" /><b className="tabular-nums text-neutral-200">{spoilers ? dev[1] : '?'}</b></span>
      </span>
      <span className="h-4 w-px bg-border" />
      <span className="text-[11px] text-neutral-400" title={`${data.likeness.withPortrait} real portraits · ${data.likeness.customPortrait} custom-photo eligible`}>
        <b className="tabular-nums text-neutral-200">{data.likeness.asset}</b> real faces
      </span>
      {data.dropped && data.dropped.length > 0 && (
        <>
          <span className="h-4 w-px bg-border" />
          <button
            onClick={onShowDropped}
            className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[11px] text-warning transition-colors hover:bg-warning/20"
            title={`The class holds 402; ${data.dropped.length} players did not fit. Click to see them and pull any back in.`}
          >
            <b className="tabular-nums">{data.dropped.length}</b> didn't fit{data.included && data.included.length > 0 ? ` · ${data.included.length} included` : ''}
          </button>
        </>
      )}
      <span className="hidden h-4 w-px bg-border sm:block" />
      <PositionBreakdown rows={rows} active={pos} onPick={onPickPos} compact />
      <TierKey />
    </div>
  );
}
