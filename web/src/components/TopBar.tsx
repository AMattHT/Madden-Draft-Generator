import type { GenMode, AppView } from '../App';
import type { GameVersion } from '../types';
import { YearPicker } from './YearPicker';
import { PlayerSearch } from './PlayerSearch';
import { Icon, ICONS } from './ui';

function GameToggle({ gameVersion, onSetGameVersion }: { gameVersion: GameVersion; onSetGameVersion: (v: GameVersion) => void }) {
  const opts: [GameVersion, string, string][] = [
    ['m26', 'M26', 'Build classes for Madden 26 (4296-byte format)'],
    ['m27', 'M27', 'Build classes for Madden 27 (5876-byte format + persona DNA)'],
  ];
  return (
    <div className="flex items-center rounded-lg border border-border-strong bg-surface-2 p-0.5 text-xs font-medium" title="Target game for generated classes">
      {opts.map(([val, label, title]) => (
        <button
          key={val}
          onClick={() => onSetGameVersion(val)}
          aria-pressed={gameVersion === val}
          title={title}
          className={`rounded-md px-3 py-1.5 transition-colors ${
            gameVersion === val ? 'bg-gold text-black shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ViewToggle({ view, onSetView }: { view: AppView; onSetView: (v: AppView) => void }) {
  const opts: [AppView, string][] = [['draft', 'Draft'], ['franchise', 'Franchise']];
  return (
    <div className="flex items-center rounded-lg border border-border-strong bg-surface-2 p-0.5 text-xs font-medium">
      {opts.map(([val, label]) => (
        <button
          key={val}
          onClick={() => onSetView(val)}
          aria-pressed={view === val}
          className={`rounded-md px-3 py-1.5 transition-colors ${
            view === val ? 'bg-primary text-white shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

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
  view,
  onSetView,
  onGoHome,
  onDrawRandom,
  canDraw,
  mode,
  onSetMode,
  gameVersion,
  onSetGameVersion,
  showLeague,
  league,
  onSetLeague,
  connected,
  years,
  selected,
  onSelectYear,
  onSelectPlayer,
  cachedYears,
  recentYears = [],
}: {
  view: AppView;
  onSetView: (v: AppView) => void;
  onGoHome: () => void;
  onDrawRandom: () => void;
  canDraw: boolean;
  mode: GenMode;
  onSetMode: (m: GenMode) => void;
  gameVersion: GameVersion;
  onSetGameVersion: (v: GameVersion) => void;
  showLeague: boolean;
  league: string;
  onSetLeague: (l: string) => void;
  connected: boolean;
  years: number[];
  selected: number | null;
  onSelectYear: (y: number) => void;
  onSelectPlayer: (year: number, focusName: string) => void;
  cachedYears: Set<number>;
  recentYears?: number[];
}) {
  const draft = view === 'draft';
  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface-1/80 px-4 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <button onClick={onGoHome} title="Home" className="flex items-center gap-3 rounded-lg transition-opacity hover:opacity-80">
          <LogoMark />
          <div className="hidden leading-tight text-left sm:block">
            <div className="text-[13px] font-bold tracking-tight text-neutral-100">Madden Draft Toolkit</div>
            <div className="text-[11px] text-muted">Draft classes · Franchise tools</div>
          </div>
        </button>
        <div className="ml-1 h-6 w-px bg-border" />
        <ViewToggle view={view} onSetView={onSetView} />
        {draft && (
          <>
            <YearPicker years={years} selected={selected} onSelect={onSelectYear} cached={cachedYears} recent={recentYears} />
            <button
              onClick={onDrawRandom}
              disabled={!canDraw}
              title={canDraw ? 'Draw a random unused draft year' : 'All years used — reset history in the Franchise tab'}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border-strong bg-surface-2 text-neutral-300 transition-colors hover:bg-surface-3 hover:text-neutral-100 disabled:opacity-40"
            >
              <Icon path={ICONS.shuffle} className="h-4 w-4" />
            </button>
            <PlayerSearch onSelect={onSelectPlayer} />
          </>
        )}
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-2 text-[11px] text-muted sm:flex">
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-success shadow-[0_0_6px_rgba(34,197,94,0.6)]' : 'bg-danger'}`} />
          {connected ? 'Backend connected' : 'Backend offline'}
        </div>
        <div className="hidden h-6 w-px bg-border sm:block" />
        {draft && <GameToggle gameVersion={gameVersion} onSetGameVersion={onSetGameVersion} />}
        {draft && showLeague && (
          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] uppercase tracking-wider text-neutral-500 md:inline">League</span>
            <LeagueToggle league={league} onSetLeague={onSetLeague} />
          </div>
        )}
        {draft && (
          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] uppercase tracking-wider text-neutral-500 md:inline">Rating lens</span>
            <ModeToggle mode={mode} onSetMode={onSetMode} />
          </div>
        )}
      </div>
    </header>
  );
}
