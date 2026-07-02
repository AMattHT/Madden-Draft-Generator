import path from 'path';
import { LOOKUPS_DIR } from '../config/paths';
import { parseCsvFile } from '../util/csv';
import { BaselinePlayer } from '../types/player';

/**
 * Assigns recyclable "generic" portrait slots (from PID_Portrait_Mapping.csv) to
 * historical players who have a real photo but NO in-game face/portrait, so a
 * Frosty texture mod can override those slots with the real headshots. Slot
 * assignment is deterministic + order-stable, so the .mdc (which points each
 * such prospect at the recycled PID) and the portrait mod folder always agree
 * without sharing state.
 */

interface Slot {
  pid: number;
  plpo: string;
  race: number;
}

let byRace: Map<number, Slot[]> | null = null;

function load(): void {
  if (byRace) return;
  byRace = new Map();
  const rows = parseCsvFile<Record<string, string>>(path.join(LOOKUPS_DIR, 'PID_Portrait_Mapping.csv'));
  for (const r of rows) {
    if ((r['Type'] || '').trim() !== 'generic') continue; // generic slots are safe to recycle
    const pid = parseInt(r['PID'], 10);
    const plpo = (r['Portrait'] || '').trim();
    if (Number.isNaN(pid) || !plpo) continue;
    const race = parseInt(r['Race'], 10) || 0;
    if (!byRace.has(race)) byRace.set(race, []);
    byRace.get(race)!.push({ pid, plpo, race });
  }
}

/** Best available real photo for a player (prefer the tighter PFR headshot). */
function photoUrl(p: BaselinePlayer): string | null {
  return p.pfrImageUrl || p.wikiImageUrl || null;
}

/** A player needs a custom portrait if they have a photo but no Madden 3D asset
 *  and no existing in-game portrait (PhotoID). */
function needsCustomPortrait(p: BaselinePlayer): boolean {
  const hasAsset = !!p.playerAssetsId;
  const hasPortrait = p.photoId != null && p.photoId !== 0;
  return !hasAsset && !hasPortrait && !!photoUrl(p);
}

export interface PortraitAssignment {
  index: number;
  name: string;
  pid: number;
  plpo: string;
  photoUrl: string;
  position: string;
}

export const PortraitSlotService = {
  needsCustomPortrait,

  /** Deterministically assign a unique race-matched generic slot to each
   *  custom-portrait candidate, in class order. */
  assignSlots(players: BaselinePlayer[]): PortraitAssignment[] {
    load();
    const used = new Set<number>();
    const cursor = new Map<number, number>();
    const raceOrder = [...byRace!.keys()];
    const out: PortraitAssignment[] = [];

    const nextSlot = (race: number | null): Slot | null => {
      const tries = [race ?? -1, ...raceOrder]; // matched race first, then any
      for (const rk of tries) {
        const pool = byRace!.get(rk as number);
        if (!pool) continue;
        let i = cursor.get(rk as number) ?? 0;
        while (i < pool.length && used.has(pool[i].pid)) i++;
        if (i < pool.length) {
          cursor.set(rk as number, i + 1);
          return pool[i];
        }
      }
      return null;
    };

    players.forEach((p, index) => {
      if (!needsCustomPortrait(p)) return;
      const slot = nextSlot(p.race);
      if (!slot) return;
      used.add(slot.pid);
      out.push({
        index,
        name: `${p.firstName} ${p.lastName}`.trim(),
        pid: slot.pid,
        plpo: slot.plpo,
        photoUrl: photoUrl(p)!,
        position: p.position,
      });
    });
    return out;
  },

  /** index -> recycled PID, for the .mdc builder to point prospects at. */
  pidMap(players: BaselinePlayer[]): Map<number, number> {
    const m = new Map<number, number>();
    for (const a of this.assignSlots(players)) m.set(a.index, a.pid);
    return m;
  },
};
