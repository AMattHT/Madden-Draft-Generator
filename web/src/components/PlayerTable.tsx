import { useEffect, useMemo, useRef } from 'react';
import type { PlayerRow } from '../types';
import { RatingChip, DevBadge, FaceTag, TeamLogo, Portrait } from './ui';

type Row = PlayerRow & { edited?: boolean };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function wavTag(source: string): { label: string; cls: string; title: string } {
  if (source === 'actual') return { label: 'A', cls: 'text-info', title: 'actual career wAV' };
  if (source === 'preset')
    return { label: 'EA', cls: 'text-gold', title: "EA's official rookie rating — no career wAV yet" };
  return { label: 'P', cls: 'text-neutral-500', title: 'predicted from draft slot / era' };
}

export function PlayerTable({
  rows,
  selectedId,
  onRowClick,
  focusName,
}: {
  rows: Row[];
  selectedId: number | null;
  onRowClick: (id: number) => void;
  focusName?: string | null;
}) {
  const maxWav = useMemo(() => Math.max(1, ...rows.map((r) => r.wav ?? 0)), [rows]);

  const focusId = useMemo(
    () => (focusName ? rows.find((r) => norm(`${r.firstName}${r.lastName}`) === focusName)?.id ?? null : null),
    [rows, focusName]
  );
  const focusRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (focusId != null) focusRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focusId]);

  return (
    <table className="w-full border-collapse text-sm">
      <thead className="sticky top-0 z-10 bg-surface-2 text-[11px] uppercase tracking-wide text-neutral-400 shadow-[0_1px_0_var(--color-border)]">
        <tr>
          <th className="w-12 px-3 py-2.5 text-right font-semibold">#</th>
          <th className="w-12 px-3 py-2.5 text-center font-semibold">Team</th>
          <th className="px-3 py-2.5 text-left font-semibold">Player</th>
          <th className="w-16 px-3 py-2.5 text-left font-semibold">Pos</th>
          <th className="w-16 px-3 py-2.5 text-center font-semibold">OVR</th>
          <th className="w-28 px-3 py-2.5 text-left font-semibold">Dev</th>
          <th className="w-36 px-3 py-2.5 text-right font-semibold">wAV</th>
          <th className="w-28 px-3 py-2.5 text-left font-semibold">Face</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const active = r.id === selectedId;
          const focused = r.id === focusId;
          const tag = wavTag(r.wavSource);
          const wavPct = r.wav != null ? Math.max(2, (r.wav / maxWav) * 100) : 0;
          return (
            <tr
              key={r.id}
              ref={focused ? focusRef : undefined}
              onClick={() => onRowClick(r.id)}
              className={`cursor-pointer border-t border-border/50 transition-colors ${
                focused
                  ? 'bg-gold/15 hover:bg-gold/20'
                  : active
                    ? 'bg-primary/10 hover:bg-primary/15'
                    : 'hover:bg-surface-2/70'
              }`}
            >
              <td className="px-3 py-1.5 text-right text-xs tabular-nums text-neutral-500">{r.pick}</td>
              <td className="px-3 py-1.5">
                <span className="flex items-center justify-center">
                  <TeamLogo team={r.team} size="sm" />
                </span>
              </td>
              <td className="px-3 py-1.5 font-medium text-neutral-100">
                <span className="inline-flex items-center gap-2.5">
                  <Portrait src={r.portrait} size="xs" />
                  <span className="inline-flex items-center gap-1.5">
                    {r.edited && <span className="text-gold" title="edited">●</span>}
                    {r.firstName} {r.lastName}
                  </span>
                </span>
              </td>
              <td className="px-3 py-1.5">
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-neutral-300">
                  {r.position}
                </span>
              </td>
              <td className="px-3 py-1.5 text-center">
                <RatingChip ovr={r.overall} size="sm" />
              </td>
              <td className="px-3 py-1.5">
                <DevBadge dev={r.devTrait} />
              </td>
              <td className="px-3 py-1.5">
                <div className="flex items-center justify-end gap-2">
                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
                    <span
                      className="block h-full rounded-full bg-primary/70"
                      style={{ width: `${wavPct}%` }}
                    />
                  </span>
                  <span className="w-8 text-right tabular-nums text-neutral-300">{r.wav ?? '—'}</span>
                  <span className={`w-5 text-left text-[10px] ${tag.cls}`} title={tag.title}>
                    {tag.label}
                  </span>
                </div>
              </td>
              <td className="px-3 py-1.5">
                <FaceTag face={r.face} />
              </td>
            </tr>
          );
        })}
        {rows.length === 0 && (
          <tr>
            <td colSpan={8} className="px-3 py-16 text-center text-neutral-600">
              <div className="text-sm">No players match the current filter.</div>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
