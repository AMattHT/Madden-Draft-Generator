import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlayerLookupService } from '../PlayerLookupService';
import { NflverseCareerService } from '../NflverseCareerService';

/** ALL_PLAYER_LOOKUP.csv split 86 multi-word surnames onto the wrong field --
 *  `Last="Noy", First="Kyle Van"`. Concatenated the name still reads correctly,
 *  so it stayed invisible; but every cross-source match failed, because
 *  nflverse keys him `kyle|vannoy` and this file yielded `kylevan|noy`. */

const find = (first: string, last: string, year: number) =>
  PlayerLookupService.byYear(year).find(
    (p) => p.firstName.toLowerCase() === first.toLowerCase()
        && p.lastName.toLowerCase() === last.toLowerCase());

test('a particle that rode along on the first name moves back to the surname', () => {
  for (const [first, last, year] of [
    ['Kyle', 'Van Noy', 2014],
    ['Leighton', 'Vander Esch', 2018],
    ['Kyle', 'Vanden Bosch', 2001],
    ['Amon-Ra', 'St. Brown', 2021],
    ['Norm', 'Van Brocklin', 1949],
    ['Steve', 'Van Buren', 1944],
  ] as [string, string, number][]) {
    assert.ok(find(first, last, year), `${first} ${last} (${year}) should resolve`);
  }
});

test('the mirror split, where the particle was left alone as the surname', () => {
  assert.ok(find('Antwaan', 'Randle El', 2002), 'Randle El arrived as First="Antwaan Randle", Last="El"');
});

test('an ordinary two-word first name is left alone', () => {
  // "Randle" is not a particle, so Sonny Randle must keep his own surname.
  assert.ok(find('Sonny', 'Randle', 1958));
  assert.equal(find('Kyle', 'Noy', 2014), undefined, 'the broken form must be gone');
});

test('repaired names now reach their nflverse headshot', () => {
  for (const [first, last, year] of [
    ['Kyle', 'Van Noy', 2014],
    ['Kyle', 'Vanden Bosch', 2001],
    ['Antwaan', 'Randle El', 2002],
    ['John', 'St. Clair', 2000],
  ] as [string, string, number][]) {
    const p = find(first, last, year)!;
    const bits = NflverseCareerService.get(p.firstName, p.lastName, year, p.draftPick);
    assert.ok(bits?.headshotUrl, `${first} ${last} should have a headshot`);
  }
});

test('nflverse is indexed by the formal name too, not just display_name', () => {
  // players.csv leads with "Matt Bosher" / "Mike Person"; draft_picks (and this
  // project) use the formal "Matthew" / "Michael".
  for (const [first, last, year] of [
    ['Matthew', 'Bosher', 2011],
    ['Michael', 'Person', 2011],
    ['Olusegun', 'Oluwatimi', 2023],
  ] as [string, string, number][]) {
    const bits = NflverseCareerService.get(first, last, year);
    assert.ok(bits?.headshotUrl, `${first} ${last} should resolve through his formal name`);
  }
});
