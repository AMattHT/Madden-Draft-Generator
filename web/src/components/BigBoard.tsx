import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { displayPortrait } from '../api';
import type { PlayerRow } from '../types';
import { groupForId, tierColor } from '../constants';
import { DevBadge, Portrait, RatingChip, TeamLogo, ovrTier } from './ui';
import { roundOf } from './PlayerTable';

type Row = PlayerRow & { edited?: boolean };

const ROW_H = 56;
const BAND_H = 36;
const OVERSCAN = 6;

/** Tier bands for the revealed board, top down. */
const TIERS: { min: number; label: string; note: string }[] = [
  { min: 90, label: 'Elite', note: 'franchise players' },
  { min: 80, label: 'Blue chip', note: 'day-one starters' },
  { min: 70, label: 'Starter', note: 'contributors' },
  { min: 60, label: 'Depth', note: 'rotational' },
  { min: 0, label: 'Camp', note: 'fringe' },
];
const tierOf = (ovr: number) => TIERS.find((t) => ovr >= t.min)!;

type Item =
  | { kind: 'row'; r: Row; rank: number }
  | { kind: 'band'; key: string; label: string; note: string; count: number };

const BoardRow = memo(function BoardRow({
  r,
  rank,
  posRank,
  spoilers,
  active,
  maxWav,
  onOpen,
}: {
  r: Row;
  rank: number;
  posRank: number;
  spoilers: boolean;
  active: boolean;
  maxWav: number;
  onOpen: (id: number) => void;
}) {
  // Where the board has him versus where the league took him: a positive delta
  // is a steal (taken later than his value), a negative one a reach.
  const delta = spoilers && !r.supplemental ? r.pick - rank : 0;
  const wavPct = r.wav != null ? Math.max(2, (r.wav / maxWav) * 100) : 0;
  return (
    <button
      onClick={() => onOpen(r.id)}
      aria-pressed={active}
      style={{ height: ROW_H }}
      className={`group flex w-full items-center gap-3 border-t border-white/[0.04] px-3 text-left outline-none transition-colors focus-visible:bg-white/[0.04] ${
        active ? 'bg-primary/12' : 'hover:bg-white/[0.035]'
      }`}
    >
      <i aria-hidden className="h-9 w-[3px] shrink-0 rounded-full" style={{ background: spoilers ? tierColor(r.overall) : 'rgba(255,255,255,0.08)' }} />
      <span className="w-9 shrink-0 text-right font-display text-[18px] font-extrabold tabular-nums text-neutral-300">{rank}</span>
      <Portrait src={displayPortrait(r)} fallback={r.portrait} size="md" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[13px] font-bold text-neutral-50">{r.firstName} {r.lastName}</span>
          {r.edited && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" title="edited" />}
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-[11px] text-neutral-400">
          <span className="inline-flex h-5 items-center rounded bg-white/[0.05] px-1.5 font-semibold text-neutral-200 ring-1 ring-white/[0.06]">
            {r.position}
            <span className="ml-1 text-neutral-500">{posRank}</span>
          </span>
          <span className="truncate">{r.college || '—'}</span>
        </span>
      </span>
      {/* Where the league took him. */}
      <span className="flex w-44 shrink-0 items-center gap-2 text-[11px] text-neutral-400" title={r.team ? `${r.team.name}, pick ${r.pick}` : `Pick ${r.pick}`}>
        <TeamLogo team={r.team} size="md" />
        <span className="tabular-nums">
          {r.supplemental ? `Supp. Rd ${r.supplemental.round}` : `Pick ${r.pick}`}
          {roundOf(r) && !r.supplemental ? <span className="text-neutral-600"> · Rd {roundOf(r)}</span> : null}
        </span>
        {delta !== 0 && (
          <span
            className={`ml-auto rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${delta > 0 ? 'bg-success/15 text-success-light' : 'bg-danger/15 text-red-300'}`}
            title={delta > 0 ? `Steal: taken ${delta} picks after his board rank` : `Reach: taken ${-delta} picks before his board rank`}
          >
            {delta > 0 ? `+${delta}` : delta}
          </span>
        )}
      </span>
      <span className="hidden w-28 shrink-0 items-center gap-2 lg:flex" title="Career value (wAV)">
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
          {spoilers && <span className="block h-full rounded-full bg-gradient-to-r from-primary to-primary-light" style={{ width: `${wavPct}%` }} />}
        </span>
        <span className="w-7 text-right text-[11px] tabular-nums text-neutral-300">{spoilers ? (r.wav ?? '—') : '?'}</span>
      </span>
      <DevBadge dev={r.devTrait} hidden={!spoilers} />
      <RatingChip ovr={r.overall} size="md" hidden={!spoilers} />
    </button>
  );
});

/**
 * The big board: every prospect ranked by value, tier breaks between groups, a
 * position rank on each, and the pick the league actually spent on him (with the
 * steal or reach that implies). Blind, the board is the draft-day consensus:
 * pick order, banded by round.
 */
export function BigBoard({
  rows,
  all,
  selectedId,
  onOpen,
  spoilers,
}: {
  /** The board's filtered rows (search and position). */
  rows: Row[];
  /** Every row in the class, for position ranks that do not shift with the filter. */
  all: Row[];
  selectedId: number | null;
  onOpen: (id: number) => void;
  spoilers: boolean;
}) {
  const byValue = useCallback((a: Row, b: Row) => b.overall - a.overall || (b.wav ?? -1) - (a.wav ?? -1) || a.pick - b.pick, []);
  // Ranks come from the whole class so a filtered board still shows true ranks.
  const { rankOf, posRankOf, maxWav } = useMemo(() => {
    const ordered = spoilers ? [...all].sort(byValue) : [...all].sort((a, b) => a.pick - b.pick);
    const rankOf = new Map<number, number>();
    const posRankOf = new Map<number, number>();
    const seen: Record<string, number> = {};
    ordered.forEach((r, i) => {
      rankOf.set(r.id, i + 1);
      const g = groupForId(r.positionId);
      seen[g] = (seen[g] ?? 0) + 1;
      posRankOf.set(r.id, seen[g]);
    });
    return { rankOf, posRankOf, maxWav: Math.max(1, ...all.map((r) => r.wav ?? 0)) };
  }, [all, spoilers, byValue]);

  const items = useMemo(() => {
    const ordered = [...rows].sort((a, b) => (rankOf.get(a.id) ?? 0) - (rankOf.get(b.id) ?? 0));
    const out: Item[] = [];
    let i = 0;
    while (i < ordered.length) {
      const head = ordered[i];
      const key = spoilers ? tierOf(head.overall).label : String(roundOf(head) ?? 'none');
      let j = i;
      while (j < ordered.length && (spoilers ? tierOf(ordered[j].overall).label : String(roundOf(ordered[j]) ?? 'none')) === key) j++;
      if (spoilers) {
        const t = tierOf(head.overall);
        out.push({ kind: 'band', key: `t-${t.label}`, label: `${t.label} · ${t.min ? `${t.min}+` : 'under 60'}`, note: t.note, count: j - i });
      } else {
        const round = roundOf(head);
        out.push({ kind: 'band', key: `r-${round ?? 'none'}-${i}`, label: round ? `Round ${round}` : 'Undrafted', note: 'draft-day order', count: j - i });
      }
      for (let k = i; k < j; k++) out.push({ kind: 'row', r: ordered[k], rank: rankOf.get(ordered[k].id) ?? k + 1 });
      i = j;
    }
    return out;
  }, [rows, rankOf, spoilers]);

  /* ---- Virtual window over mixed-height items. ---- */
  const offsets = useMemo(() => {
    const o = new Float64Array(items.length + 1);
    for (let i = 0; i < items.length; i++) o[i + 1] = o[i] + (items[i].kind === 'band' ? BAND_H : ROW_H);
    return o;
  }, [items]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => { if (el.clientHeight > 0) setHeight(el.clientHeight); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { const el = scrollRef.current; if (el) { el.scrollTop = 0; setScrollTop(0); } }, [rows.length, spoilers]);
  const raf = useRef(0);
  const onScroll = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => { if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop); });
  }, []);
  const total = offsets[items.length] ?? 0;
  let start = 0;
  while (start < items.length && offsets[start + 1] < scrollTop) start++;
  let end = start;
  while (end < items.length && offsets[end] < scrollTop + height) end++;
  start = Math.max(0, start - OVERSCAN);
  end = Math.min(items.length, end + OVERSCAN);

  // The band that governs the first row in view, pinned above the window.
  let firstVisible = 0;
  while (firstVisible < items.length && offsets[firstVisible + 1] <= scrollTop) firstVisible++;
  let bandIdx = firstVisible;
  while (bandIdx > 0 && items[bandIdx].kind !== 'band') bandIdx--;
  const pinned = items[bandIdx]?.kind === 'band' ? items[bandIdx] : null;

  if (rows.length === 0) return <div className="grid h-full place-items-center text-sm text-muted">No players match the current filter.</div>;

  return (
    <div ref={scrollRef} onScroll={onScroll} className="h-full min-h-0 overflow-auto">
      {pinned && pinned.kind === 'band' && (
        <div className="sticky top-0 z-20 mx-auto max-w-[1100px]" style={{ height: 0 }}>
          <div style={{ height: BAND_H }} className="flex items-center gap-3 bg-surface-1/95 px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-primary-light shadow-[0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md">
            <span>{pinned.label}</span>
            <span className="font-semibold normal-case tracking-normal text-neutral-500">{pinned.note} · {pinned.count}</span>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-[1100px]" style={{ height: total, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsets[start]}px)` }}>
          {items.slice(start, end).map((it) =>
            it.kind === 'band' ? (
              <div key={it.key} style={{ height: BAND_H }} className="flex items-center gap-3 px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-primary-light">
                <span>{it.label}</span>
                <span className="font-semibold normal-case tracking-normal text-neutral-500">{it.note} · {it.count}</span>
                <span className="h-px flex-1 bg-white/[0.06]" />
              </div>
            ) : (
              <BoardRow
                key={it.r.id}
                r={it.r}
                rank={it.rank}
                posRank={posRankOf.get(it.r.id) ?? 0}
                spoilers={spoilers}
                active={it.r.id === selectedId}
                maxWav={maxWav}
                onOpen={onOpen}
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}
