import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR, CACHE_DIR } from '../config/paths';
import { BaselinePlayer } from '../types/player';
import { parseCsvFile } from '../util/csv';

/**
 * Player likeness assignment. Each generated prospect gets, in priority order:
 *   1. their real Madden face asset (PEPS, e.g. "jacksonBo_9877") when the
 *      lookup has one  -> the player's actual in-game 3D head + portrait;
 *   2. otherwise a race-appropriate generic draft-class face (gen_<tone>_...),
 *      so at least skin tone matches.
 * Generic faces come from generic-face-DRAFTCLASS-FINAL.json (the set Madden
 * itself uses for draft-class prospects). See draft-class-generator-project.
 */

interface FaceEntry {
  genericCode: string;
  skinTone: number;
  isTrueGeneric: boolean;
  assetName: string;
  pid?: number;
}

let byTone: Map<number, string[]> | null = null;
let pidByCode: Map<string, number> | null = null;

/** M27 real-face map: normalized "first last" -> M27 asset name + portrait PID
 *  (from data/lookups/m27-face-assets.json, extracted from an M27 career save).
 *  Covers current-era NFL players only. */
interface M27Face { assetName: string; portraitPid: number; genericHead: string | null }
let m27Faces: Map<string, M27Face> | null = null;
let m26Scans: Array<{ id: string; name: string; asset: string; portraitPid?: number; image?: string }> | null = null;
function loadM27Faces(): Map<string, M27Face> {
  if (m27Faces) return m27Faces;
  m27Faces = new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'm27-face-assets.json'), 'utf8'));
    for (const [k, v] of Object.entries(raw.players ?? {})) m27Faces.set(k, v as M27Face);
  } catch { /* map absent — M27 face override simply no-ops */ }
  return m27Faces;
}
const m27Key = (first: string, last: string) => `${first} ${last}`.toLowerCase().replace(/[^a-z ]/g, '');

/** nflverse draft year by the same name key as the M27 face map. */
let draftYearByKey: Map<string, number> | null = null;
function loadDraftYears(): Map<string, number> {
  if (draftYearByKey) return draftYearByKey;
  draftYearByKey = new Map();
  try {
    const rows = parseCsvFile<Record<string, string>>(path.join(CACHE_DIR, 'nflverse_players.csv'));
    for (const r of rows) {
      const year = parseInt(r.draft_year || '', 10);
      if (!year) continue;
      const display = (r.display_name || '').trim();
      if (display) {
        const k = display.toLowerCase().replace(/[^a-z ]/g, '');
        // M27 scans belong to CURRENT players, so among same-name rows the face's
        // owner is the most recently drafted one (not the first row in the file).
        if (k && (!draftYearByKey.has(k) || year > (draftYearByKey.get(k) ?? 0))) draftYearByKey.set(k, year);
      }
      const first = (r.first_name || r.common_first_name || '').trim();
      const last = (r.last_name || '').trim();
      if (first && last) {
        const k = m27Key(first, last);
        if (k && (!draftYearByKey.has(k) || year > (draftYearByKey.get(k) ?? 0))) draftYearByKey.set(k, year);
      }
    }
  } catch { /* nflverse cache absent — year guard degrades to the 2015 cutoff */ }
  return draftYearByKey;
}

function load(): void {
  if (byTone) return;
  byTone = new Map();
  pidByCode = new Map();
  const file = path.join(LOOKUPS_DIR, 'generic-face-DRAFTCLASS-FINAL.json');
  const arr: FaceEntry[] = JSON.parse(fs.readFileSync(file, 'utf8'));
  // Prefer true generics; fall back to any validated draft-class face per tone.
  const trueGen = new Map<number, string[]>();
  for (const e of arr) {
    const code = e.genericCode;
    if (!code || !/^gen_\d/i.test(code)) continue;
    if (typeof e.pid === 'number') pidByCode.set(code, e.pid);
    // Bucket by the gen_N prefix, NOT the JSON skinTone field — M26Writer derives the
    // exported skin tone from that prefix, and 48 entries disagree with their field, so
    // a field-bucketed pick would write a tone that mismatches the player's race.
    const tone = toneFromCode(code);
    if (!byTone.has(tone)) byTone.set(tone, []);
    byTone.get(tone)!.push(code);
    if (e.isTrueGeneric) {
      if (!trueGen.has(tone)) trueGen.set(tone, []);
      trueGen.get(tone)!.push(code);
    }
  }
  // Where a tone has true generics, prefer them (avoids reusing a named scan).
  for (const [tone, codes] of trueGen) {
    if (codes.length >= 3) byTone.set(tone, codes);
  }
}

function toneFromCode(code: string): number {
  const m = code.match(/^gen_(\d+)/i);
  return m ? parseInt(m[1], 10) : 4;
}

