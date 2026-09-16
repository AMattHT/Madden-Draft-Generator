/**
 * Bake every NFL supplemental-draft selection from Wikipedia.
 *
 *   npx tsx scripts/bake-supplemental-picks.ts [--offline] [--add-rows]
 *
 * Nothing in the lookup marks a supplemental pick: Steve Young 1984 is stored as
 * round 1 / pick 1 (colliding with Irving Fryar), the others as undrafted, and most
 * of the 1984 USFL/CFL draft (Reggie White, Gary Zimmerman, Mike Rozier) is absent.
 *
 * Sources:
 *   - "List of NFL supplemental draft picks": every regular supplemental pick since
 *     1977 (Year | Player | Position | Round | NFL team | College | Reason).
 *   - "1984 NFL supplemental draft of USFL and CFL players": 84 picks in three rounds
 *     of 28 (Pick # | NFL team | Player | Position | Pro team | College).
 *   - nflverse players.csv (cached): the in-round ordinal for a regular pick, taken
 *     only when its round agrees with Wikipedia (the file stores supplemental picks
 *     in the same shape as regular ones, so it cannot be trusted on its own).
 *
 * Output: data/lookups/supplemental-picks.json, sorted by year, round, pick.
 *
 * --add-rows: for every pick with no lookup row, append one to ALL_PLAYER_LOOKUP.csv
 * (Round/Pick "UD"; the JSON supplies the round) and a career entry to
 * udfa_careers.json baked from the player's Wikipedia infobox (Pro Bowls, first-team
 * All-Pros, Hall of Fame, last season, games), leaving wAV to the accolade estimate.
 * Pages are cached under CACHE_DIR, so a re-run is offline.
 */
import fs from 'fs';
import path from 'path';
import { CACHE_DIR, LOOKUPS_DIR } from '../src/config/paths';
import { normalizeName, parseCsvFile } from '../src/util/csv';
import { PlayerLookupService, firstNameVariants } from '../src/services/PlayerLookupService';
import { PositionMapper } from '../src/services/PositionMapper';

const args = process.argv.slice(2);
const offline = args.includes('--offline');
const addRows = args.includes('--add-rows');
const UA = { 'User-Agent': 'MaddenDraftClassGenerator/1.3 (personal modding tool; amatthews@hive-tech.co)' };
const OUT = path.join(LOOKUPS_DIR, 'supplemental-picks.json');
const LOOKUP_CSV = path.join(LOOKUPS_DIR, 'ALL_PLAYER_LOOKUP.csv');
const UDFA_JSON = path.join(LOOKUPS_DIR, 'udfa_careers.json');
const LIST_PAGE = 'List of NFL supplemental draft picks';
const PAGE_1984 = '1984 NFL supplemental draft of USFL and CFL players';

