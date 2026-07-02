import type { GenMode } from '../App';
import { YearPicker } from './YearPicker';
import { PlayerSearch } from './PlayerSearch';

function LogoMark() {
  return (
    <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary-dark shadow-[0_2px_10px_rgba(47,107,255,0.4)]">
      {/* Draft-board chevrons: a ranked stack. */}
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 8l7 4 7-4M5 13l7 4 7-4" />
      </svg>
    </span>
  );
}

function ModeToggle({ mode, onSetMode }: { mode: GenMode; onSetMode: (m: GenMode) => void }) {
  return (
    <div className="flex items-center rounded-lg border border-border-strong bg-surface-2 p-0.5 text-xs font-medium">
      <button
        onClick={() => onSetMode('madden')}
        aria-pressed={mode === 'madden'}
        title="Match a real Madden class — realistic rookies, capped at 84"
        className={`rounded-md px-3 py-1.5 transition-colors ${
          mode === 'madden' ? 'bg-primary text-white shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
        }`}
      >
        Realistic
      </button>
      <button
        onClick={() => onSetMode('retro')}
        aria-pressed={mode === 'retro'}
        title="Career-retrospective — rated by how good they actually turned out (uncapped)"
        className={`rounded-md px-3 py-1.5 transition-colors ${
          mode === 'retro' ? 'bg-legend text-white shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
        }`}
      >
        Career
      </button>
    </div>
  );
}

// Merge-era (1960–69) league selector: AFL+NFL combined, or a single league.
function LeagueToggle({ league, onSetLeague }: { league: string; onSetLeague: (l: string) => void }) {
  const opts: [string, string][] = [
    ['combined', 'AFL + NFL'],
    ['NFL', 'NFL'],
    ['AFL', 'AFL'],
  ];
  return (
    <div className="flex items-center rounded-lg border border-border-strong bg-surface-2 p-0.5 text-xs font-medium">
      {opts.map(([val, label]) => (
        <button
          key={val}
          onClick={() => onSetLeague(val)}
          aria-pressed={league === val}
          title={`Show the ${label} draft class for this year`}
          className={`rounded-md px-3 py-1.5 transition-colors ${
            league === val ? 'bg-primary text-white shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function TopBar({
  mode,
  onSetMode,
  showLeague,
  league,
  onSetLeague,
  connected,
  years,
  selected,
  onSelectYear,
  onSelectPlayer,
  cachedYears,
}: {
  mode: GenMode;
  onSetMode: (m: GenMode) => void;
  showLeague: boolean;
  league: string;
  onSetLeague: (l: string) => void;
  connected: boolean;
  years: number[];
  selected: number | null;
  onSelectYear: (y: number) => void;
  onSelectPlayer: (year: number, focusName: string) => void;
  cachedYears: Set<number>;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface-1/80 px-4 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <LogoMark />
        <div className="hidden leading-tight sm:block">
          <div className="text-[13px] font-bold tracking-tight text-neutral-100">Draft Class Generator</div>
          <div className="text-[11px] text-muted">Madden 26 · wAV-rated from real NFL history</div>
        </div>
        <div className="ml-1 h-6 w-px bg-border" />
        <YearPicker years={years} selected={selected} onSelect={onSelectYear} cached={cachedYears} />
        <PlayerSearch onSelect={onSelectPlayer} />
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-2 text-[11px] text-muted sm:flex">
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-success shadow-[0_0_6px_rgba(34,197,94,0.6)]' : 'bg-danger'}`} />
          {connected ? 'Backend connected' : 'Backend offline'}
        </div>
        <div className="hidden h-6 w-px bg-border sm:block" />
        {showLeague && (
          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] uppercase tracking-wider text-neutral-600 md:inline">League</span>
            <LeagueToggle league={league} onSetLeague={onSetLeague} />
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] uppercase tracking-wider text-neutral-600 md:inline">Rating lens</span>
          <ModeToggle mode={mode} onSetMode={onSetMode} />
        </div>
      </div>
    </header>
  );
}
