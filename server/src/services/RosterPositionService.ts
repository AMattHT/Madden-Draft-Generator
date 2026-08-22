import path from 'path';
import { CACHE_DIR } from '../config/paths';
import { parseCsvFile, normalizeName } from '../util/csv';

/**
 * Reclassifies the generic "MLB" linebacker bucket in ALL_PLAYER_LOOKUP (~2700 rows)
 * using nflverse, distinguishing EDGE rushers from OFF-BALL linebackers — which the
 * plain "OLB" label conflates. nflverse `position=OLB` covers both DeMarcus Ware /
 * Von Miller (3-4 edge) AND Lavonte David / K.J. Wright (4-3 off-ball SAM/WILL). The
 * clean discriminator is **pff_position** (ED = edge, LB = off-ball); ngs_position and
 * position are fallbacks. Returns a Madden-friendly label:
 *   'DE'  -> edge   (LEDG/REDG)
 *   'DT'  -> interior DL
 *   'MLB' -> off-ball middle (Mike)
 *   'OLB' -> off-ball outside (SAM)  [pff=LB / ambiguous OLB stays off-ball]
 *   null  -> not a front-seven player (name collision) — keep the source label
 * No-op if the nflverse cache isn't present (offline).
 */
interface NvRow {
  display_name?: string;
  position?: string;
  pff_position?: string;
  ngs_position?: string;
}

let byName: Map<string, NvRow> | null = null;

function load(): void {
  if (byName) return;
  byName = new Map();
  try {
    const rows = parseCsvFile<NvRow>(path.join(CACHE_DIR, 'nflverse_players.csv'));
    for (const r of rows) {
      const k = normalizeName(r.display_name);
      if (k && !byName.has(k)) byName.set(k, r);
    }
  } catch {
    /* nflverse cache absent (fresh clone / offline) — correction just no-ops */
  }
}

export interface RosterPositionRaw {
  position: string; // nflverse position (OLB / ILB / MLB / LB / DE / DT ...)
  pffPosition: string; // 'ED' / 'LB' / '' (PFF era only)
  ngsPosition: string;
}

export const RosterPositionService = {
  /** Raw nflverse position fields for a player (by name), or null when absent. */
  raw(first: string | null | undefined, last: string | null | undefined): RosterPositionRaw | null {
    load();
    const r = byName!.get(normalizeName(`${first ?? ''} ${last ?? ''}`));
    if (!r) return null;
    return {
      position: (r.position || '').toUpperCase(),
      pffPosition: (r.pff_position || '').toUpperCase(),
      ngsPosition: (r.ngs_position || '').toUpperCase(),
    };
  },

  /** Edge-vs-off-ball-aware front-seven label for a player (by name), else null. */
  frontSeven(first: string | null | undefined, last: string | null | undefined): string | null {
    load();
    const r = byName!.get(normalizeName(`${first ?? ''} ${last ?? ''}`));
    if (!r) return null;
    const pos = (r.position || '').toUpperCase();
    const pff = (r.pff_position || '').toUpperCase();
    const ngs = (r.ngs_position || '').toUpperCase();

    // Edge: pff_position wins; otherwise a DE listing or an EDGE ngs tag (but pff=LB
    // vetoes those — an off-ball LB who blitzes still isn't an edge).
    if (pff === 'ED' || (pff !== 'LB' && (pos === 'DE' || pos === 'LE' || pos === 'RE' || ngs === 'EDGE'))) return 'DE';
    if (pos === 'DT' || pos === 'NT' || pos === 'DL') return 'DT';
    // Off-ball: inside -> Mike, outside/ambiguous OLB -> SAM.
    if (pos === 'ILB' || pos === 'MLB' || pos === 'LB' || ngs === 'MLB' || ngs === 'ILB' || ngs === 'LB') return 'MLB';
    if (pos === 'OLB') return 'OLB';
    return null; // non-front-seven (likely a same-name collision) — don't override
  },
};
