import { useMemo, useState } from 'react';
import type { RosterData, TeamInfo } from '../../types';
import { groupByPosition, type ViewPlayer } from '../../rosterDoc';
import { PlayerRow, btnCls } from './RosterBuilder';
import { pickTeams } from '../../teamMatch';
import { TeamPicker } from '../TeamPicker';
import { TeamLogo } from '../ui';
import { VirtualList } from '../VirtualList';

/** PlayerRow height (h-10), shared with the windowed list. */
const ROW_H = 40;

const ROSTER_LIMIT = 53;
/** The strip's first tile: every player in the file, no team filter. */
export const ALL_TEAMS = -1;

/** The full-width team strip: every team as a large logo with its roster count beneath, the
 *  selected one highlighted, each a drop target for a dragged player. "All" first, free agency last. */
export function TeamStrip({ data, players, logos, selectedTeam, onSelectTeam, onMove, readOnly }: {
  data: RosterData;
  players: ViewPlayer[];
  logos: Map<number, TeamInfo>;
  selectedTeam: number;
  onSelectTeam: (teamId: number) => void;
  onMove: (pgid: number, teamId: number) => void;
  readOnly: boolean;
}) {
  const [dragOver, setDragOver] = useState<number | null>(null);
  const fa = data.freeAgentTeamId;
  const teams = useMemo(() => data.teams.filter((t) => t.id !== fa).sort((a, b) => a.abbr.localeCompare(b.abbr)), [data, fa]);
  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of players) m.set(p.teamId, (m.get(p.teamId) ?? 0) + 1);
    return m;
  }, [players]);
  const drop = (teamId: number) => (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(null);
    if (readOnly || teamId === ALL_TEAMS) return;
    const pgid = Number(e.dataTransfer.getData('text/plain'));
    if (pgid) onMove(pgid, teamId);
  };
  const allowDrop = (teamId: number) => (e: React.DragEvent) => { if (!readOnly && teamId !== ALL_TEAMS) { e.preventDefault(); setDragOver(teamId); } };
  const tile = (id: number, label: string, title: string, n: number, over: boolean, logo?: TeamInfo) => (
    <button key={id} onClick={() => onSelectTeam(id)} onDragOver={allowDrop(id)} onDragLeave={() => setDragOver(null)} onDrop={drop(id)}
      title={title} aria-pressed={id === selectedTeam}
      className={`flex w-14 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 transition-colors ${id === selectedTeam ? 'bg-primary/20 ring-1 ring-primary' : over ? 'bg-primary/10 ring-1 ring-primary/60' : 'hover:bg-white/[0.06]'}`}>
      {logo ? <TeamLogo team={logo} size="lg" /> : <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-[11px] font-bold text-neutral-300">{label}</span>}
      <span className={`text-[11px] font-semibold tabular-nums ${id !== fa && id !== ALL_TEAMS && n > ROSTER_LIMIT ? 'text-red-300' : id === selectedTeam ? 'text-neutral-100' : 'text-neutral-400'}`}>{n}</span>
    </button>
  );
  return (
    <div className="flex flex-wrap items-start gap-0.5 border-b border-white/[0.06] px-4 py-2">
      {tile(ALL_TEAMS, 'All', 'Every player', players.length, false)}
      {teams.map((t) => tile(t.id, t.abbr, `${t.city} ${t.name}`, counts.get(t.id) ?? 0, dragOver === t.id, logos.get(t.id)))}
      {tile(fa, 'FA', 'Free agents', counts.get(fa) ?? 0, dragOver === fa)}
    </div>
  );
}

/** The one list: the selected team's players grouped by position (or every player, flat),
 *  each row with Move to…, Cut or Remove, and Edit; rows drag onto the strip above. */
export function TeamPanel({ data, players, grouped, selectedTeam, onMove, onRemove, onEdit, readOnly, emptyText, logos }: {
  data: RosterData;
  /** Already filtered and sorted by the builder. */
  players: ViewPlayer[];
  /** Group by position with headers (a single team) or list flat (the whole file). */
  grouped: boolean;
  selectedTeam: number;
  onMove: (pgid: number, teamId: number) => void;
  /** Take an added pool player off the roster entirely (he is not in the base file). */
  onRemove: (tempId: string) => void;
  onEdit: (pgid: number) => void;
  readOnly: boolean;
  emptyText: string;
  /** Team id -> logo mark; teams without one show their abbreviation. */
  logos: Map<number, TeamInfo>;
}) {
  const [moving, setMoving] = useState<number | null>(null);
  const fa = data.freeAgentTeamId;
  const pickable = useMemo(() => pickTeams(data, logos), [data, logos]);
  const groups = useMemo(() => (grouped ? groupByPosition(players) : [{ position: '', players }]), [players, grouped]);

  const row = (p: ViewPlayer) => (
    <PlayerRow key={p.id} p={p} logo={logos.get(p.teamId)} onClick={() => onEdit(p.id)} onDragStart={readOnly ? undefined : (e) => e.dataTransfer.setData('text/plain', String(p.id))}
      trailing={
        <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {moving === p.id ? (
            <TeamPicker autoFocus placeholder="Move to…" teams={pickable.filter((t) => t.id !== p.teamId)} onPick={(v) => { setMoving(null); onMove(p.id, v); }} onCancel={() => setMoving(null)} />
          ) : (
            <>
              <button disabled={readOnly} onClick={() => setMoving(p.id)} className={`${btnCls} px-2 py-0.5`}>Move to…</button>
              {p.added && p.tempId ? (
                <button disabled={readOnly} onClick={() => onRemove(p.tempId!)} className={`${btnCls} px-2 py-0.5`} title="Take him off this roster">Remove</button>
              ) : (
                p.teamId !== fa && <button disabled={readOnly} onClick={() => onMove(p.id, fa)} className={`${btnCls} px-2 py-0.5`}>Cut</button>
              )}
            </>
          )}
        </span>
      } />
  );

  const empty = players.length === 0 && <div className="px-3 py-8 text-center text-xs text-muted">{emptyText}</div>;
  // The whole file (thousands of rows) is windowed; a team is small enough to render whole, with its position headers.
  if (!grouped) return <VirtualList items={players} rowHeight={ROW_H} keyOf={(p) => p.id} before={empty} render={row} />;
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {empty}
      {groups.map((g) => (
        <div key={g.position || 'all'}>
          {g.position && (
            <div className="sticky top-0 z-10 flex items-baseline justify-between bg-surface-2 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
              <span>{g.position}</span><span className="tabular-nums">{g.players.length}</span>
            </div>
          )}
          {g.players.map(row)}
        </div>
      ))}
    </div>
  );
}

export { ROSTER_LIMIT };
