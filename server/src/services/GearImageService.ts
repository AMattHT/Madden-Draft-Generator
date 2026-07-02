import fs from 'fs';
import path from 'path';
import { SERVER_ROOT } from '../config/paths';

/**
 * Serves gear thumbnail PNGs for the visual equipment builder. The Madden Editor
 * Suite ships one PNG per gear item under gear-sprites/, indexed by gear-atlas.json
 * ({ <slot>: [{ value, label, image }] }). We read them in place (335MB, not
 * duplicated). If the Suite data dir is absent, gear images are simply unavailable.
 */

function resolveDataDir(): string | null {
  const candidates = [
    process.env.MADDEN_EDITOR_DATA_DIR,
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
}

let valueToImage: Map<string, string> | null = null;
let catalog: Record<string, GearCatalogItem[]> | null = null;

function load(): boolean {
  if (valueToImage) return true;
  if (!DATA_DIR) return false;
  const atlas = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'gear-atlas.json'), 'utf8')) as Record<
    string,
    Array<{ value?: string; label?: string; image?: string | null }>
  >;
  valueToImage = new Map();
  catalog = {};
  for (const [category, items] of Object.entries(atlas)) {
    if (!Array.isArray(items)) continue;
    const list: GearCatalogItem[] = [];
    for (const it of items) {
      if (!it.value) continue;
      if (it.image) valueToImage.set(it.value, it.image);
      list.push({ value: it.value, label: it.label || it.value, image: it.image ? `/api/gear-image/${it.value}` : undefined });
    }
    catalog[category] = list;
  }
  return true;
}

/** The sprite filename for an asset: the atlas image, else `<value>.png` (many
 *  assets — e.g. Gear_Socks_High — have a same-named sprite not in the atlas). */
function spriteFile(value: string): string {
  return valueToImage!.get(value) ?? `${value}.png`;
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

  /** Whether a gear asset has a thumbnail available (atlas or a same-named sprite). */
  has(value: string): boolean {
    if (!load()) return false;
    return fs.existsSync(path.join(SPRITES_DIR, path.basename(spriteFile(value))));
  },

  /** Absolute path to the gear thumbnail PNG for an asset value, or null. */
  filePath(value: string): string | null {
    if (!load()) return null;
    // Guard against traversal: only serve a plain filename inside gear-sprites.
    const p = path.join(SPRITES_DIR, path.basename(spriteFile(value)));
    return fs.existsSync(p) ? p : null;
  },
};
