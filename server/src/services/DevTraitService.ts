import type { AwardKind } from './AwardsService';

/**
 * Dev traits for players whose careers are still short.
 *
 * The class-wide path ranks on career outcome and hands out Madden's rates from
 * the top. Two seasons of wAV are not an outcome, so a young class was giving its
 * X-Factors to whoever led a thin sample (or, with no wAV at all, to pick 1). The
 * user's rule: X-Factor depends on awards and wAV -- never on a quota or a slot.
 */

export type Tier = 0 | 1 | 2 | 3; // Normal, Star, Superstar, X-Factor

export interface YoungInput {
  key: string;
  posGroup: string;
  draftYear: number;
  careerTo: number | null;
  /** Career wAV when it is real (`wavActual`); null/false when only predicted. */
  wav: number | null;
  wavActual: boolean;
  ap1: number;
  pb: number;
  awards: AwardKind[];
  round: number | null;
  pick: number | null;
  /** Career caliber (40-99) from RatingService, for ordering as careers lengthen. */
  caliber: number;
  /** The builder's elite rule (wAV >= 90 or corroborated Hall of Fame). */
  elite: boolean;
}

/** Top-1% wAV per completed season by position group, 1990-2015 draftees: the
 *  trajectory of a Hall-of-Fame-track career. Pace 1.0 is X-Factor territory; the
 *  top-10% line sits near 0.7. Specialists never reach X-Factor on pace alone. */
export const PACE_NORMS: Record<string, number> = {
  QB: 9.8, RB: 10.3, WR: 7.7, TE: 5.6, OL: 8.3, EDGE: 7.9, IDL: 7.7, LB: 8.5, CB: 7.1, S: 7.1, K: 2.6, P: 2.3, LS: 1.5,
};
const SPECIALISTS = new Set(['K', 'P', 'LS']);

/** Pace that earns X-Factor on its own after three seasons. The norms are career
 *  per-season figures, and a career's first seasons run hot, so 1.0 flags a dozen
 *  third-year starters per class (2019-2023: 6, 9, 10, 12, 13). At 1.35 the same
 *  classes flag A.J. Brown; CeeDee Lamb and Justin Jefferson; Parsons, Sewell,
 *  Chase, St. Brown and Surtain; nobody; Nacua, Anderson and Flowers -- the
 *  trajectories that are X-Factors, and no quota or class-relative cut, so a
 *  class with more of them keeps every one. */
export const ELITE_PACE = 1.35;

/** Players drafted this many completed seasons ago or fewer take this path. */
export const YOUNG_SEASONS = 8;
/** Quotas reach Madden's full shape here; pace stops steering the order here too. */
const MATURE_SEASONS = 6;
const FULL = { xf: 5, ss: 14, star: 90, size: 402 };

/** Completed seasons: the last season he played (or the last finished season if
 *  still active) back to his draft year. 0 for a class drafted this year. */
export function seasonsCompleted(draftYear: number, careerTo: number | null, currentYear: number): number {
  const to = Math.min(careerTo ?? currentYear - 1, currentYear - 1);
  return Math.max(0, to - draftYear + 1);
}

