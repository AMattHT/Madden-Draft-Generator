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

// Named portrait references and review scope: docs/likeness/1940s-batch-01.md.
const reviewed: [string, string, number, number, string][] = [
  ["George","Blanda",1949,2,"Kentucky"],
  ["Joe","Perry",1948,6,"Compton JC"],
  ["Emlen","Tunnell",1948,7,"Iowa"],
  ["Otto","Graham",1944,2,"Northwestern"],
  ["Bill","Willis",1946,7,"Ohio State"],
  ["Kenny","Washington",1946,6,"UCLA"],
  ["Woody","Strode",1946,5,"UCLA"],
  ["Tank","Younger",1949,6,"Grambling State"],
  ["Frank","Tripucka",1949,2,"Notre Dame"],
  ["Charlie","Conerly",1945,2,"Mississippi"],
  ["Hardy","Brown",1947,2,"Tulsa"],
  ["Frankie","Albert",1942,2,"Stanford"],
  ["Paul","Christman",1941,2,"Missouri"],
  ["Tom","Harmon",1941,2,"Michigan"],
  ["Bruce","Smith",1942,2,"Minnesota"],
  ["Frankie","Sinkwich",1943,2,"Georgia"],
  ["Angelo","Bertelli",1944,2,"Notre Dame"],
  ["Les","Horvath",1943,2,"Ohio St."],
  ["Felix (Doc)","Blanchard",1946,2,"Army"],
  ["Glenn","Davis",1947,2,"Army"],
  ["Johnny","Lujack",1946,2,"Notre Dame"],
  ["Banks","McFadden",1940,2,"Clemson"],
  ["George","Cafego",1940,2,"Tennessee"],
  ["Ken","Kavanaugh",1940,2,"LSU"],
  ["Harry","Gilmer",1948,2,"Alabama"],
];
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'likeness-1940s-'));
LikenessOverrideService._useFile(path.join(scratch, 'overrides.json'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const lookup = (first: string, last: string, year: number, college?: string) => {
  const p = PlayerLookupService.byYear(year).find(p => p.firstName === first && p.lastName === last && (!college || p.college === college));
  assert.ok(p?.key, `${first} ${last} (${year}) exists`);
  return p;
};

test('reviewed 1940s players retain generics when no usable M27 head exists', () => {
  for (const [first, last, year, , college] of reviewed) {
    assert.equal(LikenessService.realFace(lookup(first, last, year, college), 'm27'), null, first + ' ' + last);
  }
});

test('the first 1940s batch records reviewed palette choices', () => {
  for (const [first, last, year, tone, college] of reviewed) {
    const player = lookup(first, last, year, college);
    assert.equal(CuratedSkinToneService.toneFor(first, last, year, player.college), tone, `${first} ${last}`);
  }
});

test('1940s choices survive both draft exports and roster-add generation', skipWithoutData, async () => {
  const originals = reviewed.map(([first, last, year, , college]) => lookup(first, last, year, college));
  const { players } = await boardClass(originals.map(p => ({ key: p.key! })), { fill: false });
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

test('a manually selected generic face still wins over a recorded 1940s tone', skipWithoutData, async () => {
  const head = LikenessService.headsForTone(7, 'm27')[0];
  LikenessOverrideService.set('Joe', 'Perry', 1948, { faceAsset: head });
  try {
    const p = lookup('Joe', 'Perry', 1948);
    const { players } = await boardClass([{ key: p.key! }], { fill: false });
    const { prospects } = DraftClassBuilder.buildProspects(players, 'madden', {}, 'm27');
    assert.equal(prospects[0].PEPS, head);
  } finally {
    LikenessOverrideService.remove('Joe', 'Perry', 1948);
  }
});

test('1940s preserves prior corrections and separates historical namesakes', async () => {
  assert.equal(CuratedSkinToneService.toneFor('Bruce', 'Smith', 1942, 'Minnesota'), 2);
  assert.equal(CuratedSkinToneService.toneFor('Bruce', 'Smith', 1985, 'Virginia Tech'), 7);
  const historicalBruce = lookup('Bruce', 'Smith', 1942, 'Minnesota');
  const { players } = await boardClass([{ key: historicalBruce.key! }], { fill: false });
  assert.equal(players[0].race, 2);
  assert.equal(players[0].toneSource, 'curated');
  const olderClay = lookup('Clay', 'Matthews', 1949, 'Georgia Tech');
  assert.equal(LikenessService.realFace(olderClay, 'm27'), null, 'a modern namesake scan cannot become a historical face');
  assert.equal(CuratedSkinToneService.toneFor('Clay', 'Matthews', 1949, 'Georgia Tech'), null);
  for (const [first, last, year, tone] of [['Marion', 'Motley', 1946, 6], ['Bobby', 'Mitchell', 1958, 6], ['Tony', 'Dorsett', 1977, 6]] as const) {
    assert.equal(CuratedSkinToneService.toneFor(first, last, year), tone);
  }
});
