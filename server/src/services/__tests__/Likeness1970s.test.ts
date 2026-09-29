import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CuratedSkinToneService } from '../CuratedSkinToneService';
import { PlayerLookupService } from '../PlayerLookupService';
import { LikenessOverrideService } from '../LikenessOverrideService';
import { enrichedClass, boardClass, teamGreatsClass } from '../DraftEnrichment';
import { DraftClassBuilder } from '../DraftClassBuilder';
import { MdcService } from '../MdcService';
import { Mdc27Service } from '../Mdc27Service';
import { RosterAddService } from '../RosterAddService';
import { LikenessService } from '../LikenessService';
import { skipWithoutData } from './data';

// Reviewed against the references in docs/likeness/1970s-batch-01.md.
// These are game palette choices, not demographic labels or exact color readings.
const reviewed: [string, string, number, number][] = [
  ['Terry', 'Bradshaw', 1970, 2], ['Mel', 'Blount', 1970, 7], ['Cliff', 'Harris', 1970, 2],
  ['John', 'Riggins', 1971, 2], ['Jack', 'Youngblood', 1971, 2], ['Jack', 'Ham', 1971, 2],
  ['Dan', 'Dierdorf', 1971, 2], ['Harold', 'Carmichael', 1971, 7],
  ['Franco', 'Harris', 1972, 4], ['Cliff', 'Branch', 1972, 7],
  ['John', 'Hannah', 1973, 2], ['Ray', 'Guy', 1973, 2], ['Dan', 'Fouts', 1973, 2],
  ['Randy', 'Gradishar', 1974, 2], ['Lynn', 'Swann', 1974, 7], ['Dave', 'Casper', 1974, 2],
  ['Jack', 'Lambert', 1974, 2], ['John', 'Stallworth', 1974, 6], ['Mike', 'Webster', 1974, 2],
  ['Randy', 'White', 1975, 2], ['Robert', 'Brazile', 1975, 7], ['Fred', 'Dean', 1975, 7],
  ['Lee Roy', 'Selmon', 1976, 7], ['Mike', 'Haynes', 1976, 4], ['Jackie', 'Slater', 1976, 7],
  ['Harry', 'Carson', 1976, 7], ['Steve', 'Largent', 1976, 2],
  ['Tony', 'Dorsett', 1977, 6], ['Joe', 'Klecko', 1977, 2],
  ['Earl', 'Campbell', 1978, 7], ['James', 'Lofton', 1978, 7], ['Ozzie', 'Newsome', 1978, 7],
  ['Warren', 'Moon', 1978, 7], ['Dan', 'Hampton', 1979, 2], ['Kellen', 'Winslow', 1979, 5],
];

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'likeness-1970s-'));
LikenessOverrideService._useFile(path.join(scratch, 'overrides.json'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

test('the first 1970s batch has recorded choices even when a cached photo exists', () => {
  for (const [first, last, year, tone] of reviewed) {
    assert.equal(CuratedSkinToneService.toneFor(first, last, year), tone, `${first} ${last} (${year})`);
  }
  assert.equal(CuratedSkinToneService.toneFor('Tony', 'Dorsett', 1978), null, 'a correction is year-specific');
});

test('Tony Dorsett keeps his reviewed tone in draft, team and custom-board regeneration', skipWithoutData, async () => {
  const key = PlayerLookupService.byYear(1977).find(p => p.firstName === 'Tony' && p.lastName === 'Dorsett')!.key!;
  for (const { players } of [
    await enrichedClass(1977, 'NFL', { fill: false }),
    await teamGreatsClass('DAL'),
    await boardClass([{ key }], { fill: false }),
  ]) {
    const tony = players.find(p => p.firstName === 'Tony' && p.lastName === 'Dorsett');
    assert.equal(tony?.race, 6);
    assert.equal(tony?.toneSource, 'curated');
  }
});

test('reviewed tones reach both game exports and Madden 27 roster additions', skipWithoutData, async () => {
  const keys = reviewed.map(([first, last, year]) => {
    const p = PlayerLookupService.byYear(year).find(p => p.firstName === first && p.lastName === last);
    assert.ok(p?.key, `${first} ${last} exists in the pool`);
    return p.key;
  });
  const { players } = await boardClass(keys.map(key => ({ key })), { fill: false });
  const expected = new Map(reviewed.map(([first, last, , tone]) => [`${first}|${last}`, tone]));
  const baselines = new Map(players.map(p => [`${p.firstName}|${p.lastName}`, p]));
  for (const game of ['m26', 'm27'] as const) {
    const built = game === 'm26' ? DraftClassBuilder.buildMdc(players) : DraftClassBuilder.buildMdc27(players);
    const parsed = game === 'm26' ? MdcService.parse(built.buffer) : Mdc27Service.parse(built.buffer);
    for (const p of parsed) {
      const tone = expected.get(`${p.firstName}|${p.lastName}`);
      if (tone == null) continue;
      const scan = LikenessService.realFace(baselines.get(`${p.firstName}|${p.lastName}`)!, game);
      if (scan) {
        assert.equal(p.PEPS, scan.assetName, 'a verified scan still wins over the generic tone');
        continue;
      }
      const visuals = p.visuals as { skinTone?: number; genericHeadName?: string };
      assert.equal(visuals.skinTone, tone, `${game} ${p.firstName} ${p.lastName}`);
      assert.match(visuals.genericHeadName ?? '', new RegExp(`^gen_${tone}_`, 'i'));
    }
    assert.equal(parsed.filter(p => expected.has(`${p.firstName}|${p.lastName}`)).length, reviewed.length);
  }
  RosterAddService._reset();
  for (let i = 0; i < keys.length; i++) {
    const roster = await RosterAddService.generate(keys[i]);
    assert.equal(roster.skinTone, reviewed[i][3], roster.firstName + ' ' + roster.lastName);
    assert.match(roster.genericHead, new RegExp(`^gen_${reviewed[i][3]}_`, 'i'));
  }
});

test('a user likeness correction still takes precedence over the reviewed batch', skipWithoutData, async () => {
  const key = PlayerLookupService.byYear(1977).find(p => p.firstName === 'Tony' && p.lastName === 'Dorsett')!.key!;
  LikenessOverrideService.set('Tony', 'Dorsett', 1977, { skinTone: 5 });
  try {
    const { players } = await boardClass([{ key }], { fill: false });
    assert.equal(players[0].race, 5);
    assert.equal(players[0].toneSource, 'override');
  } finally {
    LikenessOverrideService.remove('Tony', 'Dorsett', 1977);
  }
});
