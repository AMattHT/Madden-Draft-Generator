import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyFrontSeven, FrontSevenInput } from '../FrontSevenClassifier';

/** Fixture helper: an LB-bucket player with nothing known unless overridden. */
function lb(over: Partial<FrontSevenInput>): FrontSevenInput {
  return {
    label: 'MLB',
    draftYear: 1985,
    sacks: null,
    ints: null,
    seasonsStarted: null,
    games: null,
    scheme: null,
    weight: null,
    pffPosition: null,
    nvPosition: null,
    ...over,
  };
}

// --- PFF era: pff_position is authoritative ---------------------------------

test('pff_position ED is an edge even with modest sacks', () => {
  const r = classifyFrontSeven(lb({ draftYear: 2012, pffPosition: 'ED', sacks: 20, seasonsStarted: 6, scheme: '4-3' }));
  assert.equal(r.role, 'EDGE');
  assert.equal(r.reason, 'pff');
});

test('pff_position LB vetoes an edge verdict even on a 3-4 team', () => {
  const r = classifyFrontSeven(lb({ draftYear: 2012, pffPosition: 'LB', sacks: 30, seasonsStarted: 6, scheme: '3-4' }));
  assert.notEqual(r.role, 'EDGE');
});

// --- Sacks rate -------------------------------------------------------------

test('>= 6 sacks per starting season is an edge regardless of scheme (Andre Tippett: 100 in 10)', () => {
  const r = classifyFrontSeven(lb({ draftYear: 1982, sacks: 100, ints: 1, seasonsStarted: 10, scheme: '3-4' }));
  assert.equal(r.role, 'EDGE');
  assert.equal(r.reason, 'sacks');
});

test('high sack rate on a 4-3 team is still an edge (Cliff Avril: 74 in 7, listed LB)', () => {
  const r = classifyFrontSeven(lb({ draftYear: 2008, sacks: 74, ints: 1, seasonsStarted: 7, scheme: '4-3' }));
  assert.equal(r.role, 'EDGE');
});

test('sack rate needs enough starting seasons to count (2 sacks in 1 season is noise)', () => {
  const r = classifyFrontSeven(lb({ draftYear: 1990, sacks: 7, seasonsStarted: 1, games: 20, scheme: '4-3' }));
  assert.notEqual(r.role, 'EDGE');
});

test('games fill in for missing seasons_started when computing the rate', () => {
  // 60 sacks over 96 games (~6 seasons) = 10/yr
  const r = classifyFrontSeven(lb({ draftYear: 1990, sacks: 60, seasonsStarted: null, games: 96, scheme: '4-3' }));
  assert.equal(r.role, 'EDGE');
});

// --- Scheme resolves the ambiguous band ------------------------------------

test('3-4 team + moderate sacks is a 3-4 OLB -> edge (Cornelius Bennett 71.5 in 14, Bills)', () => {
  const r = classifyFrontSeven(lb({ draftYear: 1987, sacks: 71.5, ints: 7, seasonsStarted: 14, scheme: '3-4' }));
  assert.equal(r.role, 'EDGE');
  assert.equal(r.reason, '3-4 olb');
});

test('4-3 team + moderate sacks is a blitzing strongside backer (Otis Wilson 38 in 7, Bears)', () => {
  const r = classifyFrontSeven(lb({ draftYear: 1980, sacks: 38, ints: 10, seasonsStarted: 7, scheme: '4-3' }));
  assert.equal(r.role, 'SAM');
});

test('3-4 team + low sacks is an inside backer -> MIKE (Harry Carson-type ILB)', () => {
  const r = classifyFrontSeven(lb({ draftYear: 1984, sacks: 10, ints: 5, seasonsStarted: 10, scheme: '3-4' }));
  assert.equal(r.role, 'MIKE');
  assert.equal(r.reason, '3-4 ilb');
});

test('unknown scheme + moderate sacks + few picks leans edge; with many picks leans off-ball', () => {
  const edge = classifyFrontSeven(lb({ draftYear: 1990, sacks: 33, ints: 1, seasonsStarted: 6, scheme: null }));
  assert.equal(edge.role, 'EDGE');
  const off = classifyFrontSeven(lb({ draftYear: 1986, sacks: 52, ints: 24, seasonsStarted: 11, scheme: null })); // Seth Joyner
  assert.notEqual(off.role, 'EDGE');
});

// --- Interceptions pick out coverage backers --------------------------------

test('interception-heavy, lighter backer is a WILL (Jack Ham: 32 INT, 225 lb)', () => {
  const r = classifyFrontSeven(lb({ draftYear: 1971, ints: 32, sacks: 25, seasonsStarted: 11, weight: 225, scheme: '4-3' }));
  assert.equal(r.role, 'WILL');
  assert.equal(r.reason, 'coverage');
});

test('interception-heavy but heavy backer is not forced to WILL', () => {
  const r = classifyFrontSeven(lb({ draftYear: 1984, ints: 23, sacks: 45, seasonsStarted: 10, weight: 250, scheme: '4-3' })); // Wilber Marshall
  assert.notEqual(r.role, 'WILL');
});

// --- Pre-1972: no 3-4 existed ------------------------------------------------

test('nobody drafted before 1972 is an edge, whatever the sacks field says', () => {
  const r = classifyFrontSeven(lb({ draftYear: 1965, sacks: 60, seasonsStarted: 8, scheme: '4-3', weight: 250 }));
  assert.notEqual(r.role, 'EDGE');
});

// --- nflverse position text for the 1970s ------------------------------------

test('nflverse OLB on a 3-4 team with no stats is an edge; ILB/MLB is a MIKE', () => {
  const olb = classifyFrontSeven(lb({ draftYear: 1975, nvPosition: 'OLB', scheme: '3-4' }));
  assert.equal(olb.role, 'EDGE');
  assert.equal(olb.reason, '3-4 olb');
  const ilb = classifyFrontSeven(lb({ draftYear: 1975, nvPosition: 'ILB', scheme: '3-4' }));
  assert.equal(ilb.role, 'MIKE');
});

test('nflverse MLB on a 4-3 team with no stats is a MIKE', () => {
  const r = classifyFrontSeven(lb({ draftYear: 1975, nvPosition: 'MLB', scheme: '4-3' }));
  assert.equal(r.role, 'MIKE');
});

// --- No signal at all --------------------------------------------------------

test('no usable signal returns null role (left to the build-based LB split)', () => {
  const r = classifyFrontSeven(lb({ draftYear: 1955 }));
  assert.equal(r.role, null);
  assert.equal(r.lock, false);
});

test('edge and explicit sub-role verdicts are locked; fallbacks are not', () => {
  assert.equal(classifyFrontSeven(lb({ draftYear: 1982, sacks: 100, seasonsStarted: 10 })).lock, true);
  assert.equal(classifyFrontSeven(lb({ draftYear: 1984, sacks: 10, seasonsStarted: 10, scheme: '3-4' })).lock, true);
});

test('a 3-4 draftee with no stats but an edge-sized build is a low-confidence edge', () => {
  const r = classifyFrontSeven(lb({ draftYear: 1984, scheme: '3-4', weight: 252 }));
  assert.equal(r.role, 'EDGE');
  assert.equal(r.reason, '3-4 build');
  assert.equal(r.lock, false);
});
