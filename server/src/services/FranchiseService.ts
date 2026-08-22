import fs from 'fs';
import os from 'os';
import path from 'path';
import { M27_SAVES_DIR } from '../config/paths';
import { GEAR_SLOT_TYPES } from './GearOptionsService';

// madden-franchise is a CommonJS (.cjs) module; require it the way the vendored
// draft-class parser is required. `create()` is a static async factory that returns
// a fully-parsed FranchiseFile. See bep713/madden-franchise (MIT).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const madden = require('madden-franchise');

/** Madden stores cap/salary money in units of $10,000, so $1M = 100 units. */
const UNITS_PER_MILLION = 100;
const toUnits = (millions: number) => Math.round(millions * UNITS_PER_MILLION);
const toMillions = (units: number) => Math.round((Number(units) || 0) / UNITS_PER_MILLION * 10) / 10;

/** Pro-Bowl / free-agent pseudo-teams that carry no real cap and must be skipped. */
const PSEUDO_TEAMS = new Set(['AFC', 'NFC', 'Free Agents', 'Free Agent', 'Rest of NFL', 'AFC Pro Bowl', 'NFC Pro Bowl']);

const CONTRACT_SALARY_FIELDS = Array.from({ length: 8 }, (_, i) => `ContractSalary${i}`);
const CONTRACT_BONUS_FIELDS = Array.from({ length: 8 }, (_, i) => `ContractBonus${i}`);

/** The main franchise Player table + the 32-team Team table (bep713 FranchiseTableId). */
const PLAYER_TABLE_UID = 1612938518;
const TEAM_TABLE_UID = 637929298;
const SEASONGAME_TABLE_UID = 1607878349; // SeasonGame (schedule)
const SEASONINFO_TABLE_UID = 3123991521; // SeasonInfo (current week/type/year)
const ROSTERINFO_TABLE_UID = 2907326382; // RosterInfo (MaxFreeAgentsSize etc. — read-only)
const DRAFTPICK_FUTURE_POOL_UID = 2546719563; // future draft-pick pool (OriginalTeam vs CurrentTeam)
const CHARVISUALS_TABLE_UID = 1429178382; // CharacterVisuals (RawData = loadout JSON, table3 blob)
// UI dev-tier <-> the franchise Player.TraitDevelopment enum. The enum aliases each
// tier: value 0=Normal, 1=College_Impact(=Star), 2=College_Star(=Superstar),
// 3=College_Elite(=XFactor) — verified from a real save. We WRITE the plain display
// names (the lib rejects numeric ordinals and accepts 'Star'/'Superstar'/'XFactor'
// directly), and READ by mapping the stored College_* aliases back to display names.
const DEV_ENUM: Record<string, string> = {
  Normal: 'Normal',
  Star: 'Star',
  Superstar: 'Superstar',
  XFactor: 'XFactor',
};
const DEV_LABEL: Record<string, string> = {
  Normal: 'Normal',
  College_Impact: 'Star', Star: 'Star',
  College_Star: 'Superstar', Superstar: 'Superstar',
  College_Elite: 'XFactor', XFactor: 'XFactor',
};
type DevTier = 'Normal' | 'Star' | 'Superstar' | 'XFactor';

