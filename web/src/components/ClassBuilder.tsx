import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { cache } from '../cache';
import { POS_GROUP_ORDER } from '../constants';
import type { CatalogPlayer, CustomClass } from '../types';
import { Icon, ICONS } from './ui';

const CAP = 402;
const SHOW_MAX = 400;
type SortKey = 'year' | 'name' | 'pos' | 'pick' | 'wav' | 'cal' | 'pb';

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const blank = (): CustomClass => ({ id: newId(), name: '', keys: [], createdAt: Date.now(), updatedAt: Date.now() });
/** Same score the server ranks a picked class by (wAV + accolades + HOF bonus). */
const greatness = (p: CatalogPlayer) => (p.wav ?? 0) + 4 * p.ap1 + 2 * p.pb + (p.hof ? 40 : 0);

/**
 * Hand-pick a class from the whole pool: browse, filter and sort the 32k catalog
 * on the left, build up to 402 on the right, save it by name, generate it.
 */
export function ClassBuilder({ initial, onClose, onGenerate }: {
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

  const loadCatalog = () => {
    setError(null);
    api.catalog().then(setCatalog).catch((e) => setError((e as Error).message));
  };
  useEffect(loadCatalog, []);
  useEffect(() => { cache.customList().then(setSaved); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const byKey = useMemo(() => new Map((catalog ?? []).map((p) => [p.key, p])), [catalog]);
  const picked = useMemo(() => new Set(draft.keys), [draft.keys]);
  const years = useMemo(() => [...new Set((catalog ?? []).map((p) => p.year))].sort((a, b) => a - b), [catalog]);
  const leagues = useMemo(() => [...new Set((catalog ?? []).map((p) => p.league))].sort(), [catalog]);

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

  const setKeys = (keys: string[]) => setDraft((d) => ({ ...d, keys, updatedAt: Date.now() }));
  const add = (k: string) => { if (!picked.has(k) && draft.keys.length < CAP) setKeys([...draft.keys, k]); };
  const remove = (k: string) => setKeys(draft.keys.filter((x) => x !== k));
  const addAllShown = () => {
    const room = CAP - draft.keys.length;
    const fresh = list.filter((p) => !picked.has(p.key)).slice(0, room).map((p) => p.key);
    if (fresh.length) setKeys([...draft.keys, ...fresh]);
  };

  // The class, grouped by position group in greatness order (how the server will
  // rank it). A key the catalog no longer has shows as "not found".
  const groups = useMemo(() => {
    const m = new Map<string, { key: string; p: CatalogPlayer | null }[]>();
    for (const key of draft.keys) {
      const p = byKey.get(key) ?? null;
      const g = p?.grp ?? '?';
      (m.get(g) ?? m.set(g, []).get(g)!).push({ key, p });
    }
    for (const arr of m.values()) arr.sort((a, b) => (b.p ? greatness(b.p) : -1) - (a.p ? greatness(a.p) : -1));
    return [...POS_GROUP_ORDER, '?'].filter((g) => m.has(g)).map((g) => [g, m.get(g)!] as const);
  }, [draft.keys, byKey]);

  const persist = async (): Promise<CustomClass> => {
    const c = { ...draft, name: draft.name.trim() || 'My class', updatedAt: Date.now() };
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

  const full = draft.keys.length >= CAP;
  const sel = 'rounded-md border border-border bg-surface-0 px-2 py-1 text-xs text-neutral-200 focus:border-primary focus:outline-none';
  const th = 'px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-neutral-400';
  const sortBtn = (k: SortKey, label: string) => (
    <button onClick={() => setSort(k)} className={`${th} ${sort === k ? 'text-neutral-100' : 'hover:text-neutral-200'}`}>{label}{sort === k ? ' ▾' : ''}</button>
  );

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Build a custom draft class"
        tabIndex={-1}
        ref={(el) => { if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true }); }}
        className="flex h-[88vh] w-[1280px] max-w-full flex-col overflow-hidden rounded-xl border border-border-strong bg-surface-1 shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
          <div>
            <div className="text-sm font-bold tracking-tight text-neutral-100">Build a custom draft class</div>
            <div className="text-xs text-neutral-400">
              Pick anyone from {catalog ? catalog.length.toLocaleString() : '…'} players, 1936–2026. The class holds {CAP}. Picks are ranked best-first by career; your usual modifiers still apply.
            </div>
          </div>
          <button onClick={onClose} className="rounded-md border border-border px-2 py-1 text-xs text-neutral-300 hover:bg-surface-2" aria-label="Close">Esc</button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Catalog */}
          <div className="flex min-w-0 flex-[3] flex-col border-r border-border">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or college…" className={`${sel} w-52`} />
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
              <button
                onClick={addAllShown}
                disabled={full || !list.length}
                className="rounded-md border border-primary/50 bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20 disabled:opacity-40"
                title="Add from the top of this list until the class is full"
              >
                Add all shown
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
                  <thead className="sticky top-0 bg-surface-2">
                    <tr>
                      <th className={th}>{sortBtn('name', 'Name')}</th>
                      <th className={th}>{sortBtn('pos', 'Pos')}</th>
                      <th className={th}>{sortBtn('year', 'Year')}</th>
                      <th className={th}>{sortBtn('pick', 'Drafted')}</th>
                      <th className={th}>College</th>
                      <th className={`${th} text-right`}>{sortBtn('wav', 'wAV')}</th>
                      <th className={`${th} text-right`}>{sortBtn('cal', 'Career')}</th>
                      <th className={`${th} text-right`}>{sortBtn('pb', 'PB')}</th>
                      <th className={th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.slice(0, SHOW_MAX).map((p) => {
                      const inClass = picked.has(p.key);
                      return (
                        <tr key={p.key} className={`border-t border-border/50 ${inClass ? 'bg-success/5' : 'hover:bg-surface-2/50'}`}>
                          <td className="px-3 py-1.5 text-neutral-100">
                            {p.first} {p.last}
                            {p.hof && <span className="ml-1.5 rounded bg-gold/15 px-1 text-[10px] font-semibold text-gold" title="Hall of Fame">HOF</span>}
                          </td>
                          <td className="px-3 py-1.5 text-neutral-300">{p.mpos}</td>
                          <td className="px-3 py-1.5 tabular-nums text-neutral-300">
                            {p.year}{p.league !== 'NFL' ? <span className="ml-1 text-[10px] text-muted">{p.league}</span> : null}
                          </td>
                          <td className="px-3 py-1.5 text-neutral-300">{p.round != null ? `Rd ${p.round}${p.pick != null ? `, #${p.pick}` : ''}` : 'Undrafted'}</td>
                          <td className="px-3 py-1.5 text-neutral-400">{p.college}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-neutral-300">{p.wav ?? '–'}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-neutral-300">{p.cal}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-neutral-400">{p.pb || ''}</td>
                          <td className="px-3 py-1.5 text-right">
                            {inClass ? (
                              <button onClick={() => remove(p.key)} className="rounded-md border border-border px-2 py-0.5 text-xs text-neutral-300 hover:text-red-300">Remove</button>
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
          </div>

          {/* The class */}
          <div className="flex min-w-0 flex-[2] flex-col">
            {saved.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-2 text-xs">
                <span className="text-neutral-400">My classes:</span>
                {saved.map((c) => (
                  <span key={c.id} className={`flex items-center gap-1 rounded border px-1.5 py-0.5 ${c.id === draft.id ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border text-neutral-300'}`}>
                    <button onClick={() => setDraft(c)} title={`${c.keys.length} players`}>{c.name}</button>
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
            <div className="flex items-center gap-3 border-b border-border px-4 py-2">
              <input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Class name (e.g. 90s Legends)"
                className={`${sel} w-56 text-sm`}
                maxLength={60}
              />
              <span className={`ml-auto text-sm tabular-nums ${full ? 'text-warning' : 'text-neutral-200'}`}><b>{draft.keys.length}</b> / {CAP}</span>
              <button onClick={() => setKeys([])} disabled={!draft.keys.length} className="text-xs text-muted hover:text-neutral-200 disabled:opacity-40">Clear</button>
            </div>
            <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2 text-[11px]">
              {groups.map(([g, arr]) => (
                <span key={g} className="rounded bg-surface-2 px-1.5 py-0.5 text-neutral-300">{g} <b className="tabular-nums text-neutral-100">{arr.length}</b></span>
              ))}
              {!draft.keys.length && <span className="text-muted">Add players from the left. Tip: filter a position, sort by Career, then “Add all shown”.</span>}
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-4 py-2">
              {groups.map(([g, arr]) => (
                <div key={g} className="mb-3">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{g}</div>
                  {arr.map(({ key, p }) => (
                    <div key={key} className="flex items-center gap-2 border-t border-border/40 py-1 text-sm">
                      {p ? (
                        <>
                          <span className="min-w-0 flex-1 truncate text-neutral-100">
                            {p.first} {p.last} <span className="text-xs text-muted">{p.mpos} · {p.year}{p.round != null ? ` · Rd ${p.round}` : ' · UDFA'}</span>
                          </span>
                          <span className="tabular-nums text-xs text-neutral-400">{p.cal}</span>
                        </>
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-red-300" title={key}>Not found in the current data</span>
                      )}
                      <button onClick={() => remove(key)} className="text-muted hover:text-red-300" aria-label="Remove">×</button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 border-t border-border px-4 py-3">
              <label className="flex items-center gap-2 text-xs text-neutral-300" title="A short class is padded with generated prospects from the era of your picks so it imports as a full class">
                <input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} className="accent-primary" />
                Fill the rest with generated prospects
              </label>
              <span className="ml-auto" />
              <button onClick={() => persist()} disabled={!draft.keys.length} className="rounded-md border border-border-strong bg-surface-2 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-surface-3 disabled:opacity-40">Save</button>
              <button
                onClick={async () => onGenerate(await persist(), fill)}
                disabled={!draft.keys.length}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primary-light disabled:opacity-40"
              >
                <Icon path={ICONS.board} className="h-3.5 w-3.5" /> Save & generate
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
