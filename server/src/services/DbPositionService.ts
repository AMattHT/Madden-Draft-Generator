import fs from 'fs';
import path from 'path';
import { CACHE_DIR } from '../config/paths';
import { parseCsvFile } from '../util/csv';

/**
 * Authoritative Strong- vs Free-safety (and corner) designation, from nflverse
 * depth charts — the only nflverse source that actually distinguishes SS/FS
 * (players.csv only has generic "S"). We aggregate every weekly depth-chart entry
 * per player across all seasons and take their most-common DB slot.
 *
 * Depth charts exist from 2001 on, so this only refines players who appeared on
 * one; older/fringe players fall back to the roster-position logic in TeamService.
 *
 * Building downloads ~25 yearly CSVs, so it runs LAZILY IN THE BACKGROUND: get()
 * returns undefined until the aggregated map (cached as a small JSON) is ready.
 */

export type DbPos = 'SS' | 'FS' | 'CB';
const DB_SLOTS = new Set(['SS', 'FS', 'CB']);
const FIRST_YEAR = 2001;
const LAST_YEAR = 2026; // fetched years past the latest available simply 404 and are skipped

const RESULT_CACHE = path.join(CACHE_DIR, 'nflverse_db_positions.json');
const yearCache = (y: number) => path.join(CACHE_DIR, `nflverse_depth_charts_${y}.csv`);
const depthUrl = (y: number) =>
  `https://github.com/nflverse/nflverse-data/releases/download/depth_charts/depth_charts_${y}.csv`;

interface RawDepth {
  gsis_id: string;
  position: string;
}

let map: Map<string, DbPos> | null = null;
let building = false;

function loadFromDisk(): boolean {
  if (!fs.existsSync(RESULT_CACHE)) return false;
  try {
    const obj = JSON.parse(fs.readFileSync(RESULT_CACHE, 'utf8')) as Record<string, DbPos>;
    map = new Map(Object.entries(obj));
    return true;
  } catch {
    return false;
  }
}

async function fetchYear(year: number): Promise<RawDepth[] | null> {
  const file = yearCache(year);
  if (!fs.existsSync(file)) {
    const res = await fetch(depthUrl(year), {
      headers: { 'User-Agent': 'MaddenDraftClassGenerator/0.1 (personal modding tool)' },
    });
    if (res.status === 404) return null; // season not published yet
    if (!res.ok) throw new Error(`depth_charts ${year}: HTTP ${res.status}`);
    const text = await res.text();
    if (text.length < 1000) return null; // guard against throttled/partial replies
    fs.writeFileSync(file, text);
  }
  return parseCsvFile<RawDepth>(file);
}

async function build(): Promise<void> {
  // gsis -> tally of DB slots seen across all weeks/seasons.
  const tally = new Map<string, Record<DbPos, number>>();
  for (let year = FIRST_YEAR; year <= LAST_YEAR; year++) {
    const rows = await fetchYear(year);
    if (!rows) continue;
    for (const row of rows) {
      const gsis = (row.gsis_id || '').trim();
      const pos = (row.position || '').trim().toUpperCase() as DbPos;
      if (!gsis || !DB_SLOTS.has(pos)) continue;
      const t = tally.get(gsis) ?? { SS: 0, FS: 0, CB: 0 };
      t[pos]++;
      tally.set(gsis, t);
    }
  }
  const result = new Map<string, DbPos>();
  for (const [gsis, t] of tally) {
    const best = (Object.keys(t) as DbPos[]).reduce((a, b) => (t[b] > t[a] ? b : a));
    result.set(gsis, best);
  }
  fs.writeFileSync(RESULT_CACHE, JSON.stringify(Object.fromEntries(result)));
  map = result;
}

export const DbPositionService = {
  /**
   * Depth-chart SS/FS/CB for a player, or undefined if not yet built or not
   * covered. Kicks off the (cached, background) build on first use.
   */
  get(gsis: string | undefined): DbPos | undefined {
    if (!gsis) return undefined;
    if (!map) {
      if (!loadFromDisk() && !building) {
        building = true;
        build()
          .catch(() => {}) // stay on the fallback path on failure
          .finally(() => {
            building = false;
          });
      }
      return undefined;
    }
    return map.get(gsis);
  },
};
