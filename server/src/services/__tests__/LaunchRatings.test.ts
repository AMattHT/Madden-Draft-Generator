import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../../config/paths';
import { parseLaunchRows, parseLaunchSheet, LaunchRatingsService } from '../LaunchRatingsService';

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

test('older editions: underscored headers, a single Name with no years-pro, and First/Last/OVR/POS', () => {
  const m08 = parseLaunchRows(
    ['First_Name', 'Last_Name', 'Position', 'Jersey_#', 'Overall_Rating', 'Speed', 'Man_Coverage'],
    [['Jeff', 'Saturday', 'C', '63', '96', '58', '29']]
  );
  assert.equal(m08.length, 1);
  assert.equal(m08[0].last, 'Saturday');
  assert.equal(m08[0].ovr, 96);
  assert.equal(m08[0].attrs.speed, 58);
  assert.equal(m08[0].attrs.manCoverage, 29);
  assert.equal(m08[0].yearsPro, null, 'no years-pro column: every row comes back, flagged null');

  const m03 = parseLaunchRows(['Team', 'Position', 'Number', 'Name', 'Overall Rating'], [['Steelers', 'C', '#64', 'Jeff Hartings', '87']]);
  assert.deepEqual([m03[0].first, m03[0].last, m03[0].pos, m03[0].ovr, m03[0].yearsPro], ['Jeff', 'Hartings', 'C', 87, null]);

  const m10 = parseLaunchRows(['Team', 'First', 'Last', 'OVR', 'POS', 'Age', 'College', 'Speed'], [['Steelers', 'A.Q.', 'Shipley  ', '66', 'C', '23', 'Penn State', '70']]);
  assert.deepEqual([m10[0].first, m10[0].last, m10[0].pos, m10[0].ovr, m10[0].college], ['A.Q.', 'Shipley', 'C', 66, 'Penn State']);
});

test('parseLaunchSheet finds the header below a title row', () => {
  const rows = parseLaunchSheet([['Pittsburgh Steelers - Madden NFL 2003'], [], ['Team', 'Position', 'Number', 'Name', 'Overall Rating'], ['Steelers', 'QB', '#7', 'Tommy Maddox', '84']]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].last, 'Maddox');
});

test('Madden 07 team files: PLYR_ prefixes, a single Throw Accuracy fanned out, team captured', () => {
  const rows = parseLaunchRows(
    ['Team', 'PLYR_FIRSTNAME', 'PLYR_LASTNAME', 'Position', 'PLYR_JERSEYNUM', 'PLYR_OVERALLRATING', 'PLYR_SPEED', 'PLYR_THROWPOWER', 'PLYR_THROWACCURACY', 'PLYR_TACKLING'],
    [['Cardinals', 'Matt', 'Leinart', 'QB', '7', '78', '60', '88', '84', '20']]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].last, 'Leinart');
  assert.equal(rows[0].team, 'Cardinals');
  assert.equal(rows[0].ovr, 78);
  assert.equal(rows[0].attrs.speed, 60);
  assert.equal(rows[0].attrs.throwPower, 88);
  assert.equal(rows[0].attrs.throwAccuracyShort, 84);
  assert.equal(rows[0].attrs.throwAccuracyMid, 84);
  assert.equal(rows[0].attrs.throwAccuracyDeep, 84);
  assert.equal(rows[0].attrs.tackle, 20);
});
