import { useState, type ReactNode } from 'react';
import type { TeamInfo } from '../types';

/** OVR chip — color encodes tier (gold elite … gray fringe), mirroring wAV. */
export function RatingChip({ ovr, size = 'md' }: { ovr: number; size?: 'sm' | 'md' | 'lg' }) {
  const cls =
    ovr >= 90
      ? 'bg-gold text-black shadow-[0_1px_6px_rgba(245,197,24,0.35)]'
      : ovr >= 80
        ? 'bg-success text-black'
        : ovr >= 70
          ? 'bg-primary text-white'
          : ovr >= 60
            ? 'bg-slate-600 text-white'
            : 'bg-neutral-700 text-neutral-200';
  const dim = size === 'lg' ? 'h-9 w-11 text-base' : size === 'sm' ? 'h-6 w-8 text-xs' : 'h-7 w-9 text-sm';
  return (
    <span className={`inline-flex items-center justify-center rounded-md font-bold tabular-nums ${dim} ${cls}`}>
      {ovr}
    </span>
  );
}

const DEV = [
  { label: 'Normal', short: '—', cls: 'text-neutral-500', pill: '' },
  { label: 'Star', short: 'Star', cls: 'text-primary-light', pill: 'bg-primary/15 text-primary-light ring-1 ring-primary/30' },
  { label: 'Superstar', short: 'Superstar', cls: 'text-pink-400', pill: 'bg-pink-500/15 text-pink-300 ring-1 ring-pink-500/30' },
  { label: 'X-Factor', short: 'X-Factor', cls: 'text-legend-light', pill: 'bg-legend/20 text-legend-light ring-1 ring-legend/40' },
];

export function DevBadge({ dev }: { dev: number }) {
  const d = DEV[dev] || DEV[0];
  if (dev <= 0) return <span className="text-xs text-neutral-600">—</span>;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${d.pill}`}>
      {dev === 3 && <span aria-hidden>✦</span>}
      {d.short}
    </span>
  );
}

export function FaceTag({ face }: { face: string }) {
  if (face === 'asset')
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-success-light">
        <Dot className="bg-success" /> Real face
      </span>
    );
  if (face === 'photo')
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-gold">
        <Dot className="bg-gold" /> Photo
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
      <span className="h-1.5 w-1.5 rounded-full ring-1 ring-neutral-600" /> Generic
    </span>
  );
}

function Dot({ className }: { className: string }) {
  return <span className={`h-1.5 w-1.5 rounded-full ${className}`} />;
}

/** Madden menu portrait for a player. Falls back to a neutral silhouette chip
 *  if the portrait is unavailable (Editor Suite data missing, or load error). */
export function Portrait({ src, size = 'md' }: { src?: string | null; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  const [broken, setBroken] = useState(false);
  const dim = size === 'xs' ? 'h-7 w-7' : size === 'lg' ? 'h-20 w-20' : size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className={`${dim} shrink-0 rounded-md bg-surface-2 object-cover ring-1 ring-border`}
      />
    );
  }
  return (
    <span className={`${dim} grid shrink-0 place-items-center rounded-md bg-surface-2 text-neutral-600 ring-1 ring-border`}>
      <svg viewBox="0 0 24 24" className="h-1/2 w-1/2" fill="currentColor" aria-hidden>
        <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-5 0-9 2.5-9 6v2h18v-2c0-3.5-4-6-9-6Z" />
      </svg>
    </span>
  );
}

/** Drafting-team mark: ESPN logo when available, else a neutral abbreviation
 *  chip (historical/relocated teams, or a missing logo). */
export function TeamLogo({ team, size = 'md' }: { team?: TeamInfo; size?: 'sm' | 'md' }) {
  const [broken, setBroken] = useState(false);
  const dim = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6';
  if (!team) return <span className="text-xs text-neutral-600">—</span>;
  if (team.logo && !broken) {
    return (
      <img
        src={team.logo}
        alt={team.name}
        title={team.name}
        loading="lazy"
        onError={() => setBroken(true)}
        className={`${dim} shrink-0 object-contain`}
      />
    );
  }
  return (
    <span
      title={team.name}
      className="inline-flex items-center rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-neutral-400 ring-1 ring-border-strong"
    >
      {team.abbr}
    </span>
  );
}

/** Small labelled status pill (cache / live / mode). */
export function Pill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'primary' | 'legend' | 'success' | 'gold';
}) {
  const tones = {
    neutral: 'bg-surface-2 text-neutral-400 ring-border-strong',
    primary: 'bg-primary/15 text-primary-light ring-primary/30',
    legend: 'bg-legend/15 text-legend-light ring-legend/40',
    success: 'bg-success/15 text-success-light ring-success/30',
    gold: 'bg-gold/15 text-gold ring-gold/30',
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${tones}`}>
      {children}
    </span>
  );
}

/* --- Inline icons (currentColor, 1.5 stroke) --- */
export function Icon({ path, className = 'h-4 w-4', fill = false }: { path: string; className?: string; fill?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={path} />
    </svg>
  );
}

export const ICONS = {
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35',
  download: 'M12 3v12m0 0 4-4m-4 4-4-4M5 21h14',
  refresh: 'M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6',
  image: 'M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6',
  close: 'M6 6l12 12M18 6 6 18',
  x: 'M6 6l12 12M18 6 6 18',
  chevronDown: 'M6 9l6 6 6-6',
  shuffle:
    'M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22 M18 2l4 4-4 4 M2 6h1.9c1.5 0 2.9.9 3.6 2.2 M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8 M18 14l4 4-4 4',
  undo: 'M9 14 4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11',
  warning: 'M21.73 18l-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z M12 9v4 M12 17h.01',
  board: 'M5 8l7 4 7-4M5 13l7 4 7-4',
};
