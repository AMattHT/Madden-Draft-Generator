/**
 * Derive each real player's skin tone (1-7) from their Madden menu PORTRAIT
 * and emit data/lookups/pid_skintone.json (PID -> tone, flat prior) and
 * pid_ita.json (PID -> [median ITA, legend-portrait flag]) for the Bayesian
 * resolve in DraftEnrichment (SkinToneClassify.toneFromEvidence).
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
import { sampleSkinITATight, TONE_ITA_MODEL, TONE_L_MODEL, isGreyscale, sampleGreyL } from '../src/services/SkinToneClassify';

async function itaFromPlpo(plpo: string): Promise<{ ita: number | null; greyL: number | null }> {
  const png = await PortraitService.cropByPlpo(plpo);
  if (!png) return { ita: null, greyL: null };
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const ita = sampleSkinITATight(data, info.width, info.height, info.channels, 40);
  if (ita != null) return { ita, greyL: null };
  // Black-and-white legends photo: luminance is the only evidence.
  const greyL = isGreyscale(data, info.width, info.height, info.channels) ? sampleGreyL(data, info.width, info.height, info.channels) : null;
  return { ita: null, greyL };
}
function toneFromL(L: number): number {
  let best = 4, bestLl = -Infinity;
  for (let t = 1; t <= 7; t++) {
    const [mu, sd] = TONE_L_MODEL[t];
    const ll = -0.5 * ((L - mu) / (sd * 2)) ** 2 - Math.log(sd);
    if (ll > bestLl) { bestLl = ll; best = t; }
  }
  return best;
}
/** Most likely tone from ITA alone (flat prior) — the legacy pid_skintone value. */
function toneFromIta(ita: number): number {
  let best = 4, bestLl = -Infinity;
  for (let t = 1; t <= 7; t++) {
    const [mu, sd] = TONE_ITA_MODEL[t];
    const ll = -0.5 * ((ita - mu) / sd) ** 2 - Math.log(sd);
    if (ll > bestLl) { bestLl = ll; best = t; }
  }
  return best;
}

(async () => {
  if (!PortraitService.available) { console.error('portraits NOT available — cannot build'); process.exit(1); }
  const rows = parseCsvFile<Record<string, string>>(path.join(LOOKUPS_DIR, 'PID_Portrait_Mapping.csv'));
  const out: Record<string, number> = {};
  const itas: Record<string, [number, number, number]> = {}; // pid -> [value, legend 0/1, greyscale 0/1 (value is L*)]
  let grey = 0;
  const toneCount: Record<number, number> = {};
  let real = 0, done = 0, skipped = 0;
  for (const r of rows) {
    const pid = parseInt(r['PID'], 10);
    const plpo = (r['Portrait'] || '').trim();
    if (Number.isNaN(pid) || !plpo || plpo === 'plpo_Blank' || /^plpo_generic/.test(plpo)) continue;
    real++;
    const { ita, greyL } = await itaFromPlpo(plpo);
    if (ita == null && greyL == null) { skipped++; continue; }
    const tone = ita != null ? toneFromIta(ita) : toneFromL(greyL!);
    out[String(pid)] = tone;
    const legend = (r['Type'] || '').trim() === 'legend' ? 1 : 0;
    if (ita != null) itas[String(pid)] = [Math.round(ita * 10) / 10, legend, 0];
    else { itas[String(pid)] = [Math.round(greyL! * 10) / 10, legend, 1]; grey++; }
    toneCount[tone] = (toneCount[tone] || 0) + 1;
    done++;
    if (done % 500 === 0) console.log(`  ...${done} classified`);
  }
  const dst = path.join(LOOKUPS_DIR, 'pid_skintone.json');
  fs.writeFileSync(dst, JSON.stringify(out));
  fs.writeFileSync(path.join(LOOKUPS_DIR, 'pid_ita.json'), JSON.stringify(itas));
  console.log(`\nreal portraits: ${real}, classified: ${done} (${grey} greyscale by luminance), skipped(no skin): ${skipped}`);
  console.log('tone distribution:', JSON.stringify(toneCount));
  const dark = (toneCount[6] || 0) + (toneCount[7] || 0);
  const light = (toneCount[1] || 0) + (toneCount[2] || 0);
  console.log(`light(1-2)=${light} (${Math.round(100 * light / done)}%)  dark(6-7)=${dark} (${Math.round(100 * dark / done)}%)`);
  console.log(`wrote ${dst}`);
})();
