import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { SIGNATURE_ATTRS, loadPhrases, scoutingNotes } from '../ScoutingNotesService';
import type { PosProfile } from '../CalibrationService';

const GROUPS = ['QB', 'RB', 'WR', 'TE', 'OL', 'EDGE', 'IDL', 'LB', 'CB', 'S', 'K', 'P', 'LS'];

// A direct `import ... from '../../../../web/src/constants'` runs fine under the server's
// tsx/test setup (that module is plain TS, nothing browser-only in it), but it fails
// `tsc --noEmit`: web/src/constants.ts sits outside the server tsconfig's rootDir ('src'),
// so tsc refuses to include it ("File ... is not under 'rootDir'"). Reading the file as
// text avoids that, at the cost of a small regex parse of the KEY_ATTRS table.
function webKeyAttrsByGroup(): Record<string, string[]> {
  const src = fs.readFileSync(path.join(__dirname, '../../../../web/src/constants.ts'), 'utf8');
  const block = src.match(/const KEY_ATTRS: Record<string, \[string, string\]\[\]> = \{([\s\S]*?)\n\};/);
  assert.ok(block, 'KEY_ATTRS block not found in web/src/constants.ts');
  const byGroup: Record<string, string[]> = {};
  for (const line of block![1].split('\n')) {
    const row = line.match(/^\s*(\w+):\s*\[(.*)\],?\s*$/);
    if (!row) continue;
    const [, group, pairs] = row;
    byGroup[group] = [...pairs.matchAll(/\[\s*'([^']+)'\s*,\s*'[^']*'\s*\]/g)].map((m) => m[1]);
  }
  return byGroup;
}

test('the server signature-attribute table matches the web KEY_ATTRS table exactly, per group', () => {
  const webKeyAttrs = webKeyAttrsByGroup();
  assert.deepEqual(Object.keys(SIGNATURE_ATTRS).sort(), GROUPS.slice().sort());
  assert.deepEqual(Object.keys(webKeyAttrs).sort(), GROUPS.slice().sort());
  for (const g of GROUPS) {
    assert.deepEqual(SIGNATURE_ATTRS[g], webKeyAttrs[g], `${g} signature attrs vs web KEY_ATTRS`);
  }
});

test('every group has signature attributes and a neutral line', () => {
  const phrases = loadPhrases();
  for (const g of GROUPS) {
    assert.ok(SIGNATURE_ATTRS[g]?.length >= 3, `${g} signature attrs`);
    assert.ok(typeof phrases.neutral[g] === 'string' && phrases.neutral[g].length > 10, `${g} neutral`);
  }
});

test('every signature attribute has phrases for both directions and both tiers, no digits, no tier words', () => {
  const phrases = loadPhrases();
  const banned = /\d|\belite\b|superstar|x-factor/i;
  for (const g of GROUPS) {
    for (const key of SIGNATURE_ATTRS[g]) {
      const cell = phrases.attrs[key];
      assert.ok(cell, `${g}.${key} missing`);
      for (const dir of ['strength', 'weakness'] as const) {
        for (const tier of ['strong', 'mild'] as const) {
          const list = cell[dir][tier];
          assert.ok(Array.isArray(list) && list.length >= 2, `${key}.${dir}.${tier} needs two phrasings`);
          for (const s of list) assert.ok(!banned.test(s), `${key}.${dir}.${tier}: "${s}"`);
        }
      }
    }
  }
  for (const s of Object.values(phrases.neutral)) assert.ok(!banned.test(s), s);
});

/** A flat profile: every signature attribute averages `mean` with spread `std`. */
function profile(keys: string[], mean = 70, std = 10): PosProfile {
  const attrs: Record<string, number> = {}, attrStats: PosProfile['attrStats'] = {};
  for (const k of keys) { attrs[k] = mean; attrStats[k] = { slope: 1, std, residStd: std, min: 40, max: 99 }; }
  return { ovrMean: mean, archetypeMode: 0, archetypeDist: {}, htMean: 72, htStd: 2, wtMean: 210, wtStd: 15, attrs, attrStats };
}
const QB = 0, HB = 1;
const flat = (keys: string[], v = 70) => Object.fromEntries(keys.map((k) => [k, v]));

