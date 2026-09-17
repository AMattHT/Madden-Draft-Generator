import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type ArchetypeOption, type PlayerFieldEdit } from '../../api';
import type { CatalogPlayer, GeneratedRosterPlayer, RosterBuildResult, RosterData, RosterDoc, RosterPlayer, TeamInfo } from '../../types';
import { addId, docCounts, isDocEmpty, playerFromPreview, viewPlayers, withAdd, withAddMove, withEdit, withMove, withoutAdd, withoutEdits, type ViewPlayer } from '../../rosterDoc';
import { rowFor, patchFor, editFromCard, type CardCtx } from '../../rosterCard';
import { teamInfoMap } from '../../rosterTeams';
import { POS_NAMES } from '../../constants';
import { DevBadge, Icon, ICONS, Portrait, RatingChip, TeamLogo } from '../ui';
import { ProfileModal } from '../ProfileModal';
import { CatalogPanel } from '../CatalogPanel';
import { ALL_TEAMS, TeamPanel, TeamStrip } from './TeamPanel';

export const selectCls = 'rounded-md border border-border bg-surface-0 px-2.5 py-1.5 text-sm text-neutral-300 focus:border-primary focus:outline-none';
export const btnCls = 'rounded-md border border-border-strong bg-surface-2 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-surface-3 disabled:opacity-50';
const LIST_MAX = 1500;
const EMPTY_CTX: CardCtx = { traits: [], focus: [], colleges: [], archetypes: {} };

