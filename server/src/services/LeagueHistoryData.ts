import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../config/paths';

export type AwardKindH = 'COY' | 'MVP' | 'OPOY' | 'DPOY' | 'OROY' | 'DROY' | 'SBMVP';
export const AWARD_KINDS: AwardKindH[] = ['COY', 'MVP', 'OPOY', 'DPOY', 'OROY', 'DROY', 'SBMVP'];
export interface HistorySide { franchise: string; city: string; score: number }
export interface HistoryAward { type: AwardKindH; first: string; last: string; pos: string; franchise: string }
export interface SeasonHistory {
  season: number;
  game: string;
  champion: HistorySide;
  runnerUp: HistorySide;
  afcSide?: 'champion' | 'runnerUp';
  awards: HistoryAward[];
}
export interface LeagueHistoryFile { _source: string; _built: string; seasons: SeasonHistory[] }

export const FIRST_SEASON = 1933;
export const LAST_SEASON = 2025;
export const FIRST_SUPER_BOWL_SEASON = 1966;

/** Modern franchise key -> the Madden Team.DisplayName and today's conference. */
export const FRANCHISES: Record<string, { name: string; conference: 'AFC' | 'NFC' }> = {
  ARI: { name: 'Cardinals', conference: 'NFC' }, ATL: { name: 'Falcons', conference: 'NFC' }, BAL: { name: 'Ravens', conference: 'AFC' },
  BUF: { name: 'Bills', conference: 'AFC' }, CAR: { name: 'Panthers', conference: 'NFC' }, CHI: { name: 'Bears', conference: 'NFC' },
  CIN: { name: 'Bengals', conference: 'AFC' }, CLE: { name: 'Browns', conference: 'AFC' }, DAL: { name: 'Cowboys', conference: 'NFC' },
  DEN: { name: 'Broncos', conference: 'AFC' }, DET: { name: 'Lions', conference: 'NFC' }, GNB: { name: 'Packers', conference: 'NFC' },
  HOU: { name: 'Texans', conference: 'AFC' }, IND: { name: 'Colts', conference: 'AFC' }, JAX: { name: 'Jaguars', conference: 'AFC' },
  KAN: { name: 'Chiefs', conference: 'AFC' }, LAC: { name: 'Chargers', conference: 'AFC' }, LAR: { name: 'Rams', conference: 'NFC' },
  LVR: { name: 'Raiders', conference: 'AFC' }, MIA: { name: 'Dolphins', conference: 'AFC' }, MIN: { name: 'Vikings', conference: 'NFC' },
  NWE: { name: 'Patriots', conference: 'AFC' }, NOR: { name: 'Saints', conference: 'NFC' }, NYG: { name: 'Giants', conference: 'NFC' },
  NYJ: { name: 'Jets', conference: 'AFC' }, PHI: { name: 'Eagles', conference: 'NFC' }, PIT: { name: 'Steelers', conference: 'AFC' },
  SEA: { name: 'Seahawks', conference: 'NFC' }, SFO: { name: '49ers', conference: 'NFC' }, TAM: { name: 'Buccaneers', conference: 'NFC' },
  TEN: { name: 'Titans', conference: 'AFC' }, WAS: { name: 'Commanders', conference: 'NFC' },
};

/** Madden team index (= TEAM_LOGO id) -> key. Dumped from a Madden 27 CAREER save's Team table on 2026-09-17. */
export const LOGO_TO_KEY: string[] = [
  'CHI', 'CIN', 'BUF', 'DEN', 'CLE', 'TAM', 'ARI', 'LAC', 'KAN', 'IND', 'DAL', 'MIA', 'PHI', 'ATL', 'SFO', 'NYG',
  'JAX', 'NYJ', 'DET', 'GNB', 'CAR', 'NWE', 'LVR', 'LAR', 'BAL', 'WAS', 'NOR', 'SEA', 'PIT', 'TEN', 'MIN', 'HOU',
];

/** Every nickname a title-game side or an award winner's team has carried since 1933 -> key. */
export const NICKNAME_TO_KEY: Record<string, string> = {
  ...Object.fromEntries(Object.entries(FRANCHISES).map(([k, v]) => [v.name, k])),
  Redskins: 'WAS', Spartans: 'DET', Oilers: 'TEN', Niners: 'SFO',
};

/** PositionE enum names the LeagueHistoryAward table accepts (plus HC, which the writer maps to HC_CFM). */
export const POSITION_ENUM = new Set(['QB', 'HB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'LE', 'RE', 'DT', 'LOLB', 'MLB', 'ROLB', 'CB', 'FS', 'SS', 'K', 'P', 'LS', 'HC', 'Invalid_']);

export function validateLeagueHistory(file: LeagueHistoryFile): string[] {
  const problems: string[] = [];
  const seen = new Map<number, number>();
  for (const s of file.seasons ?? []) seen.set(s.season, (seen.get(s.season) ?? 0) + 1);
  for (let y = FIRST_SEASON; y <= LAST_SEASON; y++) {
    const n = seen.get(y) ?? 0;
    if (n !== 1) problems.push(`season ${y}: expected once, found ${n}`);
  }
  for (const s of file.seasons ?? []) {
    for (const side of [s.champion, s.runnerUp]) {
      if (!FRANCHISES[side.franchise]) problems.push(`season ${s.season}: unknown franchise ${side.franchise}`);
      if (!side.city) problems.push(`season ${s.season}: ${side.franchise} has no city`);
      if (!Number.isInteger(side.score) || side.score < 0) problems.push(`season ${s.season}: bad score ${side.score}`);
    }
    if (s.champion.score <= s.runnerUp.score) problems.push(`season ${s.season}: champion score ${s.champion.score} not above runner-up ${s.runnerUp.score}`);
    if (s.season >= FIRST_SUPER_BOWL_SEASON && s.afcSide !== 'champion' && s.afcSide !== 'runnerUp') problems.push(`season ${s.season}: afcSide missing`);
    for (const a of s.awards ?? []) {
      if (!AWARD_KINDS.includes(a.type)) problems.push(`season ${s.season}: bad award type ${a.type}`);
      if (!POSITION_ENUM.has(a.pos)) problems.push(`season ${s.season} ${a.type}: bad position ${a.pos}`);
      if (a.franchise && !FRANCHISES[a.franchise]) problems.push(`season ${s.season} ${a.type}: unknown franchise ${a.franchise}`);
      if (!a.last) problems.push(`season ${s.season} ${a.type}: no last name`);
    }
    if ((s.awards ?? []).filter((a) => a.type === 'SBMVP').length > 1) problems.push(`season ${s.season}: more than one SBMVP`);
  }
  return problems;
}

let cached: LeagueHistoryFile | null = null;
export function loadLeagueHistory(): LeagueHistoryFile {
  if (cached) return cached;
  cached = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'league-history.json'), 'utf8')) as LeagueHistoryFile;
  return cached;
}
