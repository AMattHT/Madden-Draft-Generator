import { useMemo } from 'react';
import type { PlayerRow } from '../types';
import { groupForId, POS_GROUP_ORDER } from '../constants';

/**
 * Class composition strip: how many prospects at each position group, in draft-board
 * order. Counts reflect the whole class (not the current filter); clicking a group
 * filters the table to it (click again to clear).
 */
export function PositionBreakdown({
  rows,
  active,
  onPick,
  compact = false,
}: {
  rows: PlayerRow[];
  active: string;
  onPick: (group: string) => void;
  compact?: boolean;
}) {
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) {
      const g = groupForId(r.positionId);
      c[g] = (c[g] || 0) + 1;
    }
    return c;
  }, [rows]);
  const groups = POS_GROUP_ORDER.filter((g) => counts[g]);

  return (
    <div
      className={
        compact
          ? 'flex flex-wrap items-center gap-1.5'
          : 'flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-3 py-2.5'
      }
    >
      <span className="mr-1 text-[11px] font-medium uppercase tracking-wider text-muted">Positions</span>
      {groups.map((g) => {
        const on = active === g;
        return (
          <button
            key={g}
            onClick={() => onPick(on ? 'ALL' : g)}
            title={`${counts[g]} ${g} — click to ${on ? 'clear filter' : 'filter'}`}
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              on ? 'bg-primary text-white' : 'bg-surface-2 text-neutral-300 hover:bg-surface-3 hover:text-neutral-100'
            }`}
          >
            <span>{g}</span>
            <span className={`tabular-nums ${on ? 'text-white/80' : 'text-muted'}`}>{counts[g]}</span>
          </button>
        );
      })}
    </div>
  );
}
