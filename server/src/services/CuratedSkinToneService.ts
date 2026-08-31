import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../config/paths';
import { normalizeName } from '../util/csv';

/**
 * Recorded skin tone for players the inference cannot reach.
 *
 * Two thirds of the database (20,945 of 32,038) has no tone evidence at all --
 * no in-game portrait, no Madden-disc headshot, no Wikipedia photo, no usable
 * CSV race column -- so the tone comes from a position/era prior. For an
 * individual that is a coin weighted by his era's demographics, and it is wrong
 * in both directions: the 1964 receiver prior leans light and made Bob Hayes
 * white, the 1964 defensive back prior leans dark and made Paul Krause black.
 *
 * The prior cannot be fixed to catch either without breaking the players it
 * currently gets right, so these are recorded rather than inferred. Scope is
 * Hall of Famers, where the appearance is public record and where a wrong face
 * is most visible.
 *
 * A curated tone wins over every other signal, including a portrait ITA:
 * Krause has a portrait, and it is precisely that measurement -- ITA -31.4 off
 * a dim sepia photograph -- that is wrong.
 */
const FILE = path.join(LOOKUPS_DIR, 'curated-skin-tone.json');

let map: Record<string, number> | null = null;

function load(): Record<string, number> {
  if (map) return map;
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8')) as { tones?: Record<string, number> };
    map = raw.tones ?? {};
  } catch {
    map = {};
  }
  return map;
}

/** Draft year is part of the key: names repeat across eras, and three different
 *  Paul Krauses are in the lookup. */
const key = (first: string, last: string, year: number) =>
  `${normalizeName(first)}|${normalizeName(last)}|${year}`;

export const CuratedSkinToneService = {
  /** Recorded tone (1-7) for this player, or null when he is not curated. */
  toneFor(first: string, last: string, draftYear: number | null | undefined): number | null {
    if (draftYear == null) return null;
    const v = load()[key(first, last, draftYear)];
    return typeof v === 'number' && v >= 1 && v <= 7 ? v : null;
  },

  get size(): number {
    return Object.keys(load()).length;
  },
};
