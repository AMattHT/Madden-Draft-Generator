import fs from 'fs';
import path from 'path';
import { DATA_ROOT } from '../config/paths';
import { GearImageService } from './GearImageService';

/**
 * Equipment options for the visual gear builder. When the Madden Editor Suite data
 * is present, options come from its gear-atlas.json — the full catalog with a
 * thumbnail per item, one entry per M26 asset (same set the Suite's equipment tab
 * shows). Falls back to the era-tagged equipment-years.json catalog when the Suite
 * data is absent (dropdown mode).
 *
 * Only loadout-writable slots are offered (their M26 slotType exists in the
 * PlayerOnField loadout). Facemask is intentionally omitted: M26 has no FaceMask
 * loadout slot (the facemask is baked into the helmet asset), so it can't be set
 * as a loadout element.
 *
 * Extended for M26/M27: passes gameVersion to filter options for M27's verified
 * asset vocabulary; attaches helmetCompatibility for UI filtering in GearEditor.
 */

export interface GearOption {
  value: string; // asset name (loadout itemAssetName)
  label: string;
  image?: string; // thumbnail URL, if a sprite exists
  year?: number; // release year (fallback catalog only)
  compatibility?: string; // facemask helmet-family ('universal' | 'f7' | 'speedflex' | …)
}

// slot -> display label, gear-atlas category, M26 slotType(s), and optional
// none/extra/synthetic options. slotType casing matches the M26 template loadout
// (Shoulderpads, LeftSpat, …); Neckpad/JerseyStyle come from the Suite's writer.
interface SlotDef {
  slot: string;
  label: string;
  slotTypes: string[];
  category?: string; // gear-atlas category to pull thumbnails from
  none?: GearOption; // explicit "none" asset (distinct from "era default" = unset)
  extra?: GearOption[]; // assets not present in the atlas
  synthetic?: GearOption[]; // fully manual option list (no atlas category)
}
const SLOTS: SlotDef[] = [
  { slot: 'helmet', label: 'Helmet', category: 'helmets', slotTypes: ['HeadWear'] },
  // Facemask is a SLOTLESS loadout element (itemAssetName GearFaceMask_*, no slotType —
  // verified in the M26 template); applyGearEdits/M26Writer (and M27) handle it by prefix.
  { slot: 'facemask', label: 'Facemask', category: 'facemasks', slotTypes: [] },
  { slot: 'visor', label: 'Visor', category: 'visors', slotTypes: ['Visor'], none: { value: 'GearVisor_None', label: 'No visor' } },
  { slot: 'gloveLeft', label: 'Left glove', category: 'gloves', slotTypes: ['LeftHandWear'], none: { value: 'GearHand_None', label: 'No glove' } },
  { slot: 'gloveRight', label: 'Right glove', category: 'gloves', slotTypes: ['RightHandWear'], none: { value: 'GearHand_None', label: 'No glove' } },
  { slot: 'cleatLeft', label: 'Left cleat', category: 'shoes', slotTypes: ['LeftShoe'] },
  { slot: 'cleatRight', label: 'Right cleat', category: 'shoes', slotTypes: ['RightShoe'] },
  { slot: 'shoulderPads', label: 'Shoulder pads', category: 'shoulderPads', slotTypes: ['Shoulderpads'] },
  {
    slot: 'neckRoll',
    label: 'Neck roll',
    category: 'neckpads',
    slotTypes: ['Neckpad'],
    none: { value: 'GearNeckpad_None', label: 'None' },
    extra: [{ value: 'GearNeckpad_CowboyCollarNeckRoll', label: 'Cowboy Collar Neck Roll' }],
  },
  {
    // M26 stores the jersey sleeve style under the OuterShirt slot (verified in
    // the template: OuterShirt = Gear_JerseyStyle_SleeveTight).
    slot: 'jerseyStyle',
    label: 'Jersey sleeves',
    slotTypes: ['OuterShirt'],
    synthetic: [
      { value: 'Gear_JerseyStyle_SleeveStandard', label: 'Standard sleeves' },
      { value: 'Gear_JerseyStyle_SleeveTight', label: 'Tight sleeves' },
    ],
  },
  {
    slot: 'socks',
    label: 'Socks',
    slotTypes: ['InnerSocks'],
    synthetic: [
      { value: 'Gear_Socks_Low', label: 'Low' },
      { value: 'Gear_Socks_Mid', label: 'Mid' },
      { value: 'Gear_Socks_High', label: 'High' },
      { value: 'Gear_Socks_Under', label: 'Under' },
    ],
  },
  { slot: 'armLeft', label: 'Left arm sleeve', category: 'armSleeves', slotTypes: ['LeftArmWear'] },
  { slot: 'armRight', label: 'Right arm sleeve', category: 'armSleeves', slotTypes: ['RightArmWear'] },
  { slot: 'elbowLeft', label: 'Left elbow', category: 'elbowGear', slotTypes: ['LeftElbowWear'] },
  { slot: 'elbowRight', label: 'Right elbow', category: 'elbowGear', slotTypes: ['RightElbowWear'] },
  { slot: 'wristLeft', label: 'Left wrist', category: 'wristGear', slotTypes: ['LeftWristWear'] },
  { slot: 'wristRight', label: 'Right wrist', category: 'wristGear', slotTypes: ['RightWristWear'] },
  { slot: 'thighLeft', label: 'Left thigh pad', category: 'thighPads', slotTypes: ['LeftThighWear'] },
  { slot: 'thighRight', label: 'Right thigh pad', category: 'thighPads', slotTypes: ['RightThighWear'] },
  { slot: 'kneePads', label: 'Knee pads', category: 'kneePads', slotTypes: ['KneeWear'] },
  { slot: 'spatLeft', label: 'Left spat', category: 'spats', slotTypes: ['LeftSpat'] },
  { slot: 'spatRight', label: 'Right spat', category: 'spats', slotTypes: ['RightSpat'] },
  { slot: 'eyePaint', label: 'Eye black', category: 'eyepaint', slotTypes: ['FacePaint'] },
  { slot: 'towel', label: 'Towel', category: 'towels', slotTypes: ['Towel'] },
  // Extra slots found in real Madden draft files (all verified valid assets).
  { slot: 'mouthpiece', label: 'Mouthpiece', category: 'mouthpieces', slotTypes: ['MouthWear'], none: { value: 'GearMouthpiece_None', label: 'None' } },
  { slot: 'guardianCap', label: 'Guardian cap', category: 'guardianCaps', slotTypes: ['GuardianCap'], none: { value: 'GuardianCap_None', label: 'None' } },
  {
    slot: 'backPlate',
    label: 'Back plate',
    slotTypes: ['BackPlate'],
    synthetic: [
      { value: 'Backplate_None', label: 'None' },
      { value: 'Backplate_Standard', label: 'Standard' },
    ],
  },
  {
    slot: 'flakJacket',
    label: 'Flak jacket',
    slotTypes: ['FlakJacket'],
    synthetic: [
      { value: 'Flakjacket_None', label: 'None' },
      { value: 'Flakjacket_On', label: 'On' },
    ],
  },
  {
    slot: 'undershirt',
    label: 'Undershirt',
    slotTypes: ['InnerShirt'],
    synthetic: [
      { value: 'Undershirt_None', label: 'None' },
      { value: 'Undershirt_Untucked', label: 'Untucked' },
    ],
  },
  {
    slot: 'handwarmer',
    label: 'Handwarmer',
    slotTypes: ['WaistWear'],
    synthetic: [
      { value: 'Handwarmer_None', label: 'None' },
      { value: 'Handwarmer_Standard', label: 'Standard' },
    ],
  },
  {
    slot: 'handwarmerStyle',
    label: 'Handwarmer position',
    slotTypes: ['WaistWearOverride'],
    synthetic: [
      { value: 'HandwarmerStyle_None', label: 'None' },
      { value: 'HandwarmerStyle_Front', label: 'Front' },
      { value: 'HandwarmerStyle_Back', label: 'Back' },
    ],
  },
];

