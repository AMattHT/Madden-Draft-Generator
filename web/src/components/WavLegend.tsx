const TIERS = [
  { c: 'bg-gold', t: '90+', d: 'HOF / elite' },
  { c: 'bg-success', t: '80–89', d: 'star starter' },
  { c: 'bg-primary', t: '70–79', d: 'contributor' },
  { c: 'bg-slate-600', t: '60–69', d: 'rotational' },
  { c: 'bg-neutral-700', t: '<60', d: 'fringe' },
];

export function WavLegend() {
  return (
    <div className="flex h-full flex-col justify-center rounded-lg border border-border bg-surface-1 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">OVR tiers</span>
        {TIERS.map((i) => (
          <div key={i.t} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-3 rounded ${i.c}`} />
            <span className="text-xs">
              <b className="tabular-nums text-neutral-200">{i.t}</b>{' '}
              <span className="text-neutral-500">{i.d}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-neutral-400">
        Ratings derive from each player's career <b className="text-neutral-300">weighted Approximate Value</b> —
        near-zero wAV ⇒ a bust, Hall-of-Fame wAV ⇒ a superstar. wAV tag:{' '}
        <span className="text-info">A</span> actual · <span className="text-neutral-400">P</span> predicted ·{' '}
        <span className="text-gold">EA</span> official 2026 rookie rating.
      </p>
    </div>
  );
}
