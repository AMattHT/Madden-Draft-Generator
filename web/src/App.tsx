import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type ArchetypeOption } from './api';
import { cache } from './cache';
import { ClassView } from './components/ClassView';
import { FranchiseView } from './components/franchise/FranchiseView';
import { HomePage } from './components/HomePage';
import { TopBar } from './components/TopBar';
import { Icon, ICONS } from './components/ui';
import type { ClassEdits, GearEdits, GeneratedClass, GameVersion } from './types';

export type AppView = 'home' | 'draft' | 'franchise';

/** Draft-class generation modifiers (custom classes). */
export interface DraftOpts {
  source: 'year' | 'alltime' | 'decade';
  decade: number; // used when source === 'decade' (e.g. 1990)
  strength: number; // OVR curve multiplier (1 = normal)
  studs: number; // guaranteed first-round-caliber prospects
  generational: boolean; // force a can't-miss #1
  hindsight: number; // 0 = draft-day board (by slot), 1 = career outcome
  autoStrength: boolean; // scale the curve by how good the class really was
}
export const DEFAULT_DRAFT_OPTS: DraftOpts = { source: 'year', decade: 2010, strength: 1, studs: 0, generational: false, hindsight: 1, autoStrength: false };
export const isCustomDraft = (o: DraftOpts) =>
  o.source !== 'year' || o.strength !== 1 || o.studs !== 0 || o.generational || (o.hindsight ?? 1) !== 1 || !!o.autoStrength;

const isMergeEra = (y: number) => y >= 1960 && y <= 1966; // 1967-69: one common draft
const leagueFor = (y: number) => (isMergeEra(y) ? 'combined' : 'NFL');
export type GenMode = 'madden' | 'retro';

