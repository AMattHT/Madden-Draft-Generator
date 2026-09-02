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
