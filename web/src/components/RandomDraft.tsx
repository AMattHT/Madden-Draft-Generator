/**
 * Random draft-class picker for franchise mode. Draws a random historical draft
 * year that hasn't been used yet AND falls within the selected year range, marks it
 * used (so it never repeats), and hands off to the draft view. The range and the
 * used-year history are cached (persist across reloads). Picks can be undone (last
 * draw), put back individually (chips), or fully reset.
 */
import { Icon, ICONS } from './ui';

export function RandomDraft({
  years,
  used,
  lastDrawn,
  range,
  onDraw,
  onUndo,
  onSetRange,
  onToggleUsed,
  onClear,
}: {
  years: number[];
  used: Set<number>;
  lastDrawn: number | null;
  range: { from: number; to: number } | null;
  onDraw: () => void;
  onUndo: () => void;
  onSetRange: (from: number, to: number) => void;
  onToggleUsed: (year: number) => void;
  onClear: () => void;
}) {
  const sorted = [...years].sort((a, b) => a - b);
  const from = range?.from ?? sorted[0];
  const to = range?.to ?? sorted[sorted.length - 1];
  const inRange = (y: number) => y >= from && y <= to;

  const rangeYears = sorted.filter(inRange);
  const remaining = rangeYears.filter((y) => !used.has(y)).length;
  const exhausted = rangeYears.length > 0 && remaining === 0;
  const drawOrder = [...used]; // Set preserves insertion (draw) order
  const lastUsed = drawOrder.length ? drawOrder[drawOrder.length - 1] : null; // real undo target
  const usedList = [...used].sort((a, b) => b - a); // chips: newest year first for scanning

  const selectCls = 'rounded-md border border-border bg-surface-0 px-2 py-1 text-sm tabular-nums text-neutral-200 focus:border-primary focus:outline-none';

  return (
    <div className="rounded-lg border border-border bg-surface-1 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold tracking-tight">Random Draft Class</h2>
          <p className="mt-1 max-w-xl text-xs text-muted">
            Draw a random draft year for your next franchise draft. It stays within your range, never repeats a used
            year, and remembers everything between sessions. Undo the last pick, put a year back, or reset to make all
            years pickable again.
          </p>
        </div>
        <div className="text-right text-xs text-muted">
          <div>
            <span className="text-lg font-bold tabular-nums text-neutral-100">{remaining}</span> of {rangeYears.length} in range
          </div>
          <div className="tabular-nums">{used.size} used</div>
        </div>
      </div>

      {/* Year range */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-neutral-300">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted">Range</span>
        <select value={from} onChange={(e) => onSetRange(Number(e.target.value), Math.max(Number(e.target.value), to))} className={selectCls}>
          {sorted.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <span className="text-muted">to</span>
        <select value={to} onChange={(e) => onSetRange(Math.min(from, Number(e.target.value)), Number(e.target.value))} className={selectCls}>
          {sorted.filter((y) => y >= from).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        {(from !== sorted[0] || to !== sorted[sorted.length - 1]) && (
          <button onClick={() => onSetRange(sorted[0], sorted[sorted.length - 1])} className="text-[11px] text-muted hover:text-neutral-200">
            full range
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={onDraw}
          disabled={exhausted || rangeYears.length === 0}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
        >
          <Icon path={ICONS.shuffle} className="h-4 w-4" />
          Draw a random unused year
        </button>
        <button
          onClick={onUndo}
          disabled={lastUsed == null}
          title={lastUsed != null ? `Undo — put ${lastUsed} back` : 'Nothing to undo'}
          className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-surface-3 hover:text-neutral-100 disabled:opacity-40"
        >
          <Icon path={ICONS.undo} className="h-4 w-4" />
          Undo{lastUsed != null ? ` (${lastUsed})` : ''}
        </button>
        {lastDrawn != null && (
          <span className="text-sm text-neutral-300">
            Drew <span className="font-bold text-gold">{lastDrawn}</span> — now in the draft view, ready to export.
          </span>
        )}
        {exhausted && <span className="text-sm text-amber-300">No unused years in {from}–{to} — widen the range or reset.</span>}
      </div>

      {usedList.length > 0 && (
        <div className="mt-4 border-t border-border/60 pt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted">Used ({usedList.length})</span>
            <button onClick={onClear} className="text-[11px] text-muted hover:text-red-300">
              Reset — make all pickable again
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {usedList.map((y) => (
              <button
                key={y}
                onClick={() => onToggleUsed(y)}
                title={`Put ${y} back into the pool`}
                className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-xs font-medium tabular-nums text-neutral-300 transition-colors hover:bg-surface-3 hover:text-neutral-100"
              >
                {y}
                <Icon path={ICONS.x} className="h-3 w-3 text-muted" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
