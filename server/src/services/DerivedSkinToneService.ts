import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../config/paths';

/**
 * Real per-player skin tone (1-7) DERIVED from each player's actual Madden menu
 * portrait — built offline by scripts/build-skintone.ts (samples the face pixels,
 * classifies by ITA). This is the trustworthy ethnicity source: the raw Race column
 * in the roster export is a near-universal hard-coded 7, so we prefer the tone read
 * off the real face whenever the player has a portrait (PID). Players with no
 * portrait fall back to the position-weighted default ([[SkinToneService]]).
 */

let map: Record<string, number> | null = null;
function load(): Record<string, number> {
  if (map) return map;
  try {
    map = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'pid_skintone.json'), 'utf8'));
  } catch {
    map = {};
  }
  return map!;
}

let itaMap: Record<string, [number, number]> | null = null;
function loadIta(): Record<string, [number, number]> {
  if (itaMap) return itaMap;
  try { itaMap = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'pid_ita.json'), 'utf8')); } catch { itaMap = {}; }
  return itaMap!;
}

export const DerivedSkinToneService = {
  /** Median skin ITA read off the player's portrait + whether it is a legends
   *  portrait (vintage photo, unreliable exposure), or null if none. */
  itaForPid(pid: number | null | undefined): { ita: number; legend: boolean } | null {
    if (pid == null || pid <= 0) return null;
    const v = loadIta()[String(pid)];
    return Array.isArray(v) ? { ita: v[0], legend: v[1] === 1 } : null;
  },
  /** Skin tone (1-7) read off the player's real portrait, or null if none. */
  toneForPid(pid: number | null | undefined): number | null {
    if (pid == null || pid <= 0) return null;
    const t = load()[String(pid)];
    return typeof t === 'number' ? t : null;
  },
  get size(): number {
    return Object.keys(load()).length;
  },
};
