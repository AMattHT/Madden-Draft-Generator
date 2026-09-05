import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../config/paths';
import { normalizeName } from '../util/csv';

/**
 * Recorded equipment for a real player: editor slot -> item asset, kept in
 * data/lookups/curated-gear.json as { "gear": { "melblount|1970": { "helmet": "...", "facemask": "..." } } }
 * by the private player editor. Applied on top of the era loadout when the
 * prospect is built, before any per-class gear edit (which still wins).
 */
const FILE = path.join(LOOKUPS_DIR, 'curated-gear.json');
let cache: Record<string, Record<string, string>> | null = null;

function load(): Record<string, Record<string, string>> {
  if (cache) return cache;
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8')) as { gear?: Record<string, Record<string, string>> };
    cache = raw.gear && typeof raw.gear === 'object' ? raw.gear : {};
  } catch {
    cache = {};
  }
  return cache;
}

export const curatedGearKey = (first: string, last: string, year: number): string =>
  `${normalizeName(first)}|${normalizeName(last)}|${year}`;

export const CuratedGearService = {
  /** Slot -> asset for this player, or null when nothing is recorded. */
  get(first: string, last: string, draftYear: number | null | undefined): Record<string, string> | null {
    if (draftYear == null) return null;
    const g = load()[curatedGearKey(first, last, draftYear)];
    return g && Object.keys(g).length ? g : null;
  },
  get size(): number {
    return Object.keys(load()).length;
  },
  reload(): void {
    cache = null;
  },
};
