/**
 * Classify Wiki_Image_URL / PFR_Image_URL from ALL_PLAYER_LOOKUP.csv for
 * players who have no Madden-portrait tone, and merge into wiki_skintone.json.
 *
 *   npx tsx scripts/build-wiki-skintone-from-csv.ts           # all years
 *   npx tsx scripts/build-wiki-skintone-from-csv.ts --year=2003
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { LOOKUPS_DIR } from '../src/config/paths';
import { parseCsvFile, normalizeName } from '../src/util/csv';
import { DerivedSkinToneService } from '../src/services/DerivedSkinToneService';
import { sampleSkinITA, itaToTone } from '../src/services/SkinToneClassify';

const UA = 'MaddenDraftClassGenerator/1.0 (personal tool; skin-tone sampling)';
const dst = path.join(LOOKUPS_DIR, 'wiki_skintone.json');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const yearArg = process.argv.find((a) => a.startsWith('--year='));
const onlyYear = yearArg ? parseInt(yearArg.split('=')[1], 10) : null;

async function fetchBuf(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

(async () => {
  const existing: Record<string, number> = fs.existsSync(dst) ? JSON.parse(fs.readFileSync(dst, 'utf8')) : {};
  const rows = parseCsvFile<Record<string, string>>(path.join(LOOKUPS_DIR, 'ALL_PLAYER_LOOKUP.csv'));
  let classified = 0, skipped = 0, fetched = 0;
  for (const r of rows) {
    const year = parseInt(r['Draft Class'] || '', 10);
    if (onlyYear && year !== onlyYear) continue;
    const photoId = parseInt(r.PhotoID || '', 10);
    if (Number.isFinite(photoId) && DerivedSkinToneService.toneForPid(photoId) != null) continue;
    const url = (r.Wiki_Image_URL || r.PFR_Image_URL || '').trim();
    if (!url) continue;
    const key = `${normalizeName(`${r['First Name']}${r['Last Name']}`)}|${year}`;
    if (existing[key] != null) continue;
    fetched++;
    const buf = await fetchBuf(url);
    await sleep(250);
    if (!buf) { skipped++; continue; }
    try {
      const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const ita = sampleSkinITA(data, info.width, info.height, info.channels, {
        y0: 0.10, y1: 0.62, x0: 0.22, x1: 0.78, minPixels: 50,
      });
      if (ita == null) { skipped++; continue; }
      existing[key] = itaToTone(ita);
      classified++;
      if (classified % 25 === 0) {
        fs.writeFileSync(dst, JSON.stringify(existing));
        console.log(`  ...${classified} classified (${fetched} fetched)`);
      }
    } catch {
      skipped++;
    }
  }
  fs.writeFileSync(dst, JSON.stringify(existing));
  console.log(`done classified=${classified} skipped=${skipped} totalKeys=${Object.keys(existing).length} wrote ${dst}`);
})();
