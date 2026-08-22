/**
 * Derive each real player's skin tone (1-7) from their Madden menu PORTRAIT
 * and emit data/lookups/pid_skintone.json (PID -> tone).
 *
 * Uses a two-pass YCbCr sampler (tight box, then relaxed for darker skin) so
 * Black players are not classified as tone 2–4 from forehead highlights.
 *
 * Run: npx tsx scripts/build-skintone.ts
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { PortraitService } from '../src/services/PortraitService';
import { LOOKUPS_DIR } from '../src/config/paths';
import { parseCsvFile } from '../src/util/csv';
import { sampleSkinITA, itaToTone } from '../src/services/SkinToneClassify';

async function skinToneFromPlpo(plpo: string): Promise<number | null> {
  const png = await PortraitService.cropByPlpo(plpo);
  if (!png) return null;
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const ita = sampleSkinITA(data, info.width, info.height, info.channels, { minPixels: 40 });
  return ita == null ? null : itaToTone(ita);
}

(async () => {
  if (!PortraitService.available) { console.error('portraits NOT available — cannot build'); process.exit(1); }
  const rows = parseCsvFile<Record<string, string>>(path.join(LOOKUPS_DIR, 'PID_Portrait_Mapping.csv'));
  const out: Record<string, number> = {};
  const toneCount: Record<number, number> = {};
  let real = 0, done = 0, skipped = 0;
  for (const r of rows) {
    const pid = parseInt(r['PID'], 10);
    const plpo = (r['Portrait'] || '').trim();
    if (Number.isNaN(pid) || !plpo || plpo === 'plpo_Blank' || /^plpo_generic/.test(plpo)) continue;
    real++;
    const tone = await skinToneFromPlpo(plpo);
    if (tone == null) { skipped++; continue; }
    out[String(pid)] = tone;
    toneCount[tone] = (toneCount[tone] || 0) + 1;
    done++;
    if (done % 500 === 0) console.log(`  ...${done} classified`);
  }
  const dst = path.join(LOOKUPS_DIR, 'pid_skintone.json');
  fs.writeFileSync(dst, JSON.stringify(out));
  console.log(`\nreal portraits: ${real}, classified: ${done}, skipped(no skin): ${skipped}`);
  console.log('tone distribution:', JSON.stringify(toneCount));
  const dark = (toneCount[6] || 0) + (toneCount[7] || 0);
  const light = (toneCount[1] || 0) + (toneCount[2] || 0);
  console.log(`light(1-2)=${light} (${Math.round(100 * light / done)}%)  dark(6-7)=${dark} (${Math.round(100 * dark / done)}%)`);
  console.log(`wrote ${dst}`);
})();
