import { useEffect, useMemo, useRef, useState } from 'react';
import type { GearOption } from '../types';
import { api, type RealGearPlayer, type RealGearPlayerSummary } from '../api';
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

function GearThumb({ src, size = 'md' }: { src?: string; size?: 'sm' | 'md' }) {
  const [broken, setBroken] = useState(false);
  const dim = size === 'sm' ? 'h-8 w-8' : 'h-14 w-14';
  const icon = size === 'sm' ? 'h-4 w-4' : 'h-6 w-6';
  if (src && !broken) {
    return <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className={`${dim} object-contain`} />;
  }
  return (
    <span className={`grid ${dim} place-items-center text-neutral-600`}>
      <Icon path={ICONS.image} className={icon} />
    </span>
  );
}

/** Slots highlighted in the donor summary line, in display order. */
const DONOR_SUMMARY_SLOTS = [
  'helmet', 'facemask', 'visor', 'towel', 'gloveLeft', 'cleatLeft',
  'socks', 'jerseyStyle', 'wristLeft', 'wristRight', 'elbowLeft', 'shoulderPads',
];

/** "GearHelmet_VicisZero2" -> "Vicis Zero 2" (fallback when the atlas has no label). */
function humanizeAsset(asset: string): string {
  return asset
    .replace(/^(Gear[A-Za-z]*?_|G_|Towel_|ThighPad_|KneePad_|Backplate_|Flakjacket_|Handwarmer(Style)?_|Undershirt_|ArmSleeve_|ElbowGear_|Small_)/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim() || asset;
}

/**
 * "Copy look from a real player" bar: search the extracted real-roster gear DB,
 * preview what a donor wears, apply their whole loadout in one click. Applied
 * slots land in the normal gear patch (and can be tweaked per-slot afterwards).
 */
function DonorBar({
  options,
  onGearEdit,
  year,
  positionId,
  gameVersion,
}: {
  options: Record<string, GearOption[]>;
  onGearEdit: (slot: string, asset: string) => void;
  year: number;
  positionId: number;
  gameVersion: 'm26' | 'm27';
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RealGearPlayerSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [donor, setDonor] = useState<RealGearPlayer | null>(null);
  const [applied, setApplied] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'empty' | 'error'>('idle');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  // asset -> display label, from the catalog the grid already shows.
  const labelOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const opts of Object.values(options)) for (const o of opts) m.set(o.value, o.label);
    return (asset: string) => m.get(asset) ?? humanizeAsset(asset);
  }, [options]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setOpen(false); setStatus('idle'); return; }
    const my = ++seq.current;
    setStatus('loading');
    const t = setTimeout(() => {
      api.gearPlayerSearch(q).then((r) => {
        if (my !== seq.current) return;
        setResults(r);
        setOpen(true);
        setStatus(r.length ? 'idle' : 'empty');
      }).catch(() => {
        if (my !== seq.current) return;
        setResults([]);
        setOpen(true);
        setStatus('error');
      });
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const pickDonor = async (s: RealGearPlayerSummary) => {
    setOpen(false);
    setQuery('');
    setApplied(false);
    try { setDonor(await api.gearPlayer(s.id)); } catch { /* donor fetch failed — leave as-is */ }
  };

  const applyAll = () => {
    if (!donor) return;
    for (const [slot, asset] of Object.entries(donor.gear)) onGearEdit(slot, asset);
    setApplied(true);
  };

  const runPhoto = async (payload: { imageBase64?: string; imageUrl?: string }) => {
    setPhotoBusy(true);
    setPhotoNote(null);
    try {
      const r = await api.gearFromPhoto({ ...payload, year, positionId, gameVersion });
      if (!r.observed.onField || !Object.keys(r.slots).length) {
        setPhotoNote('No helmet/uniform visible — use an on-field shot (like the Bennett/Carter photos), not a studio headshot.');
        return;
      }
      for (const [slot, asset] of Object.entries(r.slots)) onGearEdit(slot, asset);
      const bits = [
        r.observed.gloves === true ? `${r.observed.gloveColor || ''} gloves`.trim() : r.observed.gloves === false ? 'no gloves' : null,
        r.observed.wristband ? 'wristbands' : null,
        r.observed.visor && r.observed.visor !== 'none' ? `${r.observed.visor} visor` : 'no visor',
        r.observed.socks ? `${r.observed.socks} socks` : null,
      ].filter(Boolean);
      setPhotoNote(`Matched ${Object.keys(r.slots).length} slots from the photo${bits.length ? ` (${bits.join(', ')})` : ''}.`);
    } catch (e) {
      setPhotoNote((e as Error).message || 'Photo match failed');
    } finally {
      setPhotoBusy(false);
    }
  };

  const summaryItems = donor
    ? DONOR_SUMMARY_SLOTS.filter((s) => donor.gear[s] && !/(_None|^none$|None$)/i.test(donor.gear[s]))
        .map((s) => `${ALL_SLOTS.find((a) => a.slot === s)?.label ?? s}: ${labelOf(donor.gear[s])}`)
    : [];

  return (
    <div className="border-b border-border px-5 py-2.5">
      <div className="flex items-center gap-2">
        <div className="relative w-72">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500">
            <Icon path={ICONS.search} className="h-4 w-4" />
          </span>
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setDonor(null); setApplied(false); }}
            onFocus={() => (results.length || status === 'empty' || status === 'error') && setOpen(true)}
            placeholder="Search a current Madden player… (Mahomes, Jefferson)"
            className="w-full rounded-md border border-border bg-surface-0 py-1.5 pl-8 pr-3 text-sm text-neutral-200 placeholder:text-neutral-500 focus:border-primary focus:outline-none"
          />
          {open && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-md border border-border-strong bg-surface-1 shadow-xl">
              {status === 'loading' && (
                <div className="px-3 py-2 text-xs text-neutral-500">Searching current roster…</div>
              )}
              {status === 'error' && (
                <div className="px-3 py-2 text-xs text-amber-300">Couldn’t reach the gear database. Is the API on :5174?</div>
              )}
              {status === 'empty' && (
                <div className="px-3 py-2 text-xs leading-relaxed text-neutral-400">
                  No current-roster match for “{query.trim()}”. This copies a <span className="text-neutral-200">living Madden player’s</span> loadout
                  (helmet, mask, gloves, shoes…) — not 1987 names. Try Jefferson, Watt, Parsons.
                </div>
              )}
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => pickDonor(r)}
                  className="flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left text-sm text-neutral-200 hover:bg-surface-2"
                >
                  <span className="font-medium">{r.name}</span>
                  <span className="shrink-0 text-[11px] text-muted">
                    {[r.position, r.team, r.jersey ? `#${r.jersey}` : ''].filter(Boolean).join(' · ')}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        {donor && (
          <>
            <span className="text-xs text-neutral-300">
              <span className="font-semibold text-neutral-100">{donor.name}</span>
              <span className="text-muted"> ({[donor.position, donor.team].filter(Boolean).join(' · ')})</span>
            </span>
            <button
              onClick={applyAll}
              disabled={applied}
              className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                applied
                  ? 'cursor-default bg-primary/15 text-primary-light'
                  : 'bg-primary text-white hover:bg-primary-light'
              }`}
            >
              {applied ? `✓ Copied ${Object.keys(donor.gear).length} slots` : `Copy full look (${Object.keys(donor.gear).length} slots)`}
            </button>
            <button
              onClick={() => { setDonor(null); setApplied(false); }}
              className="rounded-md p-1 text-neutral-500 hover:bg-surface-2 hover:text-neutral-200"
              aria-label="Clear donor"
            >
              <Icon path={ICONS.close} className="h-4 w-4" />
            </button>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => runPhoto({ imageBase64: String(reader.result || '') });
            reader.readAsDataURL(f);
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={photoBusy}
          className="shrink-0 rounded-md border border-border-strong bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-neutral-200 hover:bg-surface-3 disabled:opacity-50"
          title="Upload an on-field photo (helmet + uniform) to match gloves, visor, wristbands, socks"
        >
          {photoBusy ? 'Reading photo…' : 'Match from photo'}
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && photoUrl.trim() && !photoBusy) {
              e.preventDefault();
              runPhoto({ imageUrl: photoUrl.trim() });
            }
          }}
          placeholder="or paste an image URL (Wikipedia, nfl.com, direct .jpg)…"
          className="min-w-0 flex-1 rounded-md border border-border bg-surface-0 px-2.5 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-500 focus:border-primary focus:outline-none"
        />
        <button
          onClick={() => photoUrl.trim() && runPhoto({ imageUrl: photoUrl.trim() })}
          disabled={photoBusy || !photoUrl.trim()}
          className="shrink-0 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary-light disabled:opacity-40"
        >
          Pull URL
        </button>
      </div>
      {donor && summaryItems.length > 0 && (
        <div className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-neutral-500">
          {summaryItems.join(' · ')}
        </div>
      )}
      {photoNote && (
        <div className="mt-1.5 text-[11px] leading-relaxed text-neutral-400">{photoNote}</div>
      )}
    </div>
  );
}

/**
 * Visual equipment builder popup (like the Madden Editor Suite equipment tab):
 * body-area groups on the left (Head / Pads / Arms / Legs & feet / Jersey) that
 * drill into per-slot thumbnail grids on the right. "Era default" clears a slot.
 *
 * Enhanced: M26/M27 aware options, helmet/facemask compatibility filtering + warnings.
 */
export function GearEditor({
  playerName,
  options,
  gearPatch,
  onGearEdit,
  onClose,
  gameVersion = 'm26',
  year,
  positionId,
}: {
  playerName: string;
  options: Record<string, GearOption[]>;
  gearPatch: Record<string, string>;
  onGearEdit: (slot: string, asset: string) => void;
  onClose: () => void;
  gameVersion?: 'm26' | 'm27';
  year: number;
  positionId: number;
}) {
  const [active, setActive] = useState('helmet');
  const [query, setQuery] = useState('');
  const [showIncompatible, setShowIncompatible] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const items = options[active] ?? [];
  const q = query.trim().toLowerCase();

  // Helmet compatibility support (from atlas via backend)
  const currentHelmet = gearPatch['helmet'] || '';
  const helmetOpt = (options['helmet'] ?? []).find((o) => o.value === currentHelmet);
  const helmetCompat = helmetOpt?.compatibility;

  // Compute filtered list with optional compat filtering for facemask
  const filtered = useMemo(() => {
    let list = q ? items.filter((o) => o.label.toLowerCase().includes(q)) : items;

    if (active === 'facemask' && helmetCompat && !showIncompatible) {
      list = list.filter((o) => {
        const c = o.compatibility;
        return !c || c === helmetCompat || c === 'universal';
      });
    }
    return list;
  }, [items, q, active, helmetCompat, showIncompatible]);

  const current = gearPatch[active] ?? '';
  const activeLabel = ALL_SLOTS.find((s) => s.slot === active)?.label ?? '';
  const setCount = (slots: { slot: string }[]) => slots.filter((s) => gearPatch[s.slot]).length;

  // Check current facemask compatibility status
  const currentFacemask = gearPatch['facemask'] || '';
  const facemaskOpt = (options['facemask'] ?? []).find((o) => o.value === currentFacemask);
  const facemaskCompat = facemaskOpt?.compatibility;
  const isFacemaskIncompatible = active === 'facemask' || (helmetCompat && facemaskCompat && facemaskCompat !== helmetCompat && facemaskCompat !== 'universal');

  const compatLabel = helmetCompat ? helmetCompat.replace(/([a-z])([A-Z0-9])/g, '$1 $2').toUpperCase() : null;

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex h-[80vh] w-[900px] max-w-full flex-col overflow-hidden rounded-xl border border-border-strong bg-surface-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <div className="text-sm font-bold tracking-tight text-neutral-100">Equipment Builder</div>
            <div className="text-[11px] text-muted">{playerName} {gameVersion === 'm27' && <span className="ml-1 rounded bg-legend/20 px-1 text-[9px] text-legend-light">M27</span>}</div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-neutral-500 hover:bg-surface-2 hover:text-neutral-200" aria-label="Close">
            <Icon path={ICONS.close} className="h-5 w-5" />
          </button>
        </div>

        <DonorBar options={options} onGearEdit={onGearEdit} year={year} positionId={positionId} gameVersion={gameVersion} />

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

              {/* Helmet family + compat status */}
              {active === 'facemask' && helmetCompat && (
                <div className="shrink-0 rounded-md border border-border-strong bg-surface-2 px-2 py-1 text-[10px] text-neutral-300">
                  Helmet family: <span className="font-semibold text-neutral-100">{compatLabel}</span>
                  {!showIncompatible && <span className="ml-1 text-primary-light">(compatible only)</span>}
                </div>
              )}

              {MIRROR[active] && (
                <button
                  onClick={() => onGearEdit(MIRROR[active], gearPatch[active] ?? '')}
                  title={`Copy this pick to ${ALL_SLOTS.find((s) => s.slot === MIRROR[active])?.label}`}
                  className="shrink-0 whitespace-nowrap rounded-md border border-border-strong bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:bg-surface-3"
                >
                  Copy → {ALL_SLOTS.find((s) => s.slot === MIRROR[active])?.label}
                </button>
              )}

              {active === 'facemask' && helmetCompat && (
                <button
                  onClick={() => setShowIncompatible(!showIncompatible)}
                  className={`shrink-0 rounded-md px-2 py-1 text-[10px] transition-colors ${showIncompatible ? 'bg-amber-500/20 text-amber-300' : 'bg-surface-2 text-neutral-300 hover:text-neutral-100'}`}
                  title="Toggle showing facemasks that may not match the current helmet"
                >
                  {showIncompatible ? 'Showing all' : 'Compat only'}
                </button>
              )}
            </div>

            {/* Incompatibility warning */}
            {isFacemaskIncompatible && currentFacemask && (
              <div className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-300">
                Current facemask may be incompatible with the selected helmet (family: {compatLabel || 'unknown'}).
                The game may override or clip the look.
              </div>
            )}

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
                  title={o.label + (o.compatibility ? ` (compat: ${o.compatibility})` : '')}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-2 transition-colors ${
                    current === o.value ? 'border-primary bg-primary/10' : 'border-border hover:border-border-strong hover:bg-surface-2'
                  }`}
                >
                  <GearThumb src={o.image} />
                  <span className="line-clamp-2 text-center text-[10px] leading-tight text-neutral-300">{o.label}</span>
                  {o.compatibility && active === 'facemask' && (
                    <span className="text-[8px] text-neutral-500">{o.compatibility}</span>
                  )}
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="col-span-full py-10 text-center text-xs text-neutral-500">No gear matches “{query}”.</div>
              )}
            </div>
          </div>
        </div>

        {/* "Wearing" strip: every overridden slot as a clickable thumb + reset all. */}
        {Object.keys(gearPatch).length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto border-t border-border px-3 py-2">
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
              Wearing ({Object.keys(gearPatch).length})
            </span>
            {Object.entries(gearPatch).map(([slot, asset]) => {
              const opt = (options[slot] ?? []).find((o) => o.value === asset);
              const slotLabel = ALL_SLOTS.find((s) => s.slot === slot)?.label ?? slot;
              const isCurrentHelmet = slot === 'helmet' && helmetCompat;
              return (
                <button
                  key={slot}
                  onClick={() => setActive(slot)}
                  title={`${slotLabel}: ${opt?.label ?? asset}${isCurrentHelmet ? ` (family: ${compatLabel})` : ''}`}
                  className={`flex shrink-0 flex-col items-center gap-0.5 rounded-md border p-1 transition-colors ${
                    active === slot ? 'border-primary bg-primary/10' : 'border-border hover:border-border-strong hover:bg-surface-2'
                  }`}
                >
                  <GearThumb src={opt?.image} size="sm" />
                  <span className="max-w-14 truncate text-[9px] text-neutral-400">{slotLabel}</span>
                </button>
              );
            })}
            <button
              onClick={() => {
                for (const slot of Object.keys(gearPatch)) onGearEdit(slot, '');
              }}
              className="ml-auto shrink-0 rounded-md border border-border-strong px-2.5 py-1 text-[10px] font-medium text-neutral-300 transition-colors hover:bg-surface-2"
              title="Clear every override — back to era-appropriate gear"
            >
              Reset all to era default
            </button>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border px-5 py-2.5 text-[11px] text-neutral-500">
          <span>
            Picks are written when you save. 
            {gameVersion === 'm27' 
              ? ' M27 uses a verified subset of gear assets.' 
              : ' Old-era classes get a period-correct facemask (Riddell TK two-bar) automatically.'} 
            Override here.
          </span>
          <button onClick={onClose} className="rounded-md bg-surface-2 px-3 py-1.5 font-medium text-neutral-200 hover:bg-surface-3">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
