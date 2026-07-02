/**
 * One-time builder: derive each real player's skin tone (1-7) from their actual
 * Madden menu PORTRAIT and emit data/lookups/pid_skintone.json (PID -> tone).
 *
 * The source Race column is a near-universal 7 export default (not real ethnicity),
 * so we sample the face pixels of the real portrait instead. Skin pixels are detected
 * in YCbCr (hue-based, robust to brightness) and classified by ITA (Individual
 * Typology Angle, the dermatology skin-tone metric) with thresholds tuned so clearly
 * White players land on the light generic tones (1-2) and Black players on 5-7.
 *
 * Run: npx tsx scripts/build-skintone.ts
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { PortraitService } from '../src/services/PortraitService';
import { LOOKUPS_DIR } from '../src/config/paths';
import { parseCsvFile } from '../src/util/csv';

function ita([r, g, b]: number[]): number {
  const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const R = lin(r), G = lin(g), B = lin(b);
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const L = 116 * f(Y) - 16, bb = 200 * (f(Y) - f(Z));
  return (Math.atan2(L - 50, bb) * 180) / Math.PI;
}

// ITA (of a real, lit portrait) -> Madden generic skin tone.
function itaToTone(v: number): number {
  if (v >= 25) return 1;
  if (v >= 5) return 2;
  if (v >= -10) return 3;
  if (v >= -25) return 4;
  if (v >= -38) return 5;
  if (v >= -48) return 6;
  return 7;
}

async function skinITA(plpo: string): Promise<number | null> {
  const png = await PortraitService.cropByPlpo(plpo);
  if (!png) return null;
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let y = Math.floor(0.30 * H); y < 0.68 * H; y++)
    for (let x = Math.floor(0.28 * W); x < 0.72 * W; x++) {
      const i = (y * W + x) * C, r = data[i], g = data[i + 1], b = data[i + 2];
      const Cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const Cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      if (Cb >= 77 && Cb <= 133 && Cr >= 133 && Cr <= 177 && r > 30) { rs.push(r); gs.push(g); bs.push(b); }
    }
  if (rs.length < 40) return null;
  const med = (a: number[]) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
  return ita([med(rs), med(gs), med(bs)]);
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
    const v = await skinITA(plpo);
    if (v == null) { skipped++; continue; }
    const tone = itaToTone(v);
    out[pid] = tone;
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
