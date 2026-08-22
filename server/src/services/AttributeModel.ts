import { CombineMeasurements } from '../types/player';
import { AttrStat, CalibrationService, PosProfile } from './CalibrationService';
import { CombineService } from './CombineService';
import { OVRWeightsCalculator } from './OVRWeightsCalculator';
import { PositionMapper } from './PositionMapper';

/**
 * Attribute generation calibrated on Madden's own draft classes.
 *
 * For each attribute the calibration records how it moves with overall INSIDE the
 * position (its slope), how much it scatters around that line (residStd) and the
 * observed range. A prospect's attribute is therefore
 *
 *     archetype mean + slope x (overall - archetype mean overall) + noise
 *
 * so awareness climbs steeply with overall, speed climbs gently, and injury /
 * toughness / stamina barely move - exactly the relationships the game's classes
 * show - instead of every non-physical attribute taking the same uniform shift.
 *
 * Real combine testing then overrides the athletic attributes, scored as a
 * percentile WITHIN the player's position group and placed on that position's
 * Madden distribution (a 5.2-second tackle is an average tackle, not a 41-speed
 * one), and the skill attributes are finally reconciled so the game's recomputed
 * overall equals the one we intend - to the exact point.
 */

/** Attributes that come from athleticism (combine + build), never from career
 *  caliber: the reconciler must not pump them to hit an overall. */
export const FIXED_ATTRS = new Set([
  'speed', 'acceleration', 'agility', 'changeOfDirection', 'jumping', 'strength', 'throwPower',
]);

export const RATING_KEYS = [
  'speed', 'acceleration', 'agility', 'strength', 'awareness', 'jumping', 'stamina',
  'changeOfDirection', 'toughness', 'injury', 'carrying', 'ballCarrierVision', 'breakTackle',
  'trucking', 'stiffArm', 'spinMove', 'jukeMove', 'catching', 'catchInTraffic', 'spectacularCatch',
  'shortRouteRunning', 'mediumRouteRunning', 'deepRouteRunning', 'release', 'throwPower',
  'throwAccuracyShort', 'throwAccuracyMid', 'throwAccuracyDeep', 'throwOnTheRun', 'throwUnderPressure',
  'playAction', 'breakSack', 'passBlock', 'passBlockPower', 'passBlockFinesse', 'runBlock',
  'runBlockPower', 'runBlockFinesse', 'leadBlock', 'impactBlocking', 'tackle', 'hitPower',
  'powerMoves', 'finesseMoves', 'blockShedding', 'pursuit', 'playRecognition', 'manCoverage',
  'zoneCoverage', 'pressCoverage', 'kickPower', 'kickAccuracy', 'kickReturn', 'longSnap',
];

export function clampRating(v: number): number {
  return Math.max(1, Math.min(99, Math.round(v)));
}

