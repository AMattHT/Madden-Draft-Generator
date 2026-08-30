/**
 * Build the retro headshot pack from the Madden PS2 portraits extracted by
 * ../../headshots/extract_madden_ps2_portraits.py and named by its
 * decode_league_dat.py.
 *
 * Those discs (Madden 2001-2012) carry the real NFL photo of every player on
 * their rosters. For historical draft classes that is exactly the art the tool
 * otherwise has to scrape off the web -- and the web is worst precisely here,
 * because the NFL CDN serves a silhouette for most retirees. Roughly 1,900
 * players in ALL_PLAYER_LOOKUP have no in-game face or portrait but do appear
 * on one of these discs.
 *
 * Writes:
 *   data/retro-portraits/<normalized name>.png   96x96 RGBA, as shipped on disc
 *   data/lookups/retro-headshots.json            name -> { year, position }
 *
 * The earliest disc a player appears on wins: a draft class wants the player as
 * close to his rookie year as the source allows. That also keeps the look
 * consistent: 2004 re-shot the art on studio backgrounds instead of cutting
 * players out on black, and 2005-2007 re-shot it again. Each later disc only
 * supplies players the earlier ones never had.
 *
 *   npx tsx scripts/build-retro-headshot-pack.ts [headshotsDir]
 */
import fs from 'fs';
import path from 'path';
import { DATA_ROOT, LOOKUPS_DIR, SERVER_ROOT } from '../src/config/paths';
import { parseCsvFile, normalizeName } from '../src/util/csv';

/**
 * The PS2 discs (2001-2012) and the PS3 discs each store portraits in their own
 * layout, so a source names its directory and the subdirectory holding the art.
 * PS3 portraits are 256x256 against the PS2 discs' 96x96; they come last only
 * because their rosters are later, and "earliest disc wins" still decides.
 */
interface Source {
  year: number;
  dir: string;
  images: string;
}

const SOURCES: Source[] = [
  ...[2001, 2002, 2003, 2004, 2005, 2006, 2007,
      2008, 2009, 2010, 2011].map((year) => ({
    year,
    dir: `madden${year}-ps2`,
    images: 'uis_plyr',
  })),
  // Madden 12 shipped on both consoles. The PS3 art is 256x256 against the PS2
  // disc's 96x96, so for the same year the better source goes first; the PS2
  // disc still supplies anyone the PS3 one misses.
  { year: 2012, dir: 'madden2012-ps3', images: 'portraits' },
  { year: 2012, dir: 'madden2012-ps2', images: 'uis_plyr' },
  { year: 2013, dir: 'madden2013-ps3', images: 'portraits' },
  // Madden NFL 25 is the 2013 release, so it follows Madden 13 despite the name.
  { year: 2014, dir: 'madden2014-ps3', images: 'portraits' },
  { year: 2015, dir: 'madden2015-ps3', images: 'portraits' },
  { year: 2016, dir: 'madden2016-ps3', images: 'portraits' },
  { year: 2017, dir: 'madden2017-ps3', images: 'portraits' },
];

interface RosterRow {
  first_name: string;
  last_name: string;
  position: string;
  portrait_file: string;
  roster: string;
}

function resolveHeadshots(argDir?: string): string | null {
  const candidates = [
    argDir,
    process.env.MADDEN_RETRO_HEADSHOTS_DIR,
    path.resolve(SERVER_ROOT, '..', '..', 'headshots'),
  ].filter(Boolean) as string[];
  return candidates.find((c) => fs.existsSync(path.join(c, SOURCES[0].dir))) || null;
}

const root = resolveHeadshots(process.argv[2]);
if (!root) {
  console.error('headshots dir not found - pass it as an argument or set MADDEN_RETRO_HEADSHOTS_DIR');
  process.exit(1);
}

const out = path.join(DATA_ROOT, 'retro-portraits');
fs.mkdirSync(out, { recursive: true });

const index: Record<string, { year: number; position: string }> = {};
let copied = 0;
let bytes = 0;
let skipped = 0;

for (const { year, dir: name, images } of SOURCES) {
  const dir = path.join(root, name);
  const csv = path.join(dir, 'roster.csv');
  if (!fs.existsSync(csv)) {
    console.warn(`  ${year}: no roster.csv, skipped`);
    continue;
  }
  let added = 0;
  for (const row of parseCsvFile<RosterRow>(csv)) {
    if (row.roster !== 'current' || !row.portrait_file) continue;
    const key = `${normalizeName(row.first_name)}|${normalizeName(row.last_name)}`;
    if (key.length < 3 || index[key]) continue; // earliest disc wins
    const src = path.join(dir, images, row.portrait_file);
    if (!fs.existsSync(src)) {
      skipped++;
      continue;
    }
    const dst = path.join(out, `${key.replace('|', '_')}.png`);
    fs.copyFileSync(src, dst);
    bytes += fs.statSync(dst).size;
    index[key] = { year, position: row.position };
    added++;
    copied++;
  }
  console.log(`  ${year}: +${added} players`);
}

fs.writeFileSync(path.join(LOOKUPS_DIR, 'retro-headshots.json'), JSON.stringify(index));
console.log(
  `retro headshot pack: ${copied} portraits, ${(bytes / 1e6).toFixed(1)} MB -> ${out}` +
    (skipped ? ` (${skipped} roster rows had no image file)` : '')
);
