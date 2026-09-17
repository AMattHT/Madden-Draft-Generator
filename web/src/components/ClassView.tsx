import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { ClassEdits, CustomClass, GearEdits, GeneratedClass, PlayerRow } from '../types';
import type { ArchetypeOption } from '../api';
import { api } from '../api';
import type { DraftOpts } from '../App';
import { cache } from '../cache';
import { POS_NAMES, groupForId } from '../constants';
import { MetaStrip } from './MetaStrip';
import { DraftOptions } from './DraftOptions';
import { ExportMenu } from './ExportMenu';
import type { EditTools, ExportActions } from './ExportMenu';
import { Toolbar, BOARD_VIEWS, type BoardView, type ColumnPreset } from './Toolbar';
import { PlayerTable, ATTR_COLUMNS, SPOILER_SORTS } from './PlayerTable';
import { PlayerCards } from './PlayerCards';
import { DraftBoard } from './DraftBoard';
import { WallBoard } from './WallBoard';
import { ProfileModal } from './ProfileModal';
import { Pill, Icon, ICONS, Button, Kbd } from './ui';

export type DisplayRow = PlayerRow & { edited?: boolean };

/** Edit keys that never change the game's overall (everything else - ratings,
 *  position, archetype, a legacy overall target - does). */
const BIO_KEYS = new Set(['firstName', 'lastName', 'homeTown', 'devTrait', 'college', 'homeState', 'heightInches', 'weight', 'age', 'jerseyNum', 'bodyType', 'personaDNA', 'focus', 'skinTone', 'faceAsset', 'genericHeadName']);

/** Attribute column id -> ratings key, so sorting an attribute column reads the
 *  rating the header names. Derived from the table's own column list so the two
 *  cannot drift apart. */
const ATTR_BY_ID: Record<string, string> = Object.fromEntries(
  ATTR_COLUMNS.map((c) => [c.id, c.key])
);

const VIEW_KEY = 'board:view';
const COLS_KEY = 'board:columns';
const ROUNDS_KEY = 'board:rounds';
const readPref = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  } catch { return fallback; }
};
const writePref = (key: string, v: string) => { try { localStorage.setItem(key, v); } catch { /* private mode */ } };

