import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../config/paths';
import { normalizeName } from '../util/csv';
import { getDb } from '../db';

/**
 * Skin tone (1-7) DERIVED from a player's Wikipedia photo, for players with NO
 * Madden portrait. Source of truth is the `wiki_skintone` SQLite crawl cache
 * (outcome per player — see scripts/build-wiki-skintone.ts); the committed
 * data/lookups/wiki_skintone.json is a portable fallback for fresh clones that
 * haven't run the crawl. Keyed by "normName|draftYear". Below the real-portrait
 * tone ([[DerivedSkinToneService]]) in the enrichment waterfall.
 */

let map: Record<string, number> | null = null;

function load(): Record<string, number> {
  if (map) return map;
  map = {};
  // Prefer the SQLite crawl cache (freshest, records every crawl's successes).
  try {
    const rows = getDb().prepare("SELECT key, tone FROM wiki_skintone WHERE outcome = 'ok' AND tone IS NOT NULL").all() as { key: string; tone: number }[];
    for (const r of rows) map[r.key] = r.tone;
  } catch {
    /* table absent — fall through to the committed JSON */
  }
  // Fall back to / union with the committed JSON (portable across clones).
  if (Object.keys(map).length === 0) {
    try {
      map = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'wiki_skintone.json'), 'utf8'));
    } catch {
      /* no data yet */
    }
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
