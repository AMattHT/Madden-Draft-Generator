import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowFor, patchFor, editFromCard, type CardCtx } from './rosterCard';
import type { RosterPlayer } from './types';

const ctx: CardCtx = {
  traits: [{ id: 3, name: 'Leader', label: 'Leader' } as any, { id: 4, name: 'Diva', label: 'Diva' } as any],
  focus: [{ id: 0, name: 'LoveOfTheGame', label: 'Love of the game' } as any, { id: 2, name: 'PersonalAccolades', label: 'Personal accolades' } as any],
  colleges: [{ id: 7, name: 'Alabama' }],
  archetypes: {},
};
const geno: RosterPlayer = {
  id: 112, firstName: 'Geno', lastName: 'Smith', position: 'QB', positionId: 0, teamId: 18, team: 'NYJ', teamName: 'New York Jets',
  overall: 72, age: 35, heightInches: 75, weight: 221, jersey: 7, yearsPro: 13, devTrait: 0, archetype: 'Field General', college: 'West Virginia', hometown: 'Miramar',
  draftRound: 2, draftPick: 7, assetName: 'SmithGeno_112', portrait: '/api/portrait/plpo/x', ratings: { speed: 84, throwPower: 88 },
  visuals: { bodyType: 'Standard', genericHead: 'gen_6_T_G_005', helmet: 'GearHelmet_Speed_Flex', facemask: '' },
  archetypeId: 0, collegeId: 255, homeState: 8, skinTone: 6, personaDNA: [3, 4, 99], focus: 2, face: 'asset',
};

test('a roster player becomes a card row with named persona, focus and gear', () => {
  const row = rowFor(geno, ctx);
  assert.equal(row.face, 'asset'); assert.equal(row.genericHead, 'gen_6_T_G_005'); assert.equal(row.skinTone, 6);
  assert.deepEqual(row.persona, ['Leader', 'Diva', '#99']);
  assert.equal(row.focus, 'PersonalAccolades');
  assert.deepEqual(row.gear, { helmet: 'GearHelmet_Speed_Flex' });
  assert.equal(row.draftYear, 2013);
  assert.equal(row.archetype, 0); assert.equal(row.archetypeName, 'Field General');
  assert.equal(row.wav, null); assert.equal(row.round, 2);
});

test('a roster edit becomes the card patch in the draft vocabulary', () => {
  const patch = patchFor({ overall: 90, ratings: { speed: 95 }, position: 'FS', dev: 'Superstar', jersey: 12, age: 30, heightInches: 78, weight: 240, firstName: 'Eugene', lastName: 'S', college: 7, archetype: 2, bodyType: 'Thin', genericHead: 'gen_2_T_G_001', faceAsset: 'X_1', skinTone: 2, personaDNA: [3, 4], focus: 2 }, geno);
  assert.deepEqual(patch, { overall: 90, speed: 95, position: 17, devTrait: 2, jerseyNum: 12, age: 30, heightInches: 78, weight: 240, firstName: 'Eugene', lastName: 'S', college: 7, archetype: 2, bodyType: 'Thin', genericHeadName: 'gen_2_T_G_001', faceAsset: 'X_1', skinTone: 2, personaDNA: '3,4', focus: '2' });
  assert.deepEqual(patchFor(undefined, geno), {});
});

test('card edits translate back one field at a time', () => {
  assert.deepEqual(editFromCard('position', 17), { position: 'FS' });
  assert.deepEqual(editFromCard('devTrait', 2), { dev: 'Superstar' });
  assert.deepEqual(editFromCard('jerseyNum', 12), { jersey: 12 });
  assert.deepEqual(editFromCard('genericHeadName', 'gen_2_T_G_001'), { genericHead: 'gen_2_T_G_001' });
  assert.deepEqual(editFromCard('personaDNA', '3, 4'), { personaDNA: [3, 4] });
  assert.deepEqual(editFromCard('focus', '2'), { focus: 2 });
  assert.deepEqual(editFromCard('speed', 95), { ratings: { speed: 95 } });
  assert.deepEqual(editFromCard('college', 7), { college: 7 });
  assert.deepEqual(editFromCard('faceAsset', 'MahomesIIPatrick_12635'), { faceAsset: 'MahomesIIPatrick_12635' });
  assert.equal(editFromCard('nonsense', 1), null);
});
