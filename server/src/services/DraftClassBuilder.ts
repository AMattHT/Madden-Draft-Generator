import { MdcService, MdcProspect } from './MdcService';
import { Mdc27Service } from './Mdc27Service';
import { assignM27Fields, commentaryIdFor } from './M27Fields';
import { generateAttributes, reconcileToTarget, RATING_KEYS } from './AttributeModel';
import { EraBioService } from './EraBioService';
import { HometownService } from './HometownService';
export { RATING_KEYS } from './AttributeModel';
import { PersonaService } from './PersonaService';
import { LookupService } from './LookupService';
import { PositionMapper } from './PositionMapper';
import { RatingService } from './RatingService';
import { CalibrationService } from './CalibrationService';
import { ArchetypeService } from './ArchetypeService';
import { NflverseCareerService } from './NflverseCareerService';
import { OVRWeightsCalculator } from './OVRWeightsCalculator';
import { LikenessService, LikenessKind } from './LikenessService';
import { EraGearService } from './EraGearService';
import { PhotoLookService } from './PhotoLookService';
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

// Position-appropriate jersey number pools (used only when no real number is known).
// Era matters: the NFL only standardised numbering in 1973 (before that receivers
// wore 20s-40s, linebackers 30s-80s), 90s went to defenders from the mid-80s, and
// 2021 opened single digits to skill players.
const JERSEY_POOLS: Record<string, Array<[number, number]>> = {
  QB: [[1, 19]], RB: [[20, 39]], WR: [[10, 19], [80, 89]], TE: [[80, 89]], OL: [[60, 79]],
  EDGE: [[90, 99], [50, 59]], IDL: [[90, 99], [70, 79]], LB: [[50, 59], [90, 99]], CB: [[20, 39]], S: [[20, 39]],
  K: [[1, 9]], P: [[1, 9]], LS: [[40, 49]],
};
const JERSEY_POOLS_PRE1973: Record<string, Array<[number, number]>> = {
  ...JERSEY_POOLS,
  WR: [[20, 49], [80, 89]], TE: [[80, 89], [40, 49]], EDGE: [[70, 89]], IDL: [[70, 79]], LB: [[50, 69], [30, 39]],
  RB: [[20, 49]], CB: [[20, 49]], S: [[20, 49]],
};
function jerseyFor(group: string, rand: () => number, year = 2000): number {
  const pools = year < 1973 ? JERSEY_POOLS_PRE1973 : year < 1986 && (group === 'EDGE' || group === 'IDL' || group === 'LB') ? JERSEY_POOLS_PRE1973 : JERSEY_POOLS;
  let ranges = pools[group] ?? [[1, 99]];
  if (year >= 2021 && (group === 'RB' || group === 'WR' || group === 'CB' || group === 'S' || group === 'LB')) ranges = [[1, 9], ...ranges];
  const total = ranges.reduce((s, [lo, hi]) => s + (hi - lo + 1), 0);
  let x = Math.floor(rand() * total);
  for (const [lo, hi] of ranges) {
    const n = hi - lo + 1;
    if (x < n) return lo + x;
    x -= n;
  }
  return ranges[0][0];
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

/** Convert a ranked player into an M26 prospect: attributes come from Madden's
 *  real per-position profile shifted to the assigned OVR (with small seeded
 *  per-player variance); bio from real data or Madden norms; plus likeness +
 *  era gear. */
function toProspect(it: RankedItem, portraitPid?: number, gameVersion: 'm26' | 'm27' = 'm26', mode: GenMode = 'madden'): { prospect: MdcProspect; kind: LikenessKind } {
  const { player, index, posId, overall, devTrait } = it;
  const posName = PositionMapper.name(posId);
  const profile = CalibrationService.positionProfile(posName, gameVersion);
  const rand = seededRng(`${player.firstName}|${player.lastName}|${player.draftYear}|${index}`);

  // Bio first (real measurements when we have them, else Madden per-position
  // norms) — the physical build decides the archetype, the way Madden does it.
  // Missing measurements come from the player's own era, not today's norms (a 1952
  // tackle is ~235 lb, not 318).
  const eraBuild = player.heightInches == null || player.weight == null ? EraBioService.sample(player.draftYear, PositionMapper.groupFromId(posId), rand, gameVersion) : null;
  const heightInches = player.heightInches ?? eraBuild!.heightInches;
  const weight = Math.max(150, player.weight ?? eraBuild!.weight);

  // Archetype from the real build (heavy back -> Power, lean end -> Speed Rusher),
  // then attributes from THAT archetype's profile so ratings match the role.
  // Archetype from career usage when we have it (Carter = Physical, not Slot),
  // else the closest Madden height/weight profile.
  const career = NflverseCareerService.get(player.firstName, player.lastName, player.draftYear, player.draftPick);
  const archetype = ArchetypeService.assign(posName, heightInches, weight, career, player.combine);
  const { attrs, ovrMean } = CalibrationService.archetypeAttrs(posName, archetype, gameVersion);

  const prospect: MdcProspect = {};
  // Attributes from Madden's own per-position relationships (slope vs overall,
  // spread, range), combine testing scored within the position, then reconciled so
  // the game's on-import OVR recompute equals the OVR we intend (it ignores the
  // OVR byte). Career-retrospective mode is uncapped (legends can exceed the
  // rookie range).
  const generated = generateAttributes({
    posId, profile, archAttrs: attrs, archOvrMean: ovrMean, overall, rand,
    combine: player.combine, uncapped: mode === 'retro',
  });
  Object.assign(prospect, generated);
  prospect.archetype = archetype;
  reconcileToTarget(prospect as Record<string, number>, posId, archetype, overall, gameVersion);

  // Identity.
  prospect.firstName = player.firstName || 'Player';
  prospect.lastName = player.lastName || '';
  prospect.position = posId;
  prospect.college = LookupService.collegeId(player.college);
  const home = HometownService.resolve(player.homeState, player.draftYear, `${player.firstName}|${player.lastName}|${index}`);
  prospect.homeState = home.state;
  prospect.homeTown = home.town;
  prospect.age = player.age ?? CalibrationService.sampleAge(rand, gameVersion);
  prospect.heightInches = heightInches;
  prospect.weight = weight;
  const group = PositionMapper.groupFromId(posId);
  prospect.jerseyNum = (player.jersey || null) ?? (career?.jersey || null) ?? jerseyFor(group, rand, player.draftYear); // 0 = unknown in the source
  prospect.bodyType = bodyTypeFor(group, weight); // Madden build, else inherits the donor block's
  prospect.draftable = 1;
  prospect.draftRound = player.draftRound ?? 63; // 63 = UDFA
  prospect.draftPick = withinRoundPick(player.draftPick);
  prospect.overall = overall;
  prospect.devTrait = devTrait;

  // Likeness: real face asset when the *target game* has one, else a generic.
  // M27 only gets M27-native scans (2015+). M26 legend ids (TestaverdeVinny_19980)
  // are not in M27 — writing them produces the empty NFL-shield silhouette.
  const m27Face = gameVersion === 'm27' ? LikenessService.m27FaceFor(player.firstName, player.lastName, player.draftYear) : null;
  const like = m27Face
    ? { peps: m27Face.assetName, kind: 'asset' as LikenessKind, skinTone: LikenessService.assign(player, index, gameVersion).skinTone }
    : LikenessService.assign(player, index, gameVersion);
  prospect.PEPS = like.peps;
  // Menu portrait. M26: custom-portrait slot, else the generic head's PID, else the
  // real photo id. M27: a year-matched M27 scan's own PID; generic heads get their
  // fixed PID in assignM27Fields (0x94 is a pure function of genericHeadName in the
  // game's files); M26 legend ids are not valid M27 PIDs, so those stay 0.
  prospect.PID = gameVersion === 'm27'
    ? (m27Face?.portraitPid || 0)
    : (portraitPid ?? (like.kind === 'generic' ? (LikenessService.genericPid(like.peps) ?? 0) : (player.photoId ?? 0)));
  // Announcer name call: the game keys this by SURNAME (same id space in both games,
  // mined from the real files). The CSV CommID column is a different id space.
  prospect.commentaryId = commentaryIdFor(player.lastName);

  // Era-appropriate gear (vintage helmet/cleats/gloves, no visor pre-1990).
  // gameVersion selects the verified M27 equipment vocabulary for M27 exports.
  const vis: Record<string, unknown> = {
    loadouts: [EraGearService.loadout(player.draftYear, posId, `${player.firstName}|${player.lastName}|${index}`, gameVersion, player.observedGear)],
  };
  if (like.kind === 'generic' && /^gen_/i.test(like.peps)) {
    vis.genericHeadName = like.peps;
    vis.skinTone = like.skinTone;
  }
  prospect.visuals = vis;

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
  persona?: string[]; // M27 persona DNA trait names (only set when gameVersion='m27')
  /** Why an LB-labeled player landed at edge vs SAM/MIKE/WILL (null for non-LB sources). */
  frontSeven?: { role: string | null; reason: string; scheme: string | null; team: string | null; sackRate: number | null } | null;
  ratings: Record<string, number>;
}

export interface PreviewResult {
  rows: PreviewRow[];
  likeness: LikenessStats;
  count: number;
  /** Players that did not fit the class (years with > 402 rows): the weakest
   *  undrafted players by caliber, never a draftee. */
  dropped: string[];
}

/**
 * Cut a year with more rows than the class holds down to capacity. The source is in
 * draft order, so a naive slice drops whoever happens to be last (1960: Bob Talamini
 * at index 428). Instead drop the lowest-caliber UNDRAFTED players first, then the
 * lowest-caliber late picks, and keep the survivors in their original order.
 */
function fitToCapacity(players: BaselinePlayer[]): { kept: BaselinePlayer[]; dropped: string[] } {
  if (players.length <= LOGICAL_CAPACITY) return { kept: players, dropped: [] };
  // Keep-score = career caliber + what the draft slot promised: a first-round bust
  // stays (he was a real prospect), a 17th-rounder who never played goes first,
  // and an undrafted star (Warner) outranks both of those.
  const score = (p: BaselinePlayer) => {
    const posId = PositionMapper.resolve(p.firstName, p.lastName, p.position, p.weight);
    const slot = p.draftRound != null ? RatingService.slotExpectation(p.draftRound, p.draftPick) : 0;
    return RatingService.caliber(p, posId) + slot;
  };
  const order = players.map((p, i) => ({ i, s: score(p) })).sort((a, b) => a.s - b.s);
  const drop = new Set(order.slice(0, players.length - LOGICAL_CAPACITY).map((o) => o.i));
  const kept = players.filter((_, i) => !drop.has(i));
  const dropped = players.filter((_, i) => drop.has(i)).map((p) => `${p.firstName} ${p.lastName}`.trim());
  return { kept, dropped };
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

export function applyEdits(prospects: MdcProspect[], edits?: ClassEdits, gameVersion: 'm26' | 'm27' = 'm26'): void {
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
      // Persona DNA edit (M27): comma-separated trait id string -> number[]
      // (validated against the DNA enum range, deduped, capped at the 5 slots
      // the draft binary holds). Set before buildMdc27's default assignment,
      // which skips players who already carry an explicit set.
      if (k === 'personaDNA') {
        const ids = String(raw)
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => Number.isFinite(n) && n >= 1 && n <= 63 && n !== 2); // 2 = WinAtAllCosts (game filters it from rookies)
        p.personaDNA = [...new Set(ids)].slice(0, 5);
        continue;
      }
      // Face pick: a gen_* generic head code. Drive it via PEPS (M26Writer routes a
      // GEN_ PEPS into visuals.genericHeadName); mirror into visuals for safety.
      if (k === 'skinTone') {
        const t = Math.max(1, Math.min(8, Number(raw)));
        if (Number.isFinite(t)) ((p.visuals ??= {}) as { skinTone?: number }).skinTone = t;
        continue;
      }
      if (k === 'faceAsset') {
        const asset = String(raw).trim();
        if (asset && !/^gen_/i.test(asset)) {
          p.PEPS = asset;
          const vis = (p.visuals ??= {}) as { genericHeadName?: string };
          delete vis.genericHeadName;
        }
        continue;
      }
      if (k === 'genericHeadName') {
        const code = String(raw);
        if (/^gen_\d/i.test(code)) {
          p.PEPS = code;
          const vis = ((p.visuals ??= {}) as { genericHeadName?: string; skinTone?: number });
          vis.genericHeadName = code;
          const m = code.match(/^gen_(\d+)/i);
          if (m) vis.skinTone = Number(m[1]);
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
      reconcileToTarget(p as Record<string, number>, Number(p.position), Number(p.archetype), Number(p.overall), gameVersion);
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
    opts: GenOptions = {},
    gameVersion: 'm26' | 'm27' = 'm26'
  ): {
    prospects: MdcProspect[];
    truncated: boolean;
    dropped: string[];
    likeness: LikenessStats;
  } {
    const { kept: capped, dropped } = fitToCapacity(players);
    const portraitMap = gameVersion === 'm27' ? new Map<number, number>() : PortraitSlotService.pidMap(capped);

    // Resolve each player's M26 position, then even out the two cohorts the source
    // data badly over-concentrates: edges (nearly all labeled "LE" -> LEDG, ~85/15)
    // and off-ball LBs (nearly all "MLB" -> MIKE, ~80-98%). Side/role is cosmetic
    // within each cohort (LEDG/REDG share the EDGE group; SAM/MIKE/WILL share LB),
    // so round-robin each to an even split — deterministic, so preview == export.
    let posIds = capped.map((p) => PositionMapper.resolve(p.firstName, p.lastName, p.position, p.weight));
    posIds = PositionMapper.balanceCohort(posIds, [10, 11]); // LEDG / REDG (side is cosmetic — same build)
    // Offensive-line sides and safeties: the source lumps tackles as "T"/"OT" (-> LT)
    // and guards as "G" (-> LG), and pre-2001 safeties are split by build. Balance
    // toward Madden's own mix (LT 20 / RT 16, LG 13 / RG 13, FS 16 / SS 16 per
    // class) around the players whose slot came from real data.
    const lockedSlot = capped.map((p) => !!p.positionLocked);
    posIds = PositionMapper.balanceCohortQuota(posIds, { 5: 0.55, 9: 0.45 }, lockedSlot);
    posIds = PositionMapper.balanceCohortQuota(posIds, { 6: 0.5, 8: 0.5 }, lockedSlot);
    posIds = PositionMapper.balanceCohortQuota(posIds, { 17: 0.5, 18: 0.5 }, lockedSlot);
    // SAM/MIKE/WILL by build, but leave pinned 'backers alone: curated overrides (Ray
    // Lewis, Lavonte David…) and front-seven verdicts (3-4 inside backer -> MIKE,
    // coverage backer -> WILL, 4-3 blitzer -> SAM).
    const lockedLb = capped.map(
      (p) => PositionMapper.overrideId(p.firstName, p.lastName) != null || (!!p.frontSeven?.lock && p.frontSeven.role !== 'EDGE' && p.frontSeven.role != null)
    );
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
          const base = CalibrationService.ovrAtPercentile(1 - topFrac, gameVersion);
          it.overall = Math.min(capMax, Math.round(base * strength));
          it.devTrait = isElite(it.player) ? 3 : CalibrationService.devForTopFraction(topFrac, gameVersion);
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

    const built = items.map((it) => toProspect(it, portraitMap.get(it.index), gameVersion, mode));
    const likeness: LikenessStats = {
      asset: built.filter((b) => b.kind === 'asset').length,
      generic: built.filter((b) => b.kind === 'generic').length,
      withPortrait: capped.filter((p) => p.photoId != null).length,
      customPortrait: portraitMap.size,
    };
    return { prospects: built.map((b) => b.prospect), truncated: dropped.length > 0, dropped, likeness };
  },

  /** Full JSON preview of the generated class for the UI: per-player bio, photo,
   *  and the complete editable attribute set (no .mdc written). When
   *  gameVersion='m27', each row also carries its persona DNA trait names. */
  preview(players: BaselinePlayer[], mode: GenMode = 'madden', opts: GenOptions = {}, gameVersion: 'm26' | 'm27' = 'm26'): PreviewResult {
    const { kept: capped } = fitToCapacity(players);
    const portraitMap = gameVersion === 'm27' ? new Map<number, number>() : PortraitSlotService.pidMap(capped);
    const { prospects, likeness, dropped } = this.buildProspects(players, mode, opts, gameVersion);
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
      // Same seed/group/OVR the M27 writer uses, so the UI shows the DNA that exports.
      const persona = gameVersion === 'm27'
        ? PersonaService.dnaFor(
            `${p.firstName}|${p.lastName}`,
            PositionMapper.groupFromId(Number(p.position) || 0),
            Number(p.overall) || 0
          ).map(PersonaService.name)
        : undefined;
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
        photoUrl: PhotoLookService.bestPhotoUrl(base) || null,
        portrait: (() => {
          const plpo = PortraitService.plpoFor(Number(p.PID) || 0, base.race, `${base.firstName}|${base.lastName}|${i}`);
          return plpo ? `/api/portrait/plpo/${plpo}` : null;
        })(),
        combine: base.combine ?? null,
        persona,
        frontSeven: base.frontSeven
          ? { role: base.frontSeven.role, reason: base.frontSeven.reason, scheme: base.frontSeven.scheme, team: base.frontSeven.team, sackRate: base.frontSeven.sackRate }
          : null,
        ratings,
      };
    });
    return { rows, likeness, count: rows.length, dropped };
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

  /** Madden 27 variant: same prospects, but written with the 5876-byte M27 record
   *  layout (Mdc27Service) and persona DNA assigned per prospect (PersonaService).
   *  The M27 writer zeroes unused blocks itself, so no neutralize pass is needed. */
  buildMdc27(players: BaselinePlayer[], edits?: ClassEdits, mode: GenMode = 'madden', gearEdits?: GearEdits, opts: GenOptions = {}): BuildResult {
    const { prospects, truncated, dropped, likeness } = this.buildProspects(players, mode, opts, 'm27');
    applyEdits(prospects, edits, 'm27');
    applyGearEdits(prospects, gearEdits);
    const capped = players.slice(0, LOGICAL_CAPACITY);
    prospects.forEach((p, i) => {
      const posId = Number(p.position) || 0;
      if (!p.personaDNA) {
        // explicit user edit wins
        p.personaDNA = PersonaService.dnaFor(`${p.firstName}|${p.lastName}`, PositionMapper.groupFromId(posId), Number(p.overall) || 0);
      }
      // Birthdate, PersonalityRating, Focus, QB style, body-type enum, hidden bytes,
      // generic-head portrait PID — everything the game fills and reads back verbatim.
      const base = capped[i];
      const career = base ? NflverseCareerService.get(base.firstName, base.lastName, base.draftYear, base.draftPick) : null;
      assignM27Fields(p, { birthDate: career?.birthDate ?? null }, `${p.firstName}|${p.lastName}|${i}`);
    });
    const template = Mdc27Service.loadTemplate();
    const buffer = Mdc27Service.write(prospects, template);
    return { buffer, count: prospects.length, truncated, dropped, likeness };
  },
};
