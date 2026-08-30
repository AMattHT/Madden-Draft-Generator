/**
 * Measure skin ITA from every Madden-disc headshot in the retro pack.
 *
 * The tone classifier weighs a portrait ITA, a Wikipedia tone, the CSV race
 * column and a position/era prior. For a player with no in-game portrait the
 * only picture it sees is the Wikipedia one -- a photo of unknown framing and
 * lighting -- and the prior does the rest. Mike Pritchard (1991 WR, Colorado)
 * came out tone 2 that way, off a wiki reading of 3, and got a white generic
 * head.
 *
 * But his real Madden headshot is sitting in the retro pack. These are studio
 * crops on a flat background, framed exactly like the in-game portraits the
 * ITA model was calibrated on, which makes them the best skin sample available
 * for any player they cover -- far better than an arbitrary web photo.
 *
 * Writes data/lookups/retro-ita.json: "<first>_<last>" -> median skin ITA, for
 * DraftEnrichment to feed into toneFromEvidence as portrait-grade evidence.
 *
 *   npx tsx scripts/build-retro-ita.ts
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { DATA_ROOT, LOOKUPS_DIR } from '../src/config/paths';
import { sampleSkinITATight } from '../src/services/SkinToneClassify';

(async () => {
  const dir = path.join(DATA_ROOT, 'retro-portraits');
  if (!fs.existsSync(dir)) {
    console.error('retro-portraits missing — run build-retro-headshot-pack.ts first');
    process.exit(1);
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png'));
  const out: Record<string, number> = {};
  let miss = 0;
  for (const file of files) {
    try {
      const { data, info } = await sharp(path.join(dir, file))
        .raw()
        .toBuffer({ resolveWithObject: true });
      // 96x96 PS2 art gives far fewer skin pixels than a 256x256 portrait, so the
      // floor is lowered; below this the median is noise and we return nothing.
      const ita = sampleSkinITATight(data, info.width, info.height, info.channels, 15);
      if (ita != null) out[file.replace(/\.png$/, '')] = Math.round(ita * 10) / 10;
      else miss++;
    } catch {
      miss++;
    }
  }
  const file = path.join(LOOKUPS_DIR, 'retro-ita.json');
  fs.writeFileSync(file, JSON.stringify(out));
  console.log(`  ${Object.keys(out).length} headshots measured${miss ? `, ${miss} with too little skin` : ''}`);
  console.log(`  -> ${file} (${Math.round(fs.statSync(file).size / 1024)} KB)`);
})();
