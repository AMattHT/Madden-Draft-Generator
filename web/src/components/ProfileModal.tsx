import { useEffect, useState } from 'react';
import type { PlayerRow, GearOption } from '../types';
import { api, type ArchetypeOption } from '../api';
import { POS_NAMES, DEV_NAMES, ATTR_GROUPS, humanize, fmtHeight, keyAttrsForPosition, tierColor } from '../constants';
import { RatingChip, DevBadge, Icon, ICONS } from './ui';
import { RadarChart } from './RadarChart';
import { GearEditor } from './GearEditor';

export function ProfileModal({
  row,
  patch,
  gearPatch,
  year,
  archetypeOptions,
  onEdit,
  onGearEdit,
  onReset,
  onClose,
}: {
  row: PlayerRow;
  patch: Record<string, number | string>;
  gearPatch: Record<string, string>;
  year: number;
  archetypeOptions: Record<string, ArchetypeOption[]>;
  onEdit: (field: string, value: number | string) => void;
  onGearEdit: (slot: string, asset: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [imgErr, setImgErr] = useState(false);
  const [gearOpts, setGearOpts] = useState<Record<string, GearOption[]>>({});
  const [gearOpen, setGearOpen] = useState(false);
  const [colleges, setColleges] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    let alive = true;
    api.equipmentOptions(year).then((o) => alive && setGearOpts(o)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [year]);

  useEffect(() => {
    let alive = true;
    api.lookup('college').then((o) => alive && setColleges(o)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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

  // Archetypes valid for the current position (+ the current one if it isn't listed).
  let archOpts = archetypeOptions[posName] ?? [];
  if (!archOpts.some((o) => o.id === archetype)) {
    archOpts = [{ id: archetype, name: row.archetypeName || `#${archetype}` }, ...archOpts];
  }
  const archName = archOpts.find((o) => o.id === archetype)?.name ?? row.archetypeName;

  const field = 'rounded-md border border-border bg-surface-0 px-1.5 py-1 text-sm focus:border-primary focus:outline-none';
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
        className="flex h-full w-[540px] max-w-full animate-slide-in-right flex-col overflow-auto border-l border-border-strong bg-surface-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start gap-4 border-b border-border bg-surface-1/95 px-5 py-4 backdrop-blur-sm">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-2 ring-1 ring-black/20">
            {row.portrait && !imgErr ? (
              <img
                src={row.portrait}
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
              <DevBadge dev={dev} />
              {archName && <span className="text-xs text-neutral-500">{archName}</span>}
            </div>
            <div className="mt-1.5 text-xs text-neutral-500">
              {row.college || '—'} · {fmtHeight(row.heightInches)} · {row.weight || '—'} lb · age {row.age || '—'}
              {row.round ? ` · Rd ${row.round}` : ''} {row.wav != null ? `· wAV ${row.wav}` : ''}
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-neutral-500 transition-colors hover:bg-surface-2 hover:text-neutral-200"
            aria-label="Close"
          >
            <Icon path={ICONS.close} className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-border px-5 py-4">
          <RadarChart
            data={keyAttrsForPosition(posId).map(([k, label]) => ({ label, value: eff(k) }))}
            color={tierColor(overall)}
          />
          <p className="mt-1 text-center text-[11px] text-neutral-500">
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
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                  NFL Combine <span className="text-neutral-600">· drives speed / strength / jump / agility</span>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {metrics.map(([label, val, unit]) => (
                    <div key={label} className="rounded-md bg-surface-2 px-1.5 py-1.5 text-center">
                      <div className="text-[9px] uppercase tracking-wide text-neutral-500">{label}</div>
                      <div className="text-sm font-semibold tabular-nums text-neutral-100">
                        {val != null ? `${val}${unit}` : '—'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

        <div className="space-y-3 border-b border-border px-5 py-4">
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

        <div className="space-y-3 border-b border-border px-5 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Bio</div>
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
            College <span className="text-neutral-600">(only Madden‑recognized schools)</span>
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
          <label className="block text-xs text-neutral-400">
            Body type <span className="text-neutral-600">(Madden 26 build)</span>
            <select
              value={effStr('bodyType', row.bodyType || 'Standard')}
              onChange={(e) => onEdit('bodyType', e.target.value)}
              className={`${field} mt-1 block w-full`}
            >
              {['Standard', 'Thin', 'Muscular', 'Heavy'].map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-2.5 border-b border-border px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Equipment</div>
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
                    <span className="text-neutral-500">
                      {slot.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}:
                    </span>{' '}
                    {opt?.label ?? val}
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] text-neutral-600">Auto — era-appropriate gear ({year}). Click “Edit equipment” to customize.</p>
          )}
        </div>

        <div className="space-y-5 px-5 py-4">
          {ATTR_GROUPS.map((g) => (
            <div key={g.title}>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{g.title}</div>
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
          <span className="text-[11px] text-neutral-500">Edits save automatically &amp; apply to the .mdc export.</span>
          <button
            onClick={onReset}
            disabled={!edited}
            className="rounded-md border border-border-strong px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-surface-2 disabled:opacity-40"
          >
            Reset player
          </button>
        </div>
      </div>
    </div>
    {gearOpen && (
      <GearEditor
        playerName={`${row.firstName} ${row.lastName}`}
        options={gearOpts}
        gearPatch={gearPatch}
        onGearEdit={onGearEdit}
        onClose={() => setGearOpen(false)}
      />
    )}
    </>
  );
}