/** Standard normal from a seeded uniform source (Box-Muller). */
export function gauss(rand: () => number): number {
  const u = Math.max(1e-9, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/** Inverse normal CDF (Acklam's approximation) for percentile -> z. */
export function probit(p: number): number {
  const q = Math.min(1 - 1e-6, Math.max(1e-6, p));
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (q < pl) {
    const t = Math.sqrt(-2 * Math.log(q));
    return (((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5]) / ((((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1);
  }
  if (q > 1 - pl) {
    const t = Math.sqrt(-2 * Math.log(1 - q));
    return -(((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5]) / ((((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1);
  }
  const t = q - 0.5;
  const r = t * t;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * t / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export interface GenerateInput {
  posId: number;
  profile: PosProfile; // position profile (carries attrStats)
  archAttrs: Record<string, number>; // chosen archetype's attribute means
  archOvrMean: number; // chosen archetype's mean overall
  overall: number; // target overall
  rand: () => number; // seeded
  combine?: CombineMeasurements | null;
  /** Career-retrospective mode rates beyond Madden's rookie range; let the
   *  observed max stretch instead of pinning elite legends to a rookie ceiling. */
  uncapped?: boolean;
}

/** Place a percentile on the position's Madden distribution for an attribute. */
function onDistribution(p: number, st: AttrStat | undefined, positionMean: number): number {
  const std = st ? Math.max(2, st.std) : 5;
  const v = positionMean + probit(p) * std;
  const lo = st ? st.min - 2 : 1;
  const hi = st ? st.max + 3 : 99;
  return clampRating(Math.max(lo, Math.min(hi, v)));
}

/** Athletic attributes from combine testing, scored within the position group. */
export function combineAttrs(posId: number, c: CombineMeasurements, profile: PosProfile): Record<string, number> {
  const group = PositionMapper.groupFromId(posId);
  const st = profile.attrStats ?? {};
  const mean = (k: string) => profile.attrs[k] ?? 60;
  const out: Record<string, number> = {};
  const pct = (drill: keyof CombineMeasurements) => {
    const v = c[drill];
    return v == null ? null : CombineService.drillPercentile(group, drill, v);
  };
  const p40 = pct('forty');
  if (p40 != null) {
    out.speed = onDistribution(p40, st.speed, mean('speed'));
    // Acceleration is short-area burst: blend the 40 with the explosion drills.
    const bursts = [pct('vertical'), pct('broad'), pct('shuttle'), pct('cone')].filter((x): x is number => x != null);
    const pAcc = bursts.length ? 0.55 * p40 + 0.45 * (bursts.reduce((s, x) => s + x, 0) / bursts.length) : p40;
    out.acceleration = onDistribution(pAcc, st.acceleration, mean('acceleration'));
  }
  const pBench = pct('bench');
  if (pBench != null) out.strength = onDistribution(pBench, st.strength, mean('strength'));
  const pVert = pct('vertical') ?? pct('broad');
  if (pVert != null) out.jumping = onDistribution(pVert, st.jumping, mean('jumping'));
  const pCone = pct('cone');
  if (pCone != null) out.agility = onDistribution(pCone, st.agility, mean('agility'));
  const pShuttle = pct('shuttle') ?? pCone;
  if (pShuttle != null) out.changeOfDirection = onDistribution(pShuttle, st.changeOfDirection, mean('changeOfDirection'));
  return out;
}

/** Generate the full attribute set for a prospect (before user edits). */
export function generateAttributes(input: GenerateInput): Record<string, number> {
  const { posId, profile, archAttrs, archOvrMean, overall, rand } = input;
  const stats = profile.attrStats ?? {};
  const delta = overall - archOvrMean;
  const out: Record<string, number> = {};
  for (const k of RATING_KEYS) {
    const base = archAttrs[k] ?? profile.attrs[k] ?? 55;
    const st = stats[k];
    // No calibration for this attribute: fall back to the old uniform model.
    const slope = st ? st.slope : FIXED_ATTRS.has(k) ? 0 : 1;
    const noise = gauss(rand) * (st ? Math.max(1, st.residStd) * 0.85 : 2);
    let v = base + slope * delta + noise;
    if (st) {
      const lo = Math.max(1, st.min - 4);
      const hi = input.uncapped ? 99 : Math.min(99, st.max + 4);
      v = Math.max(lo, Math.min(hi, v));
    }
    out[k] = clampRating(v);
  }
  if (input.combine) Object.assign(out, combineAttrs(posId, input.combine, profile));
  return out;
}

/**
 * Madden recomputes a prospect's overall from its archetype-weighted attributes on
 * import (it discards the OVR byte). Shift the skill attributes so the recompute
 * lands exactly on `target`, leaving physicals (FIXED_ATTRS) untouched: first a
 * weighted shift, then single-point nudges on the heaviest movable attribute.
 */
export function reconcileToTarget(attrs: Record<string, number>, posId: number, archetype: number, target: number, version: 'm26' | 'm27' = 'm26'): void {
  reconcileArchetype(attrs, posId, archetype, target, version);
  // Madden does not trust the archetype byte either: it scores the attributes under
  // every archetype valid for the position and keeps the highest. A rival formula
  // scoring above the target lifts the overall on import (Kevin Williams 2003: 85 as
  // a Speed Rusher, 89 as a Power Rusher — the game showed 89). Lower the attributes
  // each rival weights more than ours until none beats the target, then re-solve.
  const rivals = eligibleArchetypes(posId, version).filter((a) => a !== archetype);
  for (let round = 0; round < 6 && rivals.length; round++) {
    let moved = false;
    for (const rival of rivals) {
      const score = OVRWeightsCalculator.computeOverall(posId, rival, attrs, version);
      if (score == null || score <= target) continue;
      capRival(attrs, posId, archetype, rival, target, version);
      moved = true;
    }
    if (!moved) break;
    reconcileArchetype(attrs, posId, archetype, target, version, rivals);
  }
}

/** The overall Madden will show: the best score over every archetype valid for
 *  the position (the game re-derives the archetype from the attributes). */
export function gameOverall(attrs: Record<string, number>, posId: number, archetype: number, version: 'm26' | 'm27' = 'm26'): { overall: number | null; archetype: number } {
  let best = OVRWeightsCalculator.computeOverall(posId, archetype, attrs, version);
  let bestArch = archetype;
  for (const a of eligibleArchetypes(posId, version)) {
    if (a === archetype) continue;
    const o = OVRWeightsCalculator.computeOverall(posId, a, attrs, version);
    if (o != null && (best == null || o > best)) { best = o; bestArch = a; }
  }
  return { overall: best, archetype: bestArch };
}

/** Archetype ids the game considers for a position: the ones its own generated
 *  classes use (calibration archetypeDist). Ovrweights carries DE-style rushers for
 *  OLB too, but the game never assigns those to a SAM/WILL. */
function eligibleArchetypes(posId: number, version: 'm26' | 'm27'): number[] {
  const prof = CalibrationService.positionProfile(PositionMapper.name(posId), version);
  return Object.keys(prof?.archetypeDist ?? {}).map(Number).filter((n) => Number.isFinite(n));
}

/** Bring `rival`'s recompute down to `target` by lowering the skill attributes it
 *  weights more heavily than `archetype` does (so our own score moves least). */
function capRival(attrs: Record<string, number>, posId: number, archetype: number, rival: number, target: number, version: 'm26' | 'm27'): void {
  const re = OVRWeightsCalculator.ovrEntryFor(posId, rival, version);
  const own = OVRWeightsCalculator.ovrEntryFor(posId, archetype, version);
  if (!re || !re.sumWeight) return;
  const ownW = own?.weights ?? {};
  const lean = (a: string) => re.weights[a] - (ownW[a] ?? 0);
  let movable = Object.keys(re.weights).filter((a) => !FIXED_ATTRS.has(a) && lean(a) > 0);
  if (!movable.length) movable = Object.keys(re.weights).filter((a) => !FIXED_ATTRS.has(a));
  if (!movable.length) return;
  const score = () => OVRWeightsCalculator.computeOverall(posId, rival, attrs, version) ?? target;
  // Weighted shift to just under the rounding edge of target+1.
  const requiredSum = (re.desiredLow + ((target + 0.45) / 99) * (re.desiredHigh - re.desiredLow)) * re.sumWeight;
  for (let iter = 0; iter < 4 && score() > target; iter++) {
    let sum = 0;
    for (const [a, w] of Object.entries(re.weights)) sum += (Number(attrs[a]) || 0) * w;
    const deficit = requiredSum - sum; // negative: we must come down
    if (deficit >= 0) break;
    const live = movable.filter((a) => (Number(attrs[a]) || 0) > 1);
    const movableW = live.reduce((s, a) => s + re.weights[a], 0);
    if (!movableW) break;
    const shift = deficit / movableW;
    for (const a of live) attrs[a] = clampRating((Number(attrs[a]) || 0) + shift);
  }
  // Integer pass on the attribute that hurts our own score least per rival point.
  const byLean = [...movable].sort((a, b) => lean(b) - lean(a));
  for (let i = 0; i < 40 && score() > target; i++) {
    const pick = byLean.find((a) => attrs[a] > 1);
    if (!pick) break;
    attrs[pick] -= 1;
  }
}

function reconcileArchetype(attrs: Record<string, number>, posId: number, archetype: number, target: number, version: 'm26' | 'm27', rivals: number[] = []): void {
  const entry = OVRWeightsCalculator.ovrEntryFor(posId, archetype, version);
  if (!entry || !entry.sumWeight) return;
  const { desiredLow: DL, desiredHigh: DH, sumWeight, weights } = entry;
  const free = Object.keys(weights).filter((a) => !FIXED_ATTRS.has(a));
  if (!free.length) return;
  const current = () => OVRWeightsCalculator.computeOverall(posId, archetype, attrs, version) ?? target;

  const requiredSum = (DL + (target / 99) * (DH - DL)) * sumWeight;
  for (let iter = 0; iter < 8; iter++) {
    if (current() === target) break;
    let sum = 0;
    for (const [a, w] of Object.entries(weights)) sum += (Number(attrs[a]) || 0) * w;
    const deficit = requiredSum - sum;
    let movableW = 0;
    for (const a of free) {
      const v = Number(attrs[a]) || 0;
      if (deficit > 0 ? v < 99 : v > 1) movableW += weights[a];
    }
    if (movableW === 0) break;
    const shift = deficit / movableW;
    for (const a of free) {
      const v = Number(attrs[a]) || 0;
      if (deficit > 0 ? v >= 99 : v <= 1) continue;
      attrs[a] = clampRating(v + shift);
    }
  }

  // Integer pass: rounding leaves ~20% of prospects one point off; nudge the
  // heaviest free attribute that can still move until the recompute is exact.
  // When raising, skip a nudge that would push a rival archetype above the target
  // (the game would then re-rate the prospect up under that archetype).
  const byWeight = [...free].sort((a, b) => weights[b] - weights[a]);
  const rivalOver = () => rivals.some((r) => (OVRWeightsCalculator.computeOverall(posId, r, attrs, version) ?? -1) > target);
  for (let i = 0; i < 40; i++) {
    const cur = current();
    if (cur === target) break;
    const up = cur < target;
    let done = false;
    for (const a of byWeight) {
      if (up ? attrs[a] >= 99 : attrs[a] <= 1) continue;
      attrs[a] += up ? 1 : -1;
      if (up && rivals.length && rivalOver()) { attrs[a] -= 1; continue; }
      done = true;
      break;
    }
    if (!done) break;
  }
}
