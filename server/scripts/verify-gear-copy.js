/**
 * End-to-end gear-copy verification: build the 2003 class, apply a real donor
 * loadout (Mahomes, from real-player-gear.json) onto pick #1 as gear edits —
 * exactly what "Copy full look" in the Equipment Builder produces — write the
 * .mdc, re-parse it, and assert every donor slot round-trips.
 * Run: node scripts/verify-gear-copy.js
 */
const path = require('path');
const fs = require('fs');

require('tsx/cjs');
const { PlayerLookupService } = require('../src/services/PlayerLookupService');
const { DraftClassBuilder } = require('../src/services/DraftClassBuilder');
const { MdcService } = require('../src/services/MdcService');

const donorDb = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'real-player-gear.json'), 'utf8'));
const donor = donorDb.players.find((p) => p.name === 'Patrick Mahomes');
if (!donor) throw new Error('donor not found in real-player-gear.json');

const players = PlayerLookupService.byYear(2003, 'NFL');
console.log(`[verify-gear] 2003: ${players.length} players; copying ${donor.name}'s look onto pick #1`);

// Same shape the web app sends: { "1": { slot: asset } } (key = pick number).
const gearEdits = { 1: donor.gear };
const { buffer, count } = DraftClassBuilder.buildMdc(players, undefined, 'madden', gearEdits);
const reparsed = MdcService.parse(buffer);

const p1 = reparsed[0];
const lo = (p1.visuals?.loadouts || []).find((l) => l.loadoutType === 'PlayerOnField');
const els = lo?.loadoutElements || [];
const bySlot = {};
for (const e of els) {
  if (!e.slotType && String(e.itemAssetName).startsWith('GearFaceMask_')) { bySlot.facemask = e.itemAssetName; continue; }
  bySlot[e.slotType] = e.itemAssetName;
}
const SLOT_TYPES = {
  helmet: 'HeadWear', visor: 'Visor', towel: 'Towel', jerseyStyle: 'OuterShirt', socks: 'InnerSocks',
  gloveLeft: 'LeftHandWear', cleatLeft: 'LeftShoe', wristLeft: 'LeftWristWear', elbowLeft: 'LeftElbowWear',
  shoulderPads: 'Shoulderpads', mouthpiece: 'MouthWear', neckRoll: 'Neckpad', flakJacket: 'FlakJacket',
  handwarmer: 'WaistWear', undershirt: 'InnerShirt', spatLeft: 'LeftSpat', thighLeft: 'LeftThighWear', kneePads: 'KneeWear',
};

let pass = 0, fail = 0;
for (const [slot, slotType] of Object.entries(SLOT_TYPES)) {
  const want = donor.gear[slot];
  if (want == null) continue;
  const got = bySlot[slotType];
  const ok = got === want;
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? 'OK ' : 'FAIL'} ${slot.padEnd(14)} want=${want} got=${got}`);
}
// Facemask (slotless)
const fmOk = bySlot.facemask === donor.gear.facemask;
console.log(`  ${fmOk ? 'OK ' : 'FAIL'} facemask       want=${donor.gear.facemask} got=${bySlot.facemask}`);
if (!fmOk) fail++; else pass++;

console.log(`[verify-gear] ${pass} slots round-tripped, ${fail} mismatches -> ${fail === 0 ? 'PASS' : 'FAIL'}`);
process.exit(fail === 0 ? 0 : 1);
