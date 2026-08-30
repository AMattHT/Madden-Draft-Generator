import { displayPortrait } from '../api';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlayerRow } from '../types';
import { RatingChip, DevBadge, TeamLogo, Portrait } from './ui';

type Row = PlayerRow & { edited?: boolean };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Every rating the game carries, in Madden's own groups and abbreviations.
 *
 *  The general/physical block leads because it means the same thing everywhere;
 *  after that the columns are position-specific by nature (throw power on a nose
 *  tackle is a floor value, not a scouting signal). That is the cost of showing
 *  all of them, and it is why the table must scroll horizontally rather than
 *  squeeze — see the min-width on the table element. */
export const ATTR_COLUMNS = [
  // General / physical — meaningful at every position, so they lead.
  { id: 'spd', label: 'SPD', key: 'speed' },
  { id: 'acc', label: 'ACC', key: 'acceleration' },
  { id: 'agi', label: 'AGI', key: 'agility' },
  { id: 'cod', label: 'COD', key: 'changeOfDirection' },
  { id: 'str', label: 'STR', key: 'strength' },
  { id: 'jmp', label: 'JMP', key: 'jumping' },
  { id: 'awr', label: 'AWR', key: 'awareness' },
  { id: 'sta', label: 'STA', key: 'stamina' },
  { id: 'tgh', label: 'TGH', key: 'toughness' },
  { id: 'inj', label: 'INJ', key: 'injury' },
  // Ball carrier
  { id: 'car', label: 'CAR', key: 'carrying' },
  { id: 'bcv', label: 'BCV', key: 'ballCarrierVision' },
  { id: 'btk', label: 'BTK', key: 'breakTackle' },
  { id: 'trk', label: 'TRK', key: 'trucking' },
  { id: 'sfa', label: 'SFA', key: 'stiffArm' },
  { id: 'spm', label: 'SPM', key: 'spinMove' },
  { id: 'jkm', label: 'JKM', key: 'jukeMove' },
  // Receiving
  { id: 'cth', label: 'CTH', key: 'catching' },
  { id: 'cit', label: 'CIT', key: 'catchInTraffic' },
  { id: 'spc', label: 'SPC', key: 'spectacularCatch' },
  { id: 'srr', label: 'SRR', key: 'shortRouteRunning' },
  { id: 'mrr', label: 'MRR', key: 'mediumRouteRunning' },
  { id: 'drr', label: 'DRR', key: 'deepRouteRunning' },
  { id: 'rls', label: 'RLS', key: 'release' },
  // Passing
  { id: 'thp', label: 'THP', key: 'throwPower' },
  { id: 'tas', label: 'TAS', key: 'throwAccuracyShort' },
  { id: 'tam', label: 'TAM', key: 'throwAccuracyMid' },
  { id: 'tad', label: 'TAD', key: 'throwAccuracyDeep' },
  { id: 'tor', label: 'TOR', key: 'throwOnTheRun' },
  { id: 'tup', label: 'TUP', key: 'throwUnderPressure' },
  { id: 'pac', label: 'PAC', key: 'playAction' },
  { id: 'bsk', label: 'BSK', key: 'breakSack' },
  // Blocking
  { id: 'pbk', label: 'PBK', key: 'passBlock' },
  { id: 'pbp', label: 'PBP', key: 'passBlockPower' },
  { id: 'pbf', label: 'PBF', key: 'passBlockFinesse' },
  { id: 'rbk', label: 'RBK', key: 'runBlock' },
  { id: 'rbp', label: 'RBP', key: 'runBlockPower' },
  { id: 'rbf', label: 'RBF', key: 'runBlockFinesse' },
  { id: 'lbk', label: 'LBK', key: 'leadBlock' },
  { id: 'ibl', label: 'IBL', key: 'impactBlocking' },
  // Defence
  { id: 'tak', label: 'TAK', key: 'tackle' },
  { id: 'pow', label: 'POW', key: 'hitPower' },
  { id: 'pmv', label: 'PMV', key: 'powerMoves' },
  { id: 'fmv', label: 'FMV', key: 'finesseMoves' },
  { id: 'bsh', label: 'BSH', key: 'blockShedding' },
  { id: 'pur', label: 'PUR', key: 'pursuit' },
  { id: 'prc', label: 'PRC', key: 'playRecognition' },
  { id: 'mcv', label: 'MCV', key: 'manCoverage' },
  { id: 'zcv', label: 'ZCV', key: 'zoneCoverage' },
  { id: 'prs', label: 'PRS', key: 'pressCoverage' },
  // Special teams
  { id: 'kpw', label: 'KPW', key: 'kickPower' },
  { id: 'kac', label: 'KAC', key: 'kickAccuracy' },
  { id: 'kr', label: 'KR', key: 'kickReturn' },
  { id: 'lng', label: 'LNG', key: 'longSnap' },
] as const;

