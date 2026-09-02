import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../config/paths';
import { normalizeName } from '../util/csv';
import { RATING_KEYS } from './AttributeModel';
import { PositionMapper } from './PositionMapper';

/**
 * EA's launch-day rookie ratings, per draft class, baked from each Madden
 * edition's launch roster (scripts/build-launch-ratings.ts): the Madden 24
 * launch file holds the 2023 class as EA shipped it on release day. A rookie is
 * a launch-roster row with 0 years pro.
 */

export interface LaunchRookie {
  first: string;
  last: string;
  /** Position label as the edition wrote it (LE, ROLB, HB, …). */
  pos: string;
  /** College as the edition wrote it ('' when the file has no column). */
  college: string;
  ovr: number;
  /** RATING_KEYS the edition carries; older editions lack some. */
  attrs: Record<string, number>;
  /** Years pro as the file says; null when the edition has no such column (the
   *  bake then keeps the rows whose names sit in that year's draft class). */
  yearsPro: number | null;
  /** Team as the file writes it ('Ravens', 'San Francisco 49ers'; '' when absent). */
  team: string;
}

export interface LaunchEntry {
  pos: string;
  college: string;
  ovr: number;
  attrs: Record<string, number>;
}

export interface LaunchFile {
  _source: string;
  _built: string;
  editions: Record<string, { madden: number; rookies: number; source?: 'full' | 'teams' }>;
  players: Record<string, LaunchEntry[]>;
}

/** Header cell -> comparable stem: lowercase letters only, the 2006-era `PLYR_`
 *  prefix and a trailing "rating" dropped. */
const stem = (h: string) => h.toLowerCase().replace(/[^a-z]/g, '').replace(/^plyr/, '').replace(/rating$/, '');

/** Header stems the editions use for each RATING_KEYS attribute (besides the key itself). */
const HEADER_ALIASES: Record<string, string> = {
  stength: 'strength', // the 2013 file's typo
  bcvision: 'ballCarrierVision',
  bcv: 'ballCarrierVision',
  press: 'pressCoverage',
  hitpower: 'hitPower',
  longsnap: 'longSnap',
  tackling: 'tackle',
  runblocking: 'runBlock',
  passblocking: 'passBlock',
  throwaccuracy: 'throwAccuracyShort', // pre-2012 single accuracy; fanned out to mid/deep below
  kickreturns: 'kickReturn',
};
const ATTR_BY_STEM: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const k of RATING_KEYS) m[k.toLowerCase()] = k;
  for (const [alias, k] of Object.entries(HEADER_ALIASES)) m[alias] = k;
  return m;
})();

/** Launch-roster rows -> players with attributes mapped onto RATING_KEYS. Tolerates
 *  every header style seen 2001–2026: `Full Name` / `Name` / `First Name`+`Last Name`
 *  / `First_Name` / `First`+`Last`; `Overall Rating` / `Overall` / `OverallRating` /
 *  `OVR`; `Speed` / `SpeedRating`; `Years Pro` / `YearsPro` (optional -- when the
 *  edition has no such column every row comes back with `yearsPro: null`, and the
 *  bake keeps the ones whose names sit in that year's draft class). With a years-pro
 *  column, only rookies (0) are returned. */
