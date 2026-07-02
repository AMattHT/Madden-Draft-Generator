import { LookupService } from './LookupService';

/**
 * Madden 26 recomputes an imported draft prospect's Overall from its per-archetype
 * weighted attributes — it IGNORES the OVR byte we write into the .mdc. This service
 * reproduces that recompute so we can calibrate our generated attributes to land on
 * the OVR we actually want in-game.
 *
 * Formula (reverse-engineered from ovrweights.json, validated to ±1 across a full
 * imported class):
 *   entry       = ovrweights entry for (Madden position, archetype), matched by NAME
 *   weightedAvg = Σ(attr_i · weight_i) / Σ(weight_i)      // Σ(weight)=10 for every entry
 *   frac        = (weightedAvg − DesiredLow) / (DesiredHigh − DesiredLow)
 *   OVR         = round(frac · 99)
 *
 * The ovrweights.json ARRAY ORDER is NOT our archetype-id space — it must be matched
 * by (position + archetype suffix name), never by index.
 */

interface OvrEntry {
  pos: string;
  archetype: string;
  desiredHigh: number;
  desiredLow: number;
  weights: Record<string, number>; // attribute key (our RATING_KEYS space) -> weight
  sumWeight: number;
}

/** Madden position id -> the ovrweights "Pos" bucket. */
const POS_TO_OVR_POS: Record<number, string> = {
  0: 'QB', 1: 'HB', 2: 'FB', 3: 'WR', 4: 'TE',
  5: 'OT', 6: 'G', 7: 'C', 8: 'G', 9: 'OT',
  10: 'DE', 11: 'DE', 12: 'DT', 13: 'OLB', 14: 'MLB', 15: 'OLB',
  16: 'CB', 17: 'S', 18: 'S', 19: 'KP', 20: 'KP', 21: 'LS',
};

/** ovrweights "<Name>Rating" stem -> our RATING_KEYS attribute key. Almost all are
 *  the lower-camel of the stem; only these two differ. */
const RATING_STEM_OVERRIDES: Record<string, string> = {
  BCVision: 'ballCarrierVision',
  Press: 'pressCoverage',
};

function stemToAttr(stem: string): string {
  return RATING_STEM_OVERRIDES[stem] ?? stem.charAt(0).toLowerCase() + stem.slice(1);
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

let entries: OvrEntry[] | null = null;
function loadEntries(): OvrEntry[] {
  if (entries) return entries;
  const raw = LookupService.rawJson('ovrweights.json') as any[];
  entries = raw
    .filter((e) => e && e.Pos)
    .map((e) => {
      const weights: Record<string, number> = {};
      let sumWeight = 0;
      for (const [k, v] of Object.entries(e)) {
        if (!k.endsWith('Rating')) continue;
        const w = Number(v) || 0;
        if (w === 0) continue;
        weights[stemToAttr(k.slice(0, -'Rating'.length))] = w;
        sumWeight += w;
      }
      return {
        pos: String(e.Pos),
        archetype: String(e.Archetype ?? ''),
        desiredHigh: Number(e.DesiredHigh),
        desiredLow: Number(e.DesiredLow),
        weights,
        sumWeight,
      };
    });
  return entries;
}

const cache = new Map<string, OvrEntry | null>();

/** Resolve the ovrweights entry for a Madden (positionId, archetypeId). Matched by
 *  the archetype's suffix name within the position's ovrweights bucket. */
export function ovrEntryFor(posId: number, archetypeId: number): OvrEntry | null {
  const key = `${posId}:${archetypeId}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const ovrPos = POS_TO_OVR_POS[posId];
  const pool = loadEntries().filter((e) => e.pos === ovrPos);
  let chosen: OvrEntry | null = null;
  if (pool.length) {
    const suffix = norm(LookupService.idToName('archetype', archetypeId) || '');
    // ovrweights Archetype is "Pos_Suffix"; compare the normalized suffix.
    const suffixOf = (e: OvrEntry) => norm(e.archetype.replace(new RegExp(`^${e.pos}_?`, 'i'), ''));
    chosen =
      pool.find((e) => suffixOf(e) === suffix) ||
      (suffix ? pool.find((e) => suffixOf(e).includes(suffix) || suffix.includes(suffixOf(e))) : null) ||
      pool[0];
  }
  cache.set(key, chosen);
  return chosen;
}

/** Madden's recomputed Overall for a prospect's attributes at (position, archetype). */
export function computeOverall(posId: number, archetypeId: number, attrs: Record<string, number>): number | null {
  const entry = ovrEntryFor(posId, archetypeId);
  if (!entry || !entry.sumWeight) return null;
  let sum = 0;
  for (const [attr, w] of Object.entries(entry.weights)) sum += (Number(attrs[attr]) || 0) * w;
  const weightedAvg = sum / entry.sumWeight;
  const frac = (weightedAvg - entry.desiredLow) / (entry.desiredHigh - entry.desiredLow);
  return Math.round(frac * 99);
}

export const OVRWeightsCalculator = { ovrEntryFor, computeOverall };
export type { OvrEntry };
