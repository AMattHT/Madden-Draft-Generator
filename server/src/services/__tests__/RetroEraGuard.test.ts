import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RetroHeadshotService } from '../RetroHeadshotService';
import { PlayerLookupService } from '../PlayerLookupService';

/**
 * A disc photo shows whoever was on that roster. Position alone cannot say
 * whether it is this man: the 1968 linebacker D.D. Lewis and the 2002
 * linebacker D.D. Lewis are both LB, and the photo on the 2005 disc belongs to
 * the second. Nor can era alone, because the discs carry legends teams — Walter
 * Payton (drafted 1975) really is on the 2012 disc.
 *
 * What separates them is whether the player was PLAYING when the disc shipped.
 * If he was, it is him. If he was not, it is only him when he is the kind of
 * player a legends roster carries, and Hall of Fame is the honest test of that.
 */

const find = (first: string, last: string, year: number) =>
  PlayerLookupService.byYear(year).find((p) => p.firstName === first && p.lastName === last);

const photoFor = (first: string, last: string, year: number) => {
  const p = find(first, last, year);
  assert.ok(p, `${first} ${last} (${year}) should be in the class`);
  return RetroHeadshotService.lookup(p!.firstName, p!.lastName, p!.position, p!.draftYear);
};

test('a player is refused a disc photo taken long after he retired', () => {
  // 1968-1981 career; the pack entry is a 2005 disc, and a 2002 linebacker of
  // the same name was playing then.
  assert.equal(photoFor('D.D.', 'Lewis', 1968), null);
  // 1968 tight end against a 2003 disc receiver. Both are the REC group, so the
  // position guard clears him and only the year refuses him.
  assert.equal(photoFor('Steve', 'Smith', 1968), null);
});

test('the man the photo actually belongs to still gets it', () => {
  const lewis = photoFor('D.D.', 'Lewis', 2002);
  assert.ok(lewis, 'the 2002 linebacker was playing when the 2005 disc shipped');
  assert.equal(lewis!.year, 2005);
});

test('legends keep the photo the discs really carry for them', () => {
  // The rule must not simply refuse every old player, or it would strip the
  // legends rosters that are the whole reason era was not used before.
  for (const [first, last, year] of [
    ['Walter', 'Payton', 1975],
    ['Barry', 'Sanders', 1989],
  ] as [string, string, number][]) {
    const hit = photoFor(first, last, year);
    assert.ok(hit, `${first} ${last} is a Hall of Famer on a legends roster`);
    assert.ok(hit!.year > year, 'and his photo comes from a much later disc');
  }
});

test('the guard costs only a small share of real matches', () => {
  let before = 0;
  let after = 0;
  for (const year of PlayerLookupService.years()) {
    for (const p of PlayerLookupService.byYear(year)) {
      if (RetroHeadshotService.lookup(p.firstName, p.lastName, p.position)) before++;
      if (RetroHeadshotService.lookup(p.firstName, p.lastName, p.position, p.draftYear)) after++;
    }
  }
  assert.ok(before > 6000, `expected a large pack coverage, got ${before}`);
  // Measured at 203 of 6,593 (3.1%). A much larger loss would mean the rule had
  // started refusing players who really are on their own disc.
  const lost = before - after;
  assert.ok(lost > 0, 'the guard should refuse the known bad matches');
  assert.ok(
    lost / before < 0.06,
    `guard refused ${lost} of ${before} (${((100 * lost) / before).toFixed(1)}%) — too many to be namesakes`
  );
});
