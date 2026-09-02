import fs from 'fs';
import path from 'path';
import { DATA_ROOT, SERVER_ROOT } from '../config/paths';

/**
 * Serves gear thumbnail PNGs for the visual equipment builder. A gear dir holds
 * gear-atlas.json ({ <category>: [{ value, label, image, compatibility? }] })
 * and gear-sprites/<image>.png. The app ships a curated copy under data/gear
 * (built by scripts/import-gear-sprites.ts from a Madden Editor Suite install);
 * MADDEN_EDITOR_DATA_DIR or a sibling Suite install can override it.
 */

function resolveDataDir(): string | null {
  const candidates = [
    process.env.MADDEN_EDITOR_DATA_DIR,
    path.join(DATA_ROOT, 'gear'),
    path.resolve(SERVER_ROOT, '..', '..', 'Madden Editor Suite', 'resources', 'app', '.vite', 'build', 'data'),
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'gear-atlas.json')) && fs.existsSync(path.join(c, 'gear-sprites'))) return c;
  }
  return null;
}

const DATA_DIR = resolveDataDir();
const SPRITES_DIR = DATA_DIR ? path.join(DATA_DIR, 'gear-sprites') : '';

export interface GearCatalogItem {
  value: string;
  label: string;
  image?: string; // thumbnail URL if a sprite exists
  compatibility?: string; // e.g. facemask helmet-family ('universal' | 'f7' | 'speedflex' | …)
}

let valueToImage: Map<string, string> | null = null;
let catalog: Record<string, GearCatalogItem[]> | null = null;
let helmetCompat: Record<string, string> | null = null;
let spriteNames: Set<string> | null = null;

function load(): boolean {
  if (valueToImage) return true;
  if (!DATA_DIR) return false;
  const atlas = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'gear-atlas.json'), 'utf8')) as Record<
    string,
    Array<{ value?: string; label?: string; image?: string | null; compatibility?: string }> | Record<string, string>
  >;
  valueToImage = new Map();
  catalog = {};
  helmetCompat = {};
  for (const [category, items] of Object.entries(atlas)) {
    if (category === 'helmetCompatibility' && items && !Array.isArray(items) && typeof items === 'object') {
      Object.assign(helmetCompat, items as Record<string, string>);
      continue;
    }
    if (!Array.isArray(items)) continue;
    const list: GearCatalogItem[] = [];
    for (const it of items) {
      if (!it.value) continue;
      if (it.image) valueToImage.set(it.value, it.image);
      list.push({ value: it.value, label: it.label || it.value, image: it.image ? `/api/gear-image/${it.value}` : undefined, compatibility: it.compatibility });
    }
    catalog[category] = list;
  }
  return true;
}

function ensureSpriteIndex(): Set<string> {
  if (spriteNames) return spriteNames;
  spriteNames = new Set();
  if (!SPRITES_DIR) return spriteNames;
  try {
    for (const f of fs.readdirSync(SPRITES_DIR)) spriteNames.add(f);
  } catch { /* sprites dir unreadable */ }
  return spriteNames;
}

/** The sprite filename for an asset: the atlas image, else the same-named
 *  nflgear sprite (synthetic slots such as Gear_Socks_High have one). */
function spriteFile(value: string): string | null {
  const atlas = valueToImage!.get(value);
  if (atlas) return path.basename(atlas);
  const index = ensureSpriteIndex();
  for (const f of [`vnty_nflgear_${value}.png`, `${value}.png`]) if (index.has(f)) return f;
  return null;
}

export const GearImageService = {
  get available(): boolean {
    return load();
  },

  /** Full gear catalog grouped by atlas category (helmets, visors, gloves, shoes,
   *  facemasks, armSleeves, …), each item value/label/image — drives the builder. */
  categories(): Record<string, GearCatalogItem[]> {
    return load() ? catalog! : {};
  },

  /** Helmet asset → facemask family (speedflex, f7, universal, …). */
  helmetCompatibility(): Record<string, string> {
    return load() ? helmetCompat! : {};
  },

  /** Whether a gear asset has a thumbnail available (atlas or a same-named sprite). */
  has(value: string): boolean {
    if (!load()) return false;
    const name = spriteFile(value);
    return !!name && ensureSpriteIndex().has(name);
  },

  /** Absolute path to the gear thumbnail PNG for an asset value, or null. */
  filePath(value: string): string | null {
    if (!load()) return null;
    // Guard against traversal: only serve a plain filename inside gear-sprites.
    const name = spriteFile(value);
    if (!name || !ensureSpriteIndex().has(name)) return null;
    return path.join(SPRITES_DIR, name);
  },
};
