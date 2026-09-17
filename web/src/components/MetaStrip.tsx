import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { GeneratedClass, PlayerRow } from '../types';
import { PositionBreakdown } from './PositionBreakdown';
import { DevBadge, Icon, ICONS } from './ui';

const TIERS = [
  { c: 'bg-gold', t: '90+', d: 'HOF / elite' },
  { c: 'bg-success', t: '80–89', d: 'star starter' },
  { c: 'bg-primary', t: '70–79', d: 'contributor' },
  { c: 'bg-slate-600', t: '60–69', d: 'rotational' },
  { c: 'bg-neutral-700', t: '<60', d: 'fringe' },
];

/** OVR tier key as an on-demand popover. */
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
        className="grid h-7 w-7 place-items-center rounded-full border border-white/[0.08] text-muted transition-colors hover:bg-white/[0.06] hover:text-neutral-100"
      >
        <Icon path={ICONS.info} className="h-4 w-4" />
      </button>
      {open && (
        <div className="glass-strong absolute right-0 top-full z-50 mt-2 w-80 animate-pop rounded-xl p-3.5">
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
          <p className="mt-2.5 border-t border-white/[0.06] pt-2.5 text-[11px] leading-relaxed text-neutral-400">
            Ratings derive from each player's career <b className="text-neutral-300">weighted Approximate Value</b> —
            near-zero wAV ⇒ a bust, Hall-of-Fame wAV ⇒ a superstar. wAV tag:{' '}
            <span className="text-info">A</span> actual · <span className="text-neutral-400">P</span> predicted ·{' '}
            <span className="text-gold">EA</span> official rookie rating.
          </p>
        </div>
      )}
    </div>
  );
}

/** A number that counts up to its value when it changes, so a rebuild reads
 *  as movement. Falls back to the plain value for hidden ('?') stats. */
function Counter({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    const end = value;
    if (start === end) return;
    const t0 = performance.now();
    const dur = 480;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(start + (end - start) * e));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = end;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown}</>;
}

function Stat({ value, label, title, tone = 'neutral' }: { value: ReactNode; label: ReactNode; title?: string; tone?: 'neutral' | 'gold' | 'warning' }) {
  const v = tone === 'gold' ? 'text-gold' : tone === 'warning' ? 'text-warning' : 'text-neutral-50';
  return (
    <span className="flex items-baseline gap-1.5 text-[11px] text-muted" title={title}>
      <b className={`font-display text-[15px] font-bold tabular-nums ${v}`}>{value}</b> {label}
    </span>
  );
}

const Sep = () => <span className="h-4 w-px bg-white/[0.07]" />;

/**
 * One slim meta strip under the class header: class stats inline + position-group
 * filter chips + the tier key, so the board itself starts near the top of the viewport.
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
  // A face is "verified" when it is a real scan, when its tone rests on evidence
  // (portrait, headshot, Wikipedia photo, curated record) or when the user fixed it.
  // Generated fillers have no identity to verify, so they sit outside the count.
  const realFaces = data.rows.filter((r) => r.toneSource != null || r.face === 'asset');
  const verified = realFaces.filter((r) => r.face === 'asset' || r.likenessFixed || (r.toneSource !== 'prior' && r.toneSource !== 'csv')).length;
  const supplemental = data.rows.filter((r) => r.supplemental).length;

  return (
    <div className="glass rounded-xl px-3.5 py-2">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
      <Stat value={<Counter value={data.count} />} label="prospects" />
      <Sep />
      {/* The class average and its dev-trait counts describe how strong the class
          is, which is the whole thing blind scouting is meant to withhold. */}
      <Stat
        value={spoilers ? <Counter value={avg} /> : '?'}
        label="avg OVR"
        title={spoilers ? `Top rated: ${ovrMax}` : 'Hidden — turn on Spoilers to reveal'}
      />
      <Sep />
      <span className="flex items-center gap-3 text-[11px] text-muted" title={spoilers ? 'Dev traits: X-Factor / Superstar / Star' : 'Hidden — turn on Spoilers to reveal'}>
        {([3, 2, 1] as const).map((d) => (
          <span key={d} className="flex items-center gap-1">
            <DevBadge dev={d} />
            <b className="font-display text-[13px] font-bold tabular-nums text-neutral-200">{spoilers ? dev[d] : '?'}</b>
          </span>
        ))}
      </span>
      <Sep />
      <Stat value={data.likeness.asset} label="real faces" title={`${data.likeness.withPortrait} real portraits · ${data.likeness.customPortrait} custom-photo eligible`} />
      {data.source !== 'file' && (
        <>
          <Sep />
          <Stat
            value={<>{verified}<span className="text-xs font-medium text-muted">/{data.rows.length}</span></>}
            label="faces verified"
            title={`${verified} of ${data.rows.length} faces rest on evidence (a real scan, a portrait or photo reading, or a curated record). Open a player to check the rest.`}
          />
        </>
      )}
      {supplemental > 0 && (
        <>
          <Sep />
          <Stat value={supplemental} label="supplemental" title="Supplemental-draft selections: each sits after his round's regular picks and is marked S in the table." />
        </>
      )}
      {data.dropped && data.dropped.length > 0 && (
        <>
          <Sep />
          <button
            onClick={onShowDropped}
            className="press inline-flex h-6 items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 text-[11px] font-medium text-warning transition-colors hover:bg-warning/20"
            title={`The class holds 402; ${data.dropped.length} players did not fit. Click to see them and pull any back in.`}
          >
            <b className="tabular-nums">{data.dropped.length}</b> didn't fit{data.included && data.included.length > 0 ? ` · ${data.included.length} included` : ''}
          </button>
        </>
      )}
      </div>
      <div className="mt-2 flex items-center gap-2 border-t border-white/[0.06] pt-2">
        <PositionBreakdown rows={rows} active={pos} onPick={onPickPos} compact />
        <TierKey />
      </div>
    </div>
  );
}
