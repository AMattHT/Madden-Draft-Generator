/**
 * Promote a user's likeness fixes into the shipped curated skin-tone file.
 *
 *   npx tsx scripts/promote-likeness-overrides.ts [path/to/likeness-overrides.json] [--force] [--dry-run]
 *
 * Default input is the running app's own store (server/cache/likeness-overrides.json).
 * Only tones are promoted: a face pick is a personal choice, a tone is a fact.
 * An entry the curated file already has is left alone unless --force.
 */
import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR, CACHE_DIR } from '../src/config/paths';
import { mergeIntoCurated } from '../src/services/LikenessOverrideService';

const args = process.argv.slice(2);
const force = args.includes('--force');
const dry = args.includes('--dry-run');
const input = args.find((a) => !a.startsWith('--')) ?? path.join(CACHE_DIR, 'likeness-overrides.json');
const curatedFile = path.join(LOOKUPS_DIR, 'curated-skin-tone.json');

const overrides = (JSON.parse(fs.readFileSync(input, 'utf8')) as { overrides?: Record<string, { skinTone?: number }> }).overrides ?? {};
const curated = JSON.parse(fs.readFileSync(curatedFile, 'utf8')) as { tones?: Record<string, number> };
curated.tones ??= {};

const { added, replaced, skipped } = mergeIntoCurated(overrides, curated.tones, force);
console.log(`${Object.keys(overrides).length} overrides in ${input}`);
console.log(`  added ${added.length}: ${added.join(', ') || '-'}`);
console.log(`  replaced ${replaced.length}: ${replaced.join(', ') || '-'}`);
if (skipped.length) console.log(`  kept curated value for ${skipped.length} (use --force to replace): ${skipped.join(', ')}`);
if (dry) { console.log('dry run: nothing written'); process.exit(0); }
if (!added.length && !replaced.length) { console.log('nothing to write'); process.exit(0); }
fs.writeFileSync(curatedFile, JSON.stringify(curated, null, 2) + '\n');
console.log(`wrote ${curatedFile} (${Object.keys(curated.tones).length} tones)`);
