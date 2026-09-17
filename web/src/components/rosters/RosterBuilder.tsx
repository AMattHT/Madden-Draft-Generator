import { useMemo, useState } from 'react';
import type { RosterData, RosterDoc } from '../../types';
import { docCounts, isDocEmpty, viewPlayers, type ViewPlayer } from '../../rosterDoc';
import { groupForId } from '../../constants';
import { DevBadge, Icon, ICONS, Portrait, RatingChip } from '../ui';

const GROUPS: [string, string][] = [
  ['ALL', 'All positions'], ['QB', 'QB'], ['RB', 'RB'], ['WR', 'WR'], ['TE', 'TE'], ['OL', 'OL'],
  ['EDGE', 'EDGE'], ['IDL', 'IDL'], ['LB', 'LB'], ['CB', 'CB'], ['S', 'S'], ['K', 'K'], ['P', 'P'],
];
export const selectCls = 'rounded-md border border-border bg-surface-0 px-2.5 py-1.5 text-sm text-neutral-300 focus:border-primary focus:outline-none';
export const btnCls = 'rounded-md border border-border-strong bg-surface-2 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-surface-3 disabled:opacity-50';

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
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [team, setTeam] = useState('ALL');
  const [group, setGroup] = useState('ALL');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'ovr' | 'name' | 'age' | 'pos'>('ovr');

  const players = useMemo(() => viewPlayers(doc, data), [doc, data]);
  const counts = docCounts(doc, data);
  const teams = useMemo(() => data.teams.filter((t) => t.id !== data.freeAgentTeamId).sort((a, b) => a.city.localeCompare(b.city)), [data]);
  const rows = useMemo(() => {
    let r = players;
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

  const dirty = savedAt == null ? !isDocEmpty(doc) || !!doc.name : doc.updatedAt > savedAt;
  const save = async () => { await onSave(doc); setSavedAt(Date.now()); };
  const close = () => { if (dirty && !confirm('Close without saving? Unsaved moves and edits are lost.')) return; onClose(); };

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <input value={doc.name} onChange={(e) => onChange({ ...doc, name: e.target.value, updatedAt: Date.now() })} placeholder="Roster name" disabled={readOnly}
            className="w-64 rounded-md border border-border bg-surface-0 px-3 py-1.5 text-sm font-semibold text-neutral-100 placeholder:font-normal placeholder:text-muted focus:border-primary focus:outline-none disabled:opacity-60" />
          <div className="text-xs text-neutral-400">
            from <span className="text-neutral-200">{doc.base.fileName}</span> · <b className="text-neutral-200">{counts.moved}</b> moved · <b className="text-neutral-200">{counts.cut}</b> cut · <b className="text-neutral-200">{counts.edited}</b> edited
          </div>
        </div>
        <div className="flex items-center gap-2">
          {readOnly ? (
            <button onClick={onRebase} className={btnCls}>Pick the base file again</button>
          ) : (
            <button onClick={save} disabled={!dirty} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-light disabled:opacity-50">{dirty ? 'Save' : 'Saved'}</button>
          )}
          <button onClick={close} className={btnCls}>Close</button>
        </div>
      </header>
      {notice && <div className="mx-6 mt-3 rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-gold">{notice}</div>}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 px-6 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-1">
          <div className="flex items-center gap-1 border-b border-border px-2 pt-2">
            <span className="rounded-t-md bg-surface-2 px-3 py-1.5 text-xs font-semibold text-neutral-100">Roster</span>
          </div>
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
            <span className="ml-auto text-xs tabular-nums text-muted"><span className="font-semibold text-neutral-300">{rows.length}</span> of {data.count}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {rows.slice(0, 1500).map((p) => <PlayerRow key={p.id} p={p} />)}
            {rows.length > 1500 && <div className="px-3 py-3 text-center text-xs text-muted">Showing the first 1,500 of {rows.length}. Narrow by team or position.</div>}
          </div>
        </section>
        <section className="flex min-h-0 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted">Teams</section>
      </div>
    </div>
  );
}
