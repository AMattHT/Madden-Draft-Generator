import { useEffect, useState } from 'react';
import { api, type FranchiseInfo, type CapResetOptions, type CapResetResult } from '../api';
import { RandomDraft } from './RandomDraft';

const fmtM = (m: number) => `$${m.toFixed(1)}M`;
const fmtDate = (ms: number) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

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
    </div>
  );
}
