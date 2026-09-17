import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type ArchetypeOption, type PlayerFieldEdit } from '../../api';
import type { CatalogPlayer, GeneratedRosterPlayer, RosterBuildResult, RosterData, RosterDoc, RosterPlayer } from '../../types';
import { addId, docCounts, groupByPosition, isDocEmpty, playerFromPreview, viewPlayers, withAdd, withAddMove, withEdit, withMove, withoutAdd, withoutEdits, type ViewPlayer } from '../../rosterDoc';
import { rowFor, patchFor, editFromCard, type CardCtx } from '../../rosterCard';
import { groupForId } from '../../constants';
import { DevBadge, Icon, ICONS, Portrait, RatingChip } from '../ui';
import { ProfileModal } from '../ProfileModal';
import { CatalogPanel } from '../CatalogPanel';
import { TeamPanel } from './TeamPanel';

const GROUPS: [string, string][] = [
  ['ALL', 'All positions'], ['QB', 'QB'], ['RB', 'RB'], ['WR', 'WR'], ['TE', 'TE'], ['OL', 'OL'],
  ['EDGE', 'EDGE'], ['IDL', 'IDL'], ['LB', 'LB'], ['CB', 'CB'], ['S', 'S'], ['K', 'K'], ['P', 'P'],
];
export const selectCls = 'rounded-md border border-border bg-surface-0 px-2.5 py-1.5 text-sm text-neutral-300 focus:border-primary focus:outline-none';
export const btnCls = 'rounded-md border border-border-strong bg-surface-2 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-surface-3 disabled:opacity-50';
const EMPTY_CTX: CardCtx = { traits: [], focus: [], colleges: [], archetypes: {} };

/** One row of the left panel: a base-roster player with his current team. */
export function PlayerRow({ p, selected, onClick, onDragStart, trailing }: {
  p: ViewPlayer; selected?: boolean; onClick?: () => void; onDragStart?: (e: React.DragEvent) => void; trailing?: React.ReactNode;
}) {
  return (
    <div draggable={!!onDragStart} onDragStart={onDragStart} onClick={onClick}
      className={`flex items-center gap-2.5 border-b border-border/60 px-3 py-1.5 text-sm ${onClick ? 'cursor-pointer' : ''} ${selected ? 'bg-primary/10' : 'hover:bg-surface-2/70'}`}>
      <Portrait src={p.portrait} size="xs" />
      <span className="min-w-0 flex-1 truncate font-medium text-neutral-100">
        {p.edited && <span className="mr-1 text-gold" title="edited">●</span>}{p.firstName} {p.lastName}
        <span className="ml-1 text-[10px] text-muted">#{p.jersey}</span>
        {p.added && <span className="ml-1 rounded bg-gold/15 px-1 text-[10px] font-semibold text-gold" title="Added from the player pool">added</span>}
      </span>
      <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-neutral-300">{p.position}</span>
      <RatingChip ovr={p.overall} size="sm" />
      <span className="w-6 text-right text-xs tabular-nums text-neutral-400">{p.age || ''}</span>
      <DevBadge dev={p.devTrait} />
      <span className={`w-9 text-right text-xs ${p.moved ? 'text-gold' : 'text-neutral-400'}`} title={p.teamName ?? 'Free agent'}>{p.team ?? 'FA'}</span>
      {trailing}
    </div>
  );
}

