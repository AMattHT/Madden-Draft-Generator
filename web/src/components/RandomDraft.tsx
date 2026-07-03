/**
 * Random draft-class picker for franchise mode. Draws a random historical draft
 * year that hasn't been used yet, marks it used (so it never repeats), and hands
 * off to the draft view to review/export the class. Used years are removable
 * (click a chip to put a year back) and fully resettable.
 */
export function RandomDraft({
  years,
  used,
  lastDrawn,
  onDraw,
  onToggleUsed,
  onClear,
}: {
  years: number[];
  used: Set<number>;
  lastDrawn: number | null;
  onDraw: () => void;
  onToggleUsed: (year: number) => void;
  onClear: () => void;
}) {
  const remaining = years.filter((y) => !used.has(y)).length;
  const usedList = [...used].sort((a, b) => b - a);
  const exhausted = years.length > 0 && remaining === 0;

  return (
    <div className="rounded-lg border border-border bg-surface-1 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold tracking-tight">Random Draft Class</h2>
          <p className="mt-1 max-w-xl text-xs text-muted">
            Draw a random historical draft year for your next franchise draft. Once drawn it's marked used, so the
            picker never gives you the same class twice — click a used year to put it back.
          </p>
        </div>
        <div className="text-right text-xs text-muted">
          <div>
            <span className="text-lg font-bold tabular-nums text-neutral-100">{remaining}</span> of {years.length} left
          </div>
          <div className="tabular-nums">{used.size} used</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          onClick={onDraw}
          disabled={exhausted || years.length === 0}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
        >
          🎲 Draw a random unused year
        </button>
        {lastDrawn != null && (
          <span className="text-sm text-neutral-300">
            Drew <span className="font-bold text-gold">{lastDrawn}</span> — now in the draft view, ready to export.
          </span>
        )}
        {exhausted && <span className="text-sm text-amber-300">All {years.length} classes used — reset to draw again.</span>}
      </div>

      {usedList.length > 0 && (
        <div className="mt-4 border-t border-border/60 pt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted">Used ({usedList.length})</span>
            <button onClick={onClear} className="text-[11px] text-neutral-500 hover:text-red-300">
              Reset history
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
                <span className="text-neutral-500">✕</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
