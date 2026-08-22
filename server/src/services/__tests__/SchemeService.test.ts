import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SchemeService } from '../SchemeService';

test('Steelers are a 3-4 from 1982 on, 4-3 before', () => {
  assert.equal(SchemeService.baseDefense('PIT', 1981), '4-3');
  assert.equal(SchemeService.baseDefense('PIT', 1982), '3-4');
  assert.equal(SchemeService.baseDefense('PIT', 2024), '3-4');
});

test('nothing is a 3-4 before 1972', () => {
  assert.equal(SchemeService.baseDefense('MIA', 1968), '4-3');
  assert.equal(SchemeService.baseDefense('NE', 1971), '4-3');
});

test('historical nflverse codes resolve by season (BAL = Colts pre-1996, Ravens after)', () => {
  assert.equal(SchemeService.baseDefense('BAL', 1985), '3-4'); // Colts under Frank Kush / Ron Meyer
  assert.equal(SchemeService.baseDefense('BAL', 1997), '4-3'); // early Ravens
  assert.equal(SchemeService.baseDefense('BAL', 2010), '3-4'); // Ravens
  assert.equal(SchemeService.baseDefense('IND', 2015), '3-4'); // Pagano Colts
});

test('current-franchise aliases used by nflverse players.csv map to the same franchise', () => {
  assert.equal(SchemeService.baseDefense('LV', 1985), SchemeService.baseDefense('RAI', 1985));
  assert.equal(SchemeService.baseDefense('GB', 1990), SchemeService.baseDefense('GNB', 1990));
  assert.equal(SchemeService.baseDefense('NE', 1982), SchemeService.baseDefense('NWE', 1982));
  assert.equal(SchemeService.baseDefense('LA', 1985), SchemeService.baseDefense('RAM', 1985));
});

test('unknown code returns null rather than guessing', () => {
  assert.equal(SchemeService.baseDefense('XXX', 1990), null);
  assert.equal(SchemeService.baseDefense('', 1990), null);
});

test('majority scheme over a span (a player\'s early career on the drafting team)', () => {
  // Giants: 3-4 1981-1992, 4-3 from 1993. Drafted 1990, span 1990-1994 -> 3-4 majority.
  assert.equal(SchemeService.dominant('NYG', 1990, 1994), '3-4');
  // Drafted 1992, span 1992-1996 -> 4-3 majority.
  assert.equal(SchemeService.dominant('NYG', 1992, 1996), '4-3');
});
