import fs from 'fs';
import path from 'path';
import { CACHE_DIR } from '../config/paths';
import { parseCsvFile } from '../util/csv';
import { DbPositionService } from './DbPositionService';

/** Drafting-team info attached to a generated player, resolved by draft pick. */
export interface TeamInfo {
  abbr: string; // display abbreviation (as of the draft season)
  name: string; // full franchise name (as of the draft season)
  logo: string | null; // ESPN CDN logo URL, or null for historical/relocated teams
}

/** ESPN CDN logo URL for a team code (e.g. 'gb', 'wsh'). */
export const espnLogo = (code: string) => `https://a.espncdn.com/i/teamlogos/nfl/500/${code}.png`;
const ESPN = espnLogo;

// nflverse abbreviation -> current franchise (ESPN logo code + name).
// nflverse uses the abbreviation contemporary to the draft season, so relocated
// franchises appear under distinct historical codes (OAK, SDG, STL, PHO, …) and
// fall through to the chip-only HISTORICAL map below.
const CURRENT: Record<string, { espn: string; name: string }> = {
  ARI: { espn: 'ari', name: 'Arizona Cardinals' },
  ATL: { espn: 'atl', name: 'Atlanta Falcons' },
  BAL: { espn: 'bal', name: 'Baltimore Ravens' }, // guarded: Ravens only from 1996
  BUF: { espn: 'buf', name: 'Buffalo Bills' },
  CAR: { espn: 'car', name: 'Carolina Panthers' },
  CHI: { espn: 'chi', name: 'Chicago Bears' },
  CIN: { espn: 'cin', name: 'Cincinnati Bengals' },
  CLE: { espn: 'cle', name: 'Cleveland Browns' },
  DAL: { espn: 'dal', name: 'Dallas Cowboys' },
  DEN: { espn: 'den', name: 'Denver Broncos' },
  DET: { espn: 'det', name: 'Detroit Lions' },
  GNB: { espn: 'gb', name: 'Green Bay Packers' },
  HOU: { espn: 'hou', name: 'Houston Texans' }, // guarded: Texans only from 2002
  IND: { espn: 'ind', name: 'Indianapolis Colts' },
  JAX: { espn: 'jax', name: 'Jacksonville Jaguars' },
  KAN: { espn: 'kc', name: 'Kansas City Chiefs' },
  LAC: { espn: 'lac', name: 'Los Angeles Chargers' },
  LAR: { espn: 'lar', name: 'Los Angeles Rams' },
  LVR: { espn: 'lv', name: 'Las Vegas Raiders' },
  MIA: { espn: 'mia', name: 'Miami Dolphins' },
  MIN: { espn: 'min', name: 'Minnesota Vikings' },
  NWE: { espn: 'ne', name: 'New England Patriots' },
  NOR: { espn: 'no', name: 'New Orleans Saints' },
  NYG: { espn: 'nyg', name: 'New York Giants' },
  NYJ: { espn: 'nyj', name: 'New York Jets' },
  PHI: { espn: 'phi', name: 'Philadelphia Eagles' },
  PIT: { espn: 'pit', name: 'Pittsburgh Steelers' },
  SEA: { espn: 'sea', name: 'Seattle Seahawks' },
  SFO: { espn: 'sf', name: 'San Francisco 49ers' },
  TAM: { espn: 'tb', name: 'Tampa Bay Buccaneers' },
  TEN: { espn: 'ten', name: 'Tennessee Titans' },
  WAS: { espn: 'wsh', name: 'Washington Commanders' },
};

// Relocated / renamed franchises that no longer exist under this identity — shown
// as a neutral abbreviation chip (no current logo), per the "current teams only"
// choice.
const HISTORICAL: Record<string, string> = {
  OAK: 'Oakland Raiders',
  RAI: 'Los Angeles Raiders',
  SDG: 'San Diego Chargers',
  STL: 'St. Louis Rams',
  RAM: 'Los Angeles Rams',
  PHO: 'Phoenix Cardinals',
};

/** Resolve an nflverse team abbreviation + draft season to logo/name info. */
function resolveTeam(abbr: string, season: number): TeamInfo {
  const a = abbr.trim().toUpperCase();
  // Codes shared by a historical team and the current franchise — split by year.
  if (a === 'BAL' && season < 1996) return { abbr: 'BAL', name: 'Baltimore Colts', logo: null };
  if (a === 'HOU' && season < 2002) return { abbr: 'HOU', name: 'Houston Oilers', logo: null };

  const cur = CURRENT[a];
  if (cur) return { abbr: a, name: cur.name, logo: ESPN(cur.espn) };
  const hist = HISTORICAL[a];
  if (hist) return { abbr: a, name: hist, logo: null };
  return { abbr: a, name: a, logo: null };
}

/** Per-pick enrichment joined onto a generated class by overall draft pick. */
export interface PickEnrichment {
  team: TeamInfo;
  /** Refined DB position label (CB/S/FS/SS/SAF) from the roster dataset, or null.
   *  Used to split safeties from corners — the draft data lumps all DBs as "DB". */
  positionLabel: string | null;
  age: number | null; // real draft age (draft_picks, else derived from birth year)
  heightInches: number | null; // nflverse roster height (fallback where combine is absent)
  weight: number | null;
}