/** Columns the spoiler mask hides. Sorting by any of them would order the board
 *  by the very numbers being hidden, so they stop being sortable while masked --
 *  hiding a value but ranking by it is not hiding it. */
export const SPOILER_SORTS = new Set<string>(['ovr', 'dev', 'wav', ...ATTR_COLUMNS.map((c) => c.id)]);

/** Same thresholds the rating chips use, so a 90 reads as elite everywhere. */
function attrTone(v: number): string {
  if (v >= 90) return 'text-success';
  if (v >= 80) return 'text-info';
  if (v >= 70) return 'text-neutral-300';
  return 'text-neutral-500';
}

function wavTag(source: string): { label: string; cls: string; title: string } {
  if (source === 'actual') return { label: 'A', cls: 'text-info', title: 'actual career wAV' };
  if (source === 'preset')
    return { label: 'EA', cls: 'text-gold', title: "EA's official rookie rating — no career wAV yet" };
  return { label: 'P', cls: 'text-muted', title: 'predicted from draft slot / era' };
}

function SortTh({
  id,
  sort,
  onSort,
  className,
  children,
  locked = false,
}: {
  id: string;
  sort?: string;
  onSort?: (s: string) => void;
  className: string;
  children: React.ReactNode;
  locked?: boolean;
}) {
  if (locked)
    return (
      <th className={`${className} font-semibold text-neutral-600`} title="Hidden while Spoilers is off">
        {children}
      </th>
    );
  if (!onSort) return <th className={`${className} font-semibold`}>{children}</th>;
  const col = (sort ?? '').replace(/^-/, '');
  const on = col === id;
  const desc = on && (sort ?? '').startsWith('-');
  return (
    <th className={className} aria-sort={on ? (desc ? 'descending' : 'ascending') : 'none'}>
      <button
        onClick={() => {
          if (!on) {
            onSort(id === 'ovr' || id === 'wav' || id === 'dev' ? `-${id}` : id);
          } else {
            onSort(desc ? id : `-${id}`);
          }
        }}
        title={on ? `Sorted ${desc ? 'high → low' : 'low → high'} — click to flip` : `Sort by ${id}`}
        className={`inline-flex items-center gap-1 font-semibold uppercase tracking-wide transition-colors ${
          on ? 'text-neutral-100' : 'text-neutral-400 hover:text-neutral-200'
        }`}
      >
        {children}
        {on && (
          <span aria-hidden className="text-[9px]">
            {desc ? '▼' : '▲'}
          </span>
        )}
      </button>
    </th>
  );
}

