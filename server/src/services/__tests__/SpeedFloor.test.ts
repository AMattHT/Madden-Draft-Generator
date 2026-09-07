import test from 'node:test';
import assert from 'node:assert/strict';
import { fortySpeedFloor, qbRushPercentile } from '../AttributeModel';

test('fortySpeedFloor: elite 40 times earn an absolute speed floor, ordinary ones none', () => {
  assert.equal(fortySpeedFloor(4.21), 99); // Xavier Worthy
  assert.equal(fortySpeedFloor(4.26), 98); // Tariq Woolen
  assert.equal(fortySpeedFloor(4.30), 97);
  assert.equal(fortySpeedFloor(4.40), 94);
  assert.equal(fortySpeedFloor(4.50), 90);
  assert.equal(fortySpeedFloor(4.51), null);
  assert.equal(fortySpeedFloor(4.15), 99);
  assert.equal(fortySpeedFloor(NaN), null);
});

test('qbRushPercentile: career rushing places an untested quarterback, per era', () => {
  const c = (rushYards: number, games: number) => ({ rushYards, games } as never);
  const lamar = qbRushPercentile(c(6519, 116), 2018)!;
  const caleb = qbRushPercentile(c(877, 34), 2024)!;
  const penix = qbRushPercentile(c(81, 14), 2024)!;
  assert.ok(lamar > 0.99 && caleb > 0.85 && caleb < 0.9 && penix > 0.25 && penix < 0.35, `${lamar} ${caleb} ${penix}`);
  // Cunningham's 30.6 a game is the top of his era, only the 91st percentile of this one.
  assert.ok(qbRushPercentile(c(4928, 161), 1985)! > 0.99);
  assert.ok(qbRushPercentile(c(4928, 161), 2005)! < 0.93);
  assert.equal(qbRushPercentile(c(100, 4), 2024), null); // too few games
  assert.equal(qbRushPercentile(null, 2024), null);
});
