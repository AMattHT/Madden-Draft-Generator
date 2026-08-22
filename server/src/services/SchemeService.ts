import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../config/paths';

/**
 * Base defensive front (3-4 vs 4-3) by franchise and season, from
 * data/lookups/defensive-schemes.json. Madden has no "OLB": a 3-4 outside
 * linebacker is an edge (LEDG/REDG) while a 4-3 outside linebacker is off-ball
 * (SAM/WILL) — so the drafting team's scheme is the decisive signal for
 * LB-labeled players from eras with no sack / PFF data.
 *
 * Only 3-4 eras are listed in the file; everything else is a 4-3, and nothing
 * before FIRST_THREE_FOUR_SEASON is a 3-4 regardless of the file.
 */
export type Scheme = '3-4' | '4-3';

interface Era {
  franchise: string;
  from: number;
  to: number | null;
  scheme: Scheme;
}

const FIRST_THREE_FOUR_SEASON = 1972; // Dolphins' "53 defense"

// Team code (nflverse draft_picks season-contemporary codes AND nflverse players.csv
// current-franchise codes) -> PFR franchise id. Codes reused by two franchises
// (BAL, HOU, STL) are split by season in franchiseFor().
const CODE_TO_FRANCHISE: Record<string, string> = {
  ARI: 'crd', PHO: 'crd', // STL (Cardinals, pre-1988) handled by season
  ATL: 'atl',
  BUF: 'buf',
  CAR: 'car',
  CHI: 'chi',
  CIN: 'cin',
  CLE: 'cle',
  IND: 'clt', // BAL (Colts, pre-1996) handled by season
  DAL: 'dal',
  DEN: 'den',
  DET: 'det',
  GNB: 'gnb', GB: 'gnb',
  HTX: 'htx', // HOU (Texans, 2002+) handled by season
  OTI: 'oti', TEN: 'oti', // HOU (Oilers, pre-1997) handled by season
  JAX: 'jax', JAC: 'jax',
  KAN: 'kan', KC: 'kan',
  SDG: 'sdg', LAC: 'sdg', SD: 'sdg',
  RAM: 'ram', LAR: 'ram', LA: 'ram', // STL (Rams, 1995-2015) handled by season
  RAI: 'rai', OAK: 'rai', LVR: 'rai', LV: 'rai',
  MIA: 'mia',
  MIN: 'min',
  NOR: 'nor', NO: 'nor',
  NWE: 'nwe', NE: 'nwe',
  NYG: 'nyg',
  NYJ: 'nyj',
  PHI: 'phi',
  PIT: 'pit',
  RAV: 'rav', // BAL (Ravens, 1996+) handled by season
  SEA: 'sea',
  SFO: 'sfo', SF: 'sfo',
  TAM: 'tam', TB: 'tam',
  WAS: 'was', WSH: 'was',
};

let eras: Era[] | null = null;
function load(): Era[] {
  if (eras) return eras;
  const raw = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'defensive-schemes.json'), 'utf8')) as { eras: Era[] };
  eras = raw.eras.filter((e) => e && e.franchise && Number.isFinite(e.from));
  return eras;
}

export const SchemeService = {
  /** Team code as found in nflverse data -> PFR franchise id, or null if unknown. */
  franchiseFor(code: string | null | undefined, season: number): string | null {
    const c = String(code ?? '').trim().toUpperCase();
    if (!c) return null;
    if (c === 'BAL') return season < 1996 ? 'clt' : 'rav';
    if (c === 'HOU') return season < 1997 ? 'oti' : 'htx';
    if (c === 'STL') return season < 1988 ? 'crd' : 'ram';
    return CODE_TO_FRANCHISE[c] ?? null;
  },

  /** Base defense the franchise ran in `season`: '3-4' | '4-3', or null for an
   *  unknown team code. */
  baseDefense(code: string | null | undefined, season: number): Scheme | null {
    const fr = this.franchiseFor(code, season);
    if (!fr) return null;
    if (season < FIRST_THREE_FOUR_SEASON) return '4-3';
    for (const e of load()) {
      if (e.franchise !== fr) continue;
      if (season >= e.from && (e.to == null || season <= e.to)) return e.scheme;
    }
    return '4-3';
  },

  /** Majority scheme over an inclusive season span (ties -> '3-4', since a team
   *  that switched mid-span usually drafted for the new front). Null for an
   *  unknown code. */
  dominant(code: string | null | undefined, from: number, to: number): Scheme | null {
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    let threeFour = 0;
    let total = 0;
    for (let s = lo; s <= hi; s++) {
      const d = this.baseDefense(code, s);
      if (d == null) return null;
      total++;
      if (d === '3-4') threeFour++;
    }
    if (!total) return null;
    return threeFour * 2 >= total ? '3-4' : '4-3';
  },
};
