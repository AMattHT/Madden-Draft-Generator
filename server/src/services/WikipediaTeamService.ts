import fs from 'fs';
import path from 'path';
import { CACHE_DIR } from '../config/paths';
import { normalizeName } from '../util/csv';
import { TeamInfo, espnLogo } from './TeamService';

/**
 * Drafting teams for pre-1980 NFL drafts, which nflverse doesn't cover. Sourced
 * from the English Wikipedia "<year> NFL draft" articles by parsing the rendered
 * HTML draft tables (columns located by header, so both the templated years and
 * the raw-wikitable years work), joined to a generated class BY PLAYER NAME.
 * AFL drafts (1960–69) live on separate pages and are not parsed.
 */

// Continuing franchises (same identity today) -> ESPN logo code.
const LOGO: Record<string, string> = {
  'Pittsburgh Steelers': 'pit',
  'Philadelphia Eagles': 'phi',
  'Green Bay Packers': 'gb',
  'Chicago Bears': 'chi',
  'New York Giants': 'nyg',
  'Detroit Lions': 'det',
  'Cleveland Browns': 'cle',
  'San Francisco 49ers': 'sf',
  'Minnesota Vikings': 'min',
  'Dallas Cowboys': 'dal',
  'New York Jets': 'nyj',
  'New Orleans Saints': 'no',
  'New England Patriots': 'ne',
  'Miami Dolphins': 'mia',
  'Kansas City Chiefs': 'kc',
  'Denver Broncos': 'den',
  'Cincinnati Bengals': 'cin',
  'Buffalo Bills': 'buf',
  'Atlanta Falcons': 'atl',
  'Tampa Bay Buccaneers': 'tb',
  'Seattle Seahawks': 'sea',
};

// Relocated / renamed / defunct teams -> neutral chip (nicer abbreviations).
const CHIP: Record<string, string> = {
  'Washington Redskins': 'WAS',
  'Boston Redskins': 'BOS',
  'Los Angeles Rams': 'LAR',
  'Cleveland Rams': 'CLE',
  'Houston Oilers': 'HOU',
  'Baltimore Colts': 'BAL',
  'St. Louis Cardinals': 'STL',
  'Chicago Cardinals': 'CRD',
  'San Diego Chargers': 'SD',
  'Oakland Raiders': 'OAK',
  'Pittsburgh Pirates': 'PIT',
  'New York Bulldogs': 'NYB',
  'Brooklyn Dodgers': 'BKN',
  'Boston Patriots': 'BOS',
};

/** Derive a short chip abbreviation from a team's full name. */
function deriveAbbr(name: string): string {
  const words = name.split(/\s+/).filter((w) => !/^(of|the|at)$/i.test(w));
  return words.map((w) => w[0]).join('').toUpperCase().slice(0, 3) || '?';
}

const logoInfo = (name: string): TeamInfo => ({ abbr: LOGO[name].toUpperCase(), name, logo: espnLogo(LOGO[name]) });
const chipInfo = (name: string): TeamInfo => ({ abbr: CHIP[name] ?? deriveAbbr(name), name, logo: null });

function resolveWikiTeam(fullName: string): TeamInfo {
  // Strip wikilinks, then trade notes / league suffix (e.g. "… NFL (from New Orleans)").
  const name = fullName
    .replace(/\[\[|\]\]/g, '')
    .replace(/\s*\(from[^)]*\)/gi, '')
    .replace(/\s+(NFL|AFL)\b.*$/i, '')
    .trim();
  if (name in LOGO) return logoInfo(name);
  if (name in CHIP) return chipInfo(name);
  // Substring fallback: a known team name embedded in a messier cell.
  for (const n in LOGO) if (name.includes(n)) return logoInfo(n);
  for (const n in CHIP) if (name.includes(n)) return chipInfo(n);
  return chipInfo(name);
}

const cacheFile = (year: number) => path.join(CACHE_DIR, `wiki_nfl_draft_${year}.html`);

async function fetchHtml(year: number): Promise<string> {
  const file = cacheFile(year);
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  const url =
    `https://en.wikipedia.org/w/api.php?action=parse&page=${year}_NFL_draft` +
    `&prop=text&format=json&formatversion=2&redirects=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'MaddenDraftClassGenerator/0.1 (personal modding tool)' },
  });
  if (!res.ok) throw new Error(`wikipedia ${year} fetch failed: HTTP ${res.status}`);
  const json = (await res.json()) as { parse?: { text?: string }; error?: { info?: string } };
  if (json.error) throw new Error(`wikipedia ${year}: ${json.error.info || 'api error'}`);
  const html = json.parse?.text;
  // A real draft article is large. Only cache substantial responses so a throttled
  // or partial reply isn't poisoned into the on-disk cache — throw to retry later.
  if (!html || html.length < 20_000) throw new Error(`wikipedia ${year}: response too small (${html?.length ?? 0})`);
  fs.writeFileSync(file, html);
  return html;
}

/** Plain text of an HTML table cell: strip tags/refs/footnotes, decode basics. */
function cellText(html: string): string {
  return html
    .replace(/<sup[\s\S]*?<\/sup>/g, '') // reference/footnote superscripts
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\[[^\]]*\]/g, '') // [1] style refs
    .replace(/[†‡*^]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const memo = new Map<number, Map<string, TeamInfo>>();

/** Parse one wikitable's rows into name -> team, using header-located columns. */
function parseTable(tableHtml: string, out: Map<string, TeamInfo>): void {
  const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
  let teamIdx = -1;
  let playerIdx = -1;
  for (const row of rows) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => cellText(m[1]));
    if (!cells.length) continue;
    // Header row: locate the team + player columns (may repeat per round).
    const ti = cells.findIndex((c) => /\bteam\b/i.test(c));
    const pi = cells.findIndex((c) => /^player$/i.test(c));
    if (ti >= 0 && pi >= 0) {
      teamIdx = ti;
      playerIdx = pi;
      continue;
    }
    if (teamIdx < 0 || playerIdx < 0) continue;
    if (cells.length <= Math.max(teamIdx, playerIdx)) continue;
    const team = cells[teamIdx];
    const player = cells[playerIdx];
    if (!team || !player) continue;
    const key = normalizeName(player);
    if (key) out.set(key, resolveWikiTeam(team));
  }
}

export const WikipediaTeamService = {
  /** normalized(player name) -> drafting team, for a pre-1980 NFL draft. Returns
   *  an empty map on any failure so team logos degrade gracefully to absent. */
  async teamsByName(year: number): Promise<Map<string, TeamInfo>> {
    const cached = memo.get(year);
    if (cached) return cached;
    const out = new Map<string, TeamInfo>();
    try {
      const html = await fetchHtml(year);
      const tables = html.match(/<table[^>]*wikitable[\s\S]*?<\/table>/g) ?? [];
      for (const table of tables) parseTable(table, out);
    } catch {
      return out;
    }
    memo.set(year, out);
    return out;
  },
};
