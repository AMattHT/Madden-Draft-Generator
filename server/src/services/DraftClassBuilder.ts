import { MdcService, MdcProspect } from './MdcService';
import { LookupService } from './LookupService';
import { PositionMapper } from './PositionMapper';
import { RatingService } from './RatingService';
import { CalibrationService } from './CalibrationService';
import { OVRWeightsCalculator } from './OVRWeightsCalculator';
import { LikenessService, LikenessKind } from './LikenessService';
import { EraGearService } from './EraGearService';
import { PortraitSlotService } from './PortraitSlotService';
import { BaselinePlayer, CombineMeasurements } from '../types/player';
import { TeamInfo } from './TeamService';
import { PortraitService } from './PortraitService';
import { GEAR_SLOT_TYPES } from './GearOptionsService';
import { seededRng } from '../util/rng';
import { MDC_BLOCK_SIZE, MDC_DATA_START } from '../config/paths';

/** Logical draft-class size the M26 template ships with (blocks 0..401). */
const LOGICAL_CAPACITY = 402;

/** Rating mode: 'madden' = match Madden's realistic-rookie curve (default);
 *  'retro' = career-retrospective (OVR reflects how good they actually turned
 *  out, uncapped). */
export type GenMode = 'madden' | 'retro';

/** Optional generation modifiers for custom draft classes (madden mode):
 *  - strength: scales the whole OVR curve (1 = normal; >1 stronger, allows >85).
 *  - studs: guarantee this many top prospects at first-round caliber (OVR>=80, dev>=SS).
 *  - generational: make the #1 prospect a can't-miss X-Factor (OVR>=90). */
export interface GenOptions {
  strength?: number;
  studs?: number;
  generational?: boolean;
}

/** Elite = career wAV >= 90, or a Hall of Famer whose own career corroborates it
 *  → always X-Factor (dev 3). The source isHOF flag is name-matched and collides
 *  across same-named players (all three "Jim Brown"s read TRUE), so it's only
 *  trusted alongside real star production — otherwise an obscure same-named scrub
 *  would inherit an X-Factor trait. */
function isElite(player: BaselinePlayer): boolean {
  if ((player.wav ?? 0) >= 90) return true;
  const corroborated = (player.allPro1 ?? 0) >= 3 || (player.proBowls ?? 0) >= 5 || (player.wav ?? 0) >= 70;
  return player.isHOF === true && corroborated;
}

/** Dev trait from career caliber (used in retrospective mode). */
function devFromCaliber(caliber: number, player: BaselinePlayer): number {
  if (isElite(player)) return 3; // unconditional X-Factor (bypasses the slot cap)
  const round = player.draftRound ?? 8;
  let dev = 0;
  if (caliber >= 90 && (player.allPro1 ?? 0) >= 3) dev = 3;
  else if (caliber >= 86) dev = 2;
  else if (caliber >= 80) dev = 1;
  const slotCap = round <= 1 ? 3 : round <= 3 ? 2 : round <= 5 ? 1 : caliber >= 82 ? 1 : 0;
  return Math.min(dev, slotCap);
}

/** Rating fields M26Writer reads (and that exist on parsed donor prospects). */
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

/** Attributes that come from a player's athleticism (combine + archetype baseline),
 *  NOT from career caliber — so they're never pumped by the OVR delta and never moved
 *  by the OVR reconciliation. Physical traits (a highly-rated MIKE isn't a 99-speed
 *  sprinter) plus the QB signature arm (a good QB isn't automatically a 99 cannon). */
const FIXED_ATTRS = new Set([
  'speed', 'acceleration', 'agility', 'changeOfDirection', 'jumping', 'strength', 'throwPower',
]);

function clampRating(v: number): number {
  return Math.max(1, Math.min(99, Math.round(v)));
}

/** Piecewise-linear interpolation over [x, rating] anchors (x ascending). */
function interpRating(anchors: [number, number][], x: number): number {
  if (x <= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < anchors.length; i++) {
    const [x1, y1] = anchors[i - 1];
    const [x2, y2] = anchors[i];
    if (x <= x2) return y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
  }
  return last[1];
}

