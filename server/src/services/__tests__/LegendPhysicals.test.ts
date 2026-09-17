import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CalibrationService } from '../CalibrationService';
import { FIXED_ATTRS, LEGEND_PHYSICAL_MARGIN, generateAttributes } from '../AttributeModel';
import { PositionMapper } from '../PositionMapper';

function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 2 ** 32; };
}

test('a career-rated 99 overall edge keeps his physicals near the position ceiling (Carl Eller is not a 98-speed rusher)', () => {
  const posName = 'LEDG';
  const posId = PositionMapper.toM26Id(posName);
  const profile = CalibrationService.positionProfile(posName, 'm27');
  const { attrs, ovrMean } = CalibrationService.archetypeAttrs(posName, 40, 'm27'); // Power Rusher
  const stats = profile.attrStats!;
  let skillAboveMax = false;
  for (let seed = 1; seed <= 60; seed++) {
    const out = generateAttributes({ posId, profile, archAttrs: attrs, archOvrMean: ovrMean, overall: 99, rand: lcg(seed), uncapped: true });
    for (const k of FIXED_ATTRS) {
      if (!stats[k]) continue;
      assert.ok(out[k] <= stats[k].max + LEGEND_PHYSICAL_MARGIN, `seed ${seed}: ${k} ${out[k]} > ${stats[k].max} + ${LEGEND_PHYSICAL_MARGIN}`);
    }
    if (out.awareness > stats.awareness.max + 4) skillAboveMax = true;
  }
  assert.ok(skillAboveMax, 'skill attributes still run past the rookie range for a legend');
});
