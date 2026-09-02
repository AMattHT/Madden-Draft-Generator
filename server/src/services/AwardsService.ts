import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../config/paths';
import { normalizeName } from '../util/csv';

/**
 * AP season awards (MVP, Offensive/Defensive Player of the Year, Offensive/
 * Defensive Rookie of the Year), baked from Wikipedia's winners tables by
 * scripts/build-nfl-awards.ts. Awards are the one outcome signal a two-season
 * career can already carry, so young-class dev traits lean on them.
 */

export type AwardKind = 'MVP' | 'OPOY' | 'DPOY' | 'OROY' | 'DROY';

export interface AwardRow {
  season: number;
  first: string;
  last: string;
  /** Position as the table words it ("Quarterback", "Defensive end"). */
  pos: string;
}

export interface AwardRecord extends AwardRow {
  award: AwardKind;
}

export interface AwardsFile {
  _source: string;
  _built: string;
  awards: AwardRecord[];
}

/** Wikipedia position words -> the app's position groups. */
const POS_WORD_GROUP: Array<[RegExp, string]> = [
  [/quarterback/i, 'QB'],
  [/running back|halfback|fullback/i, 'RB'],
  [/wide receiver|flanker|split end|^end$/i, 'WR'],
  [/tight end/i, 'TE'],
  [/tackle|guard|center|offensive line/i, 'OL'],
  [/defensive end|edge|outside linebacker/i, 'EDGE'],
  [/defensive tackle|nose tackle|defensive lineman/i, 'IDL'],
  [/linebacker/i, 'LB'],
  [/cornerback/i, 'CB'],
  [/safety/i, 'S'],
  [/kicker|placekicker/i, 'K'],
  [/punter/i, 'P'],
];
/** Abbreviations some tables use instead of the words (the DPOY page: "DT", "LB"). */
const POS_ABBR_GROUP: Record<string, string> = {
  QB: 'QB', RB: 'RB', HB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE', OT: 'OL', T: 'OL', G: 'OL', OG: 'OL', C: 'OL', OL: 'OL',
  DE: 'EDGE', EDGE: 'EDGE', OLB: 'EDGE', DT: 'IDL', NT: 'IDL', DL: 'IDL', LB: 'LB', ILB: 'LB', MLB: 'LB',
  CB: 'CB', DB: 'CB', S: 'S', FS: 'S', SS: 'S', K: 'K', PK: 'K', P: 'P',
};
export function groupOfAwardPos(pos: string): string | null {
  const t = pos.trim();
  if (/^[A-Z]{1,4}$/.test(t)) return POS_ABBR_GROUP[t] ?? null;
  // "Defensive tackle" must not read as an offensive tackle: check the specific
  // defensive words before the generic OL pattern.
  if (/defensive tackle|nose tackle/i.test(t)) return 'IDL';
  if (/defensive end/i.test(t)) return 'EDGE';
  for (const [re, g] of POS_WORD_GROUP) if (re.test(t)) return g;
  return null;
}

/** Groups that share awards freely: a 3-4 OLB winning DPOY is an edge in Madden. */
function compatible(a: string | null, b: string | null): boolean {
  if (!a || !b || a === b) return true;
  const front = new Set(['EDGE', 'IDL', 'LB']);
  const back = new Set(['CB', 'S']);
  return (front.has(a) && front.has(b)) || (back.has(a) && back.has(b));
}

const text = (html: string) =>
  html
    .replace(/<sup[\s\S]*?<\/sup>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Every winners table on an award page (headed Season | Player | Position | Team).
 * The player sits in a row-header cell; a position that repeats across seasons is
 * written once with a rowspan, so it is carried forward when a row lacks one.
 */
export function parseAwardTables(html: string): AwardRow[][] {
  const out: AwardRow[][] = [];
  for (const table of html.match(/<table[^>]*wikitable[\s\S]*?<\/table>/g) ?? []) {
    const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
    if (!rows.length) continue;
    const header = [...rows[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => text(m[1]));
    if (!/^season$/i.test(header[0] ?? '') || !/^player$/i.test(header[1] ?? '')) continue;
    const list: AwardRow[] = [];
    let lastPos = '';
    for (const row of rows.slice(1)) {
      const cells = [...row.matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/g)].map((m) => ({ attrs: m[1], html: m[2], text: text(m[2]) }));
      if (!cells.length) continue;
      const season = Number(/(?:19|20)\d\d/.exec(cells[0].text)?.[0]);
      if (!season) continue;
      // The player is marked up as a row header or a vcard on most pages; the DPOY
      // page writes him as a plain linked cell right after the season.
      const playerCell = cells.find((c) => /data-sort-value=|class="fn"|scope="row"/.test(c.attrs + c.html))
        ?? (cells[1] && /<a /.test(cells[1].html) && groupOfAwardPos(cells[1].text) == null ? cells[1] : undefined);
      if (!playerCell) continue;
      const sort = /data-sort-value="([^"]+)"/.exec(playerCell.html)?.[1];
      let first = '', last = '';
      if (sort && sort.includes(',')) {
        const [l, f] = sort.split(',').map((s) => s.trim());
        first = f; last = l;
      } else {
        const parts = playerCell.text.split(' ');
        first = parts[0] ?? ''; last = parts.slice(1).join(' ');
      }
      // Position: the cell's text, or the linked page's title when the text is an
      // abbreviation ("DT" linking to /wiki/Defensive_tackle).
      const posOf = (c: { html: string; text: string }) => {
        if (groupOfAwardPos(c.text) != null) return /title="([^"]+)"/.exec(c.html)?.[1] ?? c.text;
        return null;
      };
      const posCell = cells.find((c) => c !== playerCell && c !== cells[0] && !/\d/.test(c.text) && posOf(c) != null);
      const pos = posCell ? posOf(posCell)! : lastPos;
      if (posCell) lastPos = pos;
      if (first && last) list.push({ season, first, last, pos });
    }
    if (list.length) out.push(list);
  }
  return out;
}

let file: AwardsFile | null | undefined;
let byName: Map<string, AwardRecord[]> | null = null;
function load(): Map<string, AwardRecord[]> {
  if (byName) return byName;
  byName = new Map();
  try {
    file = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'nfl-awards.json'), 'utf8')) as AwardsFile;
  } catch {
    file = null;
  }
  for (const a of file?.awards ?? []) {
    const k = `${normalizeName(a.first)}|${normalizeName(a.last)}`;
    (byName.get(k) ?? byName.set(k, []).get(k)!).push(a);
  }
  return byName;
}

export const AwardsService = {
  /** Awards this player won: same name, a compatible position group, and the
   *  season inside his career (from the draft year to the year after he last
   *  played, since awards are given the following February). */
  awardsFor(first: string, last: string, draftYear: number, posGroup: string | null, careerTo?: number | null): AwardKind[] {
    const hits = load().get(`${normalizeName(first)}|${normalizeName(last)}`);
    if (!hits?.length) return [];
    const to = careerTo != null ? careerTo + 1 : Infinity;
    return [...new Set(hits
      .filter((a) => a.season >= draftYear && a.season <= to && compatible(groupOfAwardPos(a.pos), posGroup))
      .map((a) => a.award))];
  },

  available(): boolean {
    return load().size > 0;
  },

  /** Test hook. */
  _reset(): void { byName = null; file = undefined; },
};
