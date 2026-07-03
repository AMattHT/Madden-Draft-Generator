// Madden 26 position names by id (matches the backend PositionMapper.name).
export const POS_NAMES = [
  'QB', 'HB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'LEDG', 'REDG',
  'DT', 'SAM', 'MIKE', 'WILL', 'CB', 'FS', 'SS', 'K', 'P', 'LS',
];

export const DEV_NAMES = ['Normal', 'Star', 'Superstar', 'X-Factor'];

// Attribute groups for the profile editor (keys match the backend rating keys).
export const ATTR_GROUPS: { title: string; keys: string[] }[] = [
  { title: 'Physical', keys: ['speed', 'acceleration', 'agility', 'changeOfDirection', 'strength', 'awareness', 'jumping', 'stamina', 'injury', 'toughness'] },
  { title: 'Ball Carrier', keys: ['carrying', 'ballCarrierVision', 'breakTackle', 'trucking', 'stiffArm', 'spinMove', 'jukeMove'] },
  { title: 'Receiving', keys: ['catching', 'catchInTraffic', 'spectacularCatch', 'shortRouteRunning', 'mediumRouteRunning', 'deepRouteRunning', 'release'] },
  { title: 'Passing', keys: ['throwPower', 'throwAccuracyShort', 'throwAccuracyMid', 'throwAccuracyDeep', 'throwOnTheRun', 'throwUnderPressure', 'playAction', 'breakSack'] },
  { title: 'Blocking', keys: ['passBlock', 'passBlockPower', 'passBlockFinesse', 'runBlock', 'runBlockPower', 'runBlockFinesse', 'leadBlock', 'impactBlocking'] },
  { title: 'Defense', keys: ['tackle', 'hitPower', 'powerMoves', 'finesseMoves', 'blockShedding', 'pursuit', 'playRecognition', 'manCoverage', 'zoneCoverage', 'pressCoverage'] },
  { title: 'Special Teams', keys: ['kickPower', 'kickAccuracy', 'kickReturn', 'longSnap'] },
];

/** camelCase attribute key -> "Title Case" label. */
export function humanize(k: string): string {
  return k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

/** inches -> feet'inches" */
export function fmtHeight(inches: number): string {
  if (!inches) return '—';
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

// M26 position id -> coarse group (matches backend PositionMapper.groupFromId).
const GROUP_BY_ID = [
  'QB', 'RB', 'RB', 'WR', 'TE', 'OL', 'OL', 'OL', 'OL', 'OL', 'EDGE', 'EDGE',
  'IDL', 'LB', 'LB', 'LB', 'CB', 'S', 'S', 'K', 'P', 'LS',
];

/** M26 position id -> coarse position group (QB, RB, WR, …). */
export function groupForId(id: number): string {
  return GROUP_BY_ID[id] ?? 'QB';
}

/** Position groups in rough draft-board order, for the class composition strip. */
export const POS_GROUP_ORDER = ['QB', 'RB', 'WR', 'TE', 'OL', 'EDGE', 'IDL', 'LB', 'CB', 'S', 'K', 'P', 'LS'];

// The signature attributes that define eliteness for each position group,
// shown as radar axes: [ratingKey, shortAxisLabel].
const KEY_ATTRS: Record<string, [string, string][]> = {
  QB: [['throwPower', 'THP'], ['throwAccuracyShort', 'TAS'], ['throwAccuracyDeep', 'TAD'], ['throwOnTheRun', 'TOR'], ['awareness', 'AWR'], ['speed', 'SPD']],
  RB: [['speed', 'SPD'], ['acceleration', 'ACC'], ['agility', 'AGI'], ['breakTackle', 'BTK'], ['carrying', 'CAR'], ['ballCarrierVision', 'BCV'], ['jukeMove', 'JKM']],
  WR: [['speed', 'SPD'], ['catching', 'CTH'], ['shortRouteRunning', 'SRR'], ['deepRouteRunning', 'DRR'], ['release', 'RLS'], ['agility', 'AGI'], ['catchInTraffic', 'CIT']],
  TE: [['catching', 'CTH'], ['shortRouteRunning', 'SRR'], ['runBlock', 'RBK'], ['speed', 'SPD'], ['strength', 'STR'], ['catchInTraffic', 'CIT']],
  OL: [['runBlock', 'RBK'], ['passBlock', 'PBK'], ['strength', 'STR'], ['awareness', 'AWR'], ['impactBlocking', 'IBL'], ['runBlockPower', 'RBP']],
  EDGE: [['powerMoves', 'PMV'], ['finesseMoves', 'FMV'], ['speed', 'SPD'], ['strength', 'STR'], ['blockShedding', 'BSH'], ['pursuit', 'PUR'], ['tackle', 'TAK']],
  IDL: [['powerMoves', 'PMV'], ['blockShedding', 'BSH'], ['strength', 'STR'], ['tackle', 'TAK'], ['pursuit', 'PUR'], ['playRecognition', 'PRC']],
  LB: [['tackle', 'TAK'], ['speed', 'SPD'], ['pursuit', 'PUR'], ['playRecognition', 'PRC'], ['hitPower', 'POW'], ['zoneCoverage', 'ZCV'], ['blockShedding', 'BSH']],
  CB: [['speed', 'SPD'], ['manCoverage', 'MCV'], ['zoneCoverage', 'ZCV'], ['pressCoverage', 'PRS'], ['acceleration', 'ACC'], ['playRecognition', 'PRC'], ['catching', 'CTH']],
  S: [['speed', 'SPD'], ['zoneCoverage', 'ZCV'], ['manCoverage', 'MCV'], ['tackle', 'TAK'], ['hitPower', 'POW'], ['playRecognition', 'PRC'], ['pursuit', 'PUR']],
  K: [['kickPower', 'KPW'], ['kickAccuracy', 'KAC'], ['awareness', 'AWR']],
  P: [['kickPower', 'KPW'], ['kickAccuracy', 'KAC'], ['awareness', 'AWR']],
  LS: [['longSnap', 'LS'], ['awareness', 'AWR'], ['strength', 'STR']],
};

const DEFAULT_ATTRS: [string, string][] = [
  ['speed', 'SPD'], ['strength', 'STR'], ['awareness', 'AWR'], ['acceleration', 'ACC'], ['agility', 'AGI'], ['jumping', 'JMP'],
];

export function keyAttrsForPosition(positionId: number): [string, string][] {
  return KEY_ATTRS[GROUP_BY_ID[positionId] ?? 'QB'] ?? DEFAULT_ATTRS;
}

/** Tier color for an overall/attribute value (gold elite … gray fringe). */
export function tierColor(v: number): string {
  return v >= 90 ? '#f5c518' : v >= 80 ? '#22c55e' : v >= 70 ? '#4b89ff' : v >= 60 ? '#64748b' : '#525252';
}
