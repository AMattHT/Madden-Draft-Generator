/**
 * Verify the Frosty custom-portrait pipeline (game-independent parts):
 *  - find players with a real photo but no in-game face,
 *  - download + face-crop a few real photos into a Frosty-import folder,
 *  - confirm the .mdc points those prospects at the recycled portrait PID.
 * Run: node scripts/verify-portraits.js
 */
require('tsx/cjs');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { PlayerLookupService } = require('../src/services/PlayerLookupService');
const { PortraitSlotService } = require('../src/services/PortraitSlotService');
const { PortraitModService } = require('../src/services/PortraitModService');
const { DraftClassBuilder } = require('../src/services/DraftClassBuilder');
const { MdcService } = require('../src/services/MdcService');

(async () => {
  // 1. Scan all years for custom-portrait candidates (no downloads).
  const counts = [];
  for (const y of PlayerLookupService.years()) {
    const league = y >= 1960 && y <= 1969 ? 'combined' : 'NFL';
    const players = PlayerLookupService.byYear(y, league).slice(0, 402);
    const c = PortraitSlotService.assignSlots(players).length;
    if (c > 0) counts.push([y, league, c]);
  }
  counts.sort((a, b) => b[2] - a[2]);
  const totalCandidates = counts.reduce((s, c) => s + c[2], 0);
  console.log(`[verify] years with custom-portrait candidates: ${counts.length} (${totalCandidates} players total)`);
  console.log('[verify] top years:', counts.slice(0, 8).map((c) => `${c[0]}(${c[2]})`).join(', ') || '(none)');
  if (counts.length === 0) {
    console.log('[verify] RESULT: PASS (no candidates in data — nothing to download)');
    process.exit(0);
  }

  // 2. Build a portrait mod for the richest year (limited downloads).
  const [year, league] = counts[0];
  console.log(`\n[verify] building portrait mod for ${year} (${league}), limit 4...`);
  const res = await PortraitModService.buildForYear(year, league, { limit: 4, nowIso: new Date().toISOString() });
  console.log(`[verify] dir: ${res.outputDir}`);
  console.log(`[verify] candidates(this run)=${res.candidates} exported=${res.exported} errors=${res.errors.length}`);
  for (const a of res.manifest.assignments) {
    console.log(`   ${a.historicalPlayer.padEnd(22)} -> ${a.plpo}.png (PID ${a.pid})`);
  }
  for (const e of res.errors) console.log(`   ERR ${e.name}: ${e.error}`);

  const pngFiles = fs.readdirSync(res.outputDir).filter((f) => f.endsWith('.png'));
  let dimsOk = false;
  if (pngFiles.length) {
    const m = await sharp(path.join(res.outputDir, pngFiles[0])).metadata();
    console.log(`[verify] sample ${pngFiles[0]}: ${m.width}x${m.height} ${m.format}`);
    dimsOk = m.width === 256 && m.height === 256;
  }
  const hasManifest = fs.existsSync(path.join(res.outputDir, 'manifest.json'));
  const hasReadme = fs.existsSync(path.join(res.outputDir, 'README.txt'));

  // 3. Confirm the .mdc points the first candidate at the recycled PID.
  const players = PlayerLookupService.byYear(year, league).slice(0, 402);
  const assigns = PortraitSlotService.assignSlots(players);
  const built = DraftClassBuilder.buildMdc(players);
  const reparsed = MdcService.parse(built.buffer);
  const a0 = assigns[0];
  const mdcPid = Number(reparsed[a0.index].PID);
  console.log(`[verify] .mdc PID for ${a0.name} (block ${a0.index}): ${mdcPid} (expected ${a0.pid})`);
  console.log(`[verify] .mdc customPortrait count: ${built.likeness.customPortrait}`);

  const ok = res.exported > 0 && pngFiles.length > 0 && dimsOk && hasManifest && hasReadme && mdcPid === a0.pid;
  console.log(`[verify] RESULT: ${ok ? 'PASS ✅' : 'FAIL ❌'}`);
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error('[verify] ERR', e.message);
  process.exit(1);
});