// Combine metric -> Madden rating anchors (time-based metrics: lower time = higher rating).
const A_FORTY: [number, number][] = [[4.24, 99], [4.35, 96], [4.45, 92], [4.55, 87], [4.65, 81], [4.75, 74], [4.85, 66], [4.95, 58], [5.1, 48], [5.5, 34]];
const A_BENCH: [number, number][] = [[0, 50], [8, 58], [14, 64], [19, 70], [24, 76], [29, 82], [34, 88], [39, 93], [45, 99]];
const A_VERT: [number, number][] = [[24, 52], [28, 60], [31, 68], [34, 76], [37, 84], [40, 91], [43, 96], [46, 99]];
const A_BROAD: [number, number][] = [[100, 52], [108, 60], [114, 68], [120, 76], [126, 84], [132, 91], [138, 96], [144, 99]];
const A_CONE: [number, number][] = [[6.4, 99], [6.6, 94], [6.8, 89], [7.0, 83], [7.2, 76], [7.4, 68], [7.6, 60], [7.9, 50], [8.3, 40]];
const A_SHUTTLE: [number, number][] = [[3.9, 99], [4.0, 95], [4.1, 90], [4.2, 84], [4.3, 78], [4.4, 71], [4.5, 63], [4.7, 52], [4.9, 42]];

/** Athletic ratings derived from real combine testing (overrides archetype defaults). */
function combineAttrs(c: CombineMeasurements): Record<string, number> {
  const out: Record<string, number> = {};
  if (c.forty != null) {
    const spd = clampRating(interpRating(A_FORTY, c.forty));
    out.speed = spd;
    // Acceleration is short-area burst, not top-end speed: blend the 40 with the
    // explosion/quickness drills so ACC diverges from SPD (a fast but stiff player
    // accelerates worse than an explosive one; a springy player, better).
    const bursts: number[] = [];
    if (c.vertical != null) bursts.push(interpRating(A_VERT, c.vertical));
    if (c.broad != null) bursts.push(interpRating(A_BROAD, c.broad));
    if (c.shuttle != null) bursts.push(interpRating(A_SHUTTLE, c.shuttle));
    if (c.cone != null) bursts.push(interpRating(A_CONE, c.cone));
    out.acceleration = bursts.length
      ? clampRating(0.55 * spd + 0.45 * (bursts.reduce((s, v) => s + v, 0) / bursts.length))
      : spd;
  }
  if (c.bench != null) out.strength = clampRating(interpRating(A_BENCH, c.bench));
  if (c.vertical != null) out.jumping = clampRating(interpRating(A_VERT, c.vertical));
  else if (c.broad != null) out.jumping = clampRating(interpRating(A_BROAD, c.broad));
  if (c.cone != null) out.agility = clampRating(interpRating(A_CONE, c.cone));
  if (c.shuttle != null) out.changeOfDirection = clampRating(interpRating(A_SHUTTLE, c.shuttle));
  else if (c.cone != null && out.agility != null) out.changeOfDirection = out.agility;
  return out;
}

function withinRoundPick(overallPick: number | null): number {
  if (!overallPick || overallPick < 1) return 0;
  return ((overallPick - 1) % 32) + 1;
}

/** A player after the class-wide ranking pass: its final OVR (from Madden's
 *  empirical curve) and dev trait (from Madden's rates) have been assigned. */
interface RankedItem {
  player: BaselinePlayer;
  index: number;
  posId: number;
  caliber: number;
  overall: number;
  devTrait: number;
}

/** Split the CSV "Home State" (really a "City, State" hometown) into a Madden
 *  state id + a city string. Falls back gracefully for state-only or city-only. */
function parseHometown(raw: string | null | undefined): { state: number; town: string } {
  if (!raw) return { state: 0, town: '' };
  const s = raw.trim();
  const ci = s.lastIndexOf(',');
  if (ci >= 0) {
    return { state: LookupService.stateId(s.slice(ci + 1)) ?? 0, town: s.slice(0, ci).trim() };
  }
  const asState = LookupService.stateId(s);
  return asState != null ? { state: asState, town: '' } : { state: 0, town: s };
}

// Position-appropriate jersey number ranges (used only when the CSV has none, so
// pre-2005 players get a plausible number instead of everyone exporting as 0).
const JERSEY_RANGES: Record<string, [number, number]> = {
  QB: [1, 19], RB: [20, 39], WR: [10, 19], TE: [80, 89], OL: [60, 79],
  EDGE: [90, 99], IDL: [90, 99], LB: [40, 59], CB: [20, 39], S: [20, 39],
  K: [1, 9], P: [1, 9], LS: [40, 49],
};
function jerseyFor(group: string, rand: () => number): number {
  const [lo, hi] = JERSEY_RANGES[group] ?? [1, 99];
  return lo + Math.floor(rand() * (hi - lo + 1));
}