export function RosterBuilder({ data, doc, readOnly, notice, onChange, onSave, onClose, onRebase }: {
  data: RosterData;
  doc: RosterDoc;
  readOnly: boolean;
  notice: string | null;
  onChange: (doc: RosterDoc) => void;
  onSave: (doc: RosterDoc) => Promise<void>;
  onClose: () => void;
  onRebase: () => void;
}) {
  const fresh = doc.fresh === true;
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [tab, setTab] = useState<'roster' | 'pool'>(fresh ? 'pool' : 'roster');
  const [team, setTeam] = useState('ALL');
  const [group, setGroup] = useState('ALL');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'ovr' | 'name' | 'age' | 'pos'>('ovr');
  const [selectedTeam, setSelectedTeam] = useState(() => data.teams.find((t) => t.id !== data.freeAgentTeamId)?.id ?? data.freeAgentTeamId);

  // The pool: the catalog loads when the tab first opens; each add is rated by the server
  // once (a preview) and that preview is what the team panel and the card show.
  const [catalog, setCatalog] = useState<CatalogPlayer[] | null>(null);
  const [catalogErr, setCatalogErr] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, GeneratedRosterPlayer>>({});
  const [previewErr, setPreviewErr] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const loadCatalog = useCallback(() => { setCatalogErr(null); api.catalog().then(setCatalog).catch((e) => setCatalogErr((e as Error).message)); }, []);
  useEffect(() => { if (tab === 'pool' && !catalog && !catalogErr) loadCatalog(); }, [tab, catalog, catalogErr, loadCatalog]);
  const fetchPreview = useCallback(async (key: string): Promise<GeneratedRosterPlayer | null> => {
    setAdding((s) => new Set(s).add(key));
    try {
      const g = await api.rosterPreviewAdd(key);
      setPreviews((p) => ({ ...p, [key]: g }));
      setPreviewErr((e) => { const n = { ...e }; delete n[key]; return n; });
      return g;
    } catch (e) {
      setPreviewErr((m) => ({ ...m, [key]: (e as Error).message }));
      return null;
    } finally {
      setAdding((s) => { const n = new Set(s); n.delete(key); return n; });
    }
  }, []);
  // A saved roster reopened: rate its adds again (the server caches them).
  useEffect(() => {
    for (const a of doc.adds) if (!previews[a.key] && !adding.has(a.key) && !previewErr[a.key]) fetchPreview(a.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.adds]);

  const players = useMemo(() => viewPlayers(doc, data, previews), [doc, data, previews]);
  const counts = docCounts(doc, data);
  const teams = useMemo(() => data.teams.filter((t) => t.id !== data.freeAgentTeamId).sort((a, b) => a.city.localeCompare(b.city)), [data]);
  const rows = useMemo(() => {
    let r = players.filter((p) => !p.added);
    if (team === 'FA') r = r.filter((p) => !p.team);
    else if (team !== 'ALL') r = r.filter((p) => p.team === team);
    if (group !== 'ALL') r = r.filter((p) => groupForId(p.positionId) === group);
    if (search.trim()) { const q = search.toLowerCase(); r = r.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q)); }
    return [...r].sort((a, b) => {
      if (sort === 'ovr') return b.overall - a.overall || a.lastName.localeCompare(b.lastName);
      if (sort === 'age') return a.age - b.age || b.overall - a.overall;
      if (sort === 'pos') return a.positionId - b.positionId || b.overall - a.overall;
      return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
    });
  }, [players, team, group, search, sort]);
  const teamRows = useMemo(() => groupByPosition(players.filter((p) => p.teamId === selectedTeam)).flatMap((g) => g.players), [players, selectedTeam]);

  const move = (pgid: number, teamId: number) => {
    if (readOnly) return;
    const vp = players.find((p) => p.id === pgid);
    if (vp?.added && vp.tempId) onChange(withAddMove(doc, vp.tempId, teamId));
    else onChange(withMove(doc, pgid, teamId, data));
  };
  const remove = (tempId: string) => { if (!readOnly) onChange(withoutAdd(doc, tempId)); };
  const dragStart = (pgid: number) => (e: React.DragEvent) => e.dataTransfer.setData('text/plain', String(pgid));
  const addFromPool = async (key: string) => {
    if (readOnly) return;
    const g = previews[key] ?? (await fetchPreview(key));
    if (g) onChange(withAdd(doc, key, selectedTeam));
  };
  const poolStatus = (key: string) => {
    const a = doc.adds.find((x) => x.key === key);
    if (!a) return adding.has(key) ? { label: 'Rating…' } : null;
    const t = data.teams.find((x) => x.id === a.teamId);
    return { label: a.teamId === data.freeAgentTeamId ? 'FA' : t?.abbr ?? '?', title: 'Added to this roster' };
  };

  // The profile card: the draft editor's, fed by the adapter; lookups load once.
  const [ctx, setCtx] = useState<CardCtx>(EMPTY_CTX);
  useEffect(() => {
    let alive = true;
    Promise.all([
      api.personaLookups().catch(() => ({ traits: [], focus: [] })),
      api.lookup('college').catch(() => [] as { id: number; name: string }[]),
      api.archetypesByPosition().catch(() => ({} as Record<string, ArchetypeOption[]>)),
    ]).then(([persona, colleges, archetypes]) => { if (alive) setCtx({ traits: persona.traits, focus: persona.focus, colleges, archetypes }); });
    return () => { alive = false; };
  }, []);
  const [editing, setEditing] = useState<number | null>(null);
  const [navSource, setNavSource] = useState<'roster' | 'team'>('roster');
  const openCard = (source: 'roster' | 'team') => (pgid: number) => { setNavSource(source); setEditing(pgid); };
  const navRows = navSource === 'roster' ? rows : teamRows;
  const navIndex = editing != null ? navRows.findIndex((p) => p.id === editing) : -1;
  const navigatePlayer = (delta: number) => { const next = navRows[navIndex + delta]; if (next) setEditing(next.id); };
  const editingPlayer = editing != null ? players.find((p) => p.id === editing) ?? null : null;
  const editKey: number | string | null = editingPlayer ? (editingPlayer.added ? editingPlayer.tempId ?? null : editingPlayer.id) : null;
  const editingBase: RosterPlayer | null = (() => {
    if (!editingPlayer) return null;
    if (editingPlayer.added) {
      const a = doc.adds.find((x) => x.tempId === editingPlayer.tempId);
      const g = a ? previews[a.key] : undefined;
      return a && g ? playerFromPreview(g, addId(a.tempId), a.teamId, a.jersey) : null;
    }
    return data.players.find((p) => p.id === editingPlayer.id) ?? null;
  })();
  const edit = (id: number | string, patch: PlayerFieldEdit) => { if (!readOnly) onChange(withEdit(doc, id, patch)); };

  const dirty = savedAt == null ? !isDocEmpty(doc) || !!doc.name : doc.updatedAt > savedAt;
  const save = async () => { await onSave(doc); setSavedAt(Date.now()); };
  const close = () => { if (dirty && !confirm('Close without saving? Unsaved moves and edits are lost.')) return; onClose(); };

  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<RosterBuildResult | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);
  /** Save, then have the server apply the document to the base and write ROSTER-<NAME>. A browsed
   *  file is not in the saves folder, so it is built from the server's kept copy by id. */
  const exportToMadden = async () => {
    if (readOnly) return;
    setExporting(true); setExportErr(null); setResult(null);
    try {
      await save();
      const r = await api.rosterBuild({ baseName: doc.base.fromSaves ? doc.base.fileName : undefined, baseId: doc.base.openedId, name: doc.name, moves: doc.moves, edits: doc.edits, adds: doc.adds, fresh });
      setResult(r);
    } catch (e) {
      setExportErr((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const previewProblems = doc.adds.filter((a) => previewErr[a.key]).map((a) => {
    const c = catalog?.find((p) => p.key === a.key);
    return `Could not rate ${c ? `${c.first} ${c.last}` : a.key} from the pool: ${previewErr[a.key]}. Remove him or try again.`;
  });
  const tabCls = (on: boolean) => `rounded-t-md px-3 py-1.5 text-xs font-semibold transition-colors ${on ? 'bg-surface-2 text-neutral-100' : 'text-neutral-400 hover:text-neutral-200'}`;
  const emptyText = fresh ? 'Nothing here yet. Add players from the Pool tab.' : 'Nobody here. Drag players in from the roster list.';

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <input value={doc.name} onChange={(e) => onChange({ ...doc, name: e.target.value, updatedAt: Date.now() })} placeholder="Roster name" disabled={readOnly}
            className="w-64 rounded-md border border-border bg-surface-0 px-3 py-1.5 text-sm font-semibold text-neutral-100 placeholder:font-normal placeholder:text-muted focus:border-primary focus:outline-none disabled:opacity-60" />
          <div className="text-xs text-neutral-400">
            {fresh ? <span className="text-neutral-200">from scratch</span> : <>from <span className="text-neutral-200">{doc.base.fileName}</span></>}
            {!fresh && <> · <b className="text-neutral-200">{counts.moved}</b> moved · <b className="text-neutral-200">{counts.cut}</b> cut</>}
            {' · '}<b className="text-neutral-200">{counts.edited}</b> edited · <b className="text-neutral-200">{counts.added}</b> added
          </div>
        </div>
        <div className="flex items-center gap-2">
          {readOnly ? (
            <button onClick={onRebase} className={btnCls}>Pick the base file again</button>
          ) : (
            <button onClick={save} disabled={!dirty} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-light disabled:opacity-50">{dirty ? 'Save' : 'Saved'}</button>
          )}
          <button onClick={exportToMadden} disabled={readOnly || exporting || !doc.name.trim()} title={doc.name.trim() ? '' : 'Name the roster first'}
            className="rounded-md bg-gold px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90 disabled:opacity-50">{exporting ? 'Writing…' : 'Export to Madden'}</button>
          <button onClick={close} className={btnCls}>Close</button>
        </div>
      </header>
      {notice && <div className="mx-6 mt-3 rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-gold">{notice}</div>}
      {previewProblems.map((m) => <div key={m} className="mx-6 mt-3 rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-gold">{m}</div>)}
      {exportErr && <div className="mx-6 mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-red-200">{exportErr}</div>}
      {result && (
        <div className="mx-6 mt-3 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-green-100">
          Wrote <code className="rounded bg-black/30 px-1">{result.output}</code> to the Madden 27 saves folder: {fresh ? '' : `${result.moved} moved, ${result.cut} cut, `}{result.edited} edited, {result.added} added. In Madden: Load and Save, then Load, then Roster.
          {result.skipped.length > 0 && <div className="mt-1 text-gold">Skipped: {result.skipped.join('; ')}</div>}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 px-6 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-1">
          <div className="flex items-center gap-1 border-b border-border px-2 pt-2">
            <button onClick={() => setTab('roster')} aria-pressed={tab === 'roster'} className={tabCls(tab === 'roster')}>Roster</button>
            <button onClick={() => setTab('pool')} aria-pressed={tab === 'pool'} className={tabCls(tab === 'pool')}>Pool</button>
          </div>
          {tab === 'roster' ? (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
                <div className="relative">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"><Icon path={ICONS.search} className="h-4 w-4" /></span>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search players…" className="w-48 rounded-md border border-border bg-surface-0 py-1.5 pl-8 pr-3 text-sm text-neutral-200 placeholder:text-muted focus:border-primary focus:outline-none" />
                </div>
                <select value={team} onChange={(e) => setTeam(e.target.value)} className={selectCls}>
                  <option value="ALL">All teams</option>
                  {teams.map((t) => <option key={t.id} value={t.abbr}>{t.city} {t.name}</option>)}
                  <option value="FA">Free agents</option>
                </select>
                <select value={group} onChange={(e) => setGroup(e.target.value)} className={selectCls}>
                  {GROUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={selectCls}>
                  <option value="ovr">Sort: Overall</option>
                  <option value="name">Sort: Name</option>
                  <option value="pos">Sort: Position</option>
                  <option value="age">Sort: Age</option>
                </select>
                <span className="ml-auto text-xs tabular-nums text-muted"><span className="font-semibold text-neutral-300">{rows.length}</span> of {fresh ? 0 : data.count}</span>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                {rows.length === 0 && <div className="px-3 py-8 text-center text-xs text-muted">{fresh ? 'Nothing here yet. Add players from the Pool tab.' : 'Nobody matches.'}</div>}
                {rows.slice(0, 1500).map((p) => <PlayerRow key={p.id} p={p} onClick={() => openCard('roster')(p.id)} onDragStart={readOnly ? undefined : dragStart(p.id)} />)}
                {rows.length > 1500 && <div className="px-3 py-3 text-center text-xs text-muted">Showing the first 1,500 of {rows.length}. Narrow by team or position.</div>}
              </div>
            </>
          ) : (
            <>
              <div className="border-b border-border px-3 py-1.5 text-[11px] text-muted">Rated by career, added to the selected team. Age is his draft age plus four; edit anything afterwards.</div>
              <CatalogPanel compact catalog={catalog} error={catalogErr} onRetry={loadCatalog} status={poolStatus} onAdd={addFromPool} addDisabled={readOnly} />
            </>
          )}
        </section>
        <TeamPanel data={data} players={players} selectedTeam={selectedTeam} onSelectTeam={setSelectedTeam} onMove={move} onRemove={remove} onEdit={openCard('team')} readOnly={readOnly} emptyText={emptyText} />
      </div>

      {editingPlayer && editingBase && editKey != null && (
        <ProfileModal
          mode="roster"
          footer="Edits save with the roster and apply on export."
          row={rowFor(editingBase, ctx)}
          patch={patchFor(doc.edits[editKey], editingBase)}
          gearPatch={{ ...rowFor(editingBase, ctx).gear, ...(doc.edits[editKey]?.gear ?? {}) }}
          year={2026}
          archetypeOptions={ctx.archetypes}
          gameVersion="m27"
          onEdit={(f, v) => { const e = editFromCard(f, v); if (e) edit(editKey, e); }}
          onGearEdit={(slot, asset) => edit(editKey, { gear: { [slot]: asset } })}
          onReset={() => { if (!readOnly) onChange(withoutEdits(doc, editKey)); }}
          onClose={() => setEditing(null)}
          onNavigate={navigatePlayer}
          canPrev={navIndex > 0}
          canNext={navIndex >= 0 && navIndex < navRows.length - 1}
        />
      )}
    </div>
  );
}
