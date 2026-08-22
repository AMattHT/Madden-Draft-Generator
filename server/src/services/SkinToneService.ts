import { PositionMapper } from './PositionMapper';

/**
 * Position-weighted skin-tone (a.k.a. "Race": 1=lightest … 7=darkest) for players
 * whose real ethnicity is unknown or untrusted. The source Race column in the Madden
 * roster export is a near-universal hard-coded 7 (~95% of rows), so it can't be
 * trusted — a generic-face rookie needs a demographically-plausible tone instead of
 * everyone rendering Black. Deterministic per player so a class is reproducible.
 *
 * This ONLY affects players who fall back to a generic face; a real face asset
 * overrides skin tone entirely.
 */

// Approximate per-position-group skin-tone mix, leaning on the well-populated tones
// in the generic-face set (tone 7 has the most faces, then 2/5/6). Light tones (1-3)
// read as White, 4-5 medium/Hispanic, 6-7 Black. QB/OL/specialists skew lighter;
// the skill positions and front seven skew darker — matching NFL demographics.
const GROUP_TONE_WEIGHTS: Record<string, Array<[number, number]>> = {
  QB: [[2, 58], [1, 22], [3, 8], [7, 9], [6, 3]],
  RB: [[7, 72], [6, 14], [2, 8], [4, 4], [1, 2]],
  WR: [[7, 76], [6, 12], [2, 7], [4, 3], [1, 2]],
  CB: [[7, 80], [6, 12], [2, 5], [4, 2], [1, 1]],
  S: [[7, 72], [6, 12], [2, 11], [4, 3], [1, 2]],
  LB: [[7, 66], [6, 12], [2, 16], [4, 3], [1, 3]],
  EDGE: [[7, 68], [6, 12], [2, 14], [4, 3], [1, 3]],
  IDL: [[7, 66], [6, 12], [2, 16], [4, 3], [1, 3]],
  OL: [[2, 42], [1, 12], [7, 32], [6, 8], [4, 6]],
  TE: [[7, 44], [6, 10], [2, 34], [1, 8], [4, 4]],
  K: [[2, 66], [1, 24], [3, 4], [7, 4], [5, 2]],
  P: [[2, 66], [1, 24], [3, 4], [7, 4], [5, 2]],
  LS: [[2, 62], [1, 20], [3, 4], [7, 10], [6, 4]],
};

/** Deterministic [0,1) from a string key (FNV-1a). */
function hashUnit(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function weightedTone(weights: Array<[number, number]>, roll: number): number {
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let x = roll * total;
  for (const [tone, w] of weights) if ((x -= w) < 0) return tone;
  return weights[weights.length - 1][0];
}

/** Modal (most common) skin tone for a position — used when we have no
 *  portrait/wiki signal. A random draw here is how Charles Rogers (Black WR)
 *  was assigned tone 2 ~7% of the time. Variety belongs on the generic *head*,
 *  not the tone, for named historical players. */
export function defaultRaceFor(label: string | null | undefined, _key?: string): number {
  const group = PositionMapper.groupFromId(PositionMapper.toM26Id(label ?? ''));
  const weights = GROUP_TONE_WEIGHTS[group] ?? GROUP_TONE_WEIGHTS.LB;
  return weights[0][0];
}

/** Weighted random tone — for generated UDFA fillers so a class is not a clone army. */
export function defaultRaceForVaried(label: string | null | undefined, key: string): number {
  const group = PositionMapper.groupFromId(PositionMapper.toM26Id(label ?? ''));
  const weights = GROUP_TONE_WEIGHTS[group] ?? GROUP_TONE_WEIGHTS.LB;
  return weightedTone(weights, hashUnit(key));
}

export const SkinToneService = { defaultRaceFor, defaultRaceForVaried };
