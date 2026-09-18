import fs from 'fs';
import path from 'path';
import { FIRST_SUPER_BOWL_SEASON, FRANCHISES, loadLeagueHistory, type HistoryAward, type SeasonHistory } from './LeagueHistoryData';
import { openSave, savesDir, writeField, outputNameFor, TEAM_TABLE_UID, SEASONINFO_TABLE_UID, type GameVersion } from './FranchiseService';

/**
 * League history seeding for Madden 27 franchises: the real seasons before the one the
 * franchise pretends to start in, written into YearSummary / LeagueHistoryAward[] /
 * LeagueHistoryAward. Spec: docs/superpowers/specs/2026-09-17-league-history-seeding-design.md
 */

export const NULL_REF = '0'.repeat(32);
export const YEARSUMMARY_TABLE_UID = 2592669074;
export const HISTORYARRAY_TABLE_UID = 2466957052;
export const HISTORYAWARD_TABLE_UID = 2655641637;
const CAPACITY = { summary: 30, awards: 217, arrays: 31 };

export interface TeamRef { logo: number; identity: string }
export interface PlanInput { seasons: SeasonHistory[]; startSeason: number; currentSeasonYear: number; teams: Record<string, TeamRef>; capacity?: typeof CAPACITY }
export interface SideRow { city: string; score: number; logo: number; identity: string; titles: number; appearances: number }
export interface SummaryRow { row: number; season: number; periodIndex: number; afc: SideRow; nfc: SideRow; sbMvpRow: number | null; arrayRow: number }
export interface ArrayRow { row: number; slots: (number | null)[] }
export interface AwardRow { row: number; first: string; last: string; pos: string; awardType: string; identity: string }
export interface HistoryPlan { summaries: SummaryRow[]; arrays: ArrayRow[]; awards: AwardRow[]; firstSeason: number | null; lastSeason: number | null; warnings: string[] }

const ANNUAL_ORDER: HistoryAward['type'][] = ['COY', 'MVP', 'OPOY', 'DPOY', 'OROY', 'DROY'];
const AWARD_ENUM: Record<HistoryAward['type'], string> = {
  COY: 'Coach_of_Year', MVP: 'MVP', OPOY: 'Offensive_Player_of_Year', DPOY: 'Defensive_Player_of_Year',
  OROY: 'Offensive_Rookie_of_Year', DROY: 'Defensive_Rookie_of_Year', SBMVP: 'INVALID',
};
const posEnum = (p: string) => (p === 'HC' ? 'HC_CFM' : p || 'Invalid_');

export function planLeagueHistory({ seasons, startSeason, currentSeasonYear, teams, capacity = CAPACITY }: PlanInput): HistoryPlan {
  const all = [...seasons].sort((a, b) => a.season - b.season);
  const warnings: string[] = [];
  // Counters from the first baked season, whatever window is written.
  const titles = new Map<string, number>(), appearances = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  const teamOf = (key: string, season: number): TeamRef => {
    const t = teams[key];
    if (!t) throw new Error(`season ${season}: no team in this save for franchise ${key}`);
    return t;
  };

  const window = all.filter((s) => s.season < startSeason).slice(-capacity.summary);
  if (window.length < capacity.summary) warnings.push(`only ${window.length} seasons before ${startSeason} are available`);
  const wanted = new Set(window.map((s) => s.season));

  const summaries: SummaryRow[] = [], arrays: ArrayRow[] = [], awards: AwardRow[] = [];
  let seasonRow = 0;
  for (const s of all) {
    bump(titles, s.champion.franchise); bump(appearances, s.champion.franchise); bump(appearances, s.runnerUp.franchise);
    if (!wanted.has(s.season)) continue;
    const champIsAfc = s.season >= FIRST_SUPER_BOWL_SEASON ? s.afcSide === 'champion' : FRANCHISES[s.champion.franchise]?.conference === 'AFC';
    const sideRow = (side: SeasonHistory['champion']): SideRow => {
      const t = teamOf(side.franchise, s.season);
      return { city: side.city, score: side.score, logo: t.logo, identity: t.identity, titles: titles.get(side.franchise) ?? 0, appearances: appearances.get(side.franchise) ?? 0 };
    };
    const afc = sideRow(champIsAfc ? s.champion : s.runnerUp);
    const nfc = sideRow(champIsAfc ? s.runnerUp : s.champion);
    const addAward = (a: HistoryAward): number => {
      const row = awards.length;
      awards.push({ row, first: a.first, last: a.last, pos: posEnum(a.pos), awardType: AWARD_ENUM[a.type], identity: a.franchise && teams[a.franchise] ? teams[a.franchise].identity : NULL_REF });
      return row;
    };
    const slots = ANNUAL_ORDER.map((type) => { const a = s.awards.find((x) => x.type === type); return a ? addAward(a) : null; });
    const sb = s.awards.find((x) => x.type === 'SBMVP');
    const sbMvpRow = sb ? addAward(sb) : null;
    arrays.push({ row: seasonRow, slots });
    summaries.push({ row: seasonRow, season: s.season, periodIndex: s.season - currentSeasonYear, afc, nfc, sbMvpRow, arrayRow: seasonRow });
    seasonRow++;
  }
  if (awards.length > capacity.awards) throw new Error(`${awards.length} award rows exceed the table's ${capacity.awards}`);
  if (arrays.length > capacity.arrays) throw new Error(`${arrays.length} award arrays exceed the table's ${capacity.arrays}`);
  return { summaries, arrays, awards, firstSeason: summaries[0]?.season ?? null, lastSeason: summaries[summaries.length - 1]?.season ?? null, warnings };
}

