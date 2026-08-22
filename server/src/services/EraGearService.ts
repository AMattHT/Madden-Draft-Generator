import fs from 'fs';
import path from 'path';
import { DATA_ROOT } from '../config/paths';
import { PositionMapper } from './PositionMapper';
import { ObservedGear } from '../types/player';
import { GEAR_SLOT_TYPES } from './GearOptionsService';

/**
 * Era-appropriate gear for generated draft prospects. Emits M26 visual-JSON
 * loadout elements (slotType + itemAssetName) that M26Writer merges into each
 * block's PlayerOnField loadout, so a 1965 class looks period-correct (vintage
 * helmet/cleats, taped or no gloves, NO visor) instead of modern.
 *
 * Asset names + era brackets come from equipment-years.json (the same data the
 * Editor Suite's EquipmentAssignmentService uses for retro rosters). We set the
 * era-defining slots whose asset vocabulary is verified valid against both that
 * data and the live template (helmet, cleats, gloves, visor, facemask).
 *
 * Facemask is a SLOTLESS loadout element (itemAssetName GearFaceMask_*, no slotType
 * — verified in the template); for the vintage eras we force a period-correct
 * two-bar/three-bar mask (universal-compatible, so it sits right on the Riddell TK
 * shell). Modern eras keep the helmet's default facemask.
 */

interface EraDefaults {
  helmet: string[] | null;
  shoes: string[] | null;
  gloves: string[] | null;
  linemanGloves?: string[] | null;
  notes?: string;
}

interface EquipmentYears {
  eraDefaults: Record<string, EraDefaults>;
}

let data: EquipmentYears | null = null;

function load(): EquipmentYears {
  if (data) return data;
  data = JSON.parse(fs.readFileSync(path.join(DATA_ROOT, 'equipment-years.json'), 'utf8'));
  return data!;
}

/** Era brackets, matching the Editor Suite's EquipmentAssignmentService. */
function eraBracket(year: number): string {
  if (year <= 1969) return '1960-1969';
  if (year <= 1979) return '1970-1979';
  if (year <= 1989) return '1980-1989';
  if (year <= 1999) return '1990-1999';
  if (year <= 2007) return '2000-2007';
  if (year <= 2013) return '2008-2013';
  if (year <= 2016) return '2014-2016';
  if (year <= 2019) return '2017-2019';
  if (year <= 2022) return '2020-2022';
  return '2023-2025';
}

const SKILL = new Set(['QB', 'RB', 'WR', 'TE', 'CB', 'S']);
const LINE = new Set(['OL', 'IDL', 'EDGE']);

/**
 * Year-accurate helmet mix. Weighted by repeating a shell — not a flat random
 * from the decade list (that put 1989 VSR4s on 1980 rookies and Schutts on
 * 1965 classes). Linemen keep the older shell a year or two longer.
 */
