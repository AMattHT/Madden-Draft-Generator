import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PositionMapper } from '../PositionMapper';
import { PlayerLookupService } from '../PlayerLookupService';
import { RosterAddService } from '../RosterAddService';
import { PoolCatalogService } from '../PoolCatalogService';
import { skipWithoutData } from './data';
import { enrichedClass } from '../DraftEnrichment';
import { DraftClassBuilder } from '../DraftClassBuilder';
import { DbPositionService } from '../DbPositionService';

test('overlapping catalog requests retain their own position-data readiness', async t => {
  PoolCatalogService._reset();
  let ready = false;
  t.mock.method(DbPositionService, 'isReady', () => ready);
  const first = PoolCatalogService.snapshot();
  ready = true;
  const second = PoolCatalogService.snapshot();
  const [provisional, final] = await Promise.all([first, second]);
  assert.equal(provisional.degraded, true);
  assert.equal(final.degraded, false);
  assert.equal(provisional.players.length, final.players.length);
  PoolCatalogService._reset();
});

test('a board of "LE" ends splits evenly between LEDG and REDG, and a pinned one never moves', () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ firstName: `A${i}`, lastName: 'End', weight: 260 }));
  const ids = items.map((p) => PositionMapper.resolve(p.firstName, p.lastName, 'LE', p.weight));
  assert.ok(ids.every((id) => id === 10), 'the raw label is always LEDG');
  const out = PositionMapper.balanceBoard(ids, items);
  assert.equal(out.filter((id) => id === 10).length, 5);
  assert.equal(out.filter((id) => id === 11).length, 5);
  const pinned = items.map((_, i) => i === 0);
  const withPin = PositionMapper.balanceBoard(ids.map((id, i) => (i === 0 ? 11 : id)), items, pinned);
  assert.equal(withPin[0], 11, 'the pinned REDG stays');
});

test('the pool shares entry-year draft positions and preserves a balanced edge population', skipWithoutData, async () => {
  const cat = await PoolCatalogService.balanced();
  for (const year of [1950, 1965, 1976, 1989, 2003, 2013, 2023]) {
    const { players } = await enrichedClass(year, year === 1965 ? 'combined' : 'NFL', { fill: true });
    const preview = DraftClassBuilder.preview(players, 'retro', {}, 'm27');
    for (const row of preview.rows) {
      const key = players[row.srcIdx].key;
      if (!key) continue;
      assert.equal(cat.find(p => p.key === key)?.mpos, row.position, key);
    }
  }
  const edges = cat.filter(p => p.grp === 'EDGE');
  const redg = edges.filter(p => p.mpos === 'REDG').length / edges.length;
  assert.ok(redg > 0.4 && redg < 0.6, `REDG share ${redg.toFixed(2)}`);
});

test('a roster add gets the same entry-year slot the pool showed', skipWithoutData, async () => {
  const cat = await PoolCatalogService.balanced();
  const r = cat.find((p) => p.mpos === 'REDG' && p.hof);
  assert.ok(r, 'a Hall of Fame REDG in the pool');
  const g = await RosterAddService.generate(r!.key);
  assert.equal(g.position, 'REDG');
  assert.equal(g.positionId, 11);
});
