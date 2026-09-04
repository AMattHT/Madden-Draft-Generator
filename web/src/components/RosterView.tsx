import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import type { GameVersion, RosterData, RosterPlayer, SaveFileInfo } from '../types';
import { DEV_NAMES, fmtHeight, groupForId } from '../constants';
import { ATTR_COLUMNS } from '../constants';
import { DevBadge, Icon, ICONS, Pill, Portrait, RatingChip } from './ui';

const LAST_KEY = 'roster:last';
const fmtSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const fmtWhen = (t: number) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });

const GROUPS: [string, string][] = [
  ['ALL', 'All'], ['QB', 'QB'], ['RB', 'RB'], ['WR', 'WR'], ['TE', 'TE'], ['OL', 'OL'],
  ['EDGE', 'EDGE'], ['IDL', 'IDL'], ['LB', 'LB'], ['CB', 'CB'], ['S', 'S'], ['K', 'K'], ['P', 'P'],
];

/** Columns shown by default: the headline ratings; the CSV carries every attribute. */
const QUICK: [string, string][] = [['speed', 'SPD'], ['acceleration', 'ACC'], ['agility', 'AGI'], ['strength', 'STR'], ['awareness', 'AWR']];

function csvFor(data: RosterData, players: RosterPlayer[]): string {
  const attrs = ATTR_COLUMNS.map((c) => c.key);
  const head = ['First', 'Last', 'Team', 'Pos', 'OVR', 'Dev', 'Age', 'Height', 'Weight', 'Jersey', 'YearsPro', 'College', 'Archetype', 'FaceAsset', ...attrs];
  const q = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = players.map((p) => [p.firstName, p.lastName, p.team ?? 'FA', p.position, p.overall, DEV_NAMES[p.devTrait] ?? p.devTrait, p.age, p.heightInches, p.weight, p.jersey, p.yearsPro, p.college ?? '', p.archetype ?? '', p.assetName ?? '', ...attrs.map((k) => p.ratings[k] ?? '')].map(q).join(','));
  return [head.join(','), ...rows].join('\n');
}

