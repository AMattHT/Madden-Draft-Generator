import test from 'node:test';
import assert from 'node:assert/strict';
import { fortySpeedFloor } from '../AttributeModel';

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
