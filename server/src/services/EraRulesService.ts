import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../config/paths';

/** League structure and rules for a span of seasons (data/lookups/nfl-era-rules.json). */
export interface PlayoffFormat {
  teams: number;
  /** Per conference. */
  divisionWinners: number;
  /** Per conference. */
  wildCards: number;
  /** Per conference. */
  byes: number;
  rounds: string[];
}

export interface EraRules {
  from: number;
  to: number;
  label: string;
  teams: number;
  conferences: number;
  divisionsPerConference: number;
  gamesPerTeam: number;
  regularSeasonWeeks: number;
  playoff: PlayoffFormat;
  rosterLimit: number;
  salaryCap: boolean;
  tradeDeadline: boolean;
  notes: string[];
}

let cache: EraRules[] | null = null;
function eras(): EraRules[] {
  if (cache) return cache;
  const raw = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'nfl-era-rules.json'), 'utf8')) as { eras: EraRules[] };
  cache = raw.eras;
  return cache;
}

export const EraRulesService = {
  /** The rules in force for a season, or null before 1970 (pre-merger seasons are not modelled). */
  rulesFor(season: number): EraRules | null {
    return eras().find((e) => season >= e.from && season <= e.to) ?? null;
  },

  /** Every era, ascending. */
  all(): EraRules[] {
    return eras();
  },

  /** Number of playoff games per round for a format (wild card, divisional, conference, super bowl). */
  gamesPerRound(p: PlayoffFormat): { wildCard: number; divisional: number; conference: number; superBowl: number } {
    const perConf = p.divisionWinners + p.wildCards;
    const wildCard = perConf > 4 || p.byes > 0 ? 2 * (perConf - p.byes) / 2 : 0;
    // 8-team fields (1970-77) skip the wild-card round: 4 divisional games.
    return { wildCard: p.teams <= 8 ? 0 : wildCard, divisional: 4, conference: 2, superBowl: 1 };
  },
};
