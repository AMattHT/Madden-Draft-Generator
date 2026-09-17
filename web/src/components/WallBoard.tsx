import { memo, useMemo } from 'react';
import { displayPortrait } from '../api';
import type { PlayerRow } from '../types';
import { groupForId, tierColor } from '../constants';
import { DevBadge, Portrait, RatingChip, TeamLogo } from './ui';
import { roundOf } from './PlayerTable';

type Row = PlayerRow & { edited?: boolean };

const Tile = memo(function Tile({ r, active, dim, spoilers, onOpen, i }: { r: Row; active: boolean; dim: boolean; spoilers: boolean; onOpen: (id: number) => void; i: number }) {
  return (
    <button
      onClick={() => onOpen(r.id)}
      aria-pressed={active}
      style={{ ['--i' as string]: Math.min(i, 24) }}
      className={`press group relative flex h-[68px] w-full items-center gap-2.5 overflow-hidden rounded-lg border bg-surface-2 pl-3.5 pr-2 text-left outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary-light ${
        active ? 'border-primary/70 shadow-[0_0_0_1px_rgba(47,107,255,0.5),0_10px_28px_-10px_rgba(47,107,255,0.7)]' : 'border-white/[0.06] hover:border-white/[0.16] hover:bg-surface-3'
      } ${dim ? 'opacity-30 saturate-50' : ''}`}
    >
      {/* Tier stripe on the left edge; transparent while the class is blind. */}
      <i aria-hidden className="absolute inset-y-0 left-0 w-1 transition-colors duration-300" style={{ background: spoilers ? tierColor(r.overall) : 'rgba(255,255,255,0.08)' }} />
      {/* Ghosted pick numeral, the way a magnet board is numbered. */}
      <span aria-hidden className="pointer-events-none absolute right-2 top-1 font-display text-[22px] font-extrabold leading-none tabular-nums text-white/[0.09] transition-colors group-hover:text-white/[0.16]">
        {r.supplemental ? 'S' : r.pick}
      </span>
      <Portrait src={displayPortrait(r)} fallback={r.portrait} size="md" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 pr-6">
          <span className="truncate text-[13px] font-bold text-neutral-50">{r.firstName} {r.lastName}</span>
          {r.edited && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" title="edited" />}
        </span>
        <span className="mt-1 flex items-center gap-1.5 text-[11px] text-neutral-400">
          <TeamLogo team={r.team} size="sm" />
          <span className="font-semibold text-neutral-300">{r.position}</span>
          <span className="truncate">{r.college || ''}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <DevBadge dev={r.devTrait} hidden={!spoilers} />
            <RatingChip ovr={r.overall} size="sm" hidden={!spoilers} />
          </span>
        </span>
      </span>
    </button>
  );
});

/**
 * The big board: every pick as a magnet tile, in draft order, rounds as bands.
 * A position filter dims the other tiles rather than removing them, so the shape
 * of the class (the runs, where the stars fell) stays visible.
 */
export function WallBoard({
  rows,
  pos,
  selectedId,
  onOpen,
  spoilers,
}: {
  /** In draft order, filtered by search only. */
  rows: Row[];
  /** The position filter: an exact label or a group code; 'ALL' for none. */
  pos: string;
  selectedId: number | null;
  onOpen: (id: number) => void;
  spoilers: boolean;
}) {
  const rounds = useMemo(() => {
    const out: { round: number | null; list: Row[] }[] = [];
    for (const r of rows) {
      const round = roundOf(r);
      const last = out[out.length - 1];
      if (last && last.round === round) last.list.push(r);
      else out.push({ round, list: [r] });
    }
    return out;
  }, [rows]);
  const matches = (r: Row) => pos === 'ALL' || r.position === pos || groupForId(r.positionId) === pos;

  if (rows.length === 0) return <div className="grid h-full place-items-center text-sm text-muted">No players match the current filter.</div>;

  return (
    <div className="contain-paint h-full min-h-0 overflow-auto px-4 py-3">
      {rounds.map(({ round, list }) => {
        const shown = pos === 'ALL' ? list.length : list.filter(matches).length;
        const elite = spoilers ? list.filter((r) => r.overall >= 80).length : 0;
        return (
          <section key={round ?? 'none'} className="mb-4">
            <header className="mb-2 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-300">
              <span>{round ? `Round ${round}` : 'Unrounded'}</span>
              <span className="font-semibold tracking-wide text-neutral-500">
                {pos === 'ALL' ? `${list.length} picks` : `${shown} of ${list.length}`}
              </span>
              {elite > 0 && <span className="font-semibold tracking-wide text-success-light">{elite} rated 80+</span>}
              <span className="h-px flex-1 bg-white/[0.06]" />
            </header>
            <div className="stagger grid grid-cols-[repeat(auto-fill,minmax(212px,1fr))] gap-2">
              {list.map((r, i) => (
                <Tile key={r.id} r={r} i={i} active={r.id === selectedId} dim={!matches(r)} spoilers={spoilers} onOpen={onOpen} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
