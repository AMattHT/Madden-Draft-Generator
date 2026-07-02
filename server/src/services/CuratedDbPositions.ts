import { normalizeName } from '../util/csv';

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
};

export const CuratedDbPositions = {
  /** Curated SS/FS/CB for a player, or undefined. Matched by name + draft year. */
  get(first: string, last: string, draftYear: number): DbPos | undefined {
    return OVERRIDES[`${normalizeName(`${first} ${last}`)}|${draftYear}`];
  },
};