export function parseLaunchRows(headers: string[], rows: string[][]): LaunchRookie[] {
  const stems = headers.map(stem);
  const col = (...names: string[]) => { for (const n of names) { const i = stems.indexOf(n); if (i >= 0) return i; } return -1; };
  const iName = col('fullname', 'name', 'playername', 'player');
  const iFirst = col('firstname', 'first');
  const iLast = col('lastname', 'last');
  const iOvr = col('overall', 'overallrating', 'ovr', 'ovr');
  const iPos = col('position', 'pos');
  const iCollege = col('college', 'school');
  const iTeam = col('team', 'teamname');
  const iYears = col('yearspro', 'experience', 'exp', 'yrspro', 'yrs');
  if ((iName < 0 && (iFirst < 0 || iLast < 0)) || iOvr < 0) return [];
  const attrCols: Array<[number, string]> = [];
  stems.forEach((s, i) => { const k = ATTR_BY_STEM[s]; if (k && i !== iOvr) attrCols.push([i, k]); });
  const out: LaunchRookie[] = [];
  for (const r of rows) {
    const yearsRaw = iYears >= 0 ? String(r[iYears] ?? '').trim() : '';
    const yearsPro = iYears >= 0 && yearsRaw !== '' && Number.isFinite(Number(yearsRaw)) ? Number(yearsRaw) : null;
    if (iYears >= 0 && yearsPro !== 0) continue;
    let first = '', last = '';
    if (iName >= 0) {
      const parts = String(r[iName] ?? '').trim().split(/\s+/);
      first = parts[0] ?? '';
      last = parts.slice(1).join(' ');
    } else {
      first = String(r[iFirst] ?? '').trim();
      last = String(r[iLast] ?? '').trim();
    }
    const ovr = Number(r[iOvr]);
    if (!first || !last || !Number.isFinite(ovr) || ovr <= 0) continue;
    const attrs: Record<string, number> = {};
    for (const [i, k] of attrCols) {
      const v = Number(r[i]);
      if (Number.isFinite(v) && v > 0) attrs[k] = Math.max(0, Math.min(99, Math.round(v)));
    }
    // A single pre-2012 "Throw Accuracy" stands for all three modern accuracies.
    if (attrs.throwAccuracyShort != null && attrs.throwAccuracyMid == null && attrs.throwAccuracyDeep == null) {
      attrs.throwAccuracyMid = attrs.throwAccuracyShort;
      attrs.throwAccuracyDeep = attrs.throwAccuracyShort;
    }
    out.push({
      first, last, pos: String(r[iPos] ?? '').trim(),
      college: iCollege >= 0 ? String(r[iCollege] ?? '').trim() : '',
      team: iTeam >= 0 ? String(r[iTeam] ?? '').trim() : '',
      ovr: Math.round(ovr), attrs, yearsPro,
    });
  }
  return out;
}

/** A whole sheet: the header is the first row that names an overall column and a
 *  player name (some team files open with a title row). */
export function parseLaunchSheet(table: string[][]): LaunchRookie[] {
  const isHeader = (row: string[]) => {
    const s = row.map(stem);
    return s.some((x) => ['overall', 'overallrating', 'ovr'].includes(x)) && s.some((x) => ['name', 'fullname', 'playername', 'player', 'firstname', 'first', 'lastname', 'last'].includes(x));
  };
  const h = table.findIndex(isHeader);
  if (h < 0) return [];
  return parseLaunchRows(table[h], table.slice(h + 1));
}

export const launchKey = (draftYear: number, first: string, last: string) =>
  `${draftYear}|${normalizeName(first)}|${normalizeName(last)}`;

let file: LaunchFile | null | undefined;
function load(): LaunchFile | null {
  if (file !== undefined) return file;
  try {
    file = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'rookie-launch-ratings.json'), 'utf8')) as LaunchFile;
  } catch {
    file = null;
  }
  return file;
}

export const LaunchRatingsService = {
  /** The launch entry for this rookie, or null. A name two rookies of one year share
   *  (the 2023 Byron Youngs: a Rams edge from Tennessee and a Titans lineman from
   *  Alabama) is settled by college first -- position cannot do it, since both
   *  live in the front seven -- then by position group. */
  get(first: string, last: string, draftYear: number, posId: number, college?: string | null): LaunchEntry | null {
    const hits = load()?.players[launchKey(draftYear, first, last)];
    if (!hits?.length) return null;
    if (hits.length === 1) return hits[0];
    const c = normalizeName(college ?? '');
    if (c) {
      const byCollege = hits.filter((h) => normalizeName(h.college) === c);
      if (byCollege.length === 1) return byCollege[0];
    }
    const want = PositionMapper.groupFromId(posId);
    const groupOf = (h: LaunchEntry) => PositionMapper.groupFromId(PositionMapper.toM26Id(h.pos));
    const byGroup = hits.filter((h) => groupOf(h) === want);
    return byGroup.length === 1 ? byGroup[0] : null;
  },

  hasYear(draftYear: number): boolean {
    return !!load()?.editions[String(draftYear)];
  },

  years(): number[] {
    return Object.keys(load()?.editions ?? {}).map(Number).sort((a, b) => a - b);
  },

  /** Which Madden edition a class's launch data came from (24 for 2023), or null. */
  edition(draftYear: number): number | null {
    return load()?.editions[String(draftYear)]?.madden ?? null;
  },

  /** Test hook: forget the loaded file. */
  _reset(): void { file = undefined; },
};