/** Madden 26 body type (Heavy / Muscular / Thin / Standard) from position group +
 *  weight, mirroring the template's build distribution: OL & big DT are Heavy, the
 *  back seven & specialists are Thin, RB/TE/EDGE/LB are Muscular, QB/WR are Standard.
 *  Weight refines the borderline groups (a 300 lb DT is Heavy, a lighter one Muscular). */
function bodyTypeFor(group: string, weight: number | null): 'Heavy' | 'Muscular' | 'Thin' | 'Standard' {
  const w = weight ?? 0;
  switch (group) {
    case 'OL':
      return w && w < 285 ? 'Muscular' : 'Heavy';
    case 'IDL':
      return w >= 300 ? 'Heavy' : 'Muscular';
    case 'EDGE':
      return w >= 275 ? 'Heavy' : 'Muscular';
    case 'TE':
      return w >= 262 ? 'Heavy' : 'Muscular';
    case 'RB':
    case 'LB':
      return 'Muscular';
    case 'S':
      return w >= 212 ? 'Muscular' : 'Thin';
    case 'CB':
    case 'K':
      return 'Thin';
    default:
      return 'Standard'; // QB, WR, P, LS
  }
}

/** Madden RECOMPUTES a prospect's Overall from its archetype-weighted attributes on
 *  import (it discards our OVR byte). Shift only the learnable/skill attributes so
 *  that recompute lands on `target`, leaving physical + signature traits (FIXED_ATTRS)
 *  and the athletic combine values untouched. A uniform weighted shift preserves the
 *  archetype's relative attribute profile; clamping is absorbed by re-solving. */
function reconcileToTarget(prospect: MdcProspect, posId: number, archetype: number, target: number): void {
  const entry = OVRWeightsCalculator.ovrEntryFor(posId, archetype);
  if (!entry || !entry.sumWeight) return;
  const { desiredLow: DL, desiredHigh: DH, sumWeight, weights } = entry;
  const requiredSum = (DL + (target / 99) * (DH - DL)) * sumWeight; // Σ(attr·w) target
  const free = Object.keys(weights).filter((a) => !FIXED_ATTRS.has(a));
  if (!free.length) return;

  for (let iter = 0; iter < 8; iter++) {
    let sum = 0;
    for (const [a, w] of Object.entries(weights)) sum += (Number(prospect[a]) || 0) * w;
    if (Math.round(((sum / sumWeight - DL) / (DH - DL)) * 99) === target) break;
    const deficit = requiredSum - sum;
    let movableW = 0; // weight of free attrs with headroom in the needed direction
    for (const a of free) {
      const v = Number(prospect[a]) || 0;
      if (deficit > 0 ? v < 99 : v > 1) movableW += weights[a];
    }
    if (movableW === 0) break; // fully clamped — accept the closest reachable OVR
    const shift = deficit / movableW;
    for (const a of free) {
      const v = Number(prospect[a]) || 0;
      if (deficit > 0 ? v >= 99 : v <= 1) continue;
      prospect[a] = clampRating(v + shift);
    }
  }
}

/** Convert a ranked player into an M26 prospect: attributes come from Madden's
 *  real per-position profile shifted to the assigned OVR (with small seeded
 *  per-player variance); bio from real data or Madden norms; plus likeness +
 *  era gear. */
