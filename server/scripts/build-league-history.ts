/**
 * Bake data/lookups/league-history.json: every NFL title game and the season awards,
 * 1933 to 2025, in the shape LeagueHistoryService writes into a Madden 27 franchise.
 *
 *   npx tsx scripts/build-league-history.ts <MyFranchise static dir>
 *
 *   <MyFranchise static dir> = .../MyFranchise-2.0.2-extracted/static (not committed): its
 *   historical/LeaguePastHistory.json + LeaguePastAwards.json cover 1966-2025 with all seven
 *   awards; team/TeamIdentity.json resolves their team references.
 *   1933-1965 come from Wikipedia (NFL Championship Game results, AP Coach of the Year) and
 *   the AP award pages the awards bake already reads (MVP/OROY 1957 on, with the team column).
 */
import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../src/config/paths';
import { parseAwardTables } from '../src/services/AwardsService';
import { wikiPageHtml } from './lib/wikipedia';
import {
  FIRST_SUPER_BOWL_SEASON, FRANCHISES, LOGO_TO_KEY, NICKNAME_TO_KEY, validateLeagueHistory,
  type AwardKindH, type HistoryAward, type LeagueHistoryFile, type SeasonHistory,
} from '../src/services/LeagueHistoryData';

const staticDir = process.argv[2];
if (!staticDir || !fs.existsSync(path.join(staticDir, 'historical', 'LeaguePastHistory.json'))) {
  console.error('usage: build-league-history.ts <MyFranchise static dir>');
  process.exit(1);
}
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#160;|&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const clean = (s: string) => s.replace(/\[\d+\]|[*^†‡~]/g, '').replace(/\s*\(\d+\)\s*$/, '').trim();

/** Sanitise the dump's firstName/lastName: join with a space, drop any double-quoted
 *  nickname token (e.g. "Mean"), keep only the first co-winner before a "/" (the dump
 *  writes co-winners as one string split across the two fields), then re-split into
 *  first name (first token) and last name (the rest). */
function sanitiseName(firstName: unknown, lastName: unknown): { first: string; last: string } {
  let joined = `${String(firstName).trim()} ${String(lastName).trim()}`.trim();
  if (joined.includes('/')) joined = joined.split('/')[0].trim();
  const tokens = joined.split(/\s+/).filter((t) => t && !/^".*"$/.test(t));
  // A lone token (e.g. the dump's "G.Allen" with no space) has nowhere to be a first name
  // without leaving the required last name empty, so it becomes the last name instead.
  if (tokens.length <= 1) return { first: '', last: tokens[0] ?? '' };
  return { first: tokens[0], last: tokens.slice(1).join(' ') };
}

/** "Chicago Bears (3)" -> { key: 'CHI', city: 'Chicago' }; the nickname is the last word. */
function sideOf(teamText: string): { key: string; city: string } {
  const name = clean(teamText).replace(/\s*\(\d+\)\s*$/, '');
  const parts = name.split(' ');
  const nick = parts[parts.length - 1];
  const key = NICKNAME_TO_KEY[nick];
  if (!key) throw new Error(`unknown team "${name}"`);
  return { key, city: parts.slice(0, -1).join(' ') };
}

/** Wikipedia position text -> PositionE enum name. */
function posEnum(raw: string): string {
  const p = raw.toLowerCase();
  if (/quarterback/.test(p)) return 'QB';
  if (/fullback/.test(p)) return 'FB';
  if (/halfback|running back|tailback/.test(p)) return 'HB';
  if (/wide receiver|split end|flanker|\bend\b/.test(p) && !/tight|defensive/.test(p)) return 'WR';
  if (/tight end/.test(p)) return 'TE';
  if (/offensive tackle|\btackle\b/.test(p) && !/defensive/.test(p)) return 'LT';
  if (/guard/.test(p)) return 'LG';
  if (/center/.test(p)) return 'C';
  if (/defensive end/.test(p)) return 'LE';
  if (/defensive tackle|nose/.test(p)) return 'DT';
  if (/linebacker/.test(p)) return 'MLB';
  if (/cornerback|defensive back/.test(p)) return 'CB';
  if (/safety/.test(p)) return 'FS';
  if (/kicker/.test(p)) return 'K';
  if (/punter/.test(p)) return 'P';
  if (/coach/.test(p)) return 'HC';
  return 'Invalid_';
}

