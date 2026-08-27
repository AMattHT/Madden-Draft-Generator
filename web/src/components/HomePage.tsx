import type { AppView } from '../App';

const DRAFT_ICON = 'M5 8l7 4 7-4M5 13l7 4 7-4';
const FRANCHISE_ICON = 'M12 3l7 3v5c0 4.2-3 7.4-7 8.5-4-1.1-7-4.3-7-8.5V6l7-3z';
const ARROW = 'M5 12h14M13 6l6 6-6 6';

function ModePanel({
  accent,
  icon,
  title,
  tagline,
  features,
  onClick,
}: {
  accent: 'blue' | 'gold';
  icon: string;
  title: string;
  tagline: string;
  features: string[];
  onClick: () => void;
}) {
  // Two committed accents so the panels read as distinct doors, not a card grid.
  const a =
    accent === 'blue'
      ? {
          ring: 'hover:border-primary/70 focus-visible:border-primary/70',
          glow: 'hover:shadow-[0_0_0_1px_rgba(47,107,255,0.25),0_20px_50px_-20px_rgba(47,107,255,0.45)]',
          chip: 'bg-primary/15 text-primary ring-1 ring-primary/25',
          dot: 'bg-primary',
          cta: 'text-primary',
        }
      : {
          ring: 'hover:border-gold/70 focus-visible:border-gold/70',
          glow: 'hover:shadow-[0_0_0_1px_rgba(245,197,24,0.22),0_20px_50px_-20px_rgba(245,197,24,0.4)]',
          chip: 'bg-gold/15 text-gold ring-1 ring-gold/25',
          dot: 'bg-gold',
          cta: 'text-gold',
        };

  return (
    <button
      onClick={onClick}
      className={`group flex flex-col rounded-2xl border border-border bg-surface-1 p-7 text-left transition-all duration-300 ease-out hover:-translate-y-1 hover:bg-surface-2 motion-reduce:transform-none motion-reduce:transition-colors ${a.ring} ${a.glow}`}
    >
      <span className={`grid h-12 w-12 place-items-center rounded-xl ${a.chip}`}>
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={icon} />
        </svg>
      </span>

      <h2 className="mt-5 text-xl font-bold tracking-tight text-neutral-50">{title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{tagline}</p>

      <ul className="mt-5 flex flex-col gap-2 text-sm text-neutral-300">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${a.dot}`} />
            {f}
          </li>
        ))}
      </ul>

      <span className={`mt-auto inline-flex items-center gap-1.5 pt-7 text-sm font-semibold ${a.cta}`}>
        Open
        <svg viewBox="0 0 24 24" className="h-4 w-4 transition-transform duration-300 ease-out group-hover:translate-x-1 motion-reduce:transform-none" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={ARROW} />
        </svg>
      </span>
    </button>
  );
}

export function HomePage({ onSelect, title = 'Madden Draft Toolkit' }: { onSelect: (v: AppView) => void; title?: string }) {
  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col justify-center px-6 py-10">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-50 sm:text-4xl" style={{ textWrap: 'balance' }}>
          {title}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Generate historically-rated draft classes, or run cap and draft tools for your franchise. Choose where to start.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        <ModePanel
          accent="blue"
          icon={DRAFT_ICON}
          title="Draft Class Generator"
          tagline="Build importable draft classes from real NFL history."
          features={[
            'Every draft 1936–2026, rated from career wAV',
            'Per-player editor: ratings, positions, portraits, gear',
            'Random no-repeat year picker',
            'Export an importable .mdc',
          ]}
          onClick={() => onSelect('draft')}
        />
        <ModePanel
          accent="gold"
          icon={FRANCHISE_ICON}
          title="Franchise Tools"
          tagline="Reset the cap and feed your franchise fresh draft classes."
          features={[
            'Salary-cap reset: clear dead money, open cap room',
            'No-repeat random draft picker with year range',
            'Reads your CAREER save directly',
            'Always writes a safe new file — original untouched',
          ]}
          onClick={() => onSelect('franchise')}
        />
      </div>
    </div>
  );
}
