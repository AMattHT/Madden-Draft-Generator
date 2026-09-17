import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { displayPortrait } from '../api';
import type { PlayerRow } from '../types';
import { keyAttrsForPosition, fmtHeight } from '../constants';
import { DevBadge, Portrait, RatingChip, TeamLogo, ovrTier } from './ui';

type Row = PlayerRow & { edited?: boolean };

const CARD_W = 232;
const CARD_H = 318;
const GAP = 14;
const OVERSCAN_ROWS = 1;

/** The tier of a revealed card colours its top edge and its glow. */
const TIER_EDGE = [
  'from-neutral-600 to-neutral-700',
  'from-slate-400 to-slate-600',
  'from-primary-light to-primary',
  'from-success-light to-success',
  'from-gold-light to-gold',
];
const TIER_GLOW = ['', '', 'hover:shadow-[0_18px_40px_-16px_rgba(47,107,255,0.55)]', 'hover:shadow-[0_18px_40px_-16px_rgba(34,197,94,0.5)]', 'hover:shadow-[0_18px_40px_-16px_rgba(245,197,24,0.55)]'];

const Card = memo(function Card({
  r,
  active,
  spoilers,
  onOpen,
  index,
}: {
  r: Row;
  active: boolean;
  spoilers: boolean;
  onOpen: (id: number) => void;
  index: number;
}) {
  const tier = spoilers ? ovrTier(r.overall) : 0;
  const sig = keyAttrsForPosition(r.positionId).slice(0, 6);
  return (
    <button
      onClick={() => onOpen(r.id)}
      aria-pressed={active}
      style={{ width: CARD_W, height: CARD_H, ['--i' as string]: Math.min(index, 24) }}
      className={`hover-lift press group relative flex flex-col overflow-hidden rounded-2xl border text-left outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary-light ${TIER_GLOW[tier]} ${
        active ? 'border-primary/70 shadow-[0_0_0_1px_rgba(47,107,255,0.5),0_18px_40px_-16px_rgba(47,107,255,0.6)]' : 'border-white/[0.07] hover:border-white/[0.16]'
      }`}
    >
      {/* Foil backdrop: the generated texture, dimmed, under a dark gradient. */}
      <span aria-hidden className="absolute inset-0 bg-surface-1" />
      <span aria-hidden className="absolute inset-0 bg-[url('/art/card-foil.webp')] bg-cover bg-center opacity-[0.55] transition-opacity duration-300 group-hover:opacity-80" />
      <span aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/35 to-surface-0/95" />
      <span aria-hidden className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${TIER_EDGE[tier]}`} />

      {/* Header: team, pick. */}
      <span className="relative flex items-center justify-between px-3.5 pt-3">
        <span className="flex items-center gap-2">
          <TeamLogo team={r.team} size="md" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{r.team?.abbr ?? '—'}</span>
        </span>
        <span className="rounded-md bg-black/40 px-2 py-0.5 font-display text-[11px] font-bold tabular-nums text-neutral-300 ring-1 ring-white/[0.08]">
          {r.supplemental ? `S · Rd ${r.supplemental.round}` : `#${r.pick}`}
        </span>
      </span>

      {/* Portrait with the OVR chip pinned to its corner. */}
      <span className="relative mx-auto mt-2.5 block h-[108px] w-[108px]">
        <span className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/[0.08] to-transparent p-[1px]">
          <span className="block h-full w-full overflow-hidden rounded-2xl bg-surface-2">
            <Portrait src={displayPortrait(r)} fallback={r.portrait} size="fill" className="transition-transform duration-500 group-hover:scale-[1.06]" />
          </span>
        </span>
        <span className="absolute -bottom-2 -right-2">
          <RatingChip ovr={r.overall} size="lg" hidden={!spoilers} />
        </span>
        {r.edited && <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-gold shadow-[0_0_8px_rgba(245,197,24,0.9)]" title="edited" />}
      </span>

      {/* Identity. */}
      <span className="relative mt-4 px-3.5">
        <span className="block truncate font-display text-[15px] font-bold leading-tight text-neutral-50">
          {r.firstName} {r.lastName}
        </span>
        <span className="mt-1 flex items-center gap-2 text-[11px] text-neutral-400">
          <span className="inline-flex h-5 items-center rounded bg-white/[0.06] px-1.5 text-[11px] font-bold text-neutral-200 ring-1 ring-white/[0.06]">{r.position}</span>
          <span className="truncate">{r.college || '—'}</span>
          <span className="ml-auto shrink-0"><DevBadge dev={r.devTrait} hidden={!spoilers} /></span>
        </span>
        <span className="mt-1 block text-[11px] tabular-nums text-neutral-500">
          {fmtHeight(r.heightInches)} · {r.weight || '—'} lb · age {r.age || '—'}{r.wav != null && spoilers ? ` · wAV ${r.wav}` : ''}
        </span>
      </span>

      {/* Signature ratings as tiny bars. */}
      <span className="relative mt-auto grid grid-cols-3 gap-x-3 gap-y-2 px-3.5 pb-4">
        {sig.map(([k, label]) => {
          const v = r.ratings?.[k] ?? 0;
          const t = ovrTier(v);
          return (
            <span key={k} className="flex flex-col gap-0.5">
              <span className="flex items-baseline justify-between text-[11px] font-semibold">
                <span className="text-neutral-500">{label}</span>
                <span className={`tabular-nums ${spoilers ? (t >= 4 ? 'text-gold' : t >= 3 ? 'text-success-light' : 'text-neutral-300') : 'text-neutral-600'}`}>{spoilers ? v : '?'}</span>
              </span>
              <span className="h-[3px] overflow-hidden rounded-full bg-white/[0.06]">
                <span
                  className={`block h-full rounded-full bg-gradient-to-r transition-[width] duration-500 ${TIER_EDGE[t]}`}
                  style={{ width: spoilers ? `${Math.max(3, v)}%` : '0%', transitionTimingFunction: 'var(--ease-out-expo)' }}
                />
              </span>
            </span>
          );
        })}
      </span>
    </button>
  );
});

/**
 * Card view: one trading-card style tile per prospect, in the board's filter and
 * sort order. Virtualised by row so a full 402-player class costs the DOM only a
 * couple of screens of cards.
 */
export function PlayerCards({
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
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 700 });
  const [scrollTop, setScrollTop] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => { if (el.clientWidth > 0) setSize({ w: el.clientWidth, h: el.clientHeight }); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { const el = ref.current; if (el) { el.scrollTop = 0; setScrollTop(0); } }, [rows.length]);
  const raf = useRef(0);
  const onScroll = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => { if (ref.current) setScrollTop(ref.current.scrollTop); });
  }, []);

  const pad = 20;
  const perRow = Math.max(1, Math.floor((size.w - pad * 2 + GAP) / (CARD_W + GAP)));
  const rowCount = Math.ceil(rows.length / perRow);
  const stride = CARD_H + GAP;
  const first = Math.max(0, Math.floor((scrollTop - pad) / stride) - OVERSCAN_ROWS);
  const last = Math.min(rowCount, Math.ceil((scrollTop - pad + size.h) / stride) + OVERSCAN_ROWS);
  const visible = useMemo(() => rows.slice(first * perRow, last * perRow), [rows, first, last, perRow]);
  // Centre the grid: the leftover width splits evenly on both sides.
  const gridW = perRow * CARD_W + (perRow - 1) * GAP;
  const left = Math.max(pad, (size.w - gridW) / 2);

  return (
    <div ref={ref} onScroll={onScroll} className="relative h-full min-h-0 overflow-auto">
      {rows.length === 0 ? (
        <div className="grid h-full place-items-center text-sm text-muted">No players match the current filter.</div>
      ) : (
        <div style={{ height: pad * 2 + rowCount * stride - GAP, position: 'relative' }}>
          <div
            className="stagger absolute grid"
            style={{
              top: pad + first * stride,
              left,
              gridTemplateColumns: `repeat(${perRow}, ${CARD_W}px)`,
              gap: GAP,
            }}
          >
            {visible.map((r, i) => (
              <Card key={r.id} r={r} index={i} active={r.id === selectedId} spoilers={spoilers} onOpen={onOpen} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