export function assertNoHistory(yearSummary: { records: Array<{ isEmpty: boolean }> }): void {
  const live = yearSummary.records.filter((r) => !r.isEmpty).length;
  if (live > 0) throw new Error(`this franchise already has league history (${live} seasons); seeding only fills an empty history`);
}

const val = (r: any, k: string) => { try { return r[k]; } catch { return undefined; } };

/** The save's current season year and, per franchise key, the club's logo id and raw TeamIdentity reference. */
export async function readSaveContext(file: any): Promise<{ currentSeasonYear: number; teams: Record<string, TeamRef> }> {
  const si = file.getTableByUniqueId(SEASONINFO_TABLE_UID); await si.readRecords();
  const currentSeasonYear = Number(val(si.records[0], 'CurrentSeasonYear'));
  if (!Number.isInteger(currentSeasonYear)) throw new Error('SeasonInfo.CurrentSeasonYear unreadable');
  const tt = file.getTableByUniqueId(TEAM_TABLE_UID); await tt.readRecords();
  const byName = new Map<string, any>();
  for (const r of tt.records) { if (r.isEmpty) continue; const idx = Number(val(r, 'TeamIndex')); if (idx >= 0 && idx < 32) byName.set(String(val(r, 'DisplayName')), r); }
  const teams: Record<string, TeamRef> = {};
  for (const [key, f] of Object.entries(FRANCHISES)) {
    const r = byName.get(f.name);
    if (!r) continue; // a relocated/renamed club: the planner throws only if a written season needs it
    teams[key] = { logo: Number(val(r, 'TEAM_LOGO')), identity: String(val(r, 'TeamIdentity') ?? NULL_REF) };
  }
  return { currentSeasonYear, teams };
}

/** Write the plan. The file must have been opened with autoUnempty so empty rows go live on write. */
export async function applyPlan(file: any, plan: HistoryPlan): Promise<void> {
  const ys = file.getTableByUniqueId(YEARSUMMARY_TABLE_UID), arr = file.getTableByUniqueId(HISTORYARRAY_TABLE_UID), aw = file.getTableByUniqueId(HISTORYAWARD_TABLE_UID);
  for (const t of [ys, arr, aw]) { if (!t) throw new Error('league history tables not found in this save'); await t.readRecords(); }
  assertNoHistory(ys);
  const awardRef = (row: number | null) => (row == null ? NULL_REF : aw.getBinaryReferenceToRecord(row));
  for (const a of plan.awards) {
    const r = aw.records[a.row];
    writeField(r, 'firstName', a.first, true);
    writeField(r, 'lastName', a.last, true);
    writeField(r, 'Position', a.pos, true);
    writeField(r, 'AwardType', a.awardType, true);
    r.teamIdentity = a.identity;
  }
  for (const x of plan.arrays) {
    const r = arr.records[x.row];
    x.slots.forEach((slot, i) => { r[`LeagueHistoryAward${i}`] = awardRef(slot); });
  }
  for (const s of plan.summaries) {
    const r = ys.records[s.row];
    writeField(r, 'PeriodIndex', s.periodIndex, true);
    writeField(r, 'SB_Index', 0, true);
    for (const [side, d] of [['AFC', s.afc], ['NFC', s.nfc]] as const) {
      writeField(r, `${side}_CityName`, d.city, true);
      writeField(r, `${side}_SB_Score`, d.score, true);
      writeField(r, `${side}_TeamLogo`, d.logo, true);
      writeField(r, `${side}_SB_Wins`, d.titles, true);
      writeField(r, `${side}_ConfChamp_Wins`, d.appearances, true);
      r[`${side}_Team_Identity`] = d.identity;
      r[`${side}_SB_USER`] = NULL_REF;
    }
    r.SB_MVP = awardRef(s.sbMvpRow);
    r.AnnualAwards = arr.getBinaryReferenceToRecord(s.arrayRow);
  }
}

