import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../config/paths';
import { normalizeName } from '../util/csv';
import type { TeamInfo } from './TeamService';
import { resolveWikiTeam } from './WikipediaTeamService';

/**
 * NFL supplemental-draft selections (data/lookups/supplemental-picks.json, baked
 * from Wikipedia by scripts/bake-supplemental-picks.ts).
 *
 * The lookup cannot tell a supplemental pick from a regular one or from an
 * undrafted player: Steve Young 1984 was stored as round 1 / pick 1 next to Irving
 * Fryar's real pick 1, and Cris Carter 1987 as undrafted. A supplemental pick has a
 * round (the club forfeits that round's pick the next year) but no overall pick
 * number, so PlayerLookupService sets `draftRound` from this table and clears
 * `draftPick`; the class then places him after his round's regular picks and no
 * pick-keyed join (team, measurements, career) can hand him another man's data.
 */
export interface SupplementalPick {
  year: number;
  draft: 'regular' | 'usfl-cfl';
  round: number;
  pick: number | null; // in-round ordinal when known
  overall?: number;
  first: string;
  last: string;
  position: string;
  college: string;
  team: string; // full club name of the era
  reason?: string;
}

const FILE = path.join(LOOKUPS_DIR, 'supplemental-picks.json');

let picks: SupplementalPick[] | null = null;
let byKey: Map<string, SupplementalPick[]> | null = null;

function load(): SupplementalPick[] {
  if (picks) return picks;
  try {
    picks = (JSON.parse(fs.readFileSync(FILE, 'utf8')) as { picks: SupplementalPick[] }).picks ?? [];
  } catch {
    picks = [];
  }
  byKey = new Map();
  for (const p of picks) {
    const k = `${p.year}|${normalizeName(`${p.first} ${p.last}`)}`;
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(p);
  }
  return picks;
}

export const SupplementalDraftService = {
  all(): SupplementalPick[] {
    return load();
  },

  /** The supplemental pick this lookup row is, or null. Year + name decide; when
   *  two picks of one name share a year (never so far) the college has to agree. */
  find(first: string, last: string, year: number, college?: string | null): SupplementalPick | null {
    load();
    const list = byKey!.get(`${year}|${normalizeName(`${first} ${last}`)}`);
    if (!list || !list.length) return null;
    if (list.length === 1) return list[0];
    const c = normalizeName(college ?? '');
    return list.find((p) => normalizeName(p.college) === c) ?? null;
  },

  /** The drafting club as the UI's team badge (era name, logo). */
  teamInfo(team: string | null | undefined, year: number): TeamInfo | null {
    return team ? resolveWikiTeam(team, year) : null;
  },
};
