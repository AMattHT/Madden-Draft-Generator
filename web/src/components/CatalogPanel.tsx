import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { displayPortrait } from '../api';
import { POS_GROUP_ORDER, POS_NAMES } from '../constants';
import type { CatalogPlayer } from '../types';
import { Icon, ICONS, Portrait, RatingChip, Switch, TeamLogo } from './ui';
import { VirtualList } from './VirtualList';
import { TeamPicker } from './TeamPicker';
import type { PickTeam } from '../teamMatch';

/** Compact row height (h-10), shared with the windowed list. */
const ROW_H = 40;

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

  const sel = 'h-8 rounded-lg border border-white/[0.07] bg-black/30 px-2.5 text-xs text-neutral-200 transition-colors hover:border-white/[0.14] focus:border-primary focus:outline-none';
  const maxWav = useMemo(() => Math.max(1, ...(catalog ?? []).map((p) => p.wav ?? 0)), [catalog]);

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
                  {p.hof && <span className="ml-1 rounded bg-gold/15 px-1 text-[11px] font-semibold text-gold" title="Hall of Fame">HOF</span>}
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

  /* ---- Wide layout (the Class Studio): a windowed list with a column header. ---- */
  const col = (k: SortKey | null, label: string, cls: string) => (
    <span className={cls}>
      {k ? (
        <button onClick={() => setSort(k)} className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors ${sort === k ? 'text-primary-light' : 'text-neutral-500 hover:text-neutral-200'}`}>
          {label}{sort === k ? <span aria-hidden className="text-[9px]">▼</span> : null}
        </button>
      ) : (
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">{label}</span>
      )}
    </span>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] bg-surface-1/60 px-3 py-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"><Icon path={ICONS.search} className="h-3.5 w-3.5" /></span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or college…" className={`${sel} w-56 pl-8`} />
        </div>
        <select value={grp} onChange={(e) => setGrp(e.target.value)} className={sel} aria-label="Position group">
          <option value="ALL">All positions</option>
          {POS_GROUP_ORDER.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <span className="inline-flex items-center gap-1">
          <select value={from} onChange={(e) => { const v = Number(e.target.value); setFrom(v); if (v > to) setTo(v); }} className={`${sel} tabular-nums`} aria-label="From year">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <span className="text-[11px] text-muted">to</span>
          <select value={to} onChange={(e) => { const v = Number(e.target.value); setTo(v); if (v < from) setFrom(v); }} className={`${sel} tabular-nums`} aria-label="To year">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </span>
        <select value={league} onChange={(e) => setLeague(e.target.value)} className={sel} aria-label="League">
          <option value="ALL">All leagues</option>
          {leagues.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <Switch checked={hof} onChange={setHof} label="HOF only" className={`${sel} h-8`} />
        <span className="ml-auto text-[11px] tabular-nums text-muted"><span className="font-semibold text-neutral-200">{list.length.toLocaleString()}</span> match</span>
        {toolbarExtra}
      </div>
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-surface-1/95 px-3">
        <span className="w-7" />
        {col('name', 'Player', 'flex-1')}
        {col('pos', 'Pos', 'w-14')}
        {col('year', 'Year', 'w-16')}
        {col('pick', 'Drafted', 'w-24')}
        {col(null, 'College', 'hidden w-36 2xl:block')}
        {col('wav', 'wAV', 'w-28 text-right')}
        {col('pb', 'PB', 'hidden w-10 text-right 2xl:block')}
        {col('cal', 'Career', 'w-14 text-center')}
        <span className="w-16" />
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
        after={catalog && list.length === 0 ? <div className="px-3 py-8 text-center text-sm text-neutral-500">Nobody matches.</div> : null}
        render={(p) => {
          const st = status(p.key);
          const wavPct = p.wav != null ? Math.max(2, (p.wav / maxWav) * 100) : 0;
          return (
            <div className={`flex h-10 items-center gap-3 border-b border-white/[0.04] px-3 text-sm transition-colors ${st ? 'bg-success/[0.06]' : 'hover:bg-white/[0.035]'}`}>
              <Portrait src={headshot(p)} fallback={headshotFallback(p)} size="xs" />
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="truncate text-[13px] font-semibold text-neutral-100">{p.first} {p.last}</span>
                {p.hof && <span className="rounded bg-gold/15 px-1 text-[11px] font-bold text-gold" title="Hall of Fame">HOF</span>}
              </span>
              <span className="w-14"><span className="inline-flex h-5 items-center rounded bg-white/[0.05] px-1.5 text-[11px] font-semibold text-neutral-300 ring-1 ring-white/[0.06]">{p.mpos}</span></span>
              <span className="w-16 text-[11px] tabular-nums text-neutral-300">{p.year}{p.league !== 'NFL' ? <span className="ml-1 text-neutral-500">{p.league}</span> : null}</span>
              <span className="flex w-24 items-center gap-1.5 text-[11px] tabular-nums text-neutral-300">
                {p.team && <TeamLogo team={p.team} size="sm" />}
                {p.round != null ? `Rd ${p.round}${p.pick != null ? ` · #${p.pick}` : ''}` : 'UDFA'}
              </span>
              <span className="hidden w-36 truncate text-[11px] text-neutral-400 2xl:block">{p.college}</span>
              <span className="flex w-28 items-center gap-2" title="Career weighted Approximate Value">
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]"><span className="block h-full rounded-full bg-gradient-to-r from-primary to-primary-light" style={{ width: `${wavPct}%` }} /></span>
                <span className="w-8 text-right text-[11px] tabular-nums text-neutral-300">{p.wav ?? '–'}</span>
              </span>
              <span className="hidden w-10 text-right text-[11px] tabular-nums text-neutral-400 2xl:block" title={p.pb ? `${p.pb} Pro Bowls · ${p.ap1} first-team All-Pro` : undefined}>{p.pb || ''}</span>
              <span className="flex w-14 justify-center"><RatingChip ovr={p.cal} size="sm" /></span>
              <span className="flex w-16 justify-end">
                {st ? (
                  <span className="inline-flex h-7 items-center rounded-md border border-success/40 bg-success/10 px-2 text-[11px] font-semibold tabular-nums text-success-light" title={st.title}>{st.label}</span>
                ) : (
                  <button onClick={() => onAdd(p.key)} disabled={addDisabled} className="press inline-flex h-7 items-center gap-1 rounded-md border border-primary/50 bg-primary/10 px-2 text-[11px] font-semibold text-primary-light transition-colors hover:bg-primary/20 disabled:opacity-40">
                    <Icon path={ICONS.plus} className="h-3 w-3" strokeWidth={2.4} /> Add
                  </button>
                )}
              </span>
            </div>
          );
        }} />
    </div>
  );
}
