import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { displayPortrait } from '../api';
import { POS_GROUP_ORDER, POS_NAMES } from '../constants';
import type { CatalogPlayer } from '../types';
import { Portrait, TeamLogo } from './ui';
import { VirtualList } from './VirtualList';
import { TeamPicker } from './TeamPicker';
import type { PickTeam } from '../teamMatch';

/** Compact row height (h-10), shared with the windowed list. */
const ROW_H = 40;

const SHOW_MAX = 400;
type SortKey = 'year' | 'name' | 'pos' | 'pick' | 'wav' | 'cal' | 'pb' | 'team';

/** The panel's headshot for a catalog row: the game portrait by id, else the
 *  retro-disc headshot by name, position and year (the app's usual chain). */
export const headshot = (p: CatalogPlayer) =>
  displayPortrait({ gamePortrait: p.pid ? `/api/portrait/pid/${p.pid}` : undefined, firstName: p.first, lastName: p.last, position: p.mpos, draftYear: p.year });
export const headshotFallback = (p: CatalogPlayer) =>
  `/api/portrait/retro/${encodeURIComponent(p.first)}/${encodeURIComponent(p.last)}?position=${encodeURIComponent(p.mpos)}&draftYear=${p.year}`;

/** A row's state once it is on the board or the roster: the label replaces the Add button. */
export interface CatalogStatus { label: string; title?: string }

/**
 * The whole-pool browser shared by the Class Studio and the Rosters view: search,
 * position group, year range, league and Hall of Fame filters, sortable columns,
 * an Add button per row. The caller owns what Add means.
 */
const ERAS = ['ALL', ...Array.from({ length: 10 }, (_, i) => String(1930 + i * 10))];

