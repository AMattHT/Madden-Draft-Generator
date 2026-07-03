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
};
