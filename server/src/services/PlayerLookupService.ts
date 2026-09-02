import path from 'path';
import { LOOKUPS_DIR } from '../config/paths';
import { parseCsvFile, normalizeName } from '../util/csv';
import { BaselinePlayer } from '../types/player';
import { HistoricalAccoladeService } from './HistoricalAccoladeService';
import { NflverseCareerService } from './NflverseCareerService';
import { PositionMapper } from './PositionMapper';
import { RatingService } from './RatingService';

export interface PlayerSearchResult {
  firstName: string;
  lastName: string;
  draftYear: number;
  draftRound: number | null;
  draftPick: number | null;
  position: string;
  college: string;
  league: string;
}

interface RawRow {
  'Last Name': string;
  'First Name': string;
  'College/Univ': string;
  Round: string;
  Pick: string;
  'Draft Class': string;
  Position: string;
  Jersey: string;
  PhotoID: string;
  'Player Assets ID': string;
  CommID: string;
  PLPO: string;
  Height: string;
  Weight: string;
  From: string;
  To: string;
  AP1: string;
  PB: string;
  St: string;
  wAV: string;
  League: string;
  Race: string;
  'Home State': string;
  Wiki_Image_URL: string;
  PFR_Image_URL: string;
  isHOF: string;
}

function toInt(s: string | undefined): number | null {
  if (s === undefined || s === null || s.trim() === '') return null;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

/** Round column: plain integers, plus the 1960 AFL rows written as "AFL 1" (and the
 *  pick column's "ALF 1" typo). Returns the number after the league tag. */
function toRound(s: string | undefined): number | null {
  if (!s) return null;
  const m = /^\s*(?:AFL|ALF|NFL)\s*(\d+)/i.exec(s);
  if (m) return parseInt(m[1], 10);
  return toInt(s);
}

/** The first common draft was 1967: rows still tagged "AFL" in 1967-69 are the same
 *  single draft as the NFL rows, so they belong to the one league view. */
function normalizeLeague(raw: string, draftYear: number): string {
  if (!raw) return 'NFL';
  if (raw.toUpperCase() === 'AFL' && draftYear >= 1967) return 'NFL';
  return raw;
}

function toFloat(s: string | undefined): number | null {
  if (s === undefined || s === null || s.trim() === '') return null;
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

/** Strip PFR marker glyphs (‡ = Hall of Fame, † *, ^, ¤, +) and any digits that
 *  trail them from a display name (e.g. "Motley‡" -> "Motley", "Sprinkle‡1" -> "Sprinkle"). */
function cleanName(s: string | undefined): string {
  return (s || '').replace(/[‡†*^¤+]\d*/g, '').trim();
}

/** Parse a height that may be inches ("74") or feet-inches ("6-2"). */
function toHeightInches(s: string | undefined): number | null {
  if (!s || s.trim() === '') return null;
  const t = s.trim();
  if (t.includes('-')) {
    const [ft, inch] = t.split('-').map((x) => parseInt(x, 10));
    if (!Number.isNaN(ft) && !Number.isNaN(inch)) return ft * 12 + inch;
  }
  const n = parseInt(t, 10);
  return Number.isNaN(n) ? null : n;
}

// The just-drafted class(es) haven't compiled a real career yet, so a stored
// wAV of 0 is a rookie placeholder (2025 ships all-zero), NOT a bust outcome —
// rate them from draft slot like the incoming 2026 class, not as actual-0.
const CURRENT_YEAR = new Date().getFullYear();

let rowsCache: RawRow[] | null = null;
/** Surname particles that ALL_PLAYER_LOOKUP.csv mis-split onto the first name.
 *
 *  86 rows arrived as e.g. `Last="Noy", First="Kyle Van"` and
 *  `Last="Brocklin", First="Norm Van"` -- the particle stayed with the given
 *  name. Concatenated the name still reads correctly, which is why this hid for
 *  so long, but every match against another source fails: nflverse keys Kyle
 *  Van Noy as `kyle|vannoy` while this file yields `kylevan|noy`, so he never
 *  picks up a headshot, career bits, or a combine row. Two Hall of Famers (Van
 *  Brocklin, Van Buren) are in the affected set.
 */
const SURNAME_PARTICLES = new Set([
  'van', 'vander', 'vanden', 'von', 'de', 'del', 'della', 'di', 'da', 'du',
  'la', 'le', 'st', 'st.', 'ste', 'ste.', 'mc', 'mac', 'el', 'ah', 'te', 'ter',
  'abdul', 'bin', 'al',
]);

function repairSurname(first: string, last: string): { first: string; last: string } {
  const parts = first.split(/\s+/).filter(Boolean);
  if (parts.length < 2 || !last) return { first, last };
  const tail = parts[parts.length - 1];
  // Usual case: the particle rode along on the first name ("Kyle Van" + "Noy").
  if (SURNAME_PARTICLES.has(tail.toLowerCase())) {
    return { first: parts.slice(0, -1).join(' '), last: `${tail} ${last}` };
  }
  // Mirror case: the split landed a word early, leaving the particle alone as
  // the surname ("Antwaan Randle" + "El").
  if (SURNAME_PARTICLES.has(last.toLowerCase())) {
    return { first: parts.slice(0, -1).join(' '), last: `${tail} ${last}` };
  }
  return { first, last };
}

/** Stable identity for a merged player: year|league|first|last|pick ('u' = undrafted). */
export function playerKey(p: Pick<BaselinePlayer, 'draftYear' | 'league' | 'firstName' | 'lastName' | 'draftPick'>): string {
  return `${p.draftYear}|${p.league}|${normalizeName(p.firstName)}|${normalizeName(p.lastName)}|${p.draftPick ?? 'u'}`;
}

/** One compact browse row for the class builder. */
export interface CatalogPlayer {
  key: string; first: string; last: string; pos: string; mpos: string; grp: string;
  year: number; league: string; round: number | null; pick: number | null; college: string;
  wav: number | null; cal: number; hof: boolean; pb: number; ap1: number;
}

let byKey: Map<string, BaselinePlayer> | null = null;
let catalogCache: CatalogPlayer[] | null = null;
let byYear: Map<number, BaselinePlayer[]> | null = null;
let byNormName: Map<string, BaselinePlayer[]> | null = null;
const normName = (first: string, last: string) => `${first} ${last}`.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

function load(): void {
  if (rowsCache) return;
  rowsCache = parseCsvFile<RawRow>(path.join(LOOKUPS_DIR, 'ALL_PLAYER_LOOKUP.csv'));
  const all: BaselinePlayer[] = [];
  for (const row of rowsCache) {
    const draftYear = toInt(row['Draft Class']);
    if (draftYear === null) continue;
    const wav = toFloat(row.wAV);
    // A trailing '‡' on the name is PFR's Hall-of-Fame marker; it was never stripped
    // (players exported as "Motley‡") nor turned into the flag (24 HOFers read FALSE).
    const rawName = `${row['First Name'] || ''}${row['Last Name'] || ''}`;
    const rawLeague = (row.League || '').trim();
    const h = toHeightInches(row.Height);
    const w = toInt(row.Weight);
    const { first: fixedFirst, last: fixedLast } = repairSurname(
      cleanName(row['First Name']),
      cleanName(row['Last Name']),
    );
    const player: BaselinePlayer = {
      firstName: fixedFirst,
      lastName: fixedLast,
      college: (row['College/Univ'] || '').trim(),
      draftYear,
      draftRound: toRound(row.Round),
      draftPick: /^\s*(?:AFL|ALF)/i.test(row.Pick || '') ? null : toInt(row.Pick),
      position: (row.Position || '').trim(),
      jersey: toInt(row.Jersey),
      league: normalizeLeague(rawLeague, draftYear),
      isHOF: String(row.isHOF).trim().toUpperCase() === 'TRUE' || rawName.includes('‡'),
      photoId: toInt(row.PhotoID),
      playerAssetsId: (row['Player Assets ID'] || '').trim() || null,
      commId: toInt(row.CommID),
      plpo: (row.PLPO || '').trim() || null,
      // Clamp obvious data-entry errors (450 lb, 114 in, 1 lb) so they fall back to
      // combine/nflverse/position norms downstream instead of exporting garbage.
      heightInches: h != null && h >= 60 && h <= 84 ? h : null,
      weight: w != null && w >= 140 && w <= 400 ? w : null,
      homeState: (row['Home State'] || '').trim() || null,
      race: toInt(row.Race),
      wikiImageUrl: (row['Wiki_Image_URL'] || '').trim() || null,
      pfrImageUrl: (row['PFR_Image_URL'] || '').trim() || null,
      headshotUrl: null,
      careerFrom: toInt(row.From),
      careerTo: toInt(row.To),
      allPro1: toInt(row.AP1),
      proBowls: toInt(row.PB),
      seasonsStarted: toInt(row.St),
      wav,
      // PFR computes Approximate Value from 1960 on, so use actual wAV whenever
      // it exists (1960+); pre-1960 (and any missing wAV) falls back to predicted.
      // Require a real league too: blank-league rows with a stray wAV are data junk
      // (Kelly Toles wAV50, Todd Shanks wAV67) that otherwise rate as Star-dev. And
      // the current rookie class's wAV=0 is a placeholder, not a real 0 → slot-rate it.
      wavSource:
        draftYear >= 1960 && wav !== null && rawLeague !== '' && !(wav === 0 && draftYear >= CURRENT_YEAR - 1)
          ? 'actual'
          : 'predicted',
      source: 'local',
    };
    all.push(player);
  }
  // Order matters: collapse same-person duplicate rows first, then backfill
  // pre-1960 accolades (so the merged row's career signals are complete), then
  // resolve name-matched shared assets (which use those signals to pick owners).
  splitSharedCareers(all);
  const merged = mergeDuplicatePeople(all);
  applyHistoricalAccolades(merged);
  dedupSharedAssets(merged);
  sanitizeWikiPhotos(merged);
  sanitizeLegendPortraits(merged);
  byYear = new Map();
  byNormName = new Map();
  for (const p of merged) { const k = normName(p.firstName, p.lastName); (byNormName.get(k) ?? byNormName.set(k, []).get(k)!).push(p); }
  for (const p of merged) {
    if (!byYear.has(p.draftYear)) byYear.set(p.draftYear, []);
    byYear.get(p.draftYear)!.push(p);
  }
  reconstructUnorderedDrafts();
  // Stable keys last, once the pool is final: same-key collisions (rare) are
  // numbered in load order so every player stays addressable.
  byKey = new Map();
  for (const p of merged) {
    let k = playerKey(p);
    for (let n = 2; byKey.has(k); n++) k = `${playerKey(p)}#${n}`;
    p.key = k;
    byKey.set(k, p);
  }
}

/**
 * The 1960 AFL draft (a positional/territorial selection) carries no order in the
 * source: every draftee reads round 1, no pick. Without an order they all sort
 * behind the NFL's 20 rounds and get truncated. Reconstruct a plausible order from
 * career greatness - 12 per "round" so the AFL board interleaves with the NFL's.
 */
function reconstructUnorderedDrafts(): void {
  for (const [year, list] of byYear!) {
    const byLeague = new Map<string, BaselinePlayer[]>();
    for (const p of list) {
      if (p.draftRound == null) continue;
      const k = p.league.toUpperCase();
      if (!byLeague.has(k)) byLeague.set(k, []);
      byLeague.get(k)!.push(p);
    }
    for (const ps of byLeague.values()) {
      const rounds = new Set(ps.map((p) => p.draftRound));
      const picks = ps.filter((p) => p.draftPick != null).length;
      if (ps.length < 40 || rounds.size > 1 || picks > ps.length / 4) continue; // real order exists
      const ranked = [...ps].sort((a, b) => greatness(b) - greatness(a) || a.lastName.localeCompare(b.lastName));
      ranked.forEach((p, i) => {
        p.draftRound = Math.floor(i / 12) + 1;
        p.draftPick = i + 1;
      });
      void year;
    }
  }
}

/**
 * The lookup's Wikipedia image URLs were matched by name only, so ~450 are SVG
 * icons / logos and ~270 photos are shared by same-named players decades apart
 * (a 1942 Bruce Smith carried the Virginia Tech DE's photo). These feed portraits,
 * skin tone and gear observation, so: drop non-photos, and keep a URL shared
 * across draft years only on its most accomplished owner.
 */
/** Rows whose Hall-of-Fame flag was a famous namesake's, by "first last|year". */
const stampedNamesakes = new Set<string>();
const NO_CAREER_WAV = 20;

/** The CSV stamps isHOF by NAME: the 1969 Hofstra cornerback Jim Thorpe reads
 *  TRUE and carries plpo_legends_ThorpeJim. PFR's AV exists from 1960, so a real
 *  HOFer drafted in 1960+ always shows a career; a flagged row with none is the
 *  namesake — strip the flag and the legends portrait (menu image and the skin
 *  tone read from it). Short-career legends with their own EA cards (Bo Jackson,
 *  Dexter Jackson, David Tyree) are not flagged HOF, so they keep theirs. */
/** Hall of Famers inducted as COACHES, not players.
 *
 *  The CSV's '‡' marks the Hall of Fame without saying in which category, and
 *  coaching success must not inflate a player's rating. The career test below
 *  catches Dungy and Cowher for free because neither has a playing accolade on
 *  record, but it cannot catch Tom Flores -- he made an AFL All-Star team as a
 *  quarterback, and his 1959 class sits the wrong side of the 1960 gate anyway.
 *  A short explicit list is honest and auditable where a heuristic is not.
 */
const COACH_INDUCTEES = new Set(['tom flores', 'tony dungy', 'bill cowher']);

function sanitizeLegendPortraits(players: BaselinePlayer[]): void {
  for (const p of players) {
    if (!p.isHOF) continue;
    if (COACH_INDUCTEES.has(`${p.firstName} ${p.lastName}`.toLowerCase())) {
      p.isHOF = false;
      if (p.plpo && /^plpo_legends_/i.test(p.plpo)) { p.plpo = null; p.photoId = null; }
      continue;
    }
    if (p.draftYear < 1960) continue;
    // The flag has to be earned by PLAYING, so judge it on career value only.
    // Two traps sit on either side of that:
    //   * Undrafted rows (Round "UD") carry no career columns at all -- PFR's
    //     draft table only records wAV/PB/AP1 for players it drafted -- so the
    //     lookup row alone cannot tell a real undrafted HOFer from a namesake.
    //     All 24 rows the CSV marks with '‡' are undrafted, and 18 are 1960+.
    //     Their careers live in udfa_careers.json, so consult that too.
    //   * The '‡' does not distinguish a Hall of Fame PLAYER from a Hall of
    //     Fame COACH. Tony Dungy and Bill Cowher are marked, but were ordinary
    //     players; coaching success must not inflate a player's rating, so with
    //     no playing career on record they lose the flag like any other.
    // The namesake this rule exists for -- the 1969 Hofstra cornerback Jim
    // Thorpe, drafted round 17 -- has no career under either source, so he is
    // still caught.
    const career = NflverseCareerService.get(p.firstName, p.lastName, p.draftYear, p.draftPick);
    const wav = p.wav ?? career?.wav ?? 0;
    const proBowls = p.proBowls ?? career?.proBowls ?? 0;
    const allPro1 = p.allPro1 ?? career?.allPro1 ?? 0;
    if (wav >= NO_CAREER_WAV || proBowls || allPro1) continue;
    p.isHOF = false;
    stampedNamesakes.add(`${normName(p.firstName, p.lastName)}|${p.draftYear}`);
    if (p.plpo && /^plpo_legends_/i.test(p.plpo)) { p.plpo = null; p.photoId = null; }
  }
}

function sanitizeWikiPhotos(players: BaselinePlayer[]): void {
  const nonPhoto = /\.svg(\.png)?$|\/flag_|logo|icon|emblem|seal_of|coat_of_arms|wordmark|helmet|placeholder|no_image|silhouette/i;
  const byUrl = new Map<string, BaselinePlayer[]>();
  for (const p of players) {
    if (!p.wikiImageUrl) continue;
    if (nonPhoto.test(p.wikiImageUrl)) { p.wikiImageUrl = null; continue; }
    const list = byUrl.get(p.wikiImageUrl) ?? [];
    list.push(p);
    byUrl.set(p.wikiImageUrl, list);
  }
  for (const list of byUrl.values()) {
    const years = new Set(list.map((p) => p.draftYear));
    if (years.size <= 1) continue; // same-year rows (dual drafts) are the same person
    const owner = list.reduce((a, b) => (greatness(b) > greatness(a) ? b : a));
    for (const p of list) if (p.draftYear !== owner.draftYear) p.wikiImageUrl = null;
  }
}

/** Career greatness: wAV plus weighted accolades and a Hall-of-Fame bonus (shared by
 *  the All-Time Greats class and the 1960 AFL order reconstruction). */
function greatness(p: BaselinePlayer): number {
  return (p.wav ?? 0) + 6 * (p.allPro1 ?? 0) + 3 * (p.proBowls ?? 0) + (p.isHOF ? 40 : 0) + 2 * (p.seasonsStarted ?? 0);
}

/** Rough notability used to pick which of several same-named players a shared
 *  Madden asset / HOF flag actually belongs to. */
function accompl(p: BaselinePlayer): number {
  return (p.wav ?? 0) + 4 * (p.allPro1 ?? 0) + 2 * (p.proBowls ?? 0);
}

/** Two same-name/college/year rows share a Madden identity (asset id). */
function sharesIdentity(a: BaselinePlayer, b: BaselinePlayer): boolean {
  return (
    (a.photoId != null && a.photoId === b.photoId) ||
    (a.commId != null && a.commId === b.commId) ||
    (!!a.plpo && a.plpo === b.plpo) ||
    (!!a.playerAssetsId && a.playerAssetsId === b.playerAssetsId)
  );
}

/** A bare, undrafted row with no career/accolades/assets — a redundant stub of a
 *  fuller same-person row (e.g. Jim Otto's blank UD duplicate of his AFL entry). */
function isBlankStub(p: BaselinePlayer): boolean {
  return (
    p.draftRound == null && !p.allPro1 && !p.proBowls && !p.seasonsStarted &&
    p.photoId == null && p.commId == null && !p.plpo && !p.playerAssetsId && p.careerTo == null
  );
}

/** Fold `other`'s data into `keep` (fill blanks; keep the richer/real values). */
function mergeInto(keep: BaselinePlayer, other: BaselinePlayer): void {
  keep.draftRound = keep.draftRound ?? other.draftRound;
  keep.draftPick = keep.draftPick ?? other.draftPick;
  keep.jersey = keep.jersey ?? other.jersey;
  keep.heightInches = keep.heightInches ?? other.heightInches;
  keep.weight = keep.weight ?? other.weight;
  keep.homeState = keep.homeState ?? other.homeState;
  keep.photoId = keep.photoId ?? other.photoId;
  keep.playerAssetsId = keep.playerAssetsId ?? other.playerAssetsId;
  keep.commId = keep.commId ?? other.commId;
  keep.plpo = keep.plpo ?? other.plpo;
  keep.race = keep.race ?? other.race;
  keep.wikiImageUrl = keep.wikiImageUrl ?? other.wikiImageUrl;
  keep.pfrImageUrl = keep.pfrImageUrl ?? other.pfrImageUrl;
  keep.headshotUrl = keep.headshotUrl ?? other.headshotUrl;
  keep.allPro1 = Math.max(keep.allPro1 ?? 0, other.allPro1 ?? 0) || null;
  keep.proBowls = Math.max(keep.proBowls ?? 0, other.proBowls ?? 0) || null;
  keep.seasonsStarted = Math.max(keep.seasonsStarted ?? 0, other.seasonsStarted ?? 0) || null;
  keep.wav = Math.max(keep.wav ?? 0, other.wav ?? 0) || keep.wav;
  keep.careerFrom = Math.min(keep.careerFrom ?? 9999, other.careerFrom ?? 9999);
  if (keep.careerFrom === 9999) keep.careerFrom = null;
  keep.careerTo = Math.max(keep.careerTo ?? 0, other.careerTo ?? 0) || null;
  keep.isHOF = keep.isHOF || other.isHOF;
}

/**
 * The lookup lists a few people on more than one row (a draft row + an "all-time"
 * legends row, e.g. Jim Brown; or a real entry + a blank undrafted stub, e.g. Jim
 * Otto), which otherwise produces two prospects for one person in a class. Collapse
 * them, but only within the SAME name+college+draft-year+league and only when the
 * rows are provably the same person (shared Madden asset id, or one is a blank stub)
 * — so distinct same-name teammates (e.g. the two 1979 Colorado St. "Mark Bell"s, a
 * DE and a WR with no shared identity) are left alone. AFL/NFL dual-draft duplicates
 * (a player drafted by both leagues → two rows in different leagues, e.g. 1960s) are
 * a separate combined-mode concern and intentionally untouched here — the same-league
 * guard keeps this from merging only the subset whose AFL row happens to be blank.
 */
/**
 * Two different men of the same name, drafted the same year, cannot share one
 * career -- but the lookup gives them one when the career was joined by name.
 *
 * 1964 has both Bob Browns: the Hall of Fame tackle out of Nebraska (NFL, pick
 * 2) and the Arkansas-Pine Bluff defensive tackle (AFL, pick 4). Different
 * colleges, different positions, different leagues -- different people -- yet
 * both rows carry 1964-1973, 5 All-Pros, 6 Pro Bowls, wAV 83. That is the
 * tackle's career, and it was rating the DT as a 77 Superstar.
 *
 * Only the better draft slot keeps the career; the other is left career-unknown
 * and rated from his slot instead. Deliberately narrow: it fires only when the
 * COLLEGES disagree (so the rows are genuinely different men, not a dual-draft
 * of one man) and only when the career is non-blank. Across the whole file that
 * is this one case; nine groups have disagreeing colleges but the other eight
 * share an empty career, where there is nothing to take away.
 */
function splitSharedCareers(players: BaselinePlayer[]): void {
  const groups = new Map<string, BaselinePlayer[]>();
  for (const p of players) {
    const k = `${normalizeName(`${p.firstName} ${p.lastName}`)}|${p.draftYear}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(p);
  }
  for (const grp of groups.values()) {
    if (grp.length < 2) continue;
    if (new Set(grp.map((p) => normalizeName(p.college))).size < 2) continue;
    const career = (p: BaselinePlayer) =>
      `${p.careerFrom}|${p.careerTo}|${p.allPro1}|${p.proBowls}|${p.seasonsStarted}|${p.wav}`;
    if (new Set(grp.map(career)).size !== 1) continue;
    const real = grp[0];
    if ((real.wav ?? 0) <= 0 && !real.allPro1 && !real.proBowls) continue;
    // Keep it on the earliest overall pick; a Hall of Fame career belongs to the
    // more highly drafted of two same-named men far more often than not.
    const keep = [...grp].sort((a, b) => (a.draftPick ?? 9999) - (b.draftPick ?? 9999))[0];
    for (const p of grp) {
      if (p === keep) continue;
      p.wav = null;
      p.wavSource = 'predicted';
      p.allPro1 = null;
      p.proBowls = null;
      p.seasonsStarted = null;
      p.careerTo = null;
      p.isHOF = false;
    }
  }
}

function mergeDuplicatePeople(players: BaselinePlayer[]): BaselinePlayer[] {
  const groups = new Map<string, BaselinePlayer[]>();
  for (const p of players) {
    const k = `${normalizeName(`${p.firstName} ${p.lastName}`)}|${normalizeName(p.college)}|${p.draftYear}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(p);
  }
  const removed = new Set<BaselinePlayer>();
  for (const grp of groups.values()) {
    if (grp.length < 2) continue;
    // Primary = the row with a real (numeric) draft round, else the most notable.
    const primary = [...grp].sort((a, b) => {
      const ar = a.draftRound != null ? 0 : 1;
      const br = b.draftRound != null ? 0 : 1;
      return ar !== br ? ar - br : accompl(b) - accompl(a);
    })[0];
    for (const other of grp) {
      if (other === primary || removed.has(other)) continue;
      if (primary.league !== other.league) continue; // leave AFL/NFL dual-draft alone
      if (sharesIdentity(primary, other) || isBlankStub(other) || isBlankStub(primary)) {
        mergeInto(primary, other);
        removed.add(other);
      }
    }
  }
  return removed.size ? players.filter((p) => !removed.has(p)) : players;
}

/** How well a player's draft/career window aligns with an accolade span. Used to
 *  pick the right person when several share a name (e.g. three "Jim Brown"s). */
function alignScore(p: BaselinePlayer, acc: { firstYear: number; lastYear: number }): number {
  const gap = acc.firstYear - p.draftYear; // years from draft to first selection
  if (gap < 0) return -1; // drafted after the first selection → not this player
  let s = gap <= 6 ? 6 - gap : 0; // stars earn honors within a few years of draft
  if (p.careerTo != null) s += Math.abs(p.careerTo - acc.lastYear) <= 1 ? 5 : -2;
  if ((p.allPro1 ?? 0) > 0 || (p.proBowls ?? 0) > 0) s += 3; // existing corroboration
  return s;
}

/**
 * The CSV's career/accolade columns are badly incomplete before 1960 (PFR's AV
 * era). Backfill first-team All-Pro counts and career span from the Wikipedia
 * All-Pro dataset so the wAV estimate has real signals — e.g. Bucko Kilroy goes
 * from an empty career/accolade row to a 1943–1954 career with a first-team
 * selection. Never lowers an existing value. When several players share a name,
 * the accolades go only to the one whose career window aligns (and only if that
 * choice is unambiguous), so a star's honors never land on a same-named scrub.
 * See HistoricalAccoladeService.
 */
function applyHistoricalAccolades(players: BaselinePlayer[]): void {
  const byName = new Map<string, BaselinePlayer[]>();
  for (const p of players) {
    const k = normalizeName(`${p.firstName} ${p.lastName}`);
    if (k) (byName.get(k) ?? byName.set(k, []).get(k)!).push(p);
  }
  for (const [norm, group] of byName) {
    const acc = HistoricalAccoladeService.getByKey(norm);
    if (!acc) continue;
    // Candidates that could plausibly have earned the honors (drafted no later
    // than the last selection, and within ~2 decades of the first).
    const cands = group.filter((p) => p.draftYear <= acc.lastYear && p.draftYear >= acc.firstYear - 18);
    if (cands.length === 0) continue;
    let target: BaselinePlayer;
    if (cands.length === 1) {
      target = cands[0];
    } else {
      const scored = cands.map((p) => ({ p, s: alignScore(p, acc) })).sort((a, b) => b.s - a.s);
      if (scored[0].s <= 0 || (scored[1] && scored[0].s === scored[1].s)) continue; // ambiguous → skip
      target = scored[0].p;
    }
    if (target.draftYear > 1960) continue; // fix is scoped to the pre-1960 gap
    target.allPro1 = Math.max(target.allPro1 ?? 0, acc.firstTeamAllPro);
    const from = target.careerFrom ?? target.draftYear;
    target.careerFrom = Math.min(from, acc.firstYear);
    target.careerTo = Math.max(target.careerTo ?? 0, acc.lastYear, from);
  }
}

const recency = (p: BaselinePlayer) => p.careerTo ?? p.careerFrom ?? p.draftYear;
const careerLen = (p: BaselinePlayer) =>
  p.careerFrom != null && p.careerTo != null && p.careerTo >= p.careerFrom ? p.careerTo - p.careerFrom + 1 : 0;
const carriesLegend = (p: BaselinePlayer) => (p.plpo ?? '').toLowerCase().includes('legends');

/** Deterministic tie-break tail so ownership never falls through to arbitrary CSV
 *  row order: longest known career, then earliest draft year, then draft pick. */
function stableTail(a: BaselinePlayer, b: BaselinePlayer): number {
  return careerLen(b) - careerLen(a) || a.draftYear - b.draftYear || (a.draftPick ?? 9999) - (b.draftPick ?? 9999);
}

/** Rank same-named players for who owns a shared Madden asset. Legend assets go to
 *  the row that actually carries the legends PLPO, then the most accomplished (so a
 *  legend's PhotoID/CommID/PLPO stay co-located even when its own career line is
 *  empty — Bill Bates); non-legend (current-Madden) assets go to the most recent. */
function assetOwner(grp: BaselinePlayer[], legend: boolean): BaselinePlayer {
  // EA's asset ids tell the era: modern scans are CamelCase (MatthewsClay_15246,
  // MahomesIIPatrick_12635), the legacy legend batch starts lower-case
  // (jacksonBo_9877, polamaluTroy_16548). A CamelCase id shared by a 1949, a 1978
  // and a 2009 Clay Matthews belongs to the 2009 one — the one the modern era
  // scanned — whatever the older men's accolades.
  const modernAsset = grp.find((p) => p.playerAssetsId && /^[A-Z]/.test(p.playerAssetsId))?.playerAssetsId;
  if (modernAsset) {
    const recent = grp.filter((p) => p.draftYear >= 2000);
    if (recent.length) return [...recent].sort((a, b) => accompl(b) - accompl(a) || stableTail(a, b))[0];
  }
  return [...grp].sort((a, b) => {
    if (legend) {
      const d = (carriesLegend(b) ? 1 : 0) - (carriesLegend(a) ? 1 : 0);
      if (d) return d;
      if (accompl(b) !== accompl(a)) return accompl(b) - accompl(a);
    } else {
      if (recency(b) !== recency(a)) return recency(b) - recency(a);
      if (accompl(b) !== accompl(a)) return accompl(b) - accompl(a);
    }
    return stableTail(a, b);
  })[0];
}

/** Most-accomplished member of a same-name group (for isHOF / accolade ownership). */
function mostAccomplished(grp: BaselinePlayer[]): BaselinePlayer {
  return [...grp].sort((a, b) => accompl(b) - accompl(a) || stableTail(a, b))[0];
}

/**
 * The lookup's identity fields (PhotoID, Player Assets ID, CommID, PLPO, isHOF) AND
 * the accolade columns (AP1/PB/St) were populated by name-only matching, so same-
 * named players collide (2003 Sam Williams inherited 2022 Sam Williams's portrait;
 * all three "Jim Brown"s read isHOF=TRUE and shared the legend's PhotoID/CommID/PLPO;
 * the 2005 Washington "Derrick Johnson" carries the Texas star's Pro Bowls). Each
 * such value depicts ONE person, so keep it for the true owner and clear it on the
 * rest (they fall back to a generic face / no bonus). Ownership:
 *  - **Legend assets** (`plpo_legends_*`) → the row carrying the legends PLPO, then
 *    the most accomplished (NOT the most recent — Jim Brown's face was going to the
 *    obscure 1966 Nebraska lineman because his career "ended" later).
 *  - **Other (current-Madden) assets** → the most-recent career.
 *  - **isHOF** → promoted onto the most-accomplished same-named player (the CSV often
 *    puts the flag on the wrong row — the real HOFer Eric Allen had it on false).
 *  - **AP1/PB/St** → cleared on a same-name player only when it shares an asset id
 *    with the owner AND carries the owner's exact accolades (the name-stamp tell), so
 *    genuinely-earned honors on distinct same-named players are never stripped.
 * All ties use a deterministic tail, never CSV row order.
 */
function dedupSharedAssets(players: BaselinePlayer[]): void {
  // Per same-name group: promote isHOF to the true owner, and strip name-stamped
  // accolade copies. Runs BEFORE asset nulling so shared-asset detection still works.
  const byName = new Map<string, BaselinePlayer[]>();
  for (const p of players) {
    const k = normalizeName(`${p.firstName} ${p.lastName}`);
    (byName.get(k) ?? byName.set(k, []).get(k)!).push(p);
  }
  for (const grp of byName.values()) {
    if (grp.length < 2) continue;
    const owner = mostAccomplished(grp);
    if (grp.some((p) => p.isHOF)) {
      owner.isHOF = true; // promote (not just demote) — flag may sit on the wrong row
      for (const p of grp) if (p !== owner) p.isHOF = false;
    }
    for (const p of grp) {
      if (p === owner) continue;
      const sameAcc = (p.allPro1 ?? 0) === (owner.allPro1 ?? 0) && (p.proBowls ?? 0) === (owner.proBowls ?? 0);
      const hasAcc = (p.allPro1 ?? 0) > 0 || (p.proBowls ?? 0) > 0;
      if (hasAcc && sameAcc && sharesIdentity(p, owner)) {
        p.allPro1 = null;
        p.proBowls = null;
        p.seasonsStarted = null;
      }
    }
  }

  // Asset ids — group by value; assign to the true owner, clear on the rest.
  // (PLPO is deduped last so earlier passes still see it intact when detecting
  // whether a shared asset is a legend's.)
  const dedup = <K extends 'photoId' | 'playerAssetsId' | 'commId' | 'plpo'>(key: K, empty: BaselinePlayer[K]) => {
    const groups = new Map<string, BaselinePlayer[]>();
    for (const p of players) {
      const v = p[key];
      if (v == null || v === 0 || v === '') continue;
      const k = String(v);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(p);
    }
    for (const grp of groups.values()) {
      if (grp.length < 2) continue;
      const owner = assetOwner(grp, grp.some(carriesLegend));
      // The same man drafted twice (Bo Jackson: Bucs 1986 #1, Raiders 1987 round 7)
      // is one identity — same name, same college, within a few years — and keeps
      // his assets in both classes.
      const samePerson = (p: BaselinePlayer) =>
        normalizeName(`${p.firstName} ${p.lastName}`) === normalizeName(`${owner.firstName} ${owner.lastName}`) &&
        !!p.college && normalizeName(p.college) === normalizeName(owner.college) && Math.abs(p.draftYear - owner.draftYear) <= 3;
      for (const p of grp) if (p !== owner && !samePerson(p)) p[key] = empty as BaselinePlayer[K];
    }
  };
  dedup('photoId', null);
  dedup('playerAssetsId', null);
  dedup('commId', null);
  dedup('plpo', null);
}

/**
 * Combined-league view only: a player drafted by BOTH the NFL and AFL in the same
 * year has two rows (different leagues), so the 1960–66 combined class shows him
 * twice (e.g. Mike Lucci 1961 NFL-R5 + AFL-R20). Collapse to one prospect. Done
 * here, NOT in the source, so per-league (NFL-only / AFL-only) views keep their
 * own row. Only collapses when every row in a name+college group is in a DISTINCT
 * league (an unambiguous dual-draft) — same-league same-name teammates (the two
 * 1979 Colorado St. "Mark Bell"s) are never touched. Cross-YEAR re-drafts (a
 * player in two different years' classes, e.g. Bo Jackson 1986+1987) are a
 * different, ambiguous case — which year is canonical needs play history — and
 * are intentionally left as-is. Keeps the most-accomplished row, preferring the
 * surviving NFL row then the earlier pick.
 */
function dedupDualDraft(list: BaselinePlayer[]): BaselinePlayer[] {
  const groups = new Map<string, BaselinePlayer[]>();
  for (const p of list) {
    const k = `${normalizeName(`${p.firstName} ${p.lastName}`)}|${normalizeName(p.college)}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(p);
  }
  const drop = new Set<BaselinePlayer>();
  for (const grp of groups.values()) {
    if (grp.length < 2) continue;
    if (new Set(grp.map((p) => p.league)).size !== grp.length) continue; // ambiguous → keep all
    const keep = [...grp].sort(
      (a, b) =>
        accompl(b) - accompl(a) ||
        (a.league.toUpperCase() === 'NFL' ? 0 : 1) - (b.league.toUpperCase() === 'NFL' ? 0 : 1) ||
        (a.draftRound ?? 99) - (b.draftRound ?? 99) ||
        (a.draftPick ?? 999) - (b.draftPick ?? 999)
    )[0];
    for (const p of grp) if (p !== keep) drop.add(p);
  }
  return drop.size ? list.filter((p) => !drop.has(p)) : list;
}

export const PlayerLookupService = {
  /** Is this the most accomplished player of this name in the lookup? Shared
   *  assets keyed by name (legends portraits: plpo_legends_johnsonchris) belong to
   *  him, not to a 2003 seventh-round namesake. Same-year rows are usually the same
   *  person, but not always: 1964 drafted Bob Brown the Hall of Fame tackle
   *  (Nebraska, NFL) and Bob Brown the AFL defensive tackle (Arkansas-Pine Bluff),
   *  so when the caller knows the college it has to agree too. */
  isMostNotable(p: Pick<BaselinePlayer, 'firstName' | 'lastName' | 'draftYear'> & { college?: string | null }): boolean {
    load();
    const group = byNormName?.get(normName(p.firstName, p.lastName)) ?? [];
    // The famous namesake may have no row at all (the real Jim Thorpe predates
    // the draft): a row that carried his name-stamped HOF flag is never the owner.
    if (stampedNamesakes.has(`${normName(p.firstName, p.lastName)}|${p.draftYear}`)) return false;
    if (group.length <= 1) return true;
    const best = group.reduce((a, b) => (greatness(b) > greatness(a) ? b : a));
    if (best.draftYear !== p.draftYear) return false;
    if (!p.college || !best.college) return true;
    return normalizeName(best.college) === normalizeName(p.college);
  },

  /** All draft years present in the local lookup, ascending. */
  years(): number[] {
    load();
    return Array.from(byYear!.keys()).sort((a, b) => a - b);
  },

  /** Baseline players for a draft year, optionally filtered by league. */
  byYear(year: number, league?: string): BaselinePlayer[] {
    load();
    let list = byYear!.get(year) || [];
    if (league && league !== 'combined') {
      list = list.filter((p) => p.league.toUpperCase() === league.toUpperCase());
    } else {
      list = dedupDualDraft(list); // combined view: one prospect per dual-drafted person
    }
    // Sort by overall draft order: round then pick, undrafted (null) last.
    return [...list].sort((a, b) => {
      const ar = a.draftRound ?? 99;
      const br = b.draftRound ?? 99;
      if (ar !== br) return ar - br;
      return (a.draftPick ?? 999) - (b.draftPick ?? 999);
    });
  },

  totalRows(): number {
    load();
    return rowsCache!.length;
  },

  /** The best players in history for an "All-Time Greats" class: every drafted
   *  person, de-duped, scored by career greatness (wAV + weighted All-Pros / Pro
   *  Bowls + a HOF bonus), highest first, sliced to `limit`. An optional draft-year
   *  `range` scopes it to an era (e.g. a decade's greatest players). */
  allTimeGreats(limit = 402, range?: { from: number; to: number }): BaselinePlayer[] {
    load();
    let all = dedupDualDraft([...byYear!.values()].flat());
    if (range) all = all.filter((p) => p.draftYear >= range.from && p.draftYear <= range.to);
    const score = (p: BaselinePlayer) =>
      (p.wav ?? 0) + 4 * (p.allPro1 ?? 0) + 2 * (p.proBowls ?? 0) + (p.isHOF ? 40 : 0);
    return [...all].sort((a, b) => score(b) - score(a)).slice(0, limit);
  },

  /** Draft decades present in the lookup (e.g. 1930, 1940, … 2020). */
  decades(): number[] {
    load();
    return [...new Set([...byYear!.keys()].map((y) => Math.floor(y / 10) * 10))].sort((a, b) => a - b);
  },

  /**
   * Search all players by name (case/accent-insensitive) across every draft year.
   * Scored: exact > prefix > substring, then newest draft year first.
   */
  search(query: string, limit = 50): PlayerSearchResult[] {
    load();
    const q = normalizeName(query);
    if (!q) return [];
    const scored: { p: BaselinePlayer; score: number }[] = [];
    for (const list of byYear!.values()) {
      for (const p of list) {
        const k = normalizeName(`${p.firstName} ${p.lastName}`);
        const score = k === q ? 3 : k.startsWith(q) ? 2 : k.includes(q) ? 1 : 0;
        if (score) scored.push({ p, score });
      }
    }
    scored.sort((a, b) => b.score - a.score || b.p.draftYear - a.p.draftYear || a.p.lastName.localeCompare(b.p.lastName));
    return scored.slice(0, limit).map(({ p }) => ({
      firstName: p.firstName,
      lastName: p.lastName,
      draftYear: p.draftYear,
      draftRound: p.draftRound,
      draftPick: p.draftPick,
      position: p.position,
      college: p.college,
      league: p.league,
    }));
  },

  /** Players for a list of keys, in that order, deduped; unknown keys reported. */
  byKeys(keys: string[]): { players: BaselinePlayer[]; missing: string[] } {
    load();
    const seen = new Set<string>();
    const players: BaselinePlayer[] = [];
    const missing: string[] = [];
    for (const k of keys) {
      if (seen.has(k)) continue;
      seen.add(k);
      const p = byKey!.get(k);
      if (p) players.push(p);
      else missing.push(k);
    }
    return { players, missing };
  },

  /** Every merged player as a compact browse row (built once). */
  catalog(): CatalogPlayer[] {
    load();
    if (catalogCache) return catalogCache;
    catalogCache = [...byKey!.values()].map((p) => {
      const posId = PositionMapper.resolve(p.firstName, p.lastName, p.position, p.weight);
      return {
        key: p.key!, first: p.firstName, last: p.lastName, pos: p.position,
        mpos: PositionMapper.name(posId), grp: PositionMapper.groupFromId(posId),
        year: p.draftYear, league: p.league, round: p.draftRound, pick: p.draftPick, college: p.college,
        wav: p.wav, cal: RatingService.caliber(p, posId), hof: p.isHOF, pb: p.proBowls ?? 0, ap1: p.allPro1 ?? 0,
      };
    });
    return catalogCache;
  },

  /** Deduped first- and last-name pools (all eras) for generating filler names. */
  namePool(): { first: string[]; last: string[] } {
    load();
    const first = new Set<string>();
    const last = new Set<string>();
    for (const list of byYear!.values()) {
      for (const p of list) {
        if (p.firstName) first.add(p.firstName);
        if (p.lastName) last.add(p.lastName);
      }
    }
    return { first: [...first], last: [...last] };
  },
};
