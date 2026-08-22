import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PositionMapper } from '../PositionMapper';

const SAM = 13, MIKE = 14, WILL = 15;
const count = (ids: number[], id: number) => ids.filter((x) => x === id).length;

test('unlocked LB cohort is split toward Madden\'s real mix (30% SAM / 40% MIKE / 30% WILL)', () => {
  const ids = Array(10).fill(MIKE);
  const weights = [220, 225, 230, 232, 235, 238, 240, 245, 250, 255];
  const out = PositionMapper.balanceLbByBuild(ids, weights);
  assert.equal(count(out, SAM), 3);
  assert.equal(count(out, MIKE), 4);
  assert.equal(count(out, WILL), 3);
  // lightest -> WILL, heaviest -> SAM
  assert.equal(out[0], WILL);
  assert.equal(out[9], SAM);
});

test('locked roles count toward the target mix instead of being re-split on top of it', () => {
  // 4 locked MIKEs (3-4 inside backers) + 6 unlocked: the whole cohort should still land ~3/4/3,
  // so the unlocked six become 3 SAM + 3 WILL and no extra MIKEs.
  const ids = [MIKE, MIKE, MIKE, MIKE, MIKE, MIKE, MIKE, MIKE, MIKE, MIKE];
  const locked = [true, true, true, true, false, false, false, false, false, false];
  const weights = [240, 240, 240, 240, 220, 225, 230, 245, 250, 255];
  const out = PositionMapper.balanceLbByBuild(ids, weights, locked);
  assert.deepEqual(out.slice(0, 4), [MIKE, MIKE, MIKE, MIKE]);
  assert.equal(count(out, MIKE), 4);
  assert.equal(count(out, SAM), 3);
  assert.equal(count(out, WILL), 3);
});

test('locked SAM/WILL reduce those quotas; ids outside 13-15 pass through', () => {
  const ids = [10, SAM, WILL, MIKE, MIKE, MIKE, MIKE, 16];
  const locked = [false, true, true, false, false, false, false, false];
  const weights = [270, 250, 225, 228, 236, 244, 252, 200];
  const out = PositionMapper.balanceLbByBuild(ids, weights, locked);
  assert.equal(out[0], 10);
  assert.equal(out[7], 16);
  // 6 LBs -> targets round to 2 SAM / 2 MIKE / 2 WILL; one SAM and one WILL are locked,
  // so the 4 unlocked become 1 WILL (lightest), 2 MIKE, 1 SAM (heaviest).
  assert.equal(out[3], WILL);
  assert.equal(out[6], SAM);
  assert.equal(count(out, MIKE), 2);
});

test('balanceCohortQuota splits unlocked members toward the requested shares, honouring locks', () => {
  const LT = 5, RT = 9;
  const ids = [LT, LT, LT, LT, LT, LT, LT, LT, LT, LT]; // 10 tackles, all arriving as LT
  const out = PositionMapper.balanceCohortQuota(ids, { [LT]: 0.55, [RT]: 0.45 });
  assert.equal(count(out, LT), 6);
  assert.equal(count(out, RT), 4);
  // with 4 locked RTs already, the 6 unlocked should all stay LT (target 5.5 -> 6 LT)
  const ids2 = [RT, RT, RT, RT, LT, LT, LT, LT, LT, LT];
  const locked = [true, true, true, true, false, false, false, false, false, false];
  const out2 = PositionMapper.balanceCohortQuota(ids2, { [LT]: 0.55, [RT]: 0.45 }, locked);
  assert.deepEqual(out2.slice(0, 4), [RT, RT, RT, RT]);
  assert.equal(count(out2, LT), 6);
});

test('pre-2001 defensive backs split corner vs safety by build (no depth charts exist)', () => {
  assert.equal(PositionMapper.dbByBuild('CB', 185, 1985), 'CB');
  assert.equal(PositionMapper.dbByBuild('DB', 203, 1985), 'FS');
  assert.equal(PositionMapper.dbByBuild('DB', 212, 1985), 'SS');
  assert.equal(PositionMapper.dbByBuild('S', 198, 1975), 'FS'); // a generic safety label is never a corner
  assert.equal(PositionMapper.dbByBuild('CB', 198, 1995), 'CB'); // 1990s corners run heavier
  assert.equal(PositionMapper.dbByBuild('WR', 200, 1985), null); // not a DB label
});

test('a 290+ lb defensive end is an interior lineman in Madden terms (3-4 five-technique)', () => {
  assert.equal(PositionMapper.resolve('Calais', 'Campbell', 'DE', 300), 12);
  assert.notEqual(PositionMapper.resolve('Dwight', 'Freeney', 'DE', 268), 12);
});