/** Ordered slot list + labels for the UI. */
export const GEAR_SLOTS = SLOTS.map((s) => ({ slot: s.slot, label: s.label }));

/** slot -> M26 loadout slotType(s), used by the export to write gear. */
export const GEAR_SLOT_TYPES: Record<string, string[]> = Object.fromEntries(SLOTS.map((s) => [s.slot, s.slotTypes]));

// ---- Fallback catalog (equipment-years.json), era-filtered ----

interface GearItem {
  displayName?: string;
  releaseYear?: number;
}
interface EraDefault {
  helmet?: string[] | null;
  shoes?: string[] | null;
  gloves?: string[] | null;
  linemanGloves?: string[] | null;
}
interface EquipmentYears {
  helmets: Record<string, GearItem>;
  shoes: Record<string, Record<string, GearItem>>;
  gloves: Record<string, Record<string, GearItem>>;
  eraDefaults: Record<string, EraDefault>;
}

let data: EquipmentYears | null = null;
function loadEq(): EquipmentYears {
  if (!data) data = JSON.parse(fs.readFileSync(path.join(DATA_ROOT, 'equipment-years.json'), 'utf8'));
  return data!;
}

function fromMap(map: Record<string, GearItem>, year: number): GearOption[] {
  return Object.entries(map)
    .filter(([, v]) => (v.releaseYear ?? 0) <= year)
    .map(([value, v]) => ({ value, label: v.displayName || value, year: v.releaseYear }))
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || a.label.localeCompare(b.label));
}
function fromBrands(brands: Record<string, Record<string, GearItem>>, year: number): GearOption[] {
  const flat: Record<string, GearItem> = {};
  for (const brand of Object.values(brands)) Object.assign(flat, brand);
  return fromMap(flat, year);
}
const GLOVE_BASICS: GearOption[] = [
  { value: 'GearHand_None', label: 'No gloves' },
  { value: 'GearHand_tapedHandFinger_White', label: 'Taped fingers (white)' },
  { value: 'GearHand_tapedHandNormal_White', label: 'Taped hand (white)' },
];
const VISORS: GearOption[] = [
  { value: 'GearVisor_None', label: 'No visor' },
  { value: 'GearVisor_visorClear', label: 'Clear visor' },
];
const BRACKET_START: Record<string, number> = {
  '1970-1979': 1970, '1980-1989': 1980, '1990-1999': 1990, '2000-2007': 2000,
  '2008-2013': 2008, '2014-2016': 2014, '2017-2019': 2017, '2020-2022': 2020, '2023-2025': 2023,
};
function humanize(asset: string): string {
  return asset
    .replace(/^Gear[A-Za-z]+_/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || asset;
}
function eraAssets(d: EquipmentYears, year: number, keys: (keyof EraDefault)[]): string[] {
  const out = new Set<string>();
  for (const [bracket, start] of Object.entries(BRACKET_START)) {
    if (start > year) continue;
    const def = d.eraDefaults[bracket];
    if (!def) continue;
    for (const k of keys) for (const a of def[k] ?? []) out.add(a);
  }
  return [...out];
}
function merge(catalog: GearOption[], assets: string[]): GearOption[] {
  const seen = new Set(catalog.map((o) => o.value));
  const extra = assets.filter((a) => !seen.has(a)).map((a) => ({ value: a, label: humanize(a) }));
  return [...extra.sort((a, b) => a.label.localeCompare(b.label)), ...catalog];
}
function withImages(opts: GearOption[]): GearOption[] {
  return opts.map((o) => {
    if (o.image) return o;
    return GearImageService.has(o.value) ? { ...o, image: `/api/gear-image/${o.value}` } : o;
  });
}

let m27ValidCache: Set<string> | null | undefined;
function loadM27Valid(): Set<string> | null {
  if (m27ValidCache !== undefined) return m27ValidCache;
  try {
    const pth = path.join(DATA_ROOT, "lookups", "m27-game-gear-assets.json");
    const raw = JSON.parse(fs.readFileSync(pth, "utf8")) as string[];
    m27ValidCache = new Set(raw);
  } catch {
    m27ValidCache = null;
  }
  return m27ValidCache;
}

export const GearOptionsService = {
  optionsForYear(year: number, gameVersion: "m26" | "m27" = "m26"): Record<string, GearOption[]> {
    const isM27 = gameVersion === "m27";
    const m27Valid = isM27 ? loadM27Valid() : null;

    // Preferred: full visual catalog from the Editor Suite gear atlas.
    if (GearImageService.available) {
      const cats = GearImageService.categories();
      const helmetCompat = GearImageService.helmetCompatibility();

      const out: Record<string, GearOption[]> = {};
      for (const s of SLOTS) {
        let items: GearOption[] = s.synthetic
          ? s.synthetic.map((o) => ({ ...o }))
          : (cats[s.category ?? ""] ?? []).map((it) => {
              const opt: GearOption = { value: it.value, label: it.label, image: it.image, compatibility: it.compatibility };
              if (s.slot === "helmet" && helmetCompat[it.value]) {
                opt.compatibility = helmetCompat[it.value];
              }
              return opt;
            });
        if (s.extra) {
          const seen = new Set(items.map((i) => i.value));
          items = [...s.extra.filter((e) => !seen.has(e.value)), ...items];
        }
        items = withImages(items).sort((a, b) => a.label.localeCompare(b.label));
        if (s.none) items = [{ ...s.none }, ...items];
        if (isM27 && m27Valid) {
          items = items.filter((o) =>
            !o.value ||
            m27Valid.has(o.value) ||
            /_None$|None$|^none$/i.test(o.value) ||
            /none|auto|era default/i.test(o.label || "")
          );
        }
        out[s.slot] = items;
      }
      return out;
    }
// Fallback: era-filtered equipment-years catalog when the Suite data is absent.
    const d = loadEq();
    const gloves = withImages(merge([...GLOVE_BASICS, ...fromBrands(d.gloves, year)], eraAssets(d, year, ['gloves', 'linemanGloves'])));
    const cleats = withImages(merge(fromBrands(d.shoes, year), eraAssets(d, year, ['shoes'])));
    return {
      helmet: withImages(merge(fromMap(d.helmets, year), eraAssets(d, year, ['helmet']))),
      visor: withImages(year < 1990 ? [VISORS[0]] : VISORS),
      gloveLeft: gloves,
      gloveRight: gloves,
      cleatLeft: cleats,
      cleatRight: cleats,
    };
  },
};
