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

// Named portrait references and review scope: docs/likeness/1970s-batch-02.md.
const reviewed: [string, string, number, number][] = [
  ["Joe","Theismann",1971,2],
  ["Jim","Plunkett",1971,3],
  ["Bert","Jones",1973,2],
  ["Ottis","Anderson",1979,7],
  ["Wes","Chandler",1978,7],
  ["Archie","Manning",1971,2],
  ["Lester","Hayes",1977,7],
  ["Rod","Martin",1977,7],
  ["Bob","Golic",1979,2],
  ["Reggie","Williams",1976,7],
  ["Jack","Tatum",1971,7],
  ["Dwight","Clark",1979,2],
  ["Ahmad","Rashad",1972,5],
  ["Doug","Williams",1978,7],
  ["Charle","Young",1973,7],
  ["Carl","Weathers",1970,6],
  ["Drew","Pearson",1973,7],
  ["Chuck","Foreman",1973,7],
  ["Bob","Baumhower",1977,2],
  ["Gary","Fencik",1976,2],
  ["Nat","Moore",1974,6],
  ["Tom","Jackson",1973,7],
  ["Matt","Blair",1974,7],
  ["Reggie","McKenzie",1972,7],
  ["John","Dutton",1974,2],
];
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'likeness-1970s-batch02-'));
LikenessOverrideService._useFile(path.join(scratch, 'overrides.json'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const lookup = (first: string, last: string, year: number) => {
  const p = PlayerLookupService.byYear(year).find(p => p.firstName === first && p.lastName === last);
  assert.ok(p?.key, `${first} ${last} (${year}) exists`);
  return p;
};

test('reviewed 1970s batch 02 players retain generics when no usable M27 head exists', () => {
  for (const [first, last, year] of reviewed) {
    assert.equal(LikenessService.realFace(lookup(first, last, year), 'm27'), null, first + ' ' + last);
  }
});

test('the second 1970s batch records reviewed palette choices', () => {
  for (const [first, last, year, tone] of reviewed) {
    const player = lookup(first, last, year);
    assert.equal(CuratedSkinToneService.toneFor(first, last, year, player.college), tone, `${first} ${last}`);
  }
});

test('1970s batch 02 choices survive both draft exports and roster-add generation', skipWithoutData, async () => {
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

test('a manually selected generic face still wins over a recorded 1970s batch 02 tone', skipWithoutData, async () => {
  const head = LikenessService.headsForTone(7, 'm27')[0];
  LikenessOverrideService.set('Bob', 'Golic', 1979, { faceAsset: head });
  try {
    const p = lookup('Bob', 'Golic', 1979);
    const { players } = await boardClass([{ key: p.key! }], { fill: false });
    const { prospects } = DraftClassBuilder.buildProspects(players, 'madden', {}, 'm27');
    assert.equal(prospects[0].PEPS, head);
  } finally {
    LikenessOverrideService.remove('Bob', 'Golic', 1979);
  }
});

test('1970s batch 02 preserves prior corrections and unrelated namesakes', () => {
  for (const [first, last, year, tone] of [['Tony', 'Dorsett', 1977, 6], ['Cliff', 'Harris', 1970, 2], ['John', 'Stallworth', 1974, 6]] as const) {
    assert.equal(CuratedSkinToneService.toneFor(first, last, year), tone);
  }
  for (const [first, last, year] of [['Reggie', 'Williams', 2004], ['Reggie', 'McKenzie', 1985], ['Clay', 'Matthews', 1978], ['Mike', 'Reid', 1970]] as const) {
    assert.equal(CuratedSkinToneService.toneFor(first, last, year), null, first + ' ' + last + ' ' + year);
  }
});
