import { useState } from 'react';
import { api, type DraftPickResetResult } from '../../api';
import { ToolHeader, ErrorCard, cardCls, btnPrimary, btnGhost } from './shared';

const yearOffsetLabel = (y: number) => (y === 0 ? 'This year' : y === 1 ? 'Next year' : `+${y} years`);

/** Restore every traded future pick to its original owner. Preview then Apply. */
export function DraftPickResetTool({ save, onWrote }: { save: string; onWrote?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DraftPickResetResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(dryRun: boolean) {
    if (!save) return;
    setBusy(true); setError(null);
    try {
      const res = await api.franchiseResetDraftPicks(save, { dryRun });
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
      <ToolHeader title="Un-Trade Draft Picks">
        Restores every future draft pick to the team that originally owned it — reverses all pick trades in one
        shot. Only the future-pick pool is touched; the current in-progress draft and completed selections are left
        alone. Preview first, then write a <code className="rounded bg-black/30 px-1">CAREER-…-DRAFTPICKS</code> file.
      </ToolHeader>

      <div className={cardCls}>
        <div className="flex gap-3">
          <button onClick={() => run(true)} disabled={busy || !save} className={btnGhost}>
            {busy ? 'Working…' : 'Preview'}
          </button>
          <button onClick={() => run(false)} disabled={busy || !save || !result || result.restored === 0} className={btnPrimary}>
            {busy ? 'Restoring…' : 'Un-trade → new save'}
          </button>
        </div>
      </div>

      {error && <ErrorCard message={error} />}

      {result && (
        <div className="rounded-lg border border-success/40 bg-success/10 p-4 text-sm">
          <div className="font-semibold text-green-100">
            {result.dryRun
              ? `Preview — ${result.restored} of ${result.traded} traded picks would be restored`
              : <>Wrote <code className="rounded bg-black/30 px-1">{result.output}</code> — {result.restored} picks restored</>}
          </div>
          {result.poolRows === 0 || result.traded === 0 ? (
            <div className="mt-1 text-xs text-amber-200/80">
              No traded future picks in this save ({result.poolRows} pool rows) — nothing to un-trade. This is expected
              unless picks have been traded into the future pool.
            </div>
          ) : (
            <div className="mt-3 max-h-64 overflow-auto rounded-md border border-border bg-surface-1">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-2 text-[10px] uppercase tracking-wide text-neutral-400">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-semibold">When</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Rd</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Pick</th>
                    <th className="px-2 py-1.5 text-left font-semibold">Restored to</th>
                  </tr>
                </thead>
                <tbody>
                  {result.restores.map((p, i) => (
                    <tr key={i} className="border-t border-border/50">
                      <td className="px-2 py-1 text-neutral-300">{yearOffsetLabel(p.yearOffset)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{p.round}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{p.pickNumber || '—'}</td>
                      <td className="px-2 py-1"><span className="text-neutral-500">{p.fromTeam || '—'}</span> → <span className="text-green-300">{p.toTeam || '—'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-2 text-xs text-green-200/70">
            {result.dryRun ? 'Looks right? Hit Un-trade to write the save.' : 'Load it in Madden (Franchise → Load).'}
          </div>
        </div>
      )}
    </>
  );
}
