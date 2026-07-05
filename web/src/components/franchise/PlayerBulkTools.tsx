import { useState } from 'react';
import { api, type PlayerEditResult } from '../../api';
import { Field, ToolHeader, ErrorCard, cardCls, inputCls, btnPrimary } from './shared';

/** "Player Tools" — heal injuries league-wide and/or set a dev trait in bulk. */
export function PlayerBulkTools({ save, onWrote }: { save: string; onWrote?: () => void }) {
  const [healInjuries, setHealInjuries] = useState(true);
  const [setDevOn, setSetDevOn] = useState(false);
  const [devScope, setDevScope] = useState<'all' | 'rookies'>('rookies');
  const [devTier, setDevTier] = useState<'Normal' | 'Star' | 'Superstar' | 'XFactor'>('Star');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PlayerEditResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!save || (!healInjuries && !setDevOn)) return;
    setBusy(true); setError(null); setResult(null);
    try {
      setResult(await api.franchisePlayerEdit(save, { healInjuries, setDev: setDevOn ? { scope: devScope, tier: devTier } : null }));
      onWrote?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ToolHeader title="Player Tools">
        Bulk edits to your league's players — safe, direct edits (writes a new{' '}
        <code className="rounded bg-black/30 px-1">CAREER-…-PLAYERS</code> file).
      </ToolHeader>

      <div className={cardCls}>
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

        <button onClick={run} disabled={busy || !save || (!healInjuries && !setDevOn)} className={`mt-4 ${btnPrimary}`}>
          {busy ? 'Applying…' : 'Apply player edits → new save'}
        </button>
      </div>

      {error && <ErrorCard message={error} />}

      {result && (
        <div className="rounded-lg border border-success/40 bg-success/10 p-4 text-sm">
          <div className="font-semibold text-green-100">
            Wrote <code className="rounded bg-black/30 px-1">{result.output}</code>
          </div>
          <div className="mt-1 text-green-200/90">
            {result.playersConsidered} players processed
            {result.injuriesCleared > 0 && ` · ${result.injuriesCleared} injuries cleared`}
            {result.devSet > 0 && ` · ${result.devSet} dev traits set`}
          </div>
          <div className="mt-1 text-xs text-green-200/70">Load it in Madden (Franchise → Load).</div>
        </div>
      )}
    </>
  );
}
