import fs from 'fs';
import path from 'path';
import { normalizeName } from '../util/csv';
import { LOOKUPS_DIR } from '../config/paths';

/**
 * Hand-curated Strong/Free-safety (and corner) designations for notable defensive
 * backs whose careers ended before 2001 — nflverse depth charts (the automatic
 * SS/FS source in DbPositionService) only start in 2001, and the draft sources
 * label these players generically as "CB". This fills that gap and, being
 * hand-verified, takes priority over the automatic sources.
 *
 * Keyed by `${normalizedName}|${draftYear}` because names collide across eras
 * (e.g. Paul Krause the 1964 safety vs. 1967 QB / 1973 tackle; Jake Scott the
 * 1970 safety vs. 2004 guard). Extend freely — an unmatched entry is a no-op.
 */
type DbPos = 'CB' | 'FS' | 'SS';

// Keys are normalizeName(fullName) (lowercase, no spaces/punctuation) + "|" + draftYear.
const OVERRIDES: Record<string, DbPos> = {
  // Free safeties
  'paulkrause|1964': 'FS',
  'larrywilson|1960': 'FS',
  'jakescott|1970': 'FS',
  'nolancromwell|1977': 'FS',
  'garyfencik|1976': 'FS',
  'mertonhanks|1991': 'FS',
  'rickvolk|1967': 'FS',
  // Strong safeties
  'kennyeasley|1981': 'SS',
  'steveatwater|1989': 'SS',
  'kenhouston|1967': 'SS',
  'jacktatum|1971': 'SS',
  'ronnielott|1981': 'SS', // spent time at CB/FS/SS; classified SS here
  'timmcdonald|1987': 'SS',
  'daveduerson|1983': 'SS',
  'dennissmith|1981': 'SS',
  'carnelllake|1989': 'SS',
  'leroybutler|1990': 'SS',
  // Corners. Pre-2001 DBs with no curated entry are split by weight (a corner
  // over ~195 lb becomes a safety), which turns these big corners into safeties;
  // some also finished their careers at safety, so the roster label says S.
  'melblount|1970': 'CB',
  'louiswright|1975': 'CB',
  'lesterhayes|1977': 'CB',
  'albertlewis|1983': 'CB',
  'barrywilburn|1985': 'CB',
  'rodwoodson|1987': 'CB', // moved to safety at 32; a corner for the Hall
  'deionsanders|1989': 'CB',
  'aeneaswilliams|1991': 'CB',
  'troyvincent|1992': 'CB',
  'tylaw|1995': 'CB',
  'charleswoodson|1998': 'CB', // safety only for his last Packers years
  'chrismcalister|1999': 'CB',
};

/**
 * Data-file overrides (data/lookups/curated-db-positions.json, shape
 * { "positions": { "melblount|1970": "CB" } }), kept by the player editor tool.
 * They win over the table above so a data fix needs no code change.
 */
const FILE = path.join(LOOKUPS_DIR, 'curated-db-positions.json');
let fromFile: Record<string, DbPos> | null = null;
function fileOverrides(): Record<string, DbPos> {
  if (fromFile) return fromFile;
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8')) as { positions?: Record<string, string> };
    fromFile = {};
    for (const [k, v] of Object.entries(raw.positions ?? {})) if (v === 'CB' || v === 'FS' || v === 'SS') fromFile[k] = v;
  } catch {
    fromFile = {};
  }
  return fromFile;
}

export const CuratedDbPositions = {
  /** Curated SS/FS/CB for a player, or undefined. Matched by name + draft year. */
  get(first: string, last: string, draftYear: number): DbPos | undefined {
    const key = `${normalizeName(`${first} ${last}`)}|${draftYear}`;
    return fileOverrides()[key] ?? OVERRIDES[key];
  },
  /** Forget the data-file overrides (tests, the editor tool after a save). */
  reload(): void {
    fromFile = null;
  },
};
