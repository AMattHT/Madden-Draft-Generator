import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skipWithoutData } from './data';
import fs from 'fs';
import path from 'path';
import { enrichedClass } from '../DraftEnrichment';
import { DraftClassBuilder } from '../DraftClassBuilder';
import { OVRWeightsCalculator } from '../OVRWeightsCalculator';
import { LOOKUPS_DIR } from '../../config/paths';

function corr(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}
const std = (xs: number[]) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length); };

const cache = new Map<number, ReturnType<typeof DraftClassBuilder.preview>['rows']>();
async function rows(year: number) {
  if (!cache.has(year)) {
    const { players } = await enrichedClass(year, 'NFL', { fill: true });
    cache.set(year, DraftClassBuilder.preview(players, 'madden').rows);
  }
  return cache.get(year)!;
}

test('injury and toughness no longer track overall; awareness does (like Madden)', skipWithoutData, async () => {
  const r = await rows(2000);
  const ovr = r.map((x) => x.overall);
  const cInjury = corr(ovr, r.map((x) => x.ratings.injury));
  const cTough = corr(ovr, r.map((x) => x.ratings.toughness));
  const cAware = corr(ovr, r.map((x) => x.ratings.awareness));
  assert.ok(Math.abs(cInjury) < 0.35, `corr(OVR, injury) = ${cInjury.toFixed(2)}`);
  assert.ok(Math.abs(cTough) < 0.35, `corr(OVR, toughness) = ${cTough.toFixed(2)}`);
  assert.ok(cAware > 0.6, `corr(OVR, awareness) = ${cAware.toFixed(2)}`);
});

test('better halfbacks are faster when the model alone decides (1995: no combine data)', skipWithoutData, async () => {
  const hb = (await rows(1995)).filter((x) => x.position === 'HB');
  const c = corr(hb.map((x) => x.overall), hb.map((x) => x.ratings.speed));
  assert.ok(c > 0.25, `HB corr(OVR, speed) = ${c.toFixed(2)} over ${hb.length} backs`);
});

test('the overall Madden recomputes from the attributes equals the overall we wrote', skipWithoutData, async () => {
  const r = await rows(2000);
  let exact = 0;
  for (const x of r) if (OVRWeightsCalculator.computeOverall(x.positionId, x.archetype, x.ratings) === x.overall) exact++;
  assert.ok(exact / r.length >= 0.98, `${exact}/${r.length} exact`);
});

test('offensive linemen never fall below the observed speed floor after combine mapping', skipWithoutData, async () => {
  const ol = (await rows(2000)).filter((x) => ['LT', 'LG', 'C', 'RG', 'RT'].includes(x.position));
  assert.deepEqual(ol.filter((x) => x.ratings.speed < 50).map((x) => `${x.lastName} ${x.ratings.speed}`), []);
});

test('attribute spread tracks the per-position spread of the real classes (not a flat +-3)', skipWithoutData, async () => {
  const cal = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'madden-calibration.json'), 'utf8'));
  const r = await rows(2000);
  for (const pos of ['CB', 'WR', 'LT']) {
    const ps = r.filter((x) => x.position === pos);
    for (const k of ['awareness', 'injury', 'tackle']) {
      const ours = std(ps.map((x) => x.ratings[k]));
      const madden = cal.positions[pos].attrStats[k].std;
      assert.ok(ours >= madden * 0.6 && ours <= madden * 1.8, `${pos} ${k}: std ${ours.toFixed(1)} vs Madden ${madden}`);
    }
  }
});

test('Tom Brady is not a Scrambler (career rush totals normalised per game)', skipWithoutData, async () => {
  const brady = (await rows(2000)).find((x) => x.lastName === 'Brady')!;
  assert.ok(brady, 'Brady in the 2000 class');
  assert.notEqual(brady.archetypeName, 'Scrambler', `Brady archetype: ${brady.archetypeName}`);
});
