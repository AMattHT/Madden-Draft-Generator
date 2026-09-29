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
import { PortraitSlotService } from '../PortraitSlotService';
import { skipWithoutData } from './data';

// Named portrait references and review scope: docs/likeness/2020s-batch-01.md.
const reviewed: [string, string, number, number][] = [
  ['Gregory', 'Rousseau', 2021, 6], ['Michael', 'Danna', 2020, 6], ['Delmar', 'Glaze', 2024, 7],
  ['Tedarrell', 'Slaton', 2021, 7], ['Zachary', 'Carter', 2022, 7], ['James', 'Hudson', 2021, 7],
  ['Bravvion', 'Roy', 2020, 5], ['Jeff', 'Gladney', 2020, 5], ['Keith', 'Taylor', 2021, 7],
  ['Freddie', 'Swain', 2020, 4], ['Chris', 'Claybrooks', 2020, 7], ['Ross', 'Blacklock', 2020, 5],
  ['Alton', 'Robinson', 2020, 6], ['Kamal', 'Martin', 2020, 7], ['James', 'Proche', 2020, 7],
  ['Eno', 'Benjamin', 2020, 6], ['Michael', 'Hall', 2024, 7], ['Lynn', 'Bowden Jr.', 2020, 5],
  ['Troy', 'Pride Jr.', 2020, 7], ['Khalil', 'Davis', 2020, 7], ['Camaron', 'Cheeseman', 2021, 2],
  ['Tre', 'Norwood', 2021, 4], ['Derrek', 'Tuszka', 2020, 2], ['McTelvin', 'Agim', 2020, 7],
  ['John', 'Reid', 2020, 4],
];
const aliases: [string, string, number, string, number][] = [
  ['Gregory', 'Rousseau', 2021, 'RousseauGreg_21517', 928],
  ['Michael', 'Danna', 2020, 'DannaMike_21231', 853],
  ['Delmar', 'Glaze', 2024, 'GlazeDJ_14731', 10083],
];
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'likeness-2020s-'));
LikenessOverrideService._useFile(path.join(scratch, 'overrides.json'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const lookup = (first: string, last: string, year: number) => {
  const p = PlayerLookupService.byYear(year).find(p => p.firstName === first && p.lastName === last);
  assert.ok(p?.key, `${first} ${last} (${year}) exists`);
  return p;
};

test('modern reviewed name variants use their catalog heads and portraits in both games', () => {
  for (const [first, last, year, asset, pid] of aliases) {
    const p = lookup(first, last, year);
    for (const game of ['m26', 'm27'] as const) {
      const face = LikenessService.realFace(p, game);
      assert.equal(face?.assetName, asset, `${game} ${first} ${last}`);
      assert.equal(face?.portraitPid, pid);
      assert.equal(LikenessService.realFace({ ...p, playerAssetsId: null, draftYear: 1980 }, game), null,
        'a reviewed alias cannot hand the scan to a historical namesake');
    }
  }
});

test('the first 2020s batch records reviewed palette choices', () => {
  for (const [first, last, year, tone] of reviewed) {
    assert.equal(CuratedSkinToneService.toneFor(first, last, year), tone, `${first} ${last}`);
  }
});

test('2020s choices survive both draft exports and roster-add generation', skipWithoutData, async () => {
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
    for (const [first, last, , asset, pid] of aliases) {
      const p = parsed.find(p => p.firstName === first && p.lastName === last)!;
      assert.equal(p.PEPS, asset);
      const index = players.findIndex(p => p.firstName === first && p.lastName === last);
      const customSlot = game === 'm26' ? PortraitSlotService.pidMap(players).get(index) : undefined;
      assert.equal(p.PID, customSlot ?? pid, 'own portrait unless an existing M26 custom portrait slot is assigned');
    }
  }
  RosterAddService._reset();
  for (let i = 0; i < originals.length; i++) {
    const p = await RosterAddService.generate(originals[i].key!);
    assert.equal(p.skinTone, reviewed[i][3]);
    const alias = aliases.find(([f, l]) => p.firstName === f && p.lastName === l);
    if (alias) { assert.equal(p.assetName, alias[3]); assert.equal(p.portraitPid, alias[4]); }
  }
});

test('a manually selected generic face still wins over a restored modern scan', skipWithoutData, async () => {
  const head = LikenessService.headsForTone(5, 'm27')[0];
  LikenessOverrideService.set('Gregory', 'Rousseau', 2021, { faceAsset: head });
  try {
    const p = lookup('Gregory', 'Rousseau', 2021);
    const { players } = await boardClass([{ key: p.key! }], { fill: false });
    const { prospects } = DraftClassBuilder.buildProspects(players, 'madden', {}, 'm27');
    assert.equal(prospects[0].PEPS, head);
  } finally {
    LikenessOverrideService.remove('Gregory', 'Rousseau', 2021);
  }
});
