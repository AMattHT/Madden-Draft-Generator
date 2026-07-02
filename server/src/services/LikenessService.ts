import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../config/paths';
import { BaselinePlayer } from '../types/player';

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
}

let byTone: Map<number, string[]> | null = null;

function load(): void {
  if (byTone) return;
  byTone = new Map();
  const file = path.join(LOOKUPS_DIR, 'generic-face-DRAFTCLASS-FINAL.json');
  const arr: FaceEntry[] = JSON.parse(fs.readFileSync(file, 'utf8'));
  // Prefer true generics; fall back to any validated draft-class face per tone.
  const trueGen = new Map<number, string[]>();
  for (const e of arr) {
    const code = e.genericCode;
    if (!code || !/^gen_\d/i.test(code)) continue;
    const tone = Number(e.skinTone) || toneFromCode(code);
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
  /** Assign a face for a player. `index` keeps generic picks reproducible. */
  assign(player: BaselinePlayer, index: number): Likeness {
    load();
    const tone = raceToSkinTone(player.race);
    const asset = (player.playerAssetsId || '').trim();
    if (asset && !/^gen_/i.test(asset)) {
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
