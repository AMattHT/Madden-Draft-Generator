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

// Named portrait references and review scope: docs/likeness/1980s-batch-01.md.
const reviewed: [string, string, number, number][] = [
  ["Bruce", "Smith", 1985, 7],
  ["Dan", "Marino", 1983, 2],
  ["John", "Elway", 1983, 2],
  ["Anthony", "Munoz", 1980, 4],
  ["Bruce", "Matthews", 1983, 2],
  ["Steve", "Young", 1984, 2],
  ["Randall", "McDaniel", 1988, 7],
  ["Mike", "Singletary", 1981, 5],
  ["Chris", "Doleman", 1985, 7],
  ["Rickey", "Jackson", 1981, 7],
  ["Randall", "Cunningham", 1985, 5],
  ["Thurman", "Thomas", 1988, 6],
  ["Boomer", "Esiason", 1984, 2],
  ["Tim", "Brown", 1988, 7],
  ["Derrick", "Thomas", 1989, 7],
  ["Marcus", "Allen", 1982, 6],
  ["Jim", "Kelly", 1983, 2],
  ["Darrell", "Green", 1983, 7],
  ["Steve", "Wisniewski", 1989, 2],
  ["Lomas", "Brown", 1985, 7],
  ["Andre", "Reed", 1985, 6],
  ["Vinny", "Testaverde", 1987, 2],
  ["Rich", "Gannon", 1987, 2],
  ["Hardy", "Nickerson", 1987, 7],
  ["Troy", "Aikman", 1989, 2],
  ["Eric", "Allen", 1988, 6],
  ["Dermontti", "Dawson", 1988, 7],
  ["Howie", "Long", 1981, 2],
  ["Mike", "Munchak", 1982, 2],
  ["Kevin", "Greene", 1985, 2],
  ["Cornelius", "Bennett", 1987, 5],
  ["Art", "Monk", 1980, 7],
  ["Seth", "Joyner", 1986, 7],
  ["Michael Dean", "Perry", 1988, 7],
  ["Bill", "Romanowski", 1988, 2],
];
// PIDs are per game; missing M27 portraits deliberately remain 0.
const aliases: [string, string, number, string, number, number][] = [
  ['John', 'Elway', 1983, 'ElwayJohn_11420', 5629, 5629],
];
function assertGenericPortrait(pid: unknown, first: string, last: string) {
  assert.ok(typeof pid === 'number');
  const tone = reviewed.find(([f, l]) => f === first && l === last)![3];
  const candidates = LikenessService.headsForTone(tone, 'm27').map(head => LikenessService.genericPid(head, 'm27'));
  assert.ok(pid > 0 && candidates.includes(pid), `${first} ${last}: missing photo uses a matching generic portrait`);
}
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'likeness-1980s-'));
LikenessOverrideService._useFile(path.join(scratch, 'overrides.json'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const lookup = (first: string, last: string, year: number) => {
  const p = PlayerLookupService.byYear(year).find(p => p.firstName === first && p.lastName === last);
  assert.ok(p?.key, `${first} ${last} (${year}) exists`);
  return p;
};

test('1980s reviewed name variants use their catalog heads and portraits in both games', () => {
  for (const [first, last, year, asset, pid26, pid27] of aliases) {
    const p = lookup(first, last, year);
    for (const game of ['m26', 'm27'] as const) {
      const face = LikenessService.realFace(p, game);
      assert.equal(face?.assetName, asset, `${game} ${first} ${last}`);
      assert.equal(face?.portraitPid, game === 'm26' ? pid26 : pid27);
      assert.equal(LikenessService.portraitPidForAsset(asset, game), game === 'm26' ? pid26 : pid27);
      assert.equal(LikenessService.realFace({ ...p, playerAssetsId: null, draftYear: 2020 }, game), null,
        'a reviewed alias cannot hand the scan to a different-era namesake');
    }
  }
});

test('the first 1980s batch records reviewed palette choices', () => {
  for (const [first, last, year, tone] of reviewed) {
    assert.equal(CuratedSkinToneService.toneFor(first, last, year), tone, `${first} ${last}`);
  }
});

test('1980s choices survive both draft exports and roster-add generation', skipWithoutData, async () => {
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
    for (const [first, last, , asset, pid26, pid27] of aliases) {
      const p = parsed.find(p => p.firstName === first && p.lastName === last)!;
      assert.equal(p.PEPS, asset);
      const index = players.findIndex(p => p.firstName === first && p.lastName === last);
      const customSlot = game === 'm26' ? PortraitSlotService.pidMap(players).get(index) : undefined;
      const expected = customSlot ?? (game === 'm26' ? pid26 : pid27);
      if (expected) assert.equal(p.PID, expected, 'own portrait unless an existing M26 custom portrait slot is assigned');
      else assertGenericPortrait(p.PID, first, last);
    }
  }
  RosterAddService._reset();
  for (let i = 0; i < originals.length; i++) {
    const p = await RosterAddService.generate(originals[i].key!);
    assert.equal(p.skinTone, reviewed[i][3]);
    const alias = aliases.find(([f, l]) => p.firstName === f && p.lastName === l);
    if (alias) {
      assert.equal(p.assetName, alias[3]);
      if (alias[5]) assert.equal(p.portraitPid, alias[5]);
      else assertGenericPortrait(p.portraitPid, p.firstName, p.lastName);
    }
  }
});

test('a manually selected generic face still wins over a restored 1980s scan', skipWithoutData, async () => {
  const head = LikenessService.headsForTone(5, 'm27')[0];
  LikenessOverrideService.set('John', 'Elway', 1983, { faceAsset: head });
  try {
    const p = lookup('John', 'Elway', 1983);
    const { players } = await boardClass([{ key: p.key! }], { fill: false });
    const { prospects } = DraftClassBuilder.buildProspects(players, 'madden', {}, 'm27');
    assert.equal(prospects[0].PEPS, head);
  } finally {
    LikenessOverrideService.remove('John', 'Elway', 1983);
  }
});

test('1980s curation preserves existing choices and rejects newer namesakes', () => {
  assert.equal(LikenessService.realFace(lookup('Marcus', 'Allen', 1982), 'm27'), null);
  assert.equal(LikenessService.realFace(lookup('Hardy', 'Nickerson', 1987), 'm27'), null);
  assert.equal(CuratedSkinToneService.toneFor('Marcus', 'Allen', 2018), null);
  assert.equal(CuratedSkinToneService.toneFor('Hardy', 'Nickerson', 2017), null);
  assert.equal(CuratedSkinToneService.toneFor('Tony', 'Dorsett', 1977), 6);
  assert.equal(CuratedSkinToneService.toneFor('Dwight', 'Stephenson', 1980), 6);
  assert.equal(CuratedSkinToneService.toneFor('Jimbo', 'Covert', 1983), 2);
});
