import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type ArchetypeOption } from './api';
import { cache } from './cache';
import { ClassView } from './components/ClassView';
import { FranchisePanel } from './components/FranchisePanel';
import { TopBar } from './components/TopBar';
import type { ClassEdits, GearEdits, GeneratedClass } from './types';

export type AppView = 'draft' | 'franchise';

const isMergeEra = (y: number) => y >= 1960 && y <= 1969;
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
  const [view, setView] = useState<AppView>('draft');
  const [usedYears, setUsedYears] = useState<Set<number>>(new Set());
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [lastDrawn, setLastDrawn] = useState<number | null>(null);
  const [focusPlayer, setFocusPlayer] = useState<string | null>(null);
  // For merge-era (1960–69) years the user can pick AFL+NFL / NFL / AFL; null = default.
  const [leagueOverride, setLeagueOverride] = useState<string | null>(null);
  const reqRef = useRef(0); // guards against a slow earlier response clobbering a newer selection

  const effLeague = useCallback(
    (y: number) => (isMergeEra(y) && leagueOverride ? leagueOverride : leagueFor(y)),
    [leagueOverride]
  );

  const select = useCallback(
    async (year: number, force = false, useMode: GenMode = mode, useLeague?: string) => {
      const league = useLeague ?? effLeague(year);
      const req = ++reqRef.current;
      setSelected(year);
      setError(null);
      setBusy(true);
      try {
        const cached = force ? undefined : await cache.get(year, league, useMode);
        if (req !== reqRef.current) return; // a newer selection superseded this one
        if (cached) {
          setData(cached);
          setSource('cache');
        } else {
          const live = await api.generated(year, league, useMode);
          if (req !== reqRef.current) return;
          live.fetchedAt = Date.now();
          await cache.set(live, useMode);
          setData(live);
          setSource('live');
          setCachedYears((prev) => new Set(prev).add(year));
        }
        setEdits(await cache.editsGet(year, league));
        setGearEdits(await cache.gearEditsGet(year, league));
      } catch (e) {
        if (req !== reqRef.current) return;
        setError((e as Error).message);
        setData(null);
      } finally {
        if (req === reqRef.current) setBusy(false);
      }
    },
    [mode, effLeague]
  );

  const persistUsed = useCallback((next: Set<number>) => {
    setUsedYears(next);
    cache.usedYearsSet([...next]);
  }, []);

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
        onDrawRandom={drawRandomYear}
        canDraw={years.some((y) => !usedYears.has(y) && inRange(y))}
        mode={mode}
        onSetMode={changeMode}
        showLeague={selected != null && isMergeEra(selected)}
        league={selected != null ? effLeague(selected) : 'NFL'}
        onSetLeague={changeLeague}
        connected={!error}
        years={years}
        selected={selected}
        onSelectYear={(y) => {
          setFocusPlayer(null);
          select(y);
        }}
        onSelectPlayer={(y, name) => {
          setFocusPlayer(name);
          select(y);
        }}
        cachedYears={cachedYears}
      />
      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1">
          {view === 'franchise' && (
            <FranchisePanel
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
            <div className="flex h-full flex-col items-center justify-center gap-3 text-neutral-600">
              {busy ? (
                <>
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-700 border-t-primary" />
                  <span className="text-sm">Pulling draft class…</span>
                </>
              ) : (
                <>
                  <span className="text-4xl opacity-40">🏈</span>
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
              onRefresh={() => selected && select(selected, true)}
            />
          )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
