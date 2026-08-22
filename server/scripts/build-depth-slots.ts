/** Build the depth-chart position caches (SS/FS/CB + LT/LG/C/RG/RT/DT slots) from
 *  the cached nflverse depth-chart CSVs. Runs in the background on first use
 *  otherwise; run this once after a fresh clone so the first classes aren't degraded.
 *    npx tsx scripts/build-depth-slots.ts */
import { DbPositionService } from '../src/services/DbPositionService';
(async () => {
  const t = Date.now();
  await DbPositionService.ensureBuilt();
  console.log(`depth-chart position caches built in ${((Date.now() - t) / 1000).toFixed(0)}s`);
})();
