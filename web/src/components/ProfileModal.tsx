import { useEffect, useRef, useState } from 'react';
import type { PlayerRow, GearOption, FrontSevenInfo } from '../types';
import { api, displayPortrait, type ArchetypeOption, type PersonaTrait } from '../api';
import { POS_NAMES, DEV_NAMES, ATTR_GROUPS, humanize, fmtHeight, keyAttrsForPosition, tierColor } from '../constants';
import { RatingChip, DevBadge, Icon, ICONS } from './ui';
import { RadarChart } from './RadarChart';
import { GearEditor } from './GearEditor';
import { AppearanceEditor } from './AppearanceEditor';
import type { FaceScan } from '../types';

/**
 * M27 Persona DNA editor: the generated (or edited) trait set as removable chips
 * plus an add picker. Writes a comma-separated id list into the player's edit
 * patch ('personaDNA'), which the export maps into the draft binary's 5 slots.
 */
/** Provenance of a real head, for the face card. */
function faceSourceLabel(src?: string | null): string {
  if (!src) return '';
  if (/bundle/.test(src)) return ' · scan in game files';
  if (/roster/.test(src)) return ' · on the game roster';
  if (src === 'legend-portrait') return ' · legend';
  if (/preset/.test(src)) return ' · preset only (check in-game)';
  return ' · carried over (unverified)';
}