/** One row of the list: a roster player with his team mark. */
export function PlayerRow({ p, selected, onClick, onDragStart, trailing, logo }: {
  p: ViewPlayer; selected?: boolean; onClick?: () => void; onDragStart?: (e: React.DragEvent) => void; trailing?: React.ReactNode;
  /** The team's logo mark; text when absent. */
  logo?: TeamInfo;
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
      <span className={`inline-flex w-9 justify-end text-xs ${p.moved ? 'rounded ring-1 ring-gold/60' : ''} ${p.team ? '' : 'text-neutral-400'}`} title={`${p.teamName ?? 'Free agent'}${p.moved ? ' (moved)' : ''}`}>
        {p.team && logo ? <TeamLogo team={logo} size="sm" /> : (p.team ?? 'FA')}
      </span>
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
  const [pos, setPos] = useState('ALL');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'pos' | 'ovr' | 'name' | 'age'>('pos');
  // The strip's first team (alphabetical by abbreviation) starts selected.
  const [selectedTeam, setSelectedTeam] = useState<number>(() => [...data.teams].filter((t) => t.id !== data.freeAgentTeamId).sort((a, b) => a.abbr.localeCompare(b.abbr))[0]?.id ?? ALL_TEAMS);

  // The pool: the catalog loads when the tab first opens; each add is rated by the server
  // once (a preview) and that preview is what the list and the card show.
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
  // Team logos from the app's franchise list, matched to the roster's teams by nickname.
  const [logos, setLogos] = useState<Map<number, TeamInfo>>(new Map());
  useEffect(() => {
    let alive = true;
    api.franchises().then((f) => { if (alive) setLogos(teamInfoMap(data.teams, f)); }).catch(() => {});
    return () => { alive = false; };
  }, [data.teams]);
  const isAdded = useCallback((key: string) => doc.adds.some((a) => a.key === key), [doc.adds]);

  // The one list: the selected team (or everyone), then position group, search and sort.
  const teamOnly = selectedTeam !== ALL_TEAMS;
  const filtered = useMemo(() => {
    let r = teamOnly ? players.filter((p) => p.teamId === selectedTeam) : players;
    if (pos !== 'ALL') r = r.filter((p) => p.position === pos);
    if (search.trim()) { const q = search.toLowerCase(); r = r.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q)); }
    return [...r].sort((a, b) => {
      if (sort === 'ovr') return b.overall - a.overall || a.lastName.localeCompare(b.lastName);
      if (sort === 'age') return a.age - b.age || b.overall - a.overall;
      if (sort === 'name') return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
      return a.positionId - b.positionId || b.overall - a.overall;
    });
  }, [players, selectedTeam, teamOnly, pos, search, sort]);
  // The whole file is long; a team is never cut short.
  const rows = useMemo(() => (teamOnly ? filtered : filtered.slice(0, LIST_MAX)), [filtered, teamOnly]);
  const grouped = teamOnly && sort === 'pos';

  const move = (pgid: number, teamId: number) => {
    if (readOnly) return;
    const vp = players.find((p) => p.id === pgid);
    if (vp?.added && vp.tempId) onChange(withAddMove(doc, vp.tempId, teamId));
    else onChange(withMove(doc, pgid, teamId, data));
  };
  const remove = (tempId: string) => { if (!readOnly) onChange(withoutAdd(doc, tempId)); };
  // With a team selected, Add places the player there; on All, each row's Add asks which team.
  const addTarget = selectedTeam === ALL_TEAMS ? null : selectedTeam;
  const addTeams = useMemo(() => {
    if (addTarget != null) return undefined;
    const fa = data.freeAgentTeamId;
    return [...data.teams.filter((t) => t.id !== fa).sort((a, b) => a.abbr.localeCompare(b.abbr)).map((t) => ({ id: t.id, label: t.abbr })), { id: fa, label: 'Free agents' }];
  }, [addTarget, data]);
  const addFromPool = async (key: string, teamId?: number) => {
    const target = teamId ?? addTarget;
    if (readOnly || target == null) return;
    const g = previews[key] ?? (await fetchPreview(key));
    if (g) onChange(withAdd(doc, key, target));
  };
  const poolStatus = (key: string) => (adding.has(key) ? { label: 'Rating…' } : null);
  const selectedName = selectedTeam === ALL_TEAMS ? 'every player' : selectedTeam === data.freeAgentTeamId ? 'free agency' : (() => { const t = data.teams.find((x) => x.id === selectedTeam); return t ? `${t.city} ${t.name}` : 'the selected team'; })();

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
  const navIndex = editing != null ? rows.findIndex((p) => p.id === editing) : -1;
  const navigatePlayer = (delta: number) => { const next = rows[navIndex + delta]; if (next) setEditing(next.id); };
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
  const tabCls = (on: boolean) => `rounded-md px-3 py-1 text-xs font-semibold transition-colors ${on ? 'bg-primary text-white' : 'text-neutral-400 hover:bg-surface-2 hover:text-neutral-200'}`;
  const emptyText = fresh
    ? 'Nothing here yet. Switch to the Pool and add players.'
    : search.trim() || pos !== 'ALL' ? 'Nobody matches.' : 'Nobody here. Switch to the Pool, or drag players onto a team above.';

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

      <TeamStrip data={data} players={players} logos={logos} selectedTeam={selectedTeam} onSelectTeam={setSelectedTeam} onMove={move} readOnly={readOnly} />

      <section className="mx-6 my-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface-1">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <div className="flex items-center gap-0.5 rounded-lg border border-border-strong bg-surface-0 p-0.5">
            <button onClick={() => setTab('roster')} aria-pressed={tab === 'roster'} className={tabCls(tab === 'roster')}>Roster</button>
            <button onClick={() => setTab('pool')} aria-pressed={tab === 'pool'} className={tabCls(tab === 'pool')}>Pool</button>
          </div>
          {tab === 'roster' ? (
            <>
              <div className="relative">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"><Icon path={ICONS.search} className="h-4 w-4" /></span>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search players…" className="w-48 rounded-md border border-border bg-surface-0 py-1.5 pl-8 pr-3 text-sm text-neutral-200 placeholder:text-muted focus:border-primary focus:outline-none" />
              </div>
              <select value={pos} onChange={(e) => setPos(e.target.value)} className={selectCls} title="Madden position">
                <option value="ALL">All positions</option>
                {POS_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={selectCls}>
                <option value="pos">Sort: Position</option>
                <option value="ovr">Sort: Overall</option>
                <option value="name">Sort: Name</option>
                <option value="age">Sort: Age</option>
              </select>
              <span className="ml-auto text-xs tabular-nums text-muted"><span className="font-semibold text-neutral-300">{filtered.length.toLocaleString()}</span> {selectedTeam === ALL_TEAMS ? `of ${players.length.toLocaleString()}` : `on ${selectedName}`}</span>
            </>
          ) : (
            <span className="ml-auto text-[11px] text-muted">{addTarget == null ? 'Add to… picks the team for each player, rated by career; edit anything afterwards.' : `Add places a player on ${selectedName}, rated by career; edit anything afterwards.`}</span>
          )}
        </div>
        {tab === 'roster' ? (
          <TeamPanel data={data} players={rows} truncated={filtered.length > rows.length} grouped={grouped} logos={logos} selectedTeam={selectedTeam} onMove={move} onRemove={remove} onEdit={setEditing} readOnly={readOnly} emptyText={emptyText} />
        ) : (
          <CatalogPanel compact catalog={catalog} error={catalogErr} onRetry={loadCatalog} status={poolStatus} hidden={isAdded} onAdd={addFromPool} addDisabled={readOnly} addTeams={addTeams} />
        )}
      </section>

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
          canNext={navIndex >= 0 && navIndex < rows.length - 1}
        />
      )}
    </div>
  );
}
