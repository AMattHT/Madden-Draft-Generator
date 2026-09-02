import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LikenessService } from '../LikenessService';

test('Madden 27 offers every generic head the game ships, not only the ones its random classes used', () => {
  const byTone = LikenessService.genericHeadsByTone('m27');
  const all = Object.values(byTone).flat();
  assert.ok(all.length >= 262, `only ${all.length} M27 heads`);
  // A head the game ships but never handed to a random rookie, with the item's portrait.
  assert.ok(all.includes('gen_1_B_N_007'));
  assert.equal(LikenessService.genericPid('gen_1_B_N_007', 'm27'), 4062);
  // The random-class mapping still wins where it exists.
  assert.equal(LikenessService.genericPid('gen_2_H_GM_004', 'm27'), 4196);
  // M26 pools are untouched by the M27 item catalog.
  assert.ok(!Object.values(LikenessService.genericHeadsByTone('m26')).flat().includes('gen_1_B_N_007'));
});
