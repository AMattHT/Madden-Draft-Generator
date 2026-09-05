import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGearSlots } from '../DraftClassBuilder';
import { CuratedGearService } from '../CuratedGearService';
import { GEAR_SLOT_TYPES } from '../GearOptionsService';

test('recorded gear slots land in the prospect loadout, facemask as the slotless element', () => {
  const p: Record<string, unknown> = { visuals: { loadouts: [{ loadoutType: 'PlayerOnField', loadoutElements: [{ slotType: GEAR_SLOT_TYPES.helmet[0], itemAssetName: 'OldHelmet' }] }] } };
  applyGearSlots(p, { helmet: 'NewHelmet', facemask: 'GearFaceMask_Test', gloveLeft: 'GloveX' });
  const els = (p.visuals as { loadouts: Array<{ loadoutElements: Array<{ slotType?: string; itemAssetName: string }> }> }).loadouts[0].loadoutElements;
  assert.equal(els.find((e) => e.slotType === GEAR_SLOT_TYPES.helmet[0])?.itemAssetName, 'NewHelmet');
  assert.ok(els.some((e) => !e.slotType && e.itemAssetName === 'GearFaceMask_Test'));
  for (const st of GEAR_SLOT_TYPES.gloveLeft) assert.equal(els.find((e) => e.slotType === st)?.itemAssetName, 'GloveX');
});

test('no recorded gear means null, and the shipped file starts empty', () => {
  assert.equal(CuratedGearService.get('Nobody', 'Atall', 1999), null);
  assert.equal(CuratedGearService.get('X', 'Y', null), null);
});
