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

// Named portrait references and review scope: docs/likeness/2010s-batch-01.md.
const reviewed: [string, string, number, number][] = [
  ["Fletcher", "Cox", 2012, 7],
  ["Antonio", "Brown", 2010, 7],
  ["Earl", "Thomas", 2010, 5],
  ["Mitchell", "Schwartz", 2012, 2],
  ["Justin", "Houston", 2011, 7],
  ["Andrew", "Luck", 2012, 2],
  ["Jurrell", "Casey", 2011, 5],
  ["Rodger", "Saffold", 2010, 5],
  ["NaVorro", "Bowman", 2010, 7],
  ["Demaryius", "Thomas", 2010, 5],
  ["Mike", "Iupati", 2010, 4],
  ["Everson", "Griffen", 2010, 6],
  ["Darius", "Slay", 2013, 6],
  ["K.J.", "Wright", 2011, 7],
  ["Corey", "Linsley", 2014, 2],
  ["Marcus", "Peters", 2015, 7],
  ["Matt", "Judon", 2016, 7],
  ["Lawrence", "Guy", 2011, 4],
  ["Dez", "Bryant", 2010, 7],
  ["Rodney", "Hudson", 2011, 7],
  ["Travis", "Frederick", 2013, 2],
  ["DeMarco", "Murray", 2011, 6],
  ["Mark", "Barron", 2012, 7],
  ["Anthony", "Castonzo", 2011, 2],
  ["Muhammad", "Wilkerson", 2011, 7],
  ["Golden", "Tate", 2010, 4],
  ["Ben", "Jones", 2012, 2],
  ["Donovan", "Smith", 2015, 6],
  ["Za'Darius", "Smith", 2015, 6],
  ["Marcell", "Dareus", 2011, 7],
  ["Bryan", "Bulaga", 2010, 2],
  ["Mitch", "Morse", 2015, 2],
  ["Micah", "Hyde", 2013, 4],
  ["Todd", "Gurley", 2015, 7],
  ["Zane", "Beadles", 2010, 2],
];
// PIDs are per game; missing M27 portraits deliberately remain 0.
const aliases: [string, string, number, string, number, number][] = [
  ['Darius', 'Slay', 2013, 'slayjrdarius_1426', 6273, 6273],
  ['Golden', 'Tate', 2010, 'tateiiigolden_9755', 2909, 0],
  ['Todd', 'Gurley', 2015, 'gurleyiitodd_2399', 7155, 0],
];
function assertGenericPortrait(pid: unknown, first: string, last: string) {
  assert.ok(typeof pid === 'number');
  const tone = reviewed.find(([f, l]) => f === first && l === last)![3];
  const candidates = LikenessService.headsForTone(tone, 'm27').map(head => LikenessService.genericPid(head, 'm27'));
  assert.ok(pid > 0 && candidates.includes(pid), `${first} ${last}: missing photo uses a matching generic portrait`);
}
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'likeness-2010s-'));
LikenessOverrideService._useFile(path.join(scratch, 'overrides.json'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const lookup = (first: string, last: string, year: number) => {
  const p = PlayerLookupService.byYear(year).find(p => p.firstName === first && p.lastName === last);
  assert.ok(p?.key, `${first} ${last} (${year}) exists`);
  return p;
};

test('2010s reviewed name variants use their catalog heads and portraits in both games', () => {
  for (const [first, last, year, asset, pid26, pid27] of aliases) {
    const p = lookup(first, last, year);
    for (const game of ['m26', 'm27'] as const) {
      const face = LikenessService.realFace(p, game);
      assert.equal(face?.assetName, asset, `${game} ${first} ${last}`);
      assert.equal(face?.portraitPid, game === 'm26' ? pid26 : pid27);
      assert.equal(LikenessService.portraitPidForAsset(asset, game), game === 'm26' ? pid26 : pid27);
      assert.equal(LikenessService.realFace({ ...p, playerAssetsId: null, draftYear: 1980 }, game), null,
        'a reviewed alias cannot hand the scan to a historical namesake');
    }
  }
});

test('the first 2010s batch records reviewed palette choices', () => {
  for (const [first, last, year, tone] of reviewed) {
    assert.equal(CuratedSkinToneService.toneFor(first, last, year), tone, `${first} ${last}`);
  }
});

test('2010s choices survive both draft exports and roster-add generation', skipWithoutData, async () => {
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

test('a manually selected generic face still wins over a restored 2010s scan', skipWithoutData, async () => {
  const head = LikenessService.headsForTone(5, 'm27')[0];
  LikenessOverrideService.set('Darius', 'Slay', 2013, { faceAsset: head });
  try {
    const p = lookup('Darius', 'Slay', 2013);
    const { players } = await boardClass([{ key: p.key! }], { fill: false });
    const { prospects } = DraftClassBuilder.buildProspects(players, 'madden', {}, 'm27');
    assert.equal(prospects[0].PEPS, head);
  } finally {
    LikenessOverrideService.remove('Darius', 'Slay', 2013);
  }
});

test('Matt Judon alias uses only the target game catalog', () => {
  const p = lookup('Matt', 'Judon', 2016);
  assert.equal(LikenessService.realFace(p, 'm26')?.assetName, 'JudonMatthew_17728');
  assert.equal(LikenessService.realFace(p, 'm26')?.portraitPid, 8088);
  assert.equal(LikenessService.realFace(p, 'm27'), null);
  assert.equal(LikenessService.realFace({ ...p, draftYear: 1980 }, 'm26'), null);
});