test('mild and strong thresholds pick the right cell', () => {
  const keys = SIGNATURE_ATTRS.QB, p = loadPhrases();
  const mild = scoutingNotes({ id: 1, positionId: QB, ratings: { ...flat(keys), throwPower: 78, speed: 62 }, profile: profile(keys) });
  assert.equal(mild.length, 2);
  assert.ok(p.attrs.throwPower.strength.mild.includes(mild[0]), mild[0]);
  assert.ok(p.attrs.speed.weakness.mild.includes(mild[1]), mild[1]);
  const strong = scoutingNotes({ id: 1, positionId: QB, ratings: { ...flat(keys), throwPower: 86, speed: 54 }, profile: profile(keys) });
  assert.ok(p.attrs.throwPower.strength.strong.includes(strong[0]), strong[0]);
  assert.ok(p.attrs.speed.weakness.strong.includes(strong[1]), strong[1]);
});

test('within +/- 0.8 std nothing qualifies and the neutral line is returned', () => {
  const keys = SIGNATURE_ATTRS.QB;
  const notes = scoutingNotes({ id: 1, positionId: QB, ratings: { ...flat(keys), throwPower: 77, speed: 63 }, profile: profile(keys) });
  assert.deepEqual(notes, [loadPhrases().neutral.QB]);
});

test('one qualifying line is not enough: neutral', () => {
  const keys = SIGNATURE_ATTRS.QB;
  const notes = scoutingNotes({ id: 1, positionId: QB, ratings: { ...flat(keys), throwPower: 90 }, profile: profile(keys) });
  assert.deepEqual(notes, [loadPhrases().neutral.QB]);
});

test('cap at four lines, strengths first, each side ordered by magnitude', () => {
  const keys = SIGNATURE_ATTRS.RB, p = loadPhrases();
  // z: speed +2.5, acceleration +2.0, agility +1.5, breakTackle +1.0, carrying +0.9, ballCarrierVision -2.2, jukeMove -1.0
  const ratings = { speed: 95, acceleration: 90, agility: 85, breakTackle: 80, carrying: 79, ballCarrierVision: 48, jukeMove: 60 };
  const notes = scoutingNotes({ id: 7, positionId: HB, ratings, profile: profile(keys) });
  assert.equal(notes.length, 4);
  assert.ok(p.attrs.speed.strength.strong.includes(notes[0]));
  assert.ok(p.attrs.acceleration.strength.strong.includes(notes[1]));
  assert.ok(p.attrs.agility.strength.mild.includes(notes[2]));
  assert.ok(p.attrs.ballCarrierVision.weakness.strong.includes(notes[3]));
});

test('missing spread falls back to a std of 8', () => {
  const keys = SIGNATURE_ATTRS.QB, p = loadPhrases();
  const prof = profile(keys); delete prof.attrStats;
  // 70 + 0.8 * 8 = 76.4 -> 77 qualifies; 70 - 1.6 * 8 = 57.2 -> 57 is strong
  const notes = scoutingNotes({ id: 1, positionId: QB, ratings: { ...flat(keys), throwPower: 77, speed: 57 }, profile: prof });
  assert.ok(p.attrs.throwPower.strength.mild.includes(notes[0]));
  assert.ok(p.attrs.speed.weakness.strong.includes(notes[1]));
});

test('deterministic by id, and different ids can pick different phrasings', () => {
  const keys = SIGNATURE_ATTRS.QB;
  const ratings = { ...flat(keys), throwPower: 90, speed: 50 };
  const a = scoutingNotes({ id: 3, positionId: QB, ratings, profile: profile(keys) });
  const b = scoutingNotes({ id: 3, positionId: QB, ratings, profile: profile(keys) });
  assert.deepEqual(a, b);
  const firsts = new Set<string>();
  for (let id = 1; id <= 40; id++) firsts.add(scoutingNotes({ id, positionId: QB, ratings, profile: profile(keys) })[0]);
  assert.ok(firsts.size >= 2, 'forty ids should spread over both phrasings');
});
