import { useEffect, useState } from 'react';
import type { DraftOpts } from '../App';
import { DEFAULT_DRAFT_OPTS } from '../App';
import type { CustomClass, TeamFranchise } from '../types';
import { api } from '../api';

/** Draft-class generation controls: source (this year, greats, or a hand-picked
 *  class) plus modifiers (class strength, guaranteed studs, a generational #1).
 *  Applied on demand so slider drags don't trigger a regenerate per tick. */
export function DraftOptions({ opts, decades, busy, onApply, customClasses = [], onOpenBuilder }: {
  opts: DraftOpts;
  decades: number[];
  busy: boolean;
  onApply: (o: DraftOpts) => void;
  customClasses?: CustomClass[];
  onOpenBuilder?: (c: CustomClass | null) => void;
}) {
  const [source, setSource] = useState(opts.source);
  const [decade, setDecade] = useState(opts.decade);
  const [strength, setStrength] = useState(opts.strength);
  const [studs, setStuds] = useState(opts.studs);
  const [generational, setGenerational] = useState(opts.generational);
  const [hindsight, setHindsight] = useState(opts.hindsight ?? 1);
  const [autoStrength, setAutoStrength] = useState(!!opts.autoStrength);
  const [customId, setCustomId] = useState(opts.customId);
  const [fill, setFill] = useState(opts.fill !== false);
  const [team, setTeam] = useState(opts.team);
  const [franchises, setFranchises] = useState<TeamFranchise[]>([]);

  // The franchise list is fetched the first time "By team" is chosen.
  useEffect(() => {
    if (source !== 'team' || franchises.length) return;
    api.franchises().then(setFranchises).catch(() => {});
  }, [source, franchises.length]);

  useEffect(() => {
    setSource(opts.source); setDecade(opts.decade); setStrength(opts.strength); setStuds(opts.studs); setGenerational(opts.generational);
    setHindsight(opts.hindsight ?? 1); setAutoStrength(!!opts.autoStrength); setCustomId(opts.customId); setFill(opts.fill !== false); setTeam(opts.team);
  }, [opts]);

  const next: DraftOpts = { source, decade, strength, studs, generational, hindsight, autoStrength, variant: opts.variant ?? 0, customId, fill, team };
  const needsClass = (source === 'picked' && !customId) || (source === 'team' && !team);
  const teamInfo = franchises.find((f) => f.key === team);
  const hindsightLabel = hindsight <= 0.05 ? 'Draft day' : hindsight >= 0.95 ? 'Career outcome' : `${Math.round(hindsight * 100)}% outcome`;
  const dirty = JSON.stringify(next) !== JSON.stringify(opts);
  const strengthLabel = strength < 0.95 ? 'Weaker' : strength > 1.05 ? 'Stronger' : 'Normal';

  const seg = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'bg-primary text-white shadow-sm' : 'text-neutral-400 hover:text-neutral-200'}`;

  return (
    <div className="rounded-lg border border-border bg-surface-1 p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted">Source</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center rounded-lg border border-border-strong bg-surface-2 p-0.5">
              <button className={seg(source === 'year')} onClick={() => setSource('year')}>This year</button>
              <button className={seg(source === 'decade')} onClick={() => setSource('decade')}>By decade</button>
              <button className={seg(source === 'alltime')} onClick={() => setSource('alltime')}>All-Time</button>
              <button className={seg(source === 'team')} onClick={() => setSource('team')} title="The best players a franchise ever drafted, one class">By team</button>
            </div>
            {source === 'team' && (
              <div className="flex items-center gap-2">
                {teamInfo?.logo && <img src={teamInfo.logo} alt="" className="h-6 w-6 object-contain" />}
                <select value={team ?? ''} onChange={(e) => setTeam(e.target.value || undefined)}
                  className="rounded-md border border-border bg-surface-0 px-2 py-1.5 text-sm text-neutral-200 focus:border-primary focus:outline-none">
                  <option value="">Choose a franchise…</option>
                  {franchises.map((f) => <option key={f.key} value={f.key}>{f.name}</option>)}
                </select>
              </div>
            )}
            {source === 'picked' && (
              <button onClick={() => onOpenBuilder?.(customClasses.find((c) => c.id === customId) ?? null)}
                className="rounded-md border border-gold/50 bg-gold/10 px-2.5 py-1.5 text-xs font-medium text-gold hover:bg-gold/20">
                Open in Class Studio…
              </button>
            )}
            {source === 'decade' && (
              <select value={decade} onChange={(e) => setDecade(Number(e.target.value))}
                className="rounded-md border border-border bg-surface-0 px-2 py-1.5 text-sm tabular-nums text-neutral-200 focus:border-primary focus:outline-none">
                {decades.map((d) => <option key={d} value={d}>{d}s</option>)}
              </select>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted">Class strength — <span className="text-neutral-300">{autoStrength ? 'Auto' : strengthLabel}</span></span>
          <input type="range" min={0.7} max={1.3} step={0.05} value={strength} disabled={autoStrength} onChange={(e) => setStrength(Number(e.target.value))} className="w-full accent-primary disabled:opacity-40" />
          <label className="flex items-center gap-2 text-xs text-neutral-300" title="Scale the curve by how good the class really was (top-32 caliber vs the 1970-2015 norm): 1983 tops out higher than 2013">
            <input type="checkbox" checked={autoStrength} onChange={(e) => setAutoStrength(e.target.checked)} />
            Auto from the class's real strength
          </label>
        </div>

        <div className="flex flex-col gap-1.5" title="0 = the board scouts saw on draft day (the #1 pick leads, Brady is a 6th-rounder); 1 = how careers turned out. Dev traits always follow the outcome, so hidden gems keep their Superstar trait.">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted">Hindsight — <span className="text-neutral-300">{hindsightLabel}</span></span>
          <input type="range" min={0} max={1} step={0.1} value={hindsight} onChange={(e) => setHindsight(Number(e.target.value))} className="w-full accent-primary" />
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted">Guaranteed studs</span>
          <input type="number" min={0} max={20} value={studs} onChange={(e) => setStuds(Math.max(0, Math.min(20, Number(e.target.value))))}
            className="w-24 rounded-md border border-border bg-surface-0 px-2.5 py-1.5 text-sm text-neutral-200 focus:border-primary focus:outline-none" />
        </label>

        <label className="flex items-end gap-2 pb-1.5 text-sm text-neutral-200">
          <input type="checkbox" checked={generational} onChange={(e) => setGenerational(e.target.checked)} />
          Generational #1 (X-Factor)
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button onClick={() => onApply(next)} disabled={busy || !dirty || needsClass}
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50">
          {busy ? 'Generating…' : 'Generate'}
        </button>
        {JSON.stringify(opts) !== JSON.stringify(DEFAULT_DRAFT_OPTS) && (
          <button onClick={() => onApply(DEFAULT_DRAFT_OPTS)} disabled={busy} className="text-xs text-muted hover:text-neutral-200">
            Reset to normal
          </button>
        )}
        <span className="ml-auto text-[11px] text-muted">
          {source === 'alltime' ? 'Best players in history, one class'
            : source === 'picked' ? 'Your Class Studio board, in pick order'
            : source === 'team' ? (teamInfo ? `The best players the ${teamInfo.name} ever drafted, every era` : 'Pick a franchise: its best draft picks ever, one class')
            : source === 'decade' ? `Greatest players drafted in the ${decade}s`
            : 'Modifiers apply to the selected year'}
        </span>
      </div>
    </div>
  );
}
