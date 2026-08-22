import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClassEdits, GearEdits, GeneratedClass, PlayerRow } from '../types';
import type { ArchetypeOption } from '../api';
import type { DraftOpts } from '../App';
import { cache } from '../cache';
import { POS_NAMES, groupForId } from '../constants';
import { MetaStrip } from './MetaStrip';
import { DraftOptions } from './DraftOptions';
import { ExportMenu } from './ExportMenu';
import type { EditTools } from './ExportMenu';
import { Toolbar } from './Toolbar';
import { PlayerTable } from './PlayerTable';
import { ProfileModal } from './ProfileModal';
import { Pill, Icon, ICONS } from './ui';

export type DisplayRow = PlayerRow & { edited?: boolean };

export function ClassView({
  data,
  source,
  onRefresh,
  onVariant,
  onResetVariant,
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
}: {
  data: GeneratedClass;
  source: 'cache' | 'live';
  onRefresh: () => void;
  onVariant?: () => void;
  onResetVariant?: () => void;
  busy: boolean;
  edits: ClassEdits;
  gearEdits: GearEdits;
  onEdit: (id: number, field: string, value: number | string) => void;
  onGearEdit: (id: number, slot: string, asset: string) => void;
  onResetPlayer: (id: number) => void;
  editTools?: EditTools;
  archetypeOptions: Record<string, ArchetypeOption[]>;
  mode: 'madden' | 'retro';
  focusPlayer: string | null;
  draftOpts: DraftOpts;
  decades: number[];
  onApplyDraftOpts: (o: DraftOpts) => void;
}) {
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState('ALL');
  const [sort, setSort] = useState('pick');
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
      filtersLoaded.current = true;
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);
  useEffect(() => {
    if (filtersLoaded.current) cache.filtersSet(data.year, data.league, { search, pos, sort });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, pos, sort]);

  // Jumping to a searched player: clear filters so the row is visible to highlight.
  useEffect(() => {
    if (focusPlayer) {
      setPos('ALL');
      setSearch('');
    }
  }, [focusPlayer]);

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
          overall: e.overall != null ? Number(e.overall) : r.overall,
          devTrait: e.devTrait != null ? Number(e.devTrait) : r.devTrait,
          positionId,
          position: POS_NAMES[positionId] ?? r.position,
          edited: true,
        };
      }),
    [data, edits]
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
      else if (col === 'face') cmp = a.face.localeCompare(b.face) || a.pick - b.pick;
      else cmp = a.pick - b.pick;
      return cmp * dir || a.pick - b.pick;
    });
    return sorted;
  }, [effRows, pos, search, sort]);

  const editedCount = Object.keys(edits).length;
  const selectedRow = selectedId != null ? data.rows.find((r) => r.id === selectedId) ?? null : null;

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
              {allTime ? (
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
            <Pill tone={mode === 'retro' ? 'legend' : 'neutral'}>
              {mode === 'retro' ? 'Career lens' : 'Realistic lens'}
            </Pill>
            {editedCount > 0 && <Pill tone="gold">{editedCount} edited</Pill>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
          <button
            onClick={onRefresh}
            disabled={busy}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border-strong bg-surface-2 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-surface-3 hover:text-neutral-100 disabled:opacity-50"
          >
            <Icon path={ICONS.refresh} className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
            {busy ? 'Refreshing…' : 'Rebuild'}
          </button>
          {onVariant && (
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
            draftOpts={draftOpts}
            gameVersion={data.gameVersion ?? 'm26'}
            editTools={editTools}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 py-3">
        {showOpts && <DraftOptions opts={draftOpts} decades={decades} busy={busy} onApply={onApplyDraftOpts} />}
        <MetaStrip data={data} rows={effRows} pos={pos} onPickPos={setPos} />

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
          />
          <div className="min-h-0 flex-1 overflow-auto">
            <PlayerTable rows={rows} selectedId={selectedId} onRowClick={setSelectedId} focusName={focusPlayer} sort={sort} onSort={setSort} />
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
          onEdit={(f, v) => onEdit(selectedRow.id, f, v)}
          onGearEdit={(slot, asset) => onGearEdit(selectedRow.id, slot, asset)}
          onReset={() => onResetPlayer(selectedRow.id)}
          onClose={() => setSelectedId(null)}
          onNavigate={navigatePlayer}
          canPrev={selectedIndex > 0}
          canNext={selectedIndex >= 0 && selectedIndex < rows.length - 1}
        />
      )}
    </div>
  );
}
