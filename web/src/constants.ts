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

/** Every rating the game carries, in Madden's own groups and abbreviations.
 *
 *  The general/physical block leads because it means the same thing everywhere;
 *  after that the columns are position-specific by nature (throw power on a nose
 *  tackle is a floor value, not a scouting signal). That is the cost of showing
 *  all of them, and it is why the table must scroll horizontally rather than
 *  squeeze — see the min-width on the table element. */
export const ATTR_COLUMNS = [
  // General / physical — meaningful at every position, so they lead.
  { id: 'spd', label: 'SPD', key: 'speed' },
  { id: 'acc', label: 'ACC', key: 'acceleration' },
  { id: 'agi', label: 'AGI', key: 'agility' },
  { id: 'cod', label: 'COD', key: 'changeOfDirection' },
  { id: 'str', label: 'STR', key: 'strength' },
  { id: 'jmp', label: 'JMP', key: 'jumping' },
  { id: 'awr', label: 'AWR', key: 'awareness' },
  { id: 'sta', label: 'STA', key: 'stamina' },
  { id: 'tgh', label: 'TGH', key: 'toughness' },
  { id: 'inj', label: 'INJ', key: 'injury' },
  // Ball carrier
  { id: 'car', label: 'CAR', key: 'carrying' },
  { id: 'bcv', label: 'BCV', key: 'ballCarrierVision' },
  { id: 'btk', label: 'BTK', key: 'breakTackle' },
  { id: 'trk', label: 'TRK', key: 'trucking' },
  { id: 'sfa', label: 'SFA', key: 'stiffArm' },
  { id: 'spm', label: 'SPM', key: 'spinMove' },
  { id: 'jkm', label: 'JKM', key: 'jukeMove' },
  // Receiving
  { id: 'cth', label: 'CTH', key: 'catching' },
  { id: 'cit', label: 'CIT', key: 'catchInTraffic' },
  { id: 'spc', label: 'SPC', key: 'spectacularCatch' },
  { id: 'srr', label: 'SRR', key: 'shortRouteRunning' },
  { id: 'mrr', label: 'MRR', key: 'mediumRouteRunning' },
  { id: 'drr', label: 'DRR', key: 'deepRouteRunning' },
  { id: 'rls', label: 'RLS', key: 'release' },
  // Passing
  { id: 'thp', label: 'THP', key: 'throwPower' },
  { id: 'tas', label: 'TAS', key: 'throwAccuracyShort' },
  { id: 'tam', label: 'TAM', key: 'throwAccuracyMid' },
  { id: 'tad', label: 'TAD', key: 'throwAccuracyDeep' },
  { id: 'tor', label: 'TOR', key: 'throwOnTheRun' },
  { id: 'tup', label: 'TUP', key: 'throwUnderPressure' },
  { id: 'pac', label: 'PAC', key: 'playAction' },
  { id: 'bsk', label: 'BSK', key: 'breakSack' },
  // Blocking
  { id: 'pbk', label: 'PBK', key: 'passBlock' },
  { id: 'pbp', label: 'PBP', key: 'passBlockPower' },
  { id: 'pbf', label: 'PBF', key: 'passBlockFinesse' },
  { id: 'rbk', label: 'RBK', key: 'runBlock' },
  { id: 'rbp', label: 'RBP', key: 'runBlockPower' },
  { id: 'rbf', label: 'RBF', key: 'runBlockFinesse' },
  { id: 'lbk', label: 'LBK', key: 'leadBlock' },
  { id: 'ibl', label: 'IBL', key: 'impactBlocking' },
  // Defence
  { id: 'tak', label: 'TAK', key: 'tackle' },
  { id: 'pow', label: 'POW', key: 'hitPower' },
  { id: 'pmv', label: 'PMV', key: 'powerMoves' },
  { id: 'fmv', label: 'FMV', key: 'finesseMoves' },
  { id: 'bsh', label: 'BSH', key: 'blockShedding' },
  { id: 'pur', label: 'PUR', key: 'pursuit' },
  { id: 'prc', label: 'PRC', key: 'playRecognition' },
  { id: 'mcv', label: 'MCV', key: 'manCoverage' },
  { id: 'zcv', label: 'ZCV', key: 'zoneCoverage' },
  { id: 'prs', label: 'PRS', key: 'pressCoverage' },
  // Special teams
  { id: 'kpw', label: 'KPW', key: 'kickPower' },
  { id: 'kac', label: 'KAC', key: 'kickAccuracy' },
  { id: 'kr', label: 'KR', key: 'kickReturn' },
  { id: 'lng', label: 'LNG', key: 'longSnap' },
] as const;
