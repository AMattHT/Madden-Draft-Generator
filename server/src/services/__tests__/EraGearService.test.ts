import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { EraGearService } from '../EraGearService';
import { LOOKUPS_DIR } from '../../config/paths';

const VALID = new Set<string>(JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'm27-game-gear-assets.json'), 'utf8')));
const assets = (els: Array<{ itemAssetName: string }>) => els.map((e) => e.itemAssetName);

test('every asset an M27 loadout writes exists in the M27 game vocabulary (1965, 1987, 2003, 2024)', () => {
  for (const year of [1965, 1987, 2003, 2024]) {
    for (const pos of [0, 3, 5, 10, 16, 19]) {
      for (let i = 0; i < 6; i++) {
        const bad = assets(EraGearService.loadoutElements(year, pos, `seed-${year}-${pos}-${i}`, 'm27')).filter((a) => !VALID.has(a));
        assert.deepEqual(bad, [], `${year} pos ${pos} seed ${i} wrote assets M27 does not have: ${bad.join(', ')}`);
      }
    }
  }
});

test('vintage helmets map to the oldest surviving M27 shell instead of a dead asset', () => {
  const els = EraGearService.loadoutElements(1965, 5, 'tk-seed', 'm27');
  const helmet = els.find((e) => e.slotType === 'HeadWear')?.itemAssetName;
  assert.equal(helmet, 'GearHelmet_AirXP');
  const m26 = EraGearService.loadoutElements(1965, 5, 'tk-seed', 'm26');
  assert.equal(m26.find((e) => e.slotType === 'HeadWear')?.itemAssetName, 'GearHelmet_RiddellTK'); // M26 untouched
});

test('M27 modern brackets use the verified M27 helmet pools, not the M26 timeline', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) seen.add(EraGearService.loadoutElements(2005, 3, `h${i}`, 'm27').find((e) => e.slotType === 'HeadWear')!.itemAssetName);
  assert.ok(!seen.has('GearHelmet_Standard') && !seen.has('GearHelmet_Schutt'), [...seen].join(','));
  assert.ok(seen.has('GearHelmet_Revolution') || seen.has('GearHelmet_AirXP'));
});

test('vintage M26 classes strip modern accessories inherited from the 2026 donor', () => {
  const els = EraGearService.loadoutElements(1965, 3, 'vintage-seed', 'm26');
  const slot = (s: string) => els.find((e) => e.slotType === s);
  assert.equal(slot('Shoulderpads')?.itemAssetName, 'Medium_Pads');
  assert.equal(slot('MouthWear')?.remove, true, 'no pacifier mouthpiece in 1965');
  assert.equal(slot('LeftArmWear')?.remove, true, 'no compression sleeve in 1965');
  assert.equal(slot('LeftSpat')?.remove, true, 'no spats in 1965');
  assert.equal(slot('KneeWear')?.itemAssetName, 'KneePad_Regular', 'everyone wore knee pads');
  assert.equal(slot('InnerShirt')?.remove, true);
});

test('modern M26 classes keep the modern accessory mix (some sleeves and pacifiers, small pads)', () => {
  let sleeves = 0, pacifiers = 0, small = 0;
  for (let i = 0; i < 60; i++) {
    const els = EraGearService.loadoutElements(2024, 3, `modern-${i}`, 'm26');
    if (els.find((e) => e.slotType === 'LeftArmWear' && !e.remove)) sleeves++;
    if (els.find((e) => e.slotType === 'MouthWear' && !e.remove)) pacifiers++;
    if (els.find((e) => e.slotType === 'Shoulderpads')?.itemAssetName === 'Small_Pads') small++;
  }
  assert.ok(sleeves > 10 && sleeves < 50, `sleeves ${sleeves}/60`);
  assert.ok(pacifiers > 5 && pacifiers < 40, `pacifiers ${pacifiers}/60`);
  assert.ok(small > 30, `small pads ${small}/60`);
});

test('the M26 writer removes a donor slot when the loadout carries a removal marker', async () => {
  const { MdcService } = await import('../MdcService');
  const template = MdcService.loadTemplate();
  const parsed = MdcService.parse(template) as any[];
  const idx = parsed.findIndex((p: any) => p.firstName && p.visuals?.loadouts?.some((l: any) => l.loadoutElements?.some((e: any) => e.slotType === 'MouthWear')));
  assert.ok(idx >= 0, 'template has a donor with a MouthWear element');
  // Block i is written over donor block i, so write the earlier blocks unchanged and the target with a removal marker.
  const prospects = parsed.slice(0, idx + 1).map((p: any) => ({ ...p }));
  prospects[idx] = { ...prospects[idx], firstName: 'Test', lastName: 'Removal', visuals: { loadouts: [{ loadoutType: 'PlayerOnField', loadoutElements: [{ slotType: 'MouthWear', itemAssetName: '', remove: true }] }] } };
  const out = MdcService.write(prospects, template);
  const back = MdcService.parse(out)[idx] as any;
  const slots = back.visuals.loadouts.flatMap((l: any) => l.loadoutElements || []).map((e: any) => e.slotType);
  assert.ok(!slots.includes('MouthWear'), `MouthWear still present: ${slots.join(',')}`);
});

test('generic-head pools are per game and use every head that game assigns (tone 2 is not four faces)', async () => {
  const { LikenessService } = await import('../LikenessService');
  const m26 = LikenessService.headsForTone(2, 'm26');
  const m27 = LikenessService.headsForTone(2, 'm27');
  assert.ok(m26.length >= 25, `M26 tone 2 pool has ${m26.length} heads`);
  assert.ok(m27.length >= 20, `M27 tone 2 pool has ${m27.length} heads`);
  assert.notDeepEqual(m26, m27, 'the two games do not share an identical pool');
  assert.ok(m26.includes('gen_2_B_N_0010'), 'a head the game uses but the old lookup lacked is in the M26 pool');
  // portrait ids come from each game's own pairing
  assert.equal(LikenessService.genericPid('gen_2_H_GM_004', 'm27'), 4196);
  assert.equal(LikenessService.genericPid('gen_2_H_BD_03', 'm26'), 4144);
  assert.equal(LikenessService.genericPid('gen_2_B_N_0017', 'm26'), 3404); // the portrait table says 2794; the game says 3404
});