function splitName(full: string): { first: string; last: string } {
  const parts = clean(full).split(' ').filter(Boolean);
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') };
}

// ---------------------------------------------------------------- 1966-2025 from MyFranchise
function superBowlEra(): SeasonHistory[] {
  const rows = readJson(path.join(staticDir, 'historical', 'LeaguePastHistory.json')) as any[];
  const awardRows = readJson(path.join(staticDir, 'historical', 'LeaguePastAwards.json')) as any[];
  const identities = readJson(path.join(staticDir, 'team', 'TeamIdentity.json')) as any[];
  const awardByBinary = new Map(awardRows.map((a) => [a.Binary, a]));
  const keyByIdentity = new Map<string, string>();
  for (const t of identities) { const k = NICKNAME_TO_KEY[t.DisplayName]; if (k) keyByIdentity.set(t.Binary, k); }
  const ref = (bin: string, type: AwardKindH): HistoryAward | null => {
    const a = awardByBinary.get(bin);
    if (!a || /^n\/a/i.test(String(a.firstName)) || /^n\/a/i.test(String(a.lastName))) return null;
    const pos = a.Position === 'HC_CFM' ? 'HC' : String(a.Position || 'Invalid_');
    const { first, last } = sanitiseName(a.firstName, a.lastName);
    return { type, first, last, pos, franchise: keyByIdentity.get(a.teamIdentity) ?? '' };
  };
  const out: SeasonHistory[] = [];
  for (const r of rows) {
    const season = 2026 + Number(r.PeriodIndex); // the dump is from a 2026 save: -60 -> 1966
    const afc = { franchise: LOGO_TO_KEY[Number(r.AFC_TeamLogo)], city: String(r.AFC_CityName), score: Number(r.AFC_SB_Score) };
    const nfc = { franchise: LOGO_TO_KEY[Number(r.NFC_TeamLogo)], city: String(r.NFC_CityName), score: Number(r.NFC_SB_Score) };
    const afcWon = afc.score > nfc.score;
    const awards = [
      ref(r.CoachOfTheYear, 'COY'), ref(r.NFL_MVP, 'MVP'), ref(r.OffensivePOTY, 'OPOY'), ref(r.DefensivePOTY, 'DPOY'),
      ref(r.OffensiveROTY, 'OROY'), ref(r.DefensiveROTY, 'DROY'), ref(r.SB_MVP, 'SBMVP'),
    ].filter((a): a is HistoryAward => !!a);
    out.push({ season, game: `Super Bowl ${roman(season - 1965)}`, champion: afcWon ? afc : nfc, runnerUp: afcWon ? nfc : afc, afcSide: afcWon ? 'champion' : 'runnerUp', awards });
  }
  return out;
}
function roman(n: number): string {
  const t: [number, string][] = [[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = ''; for (const [v, r] of t) while (n >= v) { s += r; n -= v; } return s;
}

// ---------------------------------------------------------------- 1933-1965 from Wikipedia
function tablesWithHeader(html: string, ...heads: string[]): string[][][] {
  const out: string[][][] = [];
  for (const table of html.match(/<table[^>]*wikitable[\s\S]*?<\/table>/g) ?? []) {
    const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
    const header = [...(rows[0] ?? '').matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => text(m[1]));
    if (!heads.every((h, i) => new RegExp(`^${h}$`, 'i').test(header[i] ?? ''))) continue;
    out.push(rows.slice(1).map((r) => [...r.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => text(m[1]))));
  }
  return out;
}

async function championshipEra(): Promise<SeasonHistory[]> {
  const html = await wikiPageHtml('NFL_Championship_Game');
  const [table] = tablesWithHeader(html, 'Season', 'League', 'Winning team', 'Score', 'Losing team');
  if (!table) throw new Error('NFL_Championship_Game: results table not found');
  const out: SeasonHistory[] = [];
  for (const cells of table) {
    const season = Number(/(19\d\d)/.exec(cells[0] ?? '')?.[1]);
    if (!season || season < 1933 || season > 1965) continue;
    const [w, l] = (cells[3] ?? '').replace(/\s*\([^)]*\)\s*/g, '').split(/[–-]/).map((n) => Number(n.trim()));
    if (!Number.isInteger(w) || !Number.isInteger(l)) throw new Error(`${season}: bad score "${cells[3]}"`);
    const win = sideOf(cells[2]), lose = sideOf(cells[4]);
    out.push({ season, game: 'NFL Championship', champion: { ...win, franchise: win.key, score: w }, runnerUp: { ...lose, franchise: lose.key, score: l }, awards: [] } as SeasonHistory);
  }
  if (out.length !== 33) throw new Error(`NFL_Championship_Game: expected 33 seasons 1933-1965, parsed ${out.length}`);
  for (const s of out) { delete (s.champion as any).key; delete (s.runnerUp as any).key; }
  return out;
}

async function earlyAwards(): Promise<Map<number, HistoryAward[]>> {
  const byYear = new Map<number, HistoryAward[]>();
  const add = (season: number, a: HistoryAward) => { if (!byYear.has(season)) byYear.set(season, []); byYear.get(season)!.push(a); };
  const coy = tablesWithHeader(await wikiPageHtml('Associated_Press_NFL_Coach_of_the_Year_Award'), 'Season', 'Coach', 'Team')[0];
  if (!coy) throw new Error('Coach of the Year table not found');
  for (const cells of coy) {
    const season = Number(/(19\d\d)/.exec(cells[0] ?? '')?.[1]);
    if (!season || season >= FIRST_SUPER_BOWL_SEASON) continue;
    const { first, last } = splitName(cells[1]);
    add(season, { type: 'COY', first, last, pos: 'HC', franchise: sideOf(cells[2]).key });
  }
  const pages: Array<{ page: string; kinds: AwardKindH[] }> = [
    { page: 'Associated_Press_NFL_Most_Valuable_Player_Award', kinds: ['MVP'] },
    { page: 'Associated_Press_NFL_Rookie_of_the_Year_Award', kinds: ['OROY', 'DROY'] },
  ];
  for (const { page, kinds } of pages) {
    const tables = parseAwardTables(await wikiPageHtml(page));
    kinds.forEach((type, i) => {
      for (const r of tables[i] ?? []) {
        if (r.season >= FIRST_SUPER_BOWL_SEASON) continue;
        add(r.season, { type, first: r.first, last: r.last, pos: posEnum(r.pos), franchise: r.team ? sideOf(r.team).key : '' });
      }
    });
    await new Promise((res) => setTimeout(res, 800));
  }
  return byYear;
}

(async () => {
  const early = await championshipEra();
  const awards = await earlyAwards();
  for (const s of early) s.awards = awards.get(s.season) ?? [];
  const seasons = [...early, ...superBowlEra()].sort((a, b) => a.season - b.season);
  const file: LeagueHistoryFile = {
    _source: 'MyFranchise 2.0.2 static/historical (1966-2025) + Wikipedia NFL_Championship_Game, AP Coach of the Year, AP MVP and Rookie of the Year pages (1933-1965) via scripts/build-league-history.ts',
    _built: new Date().toISOString().slice(0, 10),
    seasons,
  };
  const problems = validateLeagueHistory(file);
  if (problems.length) { console.error(problems.join('\n')); throw new Error(`${problems.length} validation problems`); }
  const out = path.join(LOOKUPS_DIR, 'league-history.json');
  fs.writeFileSync(out, JSON.stringify(file, null, 0));
  const nAwards = seasons.reduce((n, s) => n + s.awards.length, 0);
  console.log(`${seasons.length} seasons ${seasons[0].season}-${seasons[seasons.length - 1].season}, ${nAwards} awards -> ${out}`);
  for (const y of [1933, 1958, 1966, 1975, 2025]) { const s = seasons.find((x) => x.season === y)!; console.log(`  ${y} ${s.game}: ${s.champion.city} ${s.champion.score}-${s.runnerUp.score} ${s.runnerUp.city}; ${s.awards.map((a) => `${a.type} ${a.last}`).join(', ')}`); }
})().catch((e) => { console.error('ERR', e && (e.stack || e.message)); process.exit(1); });
