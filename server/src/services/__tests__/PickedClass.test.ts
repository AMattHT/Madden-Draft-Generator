import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skipWithoutData } from './data';
import { pickedClass } from '../DraftEnrichment';
import { classSlug } from '../ClassName';
import { PlayerLookupService } from '../PlayerLookupService';
import { DraftClassBuilder } from '../DraftClassBuilder';

test('classSlug keeps letters and digits, upper-cases, caps at 16, falls back to CUSTOM', () => {
  assert.equal(classSlug('My 90s Legends!'), 'MY90SLEGENDS');
  assert.equal(classSlug('abcdefghijklmnopqrstuvwxyz'), 'ABCDEFGHIJKLMNOP');
  assert.equal(classSlug('   '), 'CUSTOM');
  assert.equal(classSlug(''), 'CUSTOM');
});

test('a picked class resolves keys, keeps the board order, reports unknown keys and pads to 402', skipWithoutData, async () => {
  const cat = PlayerLookupService.catalog();
  const key = (first: string, last: string, year: number) => cat.find((p) => p.first === first && p.last === last && p.year === year)!.key;
  const keys = [key('Ryan', 'Leaf', 1998), key('Peyton', 'Manning', 1998), key('Tom', 'Brady', 2000), 'ghost|NFL|a|b|u'];
  const { players, generatedCount, missing } = await pickedClass(keys, { fill: true });
  assert.deepEqual(missing, ['ghost|NFL|a|b|u']);
  assert.equal(players.length, 402);
  assert.equal(generatedCount, 399);
  // The board is the draft order (Class Studio): picks come out exactly as listed.
  const top = players.slice(0, 3);
  assert.deepEqual(top.map((p) => p.lastName), ['Leaf', 'Manning', 'Brady']);
  const pvFirst = DraftClassBuilder.preview(players.slice(0, 3), 'madden', {}, 'm27').rows[0].lastName;
  assert.equal(pvFirst, 'Leaf');
  // Fillers come from the era of the picks (median year 1998), not from today.
  assert.ok(players.slice(3).every((p) => p.draftYear === 1998), 'filler draft year');
  const short = await pickedClass(keys, { fill: false });
  assert.equal(short.players.length, 3);
  const pv = DraftClassBuilder.preview(short.players, 'madden', {}, 'm27');
  assert.equal(pv.rows.length, 3);
  assert.equal(pv.rows[2].lastName, 'Brady');
});

test('more than 402 keys are truncated and flagged', skipWithoutData, async () => {
  const keys = PlayerLookupService.catalog().slice(0, 450).map((p) => p.key);
  const r = await pickedClass(keys, { fill: false });
  assert.equal(r.players.length, 402);
  assert.equal(r.truncatedKeys, true);
});
