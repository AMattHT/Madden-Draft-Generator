import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recomputeBatch } from '../RecomputeService';
import { gameOverall, RATING_KEYS } from '../AttributeModel';

const flat = (v: number) => Object.fromEntries(RATING_KEYS.map((k) => [k, v]));

test('each item comes back with the overall Madden computes from its attributes', () => {
  const items = [
    { id: 1, positionId: 0, archetype: 0, ratings: flat(70) },
    { id: 2, positionId: 3, archetype: 0, ratings: flat(85) },
  ];
  const out = recomputeBatch(items, 'm27');
  assert.equal(out.length, 2);
  for (const [i, it] of items.entries()) {
    const g = gameOverall(it.ratings, it.positionId, it.archetype, 'm27');
    assert.equal(out[i].id, it.id);
    assert.equal(out[i].overall, g.overall);
    assert.equal(out[i].archetype, g.archetype);
  }
});

test('a legacy overall target is honoured by reconciling the attributes first', () => {
  const [r] = recomputeBatch([{ id: 9, positionId: 0, archetype: 0, ratings: flat(60), overall: 80 }], 'm27');
  assert.ok(r.overall != null && Math.abs(r.overall - 80) <= 1, `landed on ${r.overall}`);
});

test('ratings are clamped to 0..99 and non-numbers ignored', () => {
  const ratings = { ...flat(50), speed: 500, awareness: -20, catching: Number.NaN };
  const [r] = recomputeBatch([{ id: 1, positionId: 3, archetype: 0, ratings }], 'm26');
  assert.ok(r.overall != null && r.overall >= 0 && r.overall <= 99);
});
