import { useMemo, useState } from 'react';
import type { RosterData, TeamInfo } from '../../types';
import { groupByPosition, type ViewPlayer } from '../../rosterDoc';
import { PlayerRow, btnCls, selectCls } from './RosterBuilder';
import { TeamLogo } from '../ui';

const ROSTER_LIMIT = 53;

/** The full-width team strip: every team as a large logo with its roster count beneath, the
 *  selected one highlighted, each a drop target for a dragged player. Free agency is the last tile. */
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
    if (readOnly) return;
    const pgid = Number(e.dataTransfer.getData('text/plain'));
    if (pgid) onMove(pgid, teamId);
  };
  const allowDrop = (teamId: number) => (e: React.DragEvent) => { if (!readOnly) { e.preventDefault(); setDragOver(teamId); } };
  const tile = (id: number, label: string, title: string, n: number, over: boolean, logo?: TeamInfo) => (
    <button key={id} onClick={() => onSelectTeam(id)} onDragOver={allowDrop(id)} onDragLeave={() => setDragOver(null)} onDrop={drop(id)}
      title={title} aria-pressed={id === selectedTeam}
      className={`flex w-14 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 transition-colors ${id === selectedTeam ? 'bg-primary/20 ring-1 ring-primary' : over ? 'bg-primary/10 ring-1 ring-primary/60' : 'hover:bg-surface-2'}`}>
      {logo ? <TeamLogo team={logo} size="lg" /> : <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-[11px] font-bold text-neutral-300">{label}</span>}
      <span className={`text-[11px] font-semibold tabular-nums ${id !== fa && n > ROSTER_LIMIT ? 'text-red-300' : id === selectedTeam ? 'text-neutral-100' : 'text-neutral-400'}`}>{n}</span>
    </button>
  );
  return (
    <div className="flex flex-wrap items-start gap-0.5 border-b border-border px-4 py-2">
      {teams.map((t) => tile(t.id, t.abbr, `${t.city} ${t.name}`, counts.get(t.id) ?? 0, dragOver === t.id, logos.get(t.id)))}
      {tile(fa, 'FA', 'Free agents', counts.get(fa) ?? 0, dragOver === fa)}
    </div>
  );
}

/** The selected team's roster grouped by position. Rows can be moved with a menu, cut,
 *  edited, or dragged onto a team in the strip above. */
export function TeamPanel({ data, players, selectedTeam, onMove, onRemove, onEdit, readOnly, emptyText, logos }: {
  data: RosterData;
  players: ViewPlayer[];
  /** Team id -> logo mark; teams without one show their abbreviation. */
  logos: Map<number, TeamInfo>;
  selectedTeam: number;
  onMove: (pgid: number, teamId: number) => void;
  /** Take an added pool player off the roster entirely (he is not in the base file). */
  onRemove: (tempId: string) => void;
  onEdit: (pgid: number) => void;
  readOnly: boolean;
  /** Shown when the selected team has nobody. */
  emptyText?: string;
}) {
  const [moving, setMoving] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const fa = data.freeAgentTeamId;
  const teams = useMemo(() => data.teams.filter((t) => t.id !== fa).sort((a, b) => a.abbr.localeCompare(b.abbr)), [data, fa]);
  const onTeam = useMemo(() => players.filter((p) => p.teamId === selectedTeam), [players, selectedTeam]);
  const groups = useMemo(() => groupByPosition(onTeam), [onTeam]);
  const selected = data.teams.find((t) => t.id === selectedTeam);
  const isFa = selectedTeam === fa;

  const drop = (teamId: number) => (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(null);
    if (readOnly) return;
    const pgid = Number(e.dataTransfer.getData('text/plain'));
    if (pgid) onMove(pgid, teamId);
  };
  const allowDrop = (teamId: number) => (e: React.DragEvent) => { if (!readOnly) { e.preventDefault(); setDragOver(teamId); } };

  return (
    <section className={`flex min-h-0 flex-col overflow-hidden rounded-lg border bg-surface-1 ${dragOver === selectedTeam ? 'border-primary/60' : 'border-border'}`}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          {!isFa && logos.get(selectedTeam) && <TeamLogo team={logos.get(selectedTeam)} size="md" />}
          <div className="text-sm font-bold text-neutral-100">{isFa ? 'Free agents' : selected ? `${selected.city} ${selected.name}` : ''}</div>
        </div>
        <div className="text-xs tabular-nums text-muted">
          {isFa ? `${onTeam.length} players` : <><span className={onTeam.length > ROSTER_LIMIT ? 'font-semibold text-red-300' : 'font-semibold text-neutral-300'}>{onTeam.length}</span> of {ROSTER_LIMIT}</>}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto" onDragOver={allowDrop(selectedTeam)} onDrop={drop(selectedTeam)}>
        {onTeam.length === 0 && <div className="px-3 py-8 text-center text-xs text-muted">{emptyText ?? 'Nobody here. Drag players in from the roster list.'}</div>}
        {groups.map((g) => (
          <div key={g.position}>
            <div className="sticky top-0 z-10 flex items-baseline justify-between bg-surface-2 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
              <span>{g.position}</span><span className="tabular-nums">{g.players.length}</span>
            </div>
            {g.players.map((p) => (
              <PlayerRow key={p.id} p={p} logo={logos.get(p.teamId)} onDragStart={readOnly ? undefined : (e) => e.dataTransfer.setData('text/plain', String(p.id))}
                trailing={
                  <span className="flex items-center gap-1">
                    {moving === p.id ? (
                      <select autoFocus defaultValue="" onBlur={() => setMoving(null)} onChange={(e) => { const v = Number(e.target.value); setMoving(null); if (v) onMove(p.id, v); }} className={`${selectCls} px-1 py-0.5 text-xs`}>
                        <option value="">Move to…</option>
                        {teams.filter((t) => t.id !== p.teamId).map((t) => <option key={t.id} value={t.id}>{t.abbr}</option>)}
                        {!isFa && <option value={fa}>Free agents</option>}
                      </select>
                    ) : (
                      <>
                        <button disabled={readOnly} onClick={() => setMoving(p.id)} className={`${btnCls} px-2 py-0.5`}>Move to…</button>
                        {p.added && p.tempId ? (
                          <button disabled={readOnly} onClick={() => onRemove(p.tempId!)} className={`${btnCls} px-2 py-0.5`} title="Take him off this roster">Remove</button>
                        ) : (
                          !isFa && <button disabled={readOnly} onClick={() => onMove(p.id, fa)} className={`${btnCls} px-2 py-0.5`}>Cut</button>
                        )}
                        <button disabled={readOnly} onClick={() => onEdit(p.id)} className={`${btnCls} px-2 py-0.5`}>Edit</button>
                      </>
                    )}
                  </span>
                } />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
