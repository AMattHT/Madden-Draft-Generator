import fs from 'fs';
import path from 'path';
import { DATA_ROOT } from '../config/paths';

/**
 * Real-player gear donor database (data/real-player-gear.json), extracted from a
 * Madden 26 franchise save by scripts/extract-real-gear.ts. Powers "copy real
 * player gear" in the Equipment Builder: search a real NFL player, get their
 * full on-field loadout keyed by our gear-slot keys (helmet, facemask, towel,
 * wristLeft, …) — the same keys gear edits and the .mdc export already use.
 *
 * Rebuild the database after a roster update by re-running the script.
 */

export interface RealGearPlayerSummary {
  id: number; // index into the players array
  name: string;
  team: string;
  position: string;
  jersey: number;
}

export interface RealGearPlayer extends RealGearPlayerSummary {
  gear: Record<string, string>; // slot -> M26 asset name
}

interface RealGearDb {
  _source: string;
  _extractedAt: string;
  players: { name: string; team: string; position: string; jersey: number; gear: Record<string, string> }[];
}

let db: RealGearDb | null = null;

function load(): RealGearDb | null {
  if (db) return db;
  const p = path.join(DATA_ROOT, 'real-player-gear.json');
  if (!fs.existsSync(p)) return null;
  try {
    db = JSON.parse(fs.readFileSync(p, 'utf8'));
    return db;
  } catch {
    return null;
  }
}

/** The database predates the merged thigh slot: fold thighLeft/thighRight into thighPads. */
function normalizeSlots(gear: Record<string, string>): Record<string, string> {
  const { thighLeft, thighRight, ...rest } = gear;
  const thigh = thighLeft ?? thighRight;
  return thigh && !rest.thighPads ? { ...rest, thighPads: thigh } : rest;
}

const summary = (p: RealGearDb['players'][number], id: number): RealGearPlayerSummary => ({
  id,
  name: p.name,
  team: p.team,
  position: p.position,
  jersey: p.jersey,
});

export const RealPlayerGearService = {
  get available(): boolean {
    return load() != null;
  },

  /** Provenance for the UI (source save + extraction date). */
  info(): { source: string; extractedAt: string; count: number } | null {
    const d = load();
    return d ? { source: d._source, extractedAt: d._extractedAt, count: d.players.length } : null;
  },

  /** Substring search on player name. All tokens must match (so "justin jeff"
   *  finds Jefferson). Falls back to the last token if the full query misses,
   *  so "cris carter" still surfaces current Carters instead of a blank bar. */
  search(q: string, limit = 25): RealGearPlayerSummary[] {
    const d = load();
    const query = q.trim().toLowerCase();
    if (!d || !query) return [];
    const tokens = query.split(/\s+/).filter(Boolean);
    const match = (name: string, toks: string[]) => toks.every((t) => name.includes(t));
    const out: RealGearPlayerSummary[] = [];
    for (let i = 0; i < d.players.length && out.length < limit; i++) {
      const p = d.players[i];
      if (match(p.name.toLowerCase(), tokens)) out.push(summary(p, i));
    }
    if (out.length === 0 && tokens.length > 1) {
      const last = [tokens[tokens.length - 1]];
      for (let i = 0; i < d.players.length && out.length < limit; i++) {
        const p = d.players[i];
        if (match(p.name.toLowerCase(), last)) out.push(summary(p, i));
      }
    }
    return out;
  },

  /** Full gear loadout for one donor player. */
  player(id: number): RealGearPlayer | null {
    const d = load();
    if (!d || id < 0 || id >= d.players.length) return null;
    const p = d.players[id];
    return { ...summary(p, id), gear: normalizeSlots(p.gear) };
  },
};
