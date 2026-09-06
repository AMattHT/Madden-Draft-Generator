import fs from 'fs';
import path from 'path';
import { DATA_ROOT } from '../config/paths';

/**
 * A "season pack": everything the historic-season franchise tools need to know about
 * one NFL season, baked once by scripts/bake-season-pack.ts into data/seasons/<year>.json
 * (teams and divisions, the real schedule and results, final standings, the playoff
 * bracket, and every team's roster). Read-only at runtime.
 */

export interface SeasonTeam {
  /** Stable key for this season's club (its abbreviation that year, e.g. HOU, STL, LA). */
  key: string;
  city: string;
  nick: string;
  /** Full name as written that season (e.g. "Houston Oilers"). */
  name: string;
  conference: 'AFC' | 'NFC';
  division: string;
  /** Today's franchise key for the same club (TeamDraftService keys, e.g. TEN for the Oilers). */
  franchise: string;
  /** Today's Madden team display name (e.g. "Titans"), for the franchise save. */
  modernName: string;
  /** Row of the source standings table (1 = division winner). */
  divisionRank: number;
}

export interface SeasonGameRow {
  week: number;
  date: string;
  away: string;
  home: string;
  awayScore: number | null;
  homeScore: number | null;
  venue: string | null;
}

export interface StandingRow {
  team: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number | null;
  pointsAgainst: number | null;
}

export interface PlayoffGame {
  round: string;
  away: string;
  home: string;
  awayScore: number;
  homeScore: number;
  date?: string;
}

export interface RosterPlayer {
  first: string;
  last: string;
  /** nflverse position group (QB, RB, WR, TE, OL, DL, LB, DB, K, P) and finer slot when known. */
  pos: string;
  slot: string | null;
  jersey: number | null;
  birth: string | null;
  height: number | null;
  weight: number | null;
  college: string | null;
  /** Matching player in the app's pool (PlayerLookupService key), or null when none was found. */
  poolKey: string | null;
}

export interface SeasonPack {
  year: number;
  bakedAt: string;
  sources: string[];
  teams: SeasonTeam[];
  /** Conference -> division -> team keys in standings order. */
  divisions: Record<string, Record<string, string[]>>;
  gamesPerTeam: number;
  regularSeasonWeeks: number;
  schedule: SeasonGameRow[];
  standings: StandingRow[];
  playoffs: PlayoffGame[];
  rosters: Record<string, RosterPlayer[]>;
  /** Modern clubs with no ancestor this season (to park in the franchise). */
  parked: string[];
  warnings: string[];
}

export const SEASONS_DIR = path.join(DATA_ROOT, 'seasons');

const cache = new Map<number, SeasonPack | null>();

export const SeasonPackService = {
  /** Seasons with a baked pack, ascending. */
  years(): number[] {
    if (!fs.existsSync(SEASONS_DIR)) return [];
    return fs.readdirSync(SEASONS_DIR)
      .map((f) => /^(\d{4})\.json$/.exec(f)?.[1])
      .filter((y): y is string => !!y)
      .map(Number)
      .sort((a, b) => a - b);
  },

  /** The pack for a season, or null when none is baked. */
  get(year: number): SeasonPack | null {
    if (cache.has(year)) return cache.get(year)!;
    const file = path.join(SEASONS_DIR, `${year}.json`);
    const pack = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as SeasonPack) : null;
    cache.set(year, pack);
    return pack;
  },

  /** Forget cached packs (after baking). */
  reload(): void {
    cache.clear();
  },

  /** A team of the pack by its season key, modern name or full name. */
  team(pack: SeasonPack, ref: string): SeasonTeam | null {
    const q = ref.trim().toLowerCase();
    return pack.teams.find((t) => t.key.toLowerCase() === q || t.modernName.toLowerCase() === q || t.name.toLowerCase() === q || t.nick.toLowerCase() === q) ?? null;
  },
};
