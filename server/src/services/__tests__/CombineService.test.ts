import test from 'node:test';
import assert from 'node:assert/strict';
import { surnameMatches } from '../CombineService';

test('surnameMatches: the pick fallback only accepts a row that carries the surname', () => {
  assert.equal(surnameMatches('Tariq Woolen', 'Woolen'), true); // lookup says Riq
  assert.equal(surnameMatches('Odell Beckham Jr.', 'Beckham'), true);
  assert.equal(surnameMatches('Ziggy Hood', 'Hood'), true);
  assert.equal(surnameMatches('Kenneth Moore', 'Smith'), false);
  assert.equal(surnameMatches('Kenneth Moore', ''), false);
});
