import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DraftClassBuilder } from '../DraftClassBuilder';
import { PlayerLookupService } from '../PlayerLookupService';
import { allTimeGreatsClass } from '../DraftEnrichment';

/**
 * A class is a Madden class whatever it is made of.
 *
 * An elite career was promoted to X-Factor past whatever the draft slot said,
 * with no ceiling. In a single draft year only a handful clear that bar, so it
 * looked right. An all-time class is 335 elite players: 83% of it came out
 * X-Factor, and the Superstar tier emptied completely, because every player in
 * the Superstar band was also elite and got promoted out of it.
 *
 * The promotion now has a ceiling and the calibrated rates carry the rest.
 */

const counts = (rows: { devTrait: number }[]) => {
  const c = [0, 0, 0, 0];
  for (const r of rows) c[r.devTrait]++;
  return { normal: c[0], star: c[1], superstar: c[2], xfactor: c[3] };
};

const shapeOf = (rows: { devTrait: number }[], label: string) => {
  const c = counts(rows);
  // Nothing rare may outnumber what is common: X-Factor is the rarest tier.
  assert.ok(
    c.xfactor <= 0.05 * rows.length,
    `${label}: ${c.xfactor} X-Factors in ${rows.length} players — a class cannot be mostly generational talent`
  );
  assert.ok(c.superstar > 0, `${label}: the Superstar tier is empty`);
  assert.ok(c.star > c.superstar, `${label}: Stars (${c.star}) should outnumber Superstars (${c.superstar})`);
  assert.ok(c.superstar > c.xfactor, `${label}: Superstars (${c.superstar}) should outnumber X-Factors (${c.xfactor})`);
  return c;
};

test('a single draft year has a Madden-shaped dev spread', () => {
  for (const year of [1998, 1983, 2013]) {
    const { rows } = DraftClassBuilder.preview(PlayerLookupService.byYear(year), 'madden', {}, 'm27');
    shapeOf(rows, String(year));
  }
});

test('an all-time class is not 83% X-Factors', async () => {
  const { players } = await allTimeGreatsClass();
  const { rows } = DraftClassBuilder.preview(players, 'madden', {}, 'm27');
  const c = shapeOf(rows, 'all-time');
  // It is made entirely of great careers, so it should sit at the top of the
  // allowed range rather than at the ordinary-class baseline.
  assert.ok(c.xfactor >= 5, `all-time should carry its share of X-Factors, got ${c.xfactor}`);
});

test('a decade class keeps every tier too', async () => {
  const { players } = await allTimeGreatsClass({ from: 1990, to: 1999 });
  const { rows } = DraftClassBuilder.preview(players, 'madden', {}, 'm27');
  shapeOf(rows, 'decade 1990s');
});
