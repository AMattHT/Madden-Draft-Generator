import { useEffect, useState } from 'react';
import { api, type ArmPlayoffsResult, type HistoricPreview, type HistoricSeasonOption } from '../../api';
import { ToolHeader, ErrorCard, Field, cardCls, btnGhost, btnPrimary, inputCls } from './shared';

const statusCls: Record<string, string> = {
  matches: 'bg-success/15 text-green-200',
  differs: 'bg-gold/15 text-gold',
  unknown: 'bg-surface-2 text-neutral-400',
  guidance: 'bg-surface-2 text-neutral-300',
};
const statusLabel: Record<string, string> = { matches: 'matches', differs: 'differs', unknown: 'unknown', guidance: 'guidance' };

/**
 * Historic season (Madden 27): pick a baked season, preview what its pack would do to the
 * selected save, and see the era's playoff bracket seeded from the save's standings.
 * Arming the playoff format writes a new save; the layout, roster and schedule writers follow.
 */
export function HistoricSeasonTool({ save, gameVersion, onWrote }: { save: string; gameVersion: 'm26' | 'm27'; onWrote?: () => void }) {
  const [seasons, setSeasons] = useState<HistoricSeasonOption[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<HistoricPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [armBusy, setArmBusy] = useState(false);
  const [armed, setArmed] = useState<ArmPlayoffsResult | null>(null);
  const [armError, setArmError] = useState<string | null>(null);

  async function arm(dryRun: boolean) {
    if (!save || !year) return;
    setArmBusy(true); setArmError(null);
    try { setArmed(await api.franchiseArmPlayoffs(save, year, { dryRun })); if (!dryRun) onWrote?.(); }
    catch (e) { setArmError((e as Error).message); }
    finally { setArmBusy(false); }
  }

  useEffect(() => {
    api.franchiseHistoricSeasons().then((s) => { setSeasons(s); if (s.length && year == null) setYear(s[0].year); }).catch((e) => setError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run() {
    if (!save || !year) return;
    setBusy(true); setError(null);
    try { setPreview(await api.franchiseHistoricPreview(save, year)); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  const era = seasons.find((s) => s.year === year)?.era ?? null;

  return (
    <>
      <ToolHeader title="Historic season">
        Set a franchise up as a past NFL season: that year's clubs and divisions, its real schedule and rosters, and
        its playoff format. Preview reads the save and the season pack and shows what would change, plus the era's
        bracket seeded from the save's current standings. The playoff format can be armed into a new save below.
      </ToolHeader>

      {gameVersion !== 'm27' && (
        <div className="rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold">Historic seasons target Madden 27 saves. Switch the game in the top bar.</div>
      )}

      <div className={cardCls}>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Season" hint={era ? `${era.label}: ${era.teams} teams, ${era.gamesPerTeam} games, ${era.playoff.teams}-team playoff` : undefined}>
            <select value={year ?? ''} onChange={(e) => setYear(Number(e.target.value))} className={inputCls}>
              {seasons.length === 0 && <option value="">No season packs baked</option>}
              {seasons.map((s) => <option key={s.year} value={s.year}>{s.year} ({s.teams} teams)</option>)}
            </select>
          </Field>
          <button onClick={run} disabled={busy || !save || !year || gameVersion !== 'm27'} className={btnGhost}>{busy ? 'Reading…' : 'Preview'}</button>
        </div>
      </div>

      {error && <ErrorCard message={error} />}

      {preview && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <section className={cardCls}>
              <h3 className="text-sm font-semibold text-neutral-100">Teams</h3>
              <p className="mt-1 text-xs text-muted">{preview.pack.teams} clubs in {preview.year}, mapped to today's franchises. {preview.parked.length} modern clubs have no {preview.year} ancestor and would be parked.</p>
              <div className="mt-3 max-h-72 overflow-auto rounded-md border border-border bg-surface-0">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-surface-2 text-[10px] uppercase tracking-wide text-neutral-400">
                    <tr><th className="px-2 py-1.5 text-left font-semibold">{preview.year} club</th><th className="px-2 py-1.5 text-left font-semibold">Division</th><th className="px-2 py-1.5 text-left font-semibold">In the save</th></tr>
                  </thead>
                  <tbody>
                    {preview.teamMap.map((t) => (
                      <tr key={t.key} className="border-t border-border/50">
                        <td className="px-2 py-1 text-neutral-200">{t.name}</td>
                        <td className="px-2 py-1 text-neutral-400">{t.division}</td>
                        <td className="px-2 py-1">{t.teamIndex == null ? <span className="text-gold">not found</span> : <>{t.modernName} <span className="text-muted">· {t.currentDivision ?? '?'}</span></>}</td>
                      </tr>
                    ))}
                    {preview.parked.map((p) => (
                      <tr key={p.name} className="border-t border-border/50 opacity-60">
                        <td className="px-2 py-1 italic text-neutral-400">— parked</td><td className="px-2 py-1" /><td className="px-2 py-1 text-neutral-400">{p.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={cardCls}>
              <h3 className="text-sm font-semibold text-neutral-100">Divisions</h3>
              <p className="mt-1 text-xs text-muted">The {preview.year} alignment. The save holds eight divisions of four; a five-team division cannot be built as is.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {preview.layout.map((d) => (
                  <div key={d.division} className={`rounded-md border px-3 py-2 ${d.fits ? 'border-border bg-surface-0' : 'border-gold/40 bg-gold/5'}`}>
                    <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-neutral-300"><span>{d.division}</span>{!d.fits && <span className="text-gold">{d.teams.length} teams</span>}</div>
                    <div className="mt-1 text-xs text-neutral-200">{d.teams.join(', ')}</div>
                  </div>
                ))}
              </div>
              <details className="mt-3 text-xs text-muted">
                <summary className="cursor-pointer">As the save has it</summary>
                <ul className="mt-1 space-y-0.5">{preview.saveLayout.map((d) => <li key={d.division}><span className="text-neutral-300">{d.division}:</span> {d.teams.join(', ')}</li>)}</ul>
              </details>
            </section>

            <section className={cardCls}>
              <h3 className="text-sm font-semibold text-neutral-100">Rules</h3>
              <p className="mt-1 text-xs text-muted">{preview.era.label}. What the era used against what the save holds now.</p>
              <table className="mt-3 w-full text-xs">
                <tbody>
                  {preview.rules.map((r) => (
                    <tr key={r.key} className="border-t border-border/50">
                      <td className="py-1 pr-2 text-neutral-300">{r.label}</td>
                      <td className="py-1 pr-2 tabular-nums text-neutral-100">{r.wanted}</td>
                      <td className="py-1 pr-2 tabular-nums text-neutral-400">{r.current}</td>
                      <td className="py-1 text-right"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusCls[r.status]}`}>{statusLabel[r.status]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 text-[11px] text-muted">Schedule: pack has {preview.schedule.packGames} games over {preview.schedule.packWeeks} weeks; save has {preview.schedule.saveRegularGames} over {preview.schedule.saveRegularWeeks} ({preview.schedule.currentWeekType} week {preview.schedule.currentWeek + 1}). Rosters: {preview.pack.rosterMatched} of {preview.pack.rosterRows} {preview.year} players resolve to rated players in the pool.</div>
            </section>

            <section className={cardCls}>
              <h3 className="text-sm font-semibold text-neutral-100">Companion bracket</h3>
              <p className="mt-1 text-xs text-muted">{preview.era.playoff.teams} teams: {preview.era.playoff.divisionWinners} division winners and {preview.era.playoff.wildCards} wild card{preview.era.playoff.wildCards === 1 ? '' : 's'} per conference, seeded from this save's standings.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {Object.entries(preview.bracket.conferences).map(([conf, seeds]) => (
                  <div key={conf} className="rounded-md border border-border bg-surface-0 px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-300">{conf}</div>
                    <ol className="mt-1 space-y-0.5 text-xs">
                      {seeds.map((s) => (
                        <li key={s.team} className="flex items-center justify-between gap-2">
                          <span><span className="tabular-nums text-muted">{s.seed}.</span> <span className="text-neutral-100">{s.team}</span> <span className="text-muted">{s.record}</span></span>
                          <span className="text-[10px] uppercase tracking-wide text-muted">{s.via === 'division' ? s.division.replace(/^(AFC|NFC) /, '') : 'wild card'}{s.bye ? ' · bye' : ''}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
              {preview.bracket.games.length > 0 && (
                <ul className="mt-3 space-y-0.5 text-xs text-neutral-200">
                  {preview.bracket.games.map((g, i) => <li key={i}><span className="text-muted">{g.round}:</span> {g.away} at {g.home}</li>)}
                </ul>
              )}
              {preview.bracket.notes.map((n, i) => <p key={i} className="mt-2 text-[11px] text-muted">{n}</p>)}
            </section>
          </div>

          <section className={cardCls}>
            <h3 className="text-sm font-semibold text-neutral-100">Playoff format</h3>
            <p className="mt-1 text-xs text-muted">
              Madden always seeds seven clubs per conference, but it keeps a force-win flag on each wild-card game. Arming the
              format sets those flags so only the {preview.era.playoff.teams}-team field of {preview.year} survives the wild-card
              round. Run it any time in the regular season (week 18 is fine), or at the wild-card week before a game is played.
            </p>
            <div className="mt-3 flex gap-3">
              <button onClick={() => arm(true)} disabled={armBusy || !save} className={btnGhost}>{armBusy ? 'Working…' : 'Preview'}</button>
              <button onClick={() => arm(false)} disabled={armBusy || !save || !armed || !armed.dryRun} className={btnPrimary}>{armBusy ? 'Writing…' : 'Arm → new save'}</button>
            </div>
            {armError && <div className="mt-3"><ErrorCard message={armError} /></div>}
            {armed && (
              <div className="mt-3 rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
                <div className="font-semibold text-green-100">
                  {armed.dryRun ? `Preview (${armed.mode === 'wildcard' ? 'rows already seeded' : 'placeholders + flags'})` : <>Wrote <code className="rounded bg-black/30 px-1">{armed.output}</code></>}
                </div>
                <div className="mt-2 text-xs text-neutral-300">Field: {Object.entries(armed.field).map(([c, t]) => `${c}: ${t.join(', ')}`).join(' · ')}</div>
                <table className="mt-2 w-full text-xs">
                  <tbody>
                    {armed.rows.map((r) => (
                      <tr key={r.index} className="border-t border-border/50">
                        <td className="py-1 pr-2 text-neutral-200">{r.away} at {r.home}{r.placeholder ? <span className="text-muted"> (placeholder)</span> : null}</td>
                        <td className="py-1 pr-2 font-semibold tabular-nums text-neutral-100">{r.force === 'None' ? 'played' : `force ${r.force.toLowerCase()}`}</td>
                        <td className="py-1 text-muted">{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {armed.notes.map((n, i) => <p key={i} className="mt-2 text-[11px] text-green-200/80">{n}</p>)}
              </div>
            )}
          </section>

          {preview.warnings.length > 0 && (
            <div className="rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-xs text-gold">
              <div className="font-semibold">Things to know</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">{preview.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}
        </>
      )}
    </>
  );
}