function toProspect(it: RankedItem, portraitPid?: number): { prospect: MdcProspect; kind: LikenessKind } {
  const { player, index, posId, overall, devTrait } = it;
  const posName = PositionMapper.name(posId);
  const profile = CalibrationService.positionProfile(posName);
  const rand = seededRng(`${player.firstName}|${player.lastName}|${player.draftYear}|${index}`);

  // Bio first (real measurements when we have them, else Madden per-position
  // norms) — the physical build decides the archetype, the way Madden does it.
  const heightInches = player.heightInches ?? Math.round(profile.htMean + (rand() * 2 - 1) * profile.htStd);
  const weight = Math.max(160, player.weight ?? Math.round(profile.wtMean + (rand() * 2 - 1) * profile.wtStd));

  // Archetype from the real build (heavy back -> Power, lean end -> Speed Rusher),
  // then attributes from THAT archetype's profile so ratings match the role.
  const archetype = CalibrationService.bestArchetypeForBuild(posName, heightInches, weight);
  const { attrs, ovrMean } = CalibrationService.archetypeAttrs(posName, archetype);

  const prospect: MdcProspect = {};
  const delta = overall - ovrMean;
  for (const k of RATING_KEYS) {
    const base = attrs[k] ?? profile.attrs[k] ?? 55;
    const variance = Math.round((rand() - 0.5) * 6);
    // Physical + signature traits (FIXED_ATTRS) stay at the athletic baseline — they
    // don't scale with career caliber. Everything else starts from the archetype
    // profile shifted toward OVR, then gets reconciled to the exact target below.
    prospect[k] = clampRating(FIXED_ATTRS.has(k) ? base + variance : base + delta + variance);
  }
  // Real combine testing overrides the measured athletic attributes (speed from the
  // 40, acceleration from short-area burst, strength/jumping/agility/COD from drills).
  if (player.combine) {
    for (const [k, v] of Object.entries(combineAttrs(player.combine))) prospect[k] = v;
  }
  prospect.archetype = archetype;
  // Calibrate the learnable attributes so Madden's on-import OVR recompute equals the
  // OVR we intend (Madden ignores the OVR byte and recomputes from these attributes).
  reconcileToTarget(prospect, posId, archetype, overall);

  // Identity.
  prospect.firstName = player.firstName || 'Player';
  prospect.lastName = player.lastName || '';
  prospect.position = posId;
  prospect.college = LookupService.collegeId(player.college);
  const home = parseHometown(player.homeState);
  prospect.homeState = home.state;
  prospect.homeTown = home.town;
  prospect.age = player.age ?? CalibrationService.sampleAge(rand);
  prospect.heightInches = heightInches;
  prospect.weight = weight;
  const group = PositionMapper.groupFromId(posId);
  prospect.jerseyNum = player.jersey ?? jerseyFor(group, rand);
  prospect.bodyType = bodyTypeFor(group, weight); // Madden build, else inherits the donor block's
  prospect.draftable = 1;
  prospect.draftRound = player.draftRound ?? 63; // 63 = UDFA
  prospect.draftPick = withinRoundPick(player.draftPick);
  prospect.overall = overall;
  prospect.devTrait = devTrait;

  // Likeness: real face asset when the player has one, else a race-appropriate
  // generic. PID/CommID link the real menu portrait + commentary when present.
  const like = LikenessService.assign(player, index);
  prospect.PEPS = like.peps;
  prospect.PID = portraitPid ?? player.photoId ?? 0;
  prospect.commentaryId = player.commId ?? 0;

  // Era-appropriate gear (vintage helmet/cleats/gloves, no visor pre-1990).
  prospect.visuals = {
    loadouts: [EraGearService.loadout(player.draftYear, posId, `${player.firstName}|${player.lastName}|${index}`)],
  };

  return { prospect, kind: like.kind };
}

export interface LikenessStats {
  asset: number; // players given their real Madden face asset
  generic: number; // players given a race-appropriate generic face
  withPortrait: number; // players with a real menu portrait (PhotoID)
  customPortrait: number; // players pointed at a recycled slot for a Frosty photo
}

export interface BuildResult {
  buffer: Buffer;
  count: number;
  truncated: boolean;
  dropped: string[];
  likeness: LikenessStats;
}

/** User edits keyed by pick number -> { field: value } (overall, devTrait,
 *  position, archetype, or any rating key). Applied on top of the deterministic
 *  base class at export time so edits survive without storing the whole class. */
export type ClassEdits = Record<string, Record<string, number | string>>;

export interface PreviewRow {
  id: number; // == pick (stable; generation is deterministic)
  pick: number;
  firstName: string;
  lastName: string;
  position: string; // M26 label (e.g. "REDG")
  positionId: number;
  overall: number;
  devTrait: number;
  archetype: number;
  archetypeName: string;
  round: number | null;
  draftPick: number | null;
  wav: number | null;
  wavSource: string;
  face: 'asset' | 'generic' | 'photo';
  skinTone: number; // 1-8, for the face picker's per-tone pool
  genericHead: string | null; // current generic head code (gen_*), null if a real asset
  college: string;
  age: number;
  heightInches: number;
  weight: number;
  jersey: number;
  bodyType: string; // Madden 26 build: Heavy / Muscular / Thin / Standard
  photoUrl: string | null;
  portrait?: string | null; // Madden menu-portrait URL (real or generic-by-skintone)
  team?: TeamInfo; // drafting team (from nflverse, 1980+), joined by overall pick
  combine?: CombineMeasurements | null; // NFL combine testing (nflverse, 2000+)
  ratings: Record<string, number>;
}

