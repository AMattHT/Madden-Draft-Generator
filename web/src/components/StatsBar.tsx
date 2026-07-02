import type { ReactNode } from 'react';
import type { GeneratedClass } from '../types';

function Cell({ label, value, sub, children }: { label: string; value?: ReactNode; sub?: string; children?: ReactNode }) {
  return (
    <div className="bg-surface-1 px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</div>
      {value != null && <div className="mt-1 text-2xl font-bold leading-none tabular-nums text-neutral-50">{value}</div>}
      {children}
      {sub && <div className="mt-1 text-[10px] text-neutral-500">{sub}</div>}
    </div>
  );
}

export function StatsBar({ data }: { data: GeneratedClass }) {
  const dev = [0, 0, 0, 0];
  let ovrSum = 0;
  let ovrMax = 0;
  for (const r of data.rows) {
    dev[r.devTrait] = (dev[r.devTrait] || 0) + 1;
    ovrSum += r.overall;
    if (r.overall > ovrMax) ovrMax = r.overall;
  }
  const total = data.rows.length || 1;
  const avg = Math.round(ovrSum / total);
  const l = data.likeness;

  // Elite dev distribution (X-Factor / Superstar / Star) as a mini stacked bar.
  const segs = [
    { n: dev[3], cls: 'bg-legend', label: 'X-Factor' },
    { n: dev[2], cls: 'bg-pink-500', label: 'Superstar' },
    { n: dev[1], cls: 'bg-primary', label: 'Star' },
    { n: dev[0], cls: 'bg-surface-3', label: 'Normal' },
  ];

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
      <Cell label="Prospects" value={data.count} sub="in this class" />
      <Cell label="Avg OVR" value={avg} sub={`top rated ${ovrMax}`} />
      <Cell label="Elite dev traits" sub={`${dev[3]} XF · ${dev[2]} SS · ${dev[1]} star`}>
        <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-surface-3">
          {segs.map(
            (s) =>
              s.n > 0 && (
                <div
                  key={s.label}
                  className={s.cls}
                  style={{ width: `${(s.n / total) * 100}%` }}
                  title={`${s.label}: ${s.n}`}
                />
              )
          )}
        </div>
      </Cell>
      <Cell label="Real faces" value={l.asset} sub={`${l.withPortrait} real portraits`} />
      <Cell label="Custom-photo" value={l.customPortrait} sub="Frosty-eligible" />
    </div>
  );
}
