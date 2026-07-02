import path from 'path';
import { CACHE_DIR } from '../config/paths';
import { parseCsvFile, normalizeName } from '../util/csv';

/**
 * nflverse players.csv position by player name. The ALL_PLAYER_LOOKUP source dumps
 * the vast majority of linebackers into a generic "MLB" bucket (~2700 rows), which
 * hides ~350 edge rushers — DeMarcus Ware, Lawrence Taylor, Von Miller, Khalil Mack
 * all read "MLB" there but "OLB" in nflverse. This service surfaces nflverse's more
 * specific front-seven position so those get reclassified to edge (LEDG/REDG) via
 * PositionMapper. Empty/no-op if the nflverse cache isn't present (offline).
 */
let byName: Map<string, string> | null = null;

function load(): void {
  if (byName) return;
  byName = new Map();
  try {
    const rows = parseCsvFile<Record<string, string>>(path.join(CACHE_DIR, 'nflverse_players.csv'));
    for (const r of rows) {
      const k = normalizeName(r.display_name);
      const pos = (r.position || '').trim();
      if (k && pos && !byName.has(k)) byName.set(k, pos);
    }
  } catch {
    /* nflverse cache absent (fresh clone / offline) — correction just no-ops */
  }
}

// Front-seven defensive positions we trust to override the generic "LB" bucket.
// (Restricting to these avoids a same-name collision flipping a linebacker to RB/WR.)
const FRONT_SEVEN = new Set(['OLB', 'ILB', 'LB', 'MLB', 'DE', 'DT', 'EDGE', 'NT', 'DL']);

export const RosterPositionService = {
  /** nflverse front-seven position for a player (by name), else null. */
  frontSeven(first: string | null | undefined, last: string | null | undefined): string | null {
    load();
    const p = byName!.get(normalizeName(`${first ?? ''} ${last ?? ''}`));
    return p && FRONT_SEVEN.has(p.toUpperCase()) ? p : null;
  },
};
