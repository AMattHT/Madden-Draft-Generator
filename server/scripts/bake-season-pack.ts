/**
 * Bake a season pack (data/seasons/<year>.json) for the historic-season franchise tools.
 *
 *   npx tsx scripts/bake-season-pack.ts 1975 [--offline]
 *
 * Sources (all cached under server/cache so a re-bake is offline):
 *   - Wikipedia "<year> NFL season": the six/eight division standings tables give the
 *     teams, their divisions, and the final W-L-T / PF / PA.
 *   - Wikipedia "<year> <Team> season": each club's regular-season schedule table
 *     (Week, Date, Opponent, Result, Venue). Every game appears twice (once per club);
 *     the baker keeps one row per game and cross-checks the two scores.
 *   - nflverse rosters: roster_<year>.csv (team code, position, names, birth date).
 *   - data/seasons/overrides/<year>.json: the playoff bracket and anything else the
 *     Wikipedia templates do not expose as a table.
 *   - The app's own player pool (PlayerLookupService.matchActive) to attach a poolKey
 *     to every roster row it can identify.
 */
import fs from 'fs';
import path from 'path';
import { CACHE_DIR } from '../src/config/paths';
import { parseCsvFile } from '../src/util/csv';
import { PlayerLookupService } from '../src/services/PlayerLookupService';
import { TeamDraftService } from '../src/services/TeamDraftService';
import { TeamService } from '../src/services/TeamService';
import { EraRulesService } from '../src/services/EraRulesService';
import { SEASONS_DIR, type SeasonPack, type SeasonTeam, type SeasonGameRow, type StandingRow, type RosterPlayer, type PlayoffGame } from '../src/services/SeasonPackService';

const args = process.argv.slice(2);
const year = parseInt(args[0] || '', 10);
if (!year) { console.error('usage: bake-season-pack.ts <year>'); process.exit(2); }
const offline = args.includes('--offline');
const UA = { 'User-Agent': 'MaddenDraftClassGenerator/0.1 (personal modding tool)' };

/** Historic full names -> that season's nflverse team code. */
const CODE_BY_NAME: Record<string, string> = {
  'Baltimore Colts': 'BAL', 'Miami Dolphins': 'MIA', 'Buffalo Bills': 'BUF', 'New York Jets': 'NYJ', 'New England Patriots': 'NE', 'Boston Patriots': 'BOS',
  'Pittsburgh Steelers': 'PIT', 'Cincinnati Bengals': 'CIN', 'Houston Oilers': 'HOU', 'Cleveland Browns': 'CLE',
  'Oakland Raiders': 'OAK', 'Los Angeles Raiders': 'RAI', 'Denver Broncos': 'DEN', 'Kansas City Chiefs': 'KC', 'San Diego Chargers': 'SD', 'Seattle Seahawks': 'SEA',
  'St. Louis Cardinals': 'STL', 'Phoenix Cardinals': 'PHO', 'Dallas Cowboys': 'DAL', 'Washington Redskins': 'WAS', 'New York Giants': 'NYG', 'Philadelphia Eagles': 'PHI',
  'Minnesota Vikings': 'MIN', 'Detroit Lions': 'DET', 'Chicago Bears': 'CHI', 'Green Bay Packers': 'GB', 'Tampa Bay Buccaneers': 'TB',
  'Los Angeles Rams': 'LA', 'San Francisco 49ers': 'SF', 'Atlanta Falcons': 'ATL', 'New Orleans Saints': 'NO',
};
/** Clubs whose Wikipedia season article needs a disambiguator. */
const WIKI_TITLE: Record<string, string> = { 'St. Louis Cardinals': 'St. Louis Cardinals (NFL)' };

