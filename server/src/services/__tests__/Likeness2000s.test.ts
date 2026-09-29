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

// Named portrait references and review scope: docs/likeness/2000s-batch-01.md.
const reviewed: [string, string, number, number][] = [
  ["Julius", "Peppers", 2002, 6],
  ["Eli", "Manning", 2004, 2],
  ["Brian", "Urlacher", 2000, 2],
  ["Reggie", "Wayne", 2001, 7],
  ["Jahri", "Evans", 2006, 7],
  ["Terrell", "Suggs", 2003, 7],
  ["Carson", "Palmer", 2003, 2],
  ["Kevin", "Williams", 2003, 6],
  ["Ed", "Reed", 2002, 7],
  ["Logan", "Mankins", 2005, 2],
  ["Steve", "Smith Sr.", 2001, 5],
  ["Justin", "Smith", 2001, 2],
  ["Jared", "Allen", 2004, 2],
  ["DeMarcus", "Ware", 2005, 6],
  ["Haloti", "Ngata", 2006, 4],
  ["Lance", "Briggs", 2003, 6],
  ["Andre", "Johnson", 2003, 7],
  ["Steve", "Hutchinson", 2001, 2],
  ["Patrick", "Willis", 2007, 7],
  ["Darrelle", "Revis", 2007, 7],
  ["Marshal", "Yanda", 2007, 2],
  ["Richard", "Seymour", 2001, 5],
  ["John", "Abraham", 2000, 7],
  ["Vince", "Wilfork", 2004, 7],
  ["Roddy", "White", 2005, 7],
  ["Eric", "Weddle", 2007, 2],
  ["Jay", "Cutler", 2006, 2],
  ["Anquan", "Boldin", 2003, 7],
  ["Matt", "Forte", 2008, 5],
  ["Dwight", "Freeney", 2002, 7],
  ["Joe", "Staley", 2007, 2],
  ["Karlos", "Dansby", 2004, 7],
  ["Josh", "Sitton", 2008, 2],
  ["Derrick", "Johnson", 2005, 6],
  ["Mario", "Williams", 2006, 7],
];
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'likeness-2000s-'));
LikenessOverrideService._useFile(path.join(scratch, 'overrides.json'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const lookup = (first: string, last: string, year: number) => {
  const p = PlayerLookupService.byYear(year).find(p => p.firstName === first && p.lastName === last);
  assert.ok(p?.key, `${first} ${last} (${year}) exists`);
  return p;
};

test('reviewed 2000s players retain generics when no usable M27 head exists', () => {
  for (const [first, last, year] of reviewed) {
    assert.equal(LikenessService.realFace(lookup(first, last, year), 'm27'), null, first + ' ' + last);
  }
});

test('the first 2000s batch records reviewed palette choices', () => {
  for (const [first, last, year, tone] of reviewed) {
    const player = lookup(first, last, year);
    assert.equal(CuratedSkinToneService.toneFor(first, last, year, player.college), tone, `${first} ${last}`);
  }
});

test('2000s choices survive both draft exports and roster-add generation', skipWithoutData, async () => {
  const originals = reviewed.map(([first, last, year]) => lookup(first, last, year));
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
        assert.equal(vis.skinTone, tone);
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

test('a manually selected generic face still wins over a recorded 2000s tone', skipWithoutData, async () => {
  const head = LikenessService.headsForTone(2, 'm27')[0];
  LikenessOverrideService.set('Steve', 'Smith Sr.', 2001, { faceAsset: head });
  try {
    const p = lookup('Steve', 'Smith Sr.', 2001);
    const { players } = await boardClass([{ key: p.key! }], { fill: false });
    const { prospects } = DraftClassBuilder.buildProspects(players, 'madden', {}, 'm27');
    assert.equal(prospects[0].PEPS, head);
  } finally {
    LikenessOverrideService.remove('Steve', 'Smith Sr.', 2001);
  }
});

test('same-year namesakes keep their college-qualified curation separate', () => {
  assert.equal(CuratedSkinToneService.toneFor('Alex', 'Smith', 2005, 'Utah'), 2);
  assert.equal(CuratedSkinToneService.toneFor('Alex', 'Smith', 2005, 'Stanford'), null);
  assert.equal(CuratedSkinToneService.toneFor('Steve', 'Smith', 2007), null);
  assert.equal(CuratedSkinToneService.toneFor('Derrick', 'Johnson', 2005, 'Texas'), 6);
  assert.equal(CuratedSkinToneService.toneFor('Derrick', 'Johnson', 2005, 'Washington'), null);
});