/** Deterministic 32-bit hash for reproducible per-player face selection. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function raceToSkinTone(race: number | null): number {
  if (race != null && race >= 1 && race <= 8) return race;
  return 4; // unknown -> mid tone
}

export type LikenessKind = 'asset' | 'generic';

export interface Likeness {
  peps: string; // real asset name OR a gen_ generic code
  kind: LikenessKind;
  skinTone: number;
}

export const LikenessService = {
  /** Generic draft-class face codes grouped by skin tone (1-8), for the face picker. */
  genericHeadsByTone(): Record<number, string[]> {
    load();
    const out: Record<number, string[]> = {};
    for (const [tone, codes] of byTone!) out[tone] = [...codes].sort();
    return out;
  },

  /** Portrait PID for a gen_* generic face code (for head previews), else null. */
  genericPid(code: string): number | null {
    load();
    return pidByCode!.get(code) ?? null;
  },

  /** M27-native real face only when this is the same person — name match AND
   *  draft year within 1 of the face owner's nflverse year. A 1987 Cornelius
   *  Bennett must not receive a current Bennett's scan or a recycled portrait PID. */
  m27FaceFor(firstName: string, lastName: string, draftYear?: number): M27Face | null {
    const face = loadM27Faces().get(m27Key(firstName, lastName)) ?? null;
    if (!face) return null;
    const ownerYear = loadDraftYears().get(m27Key(firstName, lastName));
    if (draftYear != null && ownerYear != null) {
      return Math.abs(draftYear - ownerYear) <= 1 ? face : null;
    }
    // No owner year on file: keep the old modern-era guard (blocks historical collisions).
    if (draftYear != null && draftYear < 2015) return null;
    return face;
  },

  /** Real 3D face-scan catalog for the target game (M26 lookup assets vs M27 save extract). */
  faceScans(gameVersion: 'm26' | 'm27'): Array<{ id: string; name: string; asset: string; portraitPid?: number; image?: string }> {
    const title = (s: string) => s.replace(/\w/g, (c) => c.toUpperCase());
    if (gameVersion === 'm27') {
      return [...loadM27Faces().entries()]
        .map(([name, v]) => ({
          id: v.assetName,
          name: title(name),
          asset: v.assetName,
          portraitPid: v.portraitPid || undefined,
          image: v.portraitPid ? `/api/portrait/pid/${v.portraitPid}` : undefined,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    if (!m26Scans) {
      m26Scans = [];
      try {
        const rows = parseCsvFile<Record<string, string>>(path.join(LOOKUPS_DIR, 'ALL_PLAYER_LOOKUP.csv'));
        const seen = new Set<string>();
        for (const r of rows) {
          const asset = (r['Player Assets ID'] || '').trim();
          if (!asset || /^gen_/i.test(asset) || seen.has(asset)) continue;
          seen.add(asset);
          const first = (r['First Name'] || '').trim();
          const last = (r['Last Name'] || '').trim();
          const pid = parseInt(r.PhotoID || '', 10);
          m26Scans.push({
            id: asset,
            name: `${first} ${last}`.trim() || asset,
            asset,
            portraitPid: Number.isFinite(pid) && pid > 0 ? pid : undefined,
            image: Number.isFinite(pid) && pid > 0 ? `/api/portrait/pid/${pid}` : undefined,
          });
        }
        m26Scans.sort((a, b) => a.name.localeCompare(b.name));
      } catch { /* lookup missing */ }
    }
    return m26Scans;
  },

  /** Assign a face for a player. `index` keeps generic picks reproducible.
   *  M27 only accepts assets that exist in that game (m27-face-assets / m27FaceFor).
   *  M26 legend ids like TestaverdeVinny_19980 resolve to an empty silhouette in M27. */
  assign(player: BaselinePlayer, index: number, gameVersion: 'm26' | 'm27' = 'm26'): Likeness {
    load();
    const tone = raceToSkinTone(player.race);
    const asset = (player.playerAssetsId || '').trim();
    if (gameVersion !== 'm27' && asset && !/^gen_/i.test(asset)) {
      return { peps: asset, kind: 'asset', skinTone: tone };
    }
    let pool = byTone!.get(tone);
    if (!pool || pool.length === 0) {
      // Nearest available tone, then any.
      for (let d = 1; d <= 7 && (!pool || pool.length === 0); d++) {
        pool = byTone!.get(tone - d) || byTone!.get(tone + d);
      }
      pool = pool && pool.length ? pool : [...byTone!.values()][0];
    }
    const key = `${player.firstName}|${player.lastName}|${index}`;
    return { peps: pool[hash(key) % pool.length], kind: 'generic', skinTone: tone };
  },
};
