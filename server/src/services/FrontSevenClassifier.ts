import type { Scheme } from './SchemeService';

/**
 * Pure edge-vs-off-ball classifier for linebacker-labeled players.
 *
 * Madden has no "OLB": a 3-4 outside linebacker is an edge rusher (LEDG/REDG)
 * while a 4-3 outside linebacker is an off-ball SAM/WILL. The source data
 * lumps nearly every linebacker into "MLB", so we decide from career signals:
 *
 *   1. PFF position (modern players) — authoritative.
 *   2. Career sacks per starting season: >= 6/yr is an edge in any scheme.
 *   3. The drafting team's base front: a 3-4 team's LB with >= 3 sacks/yr is
 *      a 3-4 OLB (edge); with fewer he is an inside backer (MIKE). A 4-3
 *      team's LB with 4.5-6/yr is a blitzing strongside backer (SAM).
 *   4. Interceptions: >= 1/yr on a <= 240-lb frame is a coverage WILL.
 *   5. nflverse position text (OLB/ILB/MLB exist for 1970s players).
 *
 * Nothing drafted before 1972 can be an edge — no 3-4 existed. Returns a
 * null role when there is no usable signal so the class-level build split
 * (DraftClassBuilder.balanceLbByBuild) decides.
 */
export type FrontSevenRole = 'EDGE' | 'MIKE' | 'SAM' | 'WILL';

export interface FrontSevenInput {
  label: string; // source position label (MLB / OLB / LB ...)
  draftYear: number;
  sacks: number | null; // career sacks (nflverse draft_picks def_sacks)
  ints: number | null; // career interceptions (def_ints)
  seasonsStarted: number | null;
  games: number | null;
  scheme: Scheme | null; // drafting team's dominant base front over the early career
  weight: number | null;
  pffPosition: string | null; // 'ED' | 'LB' | ... (nflverse players pff_position)
  nvPosition: string | null; // nflverse players position (OLB / ILB / MLB / LB ...)
}

export interface FrontSevenVerdict {
  role: FrontSevenRole | null;
  /** Short machine-readable reason (shown in the UI and the audit report). */
  reason: 'pff' | 'sacks' | 'sacks (no scheme)' | '3-4 olb' | '3-4 ilb' | '3-4 build' | '4-3 blitzer' | 'coverage' | 'nflverse' | 'none';
  /** True when the verdict should pin the role (the build-based SAM/MIKE/WILL
   *  balancing must not reshuffle it). */
  lock: boolean;
}

const FIRST_THREE_FOUR_SEASON = 1972;
const MIN_SEASONS_FOR_RATE = 3;
const EDGE_SACK_RATE = 6.0; // any scheme
const THREE_FOUR_OLB_SACK_RATE = 3.0; // on a 3-4 team
const BLITZER_SACK_RATE = 4.5; // on a 4-3 / unknown team
const COVERAGE_INT_RATE = 1.0;
const COVERAGE_MAX_WEIGHT = 240;
const EDGE_BUILD_MIN_WEIGHT = 245;

function verdict(role: FrontSevenRole | null, reason: FrontSevenVerdict['reason'], lock: boolean): FrontSevenVerdict {
  return { role, reason, lock };
}

/** Starting seasons, falling back to games/16 when seasons_started is blank. */
function seasonsOf(input: FrontSevenInput): number | null {
  if (input.seasonsStarted != null && input.seasonsStarted >= 1) return input.seasonsStarted;
  if (input.games != null && input.games > 0) return input.games / 16;
  return null;
}

export function classifyFrontSeven(input: FrontSevenInput): FrontSevenVerdict {
  const pff = (input.pffPosition ?? '').trim().toUpperCase();
  if (pff === 'ED') return verdict('EDGE', 'pff', true);
  const pffOffBall = pff === 'LB';

  const seasons = seasonsOf(input);
  const enough = seasons != null && seasons >= MIN_SEASONS_FOR_RATE;
  const sackRate = enough && input.sacks != null ? input.sacks / (seasons as number) : null;
  const intRate = enough && input.ints != null ? input.ints / (seasons as number) : null;
  const nv = (input.nvPosition ?? '').trim().toUpperCase();
  const canEdge = input.draftYear >= FIRST_THREE_FOUR_SEASON && !pffOffBall;

  if (canEdge && sackRate != null && sackRate >= EDGE_SACK_RATE) return verdict('EDGE', 'sacks', true);

  if (input.scheme === '3-4' && canEdge) {
    if (sackRate != null) {
      return sackRate >= THREE_FOUR_OLB_SACK_RATE ? verdict('EDGE', '3-4 olb', true) : verdict('MIKE', '3-4 ilb', true);
    }
    if (nv === 'OLB') return verdict('EDGE', '3-4 olb', true);
    if (nv === 'ILB' || nv === 'MLB') return verdict('MIKE', '3-4 ilb', true);
    if (input.weight != null && input.weight >= EDGE_BUILD_MIN_WEIGHT) return verdict('EDGE', '3-4 build', false);
  }

  if (canEdge && sackRate != null && sackRate >= BLITZER_SACK_RATE) {
    if (input.scheme === '4-3') return verdict('SAM', '4-3 blitzer', true);
    if (input.scheme == null && (input.ints ?? 0) <= 4) return verdict('EDGE', 'sacks (no scheme)', true);
  }
  if (!canEdge && input.draftYear < FIRST_THREE_FOUR_SEASON && sackRate != null && sackRate >= BLITZER_SACK_RATE) {
    return verdict('SAM', '4-3 blitzer', true);
  }

  // Off-ball sub-role.
  if (intRate != null && intRate >= COVERAGE_INT_RATE && (input.weight == null || input.weight <= COVERAGE_MAX_WEIGHT)) {
    return verdict('WILL', 'coverage', true);
  }
  if (nv === 'MLB' || nv === 'ILB') return verdict('MIKE', 'nflverse', true);

  return verdict(null, 'none', false);
}
