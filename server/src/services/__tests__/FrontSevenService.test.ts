import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FrontSevenService } from '../FrontSevenService';
import { BaselinePlayer } from '../../types/player';

function player(first: string, last: string, draftYear: number, over: Partial<BaselinePlayer> = {}): BaselinePlayer {
  return {
    firstName: first, lastName: last, college: '', draftYear, draftRound: 1, draftPick: 10,
    position: 'MLB', jersey: null, league: 'NFL', isHOF: false,
    photoId: null, playerAssetsId: null, commId: null, plpo: null,
    heightInches: null, weight: null, homeState: null, race: null,
    wikiImageUrl: null, pfrImageUrl: null, headshotUrl: null,
    careerFrom: null, careerTo: null, allPro1: null, proBowls: null, seasonsStarted: null,
    wav: null, wavSource: 'predicted', source: 'test', ...over,
  };
}

// Uses the real cached nflverse CSVs in server/cache.
test('Andre Tippett (1982, "MLB" in the source) resolves to an edge by sack rate', () => {
  const r = FrontSevenService.resolve(player('Andre', 'Tippett', 1982), 'NWE');
  assert.equal(r.label, 'DE');
  assert.equal(r.frontSeven?.role, 'EDGE');
  assert.equal(r.frontSeven?.reason, 'sacks');
});

test('Cornelius Bennett (1987 Colts pick, moderate sacks) resolves to an edge via the 3-4 scheme table', () => {
  const r = FrontSevenService.resolve(player('Cornelius', 'Bennett', 1987), 'IND');
  assert.equal(r.label, 'DE');
  assert.equal(r.frontSeven?.reason, '3-4 olb');
});

test('drafting team falls back to nflverse when no pick-team is supplied', () => {
  const r = FrontSevenService.resolve(player('Cornelius', 'Bennett', 1987));
  assert.equal(r.frontSeven?.role, 'EDGE');
  assert.equal(r.frontSeven?.scheme, '3-4');
});

test('a pre-1980 player with no nflverse row gets no label and a null role', () => {
  const r = FrontSevenService.resolve(player('Chuck', 'Bednarik', 1949));
  assert.equal(r.label, null);
  assert.equal(r.frontSeven?.role ?? null, null);
});

test('nflverse DT/NT listing still maps the LB bucket to the interior line', () => {
  // Bill Maas, 1984 Chiefs NT (listed in the source as a front-seven LB bucket for this test)
  const r = FrontSevenService.resolve(player('Bill', 'Maas', 1984), 'KAN');
  assert.equal(r.label, 'DT');
});
