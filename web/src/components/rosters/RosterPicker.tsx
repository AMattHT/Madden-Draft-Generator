import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api';
import type { RosterData, RosterDoc, SaveFileInfo, TeamInfo } from '../../types';
import { teamInfoMap } from '../../rosterTeams';
import { Button, Icon, ICONS, IconButton, Pill, TeamLogo } from '../ui';
import { ALL_TEAMS, ROSTER_LIMIT } from './TeamPanel';

const fmtSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const fmtWhen = (t: number) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });

/** Where a save came from, so the list reads as three kinds of file, not one. */
type Kind = 'game' | 'ours' | 'other';
const kindOf = (f: SaveFileInfo): Kind =>
  f.name === 'ROSTER-Official' ? 'game' : /^ROSTER-(GATE\d+|[A-Z0-9]{1,16})$/.test(f.name) ? 'ours' : 'other';
const KIND_LABEL: Record<Kind, string> = { game: "The game's roster", ours: 'Written by this app', other: 'Downloaded' };

/** A disc for the game's own file, a pen for ours, a download arrow for the rest. */
function KindGlyph({ kind }: { kind: Kind }) {
  const path =
    kind === 'game'
      ? 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-7a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'
      : kind === 'ours'
        ? 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z'
        : ICONS.download;
  const tone = kind === 'game' ? 'text-gold bg-gold/10' : kind === 'ours' ? 'text-primary-light bg-primary/12' : 'text-neutral-300 bg-white/[0.05]';
  return (
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tone}`}>
      <Icon path={path} className="h-4 w-4" />
    </span>
  );
}

/** What a saved roster has done to its base, in one line. */
function lineage(d: RosterDoc): string {
  const moves = Object.values(d.moves).length;
  const parts = [] as string[];
  if (d.adds.length) parts.push(`${d.adds.length} add${d.adds.length === 1 ? '' : 's'}`);
  if (moves) parts.push(`${moves} move${moves === 1 ? '' : 's'}`);
  const edits = Object.keys(d.edits).length;
  if (edits) parts.push(`${edits} edit${edits === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' · ') : 'No changes yet';
}

/**
 * Team-first stage: a base file is loaded, and the league is the page. Thirty-two
 * tiles with roster counts, free agency, and "every player"; each opens the builder
 * on that club.
 */
function TeamStage({ data, fromSaves, onBack, onOpen }: {
  data: RosterData;
  fromSaves: boolean;
  onBack: () => void;
  onOpen: (teamId: number) => void;
}) {
  const [logos, setLogos] = useState<Map<number, TeamInfo>>(new Map());
  useEffect(() => {
    let alive = true;
    api.franchises().then((f) => { if (alive) setLogos(teamInfoMap(data.teams, f)); }).catch(() => {});
    return () => { alive = false; };
  }, [data.teams]);
  const fa = data.freeAgentTeamId;
  const teams = useMemo(() => data.teams.filter((t) => t.id !== fa).sort((a, b) => a.abbr.localeCompare(b.abbr)), [data.teams, fa]);
  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of data.players) m.set(p.teamId, (m.get(p.teamId) ?? 0) + 1);
    return m;
  }, [data.players]);
  const over = teams.filter((t) => (counts.get(t.id) ?? 0) > ROSTER_LIMIT).length;

  return (
    <div className="mx-auto w-[1040px] max-w-full animate-view px-2 py-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <button onClick={onBack} className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted transition-colors hover:text-neutral-100">
            <Icon path={ICONS.chevronLeft} className="h-3.5 w-3.5" /> Rosters
          </button>
          <h1 className="mt-1 truncate font-display text-[26px] font-extrabold leading-none text-neutral-50">{data.name}</h1>
          <p className="mt-2 text-[13px] text-neutral-400">
            <span className="tabular-nums">{data.players.length.toLocaleString()}</span> players · {teams.length} teams · {fromSaves ? 'from the saves folder' : 'browsed file'} · pick a team to open, or work the whole league.
            {over > 0 && <span className="ml-2 text-red-300">{over} team{over === 1 ? ' is' : 's are'} over the {ROSTER_LIMIT}-man limit.</span>}
          </p>
        </div>
        <Button tone="primary" onClick={() => onOpen(ALL_TEAMS)}>
          Open the whole league
          <Icon path={ICONS.arrowRight} className="h-3.5 w-3.5" />
        </Button>
      </header>

      <div className="stagger mt-6 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
        {teams.map((t, i) => {
          const n = counts.get(t.id) ?? 0;
          const logo = logos.get(t.id);
          return (
            <button
              key={t.id}
              onClick={() => onOpen(t.id)}
              title={`${t.city} ${t.name} · ${n} players`}
              style={{ ['--i' as string]: Math.min(i, 24) }}
              className="press group relative flex h-[84px] flex-col items-center justify-center gap-1.5 rounded-xl border border-white/[0.06] bg-surface-2 transition-all duration-200 hover:border-white/[0.16] hover:bg-surface-3 hover:shadow-[0_12px_30px_-14px_rgba(0,0,0,0.9)]"
            >
              <span className={`absolute right-2 top-1.5 text-[11px] font-semibold tabular-nums ${n > ROSTER_LIMIT ? 'text-red-300' : 'text-neutral-500'}`}>{n}</span>
              {logo ? (
                <span className="transition-transform duration-200 group-hover:scale-110"><TeamLogo team={logo} size="lg" /></span>
              ) : (
                <span className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.05] text-[11px] font-bold text-neutral-300">{t.abbr}</span>
              )}
              <span className="text-[11px] font-bold text-neutral-200">{t.abbr}</span>
            </button>
          );
        })}
        <button
          onClick={() => onOpen(fa)}
          title="Free agents"
          className="press col-span-2 flex h-[84px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] text-neutral-300 transition-all duration-200 hover:border-white/[0.24] hover:bg-white/[0.05]"
        >
          <span className="text-[12px] font-bold">Free agents</span>
          <span className="text-[11px] tabular-nums text-muted">{(counts.get(fa) ?? 0).toLocaleString()} players</span>
        </button>
      </div>
    </div>
  );
}

