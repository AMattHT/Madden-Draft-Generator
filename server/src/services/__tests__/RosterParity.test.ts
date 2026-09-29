import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlayerLookupService } from '../PlayerLookupService';
import { PoolCatalogService } from '../PoolCatalogService';
import { enrichedClass } from '../DraftEnrichment';
import { DraftClassBuilder, RATING_KEYS } from '../DraftClassBuilder';
import { RosterAddService } from '../RosterAddService';
import { RatingService } from '../RatingService';

test('pool career data and positions agree with enriched draft data, including Romo and Polamalu', async () => {
  const pool = await PoolCatalogService.balanced();
  const { players } = await enrichedClass(2003, 'NFL', { fill: true });
  const romo = players.find(p => p.firstName === 'Tony' && p.lastName === 'Romo')!;
  assert.equal(romo.wav, 95, 'PFR career wAV, not the empty lookup-row estimate');
  for (const p of players.filter(p => p.key)) {
    const row = pool.find(r => r.key === p.key)!;
    assert.ok(row, p.key);
    assert.equal(row.wav, p.wavSource === 'predicted' ? RatingService.predictedWav(p) : p.wav, `${p.key}: career wAV`);
    assert.equal(row.pb, p.proBowls ?? 0, `${p.key}: Pro Bowls`);
    assert.equal(row.ap1, p.allPro1 ?? 0, `${p.key}: All-Pro`);
  }
  assert.equal(pool.find(p => p.first === 'Troy' && p.last === 'Polamalu')?.mpos, 'SS');
});

test('roster Career and Realistic match the entry-year draft ratings and positions', async () => {
  let checked = 0;
  for (const year of PlayerLookupService.years()) {
    const { players } = await enrichedClass(year, year >= 1960 && year <= 1966 ? 'combined' : 'NFL', { fill: true });
    for (const mode of ['retro', 'madden'] as const) {
      const preview = DraftClassBuilder.preview(players, mode, {}, 'm27');
      // A whole draft across QB, safety, line, specialist and other positions.
      for (const row of preview.rows.filter(r => players[r.srcIdx].key)) {
        const key = players[row.srcIdx].key!;
        const actual = await RosterAddService.generate(key, mode);
        checked++;
        assert.equal(actual.positionId, row.positionId, `${key} ${mode}: position`);
        assert.equal(actual.overall, row.overall, `${key} ${mode}: overall`);
        assert.equal(actual.devTrait, row.devTrait, `${key} ${mode}: development`);
        for (const rating of RATING_KEYS) assert.equal(actual.ratings[rating], row.ratings[rating], `${key} ${mode}: ${rating}`);
      }
    }
  }
  assert.ok(checked > 40000, `checked ${checked} player/lens combinations`);
  console.log(`Matched ${checked} player/lens combinations to their entry-year drafts.`);
});

test('lens-specific cache and forced inclusion keep every pool player available', async () => {
  const key = PlayerLookupService.catalog().find(p => p.first === 'Tony' && p.last === 'Romo')!.key;
  const career = await RosterAddService.generate(key, 'retro');
  const rookie = await RosterAddService.generate(key, 'madden');
  assert.notEqual(career.overall, rookie.overall);
  assert.equal(await RosterAddService.generate(key), career, 'old saved rosters default to Career');
  const { players } = await enrichedClass(1976, 'NFL', { fill: true });
  const dropped = DraftClassBuilder.preview(players, 'madden', {}, 'm27').dropped[0];
  assert.ok(dropped);
  const p = players[dropped.idx];
  const expected = DraftClassBuilder.preview(players, 'madden', { include: [dropped.idx] }, 'm27').rows.find(r => r.srcIdx === dropped.idx)!;
  const actual = await RosterAddService.generate(p.key!, 'madden');
  assert.equal(actual.overall, expected.overall);
  assert.equal(actual.positionId, expected.positionId);
});