export interface PreviewResult {
  rows: PreviewRow[];
  likeness: LikenessStats;
  count: number;
}

/** Valid Madden 26 body types (from the shipped template's visuals JSON). */
export const BODY_TYPES = ['Standard', 'Thin', 'Muscular', 'Heavy'];

// Per-field clamp ranges for non-rating numeric fields (everything else = 0-99).
const EDIT_CLAMP: Record<string, [number, number]> = {
  position: [0, 21], devTrait: [0, 3], archetype: [0, 67], college: [0, 493],
  homeState: [0, 50], heightInches: [60, 84], weight: [140, 400], age: [18, 45], jerseyNum: [0, 99],
};

/** Apply user edits (by pick) onto generated prospects, clamping to valid ranges.
 *  String fields (firstName/lastName/homeTown) are set as text; everything else is
 *  a number clamped to its field range (ratings 0-99). */
/** Edits that change Madden's OVR recompute (it recomputes from attributes on import,
 *  so a bare OVR/position/archetype change must reshape the skill attributes to match). */
const RECONCILE_TRIGGERS = new Set(['overall', 'position', 'archetype']);

export function applyEdits(prospects: MdcProspect[], edits?: ClassEdits): void {
  if (!edits) return;
  for (const [pickStr, patch] of Object.entries(edits)) {
    const p = prospects[Number(pickStr) - 1];
    if (!p || !patch) continue;
    for (const [k, raw] of Object.entries(patch)) {
      if (k === 'firstName' || k === 'lastName' || k === 'homeTown') {
        if (typeof raw === 'string') p[k] = raw.slice(0, k === 'lastName' ? 20 : 16);
        continue;
      }
      if (k === 'bodyType') {
        if (BODY_TYPES.includes(String(raw))) p.bodyType = String(raw);
        continue;
      }
      // Face pick: a gen_* generic head code. Drive it via PEPS (M26Writer routes a
      // GEN_ PEPS into visuals.genericHeadName); mirror into visuals for safety.
      if (k === 'genericHeadName') {
        const code = String(raw);
        if (/^gen_\d/i.test(code)) {
          p.PEPS = code;
          ((p.visuals ??= {}) as { genericHeadName?: string }).genericHeadName = code;
        }
        continue;
      }
      const v = Number(raw);
      if (!Number.isFinite(v)) continue;
      const [lo, hi] = EDIT_CLAMP[k] ?? [0, 99];
      p[k] = Math.max(lo, Math.min(hi, Math.round(v)));
    }
    // If the OVR/position/archetype changed, re-solve the skill attributes so Madden's
    // in-game recompute matches the edited OVR — then re-apply any explicit rating edits
    // from this patch so a hand-tuned rating still wins over the reconciliation.
    if (Object.keys(patch).some((k) => RECONCILE_TRIGGERS.has(k))) {
      reconcileToTarget(p, Number(p.position), Number(p.archetype), Number(p.overall));
      for (const [k, raw] of Object.entries(patch)) {
        if (!RATING_KEYS.includes(k)) continue;
        const v = Number(raw);
        if (Number.isFinite(v)) p[k] = Math.max(0, Math.min(99, Math.round(v)));
      }
    }
  }
}

/** Per-player gear overrides keyed by pick -> { slot: assetName } (slot is
 *  helmet/cleats/gloves/visor). Applied on top of the era-default loadout at
 *  export so the user's equipment-editor picks win. */
export type GearEdits = Record<string, Record<string, string>>;

