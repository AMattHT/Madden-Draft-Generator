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

// Named portrait references and review scope: docs/likeness/1990s-batch-01.md.
const reviewed: [string, string, number, number][] = [
  ["Derrick", "Brooks", 1995, 7],
  ["Junior", "Seau", 1990, 4],
  ["Marshall", "Faulk", 1994, 7],
  ["Marvin", "Harrison", 1996, 6],
  ["Terrell", "Owens", 1996, 7],
  ["Jason", "Taylor", 1997, 5],
  ["Champ", "Bailey", 1999, 6],
  ["Warren", "Sapp", 1995, 7],
  ["Zach", "Thomas", 1996, 2],
  ["Edgerrin", "James", 1999, 7],
  ["Will", "Shields", 1993, 7],
  ["Willie", "Roaf", 1993, 7],
  ["Aeneas", "Williams", 1991, 7],
  ["Ronde", "Barber", 1997, 5],
  ["Alan", "Faneca", 1998, 2],
  ["Kevin", "Mawae", 1994, 2],
  ["Donovan", "McNabb", 1999, 7],
  ["Drew", "Bledsoe", 1993, 2],
  ["Orlando", "Pace", 1997, 6],
  ["Curtis", "Martin", 1995, 7],
  ["Tom", "Nalen", 1994, 2],
  ["Isaac", "Bruce", 1994, 6],
  ["Steve", "McNair", 1995, 7],
  ["Torry", "Holt", 1999, 6],
  ["Walter", "Jones", 1997, 7],
  ["Cortez", "Kennedy", 1990, 7],
  ["Warrick", "Dunn", 1997, 7],
  ["Jonathan", "Ogden", 1996, 5],
  ["Jimmy", "Smith", 1992, 7],
  ["Trent", "Green", 1993, 2],
  ["Willie", "Anderson", 1996, 7],
  ["Troy", "Vincent", 1992, 7],
  ["Mo", "Lewis", 1991, 7],
  ["Ted", "Washington", 1991, 7],
  ["Darren", "Sharper", 1997, 5],
];
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'likeness-1990s-'));
LikenessOverrideService._useFile(path.join(scratch, 'overrides.json'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const lookup = (first: string, last: string, year: number) => {
  const p = PlayerLookupService.byYear(year).find(p => p.firstName === first && p.lastName === last);
  assert.ok(p?.key, `${first} ${last} (${year}) exists`);
  return p;
};

test('reviewed 1990s players retain generics when no usable M27 head exists', () => {
  for (const [first, last, year] of reviewed) {
    assert.equal(LikenessService.realFace(lookup(first, last, year), 'm27'), null, first + ' ' + last);
  }
});

test('the first 1990s batch records reviewed palette choices', () => {
  for (const [first, last, year, tone] of reviewed) {
    const player = lookup(first, last, year);
    assert.equal(CuratedSkinToneService.toneFor(first, last, year, player.college), tone, `${first} ${last}`);
  }
});

test('1990s choices survive both draft exports and roster-add generation', skipWithoutData, async () => {
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

test('a manually selected generic face still wins over a recorded 1990s tone', skipWithoutData, async () => {
  const head = LikenessService.headsForTone(2, 'm27')[0];
  LikenessOverrideService.set('Junior', 'Seau', 1990, { faceAsset: head });
  try {
    const p = lookup('Junior', 'Seau', 1990);
    const { players } = await boardClass([{ key: p.key! }], { fill: false });
    const { prospects } = DraftClassBuilder.buildProspects(players, 'madden', {}, 'm27');
    assert.equal(prospects[0].PEPS, head);
  } finally {
    LikenessOverrideService.remove('Junior', 'Seau', 1990);
  }
});

test('1990s curation and head selection do not leak to modern namesakes', () => {
  for (const [first, last, year] of [['Marvin', 'Harrison Jr.', 2024], ['Jimmy', 'Smith', 2011], ['Zach', 'Thomas', 2022], ['Jason', 'Taylor II', 2023]] as const) {
    assert.equal(CuratedSkinToneService.toneFor(first, last, year), null, first + ' ' + last);
  }
  for (const [first, last, year] of [['Marvin', 'Harrison', 1996], ['Jimmy', 'Smith', 1992], ['Zach', 'Thomas', 1996]] as const) {
    const p = lookup(first, last, year);
    for (const game of ['m26', 'm27'] as const) assert.equal(LikenessService.realFace(p, game), null, game + ' ' + first + ' ' + last);
  }
});
