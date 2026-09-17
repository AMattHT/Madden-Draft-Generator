import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchTeams, type PickTeam } from './teamMatch';

const T: PickTeam[] = [
  { id: 1, abbr: 'SEA', name: 'Seattle Seahawks' },
  { id: 2, abbr: 'SF', name: 'San Francisco 49ers' },
  { id: 3, abbr: 'NYG', name: 'New York Giants' },
  { id: 4, abbr: 'NYJ', name: 'New York Jets' },
  { id: 5, abbr: 'KC', name: 'Kansas City Chiefs' },
  { id: 6, abbr: 'LAC', name: 'Los Angeles Chargers' },
  { id: 7, abbr: 'LAR', name: 'Los Angeles Rams' },
  { id: 1009, abbr: 'FA', name: 'Free agents' },
];
const ids = (q: string) => matchTeams(T, q).map((t) => t.id);

test('typing a city, a nickname or an abbreviation finds the team', () => {
  assert.deepEqual(ids('seattle'), [1]);
  assert.deepEqual(ids('san fran'), [2]);
  assert.deepEqual(ids('49'), [2]);
  assert.deepEqual(ids('giants'), [3]);
  assert.deepEqual(ids('kc'), [5]);
  assert.deepEqual(ids('ny'), [3, 4], 'both New York clubs, alphabetical');
  assert.deepEqual(ids('ny j'), [4]);
  assert.deepEqual(ids('la r'), [7]);
  assert.deepEqual(ids('free'), [1009]);
  assert.deepEqual(ids('boston'), []);
});

test('empty input lists every team up to the limit', () => {
  assert.equal(matchTeams(T, '').length, T.length);
  assert.equal(matchTeams(T, '  ', 3).length, 3);
});
