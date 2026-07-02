import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { SERVER_ROOT, LOOKUPS_DIR } from '../config/paths';
import { parseCsvFile } from '../util/csv';

/**
 * Serves the real Madden menu PORTRAITS (the art shown in-game), not real photos.
 * Portraits live in the Madden Editor Suite's sprite atlas: portrait-atlas.json
 * maps each `plpo_*` portrait to a sheet + x/y, and portraits-sheet-N.png holds a
 * 10x10 grid of 256x256 portraits. We resolve a player's PID -> plpo (via
 * PID_Portrait_Mapping.csv) -> atlas coords, and crop the 256x256 cell with sharp.
 *
 * Generics (players with no real face) get a skin-tone-matched generic portrait
 * (plpo_generic_<tone>_...), the same way Madden shows draft-class prospects.
 *
 * The 259MB sprite sheets are read in place from the Editor Suite install (not
 * duplicated). If that data dir isn't found, portraits are simply unavailable and
 * the UI falls back gracefully.
 */

interface AtlasEntry {
  sheet: number;
  x: number;
  y: number;
  width: number;
  height: number;
  category: string;
}

// Editor Suite data dir: env override, else the sibling install's unpacked data.
function resolveDataDir(): string | null {
  const candidates = [
    process.env.MADDEN_EDITOR_DATA_DIR,
    path.resolve(SERVER_ROOT, '..', '..', 'Madden Editor Suite', 'resources', 'app', '.vite', 'build', 'data'),
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'portrait-atlas.json')) && fs.existsSync(path.join(c, 'portrait-sprites'))) {
      return c;
    }
  }
  return null;
}

const DATA_DIR = resolveDataDir();
const SPRITES_DIR = DATA_DIR ? path.join(DATA_DIR, 'portrait-sprites') : '';

let byPlpo: Map<string, AtlasEntry> | null = null;
let pidToPlpo: Map<number, string> | null = null;
let genericByTone: Map<number, string[]> | null = null;
const cropCache = new Map<string, Buffer>(); // plpo -> cropped 256 PNG

/** FNV-1a for deterministic, reproducible generic selection. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function load(): boolean {
  if (byPlpo) return true;
  if (!DATA_DIR) return false;
  const atlas = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'portrait-atlas.json'), 'utf8')) as {
    portraits: Array<{ filename: string; category: string; sheet: number; x: number; y: number; width: number; height: number }>;
  };
  byPlpo = new Map();
  genericByTone = new Map();
  for (const p of atlas.portraits) {
    const key = p.filename.replace(/\.png$/i, '');
    byPlpo.set(key, { sheet: p.sheet, x: p.x, y: p.y, width: p.width, height: p.height, category: p.category });
    if (p.category === 'generic') {
      const m = /^plpo_generic_(\d+)_/.exec(key);
      const tone = m ? parseInt(m[1], 10) : 0;
      if (!genericByTone.has(tone)) genericByTone.set(tone, []);
      genericByTone.get(tone)!.push(key);
    }
  }
  for (const list of genericByTone.values()) list.sort(); // stable order for deterministic picks

  pidToPlpo = new Map();
  const rows = parseCsvFile<Record<string, string>>(path.join(LOOKUPS_DIR, 'PID_Portrait_Mapping.csv'));
  for (const r of rows) {
    const pid = parseInt(r['PID'], 10);
    const plpo = (r['Portrait'] || '').trim();
    if (!Number.isNaN(pid) && plpo) pidToPlpo.set(pid, plpo);
  }
  return true;
}

/** Pick a skin-tone-matched generic portrait deterministically. */
function genericFor(race: number | null, seed: string): string | null {
  const tone = race && race >= 1 && race <= 7 ? race : 4;
  let pool = genericByTone!.get(tone);
  for (let d = 1; d <= 7 && (!pool || !pool.length); d++) {
    pool = genericByTone!.get(tone - d) || genericByTone!.get(tone + d);
  }
  if (!pool || !pool.length) pool = [...genericByTone!.values()].find((l) => l.length);
  return pool && pool.length ? pool[hash(seed) % pool.length] : null;
}

export const PortraitService = {
  get available(): boolean {
    return load();
  },

  /** The plpo portrait a prospect should display: real portrait by PID, else a
   *  skin-tone-matched generic. Returns null if portraits are unavailable. */
  plpoFor(pid: number, race: number | null, seed: string): string | null {
    if (!load()) return null;
    if (pid > 0) {
      const plpo = pidToPlpo!.get(pid);
      if (plpo && plpo !== 'plpo_Blank' && byPlpo!.has(plpo)) return plpo;
    }
    return genericFor(race, seed);
  },

  /** Crop and cache the 256x256 portrait PNG for a plpo, or null if unknown. */
  async cropByPlpo(plpo: string): Promise<Buffer | null> {
    if (!load()) return null;
    const cached = cropCache.get(plpo);
    if (cached) return cached;
    const e = byPlpo!.get(plpo);
    if (!e) return null;
    const sheet = path.join(SPRITES_DIR, `portraits-sheet-${e.sheet}.png`);
    if (!fs.existsSync(sheet)) return null;
    const buf = await sharp(sheet)
      .extract({ left: e.x, top: e.y, width: e.width, height: e.height })
      .png()
      .toBuffer();
    cropCache.set(plpo, buf);
    return buf;
  },
};
