import { useState } from 'react';
import { api, type CapResetOptions, type CapResetResult } from '../../api';
import { Field, ToolHeader, ErrorCard, cardCls, inputCls, btnPrimary, fmtM } from './shared';

export function CapResetTool({ save, onWrote }: { save: string; onWrote?: () => void }) {
  const [clearDeadMoney, setClearDeadMoney] = useState(true);
  const [capRoomMode, setCapRoomMode] = useState<'off' | 'freed' | 'fixed'>('fixed');
  const [fixedCapRoomM, setFixedCapRoomM] = useState(150);
  const [rolloverFloorM, setRolloverFloorM] = useState(50);
  const [lowerSalaries, setLowerSalaries] = useState(false);
  const [salaryPct, setSalaryPct] = useState(50);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CapResetResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runReset() {
    if (!save) return;
    setBusy(true); setError(null); setResult(null);
    const options: CapResetOptions = {
      clearDeadMoney, capRoomMode, fixedCapRoomM, rolloverFloorM,
      salaryScale: lowerSalaries ? Math.max(0.05, Math.min(0.99, salaryPct / 100)) : null,
    };
    try {
      setResult(await api.franchiseCapReset(save, options));
      onWrote?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ToolHeader title="Salary-Cap Reset">
        Clears accumulated dead money and opens cap room across all 32 teams for a late-franchise save.
        Writes a new <code className="rounded bg-black/30 px-1">CAREER-…-CAPRESET</code> file — your original is
        never touched.
      </ToolHeader>

      <div className={cardCls}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-neutral-200">
            <input type="checkbox" checked={clearDeadMoney} onChange={(e) => setClearDeadMoney(e.target.checked)} />
            Clear dead money (cap penalties → $0)
          </label>

          <Field label="Cap room">
            <select value={capRoomMode} onChange={(e) => setCapRoomMode(e.target.value as 'off' | 'freed' | 'fixed')} className={inputCls}>
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

        <button onClick={runReset} disabled={busy || !save} className={`mt-4 ${btnPrimary}`}>
          {busy ? 'Resetting…' : 'Reset cap → new save'}
        </button>
      </div>

      {error && <ErrorCard message={error} />}

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
                      <span className="text-muted">{fmtM(t.before.deadMoneyM)}</span>
                      <span className="text-neutral-600"> → </span>
                      <span className="text-green-300">{fmtM(t.after.deadMoneyM)}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      <span className="text-muted">{fmtM(t.before.capRoomM)}</span>
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
    </>
  );
}
