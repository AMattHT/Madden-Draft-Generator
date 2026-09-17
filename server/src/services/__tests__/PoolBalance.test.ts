import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PositionMapper } from '../PositionMapper';
import { PlayerLookupService } from '../PlayerLookupService';
import { RosterAddService } from '../RosterAddService';
import { PoolCatalogService } from '../PoolCatalogService';
import { skipWithoutData } from './data';

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

test('the pool is balanced like a class, club by club: every club splits its edges evenly', skipWithoutData, async () => {
  const cat = await PoolCatalogService.balanced();
  const byClub = new Map<string, typeof cat>();
  for (const p of cat) { const k = p.team?.name ?? ''; if (!byClub.has(k)) byClub.set(k, []); byClub.get(k)!.push(p); }
  for (const [club, l] of byClub) {
    const L = l.filter((p) => p.mpos === 'LEDG').length, R = l.filter((p) => p.mpos === 'REDG').length;
    assert.ok(Math.abs(L - R) <= 1, `${club || 'unassigned'}: LEDG ${L} vs REDG ${R}`);
  }
  const edges = cat.filter((p) => p.mpos === 'LEDG' || p.mpos === 'REDG');
  const redg = edges.filter((p) => p.mpos === 'REDG').length / edges.length;
  assert.ok(redg > 0.4 && redg < 0.6, `REDG share ${redg.toFixed(2)}`);
  const lbs = cat.filter((p) => p.grp === 'LB');
  const mike = lbs.filter((p) => p.mpos === 'MIKE').length / lbs.length;
  assert.ok(mike < 0.6, `MIKE share ${mike.toFixed(2)}`);
});

test('a roster add gets the slot the pool showed (a REDG stays REDG in a one-player class)', skipWithoutData, async () => {
  const cat = await PoolCatalogService.balanced();
  const r = cat.find((p) => p.mpos === 'REDG' && p.hof);
  assert.ok(r, 'a Hall of Fame REDG in the pool');
  const g = await RosterAddService.generate(r!.key);
  assert.equal(g.position, 'REDG');
  assert.equal(g.positionId, 11);
});
