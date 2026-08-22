// (portrait PID, EA generic-head tone) pairs from the M27 roster: EA's own skin-tone
// label for ~1,900 real players with portraits -> cache/roster-tones.json
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const madden = require('madden-franchise');
(async () => {
  const out: Array<{ pid: number; tone: number; head: string; first: string; last: string; asset: string }> = [];
  for (const f of ['C:/Users/amatthews/Documents/Madden NFL 27/saves/CAREER-AUG10-01h29m21p-AUTOSAVE', 'C:/Users/amatthews/Documents/Madden NFL 26/Saves/CAREER-JUN30-08h18m10p-AUTOSAVE']) {
    const file = await madden.create(f, { autoParse: true });
    const pt = file.getTableByName('Player');
    await pt.readRecords();
    for (const r of pt.records) {
      if (r.isEmpty) continue;
      const head = String(r.GenericHeadAssetName || '');
      const m = /^gen_(\d)_/i.exec(head);
      const pid = Number(r.PLYR_PORTRAIT) || 0;
      const asset = String(r.PLYR_ASSETNAME || '');
      if (!m || !pid || !asset || /^gen_/i.test(asset)) continue;
      out.push({ pid, tone: Number(m[1]), head, first: String(r.FirstName), last: String(r.LastName), asset });
    }
  }
  fs.writeFileSync(path.join(__dirname, '..', '..', 'cache', 'roster-tones.json'), JSON.stringify(out));
  console.log(out.length, out.slice(0, 3));
})();
