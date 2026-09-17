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
    <div className={compact ? 'flex flex-wrap items-center gap-1' : 'glass flex flex-wrap items-center gap-1 rounded-xl px-3 py-2.5'}>
      {groups.map((g) => {
        const on = active === g;
        return (
          <button
            key={g}
            onClick={() => onPick(on ? 'ALL' : g)}
            title={`${counts[g]} ${g} — click to ${on ? 'clear filter' : 'filter'}`}
            className={`press inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold transition-all duration-150 ${
              on
                ? 'bg-primary text-white shadow-[0_2px_10px_rgba(47,107,255,0.4)]'
                : 'text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-100'
            }`}
          >
            <span>{g}</span>
            <span className={`tabular-nums ${on ? 'text-white/80' : 'text-neutral-600'}`}>{counts[g]}</span>
          </button>
        );
      })}
    </div>
  );
}
