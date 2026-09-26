import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { commentaryIdFor } from '../M27Fields';
import { LOOKUPS_DIR } from '../../config/paths';

test('a surname only the supplement knows resolves to the supplement id', () => {
  assert.equal(commentaryIdFor('Aaitui'), 5657);
});

test('a surname the primary table knows keeps the primary id', () => {
  // Reece is 4113 in our verified table (MyFranchise says 4117); the supplement never carries it.
  assert.equal(commentaryIdFor('Reece'), 4113);
  const sup = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'm27-commentary-supplement.json'), 'utf8'));
  assert.equal('reece' in sup.surnameCommentary, false);
});

test('an unknown surname still writes 0', () => {
  assert.equal(commentaryIdFor('Zxqvnotaname'), 0);
});

test('normalisation: punctuation, spaces and case do not matter', () => {
  assert.equal(commentaryIdFor("Abdul-Quddus"), 5);
  assert.equal(commentaryIdFor('abdul quddus'), 5);
  assert.equal(commentaryIdFor('ABDULQUDDUS'), 5);
});
