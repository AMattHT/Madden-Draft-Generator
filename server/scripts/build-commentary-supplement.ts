/**
 * Build data/lookups/m27-commentary-supplement.json: announcer ids for surnames the
 * generated m27-field-stats.json does not know, taken from MyFranchise 2.0.2's
 * static/player/commentary.json (the same EA id space). Surnames both tables know
 * are dropped: the primary table's ids were verified in-game.
 *
 *   npx tsx scripts/build-commentary-supplement.ts <path to MyFranchise commentary.json>
 */
import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../src/config/paths';

const src = process.argv[2];
if (!src || !fs.existsSync(src)) {
  console.error('usage: build-commentary-supplement.ts <path to MyFranchise static/player/commentary.json>');
  process.exit(1);
}

const surnameKey = (s: string) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');

const primary = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'm27-field-stats.json'), 'utf8')).surnameCommentary as Record<string, number>;
const source = JSON.parse(fs.readFileSync(src, 'utf8')) as Record<string, number>;

const out: Record<string, number> = {};
let conflicts = 0, skipped = 0;
for (const [name, id] of Object.entries(source)) {
  const key = surnameKey(name);
  const n = Number(id);
  if (!key || !Number.isInteger(n) || n <= 0) { skipped++; continue; }
  if (key in primary) { conflicts++; continue; }
  if (key in out) continue; // two spellings that normalise the same: first wins
  out[key] = n;
}

const file = path.join(LOOKUPS_DIR, 'm27-commentary-supplement.json');
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(file, JSON.stringify({
  _source: `MyFranchise 2.0.2 static/player/commentary.json (EA announcer ids), surnames absent from m27-field-stats.json; built ${new Date().toISOString().slice(0, 10)} by scripts/build-commentary-supplement.ts`,
  _built: new Date().toISOString().slice(0, 10),
  surnameCommentary: sorted,
}, null, 0));
console.log(`primary ${Object.keys(primary).length}, source ${Object.keys(source).length}, added ${Object.keys(sorted).length}, conflicts ${conflicts}, skipped ${skipped} -> ${file}`);
