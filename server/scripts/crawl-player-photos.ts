/**
 * Pre-crawl Wikipedia photos for notable players of the pre-headshot era
 * (< 1999: nflverse has no NFL.com headshots for them). Results land in the
 * same cache/wiki-photos.json the lazy per-class lookup uses, so this only
 * front-loads what browsing every year would fetch anyway. Resumable: cached
 * names (found or not-found) are skipped.
 *
 *   npx tsx scripts/crawl-player-photos.ts [--min-greatness=20] [--from=1936] [--to=1998]
 */
import { PlayerLookupService } from '../src/services/PlayerLookupService';
import { PhotoLookService, bestPhotoUrl } from '../src/services/PhotoLookService';

const arg = (name: string, dflt: number) => { const m = process.argv.find((a) => a.startsWith(`--${name}=`)); return m ? Number(m.split('=')[1]) : dflt; };
const MIN = arg('min-greatness', 20);
const FROM = arg('from', 1936);
const TO = arg('to', 1998);
const RETRY_NULLS = process.argv.includes('--retry-nulls');

const score = (p: { wav: number | null; allPro1: number | null; proBowls: number | null; isHOF: boolean | null; seasonsStarted: number | null }) =>
  (p.wav ?? 0) + 6 * (p.allPro1 ?? 0) + 3 * (p.proBowls ?? 0) + (p.isHOF ? 40 : 0) + 2 * (p.seasonsStarted ?? 0);

(async () => {
  // A cached null can be an honest miss — or the old any-page search / a rate
  // limit failure. --retry-nulls clears the nulls for the candidate set so the
  // fixed exact-title search gets one more shot at them.
  if (RETRY_NULLS) {
    const wanted = new Set<string>();
    for (const year of PlayerLookupService.years()) {
      if (year < FROM || year > TO) continue;
      for (const p of PlayerLookupService.byYear(year)) {
        if (score(p) >= MIN && !bestPhotoUrl(p)) wanted.add(`${p.firstName.toLowerCase()}|${p.lastName.toLowerCase()}`);
      }
    }
    const cleared = PhotoLookService.clearNullWikiEntries((first, last) => wanted.has(`${first}|${last}`));
    console.log(`cleared ${cleared} cached not-found entries for retry`);
  }
  let tried = 0, found = 0, had = 0;
  for (const year of PlayerLookupService.years()) {
    if (year < FROM || year > TO) continue;
    for (const p of PlayerLookupService.byYear(year)) {
      if (bestPhotoUrl(p)) { had++; continue; }
      if (score(p) < MIN) continue;
      const url = await PhotoLookService.resolvePhoto(p);
      tried++;
      if (url) found++;
      if (tried % 100 === 0) console.log(`  ${tried} fetched, ${found} photos found (${year})`);
    }
  }
  console.log(`done: ${tried} names fetched, ${found} new photos, ${had} already had one`);
})();
