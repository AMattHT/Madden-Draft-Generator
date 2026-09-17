import type { AppView } from '../App';
import { NAME } from '../brand';
import { Icon, ICONS } from './ui';

function ModePanel({
  accent,
  icon,
  title,
  tagline,
  features,
  onClick,
  index,
}: {
  accent: 'blue' | 'gold';
  icon: string;
  title: string;
  tagline: string;
  features: string[];
  onClick: () => void;
  index: number;
}) {
  // Two committed accents so the panels read as distinct doors, not a card grid.
  const a =
    accent === 'blue'
      ? {
          ring: 'hover:border-primary/60 focus-visible:border-primary/70',
          glow: 'hover:shadow-[0_0_0_1px_rgba(47,107,255,0.25),0_30px_60px_-24px_rgba(47,107,255,0.55)]',
          chip: 'bg-primary/15 text-primary-light ring-1 ring-primary/30',
          dot: 'bg-primary-light',
          cta: 'text-primary-light',
          beam: 'from-primary/25',
        }
      : {
          ring: 'hover:border-gold/60 focus-visible:border-gold/70',
          glow: 'hover:shadow-[0_0_0_1px_rgba(245,197,24,0.22),0_30px_60px_-24px_rgba(245,197,24,0.45)]',
          chip: 'bg-gold/15 text-gold ring-1 ring-gold/30',
          dot: 'bg-gold',
          cta: 'text-gold',
          beam: 'from-gold/20',
        };

  return (
    <button
      onClick={onClick}
      style={{ ['--i' as string]: index + 2 }}
      className={`glass group relative flex flex-col overflow-hidden rounded-2xl p-7 text-left transition-all duration-300 ease-out hover:-translate-y-1 motion-reduce:transform-none motion-reduce:transition-colors ${a.ring} ${a.glow}`}
    >
      {/* A soft beam that brightens on hover, top-left to nowhere. */}
      <span aria-hidden className={`pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br ${a.beam} to-transparent opacity-40 blur-2xl transition-opacity duration-500 group-hover:opacity-90`} />
      <span className={`relative grid h-12 w-12 place-items-center rounded-xl ${a.chip}`}>
        <Icon path={icon} className="h-6 w-6" strokeWidth={2} />
      </span>

      <h2 className="relative mt-5 font-display text-xl font-bold text-neutral-50">{title}</h2>
      <p className="relative mt-1.5 text-sm leading-relaxed text-muted">{tagline}</p>

      <ul className="relative mt-5 flex flex-col gap-2 text-sm text-neutral-300">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${a.dot}`} />
            {f}
          </li>
        ))}
      </ul>

      <span className={`relative mt-auto inline-flex items-center gap-1.5 pt-7 text-sm font-semibold ${a.cta}`}>
        Open
        <Icon path={ICONS.arrowRight} className="h-4 w-4 transition-transform duration-300 ease-out group-hover:translate-x-1 motion-reduce:transform-none" strokeWidth={2.2} />
      </span>
    </button>
  );
}

export function HomePage({ onSelect, franchiseEnabled, title = `Madden ${NAME}` }: { onSelect: (v: AppView) => void; franchiseEnabled: boolean; title?: string }) {
  return (
    <div className="relative h-full overflow-auto">
      {/* Hero art: the generated stadium plate, faded into the shell at the bottom. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px] overflow-hidden">
        <img src="/art/hero.jpg" alt="" className="h-full w-full object-cover object-top opacity-70" style={{ animation: 'fade-in 1.2s ease-out both' }} />
        <div className="absolute inset-0 bg-gradient-to-b from-surface-0/20 via-surface-0/55 to-surface-0" />
        <div className="absolute inset-0 grain" />
      </div>

      <div className={`stagger relative mx-auto flex min-h-full w-full flex-col justify-center px-8 py-12 ${franchiseEnabled ? 'max-w-6xl' : 'max-w-5xl'}`}>
        <div className="max-w-2xl" style={{ ['--i' as string]: 0 }}>
          <h1 className="font-display text-4xl font-extrabold leading-[1.05] text-neutral-50 sm:text-5xl" style={{ textWrap: 'balance' }}>
            {title}
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-neutral-300" style={{ ['--i' as string]: 1 }}>
            {franchiseEnabled
              ? 'Generate historically-rated draft classes, build a custom roster, or run tools for your franchise. Choose where to start.'
              : 'Generate historically-rated draft classes or build a custom roster. Choose where to start.'}
          </p>
        </div>

        <div className={`mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 ${franchiseEnabled ? 'xl:grid-cols-3' : ''}`}>
          <ModePanel
            index={0}
            accent="blue"
            icon={ICONS.board}
            title="Draft Classes"
            tagline="Build importable draft classes from real NFL history."
            features={[
              'Every draft 1936–2026, rated from career wAV',
              'Per-player editor: ratings, positions, portraits, gear',
              'Table, card and draft-board views',
              'Save straight into Madden',
            ]}
            onClick={() => onSelect('draft')}
          />
          <ModePanel
            index={1}
            accent="blue"
            icon={ICONS.users}
            title="Rosters"
            tagline="Build a custom Madden 27 roster from any ROSTER save."
            features={[
              'Move, cut and sign players across all 32 teams',
              'Edit ratings, positions, dev traits and gear',
              'Exports a new ROSTER file; the base is never touched',
            ]}
            onClick={() => onSelect('rosters')}
          />
          {franchiseEnabled && (
            <ModePanel
              index={2}
              accent="gold"
              icon={ICONS.shield}
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
          )}
        </div>
      </div>
    </div>
  );
}
