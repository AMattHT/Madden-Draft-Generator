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

// Named portrait references and review scope: docs/likeness/1960s-batch-01.md.
const reviewed: [string, string, number, number, string][] = [
  ["Fran","Tarkenton",1961,2,"Georgia"],
  ["Carl","Eller",1964,7,"Minnesota"],
  ["Merlin","Olsen",1962,2,"Utah St."],
  ["Jim","Otto",1960,2,"Miami (FL)"],
  ["Ted","Hendricks",1969,2,"Miami (FL)"],
  ["Paul","Warfield",1964,7,"Ohio St."],
  ["Herb","Adderley",1961,7,"Michigan St."],
  ["Bobby","Bell",1963,7,"Minnesota"],
  ["Roger","Staubach",1964,2,"Navy"],
  ["Ron","Yary",1968,2,"USC"],
  ["Jimmy","Johnson",1961,6,"UCLA"],
  ["Mel","Renfro",1964,5,"Oregon"],
  ["Roman","Gabriel",1962,3,"North Carolina St."],
  ["Lance","Alworth",1962,2,"Arkansas"],
  ["Ken","Houston",1967,7,"Prairie View A&M"],
  ["Ken","Stabler",1968,2,"Alabama"],
  ["Charlie","Joiner",1969,5,"Grambling St."],
  ["Larry","Wilson",1960,2,"Utah"],
  ["Leroy","Kelly",1964,7,"Morgan St."],
  ["L.C.","Greenwood",1969,7,"Ark-Pine Bluff"],
  ["Willie","Lanier",1967,7,"Morgan St."],
  ["Bob","Brown",1964,7,"Nebraska"],
  ["Rayfield","Wright",1967,5,"Fort Valley St."],
  ["Dick","Butkus",1965,2,"Illinois"],
  ["Otis","Taylor",1965,7,"Prairie View A&M"],
  ["Larry","Csonka",1968,2,"Syracuse"],
  ["Bubba","Smith",1967,7,"Michigan St."],
  ["Gale","Sayers",1965,7,"Kansas"],
  ["Willie","Wood",1960,6,"USC"],
  ["Fred","Williamson",1960,5,"Northwestern"],
  ["Willie","Brown",1963,6,"Grambling State"],
  ["Larry","Little",1967,7,"Bethune-Cookman"],
  ["Deacon","Jones",1961,7,"Miss. Valley St."],
  ["Fred","Biletnikoff",1965,2,"Florida St."],
  ["Jim","Marshall",1960,6,"Ohio St."],
];
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'likeness-1960s-'));
LikenessOverrideService._useFile(path.join(scratch, 'overrides.json'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const lookup = (first: string, last: string, year: number, college?: string) => {
  const p = PlayerLookupService.byYear(year).find(p => p.firstName === first && p.lastName === last && (!college || p.college === college));
  assert.ok(p?.key, `${first} ${last} (${year}) exists`);
  return p;
};

test('reviewed 1960s players retain generics when no usable M27 head exists', () => {
  for (const [first, last, year, , college] of reviewed) {
    assert.equal(LikenessService.realFace(lookup(first, last, year, college), 'm27'), null, first + ' ' + last);
  }
});

test('the first 1960s batch records reviewed palette choices', () => {
  for (const [first, last, year, tone, college] of reviewed) {
    const player = lookup(first, last, year, college);
    assert.equal(CuratedSkinToneService.toneFor(first, last, year, player.college), tone, `${first} ${last}`);
  }
});

test('1960s choices survive both draft exports and roster-add generation', skipWithoutData, async () => {
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

test('a manually selected generic face still wins over a recorded 1960s tone', skipWithoutData, async () => {
  const head = LikenessService.headsForTone(7, 'm27')[0];
  LikenessOverrideService.set('Fran', 'Tarkenton', 1961, { faceAsset: head });
  try {
    const p = lookup('Fran', 'Tarkenton', 1961);
    const { players } = await boardClass([{ key: p.key! }], { fill: false });
    const { prospects } = DraftClassBuilder.buildProspects(players, 'madden', {}, 'm27');
    assert.equal(prospects[0].PEPS, head);
  } finally {
    LikenessOverrideService.remove('Fran', 'Tarkenton', 1961);
  }
});

test('1960s preserves prior corrections and separates namesakes by year and college', async () => {
  assert.equal(CuratedSkinToneService.toneFor('Bob', 'Brown', 1964, 'Nebraska'), 7);
  assert.equal(CuratedSkinToneService.toneFor('Bob', 'Brown', 1964, 'Ark-Pine Bluff'), null);
  assert.equal(CuratedSkinToneService.toneFor('Bob', 'Brown', 1962, 'Michigan'), null);
  assert.equal(CuratedSkinToneService.toneFor('Willie', 'Brown', 1964, 'USC'), null);
  const other = lookup('Bob', 'Brown', 1964, 'Ark-Pine Bluff');
  const { players } = await boardClass([{ key: other.key! }], { fill: false });
  assert.equal(players[0].race, 2, 'the unreviewed same-year namesake keeps his prior choice');
  assert.notEqual(players[0].toneSource, 'curated');
  for (const [first, last, year, tone] of [['Bob', 'Hayes', 1964, 6], ['Paul', 'Krause', 1964, 2], ['Tony', 'Dorsett', 1977, 6]] as const) {
    assert.equal(CuratedSkinToneService.toneFor(first, last, year), tone);
  }
});
