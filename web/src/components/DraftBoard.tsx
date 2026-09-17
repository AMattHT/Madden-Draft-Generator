import { memo, useMemo } from 'react';
import { displayPortrait } from '../api';
import type { PlayerRow } from '../types';
import { DevBadge, Portrait, RatingChip, TeamLogo } from './ui';

type Row = PlayerRow & { edited?: boolean };

const Tile = memo(function Tile({ r, active, spoilers, onOpen, i }: { r: Row; active: boolean; spoilers: boolean; onOpen: (id: number) => void; i: number }) {
  return (
    <button
      onClick={() => onOpen(r.id)}
      aria-pressed={active}
      style={{ ['--i' as string]: Math.min(i, 24) }}
      className={`press group flex h-[52px] w-full items-center gap-2 rounded-lg border px-2 text-left outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-primary-light ${
        active
          ? 'border-primary/60 bg-primary/15'
          : 'border-white/[0.05] bg-white/[0.025] hover:border-white/[0.14] hover:bg-white/[0.06]'
      }`}
    >
      <span className="w-6 shrink-0 text-right text-[11px] font-bold tabular-nums text-neutral-500">{r.supplemental ? 'S' : r.pick}</span>
      <Portrait src={displayPortrait(r)} fallback={r.portrait} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold text-neutral-100">{r.firstName} {r.lastName}</span>
          {r.edited && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" title="edited" />}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-neutral-400">
          <TeamLogo team={r.team} size="sm" />
          <span className="font-semibold text-neutral-300">{r.position}</span>
          <span className="truncate">{r.college || ''}</span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <DevBadge dev={r.devTrait} hidden={!spoilers} />
        <RatingChip ovr={r.overall} size="sm" hidden={!spoilers} />
      </span>
    </button>
  );
});

/**
 * Draft board: one column per round, picks in order down each column, the way a
 * war-room wall reads. Filters apply; the sort does not (a round is a round).
 */
export function DraftBoard({
  rows,
  selectedId,
  onOpen,
  spoilers,
}: {
  rows: Row[];
  selectedId: number | null;
  onOpen: (id: number) => void;
  spoilers: boolean;
}) {
  const rounds = useMemo(() => {
    const map = new Map<number, Row[]>();
    for (const r of rows) {
      const k = r.supplemental?.round ?? r.round ?? 0;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] || 999) - (b[0] || 999))
      .map(([round, list]) => [round, list.sort((a, b) => a.pick - b.pick)] as const);
  }, [rows]);

  if (rows.length === 0) return <div className="grid h-full place-items-center text-sm text-muted">No players match the current filter.</div>;

  return (
    <div className="h-full min-h-0 overflow-auto px-4 py-4">
      <div className="flex h-full min-w-max gap-3">
        {rounds.map(([round, list]) => {
          const revealed = spoilers ? list.filter((r) => r.overall >= 80).length : 0;
          return (
            <section key={round} className="glass flex w-[272px] shrink-0 flex-col rounded-xl">
              <header className="accent-line flex items-center justify-between rounded-t-xl border-b border-white/[0.06] px-3 py-2">
                <span className="font-display text-xs font-bold uppercase tracking-[0.12em] text-neutral-200">
                  {round ? `Round ${round}` : 'Unrounded'}
                </span>
                <span className="text-[11px] tabular-nums text-muted">
                  {list.length} pick{list.length === 1 ? '' : 's'}
                  {revealed > 0 && <span className="ml-1.5 text-success-light" title="80+ overall">· {revealed} ★</span>}
                </span>
              </header>
              <div className="stagger flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2 scrollbar-thin">
                {list.map((r, i) => (
                  <Tile key={r.id} r={r} i={i} active={r.id === selectedId} spoilers={spoilers} onOpen={onOpen} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
