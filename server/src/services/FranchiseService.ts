import fs from 'fs';
import os from 'os';
import path from 'path';

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
/** UI dev-tier <-> the franchise Player.TraitDevelopment enum value. */
const DEV_ENUM: Record<string, string> = {
  Normal: 'Normal',
  Star: 'College_Star',
  Superstar: 'College_Impact',
  XFactor: 'College_Elite',
};
const DEV_LABEL: Record<string, string> = { Normal: 'Normal', College_Star: 'Star', College_Impact: 'Superstar', College_Elite: 'XFactor' };

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

function savesDir(): string {
  return process.env.MADDEN_SAVES_DIR || path.join(os.homedir(), 'Documents', 'Madden NFL 26', 'Saves');
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
  listFranchises(): FranchiseFileInfo[] {
    const dir = savesDir();
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
  async capReset(fileName: string, opts: CapResetOptions = {}): Promise<CapResetResult> {
    const dir = savesDir();
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

    const file = await madden.create(inputPath, { autoParse: true });
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
    let playersScaled = 0;
    if (scale != null) {
      const pt = file.getTableByName('Player');
      if (pt) {
        await pt.readRecords();
        for (const r of pt.records) {
          if (r.isEmpty) continue;
          if (num(r.ContractLength) <= 0) continue;
          let touched = false;
          for (const f of [...CONTRACT_SALARY_FIELDS, ...CONTRACT_BONUS_FIELDS, 'PLYR_CAPSALARY']) {
            try {
              const v = num(r[f]);
              if (v > 0) { r[f] = Math.max(0, Math.round(v * scale)); touched = true; }
            } catch { /* field absent/range */ }
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
  async playerEdit(fileName: string, opts: PlayerEditOptions = {}): Promise<PlayerEditResult> {
    const dir = savesDir();
    const inputPath = path.join(dir, fileName);
    if (!fs.existsSync(inputPath)) throw new Error(`franchise not found: ${fileName}`);
    const outputName = outputNameFor(fileName, 'PLAYERS', opts.outputName);
    const outputPath = path.join(dir, outputName);
    if (path.resolve(outputPath) === path.resolve(inputPath)) throw new Error('refusing to overwrite the input file');

    const file = await madden.create(inputPath, { autoParse: true });
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
        try { r.InjuryStatus = 'Uninjured'; } catch { /* */ }
        try { r.IsInjuredReserve = false; } catch { /* */ }
        for (const f of injuryZero) { try { r[f] = 0; } catch { /* */ } }
        if (wasInjured) injuriesCleared++;
      }

      if (opts.setDev && devVal) {
        const inScope = opts.setDev.scope === 'all' || (opts.setDev.scope === 'rookies' && num(r.YearsPro) === 0);
        if (inScope) { try { r.TraitDevelopment = devVal; devSet++; } catch { /* enum/range */ } }
      }
    }

    await file.save(outputPath, {});
    return { input: fileName, output: outputName, outputPath, playersConsidered: considered, injuriesCleared, devSet };
  },

  /** Read every editable player from a franchise save (name, team, position, overall,
   *  age, dev, and the full attribute set) for the in-app roster editor. */
  async franchisePlayers(fileName: string): Promise<FranchisePlayersResult> {
    const dir = savesDir();
    const inputPath = path.join(dir, fileName);
    if (!fs.existsSync(inputPath)) throw new Error(`franchise not found: ${fileName}`);
    const file = await madden.create(inputPath, { autoParse: true });

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

    const players: FranchisePlayer[] = [];
    for (const r of pt.records) {
      if (r.isEmpty) continue;
      let status = ''; try { status = String(r.ContractStatus); } catch { /* */ }
      if (status === 'Deleted' || status === 'None') continue;
      const teamIndex = num(r.TeamIndex);
      const ratings: Record<string, number> = {};
      for (const k of RATING_KEYS) { try { ratings[k] = num(r[ratingField(k)]); } catch { ratings[k] = 0; } }
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
      });
    }
    return { teams, players };
  },

  /** Apply per-player edits from the roster editor to a franchise save (new file). */
  async rosterApply(fileName: string, edits: Record<string, PlayerFieldEdit>): Promise<RosterApplyResult> {
    const dir = savesDir();
    const inputPath = path.join(dir, fileName);
    if (!fs.existsSync(inputPath)) throw new Error(`franchise not found: ${fileName}`);
    const outputName = outputNameFor(fileName, 'ROSTER');
    const outputPath = path.join(dir, outputName);
    if (path.resolve(outputPath) === path.resolve(inputPath)) throw new Error('refusing to overwrite the input file');

    const file = await madden.create(inputPath, { autoParse: true });
    const pt = file.getTableByUniqueId(PLAYER_TABLE_UID) || file.getTableByName('Player');
    if (!pt) throw new Error('player table not found');
    await pt.readRecords();

    let playersEdited = 0;
    for (const [idStr, e] of Object.entries(edits || {})) {
      const rec = pt.records[Number(idStr)];
      if (!rec || rec.isEmpty) continue;
      let touched = false;
      if (e.overall != null) { try { rec.OverallRating = clamp99(e.overall); touched = true; } catch { /* */ } }
      if (e.age != null) { try { rec.Age = Math.max(18, Math.min(50, Math.round(e.age))); touched = true; } catch { /* */ } }
      if (e.jersey != null) { try { rec.JerseyNum = clamp99(e.jersey); touched = true; } catch { /* */ } }
      if (e.position && FRANCHISE_POSITIONS.has(e.position)) { try { rec.Position = e.position; touched = true; } catch { /* */ } }
      if (e.dev && DEV_ENUM[e.dev]) { try { rec.TraitDevelopment = DEV_ENUM[e.dev]; touched = true; } catch { /* */ } }
      if (e.ratings) {
        for (const [k, v] of Object.entries(e.ratings)) {
          if (!RATING_KEYS.includes(k) || v == null) continue;
          try { rec[ratingField(k)] = clamp99(Number(v)); touched = true; } catch { /* */ }
        }
      }
      if (touched) playersEdited++;
    }

    await file.save(outputPath, {});
    return { input: fileName, output: outputName, outputPath, playersEdited };
  },

  /** Read each real team's editable identity (name, city, abbreviation, colors, logo)
   *  for the relocation/rebrand tool's team picker + before/after preview. Read-only. */
  async franchiseTeams(fileName: string): Promise<FranchiseTeamsResult> {
    const dir = savesDir();
    const inputPath = path.join(dir, fileName);
    if (!fs.existsSync(inputPath)) throw new Error(`franchise not found: ${fileName}`);
    const file = await madden.create(inputPath, { autoParse: true });
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
  async relocateRebrand(fileName: string, opts: RelocateRebrandOptions): Promise<RelocateRebrandResult> {
    const dir = savesDir();
    const inputPath = path.join(dir, fileName);
    if (!fs.existsSync(inputPath)) throw new Error(`franchise not found: ${fileName}`);
    if (opts.teamIndex == null || opts.teamIndex < 0 || opts.teamIndex >= 32) throw new Error('teamIndex (0..31) required');

    // A city change reads as a RELOCATE; identity-only is a REBRAND (drives the output suffix).
    const mode: 'REBRAND' | 'RELOCATE' = opts.city != null ? 'RELOCATE' : 'REBRAND';
    const outputName = outputNameFor(fileName, mode, opts.outputName);
    const outputPath = path.join(dir, outputName);
    if (path.resolve(outputPath) === path.resolve(inputPath)) throw new Error('refusing to overwrite the input file');

    const file = await madden.create(inputPath, { autoParse: true });
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
        target[field] = raw;
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
};