function Picker({ onOpened }: { onOpened: (r: RosterData) => void }) {
  const [state, setState] = useState<{ dir: string; files: SaveFileInfo[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let alive = true;
    api.rosterSaves().then((r) => alive && setState(r)).catch((e) => alive && setErr((e as Error).message));
    return () => { alive = false; };
  }, []);
  const run = async (key: string, fn: () => Promise<RosterData>) => {
    setBusy(key); setErr(null);
    try { onOpened(await fn()); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const onFile = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => run('file', () => api.rosterOpenFile(f.name, String(reader.result)));
    reader.onerror = () => setErr('Could not read that file');
    reader.readAsDataURL(f);
  };
  return (
    <div className="mx-auto mt-10 w-[720px] max-w-full rounded-xl border border-border bg-surface-1 p-5">
      <div className="text-sm font-bold tracking-tight text-neutral-100">Open a roster</div>
      <p className="mt-1 text-[12px] leading-relaxed text-neutral-400">
        A Madden 27 ROSTER save: the game's own, or one you downloaded. Every player is shown with his ratings, team and face, read straight from the file. Rosters are read-only here.
      </p>
      <div className="mt-4 rounded-lg border border-border bg-surface-0">
        <header className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-2">
          <span className="text-xs font-semibold text-neutral-100">Madden 27 Saves</span>
          <span className="truncate text-[10px] text-muted" title={state?.dir}>{state?.dir ?? ''}</span>
        </header>
        <div className="max-h-72 overflow-auto">
          {!state && !err && <div className="px-3 py-4 text-xs text-muted">Looking…</div>}
          {state?.files.length === 0 && <div className="px-3 py-5 text-center text-xs text-muted">No ROSTER files in this folder. Browse for one below.</div>}
          {state?.files.map((f) => (
            <button key={f.name} onClick={() => run(f.name, () => api.rosterOpenSaved(f.name))} disabled={!!busy}
              className="flex w-full items-center justify-between gap-3 border-b border-border/60 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-surface-2 disabled:opacity-50">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-neutral-100">{f.name}</span>
                <span className="block text-[10px] text-muted">{fmtSize(f.sizeBytes)} · {fmtWhen(f.modified)}</span>
              </span>
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-primary">{busy === f.name ? 'Opening…' : 'Open'}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button onClick={() => fileRef.current?.click()} disabled={!!busy}
          className="rounded-md border border-border-strong bg-surface-2 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-surface-3 disabled:opacity-50">
          {busy === 'file' ? 'Opening…' : 'Browse for a roster file…'}
        </button>
        <input ref={fileRef} type="file" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        {err && <span className="text-xs text-red-300">{err}</span>}
      </div>
    </div>
  );
}

/**
 * Roster tab: open a Madden 27 ROSTER save and browse its players by team and
 * position, with ratings and faces, and export the lot as a CSV.
 */
export function RosterView({ gameVersion }: { gameVersion: GameVersion }) {
  const [data, setData] = useState<RosterData | null>(null);
  const [team, setTeam] = useState('ALL');
  const [group, setGroup] = useState('ALL');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'ovr' | 'name' | 'age' | 'pos' | 'team'>('ovr');
  const [restoring, setRestoring] = useState(true);

  // Reopen the last roster after a reload (the server keeps a copy).
  useEffect(() => {
    let id: string | null = null;
    try { id = localStorage.getItem(LAST_KEY); } catch { id = null; }
    if (!id) { setRestoring(false); return; }
    api.rosterGet(id).then(setData).catch(() => { try { localStorage.removeItem(LAST_KEY); } catch { /* ignore */ } }).finally(() => setRestoring(false));
  }, []);
  const opened = (r: RosterData) => {
    setData(r); setTeam('ALL'); setGroup('ALL'); setSearch('');
    try { localStorage.setItem(LAST_KEY, r.id); } catch { /* ignore */ }
  };
  const close = () => { setData(null); try { localStorage.removeItem(LAST_KEY); } catch { /* ignore */ } };

  const teams = useMemo(() => (data ? [...data.teams].filter((t) => !/free/i.test(t.name)).sort((a, b) => a.city.localeCompare(b.city)) : []), [data]);
  const rows = useMemo(() => {
    if (!data) return [];
    let r = data.players;
    if (team === 'FA') r = r.filter((p) => !p.team);
    else if (team !== 'ALL') r = r.filter((p) => p.team === team);
    if (group !== 'ALL') r = r.filter((p) => groupForId(p.positionId) === group);
    if (search.trim()) { const q = search.toLowerCase(); r = r.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q)); }
    const sorted = [...r];
    sorted.sort((a, b) => {
      if (sort === 'ovr') return b.overall - a.overall || a.lastName.localeCompare(b.lastName);
      if (sort === 'age') return a.age - b.age || b.overall - a.overall;
      if (sort === 'pos') return a.positionId - b.positionId || b.overall - a.overall;
      if (sort === 'team') return (a.team ?? 'zz').localeCompare(b.team ?? 'zz') || b.overall - a.overall;
      return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
    });
    return sorted;
  }, [data, team, group, search, sort]);

  const downloadCsv = () => {
    if (!data) return;
    const blob = new Blob([csvFor(data, rows)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${data.name}${team !== 'ALL' ? `-${team}` : ''}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  if (restoring) return <div className="p-8 text-sm text-muted">Loading…</div>;
  if (!data) {
    return (
      <div className="h-full overflow-auto px-6 py-4">
        {gameVersion !== 'm27' && (
          <div className="mx-auto mt-4 w-[720px] max-w-full rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-gold">Roster files are read in the Madden 27 format; Madden 26 rosters are not supported yet.</div>
        )}
        <Picker onOpened={opened} />
      </div>
    );
  }

  const onTeams = data.players.filter((p) => p.team).length;
  const select = 'rounded-md border border-border bg-surface-0 px-2.5 py-1.5 text-sm text-neutral-300 focus:border-primary focus:outline-none';
  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight"><span className="text-gold">{data.name}</span> <span className="text-neutral-400">· Madden 27 roster</span></h1>
            <Pill tone="neutral">read-only</Pill>
          </div>
          <div className="mt-0.5 text-xs text-neutral-400">
            <b className="text-neutral-200">{data.count}</b> players · <b className="text-neutral-200">{data.teamCount}</b> teams · <b className="text-neutral-200">{data.count - onTeams}</b> free agents
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={downloadCsv} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-light">
            <Icon path={ICONS.download} className="h-3.5 w-3.5" /> Export CSV ({rows.length})
          </button>
          <button onClick={close} className="rounded-md border border-border-strong bg-surface-2 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-surface-3">Open another…</button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 py-3">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface-1">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"><Icon path={ICONS.search} className="h-4 w-4" /></span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search players…" className="w-56 rounded-md border border-border bg-surface-0 py-1.5 pl-8 pr-3 text-sm text-neutral-200 placeholder:text-muted focus:border-primary focus:outline-none" />
            </div>
            <select value={team} onChange={(e) => setTeam(e.target.value)} className={select}>
              <option value="ALL">All teams</option>
              {teams.map((t) => <option key={t.id} value={t.abbr}>{t.city} {t.name}</option>)}
              <option value="FA">Free agents</option>
            </select>
            <select value={group} onChange={(e) => setGroup(e.target.value)} className={select}>
              {GROUPS.map(([v, l]) => <option key={v} value={v}>{v === 'ALL' ? 'All positions' : l}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={select}>
              <option value="ovr">Sort: Overall</option>
              <option value="name">Sort: Name</option>
              <option value="pos">Sort: Position</option>
              <option value="team">Sort: Team</option>
              <option value="age">Sort: Age</option>
            </select>
            <span className="ml-auto text-xs tabular-nums text-muted"><span className="font-semibold text-neutral-300">{rows.length}</span> of {data.count}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-surface-1 text-[11px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Player</th>
                  <th className="px-3 py-2 text-left font-medium">Team</th>
                  <th className="px-3 py-2 text-left font-medium">Pos</th>
                  <th className="px-3 py-2 text-center font-medium">OVR</th>
                  <th className="px-3 py-2 text-center font-medium">Dev</th>
                  <th className="px-3 py-2 text-right font-medium">Age</th>
                  <th className="px-3 py-2 text-right font-medium">Ht</th>
                  <th className="px-3 py-2 text-right font-medium">Wt</th>
                  {QUICK.map(([k, l]) => <th key={k} className="px-2 py-2 text-right font-medium">{l}</th>)}
                  <th className="px-3 py-2 text-left font-medium">Archetype</th>
                  <th className="px-3 py-2 text-left font-medium">College</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 1500).map((p) => (
                  <tr key={p.id} className="border-t border-border/60 hover:bg-surface-2/70">
                    <td className="px-3 py-1.5 font-medium text-neutral-100">
                      <span className="inline-flex items-center gap-2.5">
                        <Portrait src={p.portrait} size="xs" />
                        <span>{p.firstName} {p.lastName} <span className="text-[10px] text-muted">#{p.jersey}</span></span>
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-neutral-300" title={p.teamName ?? 'Free agent'}>{p.team ?? <span className="text-muted">FA</span>}</td>
                    <td className="px-3 py-1.5"><span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-neutral-300">{p.position}</span></td>
                    <td className="px-3 py-1.5 text-center"><RatingChip ovr={p.overall} size="sm" /></td>
                    <td className="px-3 py-1.5"><span className="flex justify-center"><DevBadge dev={p.devTrait} /></span></td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-neutral-300">{p.age || ''}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-neutral-300">{p.heightInches ? fmtHeight(p.heightInches) : ''}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-neutral-300">{p.weight || ''}</td>
                    {QUICK.map(([k]) => <td key={k} className="px-2 py-1.5 text-right tabular-nums text-neutral-300">{p.ratings[k]}</td>)}
                    <td className="px-3 py-1.5 text-xs text-neutral-400">{p.archetype ?? ''}</td>
                    <td className="px-3 py-1.5 text-xs text-neutral-400">{p.college ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 1500 && <div className="px-3 py-3 text-center text-xs text-muted">Showing the first 1,500 of {rows.length}. Narrow by team or position, or export the CSV.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
