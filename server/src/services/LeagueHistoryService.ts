import { FIRST_SUPER_BOWL_SEASON, FRANCHISES, type HistoryAward, type SeasonHistory } from './LeagueHistoryData';

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
