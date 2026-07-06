import { useEffect, useMemo, useState } from 'react';
import type { GearOption } from '../types';
import { Icon, ICONS } from './ui';

/** Gear slots grouped by body area (mirrors the server slot keys). */
const GROUPS: { group: string; slots: { slot: string; label: string }[] }[] = [
  {
    group: 'Head',
    slots: [
      { slot: 'helmet', label: 'Helmet' },
      { slot: 'facemask', label: 'Facemask' },
      { slot: 'visor', label: 'Visor' },
      { slot: 'mouthpiece', label: 'Mouthpiece' },
      { slot: 'guardianCap', label: 'Guardian cap' },
      { slot: 'eyePaint', label: 'Eye black' },
    ],
  },
  {
    group: 'Pads',
    slots: [
      { slot: 'shoulderPads', label: 'Shoulder pads' },
      { slot: 'backPlate', label: 'Back plate' },
      { slot: 'flakJacket', label: 'Flak jacket' },
      { slot: 'neckRoll', label: 'Neck roll' },
      { slot: 'kneePads', label: 'Knee pads' },
      { slot: 'thighLeft', label: 'Left thigh pad' },
      { slot: 'thighRight', label: 'Right thigh pad' },
    ],
  },
  {
    group: 'Arms',
    slots: [
      { slot: 'gloveLeft', label: 'Left glove' },
      { slot: 'gloveRight', label: 'Right glove' },
      { slot: 'armLeft', label: 'Left arm sleeve' },
      { slot: 'armRight', label: 'Right arm sleeve' },
      { slot: 'elbowLeft', label: 'Left elbow' },
      { slot: 'elbowRight', label: 'Right elbow' },
      { slot: 'wristLeft', label: 'Left wrist' },
      { slot: 'wristRight', label: 'Right wrist' },
    ],
  },
  {
    group: 'Legs & feet',
    slots: [
      { slot: 'cleatLeft', label: 'Left cleat' },
      { slot: 'cleatRight', label: 'Right cleat' },
      { slot: 'socks', label: 'Socks' },
      { slot: 'spatLeft', label: 'Left spat' },
      { slot: 'spatRight', label: 'Right spat' },
    ],
  },
  {
    group: 'Uniform',
    slots: [
      { slot: 'jerseyStyle', label: 'Jersey sleeves' },
      { slot: 'undershirt', label: 'Undershirt' },
      { slot: 'towel', label: 'Towel' },
      { slot: 'handwarmer', label: 'Handwarmer' },
      { slot: 'handwarmerStyle', label: 'Handwarmer position' },
    ],
  },
];
const ALL_SLOTS = GROUPS.flatMap((g) => g.slots);

/** Paired slots that can mirror to the other side. */
const MIRROR: Record<string, string> = {
  gloveLeft: 'gloveRight', gloveRight: 'gloveLeft',
  cleatLeft: 'cleatRight', cleatRight: 'cleatLeft',
  armLeft: 'armRight', armRight: 'armLeft',
  elbowLeft: 'elbowRight', elbowRight: 'elbowLeft',
  wristLeft: 'wristRight', wristRight: 'wristLeft',
  thighLeft: 'thighRight', thighRight: 'thighLeft',
  spatLeft: 'spatRight', spatRight: 'spatLeft',
};

function GearThumb({ src }: { src?: string }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className="h-14 w-14 object-contain" />;
  }
  return (
    <span className="grid h-14 w-14 place-items-center text-neutral-600">
      <Icon path={ICONS.image} className="h-6 w-6" />
    </span>
  );
}

/**
 * Visual equipment builder popup (like the Madden Editor Suite equipment tab):
 * body-area groups on the left (Head / Pads / Arms / Legs & feet / Jersey) that
 * drill into per-slot thumbnail grids on the right. "Era default" clears a slot.
 */