export default function App() {
  const [years, setYears] = useState<number[]>([]);
  const [cachedYears, setCachedYears] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const [data, setData] = useState<GeneratedClass | null>(null);
  const [edits, setEdits] = useState<ClassEdits>({});
  const [gearEdits, setGearEdits] = useState<GearEdits>({});
  const [source, setSource] = useState<'cache' | 'live'>('live');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archetypeOptions, setArchetypeOptions] = useState<Record<string, ArchetypeOption[]>>({});
  const [mode, setMode] = useState<GenMode>('madden');
  const [gameVersion, setGameVersion] = useState<GameVersion>('m27');
  const [view, setView] = useState<AppView>('home');
  const [usedYears, setUsedYears] = useState<Set<number>>(new Set());
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [lastDrawn, setLastDrawn] = useState<number | null>(null);
  const [focusPlayer, setFocusPlayer] = useState<string | null>(null);
  const [recentYears, setRecentYears] = useState<number[]>([]);
  // For merge-era (1960–69) years the user can pick AFL+NFL / NFL / AFL; null = default.
  const [leagueOverride, setLeagueOverride] = useState<string | null>(null);
  const [draftOpts, setDraftOpts] = useState<DraftOpts>(DEFAULT_DRAFT_OPTS);
  const reqRef = useRef(0); // guards against a slow earlier response clobbering a newer selection

  const effLeague = useCallback(
    (y: number) => (isMergeEra(y) && leagueOverride ? leagueOverride : leagueFor(y)),
    [leagueOverride]
  );

  const select = useCallback(
    async (year: number, force = false, useMode: GenMode = mode, useLeague?: string, useOpts?: DraftOpts, useVersion: GameVersion = gameVersion) => {
      const opts = useOpts ?? draftOpts;
      const custom = isCustomDraft(opts);
      // Greats classes key their edits/cache under a fixed pseudo-year / decade label.
      const league = opts.source === 'alltime' ? 'all-time' : opts.source === 'decade' ? `${opts.decade}s` : useLeague ?? effLeague(year);
      const ekYear = opts.source === 'alltime' ? 0 : opts.source === 'decade' ? opts.decade : year;
      // M27 classes are cached under a versioned key so M26/M27 views never collide.
      const cacheMode = useVersion === 'm27' ? `${useMode}-m27` : useMode;
      const req = ++reqRef.current;
      setSelected(year);
      setError(null);
      setBusy(true);
      // Track recently viewed real years for the year picker's "Recent" row.
      if (year > 0 && opts.source === 'year') {
        setRecentYears((prev) => {
          const next = [year, ...prev.filter((y) => y !== year)].slice(0, 8);
          cache.recentYearsSet(next);
          return next;
        });
      }
      try {
        if (custom) {
          // Custom classes aren't year-cached — always generated fresh.
          const live = await api.generatedCustom({
            source: opts.source, year, decade: opts.decade,
            league: opts.source === 'year' ? league : undefined,
            mode: useMode, strength: opts.strength, studs: opts.studs, generational: opts.generational,
            hindsight: opts.hindsight, autoStrength: opts.autoStrength,
            gameVersion: useVersion,
          });
          if (req !== reqRef.current) return;
          live.fetchedAt = Date.now();
          live.gameVersion = useVersion;
          setData(live);
          setSource('live');
        } else {
          const cached = force ? undefined : await cache.get(year, league, cacheMode);
          if (req !== reqRef.current) return; // a newer selection superseded this one
          if (cached) {
            cached.gameVersion = useVersion;
            setData(cached);
            setSource('cache');
          } else {
            const live = await api.generated(year, league, useMode, useVersion);
            if (req !== reqRef.current) return;
            live.fetchedAt = Date.now();
            live.gameVersion = useVersion;
            await cache.set(live, cacheMode);
            setData(live);
            setSource('live');
            setCachedYears((prev) => new Set(prev).add(year));
          }
        }
        setEdits(await cache.editsGet(ekYear, league));
        setGearEdits(await cache.gearEditsGet(ekYear, league));
      } catch (e) {
        if (req !== reqRef.current) return;
        setError((e as Error).message);
        setData(null);
      } finally {
        if (req === reqRef.current) setBusy(false);
      }
    },
    [mode, effLeague, draftOpts, gameVersion]
  );

  const persistUsed = useCallback((next: Set<number>) => {
    setUsedYears(next);
    cache.usedYearsSet([...next]);
  }, []);

  // Apply draft-class generation options (source + modifiers) and regenerate.
  const applyDraftOpts = useCallback(
    (next: DraftOpts) => {
      setDraftOpts(next);
      setFocusPlayer(null);
      const year =
        next.source === 'alltime' ? 0
        : next.source === 'decade' ? next.decade
        : selected && selected > 0 ? selected : years.includes(2003) ? 2003 : years[years.length - 1] ?? 2003;
      select(year, true, mode, undefined, next);
    },
    [selected, years, mode, select]
  );

  const inRange = useCallback(
    (y: number) => !range || (y >= range.from && y <= range.to),
    [range]
  );

  const updateRange = useCallback(
    (from: number, to: number) => {
      if (!years.length) return;
      const lo = Math.min(...years);
      const hi = Math.max(...years);
      const f = Math.max(lo, Math.min(hi, from));
      const t = Math.max(f, Math.min(hi, to));
      const r = { from: f, to: t };
      setRange(r);
      cache.rangeSet(r);
    },
    [years]
  );

  // Draw a random unused draft year within the selected range, mark it used, and
  // jump to the draft view on that class (ready to export). No-repeat by construction.
  const drawRandomYear = useCallback(() => {
    const pool = years.filter((y) => !usedYears.has(y) && inRange(y));
    if (pool.length === 0) return;
    const year = pool[Math.floor(Math.random() * pool.length)];
    persistUsed(new Set(usedYears).add(year));
    setLastDrawn(year);
    setFocusPlayer(null);
    setView('draft');
    select(year);
  }, [years, usedYears, inRange, persistUsed, select]);

  // Undo the most recent draw — puts that year back in the pool.
  const undoLastDraw = useCallback(() => {
    const arr = [...usedYears];
    if (arr.length === 0) return;
    arr.pop();
    persistUsed(new Set(arr));
    setLastDrawn(null);
  }, [usedYears, persistUsed]);

  const toggleUsedYear = useCallback(
    (year: number) => {
      const next = new Set(usedYears);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      if (lastDrawn === year && !next.has(year)) setLastDrawn(null);
      persistUsed(next);
    },
    [usedYears, lastDrawn, persistUsed]
  );

  const clearUsedYears = useCallback(() => {
    setLastDrawn(null);
    persistUsed(new Set());
  }, [persistUsed]);

  const changeMode = useCallback(
    (m: GenMode) => {
      setMode(m);
      if (selected != null) select(selected, false, m);
    },
    [selected, select]
  );

  const changeGameVersion = useCallback(
    (v: GameVersion) => {
      setGameVersion(v);
      if (selected != null) select(selected, false, mode, undefined, undefined, v);
    },
    [selected, select, mode]
  );

  const changeLeague = useCallback(
    (lg: string) => {
      setLeagueOverride(lg);
      if (selected != null) select(selected, false, mode, lg);
    },
    [selected, select, mode]
  );

  const setEdit = useCallback(
    (id: number, fieldName: string, value: number | string) => {
      setEdits((prev) => {
        const next = { ...prev, [id]: { ...(prev[id] || {}), [fieldName]: value } };
        if (selected != null) cache.editsSet(selected, effLeague(selected), next);
        return next;
      });
    },
    [selected, effLeague]
  );

  const setGearEdit = useCallback(
    (id: number, slot: string, asset: string) => {
      setGearEdits((prev) => {
        const player = { ...(prev[id] || {}) };
        if (asset) player[slot] = asset;
        else delete player[slot]; // empty = revert to era default
        const next = { ...prev, [id]: player };
        if (!Object.keys(player).length) delete next[id];
        if (selected != null) cache.gearEditsSet(selected, effLeague(selected), next);
        return next;
      });
    },
    [selected, effLeague]
  );

  const resetPlayer = useCallback(
    (id: number) => {
      setEdits((prev) => {
        const next = { ...prev };
        delete next[id];
        if (selected != null) cache.editsSet(selected, effLeague(selected), next);
        return next;
      });
      setGearEdits((prev) => {
        const next = { ...prev };
        delete next[id];
        if (selected != null) cache.gearEditsSet(selected, effLeague(selected), next);
        return next;
      });
    },
    [selected, effLeague]
  );

  // Once the available years are known, load the saved range (or default to full span).
  useEffect(() => {
    if (!years.length) return;
    const lo = Math.min(...years);
    const hi = Math.max(...years);
    cache.rangeGet().then((r) => {
      if (r) setRange({ from: Math.max(lo, Math.min(hi, r.from)), to: Math.max(lo, Math.min(hi, r.to)) });
      else setRange({ from: lo, to: hi });
    });
  }, [years]);

  useEffect(() => {
    cache.cachedYears().then(setCachedYears);
    cache.usedYearsGet().then((a) => setUsedYears(new Set(a)));
    cache.recentYearsGet().then(setRecentYears);
    api.archetypesByPosition().then(setArchetypeOptions).catch(() => {});
    api
      .years()
      .then((ys) => {
        setYears(ys);
        const def = ys.includes(2003) ? 2003 : ys[ys.length - 1];
        if (def) select(def);
      })
      .catch((e) => setError(e.message));
    // Run once on mount; mode changes are handled via changeMode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <TopBar
        view={view}
        onSetView={setView}
        onGoHome={() => setView('home')}
        onDrawRandom={drawRandomYear}
        canDraw={years.some((y) => !usedYears.has(y) && inRange(y))}
        mode={mode}
        onSetMode={changeMode}
        gameVersion={gameVersion}
        onSetGameVersion={changeGameVersion}
        showLeague={selected != null && isMergeEra(selected)}
        league={selected != null ? effLeague(selected) : 'NFL'}
        onSetLeague={changeLeague}
        connected={!error}
        years={years}
        selected={selected}
        onSelectYear={(y) => {
          setFocusPlayer(null);
          const next = { ...draftOpts, source: 'year' as const };
          setDraftOpts(next);
          select(y, false, mode, undefined, next);
        }}
        onSelectPlayer={(y, name) => {
          setFocusPlayer(name);
          const next = { ...draftOpts, source: 'year' as const };
          setDraftOpts(next);
          select(y, false, mode, undefined, next);
        }}
        cachedYears={cachedYears}
        recentYears={recentYears}
      />
      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1">
          {view === 'home' && <HomePage onSelect={setView} />}
          {view === 'franchise' && (
            <FranchiseView
              years={years}
              usedYears={usedYears}
              lastDrawn={lastDrawn}
              range={range}
              onDraw={drawRandomYear}
              onUndo={undoLastDraw}
              onSetRange={updateRange}
              onToggleUsed={toggleUsedYear}
              onClearUsed={clearUsedYears}
            />
          )}
          {view === 'draft' && (
            <>
          {error && (
            <div className="m-6 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-200">
              <div className="font-semibold text-red-100">Couldn’t load the draft class</div>
              <div className="mt-1 text-red-200/90">{error}</div>
              <div className="mt-2 text-xs text-red-300/70">
                Is the backend running on <code className="rounded bg-black/30 px-1">localhost:5174</code>? Start it with{' '}
                <code className="rounded bg-black/30 px-1">npm run dev</code> in <code className="rounded bg-black/30 px-1">server/</code>.
              </div>
            </div>
          )}
          {!data && !error && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-neutral-500">
              {busy ? (
                <>
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-700 border-t-primary" />
                  <span className="text-sm">Pulling draft class…</span>
                </>
              ) : (
                <>
                  <Icon path={ICONS.board} className="h-10 w-10 opacity-30" />
                  <span className="text-sm">Pick a draft year to build a class</span>
                </>
              )}
            </div>
          )}
          {data && (
            <ClassView
              data={data}
              source={source}
              busy={busy}
              edits={edits}
              gearEdits={gearEdits}
              onEdit={setEdit}
              onGearEdit={setGearEdit}
              onResetPlayer={resetPlayer}
              archetypeOptions={archetypeOptions}
              mode={mode}
              focusPlayer={focusPlayer}
              draftOpts={draftOpts}
              decades={[...new Set(years.map((y) => Math.floor(y / 10) * 10))].sort((a, b) => a - b)}
              onApplyDraftOpts={applyDraftOpts}
              onRefresh={() => selected != null && select(selected, true)}
            />
          )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
