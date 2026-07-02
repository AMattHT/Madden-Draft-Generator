import { useEffect, useMemo, useState } from 'react';
import type { ClassEdits, GearEdits, GeneratedClass, PlayerRow } from '../types';
import type { ArchetypeOption } from '../api';
import { POS_NAMES } from '../constants';
import { StatsBar } from './StatsBar';
import { WavLegend } from './WavLegend';
import { ExportBar } from './ExportBar';
import { Toolbar } from './Toolbar';
import { PlayerTable } from './PlayerTable';
import { ProfileModal } from './ProfileModal';
import { Pill, Icon, ICONS } from './ui';

export type DisplayRow = PlayerRow & { edited?: boolean };

export function ClassView({
  data,
  source,
  onRefresh,
  busy,
  edits,
  gearEdits,
  onEdit,
  onGearEdit,
  onResetPlayer,
  archetypeOptions,
  mode,
  focusPlayer,
}: {
  data: GeneratedClass;
  source: 'cache' | 'live';
  onRefresh: () => void;
  busy: boolean;
  edits: ClassEdits;
  gearEdits: GearEdits;
  onEdit: (id: number, field: string, value: number | string) => void;
  onGearEdit: (id: number, slot: string, asset: string) => void;
  onResetPlayer: (id: number) => void;
  archetypeOptions: Record<string, ArchetypeOption[]>;
  mode: 'madden' | 'retro';
  focusPlayer: string | null;
}) {
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState('ALL');
  const [sort, setSort] = useState('pick');
  const [selectedId, setSelectedId] = useState<number | null>(null);

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
    if (pos !== 'ALL') r = r.filter((x) => x.position === pos);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((x) => `${x.firstName} ${x.lastName}`.toLowerCase().includes(q));
    }
    const sorted = [...r];
    if (sort === 'ovr') sorted.sort((a, b) => b.overall - a.overall);
    else if (sort === 'wav') sorted.sort((a, b) => (b.wav ?? -1) - (a.wav ?? -1));
    else if (sort === 'name') sorted.sort((a, b) => a.lastName.localeCompare(b.lastName));
    else sorted.sort((a, b) => a.pick - b.pick);
    return sorted;
  }, [effRows, pos, search, sort]);

  const editedCount = Object.keys(edits).length;
  const selectedRow = selectedId != null ? data.rows.find((r) => r.id === selectedId) ?? null : null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-6 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight">
              {data.year}{' '}
              <span className="text-neutral-400">
                {data.league === 'combined' ? 'AFL + NFL' : data.league} Draft Class
              </span>
            </h1>
            {source === 'cache' ? (
              <Pill tone="success">Cached</Pill>
            ) : (
              <Pill tone="primary">Freshly pulled</Pill>
            )}
            <Pill tone={mode === 'retro' ? 'legend' : 'neutral'}>
              {mode === 'retro' ? 'Career lens' : 'Realistic lens'}
            </Pill>
          </div>
          <p className="mt-1 text-xs text-muted">
            <span className="tabular-nums">{data.count}</span> prospects
            {data.generatedCount ? (
              <>
                {' '}(<span className="tabular-nums">{data.count - data.generatedCount}</span> real +{' '}
                <span className="tabular-nums text-neutral-400">{data.generatedCount}</span> generated)
              </>
            ) : null}{' '}
            · rated from real career weighted AV
            {editedCount > 0 && <span className="text-gold"> · {editedCount} edited</span>}
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border-strong bg-surface-2 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-surface-3 hover:text-neutral-100 disabled:opacity-50"
        >
          <Icon path={ICONS.refresh} className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
          {busy ? 'Refreshing…' : 'Rebuild'}
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-4">
        <div className="shrink-0 space-y-3">
          <StatsBar data={data} />
          <div className="grid grid-cols-1 items-stretch gap-3 xl:grid-cols-[minmax(0,1fr)_23rem]">
            <WavLegend />
            <ExportBar
              year={data.year}
              league={data.league}
              likeness={data.likeness}
              edits={edits}
              gearEdits={gearEdits}
              editedCount={editedCount}
              mode={mode}
              rows={effRows}
            />
          </div>
        </div>

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
            <PlayerTable rows={rows} selectedId={selectedId} onRowClick={setSelectedId} focusName={focusPlayer} />
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
          onEdit={(f, v) => onEdit(selectedRow.id, f, v)}
          onGearEdit={(slot, asset) => onGearEdit(selectedRow.id, slot, asset)}
          onReset={() => onResetPlayer(selectedRow.id)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
