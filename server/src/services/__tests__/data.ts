import fs from 'fs';
import path from 'path';
import { CACHE_DIR } from '../../config/paths';

/** True when the nflverse cache (gitignored, downloaded on first run) is present
 *  and the environment did not ask to skip data-bound tests (CI). */
export const HAS_DATA = process.env.CI_SKIP_DATA !== '1' && fs.existsSync(path.join(CACHE_DIR, 'nflverse_draft_picks.csv'));
export const skipWithoutData = { skip: HAS_DATA ? false : 'needs the nflverse cache (run the server once, or unset CI_SKIP_DATA)' } as const;
