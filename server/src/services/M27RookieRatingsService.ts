import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../config/paths';
import { RATING_KEYS } from './AttributeModel';

/**
 * EA's own Madden 27 launch ratings for the 2026 rookie class, plus each rookie's
 * development trait.
 *
 *  - data/lookups/m27-rookie-ratings.json: the 334 rookies (years pro 0) from
 *    EA's ratings site (www.ea.com/games/madden-nfl/ratings?rookie=true), Launch
 *    Ratings iteration: overall, every attribute, position as the game labels it
 *    (LEDG, MIKE, SS …), archetype, height/weight/age/jersey, and the menu-portrait
 *    id behind the avatar URL.
 *  - data/lookups/m27-rookie-dev-traits.tsv: the dev trait per rookie as the game
 *    ships them (madden-school.com's table; Star and Superstar rookies read
 *    "hidden" in franchise until 500 snaps, this is the real value).
 *
 * The 2026 class is rated from this data verbatim; every other year keeps the
 * app's own model.
 */

export interface EaRookie {
  first: string;
  last: string;
  /** Madden 27 position label (LEDG, REDG, MIKE, WILL, SS, FS, HB …). */
  pos: string;
  team: string;
  college: string;
  ovr: number;
  age: number | null;
  heightInches: number | null;
  weight: number | null;
  jersey: number | null;
  /** EA archetype id, e.g. S_RunSupport, QB_Improviser. */
  archetype: string | null;
  portraitPid: number | null;
  /** RATING_KEYS the site carries (everything but longSnap). */
  attrs: Record<string, number>;
  /** 0 Normal, 1 Star, 2 Superstar, 3 X-Factor; null when the dev list lacks him. */
  devTrait: number | null;
}

interface RawRookie {
  id: number; first: string; last: string; pos: string; team: string; college: string; ovr: number;
  age: number | null; height: number | null; weight: number | null; jersey: number | null;
  archetype: string | null; portraitPid: number | null; stats: Record<string, number>;
}

/** EA stat key -> RATING_KEYS name where they differ. */
const STAT_ALIASES: Record<string, string> = { bCVision: 'ballCarrierVision', press: 'pressCoverage' };
const DEV: Record<string, number> = { normal: 0, star: 1, superstar: 2, 'x-factor': 3, xfactor: 3 };

/** Letters only, lowercase, generational suffixes dropped: "Rueben Bain Jr." and
 *  "rueben bain" meet. */
export function rookieKey(first: string, last: string): string {
  const full = `${first} ${last}`.toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '');
  return full.replace(/[^a-z]/g, '');
}

let byKey: Map<string, EaRookie[]> | null = null;

function load(): Map<string, EaRookie[]> {
  if (byKey) return byKey;
  byKey = new Map();
  let raw: RawRookie[] = [];
  try {
    raw = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'm27-rookie-ratings.json'), 'utf8')).rookies ?? [];
  } catch { return byKey; }
  const dev = new Map<string, number>();
  try {
    for (const line of fs.readFileSync(path.join(LOOKUPS_DIR, 'm27-rookie-dev-traits.tsv'), 'utf8').split(/\r?\n/)) {
      if (!line || line.startsWith('#')) continue;
      const [name, , , , trait] = line.split('\t');
      const parts = name.trim().split(/\s+/);
      const t = DEV[(trait ?? '').trim().toLowerCase()];
      if (parts.length >= 2 && t != null) dev.set(rookieKey(parts[0], parts.slice(1).join(' ')), t);
    }
  } catch { /* dev list optional */ }
  for (const r of raw) {
    const attrs: Record<string, number> = {};
    for (const [k, v] of Object.entries(r.stats ?? {})) {
      const key = STAT_ALIASES[k] ?? k;
      if (RATING_KEYS.includes(key) && Number.isFinite(v)) attrs[key] = Math.max(0, Math.min(99, Math.round(v)));
    }
    const key = rookieKey(r.first, r.last);
    const rookie: EaRookie = {
      first: r.first, last: r.last, pos: r.pos, team: r.team, college: r.college ?? '', ovr: r.ovr,
      age: r.age ?? null, heightInches: r.height ?? null, weight: r.weight ?? null, jersey: r.jersey ?? null,
      archetype: r.archetype ?? null, portraitPid: r.portraitPid ?? null, attrs,
      devTrait: dev.get(key) ?? null,
    };
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(rookie);
  }
  return byKey;
}

export const M27RookieRatingsService = {
  get available(): boolean {
    return load().size > 0;
  },

  /** EA's launch entry for a 2026 rookie; `posGroup` (QB, RB, WR, TE, OL, EDGE,
   *  IDL, LB, CB, S, K, P, LS) breaks a same-name tie. */
  get(first: string, last: string, posGroup?: string): EaRookie | null {
    const hits = load().get(rookieKey(first, last));
    if (!hits || !hits.length) return null;
    if (hits.length === 1 || !posGroup) return hits[0];
    return hits.find((h) => groupOf(h.pos) === posGroup) ?? hits[0];
  },

  count(): number {
    let n = 0;
    for (const v of load().values()) n += v.length;
    return n;
  },
};

/** Madden position label -> the app's position group. */
export function groupOf(pos: string): string {
  const p = pos.toUpperCase();
  if (p === 'QB') return 'QB';
  if (p === 'HB' || p === 'FB' || p === 'RB') return 'RB';
  if (p === 'WR') return 'WR';
  if (p === 'TE') return 'TE';
  if (['LT', 'LG', 'C', 'RG', 'RT'].includes(p)) return 'OL';
  if (['LEDG', 'REDG', 'LE', 'RE', 'LOLB', 'ROLB'].includes(p)) return 'EDGE';
  if (p === 'DT' || p === 'NT') return 'IDL';
  if (['MIKE', 'SAM', 'WILL', 'MLB', 'LB'].includes(p)) return 'LB';
  if (p === 'CB') return 'CB';
  if (p === 'FS' || p === 'SS' || p === 'S') return 'S';
  return p;
}
