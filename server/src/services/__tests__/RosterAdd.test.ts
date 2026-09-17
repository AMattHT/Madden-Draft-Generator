import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RosterAddService } from '../RosterAddService';
import { RATING_KEYS } from '../AttributeModel';

test('a pool player is rated for a roster with bio, ratings, face, gear and persona', async () => {
  const p = await RosterAddService.generate('1975|NFL|walter|payton|4');
  assert.equal(p.firstName, 'Walter'); assert.equal(p.lastName, 'Payton');
  assert.equal(p.position, 'HB'); assert.equal(p.positionId, 1);
  assert.ok(p.overall >= 85, `career-lens overall ${p.overall}`);
  assert.ok(p.age >= 22 && p.age <= 40); assert.equal(p.yearsPro, 4);
  assert.ok(p.heightInches > 60 && p.weight > 150);
  for (const k of RATING_KEYS) assert.ok(p.ratings[k] >= 0 && p.ratings[k] <= 99, k);
  assert.ok(p.genericHead.startsWith('gen_'), 'a tone-matched generic head is always present');
  assert.ok(p.skinTone >= 1 && p.skinTone <= 8);
  assert.ok(['Standard', 'Thin', 'Lean', 'Muscular', 'Heavy'].includes(p.bodyType));
  assert.ok(p.gear.helmet, 'a helmet');
  assert.ok(p.personaDNA.length >= 1 && p.personaDNA.length <= 5);
  assert.ok(p.focus >= 0 && p.focus <= 3);
  assert.equal(p.draftYear, 1975); assert.equal(p.draftRound, 1);
  assert.ok(p.commentaryId >= 0);
  assert.equal(p.college, 'Jackson State');
});

test('generation is cached per key and unknown keys are refused', async () => {
  const a = await RosterAddService.generate('1989|NFL|barry|sanders|3');
  const b = await RosterAddService.generate('1989|NFL|barry|sanders|3');
  assert.equal(a, b, 'same object from the cache');
  await assert.rejects(RosterAddService.generate('1900|NFL|nobody|here|1'), /not in the pool/);
});
