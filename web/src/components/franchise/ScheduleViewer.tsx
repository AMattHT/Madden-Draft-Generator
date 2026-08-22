import { useState } from 'react';
import { api, type FranchiseScheduleResult } from '../../api';
import { ToolHeader, ErrorCard, cardCls, btnPrimary } from './shared';

/** Read-only whole-season schedule grouped by week, current week highlighted. */
export function ScheduleViewer({ save }: { save: string }) {
  const [schedule, setSchedule] = useState<FranchiseScheduleResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!save) return;
    setBusy(true); setError(null);
    try { setSchedule(await api.franchiseSchedule(save)); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <ToolHeader title="Season Schedule">
        The whole season at a glance — every matchup by week, with results for games already played. Read-only:
        nothing here changes your save.
      </ToolHeader>

      <div className={cardCls}>
        <button onClick={load} disabled={busy || !save} className={btnPrimary}>
          {busy ? 'Loading…' : schedule ? 'Reload schedule' : 'Load schedule'}
        </button>

        {error && <div className="mt-3"><ErrorCard message={error} /></div>}

        {schedule && (
          <div className="mt-4">
            <div className="mb-3 text-xs text-muted">
              {schedule.seasonYear} season · currently {schedule.currentStage} week {schedule.currentWeek + 1}
            </div>
            <div className="max-h-[32rem] space-y-4 overflow-auto">
              {schedule.weeks.map((wk) => {
                const isCurrent = wk.stage === schedule.currentStage && wk.seasonWeek === schedule.currentWeek;
                return (
                  <div key={`${wk.stage}-${wk.seasonWeek}`} className={`rounded-md border p-3 ${isCurrent ? 'border-primary/60 bg-primary/5' : 'border-border/60 bg-surface-0'}`}>
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-100">
                      {wk.label}
                      {isCurrent && <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] uppercase text-primary">Current</span>}
                      <span className="text-[11px] font-normal text-muted">{wk.games.length} games</span>
                    </div>
                    <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                      {wk.games.map((g, i) => (
                        <div key={i} className="flex items-center justify-between rounded px-2 py-1 text-sm odd:bg-black/10">
                          <span className="text-neutral-200">{g.away || '—'} <span className="text-muted">@</span> {g.home || '—'}</span>
                          <span className="text-xs tabular-nums">
                            {g.played
                              ? <span className="font-semibold text-green-300">{g.awayScore}–{g.homeScore}</span>
                              : <span className="text-muted">{g.day}{g.time ? ` · ${g.time}` : ''}</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
