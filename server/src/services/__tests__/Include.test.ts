import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skipWithoutData } from './data';
import { enrichedClass } from '../DraftEnrichment';
import { DraftClassBuilder } from '../DraftClassBuilder';

test('1987 has more players than the class holds; the drop list is structured and includable', skipWithoutData, async () => {
  const { players } = await enrichedClass(1987, 'NFL', { fill: true });
  assert.ok(players.length > 402, `${players.length} rows`);
  const base = DraftClassBuilder.preview(players, 'madden', {}, 'm27');
  assert.equal(base.rows.length, 402);
  assert.equal(base.dropped.length, players.length - 402);
  const d = base.dropped[0];
  assert.ok(typeof d.idx === 'number' && d.lastName && d.position, JSON.stringify(d));
  // The strongest dropped player comes first; no first-rounder is ever dropped.
  assert.ok(base.dropped.every((x) => x.round == null || x.round > 3), 'rounds 1-3 never dropped');

  // Include the top two dropped players: they appear, the class stays 402, and
  // everyone who was not swapped out keeps his pick number.
  const pick = base.dropped.slice(0, 2).map((x) => x.idx);
  const inc = DraftClassBuilder.preview(players, 'madden', { include: pick }, 'm27');
  assert.equal(inc.rows.length, 402);
  assert.deepEqual(inc.included.sort(), pick.sort());
  for (const x of base.dropped.slice(0, 2)) assert.ok(inc.rows.some((r) => r.firstName === x.firstName && r.lastName === x.lastName), `${x.lastName} included`);
  assert.equal(inc.dropped.length, base.dropped.length);
  assert.ok(!inc.dropped.some((x) => pick.includes(x.idx)));
  let moved = 0;
  for (let i = 0; i < 402; i++) if (base.rows[i].lastName !== inc.rows[i].lastName || base.rows[i].firstName !== inc.rows[i].firstName) moved++;
  assert.equal(moved, 2, `${moved} rows changed pick number`);
});