/** wAV per completed season against the position's top-10% norm (1.0 = that pace). */
export function pace(p: YoungInput, currentYear: number): number {
  if (!p.wavActual || p.wav == null) return 0;
  const s = Math.max(1, seasonsCompleted(p.draftYear, p.careerTo, currentYear));
  return p.wav / s / (PACE_NORMS[p.posGroup] ?? 5);
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const slotNo = (p: YoungInput) => (p.round == null ? 99 : p.round) * 1000 + (p.pick ?? 999);

/**
 * Dev trait per young player.
 *  1. X-Factor iff awards or wAV earn it: MVP/OPOY/DPOY; AP1 >= 2; Rookie of the
 *     Year (unless three-plus seasons show the award never translated, pace < 0.4);
 *     a top-1% pace over >= 3 seasons at a non-specialist position; the elite rule.
 *  2. Superstar floor: AP1 >= 1, or PB >= 2.
 *  3. Star floor: PB >= 1.
 *  4. The rest by pace order (blending into caliber as careers mature) against a
 *     season-scaled quota that never reaches X-Factor.
 *  5. A zero-season group (drafted this year) has no wAV: Superstars and Stars go
 *     by draft slot at EA's rookie shape (12 / 90 per 402), X-Factors none.
 *
 * `classSize` is what the quotas scale against: the whole class (402) for a
 * single-year class, the young players' own count inside a mixed one.
 */
export function youngDev(items: YoungInput[], currentYear: number, classSize = items.length): Map<string, Tier> {
  const out = new Map<string, Tier>();
  if (!items.length) return out;
  const scale = classSize / FULL.size;
  const S = (p: YoungInput) => seasonsCompleted(p.draftYear, p.careerTo, currentYear);

  const floors = new Map<string, Tier>();
  for (const p of items) {
    const pc = pace(p, currentYear);
    const s = S(p);
    const roy = p.awards.includes('OROY') || p.awards.includes('DROY');
    const big = p.awards.includes('MVP') || p.awards.includes('OPOY') || p.awards.includes('DPOY');
    const royHeld = roy && !(s >= 3 && p.wavActual && pc < 0.4);
    const eliteTrack = pc >= ELITE_PACE && s >= 3 && !SPECIALISTS.has(p.posGroup);
    let floor: Tier = 0;
    if (big || p.ap1 >= 2 || royHeld || eliteTrack || p.elite) floor = 3;
    else if (roy || p.ap1 >= 1 || p.pb >= 2) floor = 2;
    else if (p.pb >= 1) floor = 1;
    floors.set(p.key, floor);
  }

  // Zero-season players: slot order, EA's rookie shape, no X-Factors.
  const rookies = items.filter((p) => S(p) === 0).sort((a, b) => slotNo(a) - slotNo(b));
  const rookieScale = scale;
  rookies.forEach((p, i) => {
    const tier: Tier = i < Math.round(12 * rookieScale) ? 2 : i < Math.round((12 + FULL.star) * rookieScale) ? 1 : 0;
    out.set(p.key, Math.max(tier, floors.get(p.key) ?? 0) as Tier);
  });

  // Everyone else: pace order (caliber takes over as careers mature), quota by seasons.
  const young = items.filter((p) => S(p) > 0);
  if (young.length) {
    const medianS = [...young.map(S)].sort((a, b) => a - b)[Math.floor(young.length / 2)];
    const ssQuota = Math.round(FULL.ss * clamp01((medianS - 1) / 3) * scale);
    const starQuota = Math.round(FULL.star * clamp01(medianS / 2) * scale);
    const score = (p: YoungInput) => {
      const w = clamp01((MATURE_SEASONS - S(p)) / (MATURE_SEASONS - 1)); // 1 at S<=1, 0 at S>=6
      return w * pace(p, currentYear) + (1 - w) * (p.caliber / 99);
    };
    const ordered = [...young].sort((a, b) => score(b) - score(a) || slotNo(a) - slotNo(b));
    let ss = 0, star = 0;
    for (const p of ordered) {
      const floor = floors.get(p.key) ?? 0;
      let tier: Tier = floor;
      if (floor < 2) {
        // Floors do not consume quota; a quota tier never reaches X-Factor, and a
        // specialist's quota tier stops at Star (a punter on a hot pace is still a
        // punter -- only an award or a Pro Bowl lifts him further).
        const specialist = SPECIALISTS.has(p.posGroup);
        if (ss < ssQuota && !specialist) { tier = 2; ss++; }
        else if (star < starQuota && floor < 1) { tier = 1; star++; }
      }
      out.set(p.key, Math.max(tier, floor) as Tier);
    }
  }
  return out;
}