export function CatalogPanel({ catalog, error, onRetry, status, onAdd, addDisabled = false, toolbarExtra, onListChange, compact = false, hidden, addTeams }: {
  catalog: CatalogPlayer[] | null;
  error: string | null;
  onRetry: () => void;
  status: (key: string) => CatalogStatus | null;
  /** Add a player; `teamId` is set when the row's Add to… picker chose the team. */
  onAdd: (key: string, teamId?: number) => void;
  addDisabled?: boolean;
  toolbarExtra?: ReactNode;
  /** The filtered, sorted keys, for callers with a bulk action. */
  onListChange?: (keys: string[]) => void;
  /** Half-width layout (the roster builder): rows instead of the table, one toolbar with an era picker. */
  compact?: boolean;
  /** Rows to leave out entirely (players already on the roster being built). */
  hidden?: (key: string) => boolean;
  /** Compact rows only: when set, Add is a typed team picker (the caller has no team selected). */
  addTeams?: PickTeam[];
}) {
  const [q, setQ] = useState('');
  const [grp, setGrp] = useState('ALL');
  const [from, setFrom] = useState(1936);
  const [to, setTo] = useState(2026);
  const [era, setEra] = useState('ALL');
  const [league, setLeague] = useState('ALL');
  const [hof, setHof] = useState(false);
  const [club, setClub] = useState('ALL');
  const [sort, setSort] = useState<SortKey>('cal');

  const years = useMemo(() => [...new Set((catalog ?? []).map((p) => p.year))].sort((a, b) => a - b), [catalog]);
  const leagues = useMemo(() => [...new Set((catalog ?? []).map((p) => p.league))].sort(), [catalog]);
  // Drafting clubs as named in their draft season (the Cardinals appear as Chicago, St. Louis, Phoenix and Arizona).
  const clubs = useMemo(() => [...new Set((catalog ?? []).map((p) => p.team?.name).filter((n): n is string => !!n))].sort(), [catalog]);

  const list = useMemo(() => {
    if (!catalog) return [];
    const needle = q.trim().toLowerCase();
    let r = compact
      ? (era === 'ALL' ? catalog : catalog.filter((p) => p.year >= Number(era) && p.year < Number(era) + 10))
      : catalog.filter((p) => p.year >= from && p.year <= to);
    if (grp !== 'ALL') r = r.filter((p) => (compact ? p.mpos === grp : p.grp === grp));
    if (compact && club !== 'ALL') r = r.filter((p) => p.team?.name === club);
    if (league !== 'ALL') r = r.filter((p) => p.league === league);
    if (hof) r = r.filter((p) => p.hof);
    if (hidden) r = r.filter((p) => !hidden(p.key));
    if (needle) r = r.filter((p) => `${p.first} ${p.last} ${p.college}`.toLowerCase().includes(needle));
    const pickNo = (p: CatalogPlayer) => (p.round == null ? 99 : p.round) * 1000 + (p.pick ?? 999);
    r.sort((a, b) =>
      sort === 'year' ? b.year - a.year || pickNo(a) - pickNo(b)
      : sort === 'name' ? a.last.localeCompare(b.last) || a.first.localeCompare(b.first)
      : sort === 'pos' ? a.mpos.localeCompare(b.mpos) || b.cal - a.cal
      : sort === 'team' ? (a.team ? 0 : 1) - (b.team ? 0 : 1) || (a.team?.abbr ?? '').localeCompare(b.team?.abbr ?? '') || b.cal - a.cal
      : sort === 'pick' ? pickNo(a) - pickNo(b) || b.year - a.year
      : sort === 'wav' ? (b.wav ?? -1) - (a.wav ?? -1)
      : sort === 'pb' ? b.pb - a.pb || b.cal - a.cal
      : b.cal - a.cal || (b.wav ?? -1) - (a.wav ?? -1));
    return r;
  }, [catalog, q, grp, from, to, era, league, hof, sort, compact, hidden, club]);

  useEffect(() => { onListChange?.(list.map((p) => p.key)); }, [list, onListChange]);

  const sel = 'rounded-md border border-white/[0.07] bg-black/30 px-2 py-1 text-xs text-neutral-200 focus:border-primary focus:outline-none';
  const th = 'px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-neutral-400';
  const sortBtn = (k: SortKey, label: string) => (
    <button onClick={() => setSort(k)} className={`${th} ${sort === k ? 'text-neutral-100' : 'hover:text-neutral-200'}`}>{label}{sort === k ? ' ▾' : ''}</button>
  );

  if (compact) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-3 py-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or college…" className={`${sel} w-44`} />
          <select value={grp} onChange={(e) => setGrp(e.target.value)} className={sel} title="Madden position">
            <option value="ALL">All positions</option>
            {POS_NAMES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={era} onChange={(e) => setEra(e.target.value)} className={sel} title="Draft decade">
            {ERAS.map((e) => <option key={e} value={e}>{e === 'ALL' ? 'All eras' : `${e}s`}</option>)}
          </select>
          <select value={club} onChange={(e) => setClub(e.target.value)} className={`${sel} max-w-40`} title="Drafted by">
            <option value="ALL">All clubs</option>
            {clubs.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-neutral-300">
            <input type="checkbox" checked={hof} onChange={(e) => setHof(e.target.checked)} className="accent-primary" />HOF
          </label>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={sel}>
            <option value="cal">Sort: Overall</option>
            <option value="name">Sort: Name</option>
            <option value="pos">Sort: Position</option>
            <option value="team">Sort: Team</option>
            <option value="year">Sort: Year</option>
          </select>
          <span className="ml-auto text-xs tabular-nums text-muted">{list.length.toLocaleString()} match</span>
        </div>
        <VirtualList items={catalog ? list : []} rowHeight={ROW_H} keyOf={(p) => p.key}
          before={<>
            {error && (
              <div className="m-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-200">
                Couldn't load the player catalog: {error} <button onClick={onRetry} className="ml-2 underline">Retry</button>
              </div>
            )}
            {!catalog && !error && <div className="px-4 py-8 text-center text-sm text-muted">Loading the player pool…</div>}
          </>}
          after={catalog && list.length === 0 ? <div className="px-3 py-6 text-center text-sm text-neutral-500">Nobody matches.</div> : null}
          render={(p) => {
            const st = status(p.key);
            return (
              <div className={`flex h-10 items-center gap-2.5 border-b border-white/[0.05] px-3 text-sm ${st ? 'bg-success/5' : 'hover:bg-white/[0.035]'}`}>
                <Portrait src={headshot(p)} fallback={headshotFallback(p)} size="xs" />
                <span className="min-w-0 flex-1 truncate font-medium text-neutral-100">
                  {p.first} {p.last}
                  {p.hof && <span className="ml-1 rounded bg-gold/15 px-1 text-[10px] font-semibold text-gold" title="Hall of Fame">HOF</span>}
                </span>
                <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-xs font-semibold text-neutral-300 ring-1 ring-white/[0.06]">{p.mpos}</span>
                <span className="inline-flex w-6 justify-center" title={p.team ? `Drafted by the ${p.team.name}` : undefined}>{p.team && <TeamLogo team={p.team} size="sm" />}</span>
                <span className="w-20 text-right text-xs tabular-nums text-neutral-400">{p.year}{p.round != null ? ` · Rd ${p.round}` : ''}</span>
                <span className="w-8 rounded bg-surface-2 px-1 py-0.5 text-center text-xs font-semibold tabular-nums text-neutral-200" title="Career score: his overall when added">{p.cal}</span>
                {st ? (
                  <span className="w-14 rounded-md border border-success/40 bg-success/10 px-1.5 py-0.5 text-center text-xs text-success" title={st.title}>{st.label}</span>
                ) : addTeams ? (
                  addDisabled ? <span className="w-24 text-center text-xs text-muted">Add to…</span> : <TeamPicker teams={addTeams} onPick={(id) => onAdd(p.key, id)} />
                ) : (
                  <button onClick={() => onAdd(p.key)} disabled={addDisabled} className="w-14 rounded-md border border-primary/50 bg-primary/10 px-1.5 py-0.5 text-xs text-primary hover:bg-primary/20 disabled:opacity-40">Add</button>
                )}
              </div>
            );
          }} />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-2">
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
        {toolbarExtra}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {error && (
          <div className="m-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-200">
            Couldn't load the player catalog: {error} <button onClick={onRetry} className="ml-2 underline">Retry</button>
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
                const st = status(p.key);
                return (
                  <tr key={p.key} className={`border-t border-white/[0.05] ${st ? 'bg-success/5' : 'hover:bg-white/[0.06]/50'}`}>
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
                      {st ? (
                        <span className="rounded-md border border-success/40 bg-success/10 px-2 py-0.5 text-xs tabular-nums text-success" title={st.title}>{st.label}</span>
                      ) : (
                        <button onClick={() => onAdd(p.key)} disabled={addDisabled} className="rounded-md border border-primary/50 bg-primary/10 px-2 py-0.5 text-xs text-primary hover:bg-primary/20 disabled:opacity-40">Add</button>
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
          <div className="border-t border-white/[0.06] px-4 py-2 text-center text-xs text-muted">
            Showing {SHOW_MAX} of {list.length.toLocaleString()} — narrow the search or filters to see the rest.
          </div>
        )}
      </div>
    </div>
  );
}
