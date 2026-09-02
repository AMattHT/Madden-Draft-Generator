import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skipWithoutData } from './data';
import { M27RookieRatingsService, rookieKey } from '../M27RookieRatingsService';
import { enrichedClass } from '../DraftEnrichment';
import { DraftClassBuilder } from '../DraftClassBuilder';

test('EA\'s Madden 27 launch ratings are baked: 334 rookies with attributes and dev traits', () => {
  assert.equal(M27RookieRatingsService.count(), 334);
  const downs = M27RookieRatingsService.get('Caleb', 'Downs');
  assert.equal(downs?.ovr, 82);
  assert.equal(downs?.pos, 'SS');
  assert.equal(downs?.devTrait, 2, 'Superstar per the dev list');
  assert.equal(downs?.attrs.acceleration, 93);
  assert.equal(downs?.attrs.pressCoverage, downs?.attrs.pressCoverage, 'press maps to pressCoverage');
  assert.ok(Object.keys(downs!.attrs).length >= 50);
  assert.equal(M27RookieRatingsService.get('Rueben', 'Bain Jr.')?.ovr, 80, 'suffixes do not block a match');
  assert.equal(rookieKey('KC', 'Concepcion Jr'), rookieKey('K.C.', 'Concepcion'));
  assert.equal(M27RookieRatingsService.get('Ty', 'Simpson')?.devTrait, 1);
});

test('the 2026 class is rated as Madden 27 ships it', skipWithoutData, async () => {
  const { players } = await enrichedClass(2026, 'NFL', { fill: true });
  const pv = DraftClassBuilder.preview(players, 'madden', {}, 'm27');
  const row = (last: string, first: string) => pv.rows.find((r) => r.lastName === last && r.firstName === first)!;
  const downs = row('Downs', 'Caleb');
  assert.equal(downs.overall, 82);
  assert.equal(downs.devTrait, 2);
  assert.equal(downs.position, 'SS');
  assert.equal(downs.ratings.acceleration, 93);
  assert.equal(row('Love', 'Jeremiyah').overall, 82);
  assert.equal(row('Mendoza', 'Fernando').overall, 74);
  assert.equal(row('Mendoza', 'Fernando').devTrait, 2);
  assert.equal(row('Simpson', 'Ty').devTrait, 1);
  // Nearly every drafted rookie is on EA's list; the rest keep the model.
  const matched = pv.rows.filter((r) => M27RookieRatingsService.get(r.firstName, r.lastName)).length;
  assert.ok(matched >= 240, `${matched} rookies matched EA's list`);
  assert.equal(pv.rows.filter((r) => r.devTrait === 3).length, 0, 'no rookie X-Factor at launch');
});
