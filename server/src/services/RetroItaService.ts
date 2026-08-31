import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../config/paths';
import { normalizeName } from '../util/csv';
import { RetroHeadshotService } from './RetroHeadshotService';

/** Median skin ITA measured off each Madden-disc headshot in the retro pack
 *  (scripts/build-retro-ita.ts). Used as skin-tone evidence for players the
 *  game has no portrait of, where the alternative is a web photo of unknown
 *  framing plus the position/era prior. */
let map: Record<string, number> | null = null;

export const RetroItaService = {
  /** `position` picks the right photo when a name covers more than one player:
   *  the 2008 safety Cam Newton reads ITA -20, the 2011 quarterback +1.7, and
   *  taking the name's first entry would hand one man the other's skin tone. */
  itaFor(first: string, last: string, position?: string | null): number | null {
    if (!map) {
      try {
        map = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'retro-ita.json'), 'utf8'));
      } catch {
        map = {};
      }
    }
    const stem =
      RetroHeadshotService.stem(first, last, position) ??
      `${normalizeName(first)}_${normalizeName(last)}`;
    const v = map![stem];
    return typeof v === 'number' ? v : null;
  },
};