/** First screen of the Rosters area: the rosters you have going, the saves folder, and a browsed file. */
export function RosterPicker({ savedDocs, onOpenBase, onOpenDoc, onDeleteDoc, onNew, notice, opening = false }: {
  savedDocs: RosterDoc[];
  /** teamId: the club to open the builder on (ALL_TEAMS for the whole file). */
  onOpenBase: (data: RosterData, fromSaves: boolean, teamId?: number) => void;
  onOpenDoc: (doc: RosterDoc) => void;
  onDeleteDoc: (id: string) => void;
  /** Start a roster from scratch: empty teams, filled from the pool. Omitted while re-picking a base. */
  onNew?: () => void;
  /** A message from the owner (an open that failed), shown under the header. */
  notice?: string | null;
  /** The owner is opening something (a saved roster, the game's file). */
  opening?: boolean;
}) {
  const [state, setState] = useState<{ dir: string; files: SaveFileInfo[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [stage, setStage] = useState<{ data: RosterData; fromSaves: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let alive = true;
    api.rosterSaves().then((r) => alive && setState(r)).catch((e) => alive && setErr((e as Error).message));
    return () => { alive = false; };
  }, []);
  // Loading a base lands on the team stage; re-picking a base (no onNew) goes straight in.
  const run = async (key: string, fromSaves: boolean, fn: () => Promise<RosterData>) => {
    setBusy(key); setErr(null);
    try {
      const data = await fn();
      if (onNew) setStage({ data, fromSaves });
      else onOpenBase(data, fromSaves);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const onFile = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => run('file', false, () => api.rosterOpenFile(f.name, String(reader.result)));
    reader.onerror = () => setErr('Could not read that file');
    reader.readAsDataURL(f);
  };
  // The game's roster first, then downloads, then what this app wrote; newest first within each.
  const order: Record<Kind, number> = { game: 0, other: 1, ours: 2 };
  const files = state ? [...state.files].sort((a, b) => order[kindOf(a)] - order[kindOf(b)] || b.modified - a.modified) : [];
  const recent = useMemo(() => [...savedDocs].sort((a, b) => b.updatedAt - a.updatedAt), [savedDocs]);
  // A roster from scratch borrows the game's own file as its container.
  const hasOfficial = !state || state.files.some((f) => f.name === 'ROSTER-Official');
  const shown = err ?? notice;
  const anyBusy = !!busy || opening;

  if (stage) return <TeamStage data={stage.data} fromSaves={stage.fromSaves} onBack={() => setStage(null)} onOpen={(teamId) => onOpenBase(stage.data, stage.fromSaves, teamId)} />;

  return (
    <div className="mx-auto w-[1040px] max-w-full animate-view px-2 py-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl">
          <h1 className="font-display text-[26px] font-extrabold leading-none text-neutral-50">Rosters</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-neutral-400">
            Continue a roster you have going, or open a Madden 27 ROSTER save and pick a team. Export writes a new file; the one you opened is never changed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => fileRef.current?.click()} disabled={!!busy}>
            <Icon path={ICONS.folder} className="h-3.5 w-3.5" />
            {busy === 'file' ? 'Opening…' : 'Browse for a file'}
          </Button>
          {onNew && (
            <Button tone="primary" onClick={onNew} disabled={anyBusy || !hasOfficial} title={hasOfficial ? 'Empty teams, filled from the player pool' : "Needs the game's ROSTER-Official in the saves folder: save a roster in Madden 27 once"}>
              <Icon path={ICONS.plus} className="h-3.5 w-3.5" strokeWidth={2.4} />
              {opening ? 'Opening…' : 'New roster'}
            </Button>
          )}
          <input ref={fileRef} type="file" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </header>

      {shown && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-red-200">
          <Icon path={ICONS.warning} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{shown}</span>
        </div>
      )}

      {/* ---- Your rosters: lineage cards, newest first. ---- */}
      {(recent.length > 0 || onNew) && (
        <section className="mt-6">
          <div className="mb-2.5 flex items-baseline justify-between">
            <h2 className="text-sm font-bold text-neutral-100">Your rosters</h2>
            {recent.length > 0 && <span className="text-[11px] tabular-nums text-muted">{recent.length} saved here</span>}
          </div>
          <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((d, i) => (
              <div
                key={d.id}
                style={{ ['--i' as string]: i }}
                className="group relative flex min-h-[124px] flex-col rounded-xl border border-white/[0.07] bg-surface-2 p-4 transition-all duration-200 hover:border-white/[0.16] hover:shadow-[0_16px_36px_-18px_rgba(0,0,0,0.9)]"
              >
                <button onClick={() => onOpenDoc(d)} className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary-light" aria-label={`Continue ${d.name || 'Untitled roster'}`} />
                <div className="pointer-events-none">
                  <div className="truncate font-display text-[18px] font-bold leading-tight text-neutral-50">{d.name || 'Untitled roster'}</div>
                  <div className="mt-2 flex flex-col gap-1 text-[11px] text-neutral-400">
                    <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-neutral-600" />{d.fresh ? 'From scratch' : `From ${d.base.fileName}`}</span>
                    <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-neutral-600" />{lineage(d)}</span>
                    <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_6px_rgba(34,197,94,0.8)]" />Updated {fmtWhen(d.updatedAt)}</span>
                  </div>
                </div>
                <div className="pointer-events-none mt-auto flex items-center justify-between pt-3">
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-primary-light transition-transform duration-200 group-hover:translate-x-0.5">
                    Continue <Icon path={ICONS.arrowRight} className="h-3.5 w-3.5" />
                  </span>
                </div>
                <IconButton
                  size="xs"
                  label={`Delete ${d.name || 'Untitled roster'}`}
                  className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${d.name || 'Untitled roster'}"? The base file is not touched.`)) onDeleteDoc(d.id); }}
                >
                  <Icon path={ICONS.close} className="h-3.5 w-3.5" />
                </IconButton>
              </div>
            ))}
            {onNew && (
              <button
                onClick={onNew}
                disabled={anyBusy || !hasOfficial}
                title={hasOfficial ? undefined : "Needs the game's ROSTER-Official in the saves folder: save a roster in Madden 27 once"}
                style={{ ['--i' as string]: recent.length }}
                className="press flex min-h-[124px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/[0.14] bg-transparent text-center transition-all duration-200 hover:border-primary/60 hover:bg-primary/[0.06] disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-primary-light"><Icon path={ICONS.plus} className="h-4 w-4" strokeWidth={2.4} /> New roster</span>
                <span className="text-[11px] text-muted">{hasOfficial ? 'Empty teams, filled from the pool' : "Needs the game's roster file first"}</span>
              </button>
            )}
          </div>
        </section>
      )}

      {/* ---- Saves folder. ---- */}
      <section className="glass mt-6 overflow-hidden rounded-xl">
        <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5">
          <span className="text-xs font-semibold text-neutral-100">Start from a save <span className="ml-1 font-normal text-muted">· Madden 27 saves folder</span></span>
          <span className="min-w-0 truncate text-[11px] text-muted" title={state?.dir}>{state?.dir ?? ''}</span>
        </header>
        <div className="max-h-[360px] overflow-auto">
          {!state && !err && (
            <div className="flex flex-col" aria-busy>
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex h-14 items-center gap-3 border-b border-white/[0.04] px-4" style={{ opacity: 1 - i * 0.25 }}>
                  <span className="skeleton h-9 w-9 rounded-lg" />
                  <span className="flex flex-1 flex-col gap-1.5"><span className="skeleton h-3 w-40" /><span className="skeleton h-2.5 w-24" /></span>
                </div>
              ))}
            </div>
          )}
          {state?.files.length === 0 && (
            <div className="px-4 py-10 text-center">
              <div className="text-sm font-semibold text-neutral-200">No ROSTER files in this folder</div>
              <div className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted">
                Save a roster in Madden 27 and it appears here, or browse for a ROSTER file you downloaded.
              </div>
            </div>
          )}
          {files.map((f) => {
            const kind = kindOf(f);
            const opening = busy === f.name;
            return (
              <button
                key={f.name}
                onClick={() => run(f.name, true, () => api.rosterOpenSaved(f.name))}
                disabled={!!busy}
                className="group flex h-14 w-full items-center gap-3 border-b border-white/[0.04] px-4 text-left transition-colors last:border-b-0 hover:bg-white/[0.04] focus-visible:bg-white/[0.04] disabled:opacity-60"
              >
                <KindGlyph kind={kind} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-semibold text-neutral-100">{f.name}</span>
                    {kind === 'game' && <Pill tone="gold">Official</Pill>}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted">
                    {KIND_LABEL[kind]} · {fmtSize(f.sizeBytes)} · {fmtWhen(f.modified)}
                  </span>
                </span>
                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold transition-all ${opening ? 'text-primary-light' : 'text-neutral-500 group-hover:translate-x-0.5 group-hover:text-primary-light'}`}>
                  {opening ? 'Opening…' : 'Pick a team'}
                  {!opening && <Icon path={ICONS.arrowRight} className="h-3.5 w-3.5" />}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
