import { useEffect, useMemo, useState } from 'react';
import { api, displayPortrait, type ArchetypeOption } from '../api';
import { cache } from '../cache';
import { DEV_NAMES, POS_GROUP_ORDER, POS_NAMES } from '../constants';
import type { BoardEntry, CatalogPlayer, CustomClass, CustomPlayer } from '../types';
import { Icon, ICONS, Portrait } from './ui';

const CAP = 402;
const ROUND = 32;
const SHOW_MAX = 400;
type SortKey = 'year' | 'name' | 'pos' | 'pick' | 'wav' | 'cal' | 'pb';

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const blank = (): CustomClass => ({ id: newId(), name: '', board: [], createdAt: Date.now(), updatedAt: Date.now() });
const entryId = (e: BoardEntry) => ('key' in e ? e.key : `custom:${e.custom.id}`);
const blankCustom = (): CustomPlayer => ({
  id: newId(), firstName: '', lastName: '', position: 'QB', college: '', heightInches: 74, weight: 220, age: 22,
  jersey: null, overall: 70, devTrait: 0, archetype: null, skinTone: 4,
});
const ftIn = (inches: number) => `${Math.floor(inches / 12)}'${inches % 12}"`;
/** The studio's headshot for a catalog row: the game portrait by id, else the
 *  retro-disc headshot by name, position and year (the app's usual chain). */
const headshot = (p: CatalogPlayer) =>
  displayPortrait({ gamePortrait: p.pid ? `/api/portrait/pid/${p.pid}` : undefined, firstName: p.first, lastName: p.last, position: p.mpos, draftYear: p.year });
const headshotFallback = (p: CatalogPlayer) =>
  `/api/portrait/retro/${encodeURIComponent(p.first)}/${encodeURIComponent(p.last)}?position=${encodeURIComponent(p.mpos)}&draftYear=${p.year}`;

/**
 * Class Studio: build a draft class from the whole pool. Catalog on the left,
 * a pick-ordered board on the right (drag to reorder, move to a pick, remove),
 * and a drawer for custom prospects. Save by name, then generate.
 */
