import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClassEdits, CustomClass, GearEdits, GeneratedClass, PlayerRow } from '../types';
import type { ArchetypeOption } from '../api';
import { api } from '../api';
import type { DraftOpts } from '../App';
import { cache } from '../cache';
import { POS_NAMES, groupForId } from '../constants';
import { MetaStrip } from './MetaStrip';
import { DraftOptions } from './DraftOptions';
import { ExportMenu } from './ExportMenu';
import type { EditTools } from './ExportMenu';
import { Toolbar } from './Toolbar';
import { PlayerTable, ATTR_COLUMNS, SPOILER_SORTS } from './PlayerTable';
import { ProfileModal } from './ProfileModal';
import { Pill, Icon, ICONS } from './ui';

export type DisplayRow = PlayerRow & { edited?: boolean };

/** Edit keys that never change the game's overall (everything else - ratings,
 *  position, archetype, a legacy overall target - does). */
const BIO_KEYS = new Set(['firstName', 'lastName', 'homeTown', 'devTrait', 'college', 'homeState', 'heightInches', 'weight', 'age', 'jerseyNum', 'bodyType', 'personaDNA', 'skinTone', 'faceAsset', 'genericHeadName']);

/** Attribute column id -> ratings key, so sorting an attribute column reads the
 *  rating the header names. Derived from the table's own column list so the two
 *  cannot drift apart. */
const ATTR_BY_ID: Record<string, string> = Object.fromEntries(
  ATTR_COLUMNS.map((c) => [c.id, c.key])
);

