import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EraGearService } from '../EraGearService';
import { PositionMapper } from '../PositionMapper';

function paintRate(year: number, pos: string, n = 200): number {
  const posId = PositionMapper.toM26Id(pos);
  let paint = 0;
  for (let i = 0; i < n; i++) {
    const els = EraGearService.loadoutElements(year, posId, `eye|${pos}|${year}|${i}`, 'm27');
    if (els.some((e) => e.slotType === 'FacePaint')) paint++;
  }
  return paint / n;
}

test('eye paint follows the game\'s per-position rates, not everyone', () => {
  assert.equal(paintRate(2024, 'C'), 0);
  assert.equal(paintRate(2024, 'K'), 0);
  const ss = paintRate(2024, 'SS'); assert.ok(ss > 0.4 && ss < 0.7, `SS ${ss}`);
  const qb = paintRate(2024, 'QB'); assert.ok(qb < 0.15, `QB ${qb}`);
  const wr = paintRate(2024, 'WR'); assert.ok(wr > 0.25 && wr < 0.5, `WR ${wr}`);
});

test('eye black is rare before the 1970s and only grease before 2000', () => {
  assert.ok(paintRate(1965, 'SS') < 0.15);
  const posId = PositionMapper.toM26Id('WR');
  for (let i = 0; i < 150; i++) {
    const fp = EraGearService.loadoutElements(1988, posId, `g|${i}`, 'm27').find((e) => e.slotType === 'FacePaint');
    if (fp) assert.match(fp.itemAssetName, /^FaceMarks_EyePaint[23]?$/, fp.itemAssetName);
  }
});
