import { useEffect, useMemo, useState } from 'react';
import { api, type FranchisePlayer, type PlayerFieldEdit } from '../api';
import type { GearOption } from '../types';
import { ATTR_GROUPS, humanize, tierColor, POS_NAMES } from '../constants';
import { GearEditor } from './GearEditor';
import { Icon, ICONS } from './ui';

const POSITIONS = ['QB', 'HB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'LE', 'RE', 'DT', 'LOLB', 'MLB', 'ROLB', 'CB', 'FS', 'SS', 'K', 'P', 'LS'];
const DEVS = ['Normal', 'Star', 'Superstar', 'XFactor'];
const inputCls = 'rounded-md border border-border bg-surface-0 px-2 py-1 text-sm text-neutral-200 focus:border-primary focus:outline-none';

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
  const [gearOpen, setGearOpen] = useState(false);
  const [heads, setHeads] = useState<Record<string, string[]>>({});
  const [headTone, setHeadTone] = useState(4);

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

  const editPlayer = (id: number, patch: PlayerFieldEdit) => setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  const editRating = (id: number, k: string, v: number) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ratings: { ...(prev[id]?.ratings || {}), [k]: v } } }));

  const sel = selectedId != null ? byId.get(selectedId) : null;
  const e = selectedId != null ? edits[selectedId] : undefined;
  const eff = {
    overall: e?.overall ?? sel?.overall ?? 0,
    age: e?.age ?? sel?.age ?? 0,
    dev: e?.dev ?? sel?.dev ?? 'Normal',
    position: e?.position ?? sel?.position ?? '',
    jersey: e?.jersey ?? sel?.jersey ?? 0,
    bodyType: e?.bodyType ?? sel?.bodyType ?? 'Standard',
    genericHead: e?.genericHead ?? sel?.genericHead ?? '',
    rating: (k: string) => e?.ratings?.[k] ?? sel?.ratings[k] ?? 0,
  };
  const editedCount = Object.keys(edits).length;

  // Face (generic head) picker: pool for the chosen tone; edit stores the gen_ code.
  useEffect(() => {
    const m = (sel?.genericHead || '').match(/^gen_(\d+)/i);
    setHeadTone(m ? parseInt(m[1], 10) : 4);
  }, [selectedId, sel?.genericHead]);
  const headPool = heads[String(headTone)] ?? [];
  const headIdx = headPool.indexOf(eff.genericHead);
  const pickHead = (i: number) => { if (headPool.length && sel) editPlayer(sel.id, { genericHead: headPool[((i % headPool.length) + headPool.length) % headPool.length] }); };
  // Gear for the GearEditor: current helmet/facemask merged with any pending edits.
  const gearPatch: Record<string, string> = { ...(sel ? { helmet: sel.helmet, facemask: sel.facemask } : {}), ...(e?.gear ?? {}) };
  const editGear = (slot: string, asset: string) => { if (sel) editPlayer(sel.id, { gear: { ...(edits[sel.id]?.gear ?? {}), [slot]: asset } }); };

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
          <div className="min-h-0 overflow-auto rounded-lg border border-border bg-surface-1">
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
                      className={`cursor-pointer border-t border-border/50 ${p.id === selectedId ? 'bg-primary/10' : 'hover:bg-surface-2/70'}`}>
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
          <div className="min-h-0 overflow-auto rounded-lg border border-border bg-surface-1">
            {!sel ? (
              <div className="flex h-full items-center justify-center p-4 text-sm text-muted">Select a player to edit</div>
            ) : (
              <>
                <div className="sticky top-0 z-10 border-b border-border bg-surface-1 px-4 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-base font-bold text-neutral-50">{sel.firstName} {sel.lastName}</div>
                    <div className="text-lg font-bold tabular-nums" style={{ color: tierColor(eff.overall) }}>{eff.overall}</div>
                  </div>
                  <div className="text-xs text-muted">{sel.team || sel.status} · {sel.yearsPro} yrs pro</div>
                </div>

                <div className="p-4">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-wider text-muted">Overall</span>
                      <input type="number" min={0} max={99} value={eff.overall} onChange={(ev) => editPlayer(sel.id, { overall: Number(ev.target.value) })} className={inputCls} /></label>
                    <label className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-wider text-muted">Age</span>
                      <input type="number" min={18} max={50} value={eff.age} onChange={(ev) => editPlayer(sel.id, { age: Number(ev.target.value) })} className={inputCls} /></label>
                    <label className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-wider text-muted">Position</span>
                      <select value={eff.position} onChange={(ev) => editPlayer(sel.id, { position: ev.target.value })} className={inputCls}>
                        {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select></label>
                    <label className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-wider text-muted">Dev trait</span>
                      <select value={eff.dev} onChange={(ev) => editPlayer(sel.id, { dev: ev.target.value })} className={inputCls}>
                        {DEVS.map((d) => <option key={d} value={d}>{d === 'XFactor' ? 'X-Factor' : d}</option>)}
                      </select></label>
                  </div>

                  {/* Appearance: body type, generic head, gear (helmet/facemask/…) */}
                  <div className="mt-3 space-y-2 border-t border-border/50 pt-3">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-wider text-muted">Body type</span>
                        <select value={eff.bodyType} onChange={(ev) => editPlayer(sel.id, { bodyType: ev.target.value })} className={inputCls}>
                          {['Standard', 'Thin', 'Lean', 'Muscular', 'Heavy'].map((b) => <option key={b} value={b}>{b}</option>)}
                        </select></label>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-wider text-muted">Face (generic head)</span>
                        <div className="flex items-center gap-1">
                          <select value={headTone} onChange={(ev) => setHeadTone(Number(ev.target.value))} className={`${inputCls} px-1`} title="Skin tone">
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((t) => <option key={t} value={t}>T{t}</option>)}
                          </select>
                          <button type="button" onClick={() => pickHead(headIdx < 0 ? 0 : headIdx - 1)} disabled={!headPool.length} className="rounded border border-border-strong bg-surface-2 px-1.5 py-1 text-xs text-neutral-200 hover:bg-surface-3 disabled:opacity-40">‹</button>
                          <span className="flex-1 text-center text-xs tabular-nums text-neutral-300">{headIdx >= 0 ? `${headIdx + 1}/${headPool.length}` : '—'}</span>
                          <button type="button" onClick={() => pickHead(headIdx < 0 ? 0 : headIdx + 1)} disabled={!headPool.length} className="rounded border border-border-strong bg-surface-2 px-1.5 py-1 text-xs text-neutral-200 hover:bg-surface-3 disabled:opacity-40">›</button>
                          <button type="button" onClick={() => pickHead(Math.floor(Math.random() * headPool.length))} disabled={!headPool.length} className="rounded border border-border-strong bg-surface-2 px-1.5 py-1 text-neutral-200 hover:bg-surface-3 disabled:opacity-40" title="Random"><Icon path={ICONS.shuffle} className="h-3 w-3" /></button>
                        </div>
                      </div>
                    </div>
                    <button type="button" onClick={() => setGearOpen(true)} className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border-strong bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:bg-surface-3">
                      <Icon path={ICONS.image} className="h-3.5 w-3.5" /> Edit gear
                    </button>
                    <div className="truncate text-[10px] text-muted">
                      Helmet: {gearOpts.helmet?.find((o) => o.value === gearPatch.helmet)?.label ?? gearPatch.helmet ?? '—'} · Facemask: {gearOpts.facemask?.find((o) => o.value === gearPatch.facemask)?.label ?? gearPatch.facemask ?? '—'}
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {ATTR_GROUPS.map((g) => (
                      <div key={g.title}>
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">{g.title}</div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                          {g.keys.filter((k) => sel.ratings[k] !== undefined).map((k) => (
                            <label key={k} className="flex items-center justify-between gap-2">
                              <span className="truncate text-xs text-neutral-400" title={humanize(k)}>{humanize(k)}</span>
                              <input type="number" min={0} max={99} value={eff.rating(k)}
                                onChange={(ev) => editRating(sel.id, k, Number(ev.target.value))}
                                className="w-14 rounded border border-border bg-surface-0 px-1.5 py-0.5 text-right text-sm tabular-nums text-neutral-200 focus:border-primary focus:outline-none" />
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {gearOpen && sel && (
        <GearEditor
          playerName={`${sel.firstName} ${sel.lastName}`}
          options={gearOpts}
          gearPatch={gearPatch}
          onGearEdit={editGear}
          onClose={() => setGearOpen(false)}
          year={2025}
          positionId={Math.max(0, POS_NAMES.indexOf(String(sel.position || '')))}
        />
      )}
    </div>
  );
}
