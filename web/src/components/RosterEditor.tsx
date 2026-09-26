import { useEffect, useMemo, useState } from 'react';
import { api, type FranchisePlayer, type PlayerFieldEdit } from '../api';
import type { GearOption } from '../types';
import { tierColor } from '../constants';
import { PlayerEditPanel } from './PlayerEditPanel';

const POSITIONS = ['QB', 'HB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'LE', 'RE', 'DT', 'LOLB', 'MLB', 'ROLB', 'CB', 'FS', 'SS', 'K', 'P', 'LS'];
const inputCls = 'rounded-md border border-white/[0.07] bg-black/30 px-2 py-1 text-sm text-neutral-200 focus:border-primary focus:outline-none';

/** Per-player franchise roster editor. Uses the save chosen in the shared FranchiseView
 *  header (`save` prop); loading the full player list is explicit (it's a big read). */
export function RosterEditor({ save, onWrote }: { save: string; onWrote?: () => void }) {
  const [teams, setTeams] = useState<{ index: number; name: string }[]>([]);
  const [players, setPlayers] = useState<FranchisePlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [teamFilter, setTeamFilter] = useState<number | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<number, PlayerFieldEdit>>({});

  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ output: string; playersEdited: number } | null>(null);
  const [applyErr, setApplyErr] = useState<string | null>(null);

  const [gearOpts, setGearOpts] = useState<Record<string, GearOption[]>>({});
  const [heads, setHeads] = useState<Record<string, string[]>>({});

  useEffect(() => {
    api.equipmentOptions(2025).then(setGearOpts).catch(() => {});
    api.genericHeads().then(setHeads).catch(() => {});
  }, []);

  // Reset everything when the shared save changes — a loaded roster from a different file is stale.
  useEffect(() => {
    setTeams([]); setPlayers([]); setSelectedId(null); setEdits({}); setResult(null); setLoadErr(null);
  }, [save]);

  async function loadRoster() {
    if (!save) return;
    setLoading(true); setLoadErr(null); setPlayers([]); setTeams([]); setSelectedId(null); setEdits({}); setResult(null);
    try {
      const r = await api.franchisePlayers(save);
      setTeams(r.teams);
      setPlayers(r.players);
      setTeamFilter(r.teams[0]?.index ?? 'all');
    } catch (e) {
      setLoadErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = players;
    if (q) list = list.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q));
    else if (teamFilter !== 'all') list = list.filter((p) => p.teamIndex === teamFilter);
    return list.sort((a, b) => b.overall - a.overall).slice(0, 250);
  }, [players, search, teamFilter]);

  // Merge a patch into a player's edits; ratings and gear merge one level deep.
  const editPlayer = (id: number, patch: PlayerFieldEdit) => setEdits((prev) => {
    const cur = prev[id] ?? {};
    const next: PlayerFieldEdit = { ...cur, ...patch };
    if (patch.ratings) next.ratings = { ...(cur.ratings ?? {}), ...patch.ratings };
    if (patch.gear) next.gear = { ...(cur.gear ?? {}), ...patch.gear };
    return { ...prev, [id]: next };
  });

  const sel = selectedId != null ? byId.get(selectedId) : null;
  const e = selectedId != null ? edits[selectedId] : undefined;
  const editedCount = Object.keys(edits).length;

  async function apply() {
    if (!save || editedCount === 0) return;
    setApplying(true); setApplyErr(null); setResult(null);
    try {
      setResult(await api.franchiseRosterApply(save, edits));
      onWrote?.();
    } catch (err) {
      setApplyErr((err as Error).message);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-3 overflow-hidden px-6 py-5">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          onClick={loadRoster}
          disabled={loading || !save}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {loading ? 'Loading…' : players.length ? 'Reload roster' : 'Load roster'}
        </button>
        {players.length > 0 && (
          <>
            <select value={String(teamFilter)} onChange={(ev) => { setTeamFilter(ev.target.value === 'all' ? 'all' : Number(ev.target.value)); setSearch(''); }} className={inputCls}>
              <option value="all">All teams</option>
              {teams.map((t) => <option key={t.index} value={t.index}>{t.name}</option>)}
            </select>
            <input value={search} onChange={(ev) => setSearch(ev.target.value)} placeholder="Search players…" className={`${inputCls} w-48`} />
            <span className="text-xs text-muted">{filtered.length} shown</span>
            <div className="ml-auto flex items-center gap-2">
              {editedCount > 0 && <span className="text-xs font-medium text-gold">{editedCount} edited</span>}
              <button
                onClick={apply}
                disabled={applying || editedCount === 0}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-40"
              >
                {applying ? 'Applying…' : 'Apply → new save'}
              </button>
            </div>
          </>
        )}
      </div>

      {loadErr && <div className="shrink-0 rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-red-200">{loadErr}</div>}
      {applyErr && <div className="shrink-0 rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-red-200">{applyErr}</div>}
      {result && (
        <div className="shrink-0 rounded-lg border border-success/40 bg-success/10 px-4 py-2 text-sm text-green-100">
          Wrote <code className="rounded bg-black/30 px-1">{result.output}</code> — {result.playersEdited} players edited. Load it in Madden (Franchise → Load).
        </div>
      )}

      {players.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-center text-muted">
          <div className="text-sm">{save ? 'Load the roster to edit any player’s ratings, position, age, and dev trait.' : 'Pick a save above first.'}</div>
          <div className="text-xs text-neutral-700">Edits write a new <code className="rounded bg-black/30 px-1">CAREER-…-ROSTER</code> file; your original is untouched.</div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_26rem]">
          {/* player list */}
          <div className="min-h-0 overflow-auto glass rounded-xl">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-2 text-[11px] uppercase tracking-wide text-neutral-400">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Player</th>
                  <th className="px-2 py-2 text-left font-semibold">Pos</th>
                  <th className="px-2 py-2 text-right font-semibold">OVR</th>
                  <th className="px-2 py-2 text-right font-semibold">Age</th>
                  <th className="px-2 py-2 text-left font-semibold">Dev</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const ed = edits[p.id];
                  const ov = ed?.overall ?? p.overall;
                  return (
                    <tr key={p.id} onClick={() => setSelectedId(p.id)}
                      className={`cursor-pointer border-t border-white/[0.05] ${p.id === selectedId ? 'bg-primary/10' : 'hover:bg-white/[0.035]'}`}>
                      <td className="px-3 py-1.5 font-medium text-neutral-100">
                        {ed && <span className="mr-1 text-gold" title="edited">●</span>}{p.firstName} {p.lastName}
                      </td>
                      <td className="px-2 py-1.5 text-neutral-400">{ed?.position ?? p.position}</td>
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums" style={{ color: tierColor(ov) }}>{ov}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-neutral-400">{ed?.age ?? p.age}</td>
                      <td className="px-2 py-1.5 text-neutral-400">{ed?.dev ?? p.dev}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* editor */}
          <div className="min-h-0 overflow-auto glass rounded-xl">
            {!sel ? (
              <div className="flex h-full items-center justify-center p-4 text-sm text-muted">Select a player to edit</div>
            ) : (
              <PlayerEditPanel
                title={`${sel.firstName} ${sel.lastName}`}
                subtitle={`${sel.team || sel.status} · ${sel.yearsPro} yrs pro`}
                positions={POSITIONS}
                player={{ position: sel.position, overall: sel.overall, age: sel.age, dev: sel.dev, jersey: sel.jersey, ratings: sel.ratings, bodyType: sel.bodyType, genericHead: sel.genericHead, helmet: sel.helmet, facemask: sel.facemask }}
                edit={e}
                onEdit={(patch) => editPlayer(sel.id, patch)}
                heads={heads}
                gearOpts={gearOpts}
                gameVersion="m26"
                year={2025}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