/** Attribute keys (camelCase, same as the draft-class editor) <-> franchise "<Name>Rating" fields. */
const RATING_KEYS = [
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
const RATING_FIELD_OVERRIDE: Record<string, string> = { ballCarrierVision: 'BCVisionRating', pressCoverage: 'PressRating' };
const ratingField = (k: string) => RATING_FIELD_OVERRIDE[k] || `${k.charAt(0).toUpperCase()}${k.slice(1)}Rating`;

/** Franchise position enum values (verified from a real save). */
const FRANCHISE_POSITIONS = new Set([
  'QB', 'HB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'LE', 'RE', 'DT', 'LOLB', 'MLB', 'ROLB',
  'CB', 'FS', 'SS', 'K', 'P', 'LS',
]);
const clamp99 = (v: number) => Math.max(0, Math.min(99, Math.round(v)));

export interface CapResetOptions {
  clearDeadMoney?: boolean; // zero this/next-year cap penalties (default true)
  capRoomMode?: 'off' | 'freed' | 'fixed'; // 'freed' = add cleared penalties to room; 'fixed' = set to fixedCapRoomM
  fixedCapRoomM?: number; // $M, used when capRoomMode==='fixed' (the "aggressive" lever)
  rolloverFloorM?: number; // $M floor for RolloverCap (0 = leave alone)
  salaryScale?: number | null; // EXPERIMENTAL: scale all contracts to this fraction (0-1); null/undefined = off
  outputName?: string; // output file name (default derived)
}

export interface TeamCapChange {
  name: string;
  salaryM: number;
  before: { deadMoneyM: number; nextDeadMoneyM: number; capRoomM: number; rolloverM: number };
  after: { deadMoneyM: number; nextDeadMoneyM: number; capRoomM: number; rolloverM: number };
}

export interface CapResetResult {
  input: string;
  output: string;
  outputPath: string;
  teamsEdited: number;
  playersScaled: number;
  teams: TeamCapChange[];
}

export type GameVersion = 'm26' | 'm27';

function savesDir(gameVersion: GameVersion = 'm26'): string {
  if (gameVersion === 'm27') return M27_SAVES_DIR;
  return process.env.MADDEN_SAVES_DIR || path.join(os.homedir(), 'Documents', 'Madden NFL 26', 'Saves');
}

/** Open a franchise save and refuse one from the other game: the M27 contract
 *  model and enums differ, so a tool written against one must not touch the other. */
async function openSave(inputPath: string, gameVersion: GameVersion): Promise<any> {
  const expected = gameVersion === 'm27' ? 27 : 26;
  const file = await madden.create(inputPath, { autoParse: true });
  const year = Number(file.gameYear) || null;
  if (year && year !== expected) {
    throw new Error(`${path.basename(inputPath)} is a Madden ${year} franchise; switch the game version to Madden ${year} to edit it`);
  }
  return file;
}

const missingFieldsSeen = new Set<string>();
/**
 * Write one record field, verified. madden-franchise's record proxy accepts ANY
 * property name (a typo or a field renamed in M27 becomes a phantom property and
 * the old code counted it as a successful edit). This checks the field exists in
 * the table schema, writes it, and reports whether the stored value actually
 * changed. Missing fields are skipped with a one-time warning (or thrown when
 * `required`), so a tool never claims work it did not do.
 */
function writeField(rec: any, name: string, value: unknown, required = false): boolean {
  const fields = rec?.fields as Record<string, any> | undefined;
  const field = fields?.[name];
  if (!field) {
    if (required) throw new Error(`field ${name} does not exist in this save's schema`);
    if (!missingFieldsSeen.has(name)) {
      missingFieldsSeen.add(name);
      console.warn(`[franchise] field ${name} not in this save's schema - skipped`);
    }
    return false;
  }
  let before: unknown;
  try { before = field.value; } catch { before = undefined; }
  try {
    rec[name] = value;
  } catch (e) {
    throw new Error(`field ${name}: ${(e as Error).message}`);
  }
  let after: unknown;
  try { after = field.value; } catch { after = value; }
  return String(after) !== String(before);
}

/** A valid CAREER-* output name (so Madden lists it), derived from the input, never the input itself. */
function outputNameFor(inputName: string, suffix: string, override?: string): string {
  if (override) return override;
  const base = inputName.replace(/-AUTOSAVE$/i, '').replace(/-(CAPRESET|PLAYERS|EDITED|ROSTER|RELOCATE|REBRAND)(-.*)?$/i, '');
  return `${base}-${suffix}`;
}

export interface PlayerEditOptions {
  healInjuries?: boolean; // clear injuries + IR league-wide
  setDev?: { scope: 'all' | 'rookies'; tier: 'Normal' | 'Star' | 'Superstar' | 'XFactor' } | null;
  outputName?: string;
}

export interface PlayerEditResult {
  input: string;
  output: string;
  outputPath: string;
  playersConsidered: number;
  injuriesCleared: number;
  devSet: number;
}

export interface FranchisePlayer {
  id: number; // Player-table row index (stable within the file)
  firstName: string;
  lastName: string;
  position: string;
  teamIndex: number;
  team: string;
  overall: number;
  age: number;
  yearsPro: number;
  dev: string; // Normal | Star | Superstar | XFactor
  jersey: number;
  status: string;
  ratings: Record<string, number>;
  // Appearance (Standard/Thin/Muscular/Heavy build; gen_* head; current gear asset ids)
  bodyType: string;
  genericHead: string;
  helmet: string;
  facemask: string;
}

export interface FranchisePlayersResult {
  teams: { index: number; name: string }[];
  players: FranchisePlayer[];
}

export interface PlayerFieldEdit {
  overall?: number;
  age?: number;
  position?: string;
  dev?: string;
  jersey?: number;
  ratings?: Record<string, number>;
  bodyType?: string; // Standard | Thin | Muscular | Heavy
  genericHead?: string; // gen_* code
  gear?: Record<string, string>; // slot -> asset (helmet/facemask), written into the loadout JSON
}

export interface RosterApplyResult {
  input: string;
  output: string;
  outputPath: string;
  playersEdited: number;
}

export interface RgbColor { r: number; g: number; b: number; }

/** A team's editable identity as read from the Team record. Note: in a franchise save
 *  the TeamIdentity/City/Stadium catalog tables are empty — the Team record itself is
 *  the source of truth for names/city/abbreviation/colors/logo. */
export interface TeamIdentity {
  teamIndex: number;
  displayName: string;    // DisplayName (team/mascot name)
  nickName: string;       // NickName
  city: string;           // LongName (the city/location text)
  abbreviation: string;   // ShortName (scoreboard tricode)
  prefix: string;         // TEAM_PREFIX_NAME
  logoId: number;         // TEAM_LOGO
  hasSecondaryColor: boolean;
  primary: RgbColor;      // TEAM_BACKGROUNDCOLOR R/G/B
  secondary: RgbColor;    // TEAM_BACKGROUNDCOLOR R2/G2/B2
  hub: RgbColor;          // HubBackgroundColor R/G/B (menu/hub theming)
  locked: boolean;        // TEAM_LOCKED
}

export interface FranchiseTeamsResult {
  input: string;
  teams: TeamIdentity[];
}

export interface RelocateRebrandOptions {
  teamIndex: number;         // REQUIRED — which of the 32 real teams (0..31)
  displayName?: string;      // DisplayName (max 18)
  nickName?: string;         // NickName (max 18; defaults to displayName)
  city?: string;             // LongName / city text (max 16) — present => RELOCATE
  abbreviation?: string;     // ShortName (max 8)
  prefix?: string;           // TEAM_PREFIX_NAME (max 4)
  primary?: RgbColor;        // TEAM_BACKGROUNDCOLOR R/G/B
  secondary?: RgbColor;      // TEAM_BACKGROUNDCOLOR R2/G2/B2 (sets TEAM_HAS_SECONDARY_COLOR)
  hub?: RgbColor;            // HubBackgroundColor R/G/B
  logoId?: number;           // TEAM_LOGO (0..2047)
  setRelocatedFlag?: boolean;
  outputName?: string;
}

export interface FieldChange { field: string; before: string | number; after: string | number; }

export interface RelocateRebrandResult {
  input: string;
  output: string;
  outputPath: string;
  teamIndex: number;
  mode: 'REBRAND' | 'RELOCATE';
  teamName: string;          // resulting DisplayName
  wasLocked: boolean;
  changes: FieldChange[];    // before -> after for every field actually written
  skippedFields: string[];   // fields that threw (range/enum/length) and were skipped
}

export interface TraitRealismOptions {
  includeUnsigned?: boolean; // default false: Signed roster only (~1698)
  xfactorCap?: number;       // default 36 (~1/team)
  superstarCap?: number;     // default 72 (~2/team)
  dryRun?: boolean;          // compute + report counts, do NOT write a file
  outputName?: string;
  /** Position-aware (default true): X-Factor / Superstar quotas per position follow
   *  the save's own census, so an 89 guard is a Star while an 89 edge is a
   *  Superstar, the way EA rates them. false = pure overall thresholds. */
  positionAware?: boolean;
}

export interface TraitTierCounts { Normal: number; Star: number; Superstar: number; XFactor: number; }

export interface AdvanceRosterOptions {
  years?: number;            // seasons to advance (default 1, max 10)
  retire?: boolean;          // retire players past their position's age (default true)
  regress?: boolean;         // decline overalls past the position's peak (default true)
  devDowngrade?: boolean;    // drop dev tiers on aging stars (default true)
  includeUnsigned?: boolean; // default false: Signed roster only
  dryRun?: boolean;
  outputName?: string;
}
export interface AdvanceRosterResult {
  input: string; output: string; outputPath: string; dryRun: boolean; years: number;
  playersConsidered: number; aged: number; retired: number; regressed: number; devDowngraded: number;
  avgAgeBefore: number; avgAgeAfter: number; avgOvrBefore: number; avgOvrAfter: number;
  retirements: Array<{ name: string; position: string; team: string; age: number; overall: number }>;
  declines: Array<{ name: string; position: string; team: string; age: number; from: number; to: number }>;
}

/** Typical last season by position (NFL careers; QB/K/P last longest, backs shortest). */
const RETIRE_AGE: Record<string, number> = {
  QB: 38, K: 40, P: 40, LS: 38, HB: 31, RB: 31, FB: 32, WR: 33, TE: 34,
  LT: 35, LG: 34, C: 35, RG: 34, RT: 35, LE: 33, RE: 33, LEDG: 33, REDG: 33, DT: 33,
  LOLB: 33, ROLB: 33, MLB: 33, SAM: 33, MIKE: 33, WILL: 33, CB: 32, FS: 33, SS: 33,
};
/** Age after which overall starts to decline, by position. */
const PEAK_AGE: Record<string, number> = {
  QB: 34, K: 36, P: 36, LS: 35, HB: 27, RB: 27, FB: 29, WR: 30, TE: 30,
  LT: 31, LG: 31, C: 32, RG: 31, RT: 31, LE: 30, RE: 30, LEDG: 30, REDG: 30, DT: 30,
  LOLB: 30, ROLB: 30, MLB: 30, SAM: 30, MIKE: 30, WILL: 30, CB: 29, FS: 30, SS: 30,
};

export interface TraitUpgrade {
  name: string; position: string; team: string; overall: number; age: number;
  from: DevTier; to: DevTier;
}

export interface TraitRealismResult {
  input: string;
  output: string;      // '' when dryRun
  outputPath: string;  // '' when dryRun
  dryRun: boolean;
  playersConsidered: number;
  changed: number;
  before: TraitTierCounts;
  after: TraitTierCounts;
  byPosition: Record<string, TraitTierCounts>;
  notable: TraitUpgrade[]; // up to 40, elevated promotions first then OVR desc
}

export interface ScheduleGame {
  away: string;        // '' when unassigned (NULL ref / placeholder)
  home: string;
  played: boolean;
  awayScore: number;
  homeScore: number;
  status: string;      // GameStatus enum
  day: string;         // DayOfWeek enum
  time: string;        // formatted kickoff ('' if unset)
  timeMinutes: number; // raw TimeOfDay
  gameId: number;      // SeasonGameID (stable)
}
export interface ScheduleWeek { stage: string; seasonWeek: number; label: string; games: ScheduleGame[]; }
export interface FranchiseScheduleResult {
  input: string;
  seasonYear: number;
  currentStage: string;
  currentWeek: number;
  weeks: ScheduleWeek[];
}

export interface FaTrimOptions {
  ovrThreshold?: number; // delete FAs with OverallRating < this (default 65; 0 = don't cut by OVR)
  ageThreshold?: number; // ALSO delete FAs with Age >= this (0/undefined = off)
  targetN?: number;      // after threshold cuts, delete worst-OVR FAs until pool == targetN (0 = off)
  dryRun?: boolean;
  outputName?: string;
}
export interface FaTrimVictim { name: string; position: string; overall: number; age: number; }
export interface FaTrimResult {
  input: string;
  output: string;      // '' when dryRun
  outputPath: string;  // '' when dryRun
  dryRun: boolean;
  freeAgentsBefore: number;
  trimmed: number;
  freeAgentsAfter: number;
  maxFreeAgents: number; // RosterInfo.MaxFreeAgentsSize (informational; never written)
  victims: FaTrimVictim[]; // up to 60, worst-OVR first
}

export interface DraftPickResetOptions { dryRun?: boolean; outputName?: string; }
export interface DraftPickRestore {
  round: number; pickNumber: number; yearOffset: number;
  fromTeam: string; // current owner (being reverted)
  toTeam: string;   // original owner (restored)
}
export interface DraftPickResetResult {
  input: string;
  output: string;      // '' when dryRun
  outputPath: string;  // '' when dryRun
  dryRun: boolean;
  poolRows: number;    // non-empty rows in the future-pool table
  traded: number;      // rows where CurrentTeam != OriginalTeam (OriginalTeam non-null)
  restored: number;
  restores: DraftPickRestore[]; // up to 100
}

/** A CAREER franchise save (not a CAREERDRAFT draft class). */
export interface FranchiseFileInfo {
  name: string;
  sizeBytes: number;
  modified: number;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(num(v))));
const clampLogo = (v: number) => Math.max(0, Math.min(2047, Math.round(num(v))));
const trunc = (s: unknown, max: number) => String(s ?? '').slice(0, max);

