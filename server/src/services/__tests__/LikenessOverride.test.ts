import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { skipWithoutData } from './data';
import { LikenessOverrideService, mergeIntoCurated, validateLikenessPatch } from '../LikenessOverrideService';
import { enrichedClass, teamGreatsClass, boardClass } from '../DraftEnrichment';
import { DraftClassBuilder, applyEdits } from '../DraftClassBuilder';
import type { BaselinePlayer } from '../../types/player';
import { PlayerLookupService } from '../PlayerLookupService';
import { LikenessService } from '../LikenessService';

const scratch = path.join(os.tmpdir(), `likeness-overrides-${process.pid}.json`);
LikenessOverrideService._useFile(scratch);
test.after(() => { try { fs.unlinkSync(scratch); } catch { /* gone */ } });

test('a fix is validated, stored, listed and removed; the stamp moves with it', () => {
  assert.match(validateLikenessPatch({ skinTone: 9 }) ?? '', /1-7/);
  assert.match(validateLikenessPatch({}) ?? '', /nothing to fix/);
  assert.match(validateLikenessPatch({ bodyType: 'Round' }) ?? '', /bodyType/);
  const s0 = LikenessOverrideService.stamp();
  const e = LikenessOverrideService.set('Test', 'Player', 1999, { skinTone: 3, note: 'unit' });
  assert.equal(e.skinTone, 3);
  assert.notEqual(LikenessOverrideService.stamp(), s0);
  assert.equal(LikenessOverrideService.get('test', 'PLAYER', 1999)?.note, 'unit');
  // A gen_ head carries its tone.
  const e2 = LikenessOverrideService.set('Test', 'Player', 1999, { faceAsset: 'gen_5_B_S_001' });
  assert.equal(e2.skinTone, 5);
  assert.equal(LikenessOverrideService.all().length, 1);
  assert.equal(LikenessOverrideService.remove('Test', 'Player', 1999), true);
  assert.equal(LikenessOverrideService.remove('Test', 'Player', 1999), false);
  assert.equal(LikenessOverrideService.get('Test', 'Player', 1999), null);
});

test('promoting into the curated file adds new tones and keeps existing ones unless forced', () => {
  const curated: Record<string, number> = { 'paul|krause|1964': 2 };
  const r = mergeIntoCurated({ 'paul|krause|1964': { skinTone: 7 }, 'bob|hayes|1964': { skinTone: 7 }, 'no|tone|1970': {} }, curated);
  assert.deepEqual(r.added, ['bob|hayes|1964']);
  assert.deepEqual(r.skipped, ['paul|krause|1964']);
  assert.equal(curated['paul|krause|1964'], 2);
  const f = mergeIntoCurated({ 'paul|krause|1964': { skinTone: 7 } }, curated, true);
  assert.deepEqual(f.replaced, ['paul|krause|1964']);
  assert.equal(curated['paul|krause|1964'], 7);
});

test('a fix follows the player into his year class, a franchise class and a Studio board', skipWithoutData, async () => {
  const find = (ps: BaselinePlayer[]) => ps.find((p) => p.firstName === 'Bob' && p.lastName === 'Hayes');
  const before = find((await enrichedClass(1964, 'NFL', { fill: false })).players);
  assert.ok(before, 'Bob Hayes is in the 1964 class');
  assert.ok(before.toneSource, 'every real player reports where his tone came from');
  assert.ok(!before.likenessFixed);

  LikenessOverrideService.set('Bob', 'Hayes', 1964, { skinTone: 7, bodyType: 'Thin' });
  try {
    const year = find((await enrichedClass(1964, 'NFL', { fill: false })).players)!;
    assert.equal(year.race, 7);
    assert.equal(year.toneSource, 'override');
    assert.equal(year.likenessFixed, true);

    const team = find((await teamGreatsClass('DAL')).players);
    assert.equal(team?.race, 7, 'By team class');

    const key = PlayerLookupService.byYear(1964, 'NFL').find((p) => p.firstName === 'Bob' && p.lastName === 'Hayes')!.key!;
    const board = find((await boardClass([{ key }], { fill: false })).players);
    assert.equal(board?.race, 7, 'Studio board');

    // The preview row carries the fix and the body type; a class edit still wins for that class.
    const { players } = await enrichedClass(1964, 'NFL', { fill: false });
    const pv = DraftClassBuilder.preview(players, 'madden', {}, 'm27');
    const row = pv.rows.find((r) => r.firstName === 'Bob' && r.lastName === 'Hayes')!;
    assert.equal(row.skinTone, 7);
    assert.equal(row.bodyType, 'Thin');
    assert.equal(row.likenessFixed, true);
    assert.equal(row.toneSource, 'override');
    const { prospects } = DraftClassBuilder.buildProspects(players, 'madden', {}, 'm27');
    const idx = pv.rows.indexOf(row);
    applyEdits(prospects, { [row.id]: { skinTone: 2 } }, 'm27');
    assert.equal((prospects[idx].visuals as { skinTone?: number }).skinTone, 2, 'class edit beats the fix in its own class');
  } finally {
    LikenessOverrideService.remove('Bob', 'Hayes', 1964);
  }
  const after = find((await enrichedClass(1964, 'NFL', { fill: false })).players)!;
  assert.equal(after.race, before!.race, 'undo restores the inferred tone');
  assert.ok(!after.likenessFixed);
});

test('a generic-head fix pins the face and its tone in the export', skipWithoutData, async () => {
  const head = LikenessService.headsForTone(7, 'm27')[0];
  assert.ok(head && /^gen_7/i.test(head), `a tone-7 M27 head exists: ${head}`);
  LikenessOverrideService.set('Bob', 'Hayes', 1964, { faceAsset: head });
  try {
    const fixed = await enrichedClass(1964, 'NFL', { fill: false });
    const pv = DraftClassBuilder.preview(fixed.players, 'madden', {}, 'm27');
    const row = pv.rows.find((r) => r.firstName === 'Bob' && r.lastName === 'Hayes')!;
    assert.equal(row.genericHead, head);
    assert.equal(row.face, 'generic');
    assert.equal(row.skinTone, 7);
  } finally {
    LikenessOverrideService.remove('Bob', 'Hayes', 1964);
  }
});
