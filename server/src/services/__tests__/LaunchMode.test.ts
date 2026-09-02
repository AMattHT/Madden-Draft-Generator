import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { skipWithoutData, HAS_DATA } from './data';
import { LOOKUPS_DIR } from '../../config/paths';
import { enrichedClass } from '../DraftEnrichment';
import { DraftClassBuilder, parseGenMode } from '../DraftClassBuilder';
import { LaunchRatingsService } from '../LaunchRatingsService';

const hasFile = fs.existsSync(path.join(LOOKUPS_DIR, 'rookie-launch-ratings.json'));
const skip = !HAS_DATA ? skipWithoutData : !hasFile ? { skip: 'rookie-launch-ratings.json not baked' } : undefined;

test('parseGenMode accepts the three lenses and defaults to Realistic', () => {
  assert.equal(parseGenMode('launch'), 'launch');
  assert.equal(parseGenMode('retro'), 'retro');
  assert.equal(parseGenMode('madden'), 'madden');
  assert.equal(parseGenMode(undefined), 'madden');
  assert.equal(parseGenMode('nonsense'), 'madden');
});

test('2023 under the Launch Day lens rates Stroud at EA\'s 73 with EA\'s attributes; everyone else is Realistic', skip, async () => {
  const { players } = await enrichedClass(2023, 'NFL', { fill: true });
  const real = DraftClassBuilder.preview(players, 'madden', {}, 'm27');
  const launch = DraftClassBuilder.preview(players, 'launch', {}, 'm27');
  assert.equal(real.launchCount, 0);
  assert.ok(launch.launchCount > 250, `${launch.launchCount} launch rows`);

  const find = (rows: typeof real.rows, last: string, first: string) => rows.find((r) => r.lastName === last && r.firstName === first)!;
  const s = find(launch.rows, 'Stroud', 'C.J.');
  const sReal = find(real.rows, 'Stroud', 'C.J.');
  assert.equal(s.overall, 73);
  assert.equal(s.wavSource, 'launch');
  const e = LaunchRatingsService.get('C.J.', 'Stroud', 2023, 0)!;
  assert.equal(s.ratings.throwPower, e.attrs.throwPower);
  assert.equal(s.ratings.speed, e.attrs.speed);
  // Dev traits are not the launch roster's to decide.
  assert.equal(s.devTrait, sReal.devTrait);
  assert.notEqual(s.overall, sReal.overall, 'the curve rated him differently');

  // A drafted player the launch roster does not name keeps his Realistic rating.
  const i = launch.rows.findIndex((r) => r.wavSource !== 'launch' && r.round != null);
  assert.ok(i >= 0);
  assert.equal(launch.rows[i].overall, real.rows[i].overall);
  assert.equal(launch.rows[i].lastName, real.rows[i].lastName);
});

test('a year with no launch file is Realistic row for row', skip, async () => {
  const { players } = await enrichedClass(1998, 'NFL', { fill: true });
  const real = DraftClassBuilder.preview(players, 'madden', {}, 'm27');
  const launch = DraftClassBuilder.preview(players, 'launch', {}, 'm27');
  assert.equal(launch.launchCount, 0);
  assert.deepEqual(launch.rows.map((r) => r.overall), real.rows.map((r) => r.overall));
  assert.deepEqual(launch.rows.map((r) => r.devTrait), real.rows.map((r) => r.devTrait));
});

test('the export builds under the Launch Day lens', skip, async () => {
  const { players } = await enrichedClass(2026, 'NFL', { fill: true });
  const out = DraftClassBuilder.buildMdc27(players, undefined, 'launch', undefined, {});
  assert.equal(out.count, players.length > 402 ? 402 : players.length);
});