export function PlayerTable({
  rows,
  selectedId,
  onRowClick,
  focusName,
  sort,
  onSort,
  spoilers = true,
}: {
  rows: Row[];
  selectedId: number | null;
  onRowClick: (id: number) => void;
  focusName?: string | null;
  sort?: string;
  onSort?: (s: string) => void;
  /** false hides overall, dev trait, wAV and attributes (blind scouting). */
  spoilers?: boolean;
}) {
  const maxWav = useMemo(() => Math.max(1, ...rows.map((r) => r.wav ?? 0)), [rows]);

  // Roving-tabindex keyboard navigation: one row is tabbable at a time; ↑/↓ move
  // the highlight, Enter opens the profile. Focus returns to the active row when
  // the profile modal closes (selectedId -> null).
  const [activeId, setActiveId] = useState<number | null>(null);
  const effActive = activeId != null && rows.some((r) => r.id === activeId) ? activeId : (rows[0]?.id ?? null);
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>());
  const wasOpen = useRef(false);
  useEffect(() => {
    if (selectedId == null && wasOpen.current && effActive != null) {
      rowRefs.current.get(effActive)?.focus();
    }
    wasOpen.current = selectedId != null;
  }, [selectedId, effActive]);

  const moveActive = (delta: number) => {
    const idx = rows.findIndex((r) => r.id === effActive);
    const next = rows[idx + delta];
    if (!next) return;
    setActiveId(next.id);
    rowRefs.current.get(next.id)?.focus();
  };

  const focusId = useMemo(
    () => (focusName ? rows.find((r) => norm(`${r.firstName}${r.lastName}`) === focusName)?.id ?? null : null),
    [rows, focusName]
  );
  const focusRef = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    if (focusId != null) focusRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focusId]);

  // `w-full` alone can never overflow, so the wrapper's overflow-auto had
  // nothing to scroll and the columns just squeezed instead. A min-width lets
  // the table grow past a narrow pane and scroll, while still filling a wide one.
  return (
    <table className="w-full min-w-[3000px] border-collapse text-sm">
      <thead className="sticky top-0 z-10 bg-surface-2 text-[11px] uppercase tracking-wide text-neutral-400 shadow-[0_1px_0_var(--color-border)]">
        <tr>
          <SortTh id="pick" sort={sort} onSort={onSort} className="w-12 px-3 py-2.5 text-right">#</SortTh>
          <SortTh id="team" sort={sort} onSort={onSort} className="w-12 px-3 py-2.5 text-center">Team</SortTh>
          <SortTh id="name" sort={sort} onSort={onSort} className="w-56 px-3 py-2.5 text-left">Player</SortTh>
          <SortTh id="pos" sort={sort} onSort={onSort} className="w-16 px-3 py-2.5 text-left">Pos</SortTh>
          <SortTh id="ovr" locked={!spoilers} sort={sort} onSort={onSort} className="w-16 px-3 py-2.5 text-center">OVR</SortTh>
          <SortTh id="dev" locked={!spoilers} sort={sort} onSort={onSort} className="w-14 px-3 py-2.5 text-center">Dev</SortTh>
          <SortTh id="wav" locked={!spoilers} sort={sort} onSort={onSort} className="w-28 px-3 py-2.5 text-right">wAV</SortTh>
          {ATTR_COLUMNS.map((c) => (
            <SortTh key={c.id} id={c.id} locked={!spoilers} sort={sort} onSort={onSort} className="w-12 px-2 py-2.5 text-center">
              {c.label}
            </SortTh>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const active = r.id === selectedId;
          const highlighted = r.id === effActive;
          const focused = r.id === focusId;
          const tag = wavTag(r.wavSource);
          const wavPct = r.wav != null ? Math.max(2, (r.wav / maxWav) * 100) : 0;
          return (
            <tr
              key={r.id}
              ref={(el) => {
                if (el) rowRefs.current.set(r.id, el);
                else rowRefs.current.delete(r.id);
                if (focused && el) focusRef.current = el;
              }}
              tabIndex={highlighted ? 0 : -1}
              aria-selected={active}
              onFocus={() => setActiveId(r.id)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
                else if (e.key === 'Enter') { e.preventDefault(); onRowClick(r.id); }
              }}
              onClick={() => { setActiveId(r.id); onRowClick(r.id); }}
              className={`cursor-pointer border-t border-border/50 outline-none transition-colors focus-visible:bg-surface-2 ${
                focused
                  ? 'bg-gold/15 hover:bg-gold/20'
                  : active
                    ? 'bg-primary/10 hover:bg-primary/15'
                    : 'hover:bg-surface-2/70'
              }`}
            >
              <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted">{r.pick}</td>
              <td className="px-3 py-1.5">
                <span className="flex items-center justify-center">
                  <TeamLogo team={r.team} size="sm" />
                </span>
              </td>
              <td className="px-3 py-1.5 font-medium text-neutral-100">
                <span className="inline-flex items-center gap-2.5">
                  <Portrait src={displayPortrait(r)} fallback={r.portrait} size="xs" />
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
                <RatingChip ovr={r.overall} size="sm" hidden={!spoilers} />
              </td>
              <td className="px-3 py-1.5">
                <span className="flex justify-center"><DevBadge dev={r.devTrait} hidden={!spoilers} /></span>
              </td>
              <td className="px-3 py-1.5">
                <div className="flex items-center justify-end gap-2">
                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
                    {spoilers && (
                      <span
                        className="block h-full rounded-full bg-primary/70"
                        style={{ width: `${wavPct}%` }}
                      />
                    )}
                  </span>
                  <span className="w-8 text-right tabular-nums text-neutral-300">
                    {spoilers ? (r.wav ?? '—') : '?'}
                  </span>
                  <span className={`w-5 text-left text-[10px] ${spoilers ? tag.cls : 'text-muted'}`} title={spoilers ? tag.title : undefined}>
                    {spoilers ? tag.label : ''}
                  </span>
                </div>
              </td>
              {ATTR_COLUMNS.map((c) => {
                const v = r.ratings?.[c.key];
                return (
                  <td key={c.id} className="px-2 py-1.5 text-center tabular-nums">
                    {spoilers ? (
                      <span className={v == null ? 'text-neutral-600' : attrTone(v)}>{v ?? '—'}</span>
                    ) : (
                      <span className="text-neutral-600">?</span>
                    )}
                  </td>
                );
              })}
            </tr>
          );
        })}
        {rows.length === 0 && (
          <tr>
            <td colSpan={8} className="px-3 py-16 text-center text-muted">
              <div className="text-sm">No players match the current filter.</div>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