/** Kickoff time from TimeOfDay minutes-past-midnight -> 'h:mm AM/PM' ('' if unset). */
const fmtKick = (mins: number): string => {
  if (!Number.isFinite(mins) || mins <= 0) return '';
  const h = Math.floor(mins / 60), m = mins % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
};
/** Display label from SeasonWeekType + 0-based SeasonWeek (regular season shows week+1). */
const weekLabel = (stage: string, sw: number): string => {
  switch (stage) {
    case 'PreSeason': return `Preseason ${sw + 1}`;
    case 'RegularSeason': return `Week ${sw + 1}`;
    case 'WildcardPlayoff': return 'Wild Card';
    case 'DivisionalPlayoff': return 'Divisional';
    case 'ConferencePlayoff': return 'Conference';
    case 'SuperBowl': return 'Super Bowl';
    default: return stage || `Week ${sw + 1}`;
  }
};
const STAGE_ORDER: Record<string, number> = {
  PreSeason: 0, RegularSeason: 1, WildcardPlayoff: 2, DivisionalPlayoff: 3, ConferencePlayoff: 4, SuperBowl: 5,
};

const bitsNull = (b: string) => /^0+$/.test(b);

interface CvHandle { row: any; obj: any; els: Array<{ slotType?: string; itemAssetName: string }>; }
/** Resolve a player's CharacterVisuals ref -> its CV-table row + parsed PlayerOnField
 *  loadout elements. Returns null if the ref is NULL or the visuals overflow (none do
 *  in practice — verified 0/3194) or don't parse. RawData is a table3 blob holding JSON. */
function cvLoadout(file: any, cvTable: any, playerRec: any): CvHandle | null {
  try {
    const raw = String(playerRec.CharacterVisuals ?? '');
    if (bitsNull(raw)) return null;
    const ref = playerRec.getReferenceDataByKey('CharacterVisuals');
    if (!ref || ref.rowNumber == null) return null;
    const row = cvTable.records[ref.rowNumber];
    if (!row) return null;
    let overflow = ''; try { overflow = String(row.Overflow); } catch { /* */ }
    if (!bitsNull(overflow)) return null; // chained overflow — skip (not observed)
    let data = ''; try { data = String(row.RawData); } catch { return null; }
    const obj = JSON.parse(data);
    const lo = (obj.loadouts || []).find((l: { loadoutType?: string }) => l.loadoutType === 'PlayerOnField');
    if (!lo) return null;
    return { row, obj, els: (lo.loadoutElements ??= []) };
  } catch { return null; }
}
const helmetOf = (els: Array<{ slotType?: string; itemAssetName: string }>) => els.find((e) => e.slotType === 'HeadWear')?.itemAssetName ?? '';
const facemaskOf = (els: Array<{ slotType?: string; itemAssetName: string }>) => els.find((e) => !e.slotType && String(e.itemAssetName || '').startsWith('GearFaceMask_'))?.itemAssetName ?? '';

async function findTeamTable(file: any): Promise<any | null> {
  for (const t of file.tables || []) {
    const cap = t.header?.recordCapacity ?? 0;
    if (cap < 20 || cap > 64) continue;
    const fnames = (t.schema?.attributes || []).map((a: any) => a.name);
    if (fnames.includes('SalCapCapRoom') && fnames.includes('TEAM_SALARY')) return t;
  }
  return null;
}