export function GearEditor({
  playerName,
  options,
  gearPatch,
  onGearEdit,
  onClose,
}: {
  playerName: string;
  options: Record<string, GearOption[]>;
  gearPatch: Record<string, string>;
  onGearEdit: (slot: string, asset: string) => void;
  onClose: () => void;
}) {
  const [active, setActive] = useState('helmet');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const items = options[active] ?? [];
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => (q ? items.filter((o) => o.label.toLowerCase().includes(q)) : items), [items, q]);
  const current = gearPatch[active] ?? '';
  const activeLabel = ALL_SLOTS.find((s) => s.slot === active)?.label ?? '';
  const setCount = (slots: { slot: string }[]) => slots.filter((s) => gearPatch[s.slot]).length;

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex h-[80vh] w-[900px] max-w-full flex-col overflow-hidden rounded-xl border border-border-strong bg-surface-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <div className="text-sm font-bold tracking-tight text-neutral-100">Equipment Builder</div>
            <div className="text-[11px] text-muted">{playerName}</div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-neutral-500 hover:bg-surface-2 hover:text-neutral-200" aria-label="Close">
            <Icon path={ICONS.close} className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Grouped slot nav */}
          <div className="w-48 shrink-0 overflow-auto border-r border-border p-2">
            {GROUPS.map((g) => {
              const open = g.slots.some((s) => s.slot === active);
              const n = setCount(g.slots);
              return (
                <div key={g.group} className="mb-1">
                  <button
                    onClick={() => setActive(g.slots[0].slot)}
                    className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                      open ? 'text-neutral-100' : 'text-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {g.group}
                      {n > 0 && <span className="rounded bg-primary/20 px-1 text-[9px] font-bold text-primary-light">{n}</span>}
                    </span>
                    <Icon path={ICONS.chevronDown} className={`h-3.5 w-3.5 transition-transform ${open ? '' : '-rotate-90'}`} />
                  </button>
                  {open && (
                    <div className="mt-0.5 space-y-0.5 pl-1.5">
                      {g.slots.map(({ slot, label }) => (
                        <button
                          key={slot}
                          onClick={() => {
                            setActive(slot);
                            setQuery('');
                          }}
                          className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                            active === slot ? 'bg-primary text-white' : 'text-neutral-300 hover:bg-surface-2'
                          }`}
                        >
                          <span>{label}</span>
                          {gearPatch[slot] && <span className={`h-1.5 w-1.5 rounded-full ${active === slot ? 'bg-white' : 'bg-primary'}`} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Gear grid */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-border p-3">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500">
                  <Icon path={ICONS.search} className="h-4 w-4" />
                </span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${activeLabel.toLowerCase()}…`}
                  className="w-full rounded-md border border-border bg-surface-0 py-1.5 pl-8 pr-3 text-sm text-neutral-200 placeholder:text-neutral-500 focus:border-primary focus:outline-none"
                />
              </div>
              {MIRROR[active] && (
                <button
                  onClick={() => onGearEdit(MIRROR[active], gearPatch[active] ?? '')}
                  title={`Copy this pick to ${ALL_SLOTS.find((s) => s.slot === MIRROR[active])?.label}`}
                  className="shrink-0 whitespace-nowrap rounded-md border border-border-strong bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:bg-surface-3"
                >
                  Copy → {ALL_SLOTS.find((s) => s.slot === MIRROR[active])?.label}
                </button>
              )}
            </div>
            <div className="grid flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2 overflow-auto p-3">
              <button
                onClick={() => onGearEdit(active, '')}
                className={`flex flex-col items-center gap-1 rounded-lg border p-2 transition-colors ${
                  current === '' ? 'border-primary bg-primary/10' : 'border-border hover:border-border-strong hover:bg-surface-2'
                }`}
              >
                <span className="grid h-14 w-14 place-items-center rounded text-[10px] font-semibold uppercase text-neutral-500">Auto</span>
                <span className="line-clamp-2 text-center text-[10px] leading-tight text-neutral-400">Era default</span>
              </button>
              {filtered.map((o) => (
                <button
                  key={o.value}
                  onClick={() => onGearEdit(active, o.value)}
                  title={o.label}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-2 transition-colors ${
                    current === o.value ? 'border-primary bg-primary/10' : 'border-border hover:border-border-strong hover:bg-surface-2'
                  }`}
                >
                  <GearThumb src={o.image} />
                  <span className="line-clamp-2 text-center text-[10px] leading-tight text-neutral-300">{o.label}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="col-span-full py-10 text-center text-xs text-neutral-600">No gear matches “{query}”.</div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border px-5 py-2.5 text-[11px] text-neutral-500">
          <span>Picks are written when you save. Old-era draft classes also get a period-correct facemask automatically (Riddell TK two-bar) — override it here.</span>
          <button onClick={onClose} className="rounded-md bg-surface-2 px-3 py-1.5 font-medium text-neutral-200 hover:bg-surface-3">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
