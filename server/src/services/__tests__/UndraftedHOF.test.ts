import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlayerLookupService } from '../PlayerLookupService';

/** ALL_PLAYER_LOOKUP.csv marks Hall of Famers with a '‡' on the surname, and
 *  every one of the 24 marked rows is undrafted (Round "UD").
 *
 *  sanitizeLegendPortraits strips that flag from a 1960+ player with no career
 *  data, on the reasoning that a real HOFer always shows a career and a flagged
 *  row with none is a namesake. That holds for drafted players but not for
 *  undrafted ones: PFR's draft table only records wAV/PB/AP1 for players it
 *  drafted, so an undrafted HOFer's career columns are empty by construction.
 *  The rule was quietly un-flagging 18 genuine Hall of Famers. */

const find = (first: string, last: string, year: number) =>
  PlayerLookupService.byYear(year).find((p) => p.firstName === first && p.lastName === last);

test('undrafted Hall of Famers keep the flag even with no career columns', () => {
  for (const [first, last, year] of [
    ['Donnie', 'Shell', 1974],
    ['Warren', 'Moon', 1978],
    ['Cris', 'Carter', 1987],
    ['John', 'Randle', 1990],
    ['Jan', 'Stenerud', 1967],
    ['Emmitt', 'Thomas', 1966],
    ['Cliff', 'Harris', 1970],
    ['Sam', 'Mills', 1981],
  ] as [string, string, number][]) {
    const p = find(first, last, year);
    assert.ok(p, `${first} ${last} (${year}) should be in the class`);
    assert.equal(p!.isHOF, true, `${first} ${last} should stay flagged`);
    
  }
});

test('a Hall of Fame COACH is not a Hall of Fame player', () => {
  // Tony Dungy and Bill Cowher are in the Hall for coaching, but the CSV's '‡'
  // does not distinguish the two. Coaching success must not inflate a player's
  // rating, so with no playing career on record they lose the flag.
  for (const [first, last, year] of [
    ['Tony', 'Dungy', 1977],
    ['Bill', 'Cowher', 1979],
    // Flores needs the explicit list: he made an AFL All-Star team, so the
    // accolade test would clear him, and his 1959 class is outside the 1960 gate.
    ['Tom', 'Flores', 1959],
  ] as [string, string, number][]) {
    const p = find(first, last, year);
    assert.ok(p, `${first} ${last} should still be in the class`);
    assert.equal(p!.isHOF, false, `${first} ${last} was a coach, not a HOF player`);
  }
});

test('pre-1960 Hall of Fame players keep the flag and rate off their careers', () => {
  for (const [first, last, year] of [
    ['Ed', 'Sprinkle', 1944],
    ['Frank', 'Gatski', 1946],
    ['Lou', 'Groza', 1946],
    ['Len', 'Ford', 1948],
  ] as [string, string, number][]) {
    const p = find(first, last, year);
    assert.ok(p, `${first} ${last} (${year}) should be in the class`);
    assert.equal(p!.isHOF, true, `${first} ${last} was inducted as a player`);
  }
});

test('the drafted namesake the rule exists for is still stripped', () => {
  // The 1969 Hofstra cornerback, round 17 pick 437 -- not the Jim Thorpe.
  const thorpe = find('Jim', 'Thorpe', 1969);
  assert.ok(thorpe, 'the 1969 Jim Thorpe should still be in the class');
  assert.equal(thorpe!.isHOF, false, 'a drafted, careerless, flagged row is a namesake');
  assert.equal(thorpe!.plpo, null, 'and loses the legends portrait with it');
});
