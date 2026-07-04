import { useEffect, useState } from 'react';
import {
  api,
  type FranchiseInfo,
  type CapResetOptions,
  type CapResetResult,
  type PlayerEditResult,
  type TeamIdentity,
  type RgbColor,
  type RelocateRebrandOptions,
  type RelocateRebrandResult,
} from '../api';
import { RandomDraft } from './RandomDraft';

const fmtM = (m: number) => `$${m.toFixed(1)}M`;
const fmtDate = (ms: number) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
const rgbToHex = (c: RgbColor) => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
const hexToRgb = (h: string): RgbColor => ({ r: parseInt(h.slice(1, 3), 16) || 0, g: parseInt(h.slice(3, 5), 16) || 0, b: parseInt(h.slice(5, 7), 16) || 0 });

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-neutral-500">{hint}</span>}
    </label>
  );
}

export function FranchisePanel({
  years,
  usedYears,
  lastDrawn,
  range,
  onDraw,
  onUndo,
  onSetRange,
  onToggleUsed,
  onClearUsed,
}: {
  years: number[];
  usedYears: Set<number>;
  lastDrawn: number | null;
  range: { from: number; to: number } | null;
  onDraw: () => void;
  onUndo: () => void;
  onSetRange: (from: number, to: number) => void;
  onToggleUsed: (year: number) => void;
  onClearUsed: () => void;
}) {
  const [savesDir, setSavesDir] = useState('');
  const [files, setFiles] = useState<FranchiseInfo[]>([]);
  const [selected, setSelected] = useState('');
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [clearDeadMoney, setClearDeadMoney] = useState(true);
  const [capRoomMode, setCapRoomMode] = useState<'off' | 'freed' | 'fixed'>('fixed');
  const [fixedCapRoomM, setFixedCapRoomM] = useState(150);
  const [rolloverFloorM, setRolloverFloorM] = useState(50);
  const [lowerSalaries, setLowerSalaries] = useState(false);
  const [salaryPct, setSalaryPct] = useState(50);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CapResetResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Player tools
  const [healInjuries, setHealInjuries] = useState(true);
  const [setDevOn, setSetDevOn] = useState(false);
  const [devScope, setDevScope] = useState<'all' | 'rookies'>('rookies');
  const [devTier, setDevTier] = useState<'Normal' | 'Star' | 'Superstar' | 'XFactor'>('Star');
  const [ptBusy, setPtBusy] = useState(false);
  const [ptResult, setPtResult] = useState<PlayerEditResult | null>(null);
  const [ptError, setPtError] = useState<string | null>(null);

  // Relocation & rebrand
  const [teams, setTeams] = useState<TeamIdentity[]>([]);
  const [rbTeamIndex, setRbTeamIndex] = useState<number | null>(null);
  const [rbName, setRbName] = useState('');
  const [rbNick, setRbNick] = useState('');
  const [rbCity, setRbCity] = useState('');
  const [rbAbbr, setRbAbbr] = useState('');
  const [rbPrimary, setRbPrimary] = useState('#000000');
  const [rbSecondary, setRbSecondary] = useState('#000000');
  const [rbHub, setRbHub] = useState('#000000');
  const [rbLogo, setRbLogo] = useState(0);
  const [rbBusy, setRbBusy] = useState(false);
  const [rbResult, setRbResult] = useState<RelocateRebrandResult | null>(null);
  const [rbError, setRbError] = useState<string | null>(null);
  const rbTeam = teams.find((t) => t.teamIndex === rbTeamIndex) ?? null;

  useEffect(() => {
    api.franchiseList()
      .then((r) => {
        setSavesDir(r.savesDir);
        setFiles(r.franchises);
        // default to the most recent save that isn't one of our own outputs
        const def = r.franchises.find((f) => !/-CAPRESET/i.test(f.name)) || r.franchises[0];
        if (def) setSelected(def.name);
      })
      .catch((e) => setLoadErr(e.message));
  }, []);

  async function runReset() {
    if (!selected) return;
    setBusy(true); setError(null); setResult(null);
    const options: CapResetOptions = {
      clearDeadMoney,
      capRoomMode,
      fixedCapRoomM,
      rolloverFloorM,
      salaryScale: lowerSalaries ? Math.max(0.05, Math.min(0.99, salaryPct / 100)) : null,
    };
    try {
      const res = await api.franchiseCapReset(selected, options);
      setResult(res);
      api.franchiseList().then((r) => setFiles(r.franchises)).catch(() => {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runPlayerEdit() {
    if (!selected) return;
    if (!healInjuries && !setDevOn) return;
    setPtBusy(true); setPtError(null); setPtResult(null);
    try {
      const res = await api.franchisePlayerEdit(selected, {
        healInjuries,
        setDev: setDevOn ? { scope: devScope, tier: devTier } : null,
      });
      setPtResult(res);
      api.franchiseList().then((r) => setFiles(r.franchises)).catch(() => {});
    } catch (e) {
      setPtError((e as Error).message);
    } finally {
      setPtBusy(false);
    }
  }

  // Load each team's current identity when the selected save changes.
  useEffect(() => {
    if (!selected) { setTeams([]); setRbTeamIndex(null); return; }
    api.franchiseTeams(selected)
      .then((r) => { setTeams(r.teams); setRbTeamIndex(r.teams[0]?.teamIndex ?? null); })
      .catch(() => { setTeams([]); setRbTeamIndex(null); });
  }, [selected]);

  // Pre-fill the form from the picked team's current identity.
  useEffect(() => {
    const t = teams.find((x) => x.teamIndex === rbTeamIndex);
    if (!t) return;
    setRbName(t.displayName); setRbNick(t.nickName); setRbCity(t.city); setRbAbbr(t.abbreviation);
    setRbPrimary(rgbToHex(t.primary)); setRbSecondary(rgbToHex(t.secondary)); setRbHub(rgbToHex(t.hub));
    setRbLogo(t.logoId); setRbResult(null); setRbError(null);
  }, [rbTeamIndex, teams]);

  async function runRelocateRebrand() {
    if (!selected || !rbTeam) return;
    setRbBusy(true); setRbError(null); setRbResult(null);
    const opts: RelocateRebrandOptions = { teamIndex: rbTeam.teamIndex };
    const changed = (a: string, b: string) => a.toLowerCase() !== b.toLowerCase();
    if (rbName !== rbTeam.displayName) opts.displayName = rbName;
    if (rbNick !== rbTeam.nickName) opts.nickName = rbNick;
    if (rbCity !== rbTeam.city) opts.city = rbCity;
    if (rbAbbr !== rbTeam.abbreviation) opts.abbreviation = rbAbbr;
    if (changed(rbPrimary, rgbToHex(rbTeam.primary))) opts.primary = hexToRgb(rbPrimary);
    if (changed(rbSecondary, rgbToHex(rbTeam.secondary))) opts.secondary = hexToRgb(rbSecondary);
    if (changed(rbHub, rgbToHex(rbTeam.hub))) opts.hub = hexToRgb(rbHub);
    if (rbLogo !== rbTeam.logoId) opts.logoId = rbLogo;
    if (Object.keys(opts).length <= 1) { setRbError('No changes — edit a field first.'); setRbBusy(false); return; }
    try {
      const res = await api.franchiseRelocateRebrand(selected, opts);
      setRbResult(res);
      api.franchiseList().then((r) => setFiles(r.franchises)).catch(() => {});
    } catch (e) {
      setRbError((e as Error).message);
    } finally {
      setRbBusy(false);
    }
  }

  const inputCls = 'w-full rounded-md border border-border bg-surface-0 px-2.5 py-1.5 text-sm text-neutral-200 focus:border-primary focus:outline-none';

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-4 overflow-auto px-6 py-6">
      <RandomDraft
        years={years}
        used={usedYears}
        lastDrawn={lastDrawn}
        range={range}
        onDraw={onDraw}
        onUndo={onUndo}
        onSetRange={onSetRange}
        onToggleUsed={onToggleUsed}
        onClear={onClearUsed}
      />

      <div>
        <h1 className="text-xl font-bold tracking-tight">Franchise Salary-Cap Reset</h1>
        <p className="mt-1 text-xs text-muted">
          Clears accumulated dead money and opens cap room across all 32 teams for a late-franchise save.
          Writes a <span className="text-neutral-300">new</span> <code className="rounded bg-black/30 px-1">CAREER-…-CAPRESET</code> file —
          your original is never touched. Load it in Madden → Franchise → Load.
        </p>
      </div>

      {loadErr && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-200">
          Couldn’t read the Madden Saves folder: {loadErr}
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface-1 p-4">
        <Field label="Franchise save" hint={savesDir ? `from ${savesDir}` : undefined}>
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className={inputCls}>
            {files.length === 0 && <option value="">No CAREER saves found</option>}
            {files.map((f) => (
              <option key={f.name} value={f.name}>
                {f.name}  ·  {(f.sizeBytes / 1e6).toFixed(1)}MB  ·  {fmtDate(f.modified)}
              </option>
            ))}
          </select>
        </Field>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-neutral-200">
            <input type="checkbox" checked={clearDeadMoney} onChange={(e) => setClearDeadMoney(e.target.checked)} />
            Clear dead money (cap penalties → $0)
          </label>

          <Field label="Cap room">
            <select value={capRoomMode} onChange={(e) => setCapRoomMode(e.target.value as any)} className={inputCls}>
              <option value="off">Leave cap room as-is</option>
              <option value="freed">Add freed dead money to cap room</option>
              <option value="fixed">Set a fixed cap room ($M)</option>
            </select>
          </Field>

          {capRoomMode === 'fixed' && (
            <Field label="Fixed cap room ($M per team)" hint="Aggressive — displayed directly by the game">
              <input type="number" value={fixedCapRoomM} min={0} max={500} onChange={(e) => setFixedCapRoomM(Number(e.target.value))} className={inputCls} />
            </Field>
          )}

          <Field label="Rollover floor ($M)" hint="0 = leave as-is">
            <input type="number" value={rolloverFloorM} min={0} max={200} onChange={(e) => setRolloverFloorM(Number(e.target.value))} className={inputCls} />
          </Field>
        </div>

        <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <label className="flex items-center gap-2 text-sm text-amber-200">
            <input type="checkbox" checked={lowerSalaries} onChange={(e) => setLowerSalaries(e.target.checked)} />
            Lower player salaries <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase">Experimental</span>
          </label>
          {lowerSalaries && (
            <div className="mt-2">
              <Field label="Scale all contracts to (%)" hint="Scales every signed player's salary + bonus + cap hit. Verify in-game.">
                <input type="number" value={salaryPct} min={5} max={99} onChange={(e) => setSalaryPct(Number(e.target.value))} className={`${inputCls} max-w-[8rem]`} />
              </Field>
            </div>
          )}
        </div>

        <button
          onClick={runReset}
          disabled={busy || !selected}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
        >
          {busy ? 'Resetting…' : 'Reset cap → new save'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-200">{error}</div>
      )}

      {result && (
        <div className="rounded-lg border border-success/40 bg-success/10 p-4">
          <div className="text-sm font-semibold text-green-100">
            Wrote <code className="rounded bg-black/30 px-1">{result.output}</code> — {result.teamsEdited} teams
            {result.playersScaled > 0 && `, ${result.playersScaled} players scaled`}
          </div>
          <div className="mt-1 text-xs text-green-200/80">Load it in Madden (Franchise → Load) and check your cap screen.</div>
          <div className="mt-3 max-h-80 overflow-auto rounded-md border border-border bg-surface-1">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-2 text-[11px] uppercase tracking-wide text-neutral-400">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Team</th>
                  <th className="px-3 py-2 text-right font-semibold">Dead money</th>
                  <th className="px-3 py-2 text-right font-semibold">Cap room</th>
                  <th className="px-3 py-2 text-right font-semibold">Rollover</th>
                </tr>
              </thead>
              <tbody>
                {result.teams.map((t) => (
                  <tr key={t.name} className="border-t border-border/50">
                    <td className="px-3 py-1.5 font-medium text-neutral-100">{t.name}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      <span className="text-neutral-500">{fmtM(t.before.deadMoneyM)}</span>
                      <span className="text-neutral-600"> → </span>
                      <span className="text-green-300">{fmtM(t.after.deadMoneyM)}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      <span className="text-neutral-500">{fmtM(t.before.capRoomM)}</span>
                      <span className="text-neutral-600"> → </span>
                      <span className="text-neutral-100">{fmtM(t.after.capRoomM)}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-neutral-300">{fmtM(t.after.rolloverM)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Player tools */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">Player Tools</h1>
        <p className="mt-1 text-xs text-muted">
          Bulk edits to your league's players — safe, direct edits to the same save (writes a new{' '}
          <code className="rounded bg-black/30 px-1">CAREER-…-PLAYERS</code> file).
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface-1 p-4">
        <div className="grid grid-cols-1 gap-4">
          <label className="flex items-center gap-2 text-sm text-neutral-200">
            <input type="checkbox" checked={healInjuries} onChange={(e) => setHealInjuries(e.target.checked)} />
            Heal all injuries (clear injuries + injured reserve, league-wide)
          </label>

          <div className="rounded-md border border-border/60 p-3">
            <label className="flex items-center gap-2 text-sm text-neutral-200">
              <input type="checkbox" checked={setDevOn} onChange={(e) => setSetDevOn(e.target.checked)} />
              Set development trait
            </label>
            {setDevOn && (
              <div className="mt-3 flex flex-wrap items-end gap-4">
                <Field label="For">
                  <select value={devScope} onChange={(e) => setDevScope(e.target.value as 'all' | 'rookies')} className={inputCls}>
                    <option value="rookies">Rookies only (0 years pro)</option>
                    <option value="all">All players</option>
                  </select>
                </Field>
                <Field label="Trait">
                  <select value={devTier} onChange={(e) => setDevTier(e.target.value as typeof devTier)} className={inputCls}>
                    <option value="Normal">Normal</option>
                    <option value="Star">Star</option>
                    <option value="Superstar">Superstar</option>
                    <option value="XFactor">X-Factor</option>
                  </select>
                </Field>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={runPlayerEdit}
          disabled={ptBusy || !selected || (!healInjuries && !setDevOn)}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
        >
          {ptBusy ? 'Applying…' : 'Apply player edits → new save'}
        </button>
      </div>

      {ptError && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-200">{ptError}</div>
      )}

      {ptResult && (
        <div className="rounded-lg border border-success/40 bg-success/10 p-4 text-sm">
          <div className="font-semibold text-green-100">
            Wrote <code className="rounded bg-black/30 px-1">{ptResult.output}</code>
          </div>
          <div className="mt-1 text-green-200/90">
            {ptResult.playersConsidered} players processed
            {ptResult.injuriesCleared > 0 && ` · ${ptResult.injuriesCleared} injuries cleared`}
            {ptResult.devSet > 0 && ` · ${ptResult.devSet} dev traits set`}
          </div>
          <div className="mt-1 text-xs text-green-200/70">Load it in Madden (Franchise → Load).</div>
        </div>
      )}

      {/* Relocation & Rebrand */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">Relocation &amp; Rebrand</h1>
        <p className="mt-1 text-xs text-muted">
          Rename a team, move its city, and recolor it. Edits the team in place — schedule, standings,
          and rosters stay attached — and writes a new{' '}
          <code className="rounded bg-black/30 px-1">CAREER-…-REBRAND</code> /{' '}
          <code className="rounded bg-black/30 px-1">-RELOCATE</code> file.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface-1 p-4">
        <Field label="Team">
          <select
            value={rbTeamIndex ?? ''}
            onChange={(e) => setRbTeamIndex(e.target.value === '' ? null : Number(e.target.value))}
            className={inputCls}
          >
            {teams.length === 0 && <option value="">{selected ? 'Loading teams…' : 'Pick a save first'}</option>}
            {teams.map((t) => (
              <option key={t.teamIndex} value={t.teamIndex}>
                {t.city} {t.displayName} ({t.abbreviation})
              </option>
            ))}
          </select>
        </Field>

        {rbTeam && (
          <>
            {rbTeam.locked && (
              <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
                This team is flagged <code className="rounded bg-black/30 px-1">TEAM_LOCKED</code> — edits may not stick in-game.
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="City" hint="max 16 — moving this makes it a relocation">
                <input value={rbCity} maxLength={16} onChange={(e) => setRbCity(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Team name" hint="max 18">
                <input value={rbName} maxLength={18} onChange={(e) => setRbName(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Nickname" hint="max 18">
                <input value={rbNick} maxLength={18} onChange={(e) => setRbNick(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Abbreviation" hint="max 8 · 2–4 ideal">
                <input value={rbAbbr} maxLength={8} onChange={(e) => setRbAbbr(e.target.value.toUpperCase())} className={inputCls} />
              </Field>
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-5">
              <Field label="Primary">
                <input type="color" value={rbPrimary} onChange={(e) => setRbPrimary(e.target.value)} className="h-9 w-16 cursor-pointer rounded border border-border bg-surface-0" />
              </Field>
              <Field label="Secondary">
                <input type="color" value={rbSecondary} onChange={(e) => setRbSecondary(e.target.value)} className="h-9 w-16 cursor-pointer rounded border border-border bg-surface-0" />
              </Field>
              <Field label="Hub / menu">
                <input type="color" value={rbHub} onChange={(e) => setRbHub(e.target.value)} className="h-9 w-16 cursor-pointer rounded border border-border bg-surface-0" />
              </Field>
              <Field label="Logo ID" hint="0–31 = stock team logos">
                <input type="number" min={0} max={2047} value={rbLogo} onChange={(e) => setRbLogo(Number(e.target.value))} className={`${inputCls} max-w-[7rem]`} />
              </Field>
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-md border border-border/60 bg-surface-0 p-3">
              <span
                className="inline-flex h-9 w-9 items-center justify-center rounded text-[10px] font-bold"
                style={{ backgroundColor: rbPrimary, color: rbSecondary }}
              >
                {rbAbbr || '—'}
              </span>
              <div className="text-sm">
                <div className="font-semibold text-neutral-100">{rbCity} {rbName}</div>
                <div className="text-xs text-muted">was {rbTeam.city} {rbTeam.displayName} ({rbTeam.abbreviation}) · logo {rbTeam.logoId}</div>
              </div>
            </div>
          </>
        )}

        <button
          onClick={runRelocateRebrand}
          disabled={rbBusy || !selected || !rbTeam}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
        >
          {rbBusy ? 'Applying…' : 'Apply → new save'}
        </button>
      </div>

      {rbError && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-200">{rbError}</div>
      )}

      {rbResult && (
        <div className="rounded-lg border border-success/40 bg-success/10 p-4 text-sm">
          <div className="font-semibold text-green-100">
            {rbResult.mode === 'RELOCATE' ? 'Relocated' : 'Rebranded'} to {rbResult.teamName} — wrote{' '}
            <code className="rounded bg-black/30 px-1">{rbResult.output}</code>
          </div>
          {rbResult.changes.length > 0 ? (
            <ul className="mt-2 space-y-0.5 text-green-200/90">
              {rbResult.changes.map((c) => (
                <li key={c.field}>
                  <span className="text-neutral-400">{c.field}:</span> {String(c.before) || '∅'} → {String(c.after)}
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-1 text-green-200/70">No fields changed.</div>
          )}
          {rbResult.skippedFields.length > 0 && (
            <div className="mt-1 text-xs text-amber-200/80">Skipped (out of range): {rbResult.skippedFields.join(', ')}</div>
          )}
          <div className="mt-1 text-xs text-green-200/70">Load it in Madden (Franchise → Load).</div>
        </div>
      )}
    </div>
  );
}