function PersonaEditor({
  generated,
  patch,
  onEdit,
}: {
  generated?: string[];
  patch: Record<string, number | string>;
  onEdit: (field: string, value: string) => void;
}) {
  const [traits, setTraits] = useState<PersonaTrait[]>([]);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.personaDnaTraits().then(setTraits).catch(() => {});
  }, []);

  useEffect(() => {
    if (!adding) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAdding(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setAdding(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [adding]);

  const idOf = new Map(traits.map((t) => [t.name, t.id]));
  const nameOf = new Map(traits.map((t) => [t.id, t.name]));
  const edited = typeof patch.personaDNA === 'string';
  const ids: number[] = edited
    ? String(patch.personaDNA).split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0)
    : (generated ?? []).map((n) => idOf.get(n)).filter((n): n is number => n != null);

  const apply = (next: number[]) => onEdit('personaDNA', next.join(','));
  const q = query.trim().toLowerCase();
  const available = traits.filter((t) => !ids.includes(t.id) && (!q || t.name.toLowerCase().includes(q)));

  return (
    <div ref={wrapRef} className="relative mt-1.5 flex flex-wrap items-center gap-1" title="M27 Persona DNA — written into the export (5 slots max)">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-muted">DNA</span>
      {ids.map((id) => (
        <span
          key={id}
          className="group inline-flex items-center gap-1 rounded-full bg-legend/15 px-2 py-0.5 text-[10px] font-medium text-legend-light ring-1 ring-legend/30"
        >
          {nameOf.get(id) ?? `#${id}`}
          <button
            onClick={() => apply(ids.filter((x) => x !== id))}
            className="text-legend-light/50 transition-colors hover:text-white"
            aria-label={`Remove ${nameOf.get(id)}`}
            title="Remove trait"
          >
            ×
          </button>
        </span>
      ))}
      {/* Before the trait list loads (unedited players), show names without remove. */}
      {!edited && traits.length === 0 &&
        (generated ?? []).map((n) => (
          <span key={n} className="rounded-full bg-legend/15 px-2 py-0.5 text-[10px] font-medium text-legend-light ring-1 ring-legend/30">
            {n}
          </span>
        ))}
      {ids.length < 5 && (
        <button
          onClick={() => setAdding((v) => !v)}
          className="rounded-full border border-dashed border-legend/40 px-2 py-0.5 text-[10px] font-medium text-legend-light transition-colors hover:bg-legend/10"
        >
          + Add
        </button>
      )}
      {adding && (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-lg border border-border-strong bg-surface-1 shadow-xl">
          <div className="border-b border-border p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter traits…"
              className="w-full rounded-md border border-border bg-surface-0 px-2 py-1 text-xs text-neutral-200 placeholder:text-muted focus:border-primary focus:outline-none"
            />
          </div>
          <div className="max-h-52 overflow-auto py-1">
            {available.slice(0, 40).map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  apply([...ids, t.id]);
                  setAdding(false);
                  setQuery('');
                }}
                className="block w-full px-3 py-1.5 text-left text-xs text-neutral-200 hover:bg-surface-2"
              >
                {t.name}
              </button>
            ))}
            {available.length === 0 && <div className="px-3 py-3 text-center text-[11px] text-muted">No matching traits.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Tooltip for the front-seven badge: how an LB-labeled player was placed (edge vs
 *  SAM/MIKE/WILL) and which signal decided it. */
function frontSevenTitle(f: FrontSevenInfo): string {
  const why: Record<string, string> = {
    sacks: 'career sack rate (>= 6 per starting season) marks an edge rusher',
    'sacks (no scheme)': 'high sack rate with few interceptions; drafting team scheme unknown',
    '3-4 olb': 'outside linebacker on a 3-4 team = edge rusher in Madden',
    '3-4 ilb': 'low sack rate on a 3-4 team = inside linebacker (MIKE)',
    '3-4 build': '3-4 team, no career stats; edge-sized build (low confidence)',
    '4-3 blitzer': 'moderate sack rate on a 4-3 team = blitzing strongside backer (SAM)',
    coverage: 'interception rate on a lighter frame = weakside coverage backer (WILL)',
    pff: 'PFF position data',
    nflverse: 'nflverse roster position',
  };
  const parts = [why[f.reason] ?? f.reason];
  if (f.scheme) parts.push(`drafting team (${f.team ?? '?'}) ran a ${f.scheme}`);
  if (f.sackRate != null) parts.push(`${f.sackRate} sacks per starting season`);
  return parts.join(' · ');
}

export function ProfileModal({
  row,
  patch,
  gearPatch,
  year,
  archetypeOptions,
  gameVersion = "m26",
  onEdit,
  onGearEdit,
  onReset,
  onClose,
  onNavigate,
  canPrev = false,
  canNext = false,
}: {
  row: PlayerRow;
  patch: Record<string, number | string>;
  gearPatch: Record<string, string>;
  year: number;
  archetypeOptions: Record<string, ArchetypeOption[]>;
  gameVersion?: "m26" | "m27";
  onEdit: (field: string, value: number | string) => void;
  onGearEdit: (slot: string, asset: string) => void;
  onReset: () => void;
  onClose: () => void;
  onNavigate?: (delta: number) => void;
  canPrev?: boolean;
  canNext?: boolean;
}) {
  const [imgErr, setImgErr] = useState(false);
  const [gearOpts, setGearOpts] = useState<Record<string, GearOption[]>>({});
  const [gearOpen, setGearOpen] = useState(false);
  const [appearOpen, setAppearOpen] = useState(false);
  const [scans, setScans] = useState<FaceScan[]>([]);
  const [colleges, setColleges] = useState<{ id: number; name: string }[]>([]);
  const [heads, setHeads] = useState<Record<string, string[]>>({});
  const [faceTone, setFaceTone] = useState<number>(row.skinTone ?? 4);
  // Section jump-nav: the profile is a long scroll; these refs anchor each block.
  const scoutingRef = useRef<HTMLDivElement>(null);
  const ratingsRef = useRef<HTMLDivElement>(null);
  const bioRef = useRef<HTMLDivElement>(null);
  const appearRef = useRef<HTMLDivElement>(null);
  const equipRef = useRef<HTMLDivElement>(null);
  const attrsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    api.equipmentOptions(year, gameVersion).then((o) => alive && setGearOpts(o)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [year, gameVersion]);

  useEffect(() => {
    let alive = true;
    api.lookup('college').then((o) => alive && setColleges(o)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    api.genericHeads(gameVersion).then(setHeads).catch(() => {});
  }, [gameVersion]);
  useEffect(() => {
    let alive = true;
    api.faceScans(gameVersion).then((s) => alive && setScans(s)).catch(() => {});
    return () => { alive = false; };
  }, [gameVersion]);
  useEffect(() => setFaceTone(row.skinTone ?? 4), [row.id, row.skinTone]);
  useEffect(() => setImgErr(false), [row.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape closes the innermost layer only: a nested editor (equipment /
      // appearance / persona picker) handles its own Escape; the profile stays.
      if (e.key === 'Escape') {
        if (gearOpen || appearOpen) return;
        if ((e.target as HTMLElement | null)?.closest('[data-nested-editor]')) return;
        onClose();
        return;
      }
      // <- / -> step through the board's players - but never while typing in a
      // field or while the equipment builder has focus.
      if (gearOpen || appearOpen || !onNavigate) return;
      const t = e.target as HTMLElement;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      if (e.key === 'ArrowLeft' && canPrev) { e.preventDefault(); onNavigate(-1); }
      else if (e.key === 'ArrowRight' && canNext) { e.preventDefault(); onNavigate(1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onNavigate, canPrev, canNext, gearOpen, appearOpen]);

  const eff = (field: string): number =>
    Number(field in patch ? patch[field] : field === 'overall' ? row.overall : (row.ratings[field] ?? 0));
  const effStr = (field: string, fallback: string): string =>
    typeof patch[field] === 'string' ? (patch[field] as string) : fallback;
  const effNum = (field: string, fallback: number): number =>
    field in patch ? Number(patch[field]) : fallback;
  const currentCollegeId =
    typeof patch.college === 'number' ? patch.college : colleges.find((c) => c.name === row.college)?.id ?? 0;


  const overall = Number(patch.overall ?? row.overall);
  const dev = Number(patch.devTrait ?? row.devTrait);
  const posId = Number(patch.position ?? row.positionId);
  const archetype = Number(patch.archetype ?? row.archetype);
  const posName = POS_NAMES[posId] ?? row.position;
  const edited = Object.keys(patch).length > 0;

  // "What the game will show": after any edit, ask the server for Madden's
  // recomputed overall (and, when overall/position/archetype changed, the
  // attributes the export re-solves) - debounced so slider drags don't spam it.
  const [gameView, setGameView] = useState<{ overall: number | null; archetype?: number; reconciled: Record<string, number> | null } | null>(null);
  useEffect(() => {
    if (!edited) { setGameView(null); return; }
    const ratings: Record<string, number> = {};
    for (const k of Object.keys(row.ratings)) ratings[k] = eff(k);
    const reconcile = 'overall' in patch || 'position' in patch || 'archetype' in patch;
    const t = setTimeout(() => {
      api.recompute({ gameVersion, positionId: posId, archetype, overall, ratings, reconcile })
        .then((r) => setGameView({ overall: r.gameOverall, archetype: r.gameArchetype, reconciled: r.reconciled }))
        .catch(() => setGameView(null));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patch, row.id, posId, archetype, overall, gameVersion]);

  // Reset is destructive (clears rating + bio edits) — two-step inline confirm.
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => setConfirmReset(false), [row.id]);
  useEffect(() => {
    if (!confirmReset) return;
    const t = setTimeout(() => setConfirmReset(false), 4000);
    return () => clearTimeout(t);
  }, [confirmReset]);

  // Archetypes valid for the current position (+ the current one if it isn't listed).
  let archOpts = archetypeOptions[posName] ?? [];
  if (!archOpts.some((o) => o.id === archetype)) {
    archOpts = [{ id: archetype, name: row.archetypeName || `#${archetype}` }, ...archOpts];
  }
  const archName = archOpts.find((o) => o.id === archetype)?.name ?? row.archetypeName;

  const field = 'rounded-md border border-border bg-surface-0 px-1.5 py-1 text-sm focus:border-primary focus:outline-none';
  // Face (generic head) picker: pool for the chosen skin tone; PEPS drives the write.
  const facePool = heads[String(faceTone)] ?? [];
  const curFace = effStr('genericHeadName', row.genericHead ?? '');
  const faceIdx = facePool.indexOf(curFace);
  const pickFace = (i: number) => {
    if (!facePool.length) return;
    onEdit('genericHeadName', facePool[((i % facePool.length) + facePool.length) % facePool.length]);
  };
  const faceBtn = 'rounded-md border border-border-strong bg-surface-2 px-2 py-1 text-xs text-neutral-200 transition-colors hover:bg-surface-3 disabled:opacity-40';
  const num = (key: string) => {
    const v = eff(key);
    return (
      <input
        type="number"
        min={0}
        max={99}
        value={v}
        onChange={(e) => onEdit(key, Math.max(0, Math.min(99, parseInt(e.target.value || '0', 10))))}
        style={{ color: tierColor(v) }}
        className={`${field} w-14 text-right font-semibold tabular-nums`}
      />
    );
  };

  return (
    <>
    <div className="fixed inset-0 z-40 flex animate-fade-in justify-end bg-black/60 backdrop-blur-[2px]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${row.firstName} ${row.lastName} profile`}
        tabIndex={-1}
        ref={(el) => { if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true }); }}
        className="flex h-full w-[540px] max-w-full animate-slide-in-right flex-col overflow-auto border-l border-border-strong bg-surface-1 shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-border bg-surface-1/95 backdrop-blur-sm">
          <div className="flex items-start gap-4 px-5 pt-4">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-2 ring-1 ring-black/20">
            {displayPortrait(row) && !imgErr ? (
              <img
                src={displayPortrait(row)!}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setImgErr(true)}
              />
            ) : (
              <span className="text-2xl font-bold text-neutral-600">
                {(row.firstName[0] || '') + (row.lastName[0] || '')}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold leading-tight tracking-tight">
              {effStr('firstName', row.firstName)} {effStr('lastName', row.lastName)}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-neutral-300">{posName}</span>
              <RatingChip ovr={overall} size="sm" />
              {gameView && gameView.overall != null && (gameView.overall !== overall || (gameView.archetype != null && gameView.archetype !== archetype)) && (
                <span
                  className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning"
                  title={gameView.reconciled
                    ? 'Madden recomputes the overall from the attributes on import (under whichever of its archetypes scores highest); the export re-solves the skill attributes to land on your overall, and this is where it lands.'
                    : 'Madden recomputes the overall from the attributes on import, under whichever of its archetypes scores highest; with these attributes it will show this.'}
                >
                  game shows {gameView.overall}
                  {gameView.archetype != null && gameView.archetype !== archetype && ` as ${archOpts.find((o) => o.id === gameView.archetype)?.name ?? `#${gameView.archetype}`}`}
                </span>
              )}
              <DevBadge dev={dev} />
              {archName && <span className="text-xs text-muted">{archName}</span>}
              {row.twoWay && row.twoWay.roles.length > 0 && (
                <span
                  title={row.twoWay.source === 'era'
                    ? `Single-platoon era (through 1949): every player went both ways, so his ${row.twoWay.roles.join(' / ')} ratings are floored a step below his overall.`
                    : `${row.twoWay.note ?? 'Two-way player'} — the ${row.twoWay.roles.join(' / ')} ratings are floored near his overall so the depth chart can play him there.`}
                  className="rounded border border-legend/40 bg-legend/10 px-1.5 py-0.5 text-[10px] text-legend-light"
                >
                  also {row.twoWay.roles.join(' · ')}
                </span>
              )}
              {row.frontSeven && row.frontSeven.role && (
                <span
                  title={frontSevenTitle(row.frontSeven)}
                  className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-neutral-400"
                >
                  {row.frontSeven.role === 'EDGE' ? 'edge' : 'off-ball'} · {row.frontSeven.reason}
                </span>
              )}
            </div>
            <div className="mt-1.5 text-xs text-muted">
              {row.college || '—'} · {fmtHeight(row.heightInches)} · {row.weight || '—'} lb · age {row.age || '—'}
              {row.round ? ` · Rd ${row.round}` : ''} {row.wav != null ? `· wAV ${row.wav}` : ''}
            </div>
            {row.persona && (
              <PersonaEditor generated={row.persona} patch={patch} onEdit={onEdit} />
            )}
          </div>
          {onNavigate && (
            <div className="flex shrink-0 items-center gap-0.5 self-center">
              <button
                onClick={() => onNavigate(-1)}
                disabled={!canPrev}
                title="Previous player on the board (←)"
                aria-label="Previous player"
                className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-surface-2 hover:text-neutral-100 disabled:opacity-30"
              >
                <Icon path={ICONS.chevronDown} className="h-4 w-4 rotate-90" />
              </button>
              <button
                onClick={() => onNavigate(1)}
                disabled={!canNext}
                title="Next player on the board (→)"
                aria-label="Next player"
                className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-surface-2 hover:text-neutral-100 disabled:opacity-30"
              >
                <Icon path={ICONS.chevronDown} className="h-4 w-4 -rotate-90" />
              </button>
            </div>
          )}
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-surface-2 hover:text-neutral-200"
            aria-label="Close"
          >
            <Icon path={ICONS.close} className="h-5 w-5" />
          </button>
          </div>
          {/* Section jump-nav — the profile is a long scroll. */}
          <div className="flex items-center gap-1 overflow-x-auto px-5 pb-2 pt-1">
            {(
              [
                ['Scouting', scoutingRef],
                ['Ratings', ratingsRef],
                ['Bio', bioRef],
                ['Appearance', appearRef],
                ['Equipment', equipRef],
                ['Attributes', attrsRef],
              ] as const
            ).map(([label, ref]) => (
              <button
                key={label}
                onClick={() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="rounded-md px-2.5 py-1 text-[11px] font-semibold text-neutral-400 transition-colors hover:bg-surface-2 hover:text-neutral-100"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div ref={scoutingRef} className="scroll-mt-36 border-b border-border px-5 py-4">
          <RadarChart
            data={keyAttrsForPosition(posId).map(([k, label]) => ({ label, value: eff(k) }))}
            color={tierColor(overall)}
          />
          <p className="mt-1 text-center text-[11px] text-muted">
            Signature {posName} attributes — dashed gold ring = elite (90+)
          </p>
        </div>

        {row.combine &&
          (() => {
            const c = row.combine;
            const metrics: [string, number | null, string][] = [
              ['40 yd', c.forty, 's'],
              ['Bench', c.bench, ''],
              ['Vert', c.vertical, '"'],
              ['Broad', c.broad, '"'],
              ['3-Cone', c.cone, 's'],
              ['Shuttle', c.shuttle, 's'],
            ];
            return (
              <div className="border-b border-border px-5 py-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  NFL Combine <span className="text-muted">· drives speed / strength / jump / agility</span>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {metrics.map(([label, val, unit]) => (
                    <div key={label} className="rounded-md bg-surface-2 px-1.5 py-1.5 text-center">
                      <div className="text-[9px] uppercase tracking-wide text-muted">{label}</div>
                      <div className="text-sm font-semibold tabular-nums text-neutral-100">
                        {val != null ? `${val}${unit}` : '—'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

        <div ref={ratingsRef} className="space-y-3 scroll-mt-36 border-b border-border px-5 py-4">
          <div className="grid grid-cols-3 gap-3">
            <label className="text-xs text-neutral-400">
              Overall
              <div className="mt-1">{num('overall')}</div>
            </label>
            <label className="text-xs text-neutral-400">
              Position
              <select
                value={posId}
                onChange={(e) => onEdit('position', parseInt(e.target.value, 10))}
                className={`${field} mt-1 block w-full`}
              >
                {POS_NAMES.map((n, i) => (
                  <option key={i} value={i}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-neutral-400">
              Dev Trait
              <select
                value={dev}
                onChange={(e) => onEdit('devTrait', parseInt(e.target.value, 10))}
                className={`${field} mt-1 block w-full`}
              >
                {DEV_NAMES.map((n, i) => (
                  <option key={i} value={i}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-neutral-400">
              Jersey #
              <input
                type="number"
                min={0}
                max={99}
                value={patch.jerseyNum ?? row.jersey}
                onChange={(e) => onEdit('jerseyNum', Math.max(0, Math.min(99, parseInt(e.target.value || '0', 10))))}
                className={`${field} mt-1 block w-full tabular-nums`}
              />
            </label>
          </div>
          <label className="block text-xs text-neutral-400">
            Archetype
            <select
              value={archetype}
              onChange={(e) => onEdit('archetype', parseInt(e.target.value, 10))}
              className={`${field} mt-1 block w-full`}
            >
              {archOpts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div ref={bioRef} className="space-y-3 scroll-mt-36 border-b border-border px-5 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Bio</div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-neutral-400">
              First name
              <input
                type="text"
                maxLength={16}
                value={effStr('firstName', row.firstName)}
                onChange={(e) => onEdit('firstName', e.target.value)}
                className={`${field} mt-1 block w-full`}
              />
            </label>
            <label className="text-xs text-neutral-400">
              Last name
              <input
                type="text"
                maxLength={20}
                value={effStr('lastName', row.lastName)}
                onChange={(e) => onEdit('lastName', e.target.value)}
                className={`${field} mt-1 block w-full`}
              />
            </label>
          </div>
          <label className="block text-xs text-neutral-400">
            College <span className="text-muted">(only Madden‑recognized schools)</span>
            <select
              value={currentCollegeId}
              onChange={(e) => onEdit('college', parseInt(e.target.value, 10))}
              className={`${field} mt-1 block w-full`}
            >
              {colleges.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className="text-xs text-neutral-400">
              Height (in)
              <input
                type="number"
                min={60}
                max={84}
                value={effNum('heightInches', row.heightInches ?? 72)}
                onChange={(e) => onEdit('heightInches', Math.max(60, Math.min(84, parseInt(e.target.value || '72', 10))))}
                className={`${field} mt-1 block w-full tabular-nums`}
              />
            </label>
            <label className="text-xs text-neutral-400">
              Weight (lb)
              <input
                type="number"
                min={140}
                max={400}
                value={effNum('weight', row.weight ?? 200)}
                onChange={(e) => onEdit('weight', Math.max(140, Math.min(400, parseInt(e.target.value || '200', 10))))}
                className={`${field} mt-1 block w-full tabular-nums`}
              />
            </label>
            <label className="text-xs text-neutral-400">
              Age
              <input
                type="number"
                min={18}
                max={45}
                value={effNum('age', row.age ?? 22)}
                onChange={(e) => onEdit('age', Math.max(18, Math.min(45, parseInt(e.target.value || '22', 10))))}
                className={`${field} mt-1 block w-full tabular-nums`}
              />
            </label>
          </div>
        </div>

          <div ref={appearRef} className="space-y-2.5 scroll-mt-36 border-b border-border px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Appearance <span className="font-medium normal-case tracking-normal text-muted">· {gameVersion === 'm27' ? 'M27' : 'M26'} scans</span>
            </div>
            <button
              onClick={() => setAppearOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-surface-2 px-2.5 py-1 text-xs font-medium text-neutral-200 transition-colors hover:bg-surface-3"
            >
              <Icon path={ICONS.image} className="h-3.5 w-3.5" /> Edit appearance
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-surface-2">
              {curFace && /^gen_/i.test(curFace) ? (
                <img key={curFace} src={`/api/portrait/generic-head/${encodeURIComponent(curFace)}`} alt="" className="h-full w-full object-cover" />
              ) : displayPortrait(row) && !imgErr ? (
                <img src={displayPortrait(row)!} alt="" className="h-full w-full object-cover" />
              ) : (
                <Icon path={ICONS.image} className="h-6 w-6 text-neutral-600" />
              )}
            </span>
            <div className="min-w-0 text-[11px] leading-relaxed text-neutral-400">
              <div className="truncate text-neutral-200">
                {typeof patch.faceAsset === 'string' && patch.faceAsset
                  ? `Scan ${patch.faceAsset}`
                  : curFace
                    ? curFace
                    : row.face === 'asset'
                      ? `Real face asset${faceSourceLabel(row.faceSource)}`
                      : 'Generated generic'}
              </div>
              <div>Tone {faceTone} · {effStr('bodyType', row.bodyType || 'Standard')}</div>
            </div>
          </div>
        </div>

        <div ref={equipRef} className="space-y-2.5 scroll-mt-36 border-b border-border px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Equipment</div>
            <button
              onClick={() => setGearOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-surface-2 px-2.5 py-1 text-xs font-medium text-neutral-200 transition-colors hover:bg-surface-3"
            >
              <Icon path={ICONS.image} className="h-3.5 w-3.5" /> Edit equipment
            </button>
          </div>
          {Object.keys(gearPatch).length ? (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(gearPatch).map(([slot, val]) => {
                const opt = (gearOpts[slot] ?? []).find((o) => o.value === val);
                return (
                  <span key={slot} className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1 text-[11px] text-neutral-300 ring-1 ring-border-strong">
                    {opt?.image && <img src={opt.image} alt="" className="h-4 w-4 object-contain" />}
                    <span className="text-muted">
                      {slot.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}:
                    </span>{' '}
                    {opt?.label ?? val}
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] text-muted">Auto — era-appropriate gear ({year}). Click “Edit equipment” to customize.</p>
          )}
        </div>

        <div ref={attrsRef} className="space-y-5 scroll-mt-36 px-5 py-4">
          {ATTR_GROUPS.map((g) => (
            <div key={g.title}>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{g.title}</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {g.keys.map((k) => (
                  <div key={k} className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-neutral-400">{humanize(k)}</span>
                    {num(k)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="sticky bottom-0 mt-auto flex items-center justify-between gap-2 border-t border-border bg-surface-1/95 px-5 py-3 backdrop-blur-sm">
          <span className="text-[11px] text-muted">Edits save automatically &amp; apply to the .mdc export.</span>
          <button
            onClick={() => {
              if (confirmReset) {
                onReset();
                setConfirmReset(false);
              } else {
                setConfirmReset(true);
              }
            }}
            disabled={!edited}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
              confirmReset
                ? 'border-danger/60 bg-danger/15 text-red-200 hover:bg-danger/25'
                : 'border-border-strong text-neutral-300 hover:bg-surface-2'
            }`}
          >
            {confirmReset ? 'Confirm reset?' : 'Reset player'}
          </button>
        </div>
      </div>
    </div>
    {appearOpen && (
      <AppearanceEditor
        playerName={`${row.firstName} ${row.lastName}`}
        gameVersion={gameVersion}
        heads={heads}
        scans={scans}
        currentHead={curFace}
        currentAsset={typeof patch.faceAsset === 'string' ? patch.faceAsset : (row.face === 'asset' && row.genericHead == null ? '' : '')}
        currentTone={faceTone}
        currentBody={effStr('bodyType', row.bodyType || 'Standard')}
        generatedHead={row.genericHead ?? ''}
        generatedTone={row.skinTone ?? 4}
        generatedBody={row.bodyType || 'Standard'}
        isRealFace={row.face === 'asset'}
        onEdit={onEdit}
        onClose={() => setAppearOpen(false)}
      />
    )}
    {gearOpen && (
      <GearEditor
        playerName={`${row.firstName} ${row.lastName}`}
        options={gearOpts}
        gearPatch={gearPatch}
        onGearEdit={onGearEdit}
        onClose={() => setGearOpen(false)}
        gameVersion={gameVersion}
        year={year}
        positionId={row.positionId}
        autoGear={row.gear ?? {}}
      />
    )}
    </>
  );
}