export interface SupplementalPick {
  year: number;
  draft: 'regular' | 'usfl-cfl';
  round: number;
  pick: number | null; // in-round ordinal when known
  overall?: number; // 1984 table only
  first: string;
  last: string;
  position: string;
  college: string;
  team: string; // NFL club, full name of the era
  reason?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function wikiHtml(page: string): Promise<string | null> {
  const file = path.join(CACHE_DIR, `wiki_${page.replace(/[^A-Za-z0-9]+/g, '_')}.html`);
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  if (offline) return null;
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=text&format=json&formatversion=2&redirects=1`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: UA });
    if (res.status === 429) { await sleep(6000 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`wikipedia ${page}: HTTP ${res.status}`);
    const json = (await res.json()) as { parse?: { text?: string }; error?: { code?: string; info?: string } };
    await sleep(2500);
    if (json.error) {
      if (json.error.code === 'missingtitle') { fs.writeFileSync(file, ''); return null; }
      throw new Error(`wikipedia ${page}: ${json.error.info}`);
    }
    const html = json.parse?.text ?? '';
    fs.writeFileSync(file, html);
    return html;
  }
  throw new Error(`wikipedia ${page}: rate limited`);
}

const cellText = (html: string) => html
  .replace(/<sup[\s\S]*?<\/sup>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<br\s*\/?>/g, ' / ').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#8211;|&ndash;/g, '–').replace(/\[[^\]]*\]/g, '')
  .replace(/\s+/g, ' ').trim();
const wikitables = (html: string) => html.match(/<table[^>]*wikitable[\s\S]*?<\/table>/g) ?? [];
const rowsOf = (t: string) => [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => cellText(c[1])));
const ordinal = (s: string) => parseInt(s, 10);
/** Typos in the source tables. */
const TEAM_FIX: Record<string, string> = { 'Seattle Seahwks': 'Seattle Seahawks' };
const fixTeam = (t: string) => TEAM_FIX[t] ?? t;
const splitName = (name: string): [string, string] => {
  const parts = name.replace(/\s*\(.*?\)\s*/g, ' ').trim().split(/\s+/);
  return [parts[0] ?? '', parts.slice(1).join(' ')];
};

// ------------------------------------------------------------------ Wikipedia tables
async function regularPicks(): Promise<SupplementalPick[]> {
  const html = await wikiHtml(LIST_PAGE);
  if (!html) throw new Error(`${LIST_PAGE}: not cached (run without --offline)`);
  const table = wikitables(html).find((t) => /Year/.test(rowsOf(t)[0]?.[0] ?? ''));
  if (!table) throw new Error(`${LIST_PAGE}: table not found`);
  const out: SupplementalPick[] = [];
  let year = 0;
  for (const cells of rowsOf(table).slice(1)) {
    if (!cells.length) continue;
    // A year cell spans its rows: a 7-cell row starts a year, a 6-cell row continues it.
    const c = cells.length >= 7 ? cells : [String(year), ...cells];
    year = parseInt(c[0], 10) || year;
    const [first, last] = splitName(c[1]);
    if (!year || !first || !last) continue;
    out.push({ year, draft: 'regular', round: ordinal(c[3]), pick: null, first, last, position: c[2], college: c[5], team: fixTeam(c[4]), reason: c[6] || undefined });
  }
  return out;
}

async function picks1984(): Promise<SupplementalPick[]> {
  const html = await wikiHtml(PAGE_1984);
  if (!html) throw new Error(`${PAGE_1984}: not cached (run without --offline)`);
  const out: SupplementalPick[] = [];
  for (const t of wikitables(html)) {
    const rows = rowsOf(t);
    if (!/Pick/.test(rows[0]?.[0] ?? '')) continue;
    for (const c of rows.slice(1)) {
      const overall = parseInt(c[0], 10);
      if (!overall) continue;
      const [first, last] = splitName(c[2]);
      out.push({ year: 1984, draft: 'usfl-cfl', round: Math.ceil(overall / 28), pick: ((overall - 1) % 28) + 1, overall, first, last, position: c[3], college: c[5], team: fixTeam(c[1]) });
    }
  }
  return out;
}

// ------------------------------------------------------------------ nflverse ordinal
interface NvRow { display_name?: string; first_name?: string; last_name?: string; draft_year?: string; draft_round?: string; draft_pick?: string }
let nv: Map<string, NvRow[]> | null = null;
function nflverseRows(first: string, last: string, year: number): NvRow[] {
  if (!nv) {
    nv = new Map();
    try {
      for (const r of parseCsvFile<NvRow>(path.join(CACHE_DIR, 'nflverse_players.csv'))) {
        const y = parseInt(r.draft_year ?? '', 10);
        if (!y) continue;
        for (const n of new Set([r.display_name, `${r.first_name ?? ''} ${r.last_name ?? ''}`])) {
          const k = `${y}|${normalizeName(n ?? '')}`;
          if (n) (nv.get(k) ?? nv.set(k, []).get(k)!).push(r);
        }
      }
    } catch { /* no cache: ordinals stay null */ }
  }
  const out: NvRow[] = [];
  for (const f of firstNameVariants(first)) out.push(...(nv.get(`${year}|${normalizeName(`${f} ${last}`)}`) ?? []));
  return out;
}

// ------------------------------------------------------------------ infobox career
/** The infobox table, nested tables included (the Hall of Fame pane sits in one). */
function infobox(html: string): string | null {
  const start = html.indexOf('<table class="infobox');
  if (start < 0) return null;
  let depth = 0;
  const re = /<table|<\/table>/g;
  re.lastIndex = start;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0] === '</table>' ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  return html.slice(start);
}
/** Wikipedia's thumbnail host with tracking parameters -> the plain upload URL the lookup uses. */
const plainImageUrl = (src: string) =>
  src.replace(/&amp;/g, '&').replace(/\?.*$/, '').replace(/^https:\/\/thumb\.wikimedia\.org\//, 'https://upload.wikimedia.org/');
interface Bio { heightInches: number | null; weight: number | null; image: string | null; proBowls: number; allPro1: number; isHOF: boolean; careerTo: number | null; games: number | null; verified: boolean }
async function bio(p: SupplementalPick): Promise<Bio | null> {
  for (const title of [`${p.first} ${p.last}`, `${p.first} ${p.last} (American football)`, `${p.first} ${p.last} (${p.position === 'QB' ? 'quarterback' : 'American football'})`]) {
    const html = await wikiHtml(title);
    if (!html) continue;
    const box = infobox(html);
    if (!box) continue;
    const text = cellText(box);
    if (!/Passing|Rushing|Receiving|Tackles|Sacks|Interceptions|Games played|Field goals|Career history|NFL draft/i.test(text)) continue;
    const college = normalizeName(p.college);
    const verified = text.includes(String(p.year)) || (college.length >= 4 && normalizeName(text).includes(college));
    if (!verified) continue;
    const count = (re: RegExp) => { const m = re.exec(text); return m ? (m[1] ? parseInt(m[1], 10) : 1) : 0; };
    const img = /class="infobox-image"[\s\S]*?<img[^>]*src="([^"]+)"/.exec(box)?.[1] ?? null;
    // Last season from the "Career history" block (1985–1992 Philadelphia Eagles ...),
    // not from anywhere in the box: award and induction years would run it past.
    const hist = text.indexOf('Career history');
    const stops = ['Career highlights', 'Career NFL statistics', 'Career statistics', 'Player stats'].map((k) => text.indexOf(k, hist)).filter((i) => i > hist);
    const block = hist >= 0 ? text.slice(hist, stops.length ? Math.min(...stops) : hist + 800) : '';
    const years = [...block.matchAll(/\b(19[3-9]\d|20[0-2]\d)\b/g)].map((m) => parseInt(m[1], 10)).filter((y) => y >= p.year && y <= p.year + 25);
    if (/present/i.test(block)) years.push(new Date().getFullYear());
    // "Listed height 6 ft 5 in (1.96 m)" / "Listed weight 291 lb (132 kg)"; older boxes say "Height".
    const ht = /[Hh]eight\D{0,4}(\d)\s*ft\s*(\d{1,2})\s*in/.exec(text);
    const wt = /[Ww]eight\D{0,4}(\d{2,3})\s*lb/.exec(text);
    return {
      heightInches: ht ? parseInt(ht[1], 10) * 12 + parseInt(ht[2], 10) : null,
      weight: wt ? parseInt(wt[1], 10) : null,
      image: img ? plainImageUrl(img.startsWith('//') ? `https:${img}` : img) : null,
      proBowls: count(/(?:(\d+)×\s*)?Pro Bowl\b/),
      allPro1: count(/(?:(\d+)×\s*)?First-team All-Pro/),
      // The member pane links the player's own profootballhof.com page; the words
      // alone also appear for college and team halls of fame.
      isHOF: /profootballhof\.com\/players\//i.test(box),
      careerTo: years.length ? Math.max(...years) : null,
      games: (() => { const m = /Games played\s*(\d+)/.exec(text); return m ? parseInt(m[1], 10) : null; })(),
      verified,
    };
  }
  return null;
}

// ------------------------------------------------------------------ main
async function main(): Promise<void> {
  const picks = [...(await picks1984()), ...(await regularPicks())];
  // In-round ordinal for regular picks from nflverse, when the round agrees.
  for (const p of picks) {
    if (p.draft !== 'regular') continue;
    const rows = nflverseRows(p.first, p.last, p.year).filter((r) => parseInt(r.draft_round ?? '', 10) === p.round && parseInt(r.draft_pick ?? '', 10) > 0);
    if (rows.length === 1) p.pick = parseInt(rows[0].draft_pick!, 10);
  }
  picks.sort((a, b) => a.year - b.year || a.round - b.round || (a.pick ?? 99) - (b.pick ?? 99) || a.last.localeCompare(b.last));

  // Report: lookup match / none / ambiguous.
  const matched: string[] = []; const missing: SupplementalPick[] = []; const ambiguous: string[] = [];
  for (const p of picks) {
    const cands = PlayerLookupService.byYear(p.year).filter((r) => firstNameVariants(p.first).some((f) => normalizeName(`${f} ${p.last}`) === normalizeName(`${r.firstName} ${r.lastName}`)));
    if (cands.length === 0) missing.push(p);
    else if (cands.length === 1 || cands.some((r) => normalizeName(r.college) === normalizeName(p.college))) matched.push(`${p.year} ${p.first} ${p.last}`);
    else ambiguous.push(`${p.year} ${p.first} ${p.last} (${p.college}) vs ${cands.map((r) => r.college).join(' / ')}`);
  }
  fs.writeFileSync(OUT, JSON.stringify({
    _source: `Wikipedia "${LIST_PAGE}" and "${PAGE_1984}"; in-round pick for regular picks from nflverse players.csv when its round agrees. Baked by scripts/bake-supplemental-picks.ts.`,
    picks,
  }, null, 2) + '\n');
  console.log(`picks: ${picks.length} (${picks.filter((p) => p.draft === 'usfl-cfl').length} USFL/CFL 1984, ${picks.filter((p) => p.draft === 'regular').length} regular); ordinals known: ${picks.filter((p) => p.pick != null).length}`);
  console.log(`lookup: ${matched.length} matched, ${missing.length} missing, ${ambiguous.length} ambiguous`);
  for (const a of ambiguous) console.log('  ambiguous:', a);
  console.log('  positions:', [...new Set(picks.map((p) => p.position))].map((l) => `${l}->${PositionMapper.name(PositionMapper.toM26Id(l))}`).join(' '));
  if (!addRows) {
    for (const p of missing) console.log('  missing:', p.year, p.first, p.last, p.position, p.college, '|', p.team);
    return;
  }

  // Append lookup rows + careers for the missing picks.
  const careers = JSON.parse(fs.readFileSync(UDFA_JSON, 'utf8')) as { _notes: string[]; players: Record<string, Record<string, unknown>> };
  const csvRows: string[] = [];
  let bios = 0;
  for (const p of missing) {
    const b = await bio(p);
    if (b) bios++;
    const q = (s: string) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const to = b?.careerTo ?? '';
    csvRows.push([q(p.last), q(p.first), q(p.college), 'UD', 'UD', String(p.year), p.position, '', '', '', '', '', b?.heightInches != null ? String(b.heightInches) : '', b?.weight != null ? String(b.weight) : '', String(p.year), String(to), b ? String(b.allPro1) : '', b ? String(b.proBowls) : '', '', '', 'NFL', '', '', b?.image ?? '', '', b?.isHOF ? 'TRUE' : 'FALSE'].join(','));
    const key = `${p.year}|${p.first} ${p.last}`;
    if (b && !careers.players[key]) {
      careers.players[key] = { proBowls: b.proBowls, allPro1: b.allPro1, careerTo: b.careerTo, isHOF: b.isHOF, ...(b.games != null ? { games: b.games } : {}) };
    }
    console.log(`  + ${p.year} ${p.first} ${p.last} ${p.position} ${p.college}${b ? ` | PB ${b.proBowls} AP1 ${b.allPro1}${b.isHOF ? ' HOF' : ''} to ${b.careerTo ?? '?'} ${b.heightInches ?? '?'}in ${b.weight ?? '?'}lb` : ' | no page'}`);
  }
  const csv = fs.readFileSync(LOOKUP_CSV, 'utf8');
  const sep = csv.endsWith('\r\n') ? '' : '\r\n';
  fs.writeFileSync(LOOKUP_CSV, csv + sep + csvRows.join('\r\n') + '\r\n');
  fs.writeFileSync(UDFA_JSON, JSON.stringify(careers, null, 2) + '\n');
  console.log(`appended ${csvRows.length} lookup rows (${bios} with a Wikipedia bio), careers file now ${Object.keys(careers.players).length} entries`);
}

main().catch((e) => { console.error(e); process.exit(1); });
