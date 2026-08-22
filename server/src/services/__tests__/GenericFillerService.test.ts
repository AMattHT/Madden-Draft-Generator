import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GenericFillerService } from '../GenericFillerService';
import { PositionMapper } from '../PositionMapper';

test('fillers are generated where the class is short of Madden\'s per-position mix', () => {
  // A class with 300 wide receivers and nothing else: the 102 fillers must not be WRs.
  const existing = Array.from({ length: 300 }, (_, i) => ({ position: 'WR', firstName: `W${i}`, lastName: 'X' }));
  const fill = GenericFillerService.build(1990, existing as never, 402);
  assert.equal(fill.length, 102);
  const counts: Record<string, number> = {};
  for (const f of fill) { const n = PositionMapper.name(PositionMapper.toM26Id(f.position)); counts[n] = (counts[n] || 0) + 1; }
  assert.equal(counts.WR ?? 0, 0, JSON.stringify(counts));
  assert.ok((counts.DT ?? 0) >= 8, `DT fillers: ${counts.DT}`);
  assert.ok((counts.CB ?? 0) >= 8, `CB fillers: ${counts.CB}`);
});

test('filler generation is deterministic for a year', () => {
  const a = GenericFillerService.build(1977, [] as never, 60).map((p) => p.position + p.lastName);
  const b = GenericFillerService.build(1977, [] as never, 60).map((p) => p.position + p.lastName);
  assert.deepEqual(a, b);
});
