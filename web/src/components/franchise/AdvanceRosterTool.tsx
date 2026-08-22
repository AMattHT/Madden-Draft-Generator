import { useState } from 'react';
import { api, type AdvanceRosterResult } from '../../api';
import { Field, ToolHeader, ErrorCard, cardCls, inputCls, btnPrimary, btnGhost } from './shared';

/** Age the whole league N seasons without playing them: retirements, declines,
 *  dev downgrades. Pairs with historical draft classes for "replay an era" leagues. */
export function AdvanceRosterTool({ save, onWrote }: { save: string; onWrote?: () => void }) {
  const [years, setYears] = useState(1);
  const [retire, setRetire] = useState(true);
  const [regress, setRegress] = useState(true);
  const [devDowngrade, setDevDowngrade] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AdvanceRosterResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.franchiseAdvanceRoster(save, { years, retire, regress, devDowngrade, dryRun });
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
      <div className={cardCls}>
        <ToolHeader title="Advance the roster">
          Ages every signed player N seasons: players past their position's typical last season retire, overalls decline past the position's peak (backs fastest, quarterbacks slowest), aging stars lose dev tiers. Preview first; Apply writes a new CAREER-*-AGEDn save.
        </ToolHeader>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Seasons">
            <input type="number" min={1} max={10} value={years} onChange={(e) => setYears(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} className={`${inputCls} w-20`} />
          </Field>
          <label className="flex items-end gap-2 pb-1.5 text-sm text-neutral-200"><input type="checkbox" checked={retire} onChange={(e) => setRetire(e.target.checked)} /> Retire the old</label>
          <label className="flex items-end gap-2 pb-1.5 text-sm text-neutral-200"><input type="checkbox" checked={regress} onChange={(e) => setRegress(e.target.checked)} /> Decline past peak</label>
          <label className="flex items-end gap-2 pb-1.5 text-sm text-neutral-200"><input type="checkbox" checked={devDowngrade} onChange={(e) => setDevDowngrade(e.target.checked)} /> Downgrade aging dev</label>
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={() => run(true)} disabled={busy || !save} className={btnGhost}>{busy ? 'Working…' : 'Preview'}</button>
          <button onClick={() => run(false)} disabled={busy || !save || !result?.dryRun} className={btnPrimary} title={result?.dryRun ? '' : 'Preview first'}>Apply</button>
        </div>
      </div>

      {error && <ErrorCard message={error} />}

      {result && (
        <div className="rounded-lg border border-success/40 bg-success/10 p-4 text-sm">
          <div className="font-semibold text-green-100">
            {result.dryRun
              ? `Preview — ${result.years} season${result.years > 1 ? 's' : ''}: ${result.retired} retire, ${result.regressed} decline, ${result.devDowngraded} lose a dev tier (of ${result.playersConsidered})`
              : <>Wrote <code className="rounded bg-black/30 px-1">{result.output}</code> — {result.retired} retired, {result.regressed} declined</>}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            {[['Avg age', result.avgAgeBefore, result.avgAgeAfter], ['Avg overall', result.avgOvrBefore, result.avgOvrAfter], ['Aged', '', result.aged], ['Retired', '', result.retired]].map(([l, b, a]) => (
              <div key={String(l)} className="rounded-md border border-border/60 bg-surface-0 px-2 py-1.5">
                <div className="text-[10px] uppercase tracking-wide text-muted">{l}</div>
                <div className="tabular-nums">{b !== '' ? <><span className="text-muted">{b}</span><span className="text-neutral-600"> → </span></> : null}<span className="text-green-300">{a}</span></div>
              </div>
            ))}
          </div>
          {result.retirements.length > 0 && (
            <div className="mt-3 max-h-56 overflow-auto rounded-md border border-border bg-surface-1">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-2 text-[10px] uppercase tracking-wide text-neutral-400">
                  <tr><th className="px-2 py-1.5 text-left font-semibold">Retiring</th><th className="px-2 py-1.5 text-left font-semibold">Pos</th><th className="px-2 py-1.5 text-right font-semibold">Age</th><th className="px-2 py-1.5 text-right font-semibold">OVR</th></tr>
                </thead>
                <tbody>
                  {result.retirements.map((p, i) => (
                    <tr key={i} className="border-t border-border/50"><td className="px-2 py-1 text-neutral-100">{p.name} <span className="text-muted">· {p.team}</span></td><td className="px-2 py-1 text-neutral-300">{p.position}</td><td className="px-2 py-1 text-right tabular-nums">{p.age}</td><td className="px-2 py-1 text-right tabular-nums">{p.overall}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.declines.length > 0 && (
            <div className="mt-2 max-h-56 overflow-auto rounded-md border border-border bg-surface-1">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-2 text-[10px] uppercase tracking-wide text-neutral-400">
                  <tr><th className="px-2 py-1.5 text-left font-semibold">Biggest declines</th><th className="px-2 py-1.5 text-left font-semibold">Pos</th><th className="px-2 py-1.5 text-right font-semibold">Age</th><th className="px-2 py-1.5 text-right font-semibold">OVR</th></tr>
                </thead>
                <tbody>
                  {result.declines.map((p, i) => (
                    <tr key={i} className="border-t border-border/50"><td className="px-2 py-1 text-neutral-100">{p.name} <span className="text-muted">· {p.team}</span></td><td className="px-2 py-1 text-neutral-300">{p.position}</td><td className="px-2 py-1 text-right tabular-nums">{p.age}</td><td className="px-2 py-1 text-right tabular-nums"><span className="text-muted">{p.from}</span> → <span className="text-green-300">{p.to}</span></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-2 text-xs text-green-200/70">{result.dryRun ? 'Looks right? Hit Apply to write the save.' : 'Load it in Madden (Franchise → Load), then import a draft class from the era you want.'}</div>
        </div>
      )}
    </>
  );
}
