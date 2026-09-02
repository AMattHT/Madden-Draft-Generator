import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { GearImageService } from '../GearImageService';
import { GearOptionsService } from '../GearOptionsService';
import { DATA_ROOT } from '../../config/paths';

const M27_ASSETS: string[] = JSON.parse(
  fs.readFileSync(path.join(DATA_ROOT, 'lookups', 'm27-game-gear-assets.json'), 'utf8'),
);

test('the bundled gear atlas and sprites ship with the server data', () => {
  assert.ok(fs.existsSync(path.join(DATA_ROOT, 'gear', 'gear-atlas.json')));
  assert.ok(GearImageService.available);
});

test('every atlas picture resolves to a bundled sprite file', () => {
  let pictures = 0;
  for (const [category, items] of Object.entries(GearImageService.categories())) {
    for (const it of items) {
      if (!it.image) continue;
      pictures++;
      const file = GearImageService.filePath(it.value);
      assert.ok(file && fs.existsSync(file), `${category}/${it.value} has no sprite on disk`);
    }
  }
  assert.ok(pictures > 500, `only ${pictures} pictures`);
});

test('synthetic slot values find their same-named sprite', () => {
  for (const v of ['Gear_Socks_High', 'Gear_JerseyStyle_SleeveTight', 'Undershirt_Untucked']) {
    assert.ok(GearImageService.has(v), v);
  }
});

test('the Oakley Prizm visor is the asset real rosters use, with its own render', () => {
  const visors = GearImageService.categories().visors.map((v) => v.value);
  assert.ok(visors.includes('GearVisor_visorOakley_Prizm'));
  assert.ok(!visors.includes('G_Visor_Oakley_Prizm'));
  assert.match(GearImageService.filePath('GearVisor_visorOakley_Prizm') ?? '', /visorOakley_Prizm\.png$/);
});

test('Schutt F7 Pro masks are named and in the f7pro family', () => {
  const fm = GearImageService.categories().facemasks.find((f) => f.value === 'GearFaceMask_F7Pro2Bar');
  assert.equal(fm?.label, 'Schutt F7 Pro 2 Bar');
  assert.equal(fm?.compatibility, 'f7pro');
});

test('every gear asset the M27 game assigns is offered with a real name', () => {
  const offered = new Map<string, string>();
  for (const opts of Object.values(GearOptionsService.optionsForYear(2025, 'm27'))) {
    for (const o of opts) offered.set(o.value, o.label);
  }
  const missing: string[] = [];
  for (const asset of M27_ASSETS) {
    if (/_BodyType$/.test(asset)) continue; // not equipment
    const label = offered.get(asset);
    if (!label || label === asset) missing.push(asset);
  }
  assert.deepEqual(missing, []);
});

test('M27 assets with a sprite get a picture in M27 mode', () => {
  const opts = GearOptionsService.optionsForYear(2025, 'm27');
  const all = Object.values(opts).flat();
  const bare = all.filter((o) => !o.image && !/None$|^Era/i.test(o.value) && GearImageService.has(o.value));
  assert.deepEqual(bare.map((o) => o.value), []);
});

test('shoulder pads come in Small, Medium, Large and X-Large with a drawn picture, both games', () => {
  for (const gv of ['m26', 'm27'] as const) {
    const pads = GearOptionsService.optionsForYear(2025, gv).shoulderPads;
    assert.deepEqual(pads.map((p) => p.value).sort(), ['Large_Pads', 'Medium_Pads', 'Small_Pads', 'XLarge_Pads'], gv);
    for (const p of pads) assert.ok(p.image, `${gv} ${p.value} has no picture`);
  }
});

test('the guardian cap is offered with its picture in Madden 27 mode', () => {
  const caps = GearOptionsService.optionsForYear(2025, 'm27').guardianCap;
  const cap = caps.find((c) => c.value === 'GuardianCap_guardianXTsleeve');
  assert.ok(cap?.image, 'guardian cap missing or without picture');
});

test('thigh pads are one slot that dresses both legs, with the game\'s names', () => {
  const { GEAR_SLOT_TYPES, GEAR_SLOTS } = require('../GearOptionsService') as typeof import('../GearOptionsService');
  assert.deepEqual(GEAR_SLOT_TYPES.thighPads, ['LeftThighWear', 'RightThighWear']);
  assert.ok(!GEAR_SLOTS.some((s) => s.slot === 'thighLeft' || s.slot === 'thighRight'));
  // Edits saved before the merge still write.
  assert.deepEqual(GEAR_SLOT_TYPES.thighLeft, ['LeftThighWear']);
  const thigh = GearOptionsService.optionsForYear(2025, 'm27').thighPads.map((t) => `${t.value}=${t.label}`).sort();
  assert.deepEqual(thigh, ['ThighPad_Nike=Honeycomb', 'ThighPad_None=None', 'ThighPad_Regular=Regular']);
});

test('knee pads and towel have an explicit None in Madden 27 mode', () => {
  const o = GearOptionsService.optionsForYear(2025, 'm27');
  assert.ok(o.kneePads.some((k) => k.value === 'KneePad_None'));
  assert.ok(o.towel.some((t) => t.value === 'Towel_None'));
});

test('pants and the waist playcall band are Madden 27 slots that share the game\'s loadout', () => {
  const { slotOfElement, waistConflict, GEAR_SLOT_TYPES } = require('../GearOptionsService') as typeof import('../GearOptionsService');
  const m27 = GearOptionsService.optionsForYear(2025, 'm27');
  assert.deepEqual(m27.pants.map((p) => p.value).sort(), ['GearPants_Standard', 'GearPants_Tapered']);
  assert.ok(m27.playcallBand.some((b) => b.value === 'Waist_PlaycallSheet_Black'));
  const m26 = GearOptionsService.optionsForYear(2025, 'm26');
  assert.ok(!('pants' in m26) && !('playcallBand' in m26), 'M26 has no OuterPants or playcall band');
  assert.deepEqual(GEAR_SLOT_TYPES.pants, ['OuterPants']);
  assert.deepEqual(GEAR_SLOT_TYPES.playcallBand, ['WaistWear']);
  // Reading a loadout routes WaistWear by asset; writing drops the handwarmer when a band is worn.
  assert.equal(slotOfElement('WaistWear', 'Waist_PlaycallSheet_White'), 'playcallBand');
  assert.equal(slotOfElement('WaistWear', 'Handwarmer_Standard'), 'handwarmer');
  assert.equal(slotOfElement('OuterPants', 'GearPants_Tapered'), 'pants');
  assert.equal(slotOfElement('LeftThighWear', 'ThighPad_Nike'), 'thighPads');
  assert.ok(waistConflict({ handwarmer: 'Handwarmer_Standard', playcallBand: 'Waist_PlaycallSheet_Black' }, 'handwarmer'));
  assert.ok(!waistConflict({ handwarmer: 'Handwarmer_Standard', playcallBand: 'Handwarmer_None' }, 'handwarmer'));
});
