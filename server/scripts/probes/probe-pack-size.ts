import { PortraitService } from '../../src/services/PortraitService';
import sharp from 'sharp';
import { parseCsvFile } from '../../src/util/csv';
import { LOOKUPS_DIR } from '../../src/config/paths';
import path from 'path';
(async () => {
  const rows = parseCsvFile<Record<string, string>>(path.join(LOOKUPS_DIR, 'PID_Portrait_Mapping.csv'));
  const plpos = [...new Set(rows.map((r) => (r.Portrait || '').trim()).filter((p) => p && p !== 'plpo_Blank'))];
  console.log('unique plpos', plpos.length);
  let total = 0, n = 0;
  for (const p of plpos.slice(0, 60)) {
    const png = await PortraitService.cropByPlpo(p);
    if (!png) continue;
    const jpg = await sharp(png).resize(128, 128).jpeg({ quality: 78 }).toBuffer();
    total += jpg.length; n++;
  }
  console.log(`sample ${n}: avg ${(total / n / 1024).toFixed(1)} KB -> est total ${(total / n * plpos.length / 1048576).toFixed(0)} MB`);
})();