export interface SeedOptions { startSeason?: number; maxSeasons?: number; outputName?: string }
export interface SeedResult { input: string; output: string; outputPath: string; currentSeasonYear: number; startSeason: number; seasonsWritten: number; firstSeason: number | null; lastSeason: number | null; warnings: string[] }
export interface SeedPreview { input: string; currentSeasonYear: number; startSeason: number; alreadyHasHistory: boolean; seasons: Array<{ season: number; game: string; champion: string; score: string; runnerUp: string; mvp: string | null }>; warnings: string[] }

function planFor(opts: SeedOptions, ctx: { currentSeasonYear: number; teams: Record<string, TeamRef> }): { plan: HistoryPlan; startSeason: number } {
  const startSeason = opts.startSeason ?? ctx.currentSeasonYear;
  const cap = opts.maxSeasons ? { summary: Math.min(30, opts.maxSeasons), awards: 217, arrays: 31 } : undefined;
  const plan = planLeagueHistory({ seasons: loadLeagueHistory().seasons, startSeason, currentSeasonYear: ctx.currentSeasonYear, teams: ctx.teams, capacity: cap });
  return { plan, startSeason };
}

export const LeagueHistoryService = {
  /** Planner only: what seeding would write, plus whether the save already has history. */
  async preview(fileName: string, opts: SeedOptions = {}, gameVersion: GameVersion = 'm27'): Promise<SeedPreview> {
    if (gameVersion !== 'm27') throw new Error('league history seeding targets Madden 27 saves');
    const inputPath = path.join(savesDir(gameVersion), fileName);
    if (!fs.existsSync(inputPath)) throw new Error(`franchise not found: ${fileName}`);
    const file = await openSave(inputPath, gameVersion);
    const ctx = await readSaveContext(file);
    const ys = file.getTableByUniqueId(YEARSUMMARY_TABLE_UID); await ys.readRecords();
    const { plan, startSeason } = planFor(opts, ctx);
    const bySeason = new Map(loadLeagueHistory().seasons.map((s) => [s.season, s]));
    return {
      input: fileName, currentSeasonYear: ctx.currentSeasonYear, startSeason,
      alreadyHasHistory: ys.records.some((r: any) => !r.isEmpty),
      seasons: plan.summaries.map((s) => { const h = bySeason.get(s.season)!; const mvp = h.awards.find((a) => a.type === 'MVP'); return { season: s.season, game: h.game, champion: `${h.champion.city} ${FRANCHISES[h.champion.franchise].name}`, score: `${h.champion.score}-${h.runnerUp.score}`, runnerUp: `${h.runnerUp.city} ${FRANCHISES[h.runnerUp.franchise].name}`, mvp: mvp ? `${mvp.first} ${mvp.last}` : null }; }),
      warnings: plan.warnings,
    };
  },

  /** Write the seasons into a CAREER-*-HISTORY copy. */
  async seed(fileName: string, opts: SeedOptions = {}, gameVersion: GameVersion = 'm27'): Promise<SeedResult> {
    if (gameVersion !== 'm27') throw new Error('league history seeding targets Madden 27 saves');
    const dir = savesDir(gameVersion);
    const inputPath = path.join(dir, fileName);
    if (!fs.existsSync(inputPath)) throw new Error(`franchise not found: ${fileName}`);
    const output = outputNameFor(fileName, 'HISTORY', opts.outputName);
    const outputPath = path.join(dir, output);
    if (path.resolve(outputPath) === path.resolve(inputPath)) throw new Error('refusing to overwrite the input file');
    const file = await openSave(inputPath, gameVersion, { autoUnempty: true });
    const ctx = await readSaveContext(file);
    const { plan, startSeason } = planFor(opts, ctx);
    if (!plan.summaries.length) throw new Error(`no seasons before ${startSeason} to write`);
    await applyPlan(file, plan);
    await file.save(outputPath, {});
    return { input: fileName, output, outputPath, currentSeasonYear: ctx.currentSeasonYear, startSeason, seasonsWritten: plan.summaries.length, firstSeason: plan.firstSeason, lastSeason: plan.lastSeason, warnings: plan.warnings };
  },
};
