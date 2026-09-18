import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIGNATURE_ATTRS, loadPhrases } from '../ScoutingNotesService';

const GROUPS = ['QB', 'RB', 'WR', 'TE', 'OL', 'EDGE', 'IDL', 'LB', 'CB', 'S', 'K', 'P', 'LS'];

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
