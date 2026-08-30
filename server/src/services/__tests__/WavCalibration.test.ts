import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlayerLookupService } from '../PlayerLookupService';
import { RatingService } from '../RatingService';

/** The aggregate wAV estimate ranks well (r = 0.91 against real PFR wAV) but
 *  was inflating journeymen by ~10 AV while sitting accurate from ~30 up. The
 *  calibration maps the low end onto observed means and is identity above the
 *  threshold, so the tail keeps the behaviour it already had. */

function labelled() {
  const rows: { act: number; est: number }[] = [];
  for (const y of PlayerLookupService.years())
    for (const p of PlayerLookupService.byYear(y)) {
      if (p.wavSource !== 'actual' || p.wav == null) continue;
      if (p.careerFrom == null || p.careerTo == null) continue;
      rows.push({ act: p.wav, est: RatingService.predictedWav(p) });
    }
  return rows;
}

const bias = (rs: { act: number; est: number }[]) =>
  rs.reduce((s, r) => s + (r.est - r.act), 0) / rs.length;
const mae = (rs: { act: number; est: number }[]) =>
  rs.reduce((s, r) => s + Math.abs(r.est - r.act), 0) / rs.length;

test('the estimate stays close to real wAV overall', () => {
  const rows = labelled();
  assert.ok(rows.length > 10000, `expected a large labelled set, got ${rows.length}`);
  // Was MAE 8.57 / bias +6.28 before calibration; leave room but catch regressions.
  assert.ok(mae(rows) < 7.0, `MAE ${mae(rows).toFixed(2)} should stay under 7`);
  assert.ok(Math.abs(bias(rows)) < 2.5, `bias ${bias(rows).toFixed(2)} should stay near zero`);
});

test('journeymen are no longer inflated, and the tail is not disturbed', () => {
  const rows = labelled();
  const low = rows.filter((r) => r.act < 15);
  const stars = rows.filter((r) => r.act >= 60);
  // The whole point of the calibration: low-end bias was +9.50.
  assert.ok(bias(low) < 5, `low-end bias ${bias(low).toFixed(2)} should be well under the old +9.5`);
  // Identity above the threshold means stars must not have been dragged down.
  assert.ok(bias(stars) > -6, `star bias ${bias(stars).toFixed(2)} should not regress`);
});

test('calibration is monotone, so it cannot reorder players', () => {
  // A mature career (span >= 3) so this exercises the aggregate estimate and its
  // calibration, not the draft-slot blend used for one- and two-season careers.
  const player = (started: number, proBowls: number) =>
    ({ proBowls, allPro1: 0, seasonsStarted: started, careerFrom: 1980, careerTo: 1997,
       draftRound: 7, draftPick: 220 } as never);

  for (const proBowls of [0, 3, 8]) {
    let prev = -Infinity;
    for (let started = 0; started <= 18; started++) {
      const v = RatingService.predictedWav(player(started, proBowls));
      assert.ok(v >= prev - 1e-9, `dipped at started=${started}, PB=${proBowls}: ${v} < ${prev}`);
      prev = v;
    }
  }
  // And more accolades never lower the estimate either.
  let prev = -Infinity;
  for (let proBowls = 0; proBowls <= 12; proBowls++) {
    const v = RatingService.predictedWav(player(12, proBowls));
    assert.ok(v >= prev - 1e-9, `dipped at PB=${proBowls}: ${v} < ${prev}`);
    prev = v;
  }
});