function helmetPool(year: number, group: string): string[] {
  const line = LINE.has(group) || group === 'LB';
  const TK = 'GearHelmet_RiddellTK';
  const STD = 'GearHelmet_Standard'; // Riddell VSR-4
  const SCH = 'GearHelmet_Schutt';
  const XP = 'GearHelmet_AirXP';
  const REV = 'GearHelmet_Revolution';
  const SPD = 'GearHelmet_RevolutionSpeed';
  const FLEX = 'GearHelmet_Speed_Flex';
  const F7 = 'GearHelmet_SchuttF7';
  const V1 = 'GearHelmet_VicisZero1';
  const V2 = 'GearHelmet_VicisZero2';
  const AX = 'GearHelmet_Axiom';

  if (year <= 1979) return [TK];
  if (year <= 1983) return line ? [TK, TK, TK, TK, STD] : [TK, TK, TK, STD];
  if (year <= 1986) return line ? [TK, TK, STD, STD, SCH] : [TK, STD, STD, SCH];
  if (year <= 1989) return line ? [TK, STD, STD, SCH] : [STD, STD, SCH, TK];
  if (year <= 1994) return [STD, STD, SCH, XP];
  if (year <= 1999) return [STD, SCH, XP, XP];
  if (year <= 2003) return [REV, REV, STD, SCH];
  if (year <= 2007) return [REV, REV, XP, STD];
  if (year <= 2011) return [REV, SPD, XP];
  if (year <= 2014) return [SPD, SPD, FLEX, XP];
  if (year <= 2017) return [FLEX, SPD, V1, F7];
  if (year <= 2020) return [FLEX, FLEX, V1, F7, SPD];
  if (year <= 2022) return [FLEX, V2, F7, AX, SPD];
  return [FLEX, V2, F7, AX, SPD, 'GearHelmet_VicisZero2Trench'];
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic pick from a list (reproducible per player+slot). */
function pick(arr: string[] | null | undefined, seed: string): string | null {
  if (!arr || arr.length === 0) return null;
  return arr[hash(seed) % arr.length];
}

/** Period-correct facemask by helmet family + position.
 *  Matches the on-field look: QB 2-bar, WR open, LB/EDGE full cage (Bennett). */
function helmetFamily(helmet: string | null): 'vintage' | 'revo' | 'speedflex' | 'f7' | 'vicis' | 'axiom' | 'other' {
  if (!helmet) return 'vintage';
  if (/Speed_Flex|SpeedFlex/i.test(helmet)) return 'speedflex';
  if (/SchuttF7/i.test(helmet)) return 'f7';
  if (/Vicis/i.test(helmet)) return 'vicis';
  if (/Axiom/i.test(helmet)) return 'axiom';
  if (/Revolution/i.test(helmet)) return 'revo';
  return 'vintage';
}

function facemaskPool(helmet: string | null, group: string, year: number): string[] {
  const fam = helmetFamily(helmet);
  const qb = group === 'QB' || group === 'K' || group === 'P';
  const wr = group === 'WR' || group === 'CB';
  const lb = group === 'LB' || group === 'EDGE';
  const back = group === 'RB' || group === 'S' || group === 'TE';

  if (fam === 'vintage') {
    if (qb) return ['GearFaceMask_2Bar'];
    if (wr) return year <= 1979
      ? ['GearFaceMask_2Bar']
      : ['GearFaceMask_Standard2BarWR', 'GearFaceMask_2Bar', 'GearFaceMask_3Bar'];
    if (lb) return year <= 1979
      ? ['GearFaceMask_3Bar']
      : ['GearFaceMask_Robot', 'GearFaceMask_Robot', 'GearFaceMask_RobotRB', 'GearFaceMask_3Bar'];
    if (back) return ['GearFaceMask_3Bar', 'GearFaceMask_RobotRB', 'GearFaceMask_3Bar'];
    return ['GearFaceMask_3Bar'];
  }
  if (fam === 'revo') {
    if (qb) return ['GearFaceMask_revospeed2bar'];
    if (wr) return ['GearFaceMask_revospeed2bar', 'GearFaceMask_revospeed2barSingle'];
    if (lb) return ['GearFaceMask_revoSpeedRobot2', 'GearFaceMask_revoSpeed3barLb'];
    return ['GearFaceMask_revospeed3barstraight', 'GearFaceMask_revoSpeed3barLb'];
  }
  if (fam === 'speedflex') {
    if (qb) return ['GearFaceMask_Speedflex2BarQB', 'GearFaceMask_Speedflex2Bar'];
    if (wr) return ['GearFaceMask_Speedflex_2_Bar_WR', 'GearFaceMask_Speedflex2Bar'];
    if (lb) return ['GearFaceMask_SpeedflexRobot', 'GearFaceMask_Speedflex3BarLB', 'GearFaceMask_SpeedflexCage'];
    if (back) return ['GearFaceMask_Speedflex3BarRB', 'GearFaceMask_SpeedflexRobotRB'];
    return ['GearFaceMask_Speedflex3Bar'];
  }
  if (fam === 'f7') {
    if (qb || wr) return ['GearFaceMask_F72Bar', 'GearFaceMask_F73Bar'];
    if (lb) return ['GearFaceMask_F7FullCage', 'GearFaceMask_F7Robot'];
    return ['GearFaceMask_F73Bar', 'GearFaceMask_F7RobotRB'];
  }
  if (fam === 'vicis') {
    if (qb || wr) return ['GearFaceMask_VicisZero2BAR', 'GearFaceMask_VicisZero12Bar'];
    if (lb) return ['GearFaceMask_VicisZero2RobotLB', 'GearFaceMask_VicisZero2Robot'];
    return ['GearFaceMask_VicisZero23BARRB', 'GearFaceMask_VicisZero13BarRB'];
  }
  if (fam === 'axiom') {
    if (qb || wr) return ['GearFaceMask_Axiom2barsingle', 'GearFaceMask_Axiom3BarSingle'];
    if (lb) return ['GearFaceMask_Axiom3BarLBJagged', 'GearFaceMask_Axiom3BarLBSingle'];
    return ['GearFaceMask_Axiom3BarSingle'];
  }
  return ['GearFaceMask_3Bar'];
}

/** Gloves like the reference photos: none on QBs, cutter gloves on WR/LB by late 80s. */
function glovePoolFor(year: number, group: string, era: EraDefaults): string[] | null {
  if (group === 'QB' || group === 'K' || group === 'P') {
    return year < 2010 ? ['GearHand_None'] : ['GearHand_None', 'GearHand_None', 'GearHand_glove_GenericCutter_White'];
  }
  const cutter = [
    'GearHand_glove_GenericCutter_White',
    'GearHand_glove_GenericCutter_TeamColor',
    'GearHand_glove_GenericCutter_Black',
  ];
  const taped = ['GearHand_None', 'GearHand_tapedHandFinger_White', 'GearHand_tapedHandNormal_White'];
  if (group === 'OL' || group === 'IDL') {
    if (year <= 2007) return ['GearHand_tapedHandFinger_White', 'GearHand_tapedHandNormal_White', 'GearHand_tapedHandMax_White'];
    return era.linemanGloves || era.gloves;
  }
  if (group === 'LB' || group === 'EDGE') {
    if (year < 1986) return taped;
    if (year <= 1999) return [...cutter, 'GearHand_glove_GenericCutter_TeamColor'];
    return era.gloves;
  }
  // WR / RB / TE / CB / S
  if (year < 1984) return taped;
  if (year <= 1989) return [...taped, ...cutter];
  if (year <= 1999) return cutter;
  return era.gloves;
}

/**
 * Era-typical pools for the rest of the loadout — wrist tape/bands, elbow pads,
 * towels (+ on-field position), neck rolls, socks, jersey sleeves, eye black.
 * Asset names are all verified against the gear atlas (same catalog the
 * Equipment Builder shows). Pools are weighted by repetition; '' means "leave
 * the slot unset" so not every player wears everything. Picks are deterministic
 * per player+slot, and mirrored left/right (era defaults stay symmetric —
 * asymmetric signature looks come from copying a real player's gear).
 */
interface EraExtras {
  wristSkill: string[];
  wristLine: string[];
  elbowSkill: string[];
  elbowLine: string[];
  /** Towel on-field positions (Towel_North = front, South = back, West/East = hip). */
  towelSkill: string[];
  towelQB: string[];
  neckRoll: string[]; // LINE + LB only
  socks: string[];
  jersey: string[];
  eyePaintSkill: string[];
}
const NO = ''; // leave slot at template default
const ERA_EXTRAS: Record<string, EraExtras> = {
  // 1960s: same vocabulary as early 70s (leather isn't in the game). TK + tape.
  '1960-1969': {
    wristSkill: ['GearWrist_wristTapedNormal_White', 'GearWrist_wristTapedLite_White', 'GearWrist_None', 'GearWrist_None'],
    wristLine: ['GearWrist_wristTapedMax_White', 'GearWrist_wristTapedNormal_White', 'GearWrist_None'],
    elbowSkill: ['ElbowGear_None', 'ElbowGear_elbowpad_White', 'ElbowGear_None'],
    elbowLine: ['ElbowGear_elbowpad_White', 'ElbowGear_None', 'ElbowGear_None'],
    towelSkill: [NO, NO, NO, 'Towel_South'],
    towelQB: [NO, NO, 'Towel_North'],
    neckRoll: ['GearNeckpad_None', 'GearNeckpad_None', 'GearNeckpad_ButterflyNeckRoll'],
    socks: ['Gear_Socks_High', 'Gear_Socks_High', 'Gear_Socks_Mid'],
    jersey: ['Gear_JerseyStyle_SleeveStandard'],
    eyePaintSkill: ['FaceMarks_None', 'FaceMarks_None', 'EyeBlack_Grease'],
  },
  // 1970s: taped wrists everywhere, elbow pads on skill, high socks, standard
  // sleeves, towels just appearing (QB front), neck rolls on the line/LBs.
  '1970-1979': {
    wristSkill: ['GearWrist_wristTapedNormal_White', 'GearWrist_wristTapedNormal_White', 'GearWrist_wristTapedLite_White', 'GearWrist_wristBandNormal_White', 'GearWrist_None'],
    wristLine: ['GearWrist_wristTapedMax_White', 'GearWrist_wristTapedNormal_White', 'GearWrist_wristTapedNormal_White', 'GearWrist_None'],
    elbowSkill: ['ElbowGear_elbowpad_White', 'ElbowGear_elbowpad_Stripe_White', 'ElbowGear_elbowpad_Black', 'ElbowGear_None'],
    elbowLine: ['ElbowGear_elbowpad_White', 'ElbowGear_elbowpad_Black', 'ElbowGear_elbowpadRubber_Black', 'ElbowGear_None'],
    towelSkill: [NO, NO, 'Towel_South', 'Towel_West'],
    towelQB: ['Towel_North', 'Towel_North', NO],
    neckRoll: ['GearNeckpad_CowboyCollarNeckRoll', 'GearNeckpad_ButterflyNeckRoll', 'GearNeckpad_None'],
    socks: ['Gear_Socks_High', 'Gear_Socks_High', 'Gear_Socks_Mid'],
    jersey: ['Gear_JerseyStyle_SleeveStandard'],
    eyePaintSkill: ['FaceMarks_None', 'FaceMarks_None', 'EyeBlack_Grease'],
  },
  // 1980s: sweatbands + towels boom on skill players, QB coach band appears,
  // elbow pads standard for backs/receivers, neck rolls common up front.
  '1980-1989': {
    wristSkill: ['GearWrist_wristBandNormal_White', 'GearWrist_wristBandNormal_TeamColor', 'GearWrist_wristTapedNormal_White', 'GearWrist_wristBandDouble_White', 'GearWrist_None'],
    wristLine: ['GearWrist_wristBandNormal_White', 'GearWrist_wristTapedMax_White', 'GearWrist_wristTapedNormal_White', 'GearWrist_gloveTapedNormal_White', 'GearWrist_None'],
    elbowSkill: ['ElbowGear_elbowpad_White', 'ElbowGear_elbowpad_Stripe_White', 'ElbowGear_elbowSweatbandFull_White', 'ElbowGear_elbowpad_TeamColor', 'ElbowGear_None'],
    elbowLine: ['ElbowGear_elbowpad_White', 'ElbowGear_elbowpad_Black', 'ElbowGear_elbowpad_Stripe_Black', 'ElbowGear_None'],
    towelSkill: ['Towel_South', 'Towel_South', 'Towel_West', 'Towel_East', NO],
    towelQB: ['Towel_North', 'Towel_North', 'Towel_West'],
    neckRoll: ['GearNeckpad_CowboyCollarNeckRoll', 'GearNeckpad_CowboyCollarNeckRoll', 'GearNeckpad_ButterflyNeckRoll', 'GearNeckpad_None'],
    socks: ['Gear_Socks_High', 'Gear_Socks_Mid', 'Gear_Socks_Mid'],
    jersey: ['Gear_JerseyStyle_SleeveStandard'],
    eyePaintSkill: ['EyeBlack_Grease', 'FaceMarks_EyePaint', 'FaceMarks_None'],
  },
  // 1990s: peak towel era, double wristbands, team-color elbow pads, neck rolls
  // still around for linemen/LBs, sleeves still standard-cut.
  '1990-1999': {
    wristSkill: ['GearWrist_wristBandNormal_TeamColor', 'GearWrist_wristBandDouble_White', 'GearWrist_wristBandCoach_White', 'GearWrist_wristTapedNormal_White', 'GearWrist_None'],
    wristLine: ['GearWrist_gloveTapedNormal_White', 'GearWrist_wristTapedMax_White', 'GearWrist_wristTapedNormal_TeamColor', 'GearWrist_None'],
    elbowSkill: ['ElbowGear_elbowpad_TeamColor', 'ElbowGear_elbowpad_White', 'ElbowGear_elbowSweatbandMedium_TeamColor', 'ElbowGear_elbowpad_Stripe_White', 'ElbowGear_None'],
    elbowLine: ['ElbowGear_elbowpad_Black', 'ElbowGear_elbowpad_TeamColor', 'ElbowGear_elbowpad_White', 'ElbowGear_None'],
    towelSkill: ['Towel_South', 'Towel_SouthWest', 'Towel_SouthEast', 'Towel_West', NO],
    towelQB: ['Towel_North', 'Towel_NorthWest', 'Towel_West'],
    neckRoll: ['GearNeckpad_CowboyCollarNeckRoll', 'GearNeckpad_ButterflyNeckRoll', 'GearNeckpad_None', 'GearNeckpad_None'],
    socks: ['Gear_Socks_Mid', 'Gear_Socks_Mid', 'Gear_Socks_High'],
    jersey: ['Gear_JerseyStyle_SleeveStandard', 'Gear_JerseyStyle_SleeveStandard', 'Gear_JerseyStyle_SleeveTight'],
    eyePaintSkill: ['FaceMarks_EyePaint', 'EyeBlack_Grease', 'EyeBlack_Sticker', 'FaceMarks_None'],
  },
  // 2000s: compression era begins — tight sleeves take over, elbow pads fade to
  // braces, eye-black stickers replace grease, towels stay on skill positions.
  '2000-2007': {
    wristSkill: ['GearWrist_wristBandNormal_TeamColor', 'GearWrist_wristBandCoach_White', 'GearWrist_wristbrace_CompressShort_Black', 'GearWrist_wristTapedNormal_TeamColor', 'GearWrist_None'],
    wristLine: ['GearWrist_gloveTapedNormal_White', 'GearWrist_wristTapedMax_TeamColor', 'GearWrist_wristTapedNormal_White', 'GearWrist_None'],
    elbowSkill: ['ElbowGear_None', 'ElbowGear_None', 'ElbowGear_elbowpad_TeamColor', 'ElbowGear_elbowBrace_TeamColor'],
    elbowLine: ['ElbowGear_elbowpad_Black', 'ElbowGear_elbowpad_TeamColor', 'ElbowGear_None', 'ElbowGear_None'],
    towelSkill: ['Towel_South', 'Towel_SouthWest', 'Towel_SouthEast', NO],
    towelQB: ['Towel_North', 'Towel_NorthWest', NO],
    neckRoll: ['GearNeckpad_None', 'GearNeckpad_None', 'GearNeckpad_CowboyCollarNeckRoll'],
    socks: ['Gear_Socks_Mid', 'Gear_Socks_Low', 'Gear_Socks_Mid'],
    jersey: ['Gear_JerseyStyle_SleeveTight', 'Gear_JerseyStyle_SleeveTight', 'Gear_JerseyStyle_SleeveStandard'],
    eyePaintSkill: ['EyeBlack_Sticker', 'EyeBlack_Sticker', 'FaceMarks_EyePaint', 'FaceMarks_None'],
  },
  // Modern (2008+): minimal pads, tight everything, coach bands on QBs, thin
  // spats appear; towels mostly gone except some skill players.
  '2008-2013': {
    wristSkill: ['GearWrist_wristBandCoach_White', 'GearWrist_wristBandNormal_TeamColor', 'GearWrist_wristbrace_CompressShort_Black', 'GearWrist_None', 'GearWrist_None'],
    wristLine: ['GearWrist_gloveTapedNormal_White', 'GearWrist_wristTapedNormal_TeamColor', 'GearWrist_None', 'GearWrist_None'],
    elbowSkill: ['ElbowGear_None', 'ElbowGear_None', 'ElbowGear_elbowBrace_TeamColor'],
    elbowLine: ['ElbowGear_None', 'ElbowGear_elbowpad_Black', 'ElbowGear_None'],
    towelSkill: ['Towel_South', NO, NO, 'Towel_West'],
    towelQB: ['Towel_North', NO, NO],
    neckRoll: ['GearNeckpad_None'],
    socks: ['Gear_Socks_Low', 'Gear_Socks_Mid', 'Gear_Socks_Low'],
    jersey: ['Gear_JerseyStyle_SleeveTight'],
    eyePaintSkill: ['EyeBlack_Sticker', 'FaceMarks_None', 'EyeBlack_Grease_Smear'],
  },
  '2014-2016': {
    wristSkill: ['GearWrist_wristBandCoach_White', 'GearWrist_wristBandNormal_TeamColor', 'GearWrist_wristBandNormal_White', 'GearWrist_None', 'GearWrist_None'],
    wristLine: ['GearWrist_gloveTapedNormal_White', 'GearWrist_wristTapedNormal_TeamColor', 'GearWrist_None', 'GearWrist_None'],
    elbowSkill: ['ElbowGear_None', 'ElbowGear_None', 'ElbowGear_elbowBrace_TeamColor'],
    elbowLine: ['ElbowGear_None', 'ElbowGear_elbowpad_Black', 'ElbowGear_None'],
    towelSkill: ['Towel_South', NO, NO, 'Towel_SouthWest'],
    towelQB: ['Towel_North', NO, NO],
    neckRoll: ['GearNeckpad_None'],
    socks: ['Gear_Socks_Low', 'Gear_Socks_Low', 'Gear_Socks_Mid'],
    jersey: ['Gear_JerseyStyle_SleeveTight'],
    eyePaintSkill: ['EyeBlack_Sticker', 'FaceMarks_None', 'EyeBlack_Grease_Smear'],
  },
  '2017-2019': {
    wristSkill: ['GearWrist_wristBandCoach_White', 'GearWrist_wristBandNormal_TeamColor', 'GearWrist_wristBandNormal_White', 'GearWrist_None', 'GearWrist_None'],
    wristLine: ['GearWrist_gloveTapedNormal_White', 'GearWrist_wristTapedNormal_TeamColor', 'GearWrist_None', 'GearWrist_None'],
    elbowSkill: ['ElbowGear_None', 'ElbowGear_None', 'ElbowGear_elbowBrace_TeamColor'],
    elbowLine: ['ElbowGear_None', 'ElbowGear_elbowpad_Black', 'ElbowGear_None'],
    towelSkill: ['Towel_South', NO, NO, 'Towel_SouthWest'],
    towelQB: ['Towel_North', 'Towel_North', NO],
    neckRoll: ['GearNeckpad_None'],
    socks: ['Gear_Socks_Low', 'Gear_Socks_Low', 'Gear_Socks_Mid'],
    jersey: ['Gear_JerseyStyle_SleeveTight'],
    eyePaintSkill: ['EyeBlack_Sticker', 'FaceMarks_None', 'EyeBlack_Grease_Smear'],
  },
  '2020-2022': {
    wristSkill: ['GearWrist_wristBandCoach_White', 'GearWrist_wristBandNormal_TeamColor', 'GearWrist_wristBandNormal_White', 'GearWrist_None', 'GearWrist_None'],
    wristLine: ['GearWrist_gloveTapedNormal_White', 'GearWrist_wristTapedNormal_TeamColor', 'GearWrist_None', 'GearWrist_None'],
    elbowSkill: ['ElbowGear_None', 'ElbowGear_None', 'ElbowGear_elbowBrace_TeamColor'],
    elbowLine: ['ElbowGear_None', 'ElbowGear_elbowpad_Black', 'ElbowGear_None'],
    towelSkill: ['Towel_South', NO, NO, 'Towel_SouthWest'],
    towelQB: ['Towel_North', 'Towel_North', NO],
    neckRoll: ['GearNeckpad_None'],
    socks: ['Gear_Socks_Low', 'Gear_Socks_Low', 'Gear_Socks_Mid'],
    jersey: ['Gear_JerseyStyle_SleeveTight'],
    eyePaintSkill: ['EyeBlack_Sticker', 'FaceMarks_None', 'EyeBlack_Grease_Smear'],
  },
  '2023-2025': {
    wristSkill: ['GearWrist_wristBandCoach_White', 'GearWrist_wristBandNormal_TeamColor', 'GearWrist_wristBandNormal_White', 'GearWrist_None', 'GearWrist_None'],
    wristLine: ['GearWrist_gloveTapedNormal_White', 'GearWrist_wristTapedNormal_TeamColor', 'GearWrist_None', 'GearWrist_None'],
    elbowSkill: ['ElbowGear_None', 'ElbowGear_None', 'ElbowGear_elbowBrace_TeamColor'],
    elbowLine: ['ElbowGear_None', 'ElbowGear_elbowpad_Black', 'ElbowGear_None'],
    towelSkill: ['Towel_South', NO, NO, 'Towel_SouthWest'],
    towelQB: ['Towel_North', 'Towel_North', NO],
    neckRoll: ['GearNeckpad_None'],
    socks: ['Gear_Socks_Low', 'Gear_Socks_Low', 'Gear_Socks_Mid'],
    jersey: ['Gear_JerseyStyle_SleeveTight'],
    eyePaintSkill: ['EyeBlack_Sticker', 'FaceMarks_None', 'EyeBlack_Grease_Smear'],
  },
};

export interface LoadoutElement {
  slotType?: string;
  itemAssetName: string;
}

/**
 * M27 gear vocabulary, verified against what the M27 game itself assigns to
 * generated draft classes (CAREERDRAFT-TEST* files, 305 distinct assets).
 * Used for 2000+ brackets when version='m27'. Pre-2000 vintage assets (Riddell
 * TK, taped hands, …) never appear in modern game-generated classes so they
 * can't be verified locally — we keep the M26 vintage vocabulary for those
 * brackets; flagged for in-game eyeballing.
 */
const M27_EQUIPMENT: Record<string, EraDefaults> = {
  '2000-2007': {
    helmet: ['GearHelmet_Revolution', 'GearHelmet_Revolution', 'GearHelmet_AirXP'],
    shoes: ['GearFootwear_shoe_Low_NikeVaporCarbonEliteTD', 'GearFootwear_shoe_Mid_NikeAlphaPro34TD', 'GearFootwear_shoe_Mid_NikeCodeEliteProShark'],
    gloves: ['GearHand_glove_GenericCutter_White', 'GearHand_glove_GenericCutter_TeamColor', 'GearHand_glove_NikeVaporJet4_SecondaryColor'],
    linemanGloves: ['GearHand_glove_NikeDTack_White', 'GearHand_glove_NikeDTack_Black'],
  },
  '2008-2013': {
    helmet: ['GearHelmet_Revolution', 'GearHelmet_RevolutionSpeed', 'GearHelmet_AirXP'],
    shoes: ['GearFootwear_shoe_Mid_NikeLunarBeast', 'GearFootwear_shoe_Mid_NikeAlphaPro34TD', 'GearFootwear_shoe_Low_NikeVaporUntouchable2', 'GearFootwear_shoe_Mid_NikeCodeEliteProShark'],
    gloves: ['GearHand_glove_GenericCutter_White', 'GearHand_glove_NikeVaporJet4_SecondaryColor', 'GearHand_glove_NikeVaporJet5_TeamColor', 'GearHand_glove_NikeSuperBad3_White'],
    linemanGloves: ['GearHand_glove_NikeDTack_White', 'GearHand_glove_NikeDTack_Black'],
  },
  '2014-2016': {
    helmet: ['GearHelmet_RevolutionSpeed', 'GearHelmet_Speed_Flex', 'GearHelmet_AirXP', 'GearHelmet_VicisZero1'],
    shoes: ['GearFootwear_shoe_Low_NikeVaporUntouchable2', 'GearFootwear_shoe_Mid_NikeLunarBeast', 'GearFootwear_shoe_Low_NikeVaporCarbonEliteTD'],
    gloves: ['GearHand_glove_NikeVaporJet5_TeamColor', 'GearHand_glove_NikeVaporJet5_White', 'GearHand_glove_NikeSuperbad5_2019_White', 'GearHand_glove_AdidasFreak_TeamColor'],
    linemanGloves: ['GearHand_glove_NikeDTack_White', 'GearHand_glove_NikeDTack_Black'],
  },
  '2017-2019': {
    helmet: ['GearHelmet_Speed_Flex', 'GearHelmet_VicisZero1', 'GearHelmet_RevolutionSpeed', 'GearHelmet_SchuttF7'],
    shoes: ['GearFootwear_shoe_Low_UnderArmourSpotlight2018', 'GearFootwear_shoe_Low_NikeVaporUntouchable2', 'GearFootwear_shoe_high_AdidasFreakUltra22', 'GearFootwear_shoe_Mid_NikeLunarBeast'],
    gloves: ['GearHand_glove_NikeVaporJet6_TeamColor', 'GearHand_glove_NikeSuperbad5_2019_TeamColor', 'GearHand_glove_JordanFlyLock_White', 'GearHand_glove_AdidasFreak_TeamColor'],
    linemanGloves: ['GearHand_glove_NikeDTack_White', 'GearHand_glove_NikeHyperBeast_Black'],
  },
  '2020-2022': {
    helmet: ['GearHelmet_Speed_Flex', 'GearHelmet_VicisZero2', 'GearHelmet_Axiom', 'GearHelmet_SchuttF7', 'GearHelmet_RevolutionSpeed'],
    shoes: ['GearFootwear_shoe_high_AdidasFreakUltra22', 'GearFootwear_shoe_high_AdidasFreakUltra23', 'GearFootwear_shoe_Low_NikeVaporEdge', 'GearFootwear_shoe_Low_NikeAlphaMenaceElite', 'GearFootwear_shoe_Mid_NikeAlphaMenacePro'],
    gloves: ['GearHand_glove_NikeVaporJet6_TeamColor', 'GearHand_glove_NikeVaporJet6_White', 'GearHand_glove_NikeSuperbad6_TeamColor', 'GearHand_glove_AdidasFreak_TeamColor', 'GearHand_glove_JordanSuperbad6_White'],
    linemanGloves: ['GearHand_glove_NikeDTack_Black', 'GearHand_glove_NikeHyperBeast_Black', 'GearHand_glove_NikeHyperBeast_White'],
  },
  '2023-2025': {
    helmet: ['GearHelmet_Speed_Flex', 'GearHelmet_VicisZero2', 'GearHelmet_VicisZero2Trench', 'GearHelmet_Axiom', 'GearHelmet_SchuttF7', 'GearHelmet_SchuttF7Pro', 'GearHelmet_RevolutionSpeed'],
    shoes: ['GearFootwear_shoe_high_AdidasFreakUltra23', 'GearFootwear_shoe_Low_NikeVaporEdge', 'GearFootwear_shoe_Low_NikeVaporSpeed3', 'GearFootwear_shoe_Low_NikeAlphaMenaceElite3', 'GearFootwear_shoe_Low_NikeEquinox', 'GearFootwear_shoe_low_Adidas_AdizeroElectricPlus', 'GearFootwear_shoe_mid_AdidasAdizeroPrimeKnit', 'GearFootwear_shoe_Mid_NikeFieldGeneral', 'GearFootwear_shoe_low_AirJordanRetro1'],
    gloves: ['GearHand_glove_NikeVaporJet7_TeamColor', 'GearHand_glove_NikeVaporJet7_White', 'GearHand_glove_NikeSuperbad6_TeamColor', 'GearHand_glove_Adizero13_TeamColor', 'GearHand_glove_JordanSuperbad6_TeamColor'],
    linemanGloves: ['GearHand_glove_NikeDTack_Black', 'GearHand_glove_NikeHyperBeast_Black', 'GearHand_glove_NikeHyperBeast_White'],
  },
};

/** M27 substitutions for era-extras assets that M26 had but M27 no longer uses
 *  (verified against M27 game-assigned classes). '' = omit the element — M27
 *  never writes GearHand_None / GearWrist_None; it leaves the slot out. */
const M27_ASSET_FIX: Record<string, string> = {
  EyeBlack_Sticker: 'FaceMarks_EyePaint',
  EyeBlack_Grease: 'FaceMarks_EyePaint',
  EyeBlack_Grease_Smear: 'FaceMarks_EyePaint2',
  EyeBlack_NoseStrip: 'FaceMarks_NoseTape',
  'ElbowGear_elbowpad_Black': 'ElbowGear_elbowpad_TeamColor',
  'GearWrist_wristTapedMax_TeamColor': 'GearWrist_wristTapedMax_White',
  GearWrist_None: '',
  GearHand_None: '',
};

const m27fix = (a: string): string => M27_ASSET_FIX[a] ?? a;

export const EraGearService = {
  /** Build era-appropriate PlayerOnField loadout elements for a prospect.
   *  version='m27' uses the M27-verified equipment vocabulary. */
  loadoutElements(
    year: number,
    m26PosId: number,
    seedKey: string,
    version: 'm26' | 'm27' = 'm26',
    observed?: ObservedGear | null,
  ): LoadoutElement[] {
    const m27 = version === 'm27';
    const bracket = eraBracket(year);
    const era = (m27 && M27_EQUIPMENT[bracket]) || load().eraDefaults[bracket] || load().eraDefaults['1970-1979'];
    if (!era) return [];
    const group = PositionMapper.groupFromId(m26PosId);
    const els: LoadoutElement[] = [];
    const match = !!(observed && observed.onField);
    const choose = (pool: string[] | null | undefined, slot: string): string | null => {
      if (match && pool && pool.length) return pool[0];
      return pick(pool, `${seedKey}|${slot}`);
    };

    const helmet = choose(helmetPool(year, group), 'helmet');
    if (helmet) els.push({ slotType: 'HeadWear', itemAssetName: helmet });

    const mask = choose(facemaskPool(helmet, group, year), 'facemask');
    if (mask) els.push({ itemAssetName: mask });

    const shoe = choose(era.shoes, 'shoe');
    if (shoe) {
      els.push({ slotType: 'LeftShoe', itemAssetName: shoe });
      els.push({ slotType: 'RightShoe', itemAssetName: shoe });
    }

    const glovePool = glovePoolFor(year, group, era);
    let glove: string | null;
    if (match && observed!.gloves === false) {
      glove = version === 'm27' ? '' : 'GearHand_None';
    } else if (match && observed!.gloves === true) {
      const color = observed!.gloveColor || 'team';
      glove = color === 'white'
        ? 'GearHand_glove_GenericCutter_White'
        : color === 'black'
          ? 'GearHand_glove_GenericCutter_Black'
          : 'GearHand_glove_GenericCutter_TeamColor';
    } else if (match && (SKILL.has(group) || group === 'LB' || group === 'EDGE') && group !== 'QB') {
      glove = 'GearHand_glove_GenericCutter_TeamColor';
    } else {
      glove = choose(glovePool, 'glove');
    }
    if (m27 && glove) glove = m27fix(glove);
    if (glove) {
      els.push({ slotType: 'LeftHandWear', itemAssetName: glove });
      els.push({ slotType: 'RightHandWear', itemAssetName: glove });
    }

    let visor: string | null;
    if (year < 1994) visor = 'GearVisor_None';
    else if (match && observed!.visor === 'dark') visor = 'GearVisor_visorClear';
    else if (match && observed!.visor === 'clear') visor = 'GearVisor_visorClear';
    else if (match) visor = 'GearVisor_None';
    else visor = SKILL.has(group)
      ? pick(['GearVisor_None', 'GearVisor_None', 'GearVisor_None', 'GearVisor_visorClear'], `${seedKey}|visor`)
      : 'GearVisor_None';
    if (visor) els.push({ slotType: 'Visor', itemAssetName: visor });

    // Era-typical extras: wrist tape/bands, elbow pads, towels, neck rolls,
    // socks, jersey sleeves, eye black. '' / None picks leave the slot unset.
    const extras = ERA_EXTRAS[bracket];
    if (extras) {
      const skill = SKILL.has(group);
      const line = LINE.has(group);
      const lb = group === 'LB';

      let wrist = pick(skill ? extras.wristSkill : line || lb ? extras.wristLine : null, `${seedKey}|wrist`);
      if (match && observed!.wristband) {
        wrist = skill || lb
          ? 'GearWrist_wristBandNormal_White'
          : 'GearWrist_wristTapedNormal_White';
      } else if (match && observed!.wristband === false) {
        wrist = '';
      }
      if (m27 && wrist) wrist = m27fix(wrist);
      if (wrist) {
        els.push({ slotType: 'LeftWristWear', itemAssetName: wrist });
        els.push({ slotType: 'RightWristWear', itemAssetName: wrist });
      }

      let elbow = pick(skill ? extras.elbowSkill : line || lb ? extras.elbowLine : null, `${seedKey}|elbow`);
      if (match) elbow = 'ElbowGear_None';
      if (m27 && elbow) elbow = m27fix(elbow);
      if (elbow) {
        els.push({ slotType: 'LeftElbowWear', itemAssetName: elbow });
        els.push({ slotType: 'RightElbowWear', itemAssetName: elbow });
      }

      const towel = pick(group === 'QB' ? extras.towelQB : skill ? extras.towelSkill : null, `${seedKey}|towel`);
      if (towel && !match) els.push({ slotType: 'Towel', itemAssetName: towel });

      const neckRoll = pick(line || lb ? extras.neckRoll : null, `${seedKey}|neckRoll`);
      if (neckRoll && neckRoll !== 'GearNeckpad_None' && !match) els.push({ slotType: 'Neckpad', itemAssetName: neckRoll });

      let sock = pick(extras.socks, `${seedKey}|socks`);
      if (match && observed!.socks === 'high') sock = 'Gear_Socks_High';
      else if (match && observed!.socks === 'mid') sock = 'Gear_Socks_Mid';
      else if (match && observed!.socks === 'low') sock = 'Gear_Socks_Low';
      if (sock) els.push({ slotType: 'InnerSocks', itemAssetName: sock });

      const jersey = pick(extras.jersey, `${seedKey}|jersey`);
      if (jersey) els.push({ slotType: 'OuterShirt', itemAssetName: jersey });

      let eyePaint = pick(skill ? extras.eyePaintSkill : null, `${seedKey}|eyePaint`);
      if (match && observed!.eyeBlack) eyePaint = m27 ? 'FaceMarks_EyePaint' : 'EyeBlack_Grease';
      else if (match && observed!.eyeBlack === false) eyePaint = '';
      if (m27 && eyePaint) eyePaint = m27fix(eyePaint);
      if (eyePaint && eyePaint !== 'FaceMarks_None') els.push({ slotType: 'FacePaint', itemAssetName: eyePaint });
    }

    return els;
  },

  /** A full PlayerOnField loadout object for prospect.visuals.loadouts. */
  loadout(year: number, m26PosId: number, seedKey: string, version: 'm26' | 'm27' = 'm26', observed?: ObservedGear | null) {
    return { loadoutType: 'PlayerOnField', loadoutElements: this.loadoutElements(year, m26PosId, seedKey, version, observed) };
  },

  /** Flatten a loadout into editor slot → asset (helmet, gloveLeft, …). */
  slotsFromObserved(
    year: number,
    m26PosId: number,
    observed: ObservedGear,
    version: 'm26' | 'm27' = 'm26',
  ): Record<string, string> {
    const els = this.loadoutElements(year, m26PosId, 'photo-match', version, observed);
    const typeToSlot: Record<string, string> = {};
    for (const [slot, types] of Object.entries(GEAR_SLOT_TYPES)) {
      for (const t of types) typeToSlot[t] = slot;
    }
    const out: Record<string, string> = {};
    for (const e of els) {
      if (!e.itemAssetName) continue;
      if (!e.slotType && e.itemAssetName.startsWith('GearFaceMask_')) {
        out.facemask = e.itemAssetName;
        continue;
      }
      const slot = e.slotType ? typeToSlot[e.slotType] : undefined;
      if (slot) out[slot] = e.itemAssetName;
    }
    return out;
  },

  eraBracket,
};
