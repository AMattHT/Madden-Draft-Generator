import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../config/paths';
import { normalizeName } from '../util/csv';

/** Median skin ITA measured off each Madden-disc headshot in the retro pack
 *  (scripts/build-retro-ita.ts). Used as skin-tone evidence for players the
 *  game has no portrait of, where the alternative is a web photo of unknown
 *  framing plus the position/era prior. */
let map: Record<string, number> | null = null;

export const RetroItaService = {
  itaFor(first: string, last: string): number | null {
    if (!map) {
      try {
        map = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'retro-ita.json'), 'utf8'));
      } catch {
        map = {};
      }
    }
    const v = map![`${normalizeName(first)}_${normalizeName(last)}`];
    return typeof v === 'number' ? v : null;
  },
};
