import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../config/paths';
import { normalizeName } from '../util/csv';

/**
 * Skin tone (1-7) DERIVED from a player's Wikipedia photo — built offline by
 * scripts/build-wiki-skintone.ts for players who have NO Madden portrait (so they'd
 * otherwise only get a position-weighted guess). Keyed by "normName|draftYear".
 * A best-effort fallback below the real-portrait tone ([[DerivedSkinToneService]]).
 */

let map: Record<string, number> | null = null;
function load(): Record<string, number> {
  if (map) return map;
  try {
    map = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'wiki_skintone.json'), 'utf8'));
  } catch {
    map = {};
  }
  return map!;
}

export const WikiSkinToneService = {
  /** Skin tone (1-7) sampled from the player's Wikipedia photo, or null if none. */
  toneFor(firstName: string, lastName: string, draftYear: number | null | undefined): number | null {
    if (draftYear == null) return null;
    const t = load()[`${normalizeName(`${firstName}${lastName}`)}|${draftYear}`];
    return typeof t === 'number' ? t : null;
  },
  get size(): number {
    return Object.keys(load()).length;
  },
};