export const FranchiseService = {
  savesDir,

  /** List CAREER franchise saves in the Madden Saves directory. */
  listFranchises(gameVersion: GameVersion = 'm26'): FranchiseFileInfo[] {
    const dir = savesDir(gameVersion);
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => /^CAREER-/i.test(f) && !/^CAREERDRAFT/i.test(f))
      .map((f) => {
        const st = fs.statSync(path.join(dir, f));
        return { name: f, sizeBytes: st.size, modified: st.mtimeMs };
      })
      .sort((a, b) => b.modified - a.modified);
  },

  /** Apply a salary-cap reset to a franchise save, writing a NEW file (never the input). */
  async capReset(fileName: string, opts: CapResetOptions = {}, gameVersion: GameVersion = 'm26'): Promise<CapResetResult> {
    const dir = savesDir(gameVersion);
    const inputPath = path.join(dir, fileName);
    if (!fs.existsSync(inputPath)) throw new Error(`franchise not found: ${fileName}`);

    const clearDeadMoney = opts.clearDeadMoney !== false;
    const capRoomMode = opts.capRoomMode ?? 'freed';
    const fixedCapRoom = capRoomMode === 'fixed' ? toUnits(opts.fixedCapRoomM ?? 150) : 0;
    const rolloverFloor = opts.rolloverFloorM ? toUnits(opts.rolloverFloorM) : 0;
    const scale = opts.salaryScale != null && opts.salaryScale > 0 && opts.salaryScale < 1 ? opts.salaryScale : null;

    // Output: <input>-CAPRESET, kept a valid CAREER-* name so Madden lists it.
    const base = fileName.replace(/-AUTOSAVE$/i, '').replace(/-CAPRESET.*$/i, '');
    const outputName = opts.outputName || `${base}-CAPRESET`;
    const outputPath = path.join(dir, outputName);
    if (path.resolve(outputPath) === path.resolve(inputPath)) throw new Error('refusing to overwrite the input file');

    const file = await openSave(inputPath, gameVersion);
    const tt = await findTeamTable(file);
    if (!tt) throw new Error('team cap table not found in this franchise');
    await tt.readRecords();

    const teams: TeamCapChange[] = [];
    for (const r of tt.records) {
      if (r.isEmpty) continue;
      let name: string;
      try { name = String(r.DisplayName || r.LongName || `#${r.index}`); } catch { name = `#${r.index}`; }
      const salary = num(r.TEAM_SALARY);
      if (PSEUDO_TEAMS.has(name) || salary === 0) continue;

      const before = {
        deadMoneyM: toMillions(r.ThisYearCapPenalties),
        nextDeadMoneyM: toMillions(r.NextYearCapPenalties),
        capRoomM: toMillions(r.SalCapCapRoom),
        rolloverM: toMillions(r.RolloverCap),
      };
      const freed = num(r.ThisYearCapPenalties);

      if (capRoomMode === 'fixed') { try { r.SalCapCapRoom = fixedCapRoom; } catch { /* field range */ } }
      else if (capRoomMode === 'freed' && clearDeadMoney) { try { r.SalCapCapRoom = num(r.SalCapCapRoom) + freed; } catch { /* */ } }

      if (clearDeadMoney) {
        try { r.ThisYearCapPenalties = 0; } catch { /* */ }
        try { r.NextYearCapPenalties = 0; } catch { /* */ }
      }
      if (rolloverFloor && num(r.RolloverCap) < rolloverFloor) { try { r.RolloverCap = rolloverFloor; } catch { /* */ } }

      teams.push({
        name, salaryM: toMillions(salary), before,
        after: {
          deadMoneyM: toMillions(r.ThisYearCapPenalties),
          nextDeadMoneyM: toMillions(r.NextYearCapPenalties),
          capRoomM: toMillions(r.SalCapCapRoom),
          rolloverM: toMillions(r.RolloverCap),
        },
      });
    }

    // EXPERIMENTAL: scale down player contracts (lowers each team's summed cap hits).
    // M26 keeps the per-year salary/bonus arrays on the Player row; M27 moved them
    // to a PlayerContract row reached through the player's Contract reference
    // (SalaryYear0-9, BonusYear0-6, plus guarantees/void years we leave alone).
    let playersScaled = 0;
    if (scale != null) {
      const pt = file.getTableByName('Player');
      if (pt) {
        await pt.readRecords();
        const contractTable = gameVersion === 'm27' ? file.getTableByName('PlayerContract') : null;
        if (contractTable) await contractTable.readRecords();
        const scaledContracts = new Set<number>();
        for (const r of pt.records) {
          if (r.isEmpty) continue;
          let touched = false;
          if (contractTable) {
            let status = '';
            try { status = String(r.ContractStatus); } catch { /* */ }
            if (status === 'Deleted' || status === 'None') continue;
            let ref: { rowNumber?: number } | null = null;
            try { ref = r.getReferenceDataByKey('Contract'); } catch { ref = null; }
            const row = ref?.rowNumber != null ? contractTable.records[ref.rowNumber] : null;
            if (row && !scaledContracts.has(ref!.rowNumber!)) {
              scaledContracts.add(ref!.rowNumber!);
              for (let i = 0; i <= 9; i++) {
                for (const f of [`SalaryYear${i}`, `BonusYear${i}`]) {
                  if (!row.fields?.[f]) continue;
                  const v = num(row[f]);
                  if (v > 0 && writeField(row, f, Math.max(0, Math.round(v * scale)))) touched = true;
                }
              }
            }
            const cap = num(r.PLYR_CAPSALARY);
            if (cap > 0 && writeField(r, 'PLYR_CAPSALARY', Math.max(0, Math.round(cap * scale)))) touched = true;
          } else {
            if (num(r.ContractLength) <= 0) continue;
            for (const f of [...CONTRACT_SALARY_FIELDS, ...CONTRACT_BONUS_FIELDS, 'PLYR_CAPSALARY']) {
              try {
                const v = num(r[f]);
                if (v > 0 && writeField(r, f, Math.max(0, Math.round(v * scale)))) touched = true;
              } catch { /* field absent/range */ }
            }
          }
          if (touched) playersScaled++;
        }
      }
    }

    await file.save(outputPath, {});
    return {
      input: fileName,
      output: outputName,
      outputPath,
      teamsEdited: teams.length,
      playersScaled,
      teams,
    };
  },

  /** Bulk player edits over the franchise Player table (heal injuries, set dev traits).
   *  Direct field writes only — the same low-risk pattern as the cap reset. New file. */
  async playerEdit(fileName: string, opts: PlayerEditOptions = {}, gameVersion: GameVersion = 'm26'): Promise<PlayerEditResult> {
    const dir = savesDir(gameVersion);
    const inputPath = path.join(dir, fileName);
    if (!fs.existsSync(inputPath)) throw new Error(`franchise not found: ${fileName}`);
    const outputName = outputNameFor(fileName, 'PLAYERS', opts.outputName);
    const outputPath = path.join(dir, outputName);
    if (path.resolve(outputPath) === path.resolve(inputPath)) throw new Error('refusing to overwrite the input file');

    const file = await openSave(inputPath, gameVersion);
    const pt = file.getTableByUniqueId(PLAYER_TABLE_UID) || file.getTableByName('Player');
    if (!pt) throw new Error('player table not found');
    await pt.readRecords();

    const devVal = opts.setDev ? DEV_ENUM[opts.setDev.tier] : null;
    const injuryZero = ['TotalInjuryDuration', 'MinInjuryDuration', 'MaxInjuryDuration'];
    let considered = 0, injuriesCleared = 0, devSet = 0;

    for (const r of pt.records) {
      if (r.isEmpty) continue;
      let status = '';
      try { status = String(r.ContractStatus); } catch { /* */ }
      if (status === 'Deleted' || status === 'None') continue; // skip tombstones
      considered++;

      if (opts.healInjuries) {
        let wasInjured = false;
        try { if (String(r.InjuryStatus) !== 'Uninjured') wasInjured = true; } catch { /* */ }
        try { if (r.IsInjuredReserve) wasInjured = true; } catch { /* */ }
        const healed = [writeField(r, 'InjuryStatus', 'Uninjured'), writeField(r, 'IsInjuredReserve', false), ...injuryZero.map((f) => writeField(r, f, 0))].some(Boolean);
        if (wasInjured && healed) injuriesCleared++;
      }

      if (opts.setDev && devVal) {
        const inScope = opts.setDev.scope === 'all' || (opts.setDev.scope === 'rookies' && num(r.YearsPro) === 0);
        if (inScope && writeField(r, 'TraitDevelopment', devVal)) devSet++;
      }
    }

    await file.save(outputPath, {});
    return { input: fileName, output: outputName, outputPath, playersConsidered: considered, injuriesCleared, devSet };
  },

  /** Read every editable player from a franchise save (name, team, position, overall,
   *  age, dev, and the full attribute set) for the in-app roster editor. */
  async franchisePlayers(fileName: string, gameVersion: GameVersion = 'm26'): Promise<FranchisePlayersResult> {
    const dir = savesDir(gameVersion);
    const inputPath = path.join(dir, fileName);
    if (!fs.existsSync(inputPath)) throw new Error(`franchise not found: ${fileName}`);
    const file = await openSave(inputPath, gameVersion);

    const teamMap = new Map<number, string>();
    const teams: { index: number; name: string }[] = [];
    const tt = file.getTableByUniqueId(TEAM_TABLE_UID);
    if (tt) {
      await tt.readRecords();
      for (const r of tt.records) {
        if (r.isEmpty) continue;
        let name = '', idx = -1;
        try { name = String(r.DisplayName || ''); } catch { /* */ }
        try { idx = num(r.TeamIndex); } catch { /* */ }
        if (idx < 0 || idx >= 32 || PSEUDO_TEAMS.has(name) || teamMap.has(idx)) continue; // real teams only
        teamMap.set(idx, name);
        teams.push({ index: idx, name });
      }
      teams.sort((a, b) => a.name.localeCompare(b.name));
    }

    const pt = file.getTableByUniqueId(PLAYER_TABLE_UID) || file.getTableByName('Player');
    if (!pt) throw new Error('player table not found');
    await pt.readRecords();

    // CharacterVisuals table holds each player's loadout JSON (helmet/facemask).
    const cvt = file.getTableByUniqueId(CHARVISUALS_TABLE_UID);
    if (cvt) await cvt.readRecords();

    const players: FranchisePlayer[] = [];
    for (const r of pt.records) {
      if (r.isEmpty) continue;
      let status = ''; try { status = String(r.ContractStatus); } catch { /* */ }
      if (status === 'Deleted' || status === 'None') continue;
      const teamIndex = num(r.TeamIndex);
      const ratings: Record<string, number> = {};
      for (const k of RATING_KEYS) { try { ratings[k] = num(r[ratingField(k)]); } catch { ratings[k] = 0; } }
      const cv = cvt ? cvLoadout(file, cvt, r) : null;
      players.push({
        id: r.index,
        firstName: (() => { try { return String(r.FirstName ?? ''); } catch { return ''; } })(),
        lastName: (() => { try { return String(r.LastName ?? ''); } catch { return ''; } })(),
        position: (() => { try { return String(r.Position ?? ''); } catch { return ''; } })(),
        teamIndex,
        team: teamMap.get(teamIndex) || (status === 'FreeAgent' ? 'Free Agent' : ''),
        overall: num(r.OverallRating),
        age: num(r.Age),
        yearsPro: num(r.YearsPro),
        dev: DEV_LABEL[(() => { try { return String(r.TraitDevelopment); } catch { return 'Normal'; } })()] || 'Normal',
        jersey: num(r.JerseyNum),
        status,
        ratings,
        bodyType: (() => { try { return String(r.CharacterBodyType ?? ''); } catch { return ''; } })(),
        genericHead: (() => { try { return String(r.GenericHeadAssetName ?? ''); } catch { return ''; } })(),
        helmet: cv ? helmetOf(cv.els) : '',
        facemask: cv ? facemaskOf(cv.els) : '',
      });
    }
    return { teams, players };
  },

  /** Apply per-player edits from the roster editor to a franchise save (new file). */
  async rosterApply(fileName: string, edits: Record<string, PlayerFieldEdit>, gameVersion: GameVersion = 'm26'): Promise<RosterApplyResult> {
    const dir = savesDir(gameVersion);
    const inputPath = path.join(dir, fileName);
    if (!fs.existsSync(inputPath)) throw new Error(`franchise not found: ${fileName}`);
    const outputName = outputNameFor(fileName, 'ROSTER');
    const outputPath = path.join(dir, outputName);
    if (path.resolve(outputPath) === path.resolve(inputPath)) throw new Error('refusing to overwrite the input file');

    const file = await openSave(inputPath, gameVersion);
    const pt = file.getTableByUniqueId(PLAYER_TABLE_UID) || file.getTableByName('Player');
    if (!pt) throw new Error('player table not found');
    await pt.readRecords();
    const cvt = file.getTableByUniqueId(CHARVISUALS_TABLE_UID);
    if (cvt) await cvt.readRecords();
    const bodyTypes = new Set(['Standard', 'Thin', 'Muscular', 'Heavy']);

    let playersEdited = 0;
    for (const [idStr, e] of Object.entries(edits || {})) {
      const rec = pt.records[Number(idStr)];
      if (!rec || rec.isEmpty) continue;
      let touched = false;
      if (e.overall != null && writeField(rec, 'OverallRating', clamp99(e.overall))) touched = true;
      if (e.age != null && writeField(rec, 'Age', Math.max(18, Math.min(50, Math.round(e.age))))) touched = true;
      if (e.jersey != null && writeField(rec, 'JerseyNum', clamp99(e.jersey))) touched = true;
      if (e.position && FRANCHISE_POSITIONS.has(e.position) && writeField(rec, 'Position', e.position)) touched = true;
      if (e.dev && DEV_ENUM[e.dev] && writeField(rec, 'TraitDevelopment', DEV_ENUM[e.dev])) touched = true;
      if (e.ratings) {
        for (const [k, v] of Object.entries(e.ratings)) {
          if (!RATING_KEYS.includes(k) || v == null) continue;
          if (writeField(rec, ratingField(k), clamp99(Number(v)))) touched = true;
        }
      }
      // Appearance: body type + generic head are direct fields; helmet/facemask live in
      // the CharacterVisuals loadout JSON (RawData table3 blob) — edit in place & rewrite.
      if (e.bodyType && bodyTypes.has(e.bodyType) && writeField(rec, 'CharacterBodyType', e.bodyType)) touched = true;
      if (e.genericHead && /^gen_\d/i.test(e.genericHead) && writeField(rec, 'GenericHeadAssetName', e.genericHead)) touched = true;
      if (e.gear && cvt) {
        const cv = cvLoadout(file, cvt, rec);
        if (cv) {
          let changed = false;
          for (const [slot, asset] of Object.entries(e.gear)) {
            if (!asset) continue;
            if (slot === 'facemask') {
              const el = cv.els.find((x) => !x.slotType && String(x.itemAssetName || '').startsWith('GearFaceMask_'));
              if (el) el.itemAssetName = asset; else cv.els.push({ itemAssetName: asset });
              changed = true;
              continue;
            }
            for (const slotType of GEAR_SLOT_TYPES[slot] ?? []) {
              const el = cv.els.find((x) => x.slotType === slotType);
              if (el) el.itemAssetName = asset; else cv.els.push({ slotType, itemAssetName: asset });
              changed = true;
            }
          }
          if (changed) { try { cv.row.RawData = JSON.stringify(cv.obj); touched = true; } catch { /* */ } }
        }
      }
      if (touched) playersEdited++;
    }

    await file.save(outputPath, {});
    return { input: fileName, output: outputName, outputPath, playersEdited };
  },

  /** Read each real team's editable identity (name, city, abbreviation, colors, logo)
   *  for the relocation/rebrand tool's team picker + before/after preview. Read-only. */
  async franchiseTeams(fileName: string, gameVersion: GameVersion = 'm26'): Promise<FranchiseTeamsResult> {
    const dir = savesDir(gameVersion);
    const inputPath = path.join(dir, fileName);
    if (!fs.existsSync(inputPath)) throw new Error(`franchise not found: ${fileName}`);
    const file = await openSave(inputPath, gameVersion);
    const tt = file.getTableByUniqueId(TEAM_TABLE_UID);
    if (!tt) throw new Error('team table not found');
    await tt.readRecords();

    const rd = (r: any, f: string): string => { try { return String(r[f] ?? ''); } catch { return ''; } };
    const rb = (r: any, f: string): boolean => { try { return !!r[f]; } catch { return false; } };
    const rgb = (r: any, a: string, b: string, c: string): RgbColor => {
      const g = (f: string) => { try { return num(r[f]); } catch { return 0; } };
      return { r: g(a), g: g(b), b: g(c) };
    };

    const teams: TeamIdentity[] = [];
    for (const r of tt.records) {
      if (r.isEmpty) continue;
      const name = rd(r, 'DisplayName');
      const idx = num(r.TeamIndex);
      if (idx < 0 || idx >= 32 || !name || PSEUDO_TEAMS.has(name)) continue;
      teams.push({
        teamIndex: idx,
        displayName: name,
        nickName: rd(r, 'NickName'),
        city: rd(r, 'LongName'),
        abbreviation: rd(r, 'ShortName'),
        prefix: rd(r, 'TEAM_PREFIX_NAME'),
        logoId: (() => { try { return num(r.TEAM_LOGO); } catch { return 0; } })(),
        hasSecondaryColor: rb(r, 'TEAM_HAS_SECONDARY_COLOR'),
        primary: rgb(r, 'TEAM_BACKGROUNDCOLORR', 'TEAM_BACKGROUNDCOLORG', 'TEAM_BACKGROUNDCOLORB'),
        secondary: rgb(r, 'TEAM_BACKGROUNDCOLORR2', 'TEAM_BACKGROUNDCOLORG2', 'TEAM_BACKGROUNDCOLORB2'),
        hub: rgb(r, 'HubBackgroundColorR', 'HubBackgroundColorG', 'HubBackgroundColorB'),
        locked: rb(r, 'TEAM_LOCKED'),
      });
    }
    teams.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return { input: fileName, teams };
  },

  /** Relocate and/or rebrand one team by editing its Team record in place (name, city,
   *  abbreviation, colors, logo). Direct scalar writes only — the same low-risk pattern
   *  as capReset; never touches TeamIndex or row order, so schedule/standings/stats/roster
   *  references (all by index/pointer) stay intact. Writes a NEW file. */
  async relocateRebrand(fileName: string, opts: RelocateRebrandOptions, gameVersion: GameVersion = 'm26'): Promise<RelocateRebrandResult> {
    const dir = savesDir(gameVersion);
    const inputPath = path.join(dir, fileName);
    if (!fs.existsSync(inputPath)) throw new Error(`franchise not found: ${fileName}`);
    if (opts.teamIndex == null || opts.teamIndex < 0 || opts.teamIndex >= 32) throw new Error('teamIndex (0..31) required');

    // A city change reads as a RELOCATE; identity-only is a REBRAND (drives the output suffix).
    const mode: 'REBRAND' | 'RELOCATE' = opts.city != null ? 'RELOCATE' : 'REBRAND';
    const outputName = outputNameFor(fileName, mode, opts.outputName);
    const outputPath = path.join(dir, outputName);
    if (path.resolve(outputPath) === path.resolve(inputPath)) throw new Error('refusing to overwrite the input file');

    const file = await openSave(inputPath, gameVersion);
    const tt = file.getTableByUniqueId(TEAM_TABLE_UID);
    if (!tt) throw new Error('team table not found');
    await tt.readRecords();

    // Locate the ONE target record by TeamIndex, skipping empties + pseudo-teams.
    let target: any = null;
    for (const r of tt.records) {
      if (r.isEmpty) continue;
      let name = ''; try { name = String(r.DisplayName || ''); } catch { /* */ }
      const idx = num(r.TeamIndex);
      if (idx < 0 || idx >= 32 || PSEUDO_TEAMS.has(name)) continue;
      if (idx === opts.teamIndex) { target = r; break; }
    }
    if (!target) throw new Error(`team with TeamIndex ${opts.teamIndex} not found`);

    const changes: FieldChange[] = [];
    const skipped: string[] = [];
    let wasLocked = false; try { wasLocked = !!target.TEAM_LOCKED; } catch { /* */ }

    // Write one field, capturing before->after and swallowing range/enum/length throws.
    const put = (field: string, raw: string | number | boolean) => {
      try {
        let before: string | number = '';
        try { before = typeof raw === 'number' ? num(target[field]) : String(target[field] ?? ''); } catch { /* */ }
        if (!(target.fields as Record<string, unknown> | undefined)?.[field]) { skipped.push(field); return; }
        writeField(target, field, raw, true);
        if (typeof raw !== 'boolean' && String(before) !== String(raw)) changes.push({ field, before, after: raw });
      } catch { skipped.push(field); }
    };

    const nick = opts.nickName ?? opts.displayName;
    if (opts.displayName != null) put('DisplayName', trunc(opts.displayName, 18));
    if (nick != null) put('NickName', trunc(nick, 18));
    if (opts.city != null) put('LongName', trunc(opts.city, 16));
    if (opts.abbreviation != null) put('ShortName', trunc(opts.abbreviation, 8));
    if (opts.prefix != null) put('TEAM_PREFIX_NAME', trunc(opts.prefix, 4));

    if (opts.primary) {
      put('TEAM_BACKGROUNDCOLORR', clampByte(opts.primary.r));
      put('TEAM_BACKGROUNDCOLORG', clampByte(opts.primary.g));
      put('TEAM_BACKGROUNDCOLORB', clampByte(opts.primary.b));
    }
    if (opts.secondary) {
      put('TEAM_BACKGROUNDCOLORR2', clampByte(opts.secondary.r));
      put('TEAM_BACKGROUNDCOLORG2', clampByte(opts.secondary.g));
      put('TEAM_BACKGROUNDCOLORB2', clampByte(opts.secondary.b));
      put('TEAM_HAS_SECONDARY_COLOR', true);
    }
    if (opts.hub) {
      put('HubBackgroundColorR', clampByte(opts.hub.r));
      put('HubBackgroundColorG', clampByte(opts.hub.g));
      put('HubBackgroundColorB', clampByte(opts.hub.b));
    }

    if (opts.logoId != null) put('TEAM_LOGO', clampLogo(opts.logoId));
    if (opts.setRelocatedFlag) put('IsRelocated', true);

    let teamName = ''; try { teamName = String(target.DisplayName || ''); } catch { /* */ }
    await file.save(outputPath, {});
    return { input: fileName, output: outputName, outputPath, teamIndex: opts.teamIndex, mode, teamName, wasLocked, changes, skippedFields: skipped };
  },

  /** Rewrite TraitDevelopment league-wide into a realistic scarcity pyramid (the base game
   *  gives nearly every 85+ an elevated trait). Signed roster only by default. dryRun previews
   *  counts without writing; otherwise writes a new CAREER-*-TRAITS file. */
  async applyTraitRealism(fileName: string, opts: TraitRealismOptions = {}, gameVersion: GameVersion = 'm26'): Promise<TraitRealismResult> {
    const dir = savesDir(gameVersion);
    const inputPath = path.join(dir, fileName);
    if (!fs.existsSync(inputPath)) throw new Error(`franchise not found: ${fileName}`);

    const includeUnsigned = !!opts.includeUnsigned;
    const xCap = opts.xfactorCap ?? 36;
    const sCap = opts.superstarCap ?? 72;
    const dryRun = !!opts.dryRun;

    const outputName = dryRun ? '' : outputNameFor(fileName, 'TRAITS', opts.outputName);
    const outputPath = dryRun ? '' : path.join(dir, outputName);
    if (!dryRun && path.resolve(outputPath) === path.resolve(inputPath)) throw new Error('refusing to overwrite the input file');

    const file = await openSave(inputPath, gameVersion);

    // team-index -> name for readable notable[] entries
    const teamMap = new Map<number, string>();
    const tt = file.getTableByUniqueId(TEAM_TABLE_UID);
    if (tt) {
      await tt.readRecords();
      for (const r of tt.records) {
        if (r.isEmpty) continue;
        let name = '', idx = -1;
        try { name = String(r.DisplayName || ''); } catch { /* */ }
        try { idx = num(r.TeamIndex); } catch { /* */ }
        if (idx < 0 || idx >= 32 || PSEUDO_TEAMS.has(name) || teamMap.has(idx)) continue;
        teamMap.set(idx, name);
      }
    }

    const pt = file.getTableByUniqueId(PLAYER_TABLE_UID) || file.getTableByName('Player');
    if (!pt) throw new Error('player table not found');
    await pt.readRecords();

    interface Work { rec: any; ovr: number; age: number; pos: string; team: string; name: string; cur: DevTier; want: DevTier; hidden: boolean; }
    const work: Work[] = [];
    const before: TraitTierCounts = { Normal: 0, Star: 0, Superstar: 0, XFactor: 0 };
    let considered = 0;

    for (const r of pt.records) {
      if (r.isEmpty) continue;
      let status = ''; try { status = String(r.ContractStatus); } catch { /* */ }
      if (status === 'Deleted' || status === 'None') continue;
      if (!includeUnsigned && status !== 'Signed') continue;
      considered++;

      const ovr = num(r.OverallRating);
      const age = num(r.Age);
      let cur: DevTier = 'Normal';
      let rawDev = '';
      try { rawDev = String(r.TraitDevelopment); cur = (DEV_LABEL[rawDev] as DevTier) || 'Normal'; } catch { /* */ }
      const hidden = rawDev === 'Hidden'; // M27: an undisclosed trait - never touch it
      if (!hidden) before[cur]++;
      // Threshold pass -> desired tier (age nudges up-and-comers, downgrades declining vets).
      let want: DevTier = 'Normal';
      if (ovr >= 92) want = 'XFactor';
      else if (ovr >= 88) want = age >= 31 ? 'Star' : 'Superstar';
      else if (ovr >= 84) want = (ovr >= 86 && age <= 26) ? 'Superstar' : 'Star';
      else if (ovr >= 80) want = age <= 25 ? 'Star' : 'Normal';
      else if (ovr >= 76) want = age <= 23 ? 'Star' : 'Normal';
      else want = 'Normal';
      // Age ceiling: a 34-year-old is not a developing Superstar.
      if (age >= 35 && ovr < 95) want = want === 'Normal' ? 'Normal' : 'Star';
      else if (age >= 33 && want === 'Superstar') want = 'Star';
      let name = '', pos = '';
      try { name = `${String(r.FirstName ?? '')} ${String(r.LastName ?? '')}`.trim(); } catch { /* */ }
      try { pos = String(r.Position ?? ''); } catch { /* */ }
      if (hidden) want = cur; // protected
      work.push({ rec: r, ovr, age, pos, team: teamMap.get(num(r.TeamIndex)) || status, name, cur, want, hidden });
    }
    // Position-aware quotas: EA hands X-Factors/Superstars to some positions far
    // more than others (QB/WR/edge yes, guards/kickers almost never). Use the save's
    // own census per position as the quota, then fill it with the best players at
    // that position; anyone over the quota drops a tier.
    if (opts.positionAware !== false) {
      for (const tier of ['XFactor', 'Superstar'] as DevTier[]) {
        const to: DevTier = tier === 'XFactor' ? 'Superstar' : 'Star';
        const census = new Map<string, number>();
        for (const w of work) if (w.cur === tier && !w.hidden) census.set(w.pos, (census.get(w.pos) ?? 0) + 1);
        const byPos = new Map<string, Work[]>();
        for (const w of work) if (w.want === tier && !w.hidden) byPos.set(w.pos, [...(byPos.get(w.pos) ?? []), w]);
        for (const [pos, pool] of byPos) {
          const quota = Math.max(census.get(pos) ?? 0, pool.some((w) => w.ovr >= 95) ? 1 : 0);
          pool.sort((a, b) => b.ovr - a.ovr || a.age - b.age);
          for (let i = quota; i < pool.length; i++) pool[i].want = to;
        }
      }
    }
    // Enforce league caps: demote lowest-OVR (older first) over the limit.
    const demote = (tier: DevTier, cap: number, to: DevTier) => {
      const pool = work.filter((w) => w.want === tier && !w.hidden).sort((a, b) => a.ovr - b.ovr || b.age - a.age);
      for (let i = 0; i < pool.length - cap; i++) pool[i].want = to;
    };
    demote('XFactor', xCap, 'Superstar');
    demote('Superstar', sCap, 'Star');

    const after: TraitTierCounts = { Normal: 0, Star: 0, Superstar: 0, XFactor: 0 };
    const byPosition: Record<string, TraitTierCounts> = {};
    const notable: TraitUpgrade[] = [];
    let changed = 0;

    for (const w of work) {
      if (w.hidden) continue;
      after[w.want]++;
      (byPosition[w.pos] ??= { Normal: 0, Star: 0, Superstar: 0, XFactor: 0 })[w.want]++;
      if (w.want !== w.cur) {
        changed++;
        notable.push({ name: w.name, position: w.pos, team: w.team, overall: w.ovr, age: w.age, from: w.cur, to: w.want });
        if (!dryRun) writeField(w.rec, 'TraitDevelopment', DEV_ENUM[w.want]);
      }
    }

    const rank: Record<DevTier, number> = { Normal: 0, Star: 1, Superstar: 2, XFactor: 3 };
    notable.sort((a, b) => (rank[b.to] - rank[a.to]) || (b.overall - a.overall));

    if (!dryRun) await file.save(outputPath, {});
    return {
      input: fileName, output: outputName, outputPath, dryRun,
      playersConsidered: considered, changed, before, after, byPosition, notable: notable.slice(0, 40),
    };
  },


  /**
   * Advance the roster N seasons without playing them: everyone ages, players past
   * their position's typical last season retire (ContractStatus = Retired, so the
   * game drops them), overalls decline past the position's peak, and aging stars
   * lose dev tiers. Built for "replay an era" franchises: import a 1985 class into
   * a roster that looks a decade older than the 2026 one.
   */
  async advanceRoster(fileName: string, opts: AdvanceRosterOptions = {}, gameVersion: GameVersion = 'm26'): Promise<AdvanceRosterResult> {
    const dir = savesDir(gameVersion);
    const inputPath = path.join(dir, fileName);
    if (!fs.existsSync(inputPath)) throw new Error(`franchise not found: ${fileName}`);
    const years = Math.max(1, Math.min(10, Math.round(opts.years ?? 1)));
    const retire = opts.retire !== false, regress = opts.regress !== false, devDown = opts.devDowngrade !== false;
    const dryRun = !!opts.dryRun;
    const outputName = dryRun ? '' : outputNameFor(fileName, `AGED${years}`, opts.outputName);
    const outputPath = dryRun ? '' : path.join(dir, outputName);
    if (!dryRun && path.resolve(outputPath) === path.resolve(inputPath)) throw new Error('refusing to overwrite the input file');
    const file = await openSave(inputPath, gameVersion);

    const teamMap = new Map<number, string>();
    const tt = file.getTableByUniqueId(TEAM_TABLE_UID);
    if (tt) {
      await tt.readRecords();
      for (const r of tt.records) {
        if (r.isEmpty) continue;
        let name = '', idx = -1;
        try { name = String(r.DisplayName || ''); } catch { /* */ }
        try { idx = num(r.TeamIndex); } catch { /* */ }
        if (idx < 0 || idx >= 32 || PSEUDO_TEAMS.has(name) || teamMap.has(idx)) continue;
        teamMap.set(idx, name);
      }
    }
    const pt = file.getTableByUniqueId(PLAYER_TABLE_UID) || file.getTableByName('Player');
    if (!pt) throw new Error('player table not found');
    await pt.readRecords();

    // Deterministic per-player jitter so two runs give the same roster.
    const jitter = (seed: string) => { let h = 2166136261; for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
    const DOWN: Record<string, string> = { XFactor: 'Superstar', Superstar: 'Star', Star: 'Normal', Normal: 'Normal' };

    let considered = 0, aged = 0, retired = 0, regressed = 0, devDowngraded = 0;
    let ageSumB = 0, ageSumA = 0, ovrSumB = 0, ovrSumA = 0, n = 0;
    const retirements: AdvanceRosterResult['retirements'] = [];
    const declines: AdvanceRosterResult['declines'] = [];
    for (const r of pt.records) {
      if (r.isEmpty) continue;
      let status = ''; try { status = String(r.ContractStatus); } catch { /* */ }
      if (status === 'Deleted' || status === 'None' || status === 'Retired') continue;
      if (!opts.includeUnsigned && status !== 'Signed') continue;
      considered++;
      const age0 = num(r.Age), ovr0 = num(r.OverallRating);
      let pos = ''; try { pos = String(r.Position ?? ''); } catch { /* */ }
      let name = ''; try { name = `${String(r.FirstName ?? '')} ${String(r.LastName ?? '')}`.trim(); } catch { /* */ }
      const team = teamMap.get(num(r.TeamIndex)) || status;
      const age1 = age0 + years;
      const key = `${name}|${pos}|${age0}`;
      ageSumB += age0; ovrSumB += ovr0; n++;

      // Retire: past the position's age, with a ramp (a 33-year-old HB almost surely, a 31 maybe).
      const retireAge = RETIRE_AGE[pos] ?? 33;
      if (retire && age1 >= retireAge) {
        const over = age1 - retireAge;
        const p = Math.min(1, 0.45 + 0.3 * over) - (ovr0 >= 90 ? 0.25 : ovr0 >= 85 ? 0.1 : 0); // elite players hang on
        if (jitter(key + '|ret') < p) {
          if (!dryRun) writeField(r, 'ContractStatus', 'Retired', true);
          retired++;
          retirements.push({ name, position: pos, team, age: age1, overall: ovr0 });
          ageSumA += age1; ovrSumA += ovr0;
          continue;
        }
      }
      // Age
      if (!dryRun) { writeField(r, 'Age', Math.min(50, age1)); const yp = num(r.YearsPro); writeField(r, 'YearsPro', yp + years); }
      aged++;
      // Regress past the peak: ~1.5 overall per season beyond it (a touch more for backs).
      let ovr1 = ovr0;
      if (regress) {
        const peak = PEAK_AGE[pos] ?? 30;
        const seasonsPast = Math.max(0, age1 - Math.max(peak, age0)) + (age0 > peak ? Math.min(years, age0 - peak) * 0 : 0);
        const yearsPastPeak = Math.max(0, age1 - peak) - Math.max(0, age0 - peak);
        const rate = pos === 'HB' || pos === 'RB' ? 2 : pos === 'QB' || pos === 'K' || pos === 'P' ? 1 : 1.5;
        const drop = Math.round(yearsPastPeak * rate + (yearsPastPeak ? (jitter(key + '|reg') - 0.5) * 2 : 0));
        void seasonsPast;
        if (drop > 0) {
          ovr1 = Math.max(45, ovr0 - drop);
          if (!dryRun) writeField(r, 'OverallRating', ovr1);
          regressed++;
          if (ovr0 - ovr1 >= 3) declines.push({ name, position: pos, team, age: age1, from: ovr0, to: ovr1 });
        }
      }
      // Dev tier: an aging star loses a tier per ~3 seasons past 30.
      if (devDown && age1 >= 31) {
        let cur = ''; try { cur = DEV_LABEL[String(r.TraitDevelopment)] ?? ''; } catch { /* */ }
        if (cur && cur !== 'Normal') {
          const steps = Math.floor((age1 - 28) / 3) - Math.floor((age0 - 28) / 3);
          let next = cur;
          for (let i = 0; i < steps; i++) next = DOWN[next] ?? next;
          if (next !== cur) {
            if (!dryRun) writeField(r, 'TraitDevelopment', DEV_ENUM[next]);
            devDowngraded++;
          }
        }
      }
      ageSumA += age1; ovrSumA += ovr1;
    }
    retirements.sort((a, b) => b.overall - a.overall);
    declines.sort((a, b) => (b.from - b.to) - (a.from - a.to));
    if (!dryRun) await file.save(outputPath, {});
    return {
      input: fileName, output: outputName, outputPath, dryRun, years,
      playersConsidered: considered, aged, retired, regressed, devDowngraded,
      avgAgeBefore: n ? +(ageSumB / n).toFixed(1) : 0, avgAgeAfter: n ? +(ageSumA / n).toFixed(1) : 0,
      avgOvrBefore: n ? +(ovrSumB / n).toFixed(1) : 0, avgOvrAfter: n ? +(ovrSumA / n).toFixed(1) : 0,
      retirements: retirements.slice(0, 60), declines: declines.slice(0, 60),
    };
  },

  /** Read the full season schedule grouped by stage then week. Read-only — cannot corrupt. */
  async franchiseSchedule(fileName: string, gameVersion: GameVersion = 'm26'): Promise<FranchiseScheduleResult> {
    const dir = savesDir(gameVersion);
    const inputPath = path.join(dir, fileName);
    if (!fs.existsSync(inputPath)) throw new Error(`franchise not found: ${fileName}`);
    const file = await openSave(inputPath, gameVersion);

    // Team names indexed BY ROW NUMBER (schedule refs resolve to row number, NOT TeamIndex).
    const teamByRow: string[] = [];
    const tt = file.getTableByUniqueId(TEAM_TABLE_UID);
    if (tt) {
      await tt.readRecords();
      tt.records.forEach((r: any, rowNum: number) => {
        if (r.isEmpty) { teamByRow[rowNum] = ''; return; }
        try { teamByRow[rowNum] = String(r.DisplayName || ''); } catch { teamByRow[rowNum] = ''; }
      });
    }

    // SeasonInfo -> current position + year.
    let seasonYear = 0, currentStage = '', currentWeek = 0;
    const si = file.getTableByUniqueId(SEASONINFO_TABLE_UID);
    if (si) {
      await si.readRecords();
      const r = si.records.find((x: any) => !x.isEmpty);
      if (r) {
        try { seasonYear = num(r.CurrentSeasonYear); } catch { /* */ }
        try { currentStage = String(r.CurrentWeekType); } catch { /* */ }
        try { currentWeek = num(r.CurrentWeek); } catch { /* */ }
      }
    }

    const sg = file.getTableByUniqueId(SEASONGAME_TABLE_UID) || file.getTableByName('SeasonGame');
    if (!sg) throw new Error('SeasonGame table not found');
    await sg.readRecords();

    // Resolve a Team-typed ref to a name, guarding the all-zero NULL ref (which would
    // falsely resolve to row 0 / the 49ers).
    const resolveTeam = (rec: any, key: 'HomeTeam' | 'AwayTeam'): string => {
      try {
        const raw = String(rec[key] ?? '');
        if (/^0*$/.test(raw)) return '';
        const ref = rec.getReferenceDataByKey(key);
        if (!ref || ref.rowNumber == null) return '';
        return teamByRow[ref.rowNumber] || '';
      } catch { return ''; }
    };

    const buckets = new Map<string, ScheduleWeek>();
    for (const rec of sg.records) {
      if (rec.isEmpty) continue;
      let stage = ''; try { stage = String(rec.SeasonWeekType); } catch { /* */ }
      let sw = 0; try { sw = num(rec.SeasonWeek); } catch { /* */ }
      let status = ''; try { status = String(rec.GameStatus); } catch { /* */ }

      const home = resolveTeam(rec, 'HomeTeam');
      const away = resolveTeam(rec, 'AwayTeam');
      if (!home && !away) continue; // empty placeholder row

      const hs = num(rec.HomeScore), as = num(rec.AwayScore);
      const played = status === 'HomeWon' || status === 'AwayWon' || (hs + as) > 0;
      let day = ''; try { day = String(rec.DayOfWeek); } catch { /* */ }
      let tmin = 0; try { tmin = num(rec.TimeOfDay); } catch { /* */ }
      let gid = 0; try { gid = num(rec.SeasonGameID); } catch { /* */ }

      const key = `${STAGE_ORDER[stage] ?? 9}|${String(sw).padStart(2, '0')}`;
      let wk = buckets.get(key);
      if (!wk) { wk = { stage, seasonWeek: sw, label: weekLabel(stage, sw), games: [] }; buckets.set(key, wk); }
      wk.games.push({ away, home, played, awayScore: as, homeScore: hs, status, day, time: fmtKick(tmin), timeMinutes: tmin, gameId: gid });
    }

    const weeks = Array.from(buckets.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([, w]) => w);
    return { input: fileName, seasonYear, currentStage, currentWeek, weeks };
  },

  /** Trim the free-agent pool by OVR/age threshold (optionally trim-to-N by worst OVR).
   *  Flips ContractStatus='Deleted' on matched FreeAgents ONLY — the game-native trim status
   *  (the game itself produces Deleted rows via DeleteExcessFreeAgentsTransaction). Never removes
   *  rows, never touches TeamIndex/contracts, never writes any other status. No pool counter to
   *  update — the game recomputes the FA pool from ContractStatus. dryRun previews without writing;
   *  else writes a new CAREER-*-FATRIM file. */
  async trimFreeAgents(fileName: string, opts: FaTrimOptions = {}, gameVersion: GameVersion = 'm26'): Promise<FaTrimResult> {
    const dir = savesDir(gameVersion);
    const inputPath = path.join(dir, fileName);
    if (!fs.existsSync(inputPath)) throw new Error(`franchise not found: ${fileName}`);

    const ovrThreshold = opts.ovrThreshold ?? 65;
    const ageThreshold = opts.ageThreshold && opts.ageThreshold > 0 ? opts.ageThreshold : 0;
    const targetN = opts.targetN && opts.targetN > 0 ? opts.targetN : 0;
    const dryRun = !!opts.dryRun;

    const outputName = dryRun ? '' : outputNameFor(fileName, 'FATRIM', opts.outputName);
    const outputPath = dryRun ? '' : path.join(dir, outputName);
    if (!dryRun && path.resolve(outputPath) === path.resolve(inputPath)) throw new Error('refusing to overwrite the input file');

    const file = await openSave(inputPath, gameVersion);
    const pt = file.getTableByUniqueId(PLAYER_TABLE_UID) || file.getTableByName('Player');
    if (!pt) throw new Error('player table not found');
    await pt.readRecords();

    // The live FA pool. Status is the ONLY correct discriminator: TeamIndex 32 is shared by
    // Draft prospects, Deleted, None, Created, and even 2 Signed players.
    interface Fa { rec: any; ovr: number; age: number; pos: string; name: string; }
    const pool: Fa[] = [];
    for (const r of pt.records) {
      if (r.isEmpty) continue;
      let status = ''; try { status = String(r.ContractStatus); } catch { /* */ }
      if (status !== 'FreeAgent') continue;   // PRIMARY GATE
      if (num(r.TeamIndex) !== 32) continue;  // belt-and-suspenders: a real FA is always 32
      let name = '', pos = '';
      try { name = `${String(r.FirstName ?? '')} ${String(r.LastName ?? '')}`.trim(); } catch { /* */ }
      try { pos = String(r.Position ?? ''); } catch { /* */ }
      pool.push({ rec: r, ovr: num(r.OverallRating), age: num(r.Age), pos, name });
    }
    const freeAgentsBefore = pool.length;

    const victimSet = new Set<Fa>();
    for (const f of pool) {
      const cutByOvr = ovrThreshold > 0 && f.ovr < ovrThreshold;
      const cutByAge = ageThreshold > 0 && f.age >= ageThreshold;
      if (cutByOvr || cutByAge) victimSet.add(f);
    }
    if (targetN > 0) {
      const survivors = pool.filter((f) => !victimSet.has(f)).sort((a, b) => a.ovr - b.ovr || b.age - a.age);
      let need = (freeAgentsBefore - victimSet.size) - targetN;
      for (let i = 0; i < survivors.length && need > 0; i++, need--) victimSet.add(survivors[i]);
    }

    const victims = Array.from(victimSet).sort((a, b) => a.ovr - b.ovr);
    if (!dryRun) {
      for (const v of victims) writeField(v.rec, 'ContractStatus', 'Deleted', true);
      await file.save(outputPath, {});
    }

    let maxFreeAgents = 750;
    try {
      const ri = file.getTableByUniqueId(ROSTERINFO_TABLE_UID);
      if (ri) { await ri.readRecords(); const r = ri.records.find((x: any) => !x.isEmpty); if (r) maxFreeAgents = num(r.MaxFreeAgentsSize) || 750; }
    } catch { /* informational only */ }

    return {
      input: fileName, output: outputName, outputPath, dryRun,
      freeAgentsBefore, trimmed: victims.length, freeAgentsAfter: freeAgentsBefore - victims.length,
      maxFreeAgents, victims: victims.slice(0, 60).map((v) => ({ name: v.name, position: v.pos, overall: v.ovr, age: v.age })),
    };
  },

  /** Un-trade every traded pick in the FUTURE draft-pick pool by restoring CurrentTeam:=OriginalTeam,
   *  row by row (assign the raw OriginalTeam bitstring — verified write). Targets ONLY the future pool
   *  by uniqueId (2546719563); never the current-draft table (whose SelectedPlayer must not desync).
   *  Guards the all-zero NULL OriginalTeam. Leaves OriginalTeam/Round/PickNumber/YearOffset alone.
   *  dryRun previews; else writes a new CAREER-*-DRAFTPICKS file. On a save with no traded future
   *  picks this is a safe no-op (restored=0). */
  async resetDraftPicks(fileName: string, opts: DraftPickResetOptions = {}, gameVersion: GameVersion = 'm26'): Promise<DraftPickResetResult> {
    const dir = savesDir(gameVersion);
    const inputPath = path.join(dir, fileName);
    if (!fs.existsSync(inputPath)) throw new Error(`franchise not found: ${fileName}`);

    const dryRun = !!opts.dryRun;
    const outputName = dryRun ? '' : outputNameFor(fileName, 'DRAFTPICKS', opts.outputName);
    const outputPath = dryRun ? '' : path.join(dir, outputName);
    if (!dryRun && path.resolve(outputPath) === path.resolve(inputPath)) throw new Error('refusing to overwrite the input file');

    const file = await openSave(inputPath, gameVersion);

    // Team names indexed BY ROW NUMBER (pick refs resolve to row number, NOT TeamIndex).
    const teamByRow: string[] = [];
    const tt = file.getTableByUniqueId(TEAM_TABLE_UID);
    if (tt) {
      await tt.readRecords();
      tt.records.forEach((r: any, rowNum: number) => {
        if (r.isEmpty) { teamByRow[rowNum] = ''; return; }
        try { teamByRow[rowNum] = String(r.DisplayName || ''); } catch { teamByRow[rowNum] = ''; }
      });
    }

    // MUST target by uniqueId — the name 'DraftPick' is shared by the current-draft table and stubs.
    const dp = file.getTableByUniqueId(DRAFTPICK_FUTURE_POOL_UID);
    if (!dp) throw new Error('future draft-pick pool (uid 2546719563) not found');
    await dp.readRecords();

    const isNull = (bits: string) => /^0+$/.test(bits); // full-32-bit zero (row 0 has non-zero tableId bits)
    const resolveTeam = (rec: any, key: 'CurrentTeam' | 'OriginalTeam'): string => {
      try {
        const raw = String(rec[key] ?? '');
        if (isNull(raw)) return '';
        const ref = rec.getReferenceDataByKey(key);
        if (!ref || ref.rowNumber == null) return '';
        return teamByRow[ref.rowNumber] || '';
      } catch { return ''; }
    };

    let poolRows = 0, traded = 0, restored = 0;
    const restores: DraftPickRestore[] = [];

    for (const r of dp.records) {
      if (r.isEmpty) continue;
      poolRows++;
      let origBits = '', curBits = '';
      try { origBits = String(r.OriginalTeam ?? ''); } catch { /* */ }
      try { curBits = String(r.CurrentTeam ?? ''); } catch { /* */ }
      if (!origBits || isNull(origBits)) continue; // never derive a target from a null OriginalTeam
      if (origBits === curBits) continue;          // not traded
      traded++;
      restores.push({
        round: num(r.Round), pickNumber: num(r.PickNumber), yearOffset: num(r.YearOffset),
        fromTeam: resolveTeam(r, 'CurrentTeam'), toTeam: resolveTeam(r, 'OriginalTeam'),
      });
      if (!dryRun) { try { r.CurrentTeam = origBits; restored++; } catch { /* ref/range */ } }
      else restored++;
    }

    if (!dryRun) await file.save(outputPath, {});
    restores.sort((a, b) => a.yearOffset - b.yearOffset || a.round - b.round || a.pickNumber - b.pickNumber);
    return { input: fileName, output: outputName, outputPath, dryRun, poolRows, traded, restored, restores: restores.slice(0, 100) };
  },
};
