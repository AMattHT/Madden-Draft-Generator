import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { EraGearService } from '../EraGearService';
import { LOOKUPS_DIR } from '../../config/paths';

const VALID = new Set<string>(JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'm27-game-gear-assets.json'), 'utf8')));
const assets = (els: Array<{ itemAssetName: string }>) => els.map((e) => e.itemAssetName);

test('every asset an M27 loadout writes exists in the M27 game vocabulary (1965, 1987, 2003, 2024)', () => {
  for (const year of [1965, 1987, 2003, 2024]) {
    for (const pos of [0, 3, 5, 10, 16, 19]) {
      for (let i = 0; i < 6; i++) {
        const bad = assets(EraGearService.loadoutElements(year, pos, `seed-${year}-${pos}-${i}`, 'm27')).filter((a) => !VALID.has(a));
        assert.deepEqual(bad, [], `${year} pos ${pos} seed ${i} wrote assets M27 does not have: ${bad.join(', ')}`);
      }
    }
  }
});

test('vintage helmets map to the oldest surviving M27 shell instead of a dead asset', () => {
  const els = EraGearService.loadoutElements(1965, 5, 'tk-seed', 'm27');
  const helmet = els.find((e) => e.slotType === 'HeadWear')?.itemAssetName;
  assert.equal(helmet, 'GearHelmet_AirXP');
  const m26 = EraGearService.loadoutElements(1965, 5, 'tk-seed', 'm26');
  assert.equal(m26.find((e) => e.slotType === 'HeadWear')?.itemAssetName, 'GearHelmet_RiddellTK'); // M26 untouched
});

test('M27 modern brackets use the verified M27 helmet pools, not the M26 timeline', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) seen.add(EraGearService.loadoutElements(2005, 3, `h${i}`, 'm27').find((e) => e.slotType === 'HeadWear')!.itemAssetName);
  assert.ok(!seen.has('GearHelmet_Standard') && !seen.has('GearHelmet_Schutt'), [...seen].join(','));
  assert.ok(seen.has('GearHelmet_Revolution') || seen.has('GearHelmet_AirXP'));
});
