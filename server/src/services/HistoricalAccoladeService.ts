import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../config/paths';
import { normalizeName } from '../util/csv';

/**
 * First-team All-Pro selections for pre-1960 players, reconstructed from
 * Wikipedia's per-year "All-Pro Team" pages (1936–1967). The source CSV is
 * badly incomplete for this era — e.g. Jim Brown (drafted 1956) has AP1=0/PB=0
 * and Bucko Kilroy has an empty accolade/career row — because PFR only computes
 * Approximate Value from 1960 on. First-team All-Pro is the era's premier honor
 * and IS documented, so it recovers a real career-quality signal for the wAV
 * estimate. See draft-class-wav-estimation memory.
 *
 * File format: compact map of normalizedName -> [firstTeamCount, firstYear, lastYear].
 */
type Entry = [number, number, number];

let map: Record<string, Entry> | null = null;

function load(): Record<string, Entry> {
  if (map) return map;
  try {
    map = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'pre1960_allpro.json'), 'utf8')) as Record<string, Entry>;
  } catch {
    map = {}; // dataset optional — degrade gracefully if absent
  }
  return map;
}

export interface HistoricalAccolade {
  firstTeamAllPro: number;
  firstYear: number;
  lastYear: number;
}

function unpack(e: Entry | undefined): HistoricalAccolade | null {
  return e ? { firstTeamAllPro: e[0], firstYear: e[1], lastYear: e[2] } : null;
}

export const HistoricalAccoladeService = {
  /** First-team All-Pro record for a player, matched by normalized name, or null. */
  get(firstName: string, lastName: string): HistoricalAccolade | null {
    return unpack(load()[normalizeName(`${firstName} ${lastName}`)]);
  },

  /** As `get`, but keyed by an already-normalized name. */
  getByKey(normalizedName: string): HistoricalAccolade | null {
    return unpack(load()[normalizedName]);
  },
};
