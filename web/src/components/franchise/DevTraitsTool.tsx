import { useState } from 'react';
import { api, type TraitRealismResult } from '../../api';
import { Field, ToolHeader, ErrorCard, cardCls, inputCls, btnPrimary, btnGhost } from './shared';

/** Rebuild dev traits into a realistic NFL scarcity pyramid. Preview (dryRun) then Apply. */
export function DevTraitsTool({ save, onWrote }: { save: string; onWrote?: () => void }) {
  const [includeUnsigned, setIncludeUnsigned] = useState(false);
  const [xCap, setXCap] = useState(36);
  const [sCap, setSCap] = useState(72);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TraitRealismResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(dryRun: boolean) {
    if (!save) return;
    setBusy(true); setError(null);
    try {
      const res = await api.franchiseTraitRealism(save, { includeUnsigned, xfactorCap: xCap, superstarCap: sCap, dryRun });
      setResult(res);
      if (!dryRun) onWrote?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ToolHeader title="Realistic Dev Traits">
        Rebuilds development traits into a real NFL scarcity pyramid — the base game hands an elevated trait to
        almost every 85+ player. Preview the new spread, then write a{' '}
        <code className="rounded bg-black/30 px-1">CAREER-…-TRAITS</code> file.
      </ToolHeader>

      <div className={cardCls}>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="X-Factor cap" hint="~1 per team">
            <input type="number" min={0} max={64} value={xCap} onChange={(e) => setXCap(Number(e.target.value))} className={`${inputCls} max-w-[7rem]`} />
          </Field>
          <Field label="Superstar cap" hint="~2 per team">
            <input type="number" min={0} max={128} value={sCap} onChange={(e) => setSCap(Number(e.target.value))} className={`${inputCls} max-w-[7rem]`} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-neutral-200">
            <input type="checkbox" checked={includeUnsigned} onChange={(e) => setIncludeUnsigned(e.target.checked)} />
            Include free agents / practice squad / draft pool
          </label>
        </div>

        <div className="mt-4 flex gap-3">
          <button onClick={() => run(true)} disabled={busy || !save} className={btnGhost}>
            {busy ? 'Working…' : 'Preview'}
          </button>
          <button onClick={() => run(false)} disabled={busy || !save || !result} className={btnPrimary}>
            {busy ? 'Applying…' : 'Apply → new save'}
          </button>
        </div>
      </div>

      {error && <ErrorCard message={error} />}

      {result && (
        <div className="rounded-lg border border-success/40 bg-success/10 p-4 text-sm">
          <div className="font-semibold text-green-100">
            {result.dryRun
              ? `Preview — ${result.changed} of ${result.playersConsidered} players would change`
              : <>Wrote <code className="rounded bg-black/30 px-1">{result.output}</code> — {result.changed} traits changed</>}
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2 text-center">
            {(['XFactor', 'Superstar', 'Star', 'Normal'] as const).map((t) => (
              <div key={t} className="rounded-md border border-border/60 bg-surface-0 px-2 py-1.5">
                <div className="text-[10px] uppercase tracking-wide text-muted">{t}</div>
                <div className="tabular-nums">
                  <span className="text-muted">{result.before[t]}</span>
                  <span className="text-neutral-600"> → </span>
                  <span className="text-green-300">{result.after[t]}</span>
                </div>
              </div>
            ))}
          </div>
          {result.notable.length > 0 && (
            <div className="mt-3 max-h-64 overflow-auto rounded-md border border-border bg-surface-1">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-2 text-[10px] uppercase tracking-wide text-neutral-400">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-semibold">Player</th>
                    <th className="px-2 py-1.5 text-left font-semibold">Pos</th>
                    <th className="px-2 py-1.5 text-right font-semibold">OVR</th>
                    <th className="px-2 py-1.5 text-left font-semibold">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {result.notable.map((u, i) => (
                    <tr key={i} className="border-t border-border/50">
                      <td className="px-2 py-1 text-neutral-100">{u.name} <span className="text-muted">· {u.team}</span></td>
                      <td className="px-2 py-1 text-neutral-300">{u.position}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{u.overall}</td>
                      <td className="px-2 py-1"><span className="text-muted">{u.from}</span> → <span className="text-green-300">{u.to}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-2 text-xs text-green-200/70">
            {result.dryRun ? 'Looks right? Hit Apply to write the save.' : 'Load it in Madden (Franchise → Load).'}
          </div>
        </div>
      )}
    </>
  );
}