// ------------------------------------------------------------------ fetch + parse
async function wikiHtml(page: string): Promise<string> {
  const file = path.join(CACHE_DIR, `wiki_${page.replace(/ /g, '_')}.html`);
  if (fs.existsSync(file) && fs.statSync(file).size > 20_000) return fs.readFileSync(file, 'utf8');
  if (offline) throw new Error(`not cached: ${page}`);
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=text&format=json&formatversion=2&redirects=1`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: UA });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 6000 * (attempt + 1))); continue; }
    if (!res.ok) throw new Error(`wikipedia ${page}: HTTP ${res.status}`);
    const json = (await res.json()) as { parse?: { text?: string }; error?: { info?: string } };
    if (json.error) throw new Error(`wikipedia ${page}: ${json.error.info}`);
    const html = json.parse?.text ?? '';
    if (html.length < 20_000) throw new Error(`wikipedia ${page}: response too small`);
    fs.writeFileSync(file, html);
    await new Promise((r) => setTimeout(r, 2500));
    return html;
  }
  throw new Error(`wikipedia ${page}: rate limited`);
}

const cellText = (html: string) => html
  .replace(/<sup[\s\S]*?<\/sup>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#8211;|&ndash;/g, '–').replace(/\[[^\]]*\]/g, '')
  .replace(/\s+/g, ' ').trim();
const tables = (html: string) => html.match(/<table[^>]*wikitable[\s\S]*?<\/table>/g) ?? [];
const rowsOf = (t: string) => [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => cellText(c[1])));
const toInt = (s: string | undefined) => { const n = parseInt(String(s ?? '').replace(/,/g, ''), 10); return Number.isFinite(n) ? n : null; };

interface DivisionTable { conference: 'AFC' | 'NFC'; division: string; rows: StandingRow[] }

/** The standings tables of "<year> NFL season": header "AFC East", then W L T PCT ... rows. */
function parseStandings(html: string): DivisionTable[] {
  const out: DivisionTable[] = [];
  for (const t of tables(html)) {
    const rows = rowsOf(t);
    const title = rows[0]?.[0] ?? '';
    const m = /^(AFC|NFC)\s+(East|Central|West|North|South)$/.exec(title);
    if (!m) continue;
    const header = rows.find((r) => r.includes('W') && r.includes('L'));
    if (!header) continue;
    const iW = header.indexOf('W'), iL = header.indexOf('L'), iT = header.indexOf('T'), iPF = header.indexOf('PF'), iPA = header.indexOf('PA');
    const body: StandingRow[] = [];
    for (const r of rows) {
      if (r === header || r.length <= iL || !/^[A-Z]/.test(r[0]) || toInt(r[iW]) == null) continue;
      body.push({ team: r[0], wins: toInt(r[iW])!, losses: toInt(r[iL])!, ties: iT >= 0 ? toInt(r[iT]) ?? 0 : 0, pointsFor: iPF >= 0 ? toInt(r[iPF]) : null, pointsAgainst: iPA >= 0 ? toInt(r[iPA]) : null });
    }
    out.push({ conference: m[1] as 'AFC' | 'NFC', division: `${m[1]} ${m[2]}`, rows: body });
  }
  return out;
}

interface TeamGame { week: number; date: string; opponent: string; home: boolean; ownScore: number | null; oppScore: number | null; venue: string | null }

/** A club's regular-season schedule table (the one whose weeks run 1..N through the autumn). */
function parseSchedule(html: string, gamesPerTeam: number): TeamGame[] {
  let best: TeamGame[] = [];
  for (const t of tables(html)) {
    const rows = rowsOf(t);
    const header = rows[0] ?? [];
    const iWeek = header.findIndex((c) => /^week$/i.test(c)), iDate = header.findIndex((c) => /^date$/i.test(c)), iOpp = header.findIndex((c) => /^opponent$/i.test(c)), iRes = header.findIndex((c) => /^result$/i.test(c)), iVen = header.findIndex((c) => /^(venue|game site|site)$/i.test(c));
    if (iWeek < 0 || iOpp < 0 || iRes < 0) continue;
    const games: TeamGame[] = [];
    for (const r of rows.slice(1)) {
      const wk = toInt(r[iWeek]);
      if (wk == null || r.length <= Math.max(iOpp, iRes)) continue;
      const opp = r[iOpp];
      if (!opp || /bye/i.test(opp)) continue;
      const home = !/^at\s/i.test(opp) && !/^@/.test(opp);
      // Pages differ on score order (own-first vs winner-first), so orient by the letter.
      const res = /([WLT])\s*(\d+)\s*[–-]\s*(\d+)/.exec(r[iRes] ?? '');
      const a = res ? toInt(res[2]) : null, b = res ? toInt(res[3]) : null;
      const hi = a != null && b != null ? Math.max(a, b) : null, lo = a != null && b != null ? Math.min(a, b) : null;
      const ownScore = res?.[1] === 'W' ? hi : res?.[1] === 'L' ? lo : a;
      const oppScore = res?.[1] === 'W' ? lo : res?.[1] === 'L' ? hi : b;
      games.push({ week: wk, date: iDate >= 0 ? r[iDate] : '', opponent: opp.replace(/^(at\s+|@\s*)/i, '').trim(), home, ownScore, oppScore, venue: iVen >= 0 ? r[iVen] || null : null });
    }
    const autumn = games.filter((g) => /September|October|November|December/.test(g.date)).length;
    if (games.length >= gamesPerTeam - 2 && autumn >= games.length - 2 && games.length > best.length) best = games;
  }
  return best;
}

const modernNick = (franchiseName: string) => franchiseName.split(' ').pop()!;

// ------------------------------------------------------------------ main
(async () => {
  const rules = EraRulesService.rulesFor(year);
  if (!rules) throw new Error(`no era rules for ${year}`);
  const warnings: string[] = [];
  const sources: string[] = [];

  // 1. Teams + standings.
  const seasonHtml = await wikiHtml(`${year} NFL season`);
  sources.push(`https://en.wikipedia.org/wiki/${year}_NFL_season`);
  const divTables = parseStandings(seasonHtml);
  if (!divTables.length) throw new Error('no division standings tables found');
  const franchises = new Map(TeamService.franchises().map((f) => [f.key, f]));
  const teams: SeasonTeam[] = [];
  const divisions: SeasonPack['divisions'] = {};
  const standings: StandingRow[] = [];
  for (const dt of divTables) {
    (divisions[dt.conference] ??= {})[dt.division] = [];
    dt.rows.forEach((row, i) => {
      const name = row.team;
      const key = CODE_BY_NAME[name];
      if (!key) { warnings.push(`no team code for "${name}"`); return; }
      const franchise = TeamDraftService.franchiseOf({ abbr: key, name, logo: null }, year);
      const modern = franchise ? franchises.get(franchise) : null;
      if (!modern) warnings.push(`no modern franchise for "${name}"`);
      const parts = name.split(' ');
      teams.push({ key, city: parts.slice(0, -1).join(' '), nick: parts[parts.length - 1], name, conference: dt.conference, division: dt.division, franchise: franchise ?? '', modernName: modern ? modernNick(modern.name) : '', divisionRank: i + 1 });
      divisions[dt.conference][dt.division].push(key);
      standings.push({ ...row, team: key });
    });
  }
  const byName = new Map(teams.map((t) => [t.name, t]));
  const aliasName = (s: string) => {
    const n = s.replace(/\s+\(.*\)$/, '').trim();
    if (byName.has(n)) return n;
    const hit = teams.find((t) => n.endsWith(t.nick) || n === t.city);
    return hit?.name ?? n;
  };

  // 2. Schedule from every club's page, one row per game.
  const games = new Map<string, SeasonGameRow>();
  const conflicts: string[] = [];
  for (const t of teams) {
    const title = `${year} ${WIKI_TITLE[t.name] ?? t.name} season`;
    let html: string;
    try { html = await wikiHtml(title); } catch (e) { warnings.push(`${t.name}: ${(e as Error).message}`); continue; }
    sources.push(`https://en.wikipedia.org/wiki/${title.replace(/ /g, '_')}`);
    const sched = parseSchedule(html, rules.gamesPerTeam);
    if (sched.length !== rules.gamesPerTeam) warnings.push(`${t.name}: parsed ${sched.length} games, expected ${rules.gamesPerTeam}`);
    for (const g of sched) {
      const opp = byName.get(aliasName(g.opponent));
      if (!opp) { warnings.push(`${t.name} week ${g.week}: unknown opponent "${g.opponent}"`); continue; }
      const home = g.home ? t.key : opp.key, away = g.home ? opp.key : t.key;
      const homeScore = g.home ? g.ownScore : g.oppScore, awayScore = g.home ? g.oppScore : g.ownScore;
      const id = `${g.week}|${away}|${home}`;
      const prev = games.get(id);
      if (prev) {
        if ((prev.homeScore ?? homeScore) !== homeScore || (prev.awayScore ?? awayScore) !== awayScore) conflicts.push(`${id}: ${prev.awayScore}-${prev.homeScore} vs ${awayScore}-${homeScore}`);
        prev.homeScore ??= homeScore; prev.awayScore ??= awayScore; prev.venue ??= g.venue;
        continue;
      }
      games.set(id, { week: g.week, date: g.date, away, home, awayScore, homeScore, venue: g.venue });
    }
  }
  if (conflicts.length) warnings.push(`score conflicts between the two clubs' pages: ${conflicts.join('; ')}`);
  const schedule = [...games.values()].sort((a, b) => a.week - b.week || a.home.localeCompare(b.home));
  // Cross-check the computed records against the standings table.
  for (const s of standings) {
    let w = 0, l = 0, ti = 0;
    for (const g of schedule) {
      if (g.homeScore == null || g.awayScore == null) continue;
      const isHome = g.home === s.team, isAway = g.away === s.team;
      if (!isHome && !isAway) continue;
      const mine = isHome ? g.homeScore : g.awayScore, theirs = isHome ? g.awayScore : g.homeScore;
      if (mine > theirs) w++; else if (mine < theirs) l++; else ti++;
    }
    if (w !== s.wins || l !== s.losses || ti !== s.ties) warnings.push(`${s.team}: schedule says ${w}-${l}-${ti}, standings say ${s.wins}-${s.losses}-${s.ties}`);
  }

  // 3. Rosters (nflverse) joined to the pool.
  const rosterFile = path.join(CACHE_DIR, `nflverse_roster_${year}.csv`);
  if (!fs.existsSync(rosterFile)) {
    if (offline) throw new Error(`not cached: ${rosterFile}`);
    const res = await fetch(`https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${year}.csv`, { headers: UA });
    if (!res.ok) throw new Error(`nflverse roster ${year}: HTTP ${res.status}`);
    fs.writeFileSync(rosterFile, Buffer.from(await res.arrayBuffer()));
  }
  sources.push(`https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${year}.csv`);
  const rows = parseCsvFile<Record<string, string>>(rosterFile);
  const rosters: Record<string, RosterPlayer[]> = {};
  let matched = 0, total = 0;
  const teamKeys = new Set(teams.map((t) => t.key));
  for (const r of rows) {
    const team = r.team;
    if (!teamKeys.has(team)) { if (!warnings.some((w) => w.startsWith(`roster team ${team}`))) warnings.push(`roster team ${team} is not in the standings`); continue; }
    const first = (r.first_name || r.full_name?.split(' ')[0] || '').trim();
    const last = (r.last_name || r.full_name?.split(' ').slice(1).join(' ') || '').trim();
    if (!first || !last) continue;
    const birthYear = toInt(r.birth_date?.slice(0, 4));
    const hit = PlayerLookupService.matchActive(first, last, { season: year, college: r.college || null, birthYear });
    total++; if (hit) matched++;
    (rosters[team] ??= []).push({
      first, last, pos: r.position || '', slot: r.depth_chart_position || null, jersey: toInt(r.jersey_number) || null,
      birth: r.birth_date || null, height: toInt(r.height), weight: toInt(r.weight), college: r.college || hit?.college || null,
      poolKey: hit?.key ?? null,
    });
  }
  for (const t of teams) if (!rosters[t.key]?.length) warnings.push(`${t.name}: no roster rows`);

  // 4. Playoffs and other hand-checked facts.
  const overrideFile = path.join(SEASONS_DIR, 'overrides', `${year}.json`);
  const override = fs.existsSync(overrideFile) ? (JSON.parse(fs.readFileSync(overrideFile, 'utf8')) as { playoffs?: PlayoffGame[] }) : {};
  const playoffs = override.playoffs ?? [];
  if (!playoffs.length) warnings.push('no playoff results (add data/seasons/overrides/<year>.json)');

  const parked = [...franchises.values()].filter((f) => !teams.some((t) => t.franchise === f.key)).map((f) => modernNick(f.name)).sort();

  const pack: SeasonPack = {
    year, bakedAt: new Date().toISOString(), sources: [...new Set(sources)], teams, divisions,
    gamesPerTeam: rules.gamesPerTeam, regularSeasonWeeks: rules.regularSeasonWeeks,
    schedule, standings, playoffs, rosters, parked, warnings,
  };
  fs.mkdirSync(SEASONS_DIR, { recursive: true });
  const out = path.join(SEASONS_DIR, `${year}.json`);
  fs.writeFileSync(out, JSON.stringify(pack, null, 1) + '\n');
  console.log(`wrote ${out}`);
  console.log(`teams ${teams.length}, games ${schedule.length}, roster rows ${total} (${matched} matched to the pool, ${Math.round(100 * matched / Math.max(1, total))}%), playoff games ${playoffs.length}, parked: ${parked.join(', ')}`);
  if (warnings.length) { console.log(`warnings (${warnings.length}):`); for (const w of warnings) console.log('  - ' + w); }
})().catch((e) => { console.error('ERR', e && (e.stack || e.message)); process.exit(1); });
