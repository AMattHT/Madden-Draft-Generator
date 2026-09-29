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

// Named portrait references and review scope: docs/likeness/1950s-batch-01.md.
const reviewed: [string, string, number, number, string][] = [
  ["Johnny","Unitas",1955,2,"Louisville"],
  ["Jim","Brown",1957,7,"Syracuse"],
  ["Don","Maynard",1957,2,"Texas-El Paso"],
  ["Forrest","Gregg",1956,2,"SMU"],
  ["Ray","Nitschke",1958,2,"Illinois"],
  ["Bart","Starr",1956,2,"Alabama"],
  ["Doug","Atkins",1953,2,"Tennessee"],
  ["Jim","Parker",1957,7,"Ohio St."],
  ["Joe","Fortunato",1952,2,"Mississippi St."],
  ["Yale","Lary",1952,2,"Texas A&M"],
  ["Lenny","Moore",1956,6,"Penn St."],
  ["Harlon","Hill",1954,2,"North Alabama"],
  ["Cookie","Gilchrist",1954,7,""],
  ["Erich","Barnes",1958,5,"Purdue"],
  ["Art","Powell",1959,6,"San Jose St."],
  ["Timmy","Brown",1959,6,"Ball St."],
  ["John","Wooten",1959,7,"Colorado"],
  ["John","Brodie",1957,2,"Stanford"],
  ["Dick","Schafrath",1959,2,"Ohio St."],
  ["Wayne","Walker",1958,2,"Idaho"],
  ["Eddie","Meador",1959,2,"Arkansas Tech"],
  ["Jack","Pardee",1957,2,"Texas A&M"],
  ["Frank","Ryan",1958,2,"Rice"],
  ["Boyd","Dowler",1959,2,"Colorado"],
  ["Earl","Morrall",1956,2,"Michigan St."],
];
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'likeness-1950s-'));
LikenessOverrideService._useFile(path.join(scratch, 'overrides.json'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const lookup = (first: string, last: string, year: number, college?: string) => {
  const p = PlayerLookupService.byYear(year).find(p => p.firstName === first && p.lastName === last && (!college || p.college === college));
  assert.ok(p?.key, `${first} ${last} (${year}) exists`);
  return p;
};

test('reviewed 1950s players retain generics when no usable M27 head exists', () => {
  for (const [first, last, year, , college] of reviewed) {
    assert.equal(LikenessService.realFace(lookup(first, last, year, college), 'm27'), null, first + ' ' + last);
  }
});

test('the first 1950s batch records reviewed palette choices', () => {
  for (const [first, last, year, tone, college] of reviewed) {
    const player = lookup(first, last, year, college);
    assert.equal(CuratedSkinToneService.toneFor(first, last, year, player.college), tone, `${first} ${last}`);
  }
});

test('1950s choices survive both draft exports and roster-add generation', skipWithoutData, async () => {
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

test('a manually selected generic face still wins over a recorded 1950s tone', skipWithoutData, async () => {
  const head = LikenessService.headsForTone(7, 'm27')[0];
  LikenessOverrideService.set('Ray', 'Nitschke', 1958, { faceAsset: head });
  try {
    const p = lookup('Ray', 'Nitschke', 1958);
    const { players } = await boardClass([{ key: p.key! }], { fill: false });
    const { prospects } = DraftClassBuilder.buildProspects(players, 'madden', {}, 'm27');
    assert.equal(prospects[0].PEPS, head);
  } finally {
    LikenessOverrideService.remove('Ray', 'Nitschke', 1958);
  }
});

test('1950s preserves prior corrections and separates historical namesakes', async () => {
  assert.equal(CuratedSkinToneService.toneFor('Jim', 'Brown', 1957, 'Syracuse'), 7);
  for (const [year, college] of [[1956, 'UCLA'], [1966, 'Nebraska']] as const) {
    assert.equal(CuratedSkinToneService.toneFor('Jim', 'Brown', year, college), null);
    const other = lookup('Jim', 'Brown', year, college);
    const { players } = await boardClass([{ key: other.key! }], { fill: false });
    assert.notEqual(players[0].toneSource, 'curated', 'other Jim Brown entries remain unreviewed');
  }
  const olderRay = lookup('Ray', 'Lewis', 1953, 'Boise St.');
  assert.equal(LikenessService.realFace(olderRay, 'm27'), null, 'a modern namesake scan cannot become a historical face');
  assert.equal(CuratedSkinToneService.toneFor('Ray', 'Lewis', 1953, 'Boise St.'), null);
  for (const [first, last, year, tone] of [['Bobby', 'Mitchell', 1958, 6], ['Fran', 'Tarkenton', 1961, 2], ['Tony', 'Dorsett', 1977, 6]] as const) {
    assert.equal(CuratedSkinToneService.toneFor(first, last, year), tone);
  }
});
