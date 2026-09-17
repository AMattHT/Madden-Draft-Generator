import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { TeamInfo } from '../types';

/* ------------------------------------------------------------------ */
/*  Buttons                                                            */
/* ------------------------------------------------------------------ */

type Tone = 'primary' | 'ghost' | 'subtle' | 'gold' | 'danger';
type Size = 'xs' | 'sm' | 'md';

const BTN_TONE: Record<Tone, string> = {
  primary:
    'bg-primary text-white shadow-[0_2px_12px_rgba(47,107,255,0.35),inset_0_1px_0_rgba(255,255,255,0.18)] hover:bg-primary-light hover:shadow-[0_4px_18px_rgba(47,107,255,0.5),inset_0_1px_0_rgba(255,255,255,0.18)]',
  ghost:
    'border border-white/[0.08] bg-white/[0.03] text-neutral-200 hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-white',
  subtle: 'text-neutral-400 hover:bg-white/[0.05] hover:text-neutral-100',
  gold: 'border border-gold/40 bg-gold/10 text-gold hover:bg-gold/20 hover:border-gold/60',
  danger: 'border border-danger/50 bg-danger/10 text-red-200 hover:bg-danger/20',
};
const BTN_SIZE: Record<Size, string> = {
  xs: 'h-7 px-2.5 text-[11px] gap-1.5 rounded-md',
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-9 px-4 text-sm gap-2 rounded-lg',
};

