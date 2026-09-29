import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PlayerLookupService } from '../PlayerLookupService';
import { CuratedSkinToneService } from '../CuratedSkinToneService';
import { LikenessService } from '../LikenessService';
import { LikenessOverrideService } from '../LikenessOverrideService';
import { boardClass } from '../DraftEnrichment';
import { DraftClassBuilder } from '../DraftClassBuilder';
import { MdcService } from '../MdcService';
import { Mdc27Service } from '../Mdc27Service';
import { RosterAddService } from '../RosterAddService';
import { skipWithoutData } from './data';

// Named portrait references and review scope: docs/likeness/1930s-batch-01.md.
const reviewed: [string, string, number, number, string][] = [
  ["Bill","Shakespeare",1936,2,"Notre Dame"],
  ["Vic","Bottari",1939,2,"California"],
  ["Ed","Franco",1938,2,"Fordham"],
  ["Gomer","Jones",1936,2,"Ohio St."],
  ["Bill","Wallace",1936,2,"Rice"],
  ["Sam","Francis",1937,2,"Nebraska"],
  ["Bill","Osmanski",1939,2,"Holy Cross"],
  ["Bobby","Wilson",1936,2,"SMU"],
  ["Bob (Bones)","Hamilton",1936,2,"Stanford"],
  ["Nello","Falaschi",1937,2,"Santa Clara"],
  ["Larry","Kelley",1937,2,"Yale"],
  ["Johnny","Pingel",1939,2,"Michigan St."],
  ["Cecil","Isbell",1938,2,"Purdue"],
  ["Eric","Tipton",1939,2,"Duke"],
  ["Ki","Aldrich",1939,2,"TCU"],
  ["Sid","Luckman",1939,2,"Columbia"],
  ["Carl","Hinkle",1938,2,"Vanderbilt"],
  ["Marshall","Goldberg",1939,2,"Pittsburgh"],
  ["Clint","Frank",1938,2,"Yale"],
  ["Bobby","Grayson",1936,2,"Stanford"],
  ["Davey","O'Brien",1939,2,"TCU"],
  ["Jay","Berwanger",1936,2,"Chicago"],
  ["Whizzer","White",1938,2,"Colorado"],
  ["Ed","Widseth",1937,2,"Minnesota"],
  ["Sammy","Baugh",1937,2,"TCU"],
];
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'likeness-1930s-'));
LikenessOverrideService._useFile(path.join(scratch, 'overrides.json'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const lookup = (first: string, last: string, year: number, college?: string) => {
  const p = PlayerLookupService.byYear(year).find(p => p.firstName === first && p.lastName === last && (!college || p.college === college));
  assert.ok(p?.key, `${first} ${last} (${year}) exists`);
  return p;
};

test('reviewed 1930s players retain generics when no usable M27 head exists', () => {
  for (const [first, last, year, , college] of reviewed) {
    assert.equal(LikenessService.realFace(lookup(first, last, year, college), 'm27'), null, first + ' ' + last);
  }
});

test('the first 1930s batch records reviewed palette choices', () => {
  for (const [first, last, year, tone, college] of reviewed) {
    const player = lookup(first, last, year, college);
    assert.equal(CuratedSkinToneService.toneFor(first, last, year, player.college), tone, `${first} ${last}`);
  }
});

test('1930s choices survive both draft exports and roster-add generation', skipWithoutData, async () => {
  const originals = reviewed.map(([first, last, year, , college]) => lookup(first, last, year, college));
  const { players } = await boardClass(originals.map(p => ({ key: p.key! })), { fill: false });
  for (const p of players) assert.equal(p.toneSource, 'curated', p.firstName + ' ' + p.lastName);
  const byName = new Map(players.map(p => [`${p.firstName}|${p.lastName}`, p]));
  for (const game of ['m26', 'm27'] as const) {
    const output = game === 'm26' ? DraftClassBuilder.buildMdc(players) : DraftClassBuilder.buildMdc27(players);
    const parsed = game === 'm26' ? MdcService.parse(output.buffer) : Mdc27Service.parse(output.buffer);
    for (const [first, last, , tone] of reviewed) {
      const p = parsed.find(p => p.firstName === first && p.lastName === last);
      assert.ok(p, `${game} ${first} ${last} exported`);
      const face = LikenessService.realFace(byName.get(`${first}|${last}`)!, game);
      if (face) assert.equal(p.PEPS, face.assetName);
      else {
        const vis = p.visuals as { skinTone?: number; genericHeadName?: string };
        assert.equal(vis.skinTone, tone, `${game} ${first} ${last} tone`);
        assert.match(vis.genericHeadName ?? '', new RegExp(`^gen_${tone}_`, 'i'));
      }
    }
  }
  RosterAddService._reset();
  for (let i = 0; i < originals.length; i++) {
    const p = await RosterAddService.generate(originals[i].key!);
    assert.equal(p.skinTone, reviewed[i][3]);
    assert.equal(p.assetName, '', 'M27 roster additions keep a generic head');
    assert.match(p.genericHead, new RegExp('^gen_' + reviewed[i][3] + '_', 'i'));
  }
});

test('a manually selected generic face still wins over a recorded 1930s tone', skipWithoutData, async () => {
  const head = LikenessService.headsForTone(7, 'm27')[0];
  LikenessOverrideService.set('Sid', 'Luckman', 1939, { faceAsset: head });
  try {
    const p = lookup('Sid', 'Luckman', 1939);
    const { players } = await boardClass([{ key: p.key! }], { fill: false });
    const { prospects } = DraftClassBuilder.buildProspects(players, 'madden', {}, 'm27');
    assert.equal(prospects[0].PEPS, head);
  } finally {
    LikenessOverrideService.remove('Sid', 'Luckman', 1939);
  }
});

test('1930s curation stays scoped to reviewed identities and preserves prior choices', async () => {
  assert.equal(CuratedSkinToneService.toneFor('Whizzer', 'White', 1938, 'Colorado'), 2);
  assert.equal(CuratedSkinToneService.toneFor('Johnny', 'Pingel', 1939, 'Michigan St.'), 2);
  const other = lookup('George', 'Wilson', 1937, 'Northwestern');
  assert.equal(CuratedSkinToneService.toneFor('George', 'Wilson', 1937, 'Northwestern'), null);
  assert.equal(LikenessService.realFace(other, 'm27'), null, 'a modern namesake scan cannot become a historical face');
  const { players } = await boardClass([{ key: other.key! }], { fill: false });
  assert.notEqual(players[0].toneSource, 'curated', 'unreviewed players remain unreviewed');
  for (const [first, last, year, tone] of [['Joe', 'Stydahar', 1936, 2], ['Ace', 'Parker', 1937, 2], ['Joe', 'Perry', 1948, 6], ['Tony', 'Dorsett', 1977, 6]] as const) {
    assert.equal(CuratedSkinToneService.toneFor(first, last, year), tone);
  }
});
