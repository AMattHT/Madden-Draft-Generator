import { useState } from 'react';
import type { GenMode, AppView } from '../App';
import type { GameVersion } from '../types';
import { NAME, TAGLINE, gameLabel, productTitle } from '../brand';
import { YearPicker } from './YearPicker';
import { PlayerSearch } from './PlayerSearch';
import { Icon, ICONS, IconButton, Segmented } from './ui';

function GameToggle({ gameVersion, onSetGameVersion, pinned }: { gameVersion: GameVersion; onSetGameVersion: (v: GameVersion) => void; pinned: GameVersion | null }) {
  // A per-game build is locked to its game: show which, don't offer a switch.
  if (pinned) {
    return (
      <span
        className="inline-flex h-8 items-center rounded-lg border border-gold/35 bg-gold/10 px-3 text-xs font-bold tracking-wide text-gold"
        title={`This app builds classes for ${gameLabel(pinned)}`}
      >
        {gameLabel(pinned)}
      </span>
    );
  }
  return (
    <Segmented
      accent="gold"
      label="Target game"
      value={gameVersion}
      onChange={onSetGameVersion}
      options={[
        { value: 'm26', label: 'M26', title: 'Build classes for Madden 26 (4296-byte format)' },
        { value: 'm27', label: 'M27', title: 'Build classes for Madden 27 (5876-byte format + persona DNA)' },
      ]}
    />
  );
}

/** The product mark: the generated badge when it ships, else a drawn stand-in. */
export function LogoMark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const [noArt, setNoArt] = useState(false);
  const dim = size === 'lg' ? 'h-16 w-16 rounded-2xl' : size === 'sm' ? 'h-7 w-7 rounded-lg' : 'h-9 w-9 rounded-xl';
  if (!noArt)
    return (
      <img
        src="/art/logo.webp"
        alt=""
        onError={() => setNoArt(true)}
        className={`${dim} shrink-0 object-cover shadow-[0_2px_14px_rgba(47,107,255,0.45)]`}
      />
    );
  return (
    <span className={`relative grid ${dim} shrink-0 place-items-center bg-gradient-to-br from-primary to-primary-dark shadow-[0_2px_14px_rgba(47,107,255,0.45)]`}>
      <svg viewBox="0 0 24 24" className={size === 'lg' ? 'h-9 w-9' : 'h-5 w-5'} fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 8l7 4 7-4M5 13l7 4 7-4" />
      </svg>
    </span>
  );
}

const LENS: { value: GenMode; label: string; title: string }[] = [
  { value: 'launch', label: 'Launch', title: "EA's launch-day rookie ratings wherever that Madden edition's launch roster exists (most classes since 2001); everyone else as Realistic" },
  { value: 'madden', label: 'Realistic', title: 'Match a real Madden class: realistic rookies, capped at 84' },
  { value: 'retro', label: 'Career', title: 'Career lens: rated by how good they actually turned out (uncapped)' },
];

const LEAGUES: { value: string; label: string }[] = [
  { value: 'combined', label: 'AFL + NFL' },
  { value: 'NFL', label: 'NFL' },
  { value: 'AFL', label: 'AFL' },
];

export function TopBar({
  view,
  onGoHome,
  onDrawRandom,
  canDraw,
  mode,
  onSetMode,
  gameVersion,
  onSetGameVersion,
  pinnedGame,
  franchiseEnabled,
  showLeague,
  league,
  onSetLeague,
  connected,
  busy = false,
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
  pinnedGame: GameVersion | null;
  franchiseEnabled: boolean;
  showLeague: boolean;
  league: string;
  onSetLeague: (l: string) => void;
  connected: boolean;
  /** A class is being pulled: a thin progress bar runs under the bar. */
  busy?: boolean;
  years: number[];
  selected: number | null;
  onSelectYear: (y: number) => void;
  onSelectPlayer: (year: number, focusName: string) => void;
  cachedYears: Set<number>;
  recentYears?: number[];
}) {
  const draft = view === 'draft';
  return (
    <header className="relative z-30 shrink-0">
      <div className="flex h-[58px] items-center justify-between gap-4 border-b border-white/[0.05] bg-surface-1/70 px-4 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={onGoHome} title="Home" className="press flex items-center gap-3 rounded-xl pr-1 transition-opacity hover:opacity-85">
            <LogoMark />
            <div className="hidden text-left leading-tight sm:block">
              <div className="font-display text-[13.5px] font-bold text-neutral-50">{productTitle(pinnedGame)}</div>
              <div className="text-[10.5px] font-medium tracking-wide text-muted">{franchiseEnabled ? TAGLINE : 'Draft classes · Rosters'}</div>
            </div>
          </button>
          {draft && (
            <>
              <span className="mx-1 hidden h-6 w-px bg-white/[0.07] md:block" />
              <YearPicker years={years} selected={selected} onSelect={onSelectYear} cached={cachedYears} recent={recentYears} />
              <IconButton
                label="Draw a random year"
                onClick={onDrawRandom}
                disabled={!canDraw}
                title={canDraw ? 'Draw a random unused draft year' : franchiseEnabled ? 'All years used — reset history in the Franchise tab' : 'All draft years drawn'}
              >
                <Icon path={ICONS.shuffle} className="h-4 w-4" />
              </IconButton>
              <PlayerSearch onSelect={onSelectPlayer} />
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 text-[11px] font-medium text-muted sm:flex" title={connected ? 'The local backend is answering' : 'The local backend is not answering'}>
            <span className={`relative flex h-2 w-2 ${connected ? '' : 'opacity-90'}`}>
              {connected && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" style={{ animationDuration: '2.4s' }} />}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${connected ? 'bg-success' : 'bg-danger'}`} />
            </span>
            <span className="hidden lg:inline">{connected ? 'Connected' : 'Offline'}</span>
          </div>
          {draft && <span className="hidden h-6 w-px bg-white/[0.07] sm:block" />}
          {draft && <GameToggle gameVersion={gameVersion} onSetGameVersion={onSetGameVersion} pinned={pinnedGame} />}
          {draft && showLeague && <Segmented label="League" value={league} onChange={onSetLeague} options={LEAGUES} />}
          {draft && (
            <Segmented label="Rating lens" value={mode} onChange={onSetMode} options={LENS} />
          )}
        </div>
      </div>
      {/* Loading indicator: a thin sweep along the bar's bottom edge while a class pulls. */}
      <div className={`absolute inset-x-0 bottom-0 transition-opacity duration-300 ${busy ? 'opacity-100' : 'pointer-events-none opacity-0'}`} aria-hidden={!busy}>
        <div className="progress-bar" />
      </div>
    </header>
  );
}

export { NAME as PRODUCT_NAME };
