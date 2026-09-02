import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { skipWithoutData, HAS_DATA } from './data';
import { LOOKUPS_DIR } from '../../config/paths';
import { enrichedClass } from '../DraftEnrichment';
import { DraftClassBuilder } from '../DraftClassBuilder';

const hasAwards = fs.existsSync(path.join(LOOKUPS_DIR, 'nfl-awards.json'));
const skip = !HAS_DATA ? skipWithoutData : !hasAwards ? { skip: 'nfl-awards.json not baked' } : undefined;

async function tiers(year: number) {
  const { players } = await enrichedClass(year, 'NFL', { fill: true });
  const pv = DraftClassBuilder.preview(players, 'madden', {}, 'm27');
  const by = (t: number) => pv.rows.filter((r) => r.devTrait === t).map((r) => `${r.firstName} ${r.lastName}`);
  return { xf: by(3), ss: by(2), star: by(1), rows: pv.rows };
}

test('2023: the two Rookies of the Year are X-Factors and few if any join them on pace', skip, async () => {
  const t = await tiers(2023);
  assert.ok(t.xf.includes('C.J. Stroud'), `Stroud in ${t.xf}`);
  assert.ok(t.xf.includes('Will Anderson'), `Anderson in ${t.xf}`);
  assert.ok(t.xf.length <= 5, `${t.xf.length} X-Factors: ${t.xf}`);
  for (const name of ['Jahmyr Gibbs', 'Puka Nacua', 'Bijan Robinson']) {
    assert.ok(t.ss.includes(name) || t.xf.includes(name), `${name} at least Superstar`);
  }
  assert.ok(!t.xf.some((n) => /Baringer/.test(n)), 'no punter X-Factor');
  assert.ok(t.ss.length >= 8 && t.ss.length <= 20, `${t.ss.length} Superstars`);
});

test('2024: Daniels and Verse (Rookies of the Year) are the X-Factors; two seasons earn no more', skip, async () => {
  const t = await tiers(2024);
  assert.deepEqual([...t.xf].sort(), ['Jared Verse', 'Jayden Daniels']);
  // Floors are facts (a first-team All-Pro or two Pro Bowls is a Superstar) and the
  // 2025 season added several; the quota on top of them is season-scaled.
  assert.ok(t.ss.length >= 3 && t.ss.length <= 12, `${t.ss.length} Superstars`);
});

test('2025: only the Rookies of the Year are X-Factors; one season earns a few Superstars', skip, async () => {
  const t = await tiers(2025);
  assert.deepEqual([...t.xf].sort(), ['Carson Schwesinger', 'Tetairoa McMillan']);
  // A quarter of the Superstar quota after one season (the year's best producers),
  // plus any All-Pro or two-time Pro Bowl floor. Specialists stop at Star.
  assert.ok(t.ss.length >= 3 && t.ss.length <= 8, `${t.ss.length} Superstars: ${t.ss}`);
  assert.ok(!t.ss.some((n) => /Loop|Borregales|Crawshaw|Ashby/.test(n)), 'no specialist Superstar');
  // Half the Star quota (45) plus every rookie Pro Bowler's floor.
  assert.ok(t.star.length >= 30 && t.star.length <= 80, `${t.star.length} Stars`);
});

test('2026 (no seasons yet): dev traits as Madden 27 ships them, no X-Factors', skip, async () => {
  const t = await tiers(2026);
  assert.equal(t.xf.length, 0);
  // EA's launch list: six Superstars (Downs, Love, Bailey, Bain, Reese, Mendoza), 107 Stars.
  assert.equal(t.ss.length, 6, `${t.ss}`);
  assert.ok(t.ss.includes('Fernando Mendoza'), 'pick 1 is a Superstar');
  assert.ok(t.ss.includes('Caleb Downs'));
  // EA's 107 Stars plus a handful of slot-based Stars for rookies EA does not list.
  assert.ok(t.star.length >= 105 && t.star.length <= 125, `${t.star.length} Stars`);
});

test('1998 keeps the full Madden shape (5 / 14 / 90)', skip, async () => {
  const t = await tiers(1998);
  assert.equal(t.xf.length, 5);
  assert.equal(t.ss.length, 14);
  assert.equal(t.star.length, 90);
  assert.ok(t.xf.includes('Peyton Manning'));
});
