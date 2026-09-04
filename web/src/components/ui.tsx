import { useEffect, useState, type ReactNode } from 'react';
import type { TeamInfo } from '../types';

/** OVR chip — color encodes tier (gold elite … gray fringe), mirroring wAV. */
export function RatingChip({ ovr, size = 'md', hidden = false }: { ovr: number; size?: 'sm' | 'md' | 'lg'; hidden?: boolean }) {
  const dimH = size === 'lg' ? 'h-9 w-11 text-base' : size === 'sm' ? 'h-6 w-8 text-xs' : 'h-7 w-9 text-sm';
  // Same footprint as a real chip, so revealing a class does not reflow the board.
  if (hidden)
    return (
      <span
        className={`inline-flex items-center justify-center rounded-md border border-dashed border-border bg-surface-2 font-bold text-muted ${dimH}`}
        title="Hidden — tick Spoilers to reveal"
      >
        ?
      </span>
    );
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

/** Development-trait badges.
 *
 *  EA's own artwork, served from data/dev-icons, with a drawn mark in the same
 *  silhouette as the fallback. The icons do ship, so the fallback is for a build
 *  whose data directory is incomplete rather than for the normal install.
 *
 *  The asset names are the game's older internal ladder, one step below the
 *  tiers the UI shows, so the mapping is NOT name-for-name: bronze `slow` is
 *  Normal, silver `normal` is Star, gold `quick` is Superstar, red `superstar`
 *  is X-Factor, and `hidden` is the game's unscouted mark. */
const DEV_ART_NAME = ['slow', 'normal', 'quick', 'superstar'];
const devIconUrl = (name: string) => `/api/portrait/dev-icon/${name}`;

/** Drawn stand-ins: ring, star, ringed star, X-in-a-hexagon. */
function DrawnDevMark({ dev, className }: { dev: number; className: string }) {
  const common = { viewBox: '0 0 16 16', className, 'aria-hidden': true as const, fill: 'none' };
  if (dev >= 3)
    return (
      <svg {...common}>
        <path d="M8 1l6 3.5v7L8 15l-6-3.5v-7L8 1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  if (dev === 2)
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6.8" stroke="currentColor" strokeWidth="1.2" />
        <path d="M8 3.6l1.3 2.7 3 .4-2.2 2.1.5 3L8 10.4l-2.6 1.4.5-3-2.2-2.1 3-.4L8 3.6z" fill="currentColor" />
      </svg>
    );
  if (dev === 1)
    return (
      <svg {...common}>
        <path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2-.7-4.3-3.1-3 4.3-.6L8 1.8z" fill="currentColor" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="4.6" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

const DEV = [{ label: 'Normal' }, { label: 'Star' }, { label: 'Superstar' }, { label: 'X-Factor' }];
const DEV_TINT = ['text-amber-700', 'text-slate-300', 'text-gold', 'text-red-400'];

export function DevBadge({ dev, hidden = false, size = 'sm' }: { dev: number; hidden?: boolean; size?: 'sm' | 'lg' }) {
  const dim = size === 'lg' ? 'h-10 w-10' : 'h-6 w-6';
  const name = hidden ? 'hidden' : DEV_ART_NAME[dev] ?? DEV_ART_NAME[0];
  const label = hidden ? 'Hidden — tick Spoilers to reveal' : `${(DEV[dev] || DEV[0]).label} development`;
  const [noArt, setNoArt] = useState(false);
  useEffect(() => setNoArt(false), [name]);
  if (noArt)
    return (
      <span className={`inline-flex ${dim} items-center justify-center ${hidden ? 'text-info' : DEV_TINT[dev] ?? DEV_TINT[0]}`} title={label}>
        <DrawnDevMark dev={hidden ? 0 : dev} className={size === 'lg' ? 'h-7 w-7' : 'h-4 w-4'} />
      </span>
    );
  return (
    <img
      src={devIconUrl(name)}
      alt={label}
      title={label}
      onError={() => setNoArt(true)}
      className={`${dim} shrink-0 object-contain`}
    />
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
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className="h-1.5 w-1.5 rounded-full ring-1 ring-neutral-600" /> Generic
    </span>
  );
}

function Dot({ className }: { className: string }) {
  return <span className={`h-1.5 w-1.5 rounded-full ${className}`} />;
}

/** Player avatar. Walks the source chain (real photo, then in-game portrait —
 *  a dead photo URL 404s and the next source takes over) and only then falls
 *  back to a neutral silhouette chip. */
export function Portrait({ src, fallback, size = 'md' }: { src?: string | null; fallback?: string | null; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  const chain = [src, fallback].filter((u, i, a): u is string => !!u && a.indexOf(u) === i);
  const [broken, setBroken] = useState(0);
  useEffect(() => setBroken(0), [src, fallback]);
  const dim = size === 'xs' ? 'h-7 w-7' : size === 'lg' ? 'h-20 w-20' : size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  const url = chain[broken];
  if (url) {
    return (
      <img
        key={url}
        src={url}
        alt=""
        loading="lazy"
        onError={() => setBroken((b) => b + 1)}
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
  useEffect(() => setBroken(false), [team?.logo]);
  const dim = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6';
  if (!team) return <span className="text-xs text-muted">—</span>;
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
  plus: 'M12 5v14M5 12h14',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
};
