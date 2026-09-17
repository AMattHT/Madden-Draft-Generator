/** Placeholder states for the draft area: a shimmering board while a class
 *  pulls, and the empty plate before a year is picked. Both keep the board's
 *  real layout so the class lands without a reflow. */

export function BoardSkeleton() {
  const rows = Array.from({ length: 14 });
  return (
    <div className="flex h-full animate-fade-in flex-col gap-2.5 px-5 pb-4 pt-3.5" aria-busy aria-label="Pulling the draft class">
      <div className="flex items-center gap-3">
        <span className="skeleton h-8 w-44" />
        <span className="skeleton h-6 w-16 rounded-full" />
        <span className="skeleton h-6 w-24 rounded-full" />
        <span className="ml-auto skeleton h-8 w-28" />
        <span className="skeleton h-8 w-24" />
        <span className="skeleton h-8 w-32" />
      </div>
      <div className="glass flex items-center gap-4 rounded-xl px-4 py-2.5">
        {[16, 20, 24, 20, 28].map((w, i) => <span key={i} className="skeleton h-4" style={{ width: w * 4 }} />)}
        <span className="ml-auto flex gap-1.5">{Array.from({ length: 10 }).map((_, i) => <span key={i} className="skeleton h-6 w-11" />)}</span>
      </div>
      <div className="glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl">
        <div className="flex items-center gap-2 border-b border-white/[0.05] px-3 py-2">
          <span className="skeleton h-8 w-52" />
          <span className="skeleton h-8 w-32" />
          <span className="skeleton h-8 w-32" />
          <span className="ml-auto skeleton h-7 w-40" />
        </div>
        <div className="flex flex-col">
          {rows.map((_, i) => (
            <div key={i} className="flex h-10 items-center gap-4 border-t border-white/[0.04] px-4" style={{ opacity: 1 - i * 0.055 }}>
              <span className="skeleton h-3 w-6" />
              <span className="skeleton h-5 w-5 rounded-full" />
              <span className="skeleton h-7 w-7" />
              <span className="skeleton h-3" style={{ width: 90 + ((i * 37) % 80) }} />
              <span className="skeleton h-5 w-10" />
              <span className="skeleton h-6 w-8" />
              <span className="skeleton h-6 w-6 rounded-full" />
              <span className="skeleton h-1.5 w-16 rounded-full" />
            </div>
          ))}
        </div>
        <div className="flex flex-1 items-end justify-center pb-8 text-xs font-medium text-muted">
          <span className="inline-flex items-center gap-2.5">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-primary-light" />
            Pulling the draft class…
          </span>
        </div>
      </div>
    </div>
  );
}

export function EmptyBoard() {
  return (
    <div className="relative grid h-full animate-fade-in place-items-center overflow-hidden">
      <div aria-hidden className="field-grid absolute inset-0" />
      <div className="relative flex flex-col items-center text-center">
        <img src="/art/empty-board.webp" alt="" className="animate-float h-56 w-56 object-contain opacity-90 [mask-image:radial-gradient(60%_60%_at_50%_50%,#000_55%,transparent_100%)]" />
        <div className="font-display text-lg font-bold text-neutral-100">Pick a draft year</div>
        <div className="mt-1 max-w-xs text-sm text-muted">Choose a year from the top bar, draw one at random, or search any player to open his class.</div>
      </div>
    </div>
  );
}