/** Apply gear overrides onto each prospect's PlayerOnField loadout in place. */
export function applyGearEdits(prospects: MdcProspect[], gearEdits?: GearEdits): void {
  if (!gearEdits) return;
  for (const [pickStr, slots] of Object.entries(gearEdits)) {
    const p = prospects[Number(pickStr) - 1];
    if (!p || !slots) continue;
    const visuals = (p.visuals ?? {}) as { loadouts?: Array<{ loadoutType?: string; loadoutElements?: Array<{ slotType?: string; itemAssetName: string }> }> };
    const loadout = visuals.loadouts?.[0];
    if (!loadout) continue;
    const els = (loadout.loadoutElements ??= []);
    for (const [slot, asset] of Object.entries(slots)) {
      if (!asset) continue;
      // Facemask is a SLOTLESS element (itemAssetName GearFaceMask_*, no slotType):
      // replace the existing prefix-matched element or push a new one.
      if (slot === 'facemask') {
        const existing = els.find((e) => !e.slotType && e.itemAssetName?.startsWith('GearFaceMask_'));
        if (existing) existing.itemAssetName = asset;
        else els.push({ itemAssetName: asset });
        continue;
      }
      for (const slotType of GEAR_SLOT_TYPES[slot] ?? []) {
        const existing = els.find((e) => e.slotType === slotType);
        if (existing) existing.itemAssetName = asset;
        else els.push({ slotType, itemAssetName: asset });
      }
    }
  }
}

/** Zero a block's 200-byte attribute section so the game ignores it. */
function neutralizeBlock(buf: Buffer, blockIndex: number): void {
  const attrStart = MDC_DATA_START + blockIndex * MDC_BLOCK_SIZE + 0x1000;
  if (attrStart + 200 > buf.length) return;
  buf.fill(0, attrStart, attrStart + 200);
}