export function ClassView({
  data,
  source,
  onRefresh,
  onVariant,
  exportActionsRef,
  onResetVariant,
  onShowDropped,
  busy,
  edits,
  gearEdits,
  onEdit,
  onGearEdit,
  onResetPlayer,
  editTools,
  archetypeOptions,
  mode,
  focusPlayer,
  draftOpts,
  decades,
  onApplyDraftOpts,
  customClasses = [],
  onOpenBuilder,
}: {
  data: GeneratedClass;
  source: 'cache' | 'live';
  onRefresh: () => void;
  onVariant?: () => void;
  /** Filled by the export control so the File / Edit menus can act on this class. */
  exportActionsRef?: MutableRefObject<ExportActions | null>;
  onResetVariant?: () => void;
  onShowDropped?: () => void;
  busy: boolean;
  edits: ClassEdits;
  gearEdits: GearEdits;
  onEdit: (id: number, field: string, value: number | string) => void;
  onGearEdit: (id: number, slot: string, asset: string) => void;
  onResetPlayer: (id: number) => void;
  editTools?: EditTools;
  archetypeOptions: Record<string, ArchetypeOption[]>;
  mode: 'madden' | 'retro' | 'launch';
  focusPlayer: string | null;
  draftOpts: DraftOpts;
  decades: number[];
  onApplyDraftOpts: (o: DraftOpts) => void;
  customClasses?: CustomClass[];
  onOpenBuilder?: (c: CustomClass | null) => void;
}) {
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState('ALL');
  const [sort, setSort] = useState('pick');
  // Blind-scouting mode, OFF by default: a class opens with overall, dev trait,
  // wAV and attributes masked, and you tick Spoilers to reveal them.
  const [spoilers, setSpoilers] = useState(false);
  const [showOpts, setShowOpts] = useState(false);
  // View set, column preset and round banding are shell preferences, not per-class state.
  const [view, setView] = useState<BoardView>(() => readPref(VIEW_KEY, BOARD_VIEWS, 'table'));
  const [columns, setColumns] = useState<ColumnPreset>(() => readPref(COLS_KEY, ['core', 'physical', 'position', 'all'] as const, 'core'));
  const [rounds, setRounds] = useState<boolean>(() => readPref(ROUNDS_KEY, ['0', '1'] as const, '0') === '1');
  useEffect(() => writePref(VIEW_KEY, view), [view]);
  useEffect(() => writePref(COLS_KEY, columns), [columns]);
  useEffect(() => writePref(ROUNDS_KEY, rounds ? '1' : '0'), [rounds]);
  const allTime = data.league === 'all-time';
  const decade = /^\d{4}s$/.test(data.league || '') ? data.league : null; // e.g. "1990s"
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Restore this class's board view state (search / position / sort) on arrival;
  // persist it as it changes so the board looks the way you left it.
  const filterKey = `${data.year}_${data.league}`;
  const filtersLoaded = useRef(false);
  useEffect(() => {
    filtersLoaded.current = false;
    let alive = true;
    cache.filtersGet(data.year, data.league).then((f) => {
      if (!alive) return;
      setSearch(f?.search ?? '');
      setPos(f?.pos ?? 'ALL');
      setSort(f?.sort ?? 'pick');
      setSpoilers(f?.spoilers ?? false);
      filtersLoaded.current = true;
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);
  useEffect(() => {
    if (filtersLoaded.current) cache.filtersSet(data.year, data.league, { search, pos, sort, spoilers });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, pos, sort, spoilers]);

  // Hiding a value while still ranking by it is not hiding it: if the board is
  // sorted by a masked column when spoilers go off, fall back to draft order.
  useEffect(() => {
    if (!spoilers && SPOILER_SORTS.has(sort.replace(/^-/, ''))) setSort('pick');
  }, [spoilers, sort]);

  // Jumping to a searched player: clear filters so the row is visible to highlight.
  useEffect(() => {
    if (focusPlayer) {
      setPos('ALL');
      setSearch('');
      setView((v) => (v === 'table' || v === 'desk' ? v : 'table'));
    }
  }, [focusPlayer]);

  // Madden recomputes the overall from the attributes on import, so an edited
  // player shows the game's number, not the generated target (debounced, edited
  // rows only). Bio-only edits do not move it.
  const [gameOvr, setGameOvr] = useState<Record<number, number>>({});
  useEffect(() => {
    const ids = Object.keys(edits).map(Number).filter((id) => {
      const e = edits[id];
      return !!e && Object.keys(e).some((k) => !BIO_KEYS.has(k));
    });
    if (!ids.length) { setGameOvr({}); return; }
    const t = setTimeout(() => {
      const items = ids.flatMap((id) => {
        const r = data.rows.find((x) => x.id === id);
        if (!r) return [];
        const e = edits[id];
        const ratings: Record<string, number> = { ...r.ratings };
        for (const k of Object.keys(ratings)) if (e[k] != null && e[k] !== '') ratings[k] = Number(e[k]);
        return [{
          id,
          positionId: e.position != null ? Number(e.position) : r.positionId,
          archetype: e.archetype != null ? Number(e.archetype) : r.archetype,
          ratings,
          overall: e.overall != null ? Number(e.overall) : undefined,
        }];
      });
      api.recomputeBatch({ gameVersion: data.gameVersion ?? 'm26', items })
        .then((res) => setGameOvr(Object.fromEntries(res.filter((x) => x.overall != null).map((x) => [x.id, x.overall as number]))))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [edits, data]);

  // Apply user edits to get the effective values shown in the table.
  const effRows: DisplayRow[] = useMemo(
    () =>
      data.rows.map((r) => {
        const e = edits[r.id];
        if (!e) return r;
        const positionId = e.position != null ? Number(e.position) : r.positionId;
        return {
          ...r,
          firstName: typeof e.firstName === 'string' ? e.firstName : r.firstName,
          lastName: typeof e.lastName === 'string' ? e.lastName : r.lastName,
          overall: gameOvr[r.id] ?? (e.overall != null ? Number(e.overall) : r.overall),
          devTrait: e.devTrait != null ? Number(e.devTrait) : r.devTrait,
          positionId,
          position: POS_NAMES[positionId] ?? r.position,
          edited: true,
        };
      }),
    [data, edits, gameOvr]
  );

  const positions = useMemo(
    () => ['ALL', ...Array.from(new Set(effRows.map((r) => r.position))).sort()],
    [effRows]
  );

  // The search filter alone, in draft order: what the big board shows (the
  // position filter dims tiles there instead of removing them).
  const searched = useMemo(() => {
    if (!search.trim()) return effRows;
    const q = search.toLowerCase();
    return effRows.filter((x) => `${x.firstName} ${x.lastName}`.toLowerCase().includes(q));
  }, [effRows, search]);

  const rows = useMemo(() => {
    // `pos` may be an exact M26 label (from the dropdown) or a coarse group code
    // (from the composition strip) — match either.
    const r = pos !== 'ALL' ? searched.filter((x) => x.position === pos || groupForId(x.positionId) === pos) : searched;
    const sorted = [...r];
    const desc = sort.startsWith('-');
    const col = desc ? sort.slice(1) : sort;
    const dir = desc ? -1 : 1;
    const teamKey = (x: (typeof r)[0]) => (x.team?.abbr || x.team?.name || '').toUpperCase();
    sorted.sort((a, b) => {
      let cmp = 0;
      if (col === 'ovr') cmp = a.overall - b.overall;
      else if (col === 'wav') cmp = (a.wav ?? -1) - (b.wav ?? -1);
      else if (col === 'dev') cmp = a.devTrait - b.devTrait;
      else if (col === 'name') cmp = a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
      else if (col === 'pos') cmp = a.position.localeCompare(b.position) || a.pick - b.pick;
      else if (col === 'team') cmp = teamKey(a).localeCompare(teamKey(b)) || a.pick - b.pick;
      else if (ATTR_BY_ID[col]) {
        const k = ATTR_BY_ID[col];
        cmp = ((a.ratings?.[k] ?? -1) as number) - ((b.ratings?.[k] ?? -1) as number);
      }
      else cmp = a.pick - b.pick;
      return cmp * dir || a.pick - b.pick;
    });
    return sorted;
  }, [searched, pos, sort]);

  const editedCount = Object.keys(edits).length;
  const desk = view === 'desk';
  // Leaving the desk drops its standing selection, or the modal would open at once.
  const changeView = (v: BoardView) => { if (desk && v !== 'desk') setSelectedId(null); setView(v); };
  // The scout desk always has a player on the pane: the first row until one is picked.
  useEffect(() => {
    if (desk && selectedId == null && rows.length) setSelectedId(rows[0].id);
  }, [desk, selectedId, rows]);
  const selectedRow = selectedId != null ? data.rows.find((r) => r.id === selectedId) ?? null : null;
  // A hand-picked class exports by its saved player keys and name.
  const exportOpts = useMemo(() => {
    if (draftOpts.source === 'file') return { ...draftOpts, fileId: data.fileId ?? draftOpts.fileId, name: data.fileName ?? data.name ?? 'CAREERDRAFT' };
    if (draftOpts.source === 'team') return { ...draftOpts, name: `${data.name ?? draftOpts.team ?? ''} All-Time` };
    if (draftOpts.source !== 'picked') return draftOpts;
    const c = customClasses.find((x) => x.id === draftOpts.customId);
    return { ...draftOpts, board: c?.board ?? [], name: data.name ?? c?.name ?? '' };
  }, [draftOpts, customClasses, data.name]);

  // Prev/next player navigation inside the profile editor, walking the board in
  // its current filter+sort order (what you see is what you step through).
  const selectedIndex = selectedId != null ? rows.findIndex((r) => r.id === selectedId) : -1;
  const navigatePlayer = (delta: number) => {
    if (selectedIndex < 0) return;
    const next = rows[selectedIndex + delta];
    if (next) setSelectedId(next.id);
  };

  const optsDirty = draftOpts.source !== 'year' || draftOpts.strength !== 1 || draftOpts.studs !== 0 || draftOpts.generational;
  const isFile = data.source === 'file';

  /* ---- Title: the year as a big display numeral, or the custom class's name. ---- */
  const title = isFile ? (
    <><span className="text-gold">{data.fileName || data.name || 'Opened class'}</span> <span className="text-neutral-500">· Madden {data.gameVersion === 'm27' ? '27' : '26'} file</span></>
  ) : data.source === 'picked' ? (
    <><span className="text-neutral-500">Custom ·</span> <span className="text-gold">{data.name || 'My class'}</span></>
  ) : data.source === 'team' ? (
    <><span className="text-gold">{data.name || 'Franchise'}</span> <span className="text-neutral-500">· All-Time Draft</span></>
  ) : allTime ? (
    <span className="text-gold">All-Time Greats</span>
  ) : decade ? (
    <><span className="text-neutral-500">Greatest of the</span> <span className="text-gold">{decade}</span></>
  ) : (
    <><span className="text-neutral-50">{data.year}</span> <span className="text-neutral-400">{data.league === 'combined' ? 'AFL + NFL' : data.league} Draft</span></>
  );

  const editorProps = selectedRow && {
    row: selectedRow,
    patch: edits[selectedRow.id] || {},
    gearPatch: gearEdits[selectedRow.id] || {},
    year: data.year,
    archetypeOptions,
    gameVersion: data.gameVersion ?? 'm26',
    spoilers,
    onEdit: (f: string, v: number | string) => onEdit(selectedRow.id, f, v),
    onGearEdit: (slot: string, asset: string) => onGearEdit(selectedRow.id, slot, asset),
    onReset: () => onResetPlayer(selectedRow.id),
    onClose: () => setSelectedId(null),
    onNavigate: navigatePlayer,
    canPrev: selectedIndex > 0,
    canNext: selectedIndex >= 0 && selectedIndex < rows.length - 1,
  };

  return (
    <div key={filterKey} className="flex h-full animate-view flex-col">
      <header className="flex shrink-0 items-center justify-between gap-4 px-5 pb-2 pt-3.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-display text-[26px] font-extrabold leading-none tracking-tight">{title}</h1>
          <span className="flex flex-wrap items-center gap-1.5">
            {source === 'cache' ? <Pill tone="success" dot>Cached</Pill> : <Pill tone="primary" dot>Fresh</Pill>}
            {isFile ? (
              <span title="Ratings, faces and gear exactly as the file holds them; the rating lens does not apply"><Pill tone="neutral">As in the file</Pill></span>
            ) : (
              <Pill tone={mode === 'retro' ? 'legend' : mode === 'launch' ? 'gold' : 'neutral'}>
                {mode === 'retro' ? 'Career lens' : mode === 'launch' ? 'Launch-day lens' : 'Realistic lens'}
              </Pill>
            )}
            {mode === 'launch' && (data.launchCount ?? 0) === 0 && (
              <span title="No launch roster covers this class (EA launch files exist for most classes since 2001, but not 2010, 2021, 2024 or 2025, and nothing before Madden 2002), so it is rated exactly as Realistic.">
                <Pill tone="neutral">no launch data</Pill>
              </span>
            )}
            {mode === 'launch' && (data.launchCount ?? 0) > 0 && <Pill tone="gold">{data.launchCount} at EA's launch rating</Pill>}
            {editedCount > 0 && <Pill tone="gold" dot>{editedCount} edited</Pill>}
            {data.source === 'picked' && <Pill tone="neutral">{data.pickedCount ?? data.count} picked</Pill>}
            {data.missing && data.missing.length > 0 && (
              <span title={`Not in the current data:\n${data.missing.join('\n')}`}>
                <Pill tone="warning">{data.missing.length} not found</Pill>
              </span>
            )}
            {draftOpts.variant ? <Pill tone="primary">Variant #{draftOpts.variant}</Pill> : null}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!isFile && (
            <Button onClick={() => setShowOpts((v) => !v)} aria-pressed={showOpts} active={showOpts || optsDirty} title="Source, class strength, hindsight and other generation modifiers">
              <Icon path={ICONS.sliders} className="h-3.5 w-3.5" />
              Draft options
              <Icon path={ICONS.chevronDown} className={`h-3 w-3 transition-transform duration-200 ${showOpts ? 'rotate-180' : ''}`} />
            </Button>
          )}
          {!isFile && (
            <Button onClick={onRefresh} disabled={busy} title="Regenerate the identical class from the current data">
              <Icon path={ICONS.refresh} className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
              {busy ? 'Building…' : 'Rebuild'}
            </Button>
          )}
          {onVariant && !isFile && (
            <Button
              onClick={onVariant}
              disabled={busy}
              title="Re-roll every seeded choice (faces, gear, attribute noise, persona) - same players, same order, same overalls. Rebuild alone regenerates the identical class."
            >
              <Icon path={ICONS.sparkles} className="h-3.5 w-3.5" />
              Variant
              {draftOpts.variant ? (
                <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onResetVariant?.(); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onResetVariant?.(); } }} className="-mr-1 ml-0.5 rounded px-1 text-muted hover:bg-white/10 hover:text-neutral-100" title="Back to the canonical class">×</span>
              ) : null}
            </Button>
          )}
          <ExportMenu
            year={data.year}
            league={data.league}
            likeness={data.likeness}
            edits={edits}
            gearEdits={gearEdits}
            editedCount={editedCount}
            mode={mode}
            rows={effRows}
            draftOpts={exportOpts}
            gameVersion={data.gameVersion ?? 'm26'}
            editTools={editTools}
            actionsRef={exportActionsRef}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 px-5 pb-4 pt-1">
        {showOpts && !isFile && (
          <div className="animate-rise">
            <DraftOptions opts={draftOpts} decades={decades} busy={busy} onApply={onApplyDraftOpts} customClasses={customClasses} onOpenBuilder={onOpenBuilder} />
          </div>
        )}
        <MetaStrip data={data} rows={effRows} pos={pos} onPickPos={setPos} onShowDropped={onShowDropped} spoilers={spoilers} />

        <section className="glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl">
          <Toolbar
            search={search}
            setSearch={setSearch}
            pos={pos}
            setPos={setPos}
            positions={positions}
            sort={sort}
            setSort={setSort}
            shown={rows.length}
            total={data.count}
            spoilers={spoilers}
            setSpoilers={setSpoilers}
            view={view}
            setView={changeView}
            columns={columns}
            setColumns={setColumns}
            rounds={rounds}
            setRounds={setRounds}
          />
          <div key={view} className="min-h-0 flex-1 animate-fade-in">
            {view === 'table' && (
              <PlayerTable rows={rows} selectedId={selectedId} onRowClick={setSelectedId} focusName={focusPlayer} sort={sort} onSort={setSort} spoilers={spoilers} columns={columns} pos={pos} groupRounds={rounds} />
            )}
            {desk && (
              <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_minmax(440px,540px)]">
                <div className="min-h-0 border-r border-white/[0.06]">
                  <PlayerTable rows={rows} selectedId={selectedId} onRowClick={setSelectedId} focusName={focusPlayer} sort={sort} onSort={setSort} spoilers={spoilers} columns={columns} pos={pos} groupRounds={rounds} selectOnFocus />
                </div>
                <div className="min-h-0 overflow-hidden bg-surface-1/50">
                  {editorProps ? (
                    <ProfileModal key={selectedRow!.id} variant="pane" {...editorProps} />
                  ) : (
                    <div className="grid h-full place-items-center px-8 text-center text-sm text-muted">
                      <div>
                        <div className="font-semibold text-neutral-300">Pick a player to edit</div>
                        <div className="mt-1">Click a row, or move the highlight with <Kbd>↑</Kbd> <Kbd>↓</Kbd>. Edits save as you type.</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {view === 'cards' && <PlayerCards rows={rows} selectedId={selectedId} onOpen={setSelectedId} spoilers={spoilers} />}
            {view === 'wall' && <WallBoard rows={searched} pos={pos} selectedId={selectedId} onOpen={setSelectedId} spoilers={spoilers} />}
            {view === 'board' && <DraftBoard rows={rows} selectedId={selectedId} onOpen={setSelectedId} spoilers={spoilers} />}
          </div>
        </section>
      </div>

      {editorProps && !desk && <ProfileModal {...editorProps} />}
    </div>
  );
}
