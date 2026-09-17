import { TeamService, type TeamInfo } from './TeamService';
import { WikipediaTeamService } from './WikipediaTeamService';
import { PlayerLookupService } from './PlayerLookupService';
import type { BaselinePlayer } from '../types/player';

/** One of today's 32 franchises, keyed by its nflverse abbreviation. */
export interface FranchiseInfo {
  key: string; // DAL, GNB, KAN, ...
  name: string;
  logo: string | null;
}

/**
 * Era team names -> the franchise that carries their history today. Names not
 * listed here resolve through the current-team table, so a defunct club (the
 * Brooklyn Dodgers, the Boston Yanks) maps to nothing and drops out.
 */
const NAME_TO_FRANCHISE: Record<string, string> = {
  'Houston Oilers': 'TEN', 'Tennessee Oilers': 'TEN',
  'Baltimore Colts': 'IND',
  'Boston Redskins': 'WAS', 'Washington Redskins': 'WAS', 'Washington Football Team': 'WAS',
  'Chicago Cardinals': 'ARI', 'St. Louis Cardinals': 'ARI', 'Phoenix Cardinals': 'ARI',
  'Cleveland Rams': 'LAR', 'St. Louis Rams': 'LAR',
  'Oakland Raiders': 'LVR', 'Los Angeles Raiders': 'LVR',
  'San Diego Chargers': 'LAC',
  'Boston Patriots': 'NWE',
  'Dallas Texans': 'KAN', // the AFL club (1960-62); the 1952 NFL Texans folded
  'New York Titans': 'NYJ',
  'Pittsburgh Pirates': 'PIT',
};

/** Relocation abbreviations (nflverse / baked tables) -> today's key. */
const ABBR_TO_FRANCHISE: Record<string, string> = {
  OAK: 'LVR', RAI: 'LVR', SDG: 'LAC', SD: 'LAC', STL: 'LAR', RAM: 'LAR', PHO: 'ARI', CRD: 'ARI', OTI: 'TEN', CLT: 'IND',
};

let listCache: FranchiseInfo[] | null = null;
let byKeyCache: Map<string, FranchiseInfo> | null = null;
let draftedCache: Promise<Map<string, BaselinePlayer[]>> | null = null;
let draftTeamsCache: Promise<Map<string, { team: TeamInfo; player: BaselinePlayer }>> | null = null;

function list(): FranchiseInfo[] {
  if (!listCache) {
    listCache = TeamService.franchises().sort((a, b) => a.name.localeCompare(b.name));
    byKeyCache = new Map(listCache.map((f) => [f.key, f]));
  }
  return listCache;
}

export const TeamDraftService = {
  /** The 32 current franchises, alphabetical by name. */
  list,

  /** A franchise by key (case-insensitive), or null. */
  get(key: string): FranchiseInfo | null {
    list();
    return byKeyCache!.get(String(key ?? '').trim().toUpperCase()) ?? null;
  },

  /** Which of today's franchises drafted for `team` in `season`, or null when
   *  that club has no modern successor. */
  franchiseOf(team: TeamInfo, season: number): string | null {
    const byName = NAME_TO_FRANCHISE[team.name];
    if (byName) return byName === 'KAN' && season < 1960 ? null : byName;
    const cur = TeamService.byName(team.name);
    if (cur) return cur.abbr;
    const a = team.abbr.trim().toUpperCase();
    if (TeamDraftService.get(a)) return a;
    return ABBR_TO_FRANCHISE[a] ?? null;
  },

  /** Player key -> the club that drafted him as of that season (nflverse 1980+,
   *  the baked Wikipedia tables before that; AFL picks have no source). Built once. */
  draftTeams(): Promise<Map<string, { team: TeamInfo; player: BaselinePlayer }>> {
    if (!draftTeamsCache) {
      draftTeamsCache = buildDraftTeams().catch((e) => { draftTeamsCache = null; throw e; });
    }
    return draftTeamsCache;
  },

  /** Every drafted player in the lookup, grouped by the franchise that drafted
   *  him (nflverse 1980+, the baked Wikipedia tables before that). Built once. */
  draftedByFranchise(): Promise<Map<string, BaselinePlayer[]>> {
    if (!draftedCache) {
      draftedCache = buildDrafted().catch((e) => { draftedCache = null; throw e; });
    }
    return draftedCache;
  },

  /** The players one franchise drafted, across every era it played under. */
  async draftedBy(key: string): Promise<BaselinePlayer[]> {
    const f = TeamDraftService.get(key);
    if (!f) return [];
    return (await TeamDraftService.draftedByFranchise()).get(f.key) ?? [];
  },
};

async function buildDraftTeams(): Promise<Map<string, { team: TeamInfo; player: BaselinePlayer }>> {
  const out = new Map<string, { team: TeamInfo; player: BaselinePlayer }>();
  for (const year of PlayerLookupService.years()) {
    const players = PlayerLookupService.byYear(year).filter((p) => p.draftRound != null || p.draftPick != null);
    if (!players.length) continue;
    if (year >= 1980) {
      const enrich = await TeamService.byYear(year);
      const t2026 = !enrich.size && year === 2026 ? TeamService.teams2026() : null;
      for (const p of players) {
        if (p.draftPick == null || !p.key) continue;
        const t = enrich.get(p.draftPick)?.team ?? t2026?.get(p.draftPick);
        if (t) out.set(p.key, { team: t, player: p });
      }
    } else {
      // The baked tables are the NFL drafts; an AFL pick would only match a
      // same-name NFL draftee (the 1960s double-drafts), so he stays unassigned.
      const map = await WikipediaTeamService.teamsByName(year);
      if (!map.size) continue;
      for (const p of players) {
        if (!p.key || p.league !== 'NFL') continue;
        const t = WikipediaTeamService.teamFor(map, p.firstName, p.lastName, p.college);
        if (t) out.set(p.key, { team: t, player: p });
      }
    }
  }
  return out;
}

async function buildDrafted(): Promise<Map<string, BaselinePlayer[]>> {
  const out = new Map<string, BaselinePlayer[]>();
  for (const { team, player } of (await TeamDraftService.draftTeams()).values()) {
    const k = TeamDraftService.franchiseOf(team, player.draftYear);
    if (!k) continue;
    let l = out.get(k);
    if (!l) out.set(k, (l = []));
    l.push(player);
  }
  return out;
}