export const DraftClassBuilder = {
  /** Build prospect objects for export (block i = pick i), honoring the cap. */
  buildProspects(
    players: BaselinePlayer[],
    mode: GenMode = 'madden',
    opts: GenOptions = {}
  ): {
    prospects: MdcProspect[];
    truncated: boolean;
    dropped: string[];
    likeness: LikenessStats;
  } {
    const capped = players.slice(0, LOGICAL_CAPACITY);
    const dropped = players.slice(LOGICAL_CAPACITY).map((p) => `${p.firstName} ${p.lastName}`.trim());
    const portraitMap = PortraitSlotService.pidMap(capped);

    // Resolve each player's M26 position, then even out the two cohorts the source
    // data badly over-concentrates: edges (nearly all labeled "LE" -> LEDG, ~85/15)
    // and off-ball LBs (nearly all "MLB" -> MIKE, ~80-98%). Side/role is cosmetic
    // within each cohort (LEDG/REDG share the EDGE group; SAM/MIKE/WILL share LB),
    // so round-robin each to an even split — deterministic, so preview == export.
    let posIds = capped.map((p) => PositionMapper.resolve(p.firstName, p.lastName, p.position, p.weight));
    posIds = PositionMapper.balanceCohort(posIds, [10, 11]); // LEDG / REDG (side is cosmetic — same build)
    // SAM/MIKE/WILL by build, but leave curated 'backers (Ray Lewis, Lavonte David…) pinned.
    const lockedLb = capped.map((p) => PositionMapper.overrideId(p.firstName, p.lastName) != null);
    posIds = PositionMapper.balanceLbByBuild(posIds, capped.map((p) => p.weight), lockedLb);
    const items: RankedItem[] = capped.map((player, index) => {
      const posId = posIds[index];
      return { player, index, posId, caliber: RatingService.caliber(player, posId), overall: 0, devTrait: 0 };
    });

    if (mode === 'retro') {
      // Career-retrospective: OVR reflects how good they actually turned out
      // (uncapped wAV caliber), dev from that caliber. NOT Madden-shaped.
      for (const it of items) {
        it.overall = it.caliber;
        it.devTrait = devFromCaliber(it.caliber, it.player);
      }
    } else {
      // Madden-realistic: rank by caliber, then map each rank to Madden's
      // empirical OVR curve + dev-trait rates (real Madden class shape).
      const N = items.length || 1;
      const strength = opts.strength && opts.strength > 0 ? opts.strength : 1;
      const studs = Math.max(0, Math.round(opts.studs ?? 0));
      // A stronger class raises the ceiling above the usual realistic 85 cap.
      const capMax = Math.round(85 + Math.max(0, strength - 1) * 40);
      [...items]
        .sort((a, b) => b.caliber - a.caliber)
        .forEach((it, rank) => {
          const topFrac = (rank + 0.5) / N; // 0 = best player in the class
          const base = CalibrationService.ovrAtPercentile(1 - topFrac);
          it.overall = Math.min(capMax, Math.round(base * strength));
          it.devTrait = isElite(it.player) ? 3 : CalibrationService.devForTopFraction(topFrac);
          if (rank < studs) {
            it.overall = Math.max(it.overall, 80); // guaranteed first-round caliber
            it.devTrait = Math.max(it.devTrait, 2);
          }
          if (opts.generational && rank === 0) {
            it.overall = Math.max(it.overall, 90); // a can't-miss #1
            it.devTrait = 3;
          }
        });
    }

    const built = items.map((it) => toProspect(it, portraitMap.get(it.index)));
    const likeness: LikenessStats = {
      asset: built.filter((b) => b.kind === 'asset').length,
      generic: built.filter((b) => b.kind === 'generic').length,
      withPortrait: capped.filter((p) => p.photoId != null).length,
      customPortrait: portraitMap.size,
    };
    return { prospects: built.map((b) => b.prospect), truncated: dropped.length > 0, dropped, likeness };
  },

  /** Full JSON preview of the generated class for the UI: per-player bio, photo,
   *  and the complete editable attribute set (no .mdc written). */
  preview(players: BaselinePlayer[], mode: GenMode = 'madden', opts: GenOptions = {}): PreviewResult {
    const capped = players.slice(0, LOGICAL_CAPACITY);
    const portraitMap = PortraitSlotService.pidMap(capped);
    const { prospects, likeness } = this.buildProspects(players, mode, opts);
    const rows: PreviewRow[] = prospects.map((p, i) => {
      const peps = String(p.PEPS || '').toLowerCase();
      const face: 'asset' | 'generic' | 'photo' = portraitMap.has(i)
        ? 'photo'
        : peps.startsWith('gen_')
          ? 'generic'
          : 'asset';
      const base = capped[i];
      const ratings: Record<string, number> = {};
      for (const k of RATING_KEYS) ratings[k] = Number(p[k]) || 0;
      return {
        id: i + 1,
        pick: i + 1,
        firstName: String(p.firstName ?? ''),
        lastName: String(p.lastName ?? ''),
        position: PositionMapper.name(Number(p.position)),
        positionId: Number(p.position),
        overall: Number(p.overall),
        devTrait: Number(p.devTrait),
        archetype: Number(p.archetype) || 0,
        archetypeName: LookupService.idToName('archetype', Number(p.archetype) || 0) || '',
        round: base.draftRound,
        draftPick: base.draftPick,
        // Predicted players (pre-1960 / missing wAV): show the draft-slot estimate
        // (matches what actually drives their OVR) instead of the raw/absent value.
        wav: base.wavSource === 'predicted' ? RatingService.predictedWav(base) : base.wav,
        wavSource: base.wavSource,
        face,
        skinTone: Number(base.race) >= 1 && Number(base.race) <= 8 ? Number(base.race) : 4,
        genericHead: peps.startsWith('gen_') ? String(p.PEPS) : null,
        college: base.college,
        age: Number(p.age) || 0,
        heightInches: Number(p.heightInches) || 0,
        weight: Number(p.weight) || 0,
        jersey: Number(p.jerseyNum) || 0,
        bodyType: String(p.bodyType || 'Standard'),
        photoUrl: base.pfrImageUrl || base.wikiImageUrl || null,
        portrait: (() => {
          const plpo = PortraitService.plpoFor(Number(p.PID) || 0, base.race, `${base.firstName}|${base.lastName}|${i}`);
          return plpo ? `/api/portrait/plpo/${plpo}` : null;
        })(),
        combine: base.combine ?? null,
        ratings,
      };
    });
    return { rows, likeness, count: rows.length };
  },

  /** Build a complete, importable .mdc buffer from baseline players, applying
   *  any user edits (keyed by pick) on top of the deterministic base class. */
  buildMdc(players: BaselinePlayer[], edits?: ClassEdits, mode: GenMode = 'madden', gearEdits?: GearEdits, opts: GenOptions = {}): BuildResult {
    const { prospects, truncated, dropped, likeness } = this.buildProspects(players, mode, opts);
    applyEdits(prospects, edits);
    applyGearEdits(prospects, gearEdits);
    const template = MdcService.loadTemplate();
    const buffer = MdcService.write(prospects, template);
    // Neutralize unused logical blocks so leftover template prospects don't appear.
    for (let i = prospects.length; i < LOGICAL_CAPACITY; i++) {
      neutralizeBlock(buffer, i);
    }
    return { buffer, count: prospects.length, truncated, dropped, likeness };
  },
};
