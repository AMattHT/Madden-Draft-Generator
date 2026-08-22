// Dump position / height / weight / body type for every player on the newest career
// autosave of each game (EA-assigned builds for real players) -> cache/roster-builds.json.
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const madden = require('madden-franchise');
const SAVES = { m26: 'C:/Users/amatthews/Documents/Madden NFL 26/Saves/CAREER-JUN30-08h18m10p-AUTOSAVE', m27: 'C:/Users/amatthews/Documents/Madden NFL 27/saves/CAREER-AUG10-01h29m21p-AUTOSAVE' };
(async () => {
  const out: Record<string, unknown[]> = {};
  for (const [v, f] of Object.entries(SAVES)) {
    const file = await madden.create(f, { autoParse: true });
    const pt = file.getTableByName('Player');
    await pt.readRecords();
    const rows: unknown[] = [];
    for (const r of pt.records) {
      if (r.isEmpty) continue;
      rows.push({ pos: String(r.Position), h: Number(r.Height), w: Number(r.Weight), bt: String(r.CharacterBodyType), yearsPro: Number(r.YearsPro), age: Number(r.Age) });
    }
    out[v] = rows;
    console.log(v, rows.length, rows[0]);
  }
  fs.writeFileSync(path.join(__dirname, '..', '..', 'cache', 'roster-builds.json'), JSON.stringify(out));
})();
