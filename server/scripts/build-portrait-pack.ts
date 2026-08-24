/**
 * Pre-crop every menu portrait the tool can reference into a compact pack
 * (data/portraits/<plpo>.jpg, 128x128 q78, ~21 MB total). PortraitService
 * serves from this pack when the Editor Suite's 259 MB sprite atlas is not on
 * the machine — which is every packaged desktop install.
 *
 *   npx tsx scripts/build-portrait-pack.ts
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { PortraitService } from '../src/services/PortraitService';
import { parseCsvFile } from '../src/util/csv';
import { DATA_ROOT, LOOKUPS_DIR } from '../src/config/paths';

(async () => {
  if (!PortraitService.available) { console.error('sprite atlas not found — the pack can only be built on a machine with the Editor Suite data'); process.exit(1); }
  const out = path.join(DATA_ROOT, 'portraits');
  fs.mkdirSync(out, { recursive: true });
  const rows = parseCsvFile<Record<string, string>>(path.join(LOOKUPS_DIR, 'PID_Portrait_Mapping.csv'));
  const plpos = [...new Set(rows.map((r) => (r.Portrait || '').trim()).filter((p) => p && p !== 'plpo_Blank'))];
  let done = 0, missing = 0, bytes = 0;
  for (const p of plpos) {
    const dst = path.join(out, `${p}.jpg`);
    if (fs.existsSync(dst)) { done++; continue; }
    const png = await PortraitService.cropByPlpo(p);
    if (!png) { missing++; continue; }
    const jpg = await sharp(png).resize(128, 128).jpeg({ quality: 78 }).toBuffer();
    fs.writeFileSync(dst, jpg);
    bytes += jpg.length;
    if (++done % 1000 === 0) console.log(`  ${done}/${plpos.length}`);
  }
  console.log(`packed ${done} portraits (${missing} not in the atlas), ${(bytes / 1048576).toFixed(1)} MB new -> ${out}`);
})();
