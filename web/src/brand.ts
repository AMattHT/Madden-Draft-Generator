import type { GameVersion } from './types';

/**
 * Product identity, in one place. The tool started life as a draft-class
 * generator and now covers rosters and franchise saves too, so the shell calls
 * it Front Office: the people who run a club's draft, its roster and its cap.
 *
 * Change NAME here and every title, menu label and window caption follows.
 * The installer / package names live in desktop/ and are left alone.
 */
export const NAME = 'Front Office';
export const TAGLINE = 'Draft classes · Rosters · Franchise tools';

/** "Madden 27 Front Office" for a per-game build; the plain name for the dev build. */
export function productTitle(pinned: GameVersion | null): string {
  return pinned === 'm26' ? `Madden 26 ${NAME}` : pinned === 'm27' ? `Madden 27 ${NAME}` : `Madden ${NAME}`;
}

/** The game the shell is building for, as people say it. */
export function gameLabel(v: GameVersion): string {
  return v === 'm27' ? 'Madden 27' : 'Madden 26';
}
