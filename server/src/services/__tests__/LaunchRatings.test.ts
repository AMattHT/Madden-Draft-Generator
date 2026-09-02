import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../../config/paths';
import { parseLaunchRows, LaunchRatingsService } from '../LaunchRatingsService';

const hasFile = fs.existsSync(path.join(LOOKUPS_DIR, 'rookie-launch-ratings.json'));
const skipWithoutFile = hasFile ? undefined : { skip: 'rookie-launch-ratings.json not baked' };

test('every header style the editions use yields the same rookie', () => {
  const m24 = parseLaunchRows(
    ['Team', 'Position', 'Full Name', 'Overall Rating', 'Speed', 'Strength', 'BC Vision', 'Press', 'Age', 'Years Pro'],
    [['Texans', 'QB', 'C.J. Stroud', '73', '68', '55', '60', '20', '21', '0'], ['Texans', 'QB', 'Old Vet', '80', '70', '60', '61', '21', '30', '3']]
  );
  const m27 = parseLaunchRows(
    ['Team', 'Position', 'Name', 'OverallRating', 'SpeedRating', 'StrengthRating', 'BCVisionRating', 'PressRating', 'YearsPro'],
    [['Texans', 'QB', 'C.J. Stroud', '73', '68', '55', '60', '20', '0']]
  );
  const m25 = parseLaunchRows(
    ['Team', 'First Name', 'Last Name', 'Position', 'Overall', 'Speed', 'Stength', 'Years Pro'],
    [['Texans', 'C.J.', 'Stroud', 'QB', '73', '68', '55', '0']]
  );
  for (const list of [m24, m27, m25]) {
    assert.equal(list.length, 1);
    assert.equal(list[0].first, 'C.J.');
    assert.equal(list[0].last, 'Stroud');
    assert.equal(list[0].pos, 'QB');
    assert.equal(list[0].ovr, 73);
    assert.equal(list[0].attrs.speed, 68);
    assert.equal(list[0].attrs.strength, 55);
  }
  assert.equal(m24[0].attrs.ballCarrierVision, 60);
  assert.equal(m24[0].attrs.pressCoverage, 20);
  assert.equal(m27[0].attrs.ballCarrierVision, 60);
  assert.equal(m27[0].attrs.pressCoverage, 20);
  assert.equal('overall' in m24[0].attrs, false, 'overall is not an attribute');
});

test('a suffix in the full name lands on the surname and the key ignores it', () => {
  const [r] = parseLaunchRows(['Name', 'Position', 'OverallRating', 'YearsPro'], [['Rueben Bain Jr.', 'LE', '80', '0']]);
  assert.equal(r.first, 'Rueben');
  assert.equal(r.last, 'Bain Jr.');
});

test('the baked file answers Stroud 2023 at 73 and knows which years it covers', skipWithoutFile, () => {
  const e = LaunchRatingsService.get('C.J.', 'Stroud', 2023, 0);
  assert.ok(e, 'Stroud 2023');
  assert.equal(e!.ovr, 73);
  assert.ok(e!.attrs.throwPower && e!.attrs.throwPower > 80, `throw power ${e!.attrs.throwPower}`);
  assert.equal(LaunchRatingsService.hasYear(2023), true);
  assert.equal(LaunchRatingsService.hasYear(1998), false);
  assert.equal(LaunchRatingsService.edition(2023), 24);
  // 2023 has two Byron Youngs, both front-seven: the Rams edge from Tennessee and
  // the Titans lineman from Alabama. College tells them apart; position alone
  // (both mapped to the edge/LB overlap) refuses to guess.
  const rams = LaunchRatingsService.get('Byron', 'Young', 2023, 10, 'Tennessee');
  const titans = LaunchRatingsService.get('Byron', 'Young', 2023, 10, 'Alabama');
  assert.ok(rams && titans, 'both Byron Youngs resolve by college');
  assert.notEqual(rams!.pos, titans!.pos);
  // An unknown college falls back to position group: an edge asks for the LE entry;
  // a DT (neither LE nor LOLB) gets nothing rather than a guess.
  assert.equal(LaunchRatingsService.get('Byron', 'Young', 2023, 10, 'Nowhere State')?.pos, 'LE');
  assert.equal(LaunchRatingsService.get('Byron', 'Young', 2023, 12, 'Nowhere State'), null);
});