export function ClassView({
  data,
  source,
  onRefresh,
  onVariant,
  onOpenClass,
  onResetVariant,
  onShowDropped,
  busy,
  edits,
  gearEdits,
  onEdit,
  onClearEdits,
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
  /** Open an existing .mdc (lives in the export menu). */
  onOpenClass?: () => void;
  onResetVariant?: () => void;
  onShowDropped?: () => void;
  busy: boolean;
  edits: ClassEdits;
  gearEdits: GearEdits;
  onEdit: (id: number, field: string, value: number | string) => void;
  onClearEdits?: (id: number, fields: string[]) => void;
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
  // Likeness review: only the generic faces whose tone is a guess (no photo
  // evidence) and that the user has not fixed yet.
  const [unverified, setUnverified] = useState(false);
  const isUnverified = (r: PlayerRow) => r.face !== 'asset' && (r.toneSource === 'prior' || r.toneSource === 'csv') && !r.likenessFixed;
  const [showOpts, setShowOpts] = useState(false);
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

  const rows = useMemo(() => {
    let r = effRows;
    // `pos` may be an exact M26 label (from the dropdown) or a coarse group code
    // (from the composition strip) — match either.
    if (pos !== 'ALL') r = r.filter((x) => x.position === pos || groupForId(x.positionId) === pos);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((x) => `${x.firstName} ${x.lastName}`.toLowerCase().includes(q));
    }
    if (unverified) r = r.filter(isUnverified);
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
  }, [effRows, pos, search, sort, unverified]);

  const editedCount = Object.keys(edits).length;
  const selectedRow = selectedId != null ? data.rows.find((r) => r.id === selectedId) ?? null : null;
  // A hand-picked class exports by its saved player keys and name.
  const exportOpts = useMemo(() => {
    if (draftOpts.source === 'file') return { ...draftOpts, fileId: data.fileId ?? draftOpts.fileId, name: data.fileName ?? data.name ?? 'CAREERDRAFT' };
    if (draftOpts.source === 'team') return { ...draftOpts, name: `${data.name ?? draftOpts.team ?? ''} All-Time` };
    if (draftOpts.source !== 'picked') return draftOpts;
    const c = customClasses.find((x) => x.id === draftOpts.customId);
    return { ...draftOpts, board: c?.board ?? [], name: data.name ?? c?.name ?? '' };
  }, [draftOpts, customClasses, data.name]);

  // Prev/next player navigation inside the profile modal, walking the board in
  // its current filter+sort order (what you see is what you step through).
  const selectedIndex = selectedId != null ? rows.findIndex((r) => r.id === selectedId) : -1;
  const navigatePlayer = (delta: number) => {
    if (selectedIndex < 0) return;
    const next = rows[selectedIndex + delta];
    if (next) setSelectedId(next.id);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-6 py-3.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight">
              {data.source === 'file' ? (
                <span className="text-gold">{data.fileName || data.name || 'Opened class'} <span className="text-neutral-400">· opened Madden {data.gameVersion === 'm27' ? '27' : '26'} class</span></span>
              ) : data.source === 'picked' ? (
                <span className="text-gold">Custom · {data.name || 'My class'}</span>
              ) : data.source === 'team' ? (
                <span className="text-gold">{data.name || 'Franchise'} · All-Time Draft</span>
              ) : allTime ? (
                <span className="text-gold">All-Time Greats</span>
              ) : decade ? (
                <span className="text-gold">Greatest of the {decade}</span>
              ) : (
                <>
                  {data.year}{' '}
                  <span className="text-neutral-400">{data.league === 'combined' ? 'AFL + NFL' : data.league} Draft Class</span>
                </>
              )}
            </h1>
            {source === 'cache' ? (
              <Pill tone="success">Cached</Pill>
            ) : (
              <Pill tone="primary">Freshly pulled</Pill>
            )}
            {data.source === 'file' ? (
              <span title="Ratings, faces and gear exactly as the file holds them; the rating lens does not apply"><Pill tone="neutral">As in the file</Pill></span>
            ) : (
              <Pill tone={mode === 'retro' ? 'legend' : mode === 'launch' ? 'gold' : 'neutral'}>
                {mode === 'retro' ? 'Career lens' : mode === 'launch' ? 'Launch-day lens' : 'Realistic lens'}
              </Pill>
            )}
            {mode === 'launch' && (data.launchCount ?? 0) === 0 && (
              <span title="No launch roster covers this class (EA launch files exist for most classes since 2001, but not 2010, 2021, 2024 or 2025, and nothing before Madden 2002), so it is rated exactly as Realistic.">
                <Pill tone="neutral">no launch data for this year</Pill>
              </span>
            )}
            {mode === 'launch' && (data.launchCount ?? 0) > 0 && (
              <Pill tone="gold">{data.launchCount} at EA's launch rating</Pill>
            )}
            {editedCount > 0 && <Pill tone="gold">{editedCount} edited</Pill>}
            {data.source === 'picked' && <Pill tone="neutral">{data.pickedCount ?? data.count} picked</Pill>}
            {data.missing && data.missing.length > 0 && (
              <span title={`Not in the current data:\n${data.missing.join('\n')}`}>
                <Pill tone="gold">{data.missing.length} not found</Pill>
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {data.source !== 'file' && (
          <button
            onClick={() => setShowOpts((v) => !v)}
            aria-pressed={showOpts}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              showOpts || draftOpts.source !== 'year' || draftOpts.strength !== 1 || draftOpts.studs !== 0 || draftOpts.generational
                ? 'border-primary/60 bg-primary/10 text-primary'
                : 'border-border-strong bg-surface-2 text-neutral-300 hover:bg-surface-3 hover:text-neutral-100'
            }`}
          >
            <Icon path={ICONS.chevronDown} className={`h-3.5 w-3.5 transition-transform ${showOpts ? 'rotate-180' : ''}`} />
            Draft options
          </button>
          )}
          {data.source !== 'file' && (
          <button
            onClick={onRefresh}
            disabled={busy}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border-strong bg-surface-2 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-surface-3 hover:text-neutral-100 disabled:opacity-50"
          >
            <Icon path={ICONS.refresh} className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
            {busy ? 'Refreshing…' : 'Rebuild'}
          </button>
          )}
          {onVariant && data.source !== 'file' && (
            <button
              onClick={onVariant}
              disabled={busy}
              title="Re-roll every seeded choice (faces, gear, attribute noise, persona) - same players, same order, same overalls. Rebuild alone regenerates the identical class."
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border-strong bg-surface-2 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-surface-3 hover:text-neutral-100 disabled:opacity-50"
            >
              Variant{draftOpts.variant ? ` #${draftOpts.variant}` : ''}
              {draftOpts.variant ? (
                <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onResetVariant?.(); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onResetVariant?.(); } }} className="ml-1 text-muted hover:text-neutral-200" title="Back to the canonical class">×</span>
              ) : null}
            </button>
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
            onOpenClass={onOpenClass}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 py-3">
        {showOpts && data.source !== 'file' && <DraftOptions opts={draftOpts} decades={decades} busy={busy} onApply={onApplyDraftOpts} customClasses={customClasses} onOpenBuilder={onOpenBuilder} />}
        <MetaStrip data={data} rows={effRows} pos={pos} onPickPos={setPos} onShowDropped={onShowDropped} spoilers={spoilers} />

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface-1">
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
            unverified={unverified}
            setUnverified={setUnverified}
            unverifiedCount={effRows.filter(isUnverified).length}
          />
          <div className="min-h-0 flex-1 overflow-auto">
            <PlayerTable rows={rows} selectedId={selectedId} onRowClick={setSelectedId} focusName={focusPlayer} sort={sort} onSort={setSort} spoilers={spoilers} showReference={unverified} />
          </div>
        </section>
      </div>

      {selectedRow && (
        <ProfileModal
          row={selectedRow}
          patch={edits[selectedRow.id] || {}}
          gearPatch={gearEdits[selectedRow.id] || {}}
          year={data.year}
          archetypeOptions={archetypeOptions}
          gameVersion={data.gameVersion ?? "m26"}
          spoilers={spoilers}
          onEdit={(f, v) => onEdit(selectedRow.id, f, v)}
          onClearEdits={onClearEdits ? (fields) => onClearEdits(selectedRow.id, fields) : undefined}
          onGearEdit={(slot, asset) => onGearEdit(selectedRow.id, slot, asset)}
          onReset={() => onResetPlayer(selectedRow.id)}
          onClose={() => setSelectedId(null)}
          onNavigate={navigatePlayer}
          onLikenessChanged={onRefresh}
          canPrev={selectedIndex > 0}
          canNext={selectedIndex >= 0 && selectedIndex < rows.length - 1}
        />
      )}
    </div>
  );
}
