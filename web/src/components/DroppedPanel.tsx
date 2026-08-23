import { useEffect, useMemo, useState } from 'react';
import type { DroppedPlayer, GeneratedClass } from '../types';

/**
 * The players a year had that the 402-slot class could not hold (1987: 335 picks
 * plus the undrafted pool). Each can be pulled in; he takes the slot of the
 * weakest remaining keeper, so nobody else's pick number (or edits) move.
 */
export function DroppedPanel({
  data,
  included,
  onInclude,
  onExclude,
  onClose,
  busy,
}: {
  data: GeneratedClass;
  included: number[];
  onInclude: (idx: number) => void;
  onExclude: (idx: number) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'score' | 'round' | 'name' | 'pos'>('score');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const dropped = data.dropped ?? [];
  const includedRows = useMemo(
    () => included.map((idx) => data.rows.find((r) => r.srcIdx === idx)).filter((r): r is NonNullable<typeof r> => !!r),
    [included, data.rows]
  );
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = dropped.filter((d) => !needle || `${d.firstName} ${d.lastName} ${d.college} ${d.position}`.toLowerCase().includes(needle));
    const byRound = (d: DroppedPlayer) => (d.round == null ? 99 : d.round) * 100 + (d.pick ?? 99);
    return [...rows].sort((a, b) =>
      sort === 'score' ? b.score - a.score
      : sort === 'round' ? byRound(a) - byRound(b)
      : sort === 'pos' ? a.position.localeCompare(b.position) || b.score - a.score
      : a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
    );
  }, [dropped, q, sort]);

  const th = 'px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-neutral-400';
  const sortBtn = (k: typeof sort, label: string) => (
    <button onClick={() => setSort(k)} className={`${th} ${sort === k ? 'text-neutral-100' : 'hover:text-neutral-200'}`}>{label}{sort === k ? ' ▾' : ''}</button>
  );

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Players that did not fit"
        tabIndex={-1}
        ref={(el) => { if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true }); }}
        className="flex h-[82vh] w-[980px] max-w-full flex-col overflow-hidden rounded-xl border border-border-strong bg-surface-1 shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
          <div>
            <div className="text-sm font-bold tracking-tight text-neutral-100">
              {dropped.length} players didn't fit the {data.year} class
            </div>
            <div className="text-xs text-neutral-400">
              The game holds 402. The weakest by career and draft slot were cut (rounds 1–3 never are). Include one and he takes the slot of the weakest remaining keeper — every other pick number stays put.
            </div>
          </div>
          <button onClick={onClose} className="rounded-md border border-border px-2 py-1 text-xs text-neutral-300 hover:bg-surface-2" aria-label="Close">Esc</button>
        </div>

        {includedRows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2/60 px-5 py-2 text-xs">
            <span className="text-neutral-400">Included:</span>
            {includedRows.map((r) => (
              <span key={r.id} className="flex items-center gap-1 rounded border border-success/40 bg-success/10 px-1.5 py-0.5 text-green-200">
                {r.firstName} {r.lastName} <span className="text-neutral-400">{r.position} · #{r.pick}</span>
                <button onClick={() => onExclude(r.srcIdx!)} disabled={busy} className="ml-1 text-neutral-400 hover:text-red-300" title="Remove from the class again" aria-label={`Remove ${r.firstName} ${r.lastName}`}>×</button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 border-b border-border px-5 py-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, college, position…"
            className="w-72 rounded-md border border-border bg-surface-0 px-2 py-1 text-sm focus:border-primary focus:outline-none"
          />
          <span className="text-xs text-neutral-500">{list.length} shown</span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-2">
              <tr>
                <th className={th}>{sortBtn('name', 'Name')}</th>
                <th className={th}>{sortBtn('pos', 'Pos')}</th>
                <th className={th}>{sortBtn('round', 'Drafted')}</th>
                <th className={th}>College</th>
                <th className={`${th} text-right`}>wAV</th>
                <th className={`${th} text-right`}>{sortBtn('score', 'Keep score')}</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.idx} className="border-t border-border/50 hover:bg-surface-2/50">
                  <td className="px-3 py-1.5 text-neutral-100">{d.firstName} {d.lastName}</td>
                  <td className="px-3 py-1.5 text-neutral-300">{d.position}</td>
                  <td className="px-3 py-1.5 text-neutral-300">{d.round != null ? `Rd ${d.round}${d.pick != null ? `, #${d.pick}` : ''}` : 'Undrafted'}</td>
                  <td className="px-3 py-1.5 text-neutral-400">{d.college}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-neutral-300">{d.wav ?? '–'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-neutral-400">{d.score}</td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      onClick={() => onInclude(d.idx)}
                      disabled={busy}
                      className="rounded-md border border-primary/50 bg-primary/10 px-2 py-0.5 text-xs text-primary hover:bg-primary/20 disabled:opacity-40"
                    >
                      Include
                    </button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-neutral-500">Nobody matches.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