export function Button({
  tone = 'ghost',
  size = 'sm',
  active = false,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: Size; active?: boolean }) {
  return (
    <button
      {...rest}
      className={`press inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-semibold transition-all duration-150 disabled:pointer-events-none disabled:opacity-40 ${BTN_SIZE[size]} ${BTN_TONE[tone]} ${
        active ? 'border-primary/60 bg-primary/15 text-primary-light' : ''
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  size = 'sm',
  active = false,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: Size; active?: boolean }) {
  const dim = size === 'xs' ? 'h-7 w-7 rounded-md' : size === 'md' ? 'h-9 w-9 rounded-lg' : 'h-8 w-8 rounded-lg';
  return (
    <button
      {...rest}
      aria-label={label}
      title={rest.title ?? label}
      className={`press grid shrink-0 place-items-center border transition-all duration-150 disabled:pointer-events-none disabled:opacity-40 ${dim} ${
        active
          ? 'border-primary/50 bg-primary/15 text-primary-light'
          : 'border-white/[0.06] bg-white/[0.02] text-neutral-400 hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-neutral-100'
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** Segmented control: one sliding highlight behind the active option. The
 *  highlight measures the active button, so options may be any width. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'sm',
  accent = 'primary',
  label,
  className = '',
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  size?: 'xs' | 'sm';
  accent?: 'primary' | 'gold';
  label?: string;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const el = root.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
      if (el) setBox({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [value, options.length]);
  const h = size === 'xs' ? 'h-7' : 'h-8';
  const pad = size === 'xs' ? 'px-2.5 text-[11px]' : 'px-3 text-xs';
  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      className={`relative inline-flex ${h} shrink-0 items-stretch rounded-lg border border-white/[0.06] bg-black/30 p-0.5 ${className}`}
    >
      {box && (
        <span
          aria-hidden
          className={`absolute bottom-0.5 top-0.5 rounded-md transition-[left,width] duration-300 ${
            accent === 'gold'
              ? 'bg-gold shadow-[0_2px_10px_rgba(245,197,24,0.35)]'
              : 'bg-primary shadow-[0_2px_10px_rgba(47,107,255,0.4)]'
          }`}
          style={{ left: box.left, width: box.width, transitionTimingFunction: 'var(--ease-out-expo)' }}
        />
      )}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={o.disabled}
            title={o.title}
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`relative z-10 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-semibold transition-colors duration-200 disabled:opacity-40 ${pad} ${
              on ? (accent === 'gold' ? 'text-black' : 'text-white') : 'text-neutral-400 hover:text-neutral-100'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Labelled toggle switch. */
export function Switch({
  checked,
  onChange,
  label,
  title,
  className = '',
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <label title={title} className={`inline-flex cursor-pointer select-none items-center gap-2 text-xs font-medium text-neutral-300 ${className}`}>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" aria-hidden />
      {label}
    </label>
  );
}

/** Keyboard shortcut hint. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-white/10 bg-black/30 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-neutral-400">
      {children}
    </kbd>
  );
}

/* ------------------------------------------------------------------ */
/*  Data chips                                                         */
/* ------------------------------------------------------------------ */

/** Tier for an overall: 0 fringe … 4 elite. Shared by chips, cards and the board. */
export function ovrTier(ovr: number): 0 | 1 | 2 | 3 | 4 {
  return ovr >= 90 ? 4 : ovr >= 80 ? 3 : ovr >= 70 ? 2 : ovr >= 60 ? 1 : 0;
}
const TIER_CHIP = [
  'bg-neutral-800 text-neutral-300 ring-1 ring-white/[0.06]',
  'bg-slate-700 text-white ring-1 ring-white/[0.08]',
  'bg-gradient-to-b from-primary-light to-primary text-white shadow-[0_2px_8px_rgba(47,107,255,0.4)]',
  'bg-gradient-to-b from-success-light to-success text-black shadow-[0_2px_8px_rgba(34,197,94,0.35)]',
  'bg-gradient-to-b from-gold-light to-gold text-black shadow-[0_2px_10px_rgba(245,197,24,0.45)]',
];

/** OVR chip — color encodes tier (gold elite … gray fringe), mirroring wAV. */
export function RatingChip({ ovr, size = 'md', hidden = false, animate = false }: { ovr: number; size?: 'sm' | 'md' | 'lg' | 'xl'; hidden?: boolean; animate?: boolean }) {
  const dim =
    size === 'xl'
      ? 'h-12 w-14 text-xl rounded-xl'
      : size === 'lg'
        ? 'h-9 w-11 text-base rounded-lg'
        : size === 'sm'
          ? 'h-6 w-8 text-xs rounded-md'
          : 'h-7 w-9 text-sm rounded-md';
  // Same footprint as a real chip, so revealing a class does not reflow the board.
  if (hidden)
    return (
      <span
        className={`inline-flex items-center justify-center border border-dashed border-white/15 bg-white/[0.03] font-bold text-neutral-500 ${dim}`}
        title="Hidden — turn on Spoilers to reveal"
      >
        ?
      </span>
    );
  return (
    <span className={`inline-flex items-center justify-center font-display font-extrabold tabular-nums ${dim} ${TIER_CHIP[ovrTier(ovr)]} ${animate ? 'animate-flip' : ''}`}>
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

export const DEV_LABELS = ['Normal', 'Star', 'Superstar', 'X-Factor'];
const DEV_TINT = ['text-amber-700', 'text-slate-300', 'text-gold', 'text-red-400'];

export function DevBadge({ dev, hidden = false, size = 'sm' }: { dev: number; hidden?: boolean; size?: 'sm' | 'lg' }) {
  const dim = size === 'lg' ? 'h-10 w-10' : 'h-6 w-6';
  const name = hidden ? 'hidden' : DEV_ART_NAME[dev] ?? DEV_ART_NAME[0];
  const label = hidden ? 'Hidden — turn on Spoilers to reveal' : `${DEV_LABELS[dev] ?? DEV_LABELS[0]} development`;
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
      className={`${dim} shrink-0 object-contain ${hidden ? 'opacity-60' : ''}`}
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
export function Portrait({
  src,
  fallback,
  size = 'md',
  className = '',
}: {
  src?: string | null;
  fallback?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'fill';
  className?: string;
}) {
  const chain = [src, fallback].filter((u, i, a): u is string => !!u && a.indexOf(u) === i);
  const [broken, setBroken] = useState(0);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setBroken(0); setLoaded(false); }, [src, fallback]);
  const dim =
    size === 'fill'
      ? 'h-full w-full'
      : size === 'xs'
        ? 'h-7 w-7'
        : size === 'xl'
          ? 'h-28 w-28'
          : size === 'lg'
            ? 'h-20 w-20'
            : size === 'sm'
              ? 'h-8 w-8'
              : 'h-10 w-10';
  const radius = size === 'fill' ? '' : size === 'xl' || size === 'lg' ? 'rounded-xl' : 'rounded-md';
  const url = chain[broken];
  if (url) {
    return (
      <img
        key={url}
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setBroken((b) => b + 1)}
        className={`${dim} ${radius} shrink-0 bg-surface-2 object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'} ${size === 'fill' ? '' : 'ring-1 ring-white/[0.08]'} ${className}`}
      />
    );
  }
  return (
    <span className={`${dim} ${radius} grid shrink-0 place-items-center bg-surface-2 text-neutral-600 ${size === 'fill' ? '' : 'ring-1 ring-white/[0.08]'} ${className}`}>
      <svg viewBox="0 0 24 24" className="h-1/2 w-1/2" fill="currentColor" aria-hidden>
        <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-5 0-9 2.5-9 6v2h18v-2c0-3.5-4-6-9-6Z" />
      </svg>
    </span>
  );
}

/** Drafting-team mark: ESPN logo when available, else a neutral abbreviation
 *  chip (historical/relocated teams, or a missing logo). */
export function TeamLogo({ team, size = 'md' }: { team?: TeamInfo; size?: 'sm' | 'md' | 'lg' }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [team?.logo]);
  const dim = size === 'sm' ? 'h-5 w-5' : size === 'lg' ? 'h-9 w-9' : 'h-6 w-6';
  if (!team) return <span className="text-xs text-muted">—</span>;
  if (team.logo && !broken) {
    return (
      <img
        src={team.logo}
        alt={team.name}
        title={team.name}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className={`${dim} shrink-0 object-contain`}
      />
    );
  }
  return (
    <span
      title={team.name}
      className="inline-flex items-center rounded bg-white/[0.05] px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-neutral-400 ring-1 ring-white/[0.08]"
    >
      {team.abbr}
    </span>
  );
}

/** Small labelled status pill (cache / live / mode). */
export function Pill({
  children,
  tone = 'neutral',
  dot = false,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'primary' | 'legend' | 'success' | 'gold' | 'warning';
  dot?: boolean;
}) {
  const tones = {
    neutral: 'bg-white/[0.04] text-neutral-400 ring-white/[0.08]',
    primary: 'bg-primary/15 text-primary-light ring-primary/30',
    legend: 'bg-legend/15 text-legend-light ring-legend/40',
    success: 'bg-success/15 text-success-light ring-success/30',
    gold: 'bg-gold/15 text-gold ring-gold/30',
    warning: 'bg-warning/15 text-warning ring-warning/30',
  }[tone];
  const dotCls = {
    neutral: 'bg-neutral-400',
    primary: 'bg-primary-light',
    legend: 'bg-legend-light',
    success: 'bg-success',
    gold: 'bg-gold',
    warning: 'bg-warning',
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${tones}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dotCls}`} />}
      {children}
    </span>
  );
}

/** Section eyebrow: small caps label used above groups of controls. */
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`text-[11px] font-bold uppercase tracking-[0.12em] text-muted ${className}`}>{children}</div>;
}

/* ------------------------------------------------------------------ */
/*  Icons (currentColor, 1.75 stroke)                                  */
/* ------------------------------------------------------------------ */
export function Icon({ path, className = 'h-4 w-4', fill = false, strokeWidth = 1.75 }: { path: string; className?: string; fill?: boolean; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth}
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
  check: 'M5 12l5 5L20 7',
  chevronDown: 'M6 9l6 6 6-6',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  shuffle:
    'M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22 M18 2l4 4-4 4 M2 6h1.9c1.5 0 2.9.9 3.6 2.2 M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8 M18 14l4 4-4 4',
  undo: 'M9 14 4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11',
  warning: 'M21.73 18l-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z M12 9v4 M12 17h.01',
  board: 'M5 8l7 4 7-4M5 13l7 4 7-4',
  plus: 'M12 5v14M5 12h14',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  table: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  columns: 'M4 4h16v16H4zM9 4v16M15 4v16',
  kanban: 'M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  eyeOff: 'M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.2A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.5 17.5 0 0 1-3.2 4.1M6.6 6.6C3.9 8.5 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1',
  sparkles: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM5 19l.7 1.8L7.5 21.5l-1.8.7L5 24l-.7-1.8L2.5 21.5l1.8-.7L5 19ZM19 15l.6 1.4 1.4.6-1.4.6L19 19l-.6-1.4-1.4-.6 1.4-.6L19 15Z',
  sliders: 'M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0M14 4v4M6 10v4M16 16v4',
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  users: 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21a8 8 0 0 1 16 0',
  shield: 'M12 3l7 3v5c0 4.2-3 7.4-7 8.5-4-1.1-7-4.3-7-8.5V6l7-3z',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
  star: 'M12 2l3 6.5 7 .8-5.2 4.8 1.4 7L12 17.5 5.8 21l1.4-7L2 9.3l7-.8L12 2z',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  filter: 'M3 5h18l-7 8v6l-4 2v-8L3 5z',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  maximize: 'M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3',
  layers: 'M12 2l10 5-10 5L2 7l10-5zM2 12l10 5 10-5M2 17l10 5 10-5',
  desk: 'M3 5h18v14H3zM14 5v14M6 9h5M6 12h5M6 15h3',
  idCard: 'M3 6h18v12H3zM6 10h4v4H6zM13 10h5M13 14h3',
  wall: 'M3 5h18M3 12h18M3 19h18M8 5v7M16 12v7M3 5v14M21 5v14',
};
