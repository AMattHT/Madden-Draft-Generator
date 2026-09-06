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

  /** Playoff games per round for a format. The first round is the wild-card week for
   *  every field but the 8-team one (1970-77), which opened with four divisional games. */
  gamesPerRound(p: PlayoffFormat): { wildCard: number; divisional: number; conference: number; superBowl: number } {
    const perConf = p.divisionWinners + p.wildCards;
    const firstRound = 2 * Math.floor((perConf - p.byes) / 2);
    return { wildCard: p.teams <= 8 ? 0 : firstRound, divisional: 4, conference: 2, superBowl: 1 };
  },
};
