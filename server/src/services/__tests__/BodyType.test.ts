import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bodyTypeFor } from '../DraftClassBuilder';

const fixed = (x: number) => () => x;

test('body types follow the game\'s own build distribution, not hand thresholds', () => {
  // TEs are never Heavy in the games' classes (236-275 lb are Standard); Witten was 264.
  assert.equal(bodyTypeFor('TE', 264, fixed(0.5)), 'Standard');
  assert.equal(bodyTypeFor('TE', 275, fixed(0.99)), 'Standard');
  assert.equal(bodyTypeFor('TE', 238, fixed(0.1)), 'Muscular');
  // DBs are always Standard; specialists always Thin; EDGE always Muscular; DT always Heavy.
  for (const r of [0.05, 0.5, 0.95]) {
    assert.equal(bodyTypeFor('SS', 215, fixed(r)), 'Standard');
    assert.equal(bodyTypeFor('CB', 190, fixed(r)), 'Standard');
    assert.equal(bodyTypeFor('K', 190, fixed(r)), 'Thin');
    assert.equal(bodyTypeFor('LS', 250, fixed(r)), 'Thin');
    assert.equal(bodyTypeFor('LEDG', 300, fixed(r)), 'Muscular');
    assert.equal(bodyTypeFor('DT', 290, fixed(r)), 'Heavy');
    assert.equal(bodyTypeFor('LG', 300, fixed(r)), 'Heavy');
    assert.equal(bodyTypeFor('WR', 230, fixed(r)), 'Standard');
  }
  // Tackles: Muscular under 305, Heavy from 325; QBs only Heavy when truly huge.
  assert.equal(bodyTypeFor('LT', 300, fixed(0.5)), 'Muscular');
  assert.equal(bodyTypeFor('LT', 330, fixed(0.5)), 'Heavy');
  assert.equal(bodyTypeFor('QB', 240, fixed(0.5)), 'Standard');
  assert.equal(bodyTypeFor('QB', 300, fixed(0.5)), 'Heavy');
  // Backs: Standard under 220, usually Muscular above.
  assert.equal(bodyTypeFor('HB', 205, fixed(0.01)), 'Standard');
  assert.equal(bodyTypeFor('HB', 228, fixed(0.5)), 'Muscular');
});
