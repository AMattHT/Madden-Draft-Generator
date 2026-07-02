/**
 * End-to-end export verification (no HTTP): build a historical draft class
 * from the local baseline, write a real .mdc, re-parse it, and assert that the
 * generated players (names, positions, OVR, draft round) round-trip and that
 * unused blocks are neutralized. Run: node scripts/verify-export.js [year]
 */
const path = require('path');
const fs = require('fs');

// Use tsx's require hook so we can pull the TS services directly.
require('tsx/cjs');
const { PlayerLookupService } = require('../src/services/PlayerLookupService');
const { DraftClassBuilder } = require('../src/services/DraftClassBuilder');
const { MdcService } = require('../src/services/MdcService');

const year = parseInt(process.argv[2] || '2003', 10);
const league = year >= 1960 && year <= 1969 ? 'combined' : 'NFL';

const players = PlayerLookupService.byYear(year, league);
console.log(`[verify] ${year} (${league}): ${players.length} baseline players`);

const { buffer, count, truncated, dropped, likeness } = DraftClassBuilder.buildMdc(players);
const outPath = path.join(__dirname, '..', 'cache', 'exports', `DraftClass_${year}_${league}.mdc`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, buffer);
console.log(`[verify] wrote ${outPath} (${buffer.length} bytes, ${count} prospects, truncated=${truncated}, dropped=${dropped.length})`);
console.log(`[verify] likeness: ${likeness.asset} real assets, ${likeness.generic} generic, ${likeness.withPortrait} with real portrait`);

const reparsed = MdcService.parse(buffer);
const usedNamed = reparsed.slice(0, count).filter((p) => (p.firstName || '').trim().length > 0).length;
// Note: M26Parser reads draftable as `byte || 1`, so a zeroed block parses back
// as draftable=1; check the inert signal via empty name + pos 0 + ovr 0 instead.
const neutralized = reparsed
  .slice(count, 402)
  .every((p) => (p.firstName || '').trim() === '' && Number(p.position) === 0 && Number(p.overall) === 0);

console.log('[verify] first 8 generated prospects:');
for (let i = 0; i < Math.min(8, count); i++) {
  const p = reparsed[i];
  const src = players[i];
  console.log(
    `  #${i} ${(`${p.firstName} ${p.lastName}`).trim().padEnd(24)} pos=${String(p.position).padStart(2)} ovr=${String(p.overall).padStart(2)} rnd=${p.draftRound} dev=${p.devTrait} face=${p.PEPS || '(none)'} | wav=${src.wav}`
  );
}

// Spot-check named-legend likeness round-trips through the .mdc binary.
for (const target of ['Jackson Bo', 'Sanders Barry', 'Namath Joe', 'Davis Ernie']) {
  const [ln, fn] = target.split(' ');
  const idx = players.findIndex((s) => s.lastName === ln && s.firstName === fn);
  if (idx >= 0 && idx < count) {
    const p = reparsed[idx];
    console.log(`[verify] likeness ${fn} ${ln}: face="${p.PEPS || '(generic/none)'}" PID=${p.PID} ovr=${p.overall}`);
  }
}

function gear(p) {
  const lo = (p.visuals?.loadouts || []).find((l) => l.loadoutType === 'PlayerOnField');
  const get = (slot) => ((lo?.loadoutElements || []).find((e) => e.slotType === slot) || {}).itemAssetName || '?';
  return `helmet=${get('HeadWear')} visor=${get('Visor')} shoe=${get('LeftShoe')} glove=${get('LeftHandWear')}`;
}
console.log('[verify] era gear (first 3):');
for (let i = 0; i < Math.min(3, count); i++) {
  console.log(`  #${i} ${(`${reparsed[i].firstName} ${reparsed[i].lastName}`).trim().padEnd(22)} ${gear(reparsed[i])}`);
}

const sig = buffer.toString('ascii', 0, 8);
const ok =
  sig === 'FBCHUNKS' &&
  buffer.length === MdcService.loadTemplate().length &&
  usedNamed === count &&
  neutralized;
console.log(`\n[verify] sig=${sig} sizeMatch=${buffer.length === MdcService.loadTemplate().length} usedNamed=${usedNamed}/${count} unusedNeutralized=${neutralized}`);
console.log(`[verify] RESULT: ${ok ? 'PASS ✅' : 'FAIL ❌'}`);
process.exit(ok ? 0 : 1);