export function ClassStudio({ initial, onClose, onGenerate }: {
  initial: CustomClass | null;
  onClose: () => void;
  onGenerate: (c: CustomClass, fill: boolean) => void;
}) {
  const [catalog, setCatalog] = useState<CatalogPlayer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<CustomClass[]>([]);
  const [draft, setDraft] = useState<CustomClass>(initial ?? blank());
  const [fill, setFill] = useState(true);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [grp, setGrp] = useState('ALL');
  const [from, setFrom] = useState(1936);
  const [to, setTo] = useState(2026);
  const [league, setLeague] = useState('ALL');
  const [hof, setHof] = useState(false);
  const [sort, setSort] = useState<SortKey>('cal');
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [moveAt, setMoveAt] = useState<{ index: number; value: string } | null>(null);
  const [drawer, setDrawer] = useState<{ player: CustomPlayer; index: number | null } | null>(null);
  const [archetypes, setArchetypes] = useState<Record<string, ArchetypeOption[]>>({});

  const loadCatalog = () => {
    setError(null);
    api.catalog().then(setCatalog).catch((e) => setError((e as Error).message));
  };
  useEffect(loadCatalog, []);
  useEffect(() => { cache.customList().then(setSaved); }, []);
  useEffect(() => { api.archetypesByPosition().then(setArchetypes).catch(() => {}); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (drawer) setDrawer(null); else onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, drawer]);

  const byKey = useMemo(() => new Map((catalog ?? []).map((p) => [p.key, p])), [catalog]);
  const onBoard = useMemo(() => new Map(draft.board.map((e, i) => [entryId(e), i])), [draft.board]);
  const years = useMemo(() => [...new Set((catalog ?? []).map((p) => p.year))].sort((a, b) => a - b), [catalog]);
  const leagues = useMemo(() => [...new Set((catalog ?? []).map((p) => p.league))].sort(), [catalog]);
  const colleges = useMemo(() => [...new Set((catalog ?? []).map((p) => p.college).filter(Boolean))].sort(), [catalog]);

  const list = useMemo(() => {
    if (!catalog) return [];
    const needle = q.trim().toLowerCase();
    let r = catalog.filter((p) => p.year >= from && p.year <= to);
    if (grp !== 'ALL') r = r.filter((p) => p.grp === grp);
    if (league !== 'ALL') r = r.filter((p) => p.league === league);
    if (hof) r = r.filter((p) => p.hof);
    if (needle) r = r.filter((p) => `${p.first} ${p.last} ${p.college}`.toLowerCase().includes(needle));
    const pickNo = (p: CatalogPlayer) => (p.round == null ? 99 : p.round) * 1000 + (p.pick ?? 999);
    r.sort((a, b) =>
      sort === 'year' ? b.year - a.year || pickNo(a) - pickNo(b)
      : sort === 'name' ? a.last.localeCompare(b.last) || a.first.localeCompare(b.first)
      : sort === 'pos' ? a.mpos.localeCompare(b.mpos) || b.cal - a.cal
      : sort === 'pick' ? pickNo(a) - pickNo(b) || b.year - a.year
      : sort === 'wav' ? (b.wav ?? -1) - (a.wav ?? -1)
      : sort === 'pb' ? b.pb - a.pb || b.cal - a.cal
      : b.cal - a.cal || (b.wav ?? -1) - (a.wav ?? -1));
    return r;
  }, [catalog, q, grp, from, to, league, hof, sort]);

  const setBoard = (board: BoardEntry[]) => setDraft((d) => ({ ...d, board, updatedAt: Date.now() }));
  const full = draft.board.length >= CAP;
  const add = (key: string) => { if (!onBoard.has(key) && !full) setBoard([...draft.board, { key }]); };
  const removeAt = (i: number) => setBoard(draft.board.filter((_, k) => k !== i));
  const addAllShown = () => {
    const room = CAP - draft.board.length;
    const fresh = list.filter((p) => !onBoard.has(p.key)).slice(0, room).map((p) => ({ key: p.key }));
    if (fresh.length) setBoard([...draft.board, ...fresh]);
  };
  /** Move the entry at `i` so it lands at pick `j + 1`; everyone between shifts. */
  const move = (i: number, j: number) => {
    const target = Math.max(0, Math.min(draft.board.length - 1, j));
    if (i === target) return;
    const next = [...draft.board];
    const [e] = next.splice(i, 1);
    next.splice(target, 0, e);
    setBoard(next);
  };
  const saveCustom = (p: CustomPlayer, index: number | null) => {
    const entry: BoardEntry = { custom: p };
    if (index == null) { if (full) return; setBoard([...draft.board, entry]); }
    else setBoard(draft.board.map((e, k) => (k === index ? entry : e)));
    setDrawer(null);
  };

  const persist = async (): Promise<CustomClass> => {
    const c = { ...draft, name: draft.name.trim() || 'My class', updatedAt: Date.now() };
    delete (c as { keys?: string[] }).keys;
    await cache.customSet(c);
    setDraft(c);
    setSaved(await cache.customList());
    return c;
  };
  const duplicate = async (c: CustomClass) => {
    const d = { ...c, id: newId(), name: `${c.name} copy`, createdAt: Date.now(), updatedAt: Date.now() };
    await cache.customSet(d);
    setSaved(await cache.customList());
    setDraft(d);
  };
  const del = async (id: string) => {
    await cache.customDel(id);
    setSaved(await cache.customList());
    setConfirmDel(null);
    if (draft.id === id) setDraft(blank());
  };

  // Position-group counts for the board summary.
  const groupCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of draft.board) {
      const g = 'key' in e ? byKey.get(e.key)?.grp ?? '?' : groupOf(e.custom.position);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return [...POS_GROUP_ORDER, '?'].filter((g) => m.has(g)).map((g) => [g, m.get(g)!] as const);
  }, [draft.board, byKey]);

  const sel = 'rounded-md border border-border bg-surface-0 px-2 py-1 text-xs text-neutral-200 focus:border-primary focus:outline-none';
  const th = 'px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-neutral-400';
  const sortBtn = (k: SortKey, label: string) => (
    <button onClick={() => setSort(k)} className={`${th} ${sort === k ? 'text-neutral-100' : 'hover:text-neutral-200'}`}>{label}{sort === k ? ' ▾' : ''}</button>
  );
  const rounds = Math.ceil(CAP / ROUND);

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in flex-col bg-surface-0" role="dialog" aria-modal="true" aria-label="Class Studio">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface-1 px-5 py-2.5">
        <div className="mr-2">
          <div className="text-sm font-bold tracking-tight text-neutral-100">Class Studio</div>
          <div className="text-[11px] text-muted">Pick anyone from {catalog ? catalog.length.toLocaleString() : '…'} players or make your own. The board is the draft order.</div>
        </div>
        <input
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder="Class name (e.g. 90s Legends)"
          className={`${sel} w-56 text-sm`}
          maxLength={60}
        />
        {saved.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-neutral-400">My classes:</span>
            {saved.map((c) => (
              <span key={c.id} className={`flex items-center gap-1 rounded border px-1.5 py-0.5 ${c.id === draft.id ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border text-neutral-300'}`}>
                <button onClick={() => setDraft(c)} title={`${c.board.length} players`}>{c.name}</button>
                <button onClick={() => duplicate(c)} className="text-muted hover:text-neutral-200" title="Duplicate" aria-label={`Duplicate ${c.name}`}>⧉</button>
                {confirmDel === c.id ? (
                  <button onClick={() => del(c.id)} className="text-red-300" title="Click again to delete">delete?</button>
                ) : (
                  <button onClick={() => setConfirmDel(c.id)} className="text-muted hover:text-red-300" title="Delete" aria-label={`Delete ${c.name}`}>×</button>
                )}
              </span>
            ))}
          </div>
        )}
        <span className="ml-auto" />
        <label className="flex items-center gap-2 text-xs text-neutral-300" title="A short class is padded with generated prospects from the era of your picks so it imports as a full class">
          <input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} className="accent-primary" />
          Pad the class with generated prospects
        </label>
        <button onClick={() => persist()} disabled={!draft.board.length} className="rounded-md border border-border-strong bg-surface-2 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-surface-3 disabled:opacity-40">Save</button>
        <button
          onClick={async () => onGenerate(await persist(), fill)}
          disabled={!draft.board.length}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primary-light disabled:opacity-40"
        >
          <Icon path={ICONS.board} className="h-3.5 w-3.5" /> Generate
        </button>
        <button onClick={onClose} className="rounded-md border border-border px-2 py-1 text-xs text-neutral-300 hover:bg-surface-2" aria-label="Close">Close</button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left: catalog */}
        <div className="relative flex min-w-0 flex-1 flex-col border-r border-border">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or college…" className={`${sel} w-48`} />
            <select value={grp} onChange={(e) => setGrp(e.target.value)} className={sel}>
              <option value="ALL">All positions</option>
              {POS_GROUP_ORDER.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <select value={from} onChange={(e) => { const v = Number(e.target.value); setFrom(v); if (v > to) setTo(v); }} className={sel}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <span className="text-xs text-muted">to</span>
            <select value={to} onChange={(e) => { const v = Number(e.target.value); setTo(v); if (v < from) setFrom(v); }} className={sel}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={league} onChange={(e) => setLeague(e.target.value)} className={sel}>
              <option value="ALL">All leagues</option>
              {leagues.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-neutral-300">
              <input type="checkbox" checked={hof} onChange={(e) => setHof(e.target.checked)} className="accent-primary" />HOF only
            </label>
            <span className="ml-auto text-xs tabular-nums text-muted">{list.length.toLocaleString()} match</span>
            <button onClick={addAllShown} disabled={full || !list.length} className="rounded-md border border-primary/50 bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20 disabled:opacity-40" title="Add from the top of this list until the board is full">
              Add all shown
            </button>
            <button onClick={() => setDrawer({ player: blankCustom(), index: null })} disabled={full} className="inline-flex items-center gap-1 rounded-md border border-gold/50 bg-gold/10 px-2 py-1 text-xs font-medium text-gold hover:bg-gold/20 disabled:opacity-40" title="Create a prospect who never existed">
              <Icon path={ICONS.plus} className="h-3.5 w-3.5" /> New custom player
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {error && (
              <div className="m-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-200">
                Couldn't load the player catalog: {error} <button onClick={loadCatalog} className="ml-2 underline">Retry</button>
              </div>
            )}
            {!catalog && !error && <div className="px-4 py-8 text-center text-sm text-muted">Loading the player pool…</div>}
            {catalog && (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-surface-2">
                  <tr>
                    <th className={th}>{sortBtn('name', 'Name')}</th>
                    <th className={th}>{sortBtn('pos', 'Pos')}</th>
                    <th className={th}>{sortBtn('year', 'Year')}</th>
                    <th className={th}>{sortBtn('pick', 'Drafted')}</th>
                    <th className={`${th} hidden 2xl:table-cell`}>College</th>
                    <th className={`${th} text-right`}>{sortBtn('wav', 'wAV')}</th>
                    <th className={`${th} text-right`}>{sortBtn('cal', 'Career')}</th>
                    <th className={`${th} hidden text-right 2xl:table-cell`}>{sortBtn('pb', 'PB')}</th>
                    <th className={`${th} sticky right-0 bg-surface-2`}></th>
                  </tr>
                </thead>
                <tbody>
                  {list.slice(0, SHOW_MAX).map((p) => {
                    const at = onBoard.get(p.key);
                    return (
                      <tr key={p.key} className={`border-t border-border/50 ${at != null ? 'bg-success/5' : 'hover:bg-surface-2/50'}`}>
                        <td className="whitespace-nowrap px-2 py-1 text-neutral-100">
                          <span className="inline-flex items-center gap-2">
                            <Portrait src={headshot(p)} fallback={headshotFallback(p)} size="xs" />
                            {p.first} {p.last}
                            {p.hof && <span className="ml-0.5 rounded bg-gold/15 px-1 text-[10px] font-semibold text-gold" title="Hall of Fame">HOF</span>}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-neutral-300">{p.mpos}</td>
                        <td className="px-2 py-1.5 tabular-nums text-neutral-300">
                          {p.year}{p.league !== 'NFL' ? <span className="ml-1 text-[10px] text-muted">{p.league}</span> : null}
                        </td>
                        <td className="px-2 py-1.5 text-neutral-300">{p.round != null ? `Rd ${p.round}${p.pick != null ? `, #${p.pick}` : ''}` : 'Undrafted'}</td>
                        <td className="hidden px-2 py-1.5 text-neutral-400 2xl:table-cell">{p.college}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-neutral-300">{p.wav ?? '–'}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-neutral-300" title={p.pb ? `${p.pb} Pro Bowls · ${p.ap1} first-team All-Pro` : undefined}>{p.cal}</td>
                        <td className="hidden px-2 py-1.5 text-right tabular-nums text-neutral-400 2xl:table-cell">{p.pb || ''}</td>
                        <td className="sticky right-0 bg-surface-1 px-2 py-1.5 text-right">
                          {at != null ? (
                            <span className="rounded-md border border-success/40 bg-success/10 px-2 py-0.5 text-xs tabular-nums text-success" title="On the board at this pick">#{at + 1}</span>
                          ) : (
                            <button onClick={() => add(p.key)} disabled={full} className="rounded-md border border-primary/50 bg-primary/10 px-2 py-0.5 text-xs text-primary hover:bg-primary/20 disabled:opacity-40">Add</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {list.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-sm text-neutral-500">Nobody matches.</td></tr>}
                </tbody>
              </table>
            )}
            {catalog && list.length > SHOW_MAX && (
              <div className="border-t border-border px-4 py-2 text-center text-xs text-muted">
                Showing {SHOW_MAX} of {list.length.toLocaleString()} — narrow the search or filters to see the rest.
              </div>
            )}
          </div>

          {drawer && (
            <CustomPlayerDrawer
              player={drawer.player}
              isNew={drawer.index == null}
              archetypes={archetypes}
              colleges={colleges}
              onCancel={() => setDrawer(null)}
              onSave={(p) => saveCustom(p, drawer.index)}
            />
          )}
        </div>

        {/* Right: the board */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-2 text-[11px]">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Draft board</span>
            {groupCounts.map(([g, n]) => (
              <span key={g} className="rounded bg-surface-2 px-1.5 py-0.5 text-neutral-300">{g} <b className="tabular-nums text-neutral-100">{n}</b></span>
            ))}
            {!draft.board.length && <span className="text-muted">Add players from the left; each lands at the next open pick. Drag a pick to reorder.</span>}
            <span className={`ml-auto text-sm tabular-nums ${full ? 'text-warning' : 'text-neutral-200'}`}><b>{draft.board.length}</b> / {CAP}</span>
            <button onClick={() => setBoard([])} disabled={!draft.board.length} className="text-xs text-muted hover:text-neutral-200 disabled:opacity-40">Clear</button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
            {Array.from({ length: rounds }, (_, r) => {
              const start = r * ROUND;
              const end = Math.min(CAP, start + ROUND);
              if (start >= draft.board.length && r > Math.floor(draft.board.length / ROUND)) return null; // rounds past the next open one stay folded
              return (
                <div key={r} className="mb-2">
                  <div className="sticky top-0 z-10 mb-0.5 bg-surface-0 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Round {r + 1}</div>
                  {Array.from({ length: end - start }, (_, k) => {
                    const i = start + k;
                    const e = draft.board[i];
                    const p = e && 'key' in e ? byKey.get(e.key) ?? null : null;
                    const custom = e && 'custom' in e ? e.custom : null;
                    const over = dragOver === i && dragFrom != null && dragFrom !== i;
                    return (
                      <div
                        key={i}
                        draggable={!!e}
                        onDragStart={() => setDragFrom(i)}
                        onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
                        onDragOver={(ev) => { if (dragFrom != null) { ev.preventDefault(); setDragOver(i); } }}
                        onDrop={(ev) => { ev.preventDefault(); if (dragFrom != null) move(dragFrom, Math.min(i, draft.board.length - 1)); setDragFrom(null); setDragOver(null); }}
                        className={`flex items-center gap-2 border-t border-border/40 px-1 py-1 text-sm ${e ? 'cursor-grab' : ''} ${over ? 'border-t-2 border-t-primary' : ''} ${e ? '' : 'text-neutral-600'}`}
                      >
                        <span className="w-8 shrink-0 text-right text-xs tabular-nums text-neutral-500">{i + 1}</span>
                        {!e && <span className="text-xs">—</span>}
                        {p && (
                          <>
                            <Portrait src={headshot(p)} fallback={headshotFallback(p)} size="xs" />
                            <span className="min-w-0 flex-1 truncate text-neutral-100">
                              {p.first} {p.last} <span className="text-xs text-muted">{p.mpos} · {p.year}{p.round != null ? ` · Rd ${p.round}` : ' · UDFA'} · {p.college}</span>
                            </span>
                            <span className="tabular-nums text-xs text-neutral-400" title="Career">{p.cal}</span>
                          </>
                        )}
                        {e && 'key' in e && !p && <span className="min-w-0 flex-1 truncate text-red-300" title={e.key}>Not found in the current data</span>}
                        {custom && (
                          <>
                            <span className="min-w-0 flex-1 truncate text-neutral-100">
                              {custom.firstName} {custom.lastName} <span className="text-xs text-muted">{custom.position} · {ftIn(custom.heightInches)} {custom.weight} · {custom.college || 'no college'}</span>
                              <span className="ml-1.5 rounded bg-gold/15 px-1 text-[10px] font-semibold text-gold">custom</span>
                            </span>
                            <span className="tabular-nums text-xs text-neutral-400" title="Overall">{custom.overall}</span>
                            <button onClick={() => setDrawer({ player: custom, index: i })} className="text-xs text-muted hover:text-neutral-200">Edit</button>
                          </>
                        )}
                        {e && (
                          <>
                            {moveAt?.index === i ? (
                              <form
                                className="flex items-center gap-1"
                                onSubmit={(ev) => { ev.preventDefault(); const n = parseInt(moveAt.value, 10); if (n >= 1) move(i, n - 1); setMoveAt(null); }}
                              >
                                <input autoFocus value={moveAt.value} onChange={(ev) => setMoveAt({ index: i, value: ev.target.value })} placeholder="pick" className={`${sel} w-14`} />
                                <button type="submit" className="text-xs text-primary">Go</button>
                              </form>
                            ) : (
                              <button onClick={() => setMoveAt({ index: i, value: String(i + 1) })} className="text-xs text-muted hover:text-neutral-200" title="Move to a pick">Move…</button>
                            )}
                            <button onClick={() => removeAt(i)} className="text-muted hover:text-red-300" aria-label="Remove">×</button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function groupOf(pos: string): string {
  const p = pos.toUpperCase();
  if (p === 'QB') return 'QB';
  if (['HB', 'FB'].includes(p)) return 'RB';
  if (p === 'WR') return 'WR';
  if (p === 'TE') return 'TE';
  if (['LT', 'LG', 'C', 'RG', 'RT'].includes(p)) return 'OL';
  if (['LEDG', 'REDG'].includes(p)) return 'EDGE';
  if (p === 'DT') return 'IDL';
  if (['SAM', 'MIKE', 'WILL'].includes(p)) return 'LB';
  if (p === 'CB') return 'CB';
  if (['FS', 'SS'].includes(p)) return 'S';
  return p;
}

const TONES = [1, 2, 3, 4, 5, 6, 7];

/** The custom-prospect form: bio, overall, dev trait and archetype; the app
 *  generates the attributes to match when the class is built. */
function CustomPlayerDrawer({ player, isNew, archetypes, colleges, onCancel, onSave }: {
  player: CustomPlayer;
  isNew: boolean;
  archetypes: Record<string, ArchetypeOption[]>;
  colleges: string[];
  onCancel: () => void;
  onSave: (p: CustomPlayer) => void;
}) {
  const [p, setP] = useState<CustomPlayer>(player);
  const set = <K extends keyof CustomPlayer>(k: K, v: CustomPlayer[K]) => setP((x) => ({ ...x, [k]: v }));
  const opts = archetypes[p.position] ?? [];
  const valid = p.firstName.trim() && p.lastName.trim() && p.overall >= 40 && p.overall <= 99 && p.heightInches >= 60 && p.heightInches <= 84 && p.weight >= 140 && p.weight <= 400 && p.age >= 18 && p.age <= 45;
  const field = 'rounded-md border border-border bg-surface-0 px-2 py-1.5 text-sm text-neutral-200 focus:border-primary focus:outline-none';
  const label = 'text-[10px] font-semibold uppercase tracking-wide text-neutral-400';
  const feet = Math.floor(p.heightInches / 12), inches = p.heightInches % 12;

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-surface-1/95 backdrop-blur-sm" role="dialog" aria-label="Custom player">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <div className="text-sm font-bold text-neutral-100">{isNew ? 'New custom player' : `Edit ${player.firstName} ${player.lastName}`}</div>
          <div className="text-[11px] text-muted">Set who he is and how good; the attributes are generated to match when the class is built, and you can tune them on his card afterwards.</div>
        </div>
        <button onClick={onCancel} className="rounded-md border border-border px-2 py-1 text-xs text-neutral-300 hover:bg-surface-2">Cancel</button>
      </div>
      <div className="grid max-w-3xl grid-cols-2 gap-x-5 gap-y-3 overflow-auto px-5 py-4 md:grid-cols-4">
        <label className="flex flex-col gap-1"><span className={label}>First name</span><input value={p.firstName} onChange={(e) => set('firstName', e.target.value)} maxLength={20} className={field} autoFocus /></label>
        <label className="flex flex-col gap-1"><span className={label}>Last name</span><input value={p.lastName} onChange={(e) => set('lastName', e.target.value)} maxLength={20} className={field} /></label>
        <label className="flex flex-col gap-1"><span className={label}>Position</span>
          <select value={p.position} onChange={(e) => { set('position', e.target.value); set('archetype', null); }} className={field}>
            {POS_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1"><span className={label}>Archetype</span>
          <select value={p.archetype ?? ''} onChange={(e) => set('archetype', e.target.value === '' ? null : Number(e.target.value))} className={field}>
            <option value="">Best fit for his build</option>
            {opts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label className="col-span-2 flex flex-col gap-1"><span className={label}>College</span>
          <input value={p.college} onChange={(e) => set('college', e.target.value)} list="studio-colleges" maxLength={40} className={field} placeholder="e.g. Ohio State" />
          <datalist id="studio-colleges">{colleges.slice(0, 2000).map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <label className="flex flex-col gap-1"><span className={label}>Height</span>
          <div className="flex items-center gap-1">
            <select value={feet} onChange={(e) => set('heightInches', Number(e.target.value) * 12 + inches)} className={field}>{[5, 6, 7].map((f) => <option key={f} value={f}>{f} ft</option>)}</select>
            <select value={inches} onChange={(e) => set('heightInches', feet * 12 + Number(e.target.value))} className={field}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i}>{i} in</option>)}</select>
          </div>
        </label>
        <label className="flex flex-col gap-1"><span className={label}>Weight (lb)</span><input type="number" min={140} max={400} value={p.weight} onChange={(e) => set('weight', Number(e.target.value))} className={field} /></label>
        <label className="flex flex-col gap-1"><span className={label}>Age</span><input type="number" min={18} max={45} value={p.age} onChange={(e) => set('age', Number(e.target.value))} className={field} /></label>
        <label className="flex flex-col gap-1"><span className={label}>Jersey (optional)</span><input type="number" min={0} max={99} value={p.jersey ?? ''} onChange={(e) => set('jersey', e.target.value === '' ? null : Number(e.target.value))} className={field} /></label>
        <label className="flex flex-col gap-1"><span className={label}>Overall — <span className="text-neutral-200">{p.overall}</span></span><input type="range" min={40} max={99} value={p.overall} onChange={(e) => set('overall', Number(e.target.value))} className="accent-primary" /></label>
        <label className="flex flex-col gap-1"><span className={label}>Dev trait</span>
          <select value={p.devTrait} onChange={(e) => set('devTrait', Number(e.target.value) as CustomPlayer['devTrait'])} className={field}>
            {DEV_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}
          </select>
        </label>
        <div className="col-span-2 flex flex-col gap-1"><span className={label}>Skin tone</span>
          <div className="flex items-center gap-1.5">
            {TONES.map((t) => (
              <button key={t} type="button" onClick={() => set('skinTone', t)} aria-pressed={p.skinTone === t} className={`h-7 w-7 rounded-full border-2 ${p.skinTone === t ? 'border-primary' : 'border-transparent'}`} style={{ background: TONE_COLORS[t - 1] }} title={`Tone ${t}`} />
            ))}
            <span className="ml-2 text-[11px] text-muted">Picks his generic face; change it on his card later.</span>
          </div>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-end gap-2 border-t border-border px-5 py-3">
        <button onClick={onCancel} className="rounded-md border border-border-strong bg-surface-2 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-surface-3">Cancel</button>
        <button onClick={() => valid && onSave({ ...p, firstName: p.firstName.trim(), lastName: p.lastName.trim(), college: p.college.trim() })} disabled={!valid} className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primary-light disabled:opacity-40">
          {isNew ? 'Add to board' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}

const TONE_COLORS = ['#f3d9c4', '#e8c39e', '#d4a276', '#b98457', '#8f5f3b', '#6a4327', '#3f2717'];
