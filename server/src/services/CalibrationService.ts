import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../config/paths';
import { LookupService } from './LookupService';

/**
 * Calibration derived from real Madden-26-generated draft classes
 * (madden-calibration.json, built by scripts/build-calibration.js). Lets our
 * generator match Madden's statistical shape: OVR curve, dev-trait rates,
 * age distribution, and per-position attribute + bio norms.
 */

export interface ArchetypeProfile {
  count: number;
  htMean: number;
  wtMean: number;
  ovrMean: number;
  attrs: Record<string, number>;
}

export interface AttrStat {
  slope: number; // d(attribute)/d(overall) inside the position
  std: number; // overall spread of the attribute
  residStd: number; // spread around the slope line
  min: number;
  max: number;
}

export interface PosProfile {
  ovrMean: number;
  archetypeMode: number;
  archetypeDist: Record<string, number>; // { archetypeId: count } from Madden
  archetypeProfiles?: Record<string, ArchetypeProfile>; // per-archetype build + attrs
  htMean: number;
  htStd: number;
  wtMean: number;
  wtStd: number;
  attrs: Record<string, number>;
  attrStats?: Record<string, AttrStat>; // per-attribute slope/spread/range (build-calibration.js)
}

export type GameVersion = 'm26' | 'm27';

interface Calibration {
  ovrCurve: number[]; // ovrCurve[p] = OVR at the p-th percentile (0..100)
  devRates: number[]; // [normal, star, superstar, xfactor]
  ageWeights: Record<string, number>;
  positions: Record<string, PosProfile>;
}

const cals: Partial<Record<GameVersion, Calibration>> = {};
/** Calibration for a game version. M27 comes from the game's own TEST classes
 *  (madden-calibration-m27.json); it falls back to the M26 file if absent. */
function load(version: GameVersion = 'm26'): Calibration {
  const hit = cals[version];
  if (hit) return hit;
  const file = version === 'm27' ? 'madden-calibration-m27.json' : 'madden-calibration.json';
  const p = path.join(LOOKUPS_DIR, file);
  const loaded: Calibration = JSON.parse(fs.readFileSync(fs.existsSync(p) ? p : path.join(LOOKUPS_DIR, 'madden-calibration.json'), 'utf8'));
  cals[version] = loaded;
  return loaded;
}

export const CalibrationService = {
  /** OVR at percentile p in [0,1] (0 = worst caliber, 1 = best), linearly
   *  interpolated between Madden's curve points (so the elite tail spreads
   *  80-84 instead of jumping from p99=79 to p100=85). */
  ovrAtPercentile(p: number, version: GameVersion = 'm26'): number {
    const c = load(version).ovrCurve;
    const x = Math.max(0, Math.min(1, p)) * 100;
    const lo = Math.floor(x);
    const hi = Math.min(100, lo + 1);
    return Math.round(c[lo] + (c[hi] - c[lo]) * (x - lo));
  },

  /** Dev trait (0-3) for a player whose caliber rank-from-the-top fraction is f
   *  (0 = best player). Matches Madden's rates: top XF%, next SS%, next Star%. */
  devForTopFraction(f: number, version: GameVersion = 'm26'): number {
    const [, star, ss, xf] = load(version).devRates;
    if (f < xf) return 3;
    if (f < xf + ss) return 2;
    if (f < xf + ss + star) return 1;
    return 0;
  },

  positionProfile(posName: string, version: GameVersion = 'm26'): PosProfile {
    const p = load(version).positions;
    return p[posName] ?? p['WR'] ?? Object.values(p)[0];
  },

  /** Weighted-random archetype for a position, matching Madden's real mix
   *  (e.g. HBs come out ~Elusive/Receiving/Power in Madden's proportions). */
  sampleArchetype(posName: string, rand: () => number, version: GameVersion = 'm26'): number {
    const prof = this.positionProfile(posName, version);
    const dist = prof.archetypeDist;
    if (!dist) return prof.archetypeMode || 0;
    const entries = Object.entries(dist);
    const total = entries.reduce((s, [, c]) => s + c, 0) || 1;
    let x = rand() * total;
    for (const [id, c] of entries) {
      x -= c;
      if (x <= 0) return parseInt(id, 10);
    }
    return prof.archetypeMode || 0;
  },

  /** Assign the archetype whose typical build (height+weight) is closest to the
   *  player's, the way Madden does (heavy back -> Power, lean end -> Speed Rusher).
   *  Distance is normalized by the position's ht/wt spread. */
  bestArchetypeForBuild(posName: string, heightInches: number, weight: number, version: GameVersion = 'm26'): number {
    const prof = this.positionProfile(posName, version);
    const profiles = prof.archetypeProfiles;
    if (!profiles || Object.keys(profiles).length === 0) return prof.archetypeMode || 0;
    const htStd = prof.htStd || 2;
    const wtStd = prof.wtStd || 20;
    let best = prof.archetypeMode || 0;
    let bestDist = Infinity;
    for (const [id, ap] of Object.entries(profiles)) {
      const dHt = (heightInches - ap.htMean) / htStd;
      const dWt = (weight - ap.wtMean) / wtStd;
      const dist = dHt * dHt + dWt * dWt;
      if (dist < bestDist) {
        bestDist = dist;
        best = parseInt(id, 10);
      }
    }
    return best;
  },

  /** The chosen archetype's attribute profile (for generating archetype-consistent
   *  ratings). Falls back to the position average for thin/unknown archetypes. */
  archetypeAttrs(posName: string, archetypeId: number, version: GameVersion = 'm26'): { attrs: Record<string, number>; ovrMean: number } {
    const prof = this.positionProfile(posName, version);
    const ap = prof.archetypeProfiles?.[String(archetypeId)];
    if (ap && ap.count >= 6) return { attrs: ap.attrs, ovrMean: ap.ovrMean };
    return { attrs: prof.attrs, ovrMean: prof.ovrMean };
  },

  /** posName -> [{id,name}] archetypes valid for that position (for the UI), by
   *  frequency. Names come from archetype_lookup.csv. */
  archetypeOptions(): Record<string, { id: number; name: string }[]> {
    const out: Record<string, { id: number; name: string }[]> = {};
    for (const [pos, prof] of Object.entries(load().positions)) {
      const dist = prof.archetypeDist || {};
      out[pos] = Object.keys(dist)
        .map((k) => parseInt(k, 10))
        .sort((a, b) => (dist[b] || 0) - (dist[a] || 0))
        .map((id) => ({ id, name: LookupService.idToName('archetype', id) || `#${id}` }));
    }
    return out;
  },

  /** Weighted-random draft age (Madden rookies are 20-24, mostly 22). */
  sampleAge(rand: () => number, version: GameVersion = 'm26'): number {
    const w = load(version).ageWeights;
    const entries = Object.entries(w);
    const total = entries.reduce((s, [, c]) => s + c, 0) || 1;
    let x = rand() * total;
    for (const [age, c] of entries) {
      x -= c;
      if (x <= 0) return parseInt(age, 10);
    }
    return 22;
  },
};
