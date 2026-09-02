import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skipWithoutData } from './data';
import { boardClass, pickedClass, validateCustomPlayer, type CustomPlayerSpec } from '../DraftEnrichment';
import { DraftClassBuilder, RATING_KEYS } from '../DraftClassBuilder';
import { PlayerLookupService } from '../PlayerLookupService';
import { CalibrationService } from '../CalibrationService';

const prospect = (over: Partial<CustomPlayerSpec> = {}): CustomPlayerSpec => ({
  id: 'p1', firstName: 'Test', lastName: 'Prospect', position: 'QB', college: 'Nowhere State',
  heightInches: 75, weight: 222, age: 22, jersey: 7, overall: 77, devTrait: 2, archetype: null, skinTone: 3, ...over,
});

test('a custom player is checked before anything is built', () => {
  assert.equal(validateCustomPlayer(prospect()), null);
  assert.match(validateCustomPlayer(prospect({ firstName: '' })) ?? '', /name/);
  assert.match(validateCustomPlayer(prospect({ position: 'DE' })) ?? '', /position/);
  assert.match(validateCustomPlayer(prospect({ overall: 30 })) ?? '', /overall/);
  assert.match(validateCustomPlayer(prospect({ devTrait: 5 })) ?? '', /dev trait/);
  assert.match(validateCustomPlayer(null) ?? '', /missing/);
});

test('a board keeps its order as the pick order, real players and custom ones alike', skipWithoutData, async () => {
  const pool = PlayerLookupService.byYear(1998, 'NFL').filter((p) => p.draftRound != null).slice(0, 5);
  const keys = pool.map((p) => p.key!);
  const board = [{ key: keys[3] }, { custom: prospect() }, { key: keys[0] }, { key: keys[4] }];
  const { players, generatedCount } = await boardClass(board, { fill: false });
  assert.equal(generatedCount, 0);
  assert.deepEqual(players.map((p) => p.key), [keys[3], 'custom:p1', keys[0], keys[4]]);
  const pv = DraftClassBuilder.preview(players, 'madden', {}, 'm27');
  assert.deepEqual(pv.rows.map((r) => `${r.firstName} ${r.lastName}`), players.map((p) => `${p.firstName} ${p.lastName}`));
  assert.equal(pv.rows[1].pick, 2);
});

test('a custom prospect exports with his chosen overall, position, archetype and dev trait', skipWithoutData, async () => {
  const qbArch = CalibrationService.archetypeOptions().QB.find((a) => a.name === 'Improviser')!;
  const { players } = await boardClass([{ custom: prospect({ archetype: qbArch.id }) }, { custom: prospect({ id: 'p2', firstName: 'Big', lastName: 'Tackle', position: 'LT', heightInches: 78, weight: 318, overall: 68, devTrait: 0 }) }], { fill: true });
  assert.equal(players.length, 402, 'padded to a full class');
  const pv = DraftClassBuilder.preview(players, 'madden', {}, 'm27');
  const qb = pv.rows[0];
  assert.equal(qb.firstName, 'Test');
  assert.equal(qb.position, 'QB');
  assert.equal(qb.overall, 77);
  assert.equal(qb.devTrait, 2);
  assert.equal(qb.archetypeName, 'Improviser');
  assert.equal(qb.jersey, 7);
  assert.ok(RATING_KEYS.every((k) => Number.isFinite(qb.ratings[k]) && qb.ratings[k] > 0), 'every attribute generated');
  assert.ok(qb.ratings.throwPower >= 70, `a 77 QB throws it: ${qb.ratings.throwPower}`);
  const lt = pv.rows[1];
  assert.equal(lt.position, 'LT');
  assert.equal(lt.overall, 68);
  assert.equal(lt.devTrait, 0);
  // The whole class still writes for both games.
  const m27 = DraftClassBuilder.buildMdc27(players, undefined, 'madden');
  assert.ok(m27.buffer.length > 0);
  const m26 = DraftClassBuilder.buildMdc(players, undefined, 'madden');
  assert.ok(m26.buffer.length > 0);
});

test('a 1.2.0 saved class (a list of keys) still builds, in that order', skipWithoutData, async () => {
  const keys = PlayerLookupService.byYear(2003, 'NFL').filter((p) => p.draftRound != null).slice(0, 3).map((p) => p.key!);
  const { players } = await pickedClass([keys[2], keys[0], keys[1]], { fill: false });
  assert.deepEqual(players.map((p) => p.key), [keys[2], keys[0], keys[1]]);
});