// Specific defensive-back positions we trust from the roster dataset to correct
// the draft sources, which label nearly every DB (incl. safeties) as "CB"/"DB".
const DB_POSITIONS = new Set(['CB', 'S', 'FS', 'SS', 'SAF']);

// nflverse data: PFR-derived, covers 1980–present. Both CSVs are cached on disk
// (immutable history) and parsed once. draft_picks gives team + gsis_id by pick;
// players gives the granular roster position (SS/FS/CB) joined via gsis_id.
const DRAFT_PICKS_URL =
  'https://github.com/nflverse/nflverse-data/releases/download/draft_picks/draft_picks.csv';
const PLAYERS_URL =
  'https://github.com/nflverse/nflverse-data/releases/download/players/players.csv';
const DRAFT_PICKS_CACHE = path.join(CACHE_DIR, 'nflverse_draft_picks.csv');
const PLAYERS_CACHE = path.join(CACHE_DIR, 'nflverse_players.csv');

interface RawPick {
  season: string;
  pick: string;
  team: string;
  gsis_id: string;
  age: string;
}
interface RawPlayer {
  gsis_id: string;
  position: string;
  height: string;
  weight: string;
  birth_date: string;
}
interface Bio {
  heightInches: number | null;
  weight: number | null;
  birthYear: number | null;
}

async function cachedCsv<T>(url: string, file: string, label: string): Promise<T[]> {
  if (!fs.existsSync(file)) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MaddenDraftClassGenerator/0.1 (personal modding tool)' },
    });
    if (!res.ok) throw new Error(`nflverse ${label} fetch failed: HTTP ${res.status}`);
    fs.writeFileSync(file, await res.text());
  }
  return parseCsvFile<T>(file);
}

// year -> (overall pick -> { team, gsis, age }); plus gsis -> roster position / bio.
let byYear: Map<number, Map<number, { team: TeamInfo; gsis: string; age: number | null }>> | null = null;
let posByGsis: Map<string, string> | null = null;
let bioByGsis: Map<string, Bio> | null = null;
let loading: Promise<void> | null = null;

async function ensureLoaded(): Promise<void> {
  if (byYear) return;
  if (!loading) {
    loading = (async () => {
      const [picks, players] = await Promise.all([
        cachedCsv<RawPick>(DRAFT_PICKS_URL, DRAFT_PICKS_CACHE, 'draft_picks'),
        cachedCsv<RawPlayer>(PLAYERS_URL, PLAYERS_CACHE, 'players'),
      ]);

      const pos = new Map<string, string>();
      const bio = new Map<string, Bio>();
      for (const p of players) {
        if (!p.gsis_id) continue;
        if (p.position) pos.set(p.gsis_id, p.position.trim().toUpperCase());
        const h = parseInt(p.height, 10);
        const w = parseInt(p.weight, 10);
        const by = /^(\d{4})/.exec(p.birth_date || '');
        bio.set(p.gsis_id, {
          heightInches: Number.isNaN(h) ? null : h,
          weight: Number.isNaN(w) ? null : w,
          birthYear: by ? parseInt(by[1], 10) : null,
        });
      }

      const map = new Map<number, Map<number, { team: TeamInfo; gsis: string; age: number | null }>>();
      for (const row of picks) {
        const year = parseInt(row.season, 10);
        const pick = parseInt(row.pick, 10);
        if (!year || !pick || !row.team) continue;
        const age = parseInt(row.age, 10);
        if (!map.has(year)) map.set(year, new Map());
        map.get(year)!.set(pick, {
          team: resolveTeam(row.team, year),
          gsis: (row.gsis_id || '').trim(),
          age: Number.isNaN(age) ? null : age,
        });
      }
      byYear = map;
      posByGsis = pos;
      bioByGsis = bio;
    })().catch((e) => {
      loading = null; // allow a later retry
      throw e;
    });
  }
  return loading;
}

export const TeamService = {
  /**
   * Per-pick team + refined DB position for a draft year. Returns an empty map on
   * any failure (offline / source down) so enrichment degrades gracefully.
   */
  async byYear(year: number): Promise<Map<number, PickEnrichment>> {
    try {
      await ensureLoaded();
    } catch {
      return new Map();
    }
    const src = byYear?.get(year);
    const out = new Map<number, PickEnrichment>();
    if (!src) return out;
    for (const [pick, { team, gsis, age }] of src) {
      // Prefer depth-chart SS/FS/CB (the only real SS-vs-FS signal); otherwise
      // fall back to the coarse roster position (FS explicit, S/SAF -> SS default).
      const depthPos = DbPositionService.get(gsis);
      const rosterPos = gsis ? posByGsis?.get(gsis) : undefined;
      const positionLabel = depthPos ?? (rosterPos && DB_POSITIONS.has(rosterPos) ? rosterPos : null);
      const bio = gsis ? bioByGsis?.get(gsis) : undefined;
      const realAge = age ?? (bio?.birthYear ? year - bio.birthYear : null);
      out.set(pick, { team, positionLabel, age: realAge, heightInches: bio?.heightInches ?? null, weight: bio?.weight ?? null });
    }
    return out;
  },
};
