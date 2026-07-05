import { useState } from 'react';
import { api, type FaTrimResult } from '../../api';
import { Field, ToolHeader, ErrorCard, cardCls, inputCls, btnPrimary, btnGhost } from './shared';

/** Trim a bloated free-agent pool by OVR/age (and optional trim-to-N). Preview then Apply. */
export function FaTrimTool({ save, onWrote }: { save: string; onWrote?: () => void }) {
  const [ovr, setOvr] = useState(65);
  const [ageOn, setAgeOn] = useState(false);
  const [age, setAge] = useState(32);
  const [targetOn, setTargetOn] = useState(false);
  const [targetN, setTargetN] = useState(400);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FaTrimResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(dryRun: boolean) {
    if (!save) return;
    setBusy(true); setError(null);
    try {
      const res = await api.franchiseTrimFreeAgents(save, {
        ovrThreshold: ovr, ageThreshold: ageOn ? age : 0, targetN: targetOn ? targetN : 0, dryRun,
      });
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
      <ToolHeader title="Trim Free Agents">
        Thins a bloated free-agent pool by rating and age (the game keeps hundreds of low-overalls around). Only
        unsigned free agents are touched — signed players, practice squad, and the upcoming draft class are never
        affected. Preview first, then write a <code className="rounded bg-black/30 px-1">CAREER-…-FATRIM</code> file.
      </ToolHeader>

      <div className={cardCls}>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Cut below OVR" hint="e.g. 65 removes the low end">
            <input type="number" min={0} max={99} value={ovr} onChange={(e) => setOvr(Number(e.target.value))} className={`${inputCls} max-w-[7rem]`} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-neutral-200">
            <input type="checkbox" checked={ageOn} onChange={(e) => setAgeOn(e.target.checked)} />
            Also cut age ≥
            <input type="number" min={20} max={45} value={age} disabled={!ageOn} onChange={(e) => setAge(Number(e.target.value))} className={`${inputCls} max-w-[5rem] disabled:opacity-50`} />
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-200">
            <input type="checkbox" checked={targetOn} onChange={(e) => setTargetOn(e.target.checked)} />
            Trim pool down to
            <input type="number" min={0} max={750} value={targetN} disabled={!targetOn} onChange={(e) => setTargetN(Number(e.target.value))} className={`${inputCls} max-w-[6rem] disabled:opacity-50`} />
          </label>
        </div>

        <div className="mt-4 flex gap-3">
          <button onClick={() => run(true)} disabled={busy || !save} className={btnGhost}>
            {busy ? 'Working…' : 'Preview'}
          </button>
          <button onClick={() => run(false)} disabled={busy || !save || !result || result.trimmed === 0} className={btnPrimary}>
            {busy ? 'Trimming…' : 'Trim → new save'}
          </button>
        </div>
      </div>

      {error && <ErrorCard message={error} />}

      {result && (
        <div className="rounded-lg border border-success/40 bg-success/10 p-4 text-sm">
          <div className="font-semibold text-green-100">
            {result.dryRun
              ? `Preview — ${result.trimmed} of ${result.freeAgentsBefore} free agents would be trimmed (pool ${result.freeAgentsBefore} → ${result.freeAgentsAfter})`
              : <>Wrote <code className="rounded bg-black/30 px-1">{result.output}</code> — trimmed {result.trimmed} (pool {result.freeAgentsBefore} → {result.freeAgentsAfter})</>}
          </div>
          <div className="mt-1 text-xs text-green-200/70">Pool cap is {result.maxFreeAgents} — nothing else needs updating.</div>
          {result.victims.length > 0 && (
            <div className="mt-3 max-h-64 overflow-auto rounded-md border border-border bg-surface-1">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-2 text-[10px] uppercase tracking-wide text-neutral-400">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-semibold">Player</th>
                    <th className="px-2 py-1.5 text-left font-semibold">Pos</th>
                    <th className="px-2 py-1.5 text-right font-semibold">OVR</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Age</th>
                  </tr>
                </thead>
                <tbody>
                  {result.victims.map((v, i) => (
                    <tr key={i} className="border-t border-border/50">
                      <td className="px-2 py-1 text-neutral-100">{v.name}</td>
                      <td className="px-2 py-1 text-neutral-300">{v.position}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{v.overall}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{v.age}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-2 text-xs text-green-200/70">
            {result.dryRun ? 'Looks right? Hit Trim to write the save.' : 'Load it in Madden (Franchise → Load).'}
          </div>
        </div>
      )}
    </>
  );
}
