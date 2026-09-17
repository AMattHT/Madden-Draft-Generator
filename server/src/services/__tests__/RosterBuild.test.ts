import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { M27_SAVES_DIR } from '../../config/paths';
import { RosterFileService } from '../RosterFileService';
import { RosterBuildService, SLOT_ID, ROSTER_POSITIONS, DEV_ID } from '../RosterBuildService';
import { splitContainer } from '../RosterContainer';
import { parseTdb2, intOf, strOf } from '../Tdb2Engine';

const OFFICIAL = path.join(M27_SAVES_DIR, 'ROSTER-Official');
const skipWithoutRoster = { skip: fs.existsSync(OFFICIAL) ? false : 'no Madden 27 ROSTER-Official in the Saves folder' };

test('static maps', () => {
  assert.equal(SLOT_ID.HeadWear, 106);
  assert.equal(SLOT_ID.LeftShoe, 10);
  assert.equal(ROSTER_POSITIONS.length, 22);
  assert.ok(ROSTER_POSITIONS.includes('LEDG') && ROSTER_POSITIONS.includes('MIKE'));
  assert.deepEqual(DEV_ID, { Normal: 0, Star: 1, Superstar: 2, XFactor: 3 });
});

test('moves, cuts and edits land in the tables and survive a write', skipWithoutRoster, async () => {
  const base = await RosterFileService.openBase('ROSTER-Official');
  const geno = base.players.find((p) => p.firstName === 'Geno' && p.lastName === 'Smith')!;
  const bears = base.teams.find((t) => t.abbr === 'CHI')!;
  const someJet = base.players.find((p) => p.teamId === geno.teamId && p.id !== geno.id)!;
  const counts = RosterBuildService.apply(base, {
    baseName: 'ROSTER-Official', name: 'test',
    moves: { [geno.id]: bears.id, [someJet.id]: base.freeAgentTeamId },
    edits: {
      [geno.id]: { overall: 90, age: 30, dev: 'Superstar', jersey: 12, position: 'QB', ratings: { throwPower: 95, speed: 70 }, bodyType: 'Thin', genericHead: 'gen_3_T_G_001', gear: { helmet: 'GearHelmet_Speed_Flex', facemask: 'GearFaceMask_SpeedFlex808', visor: 'GearVisor_None' } },
      '999999': { overall: 50 },
    },
  });
  assert.deepEqual({ moved: counts.moved, cut: counts.cut, edited: counts.edited }, { moved: 1, cut: 1, edited: 1 });
  assert.ok(counts.skipped.some((s) => s.includes('999999')), 'unknown player reported');

  const out = RosterFileService.write(base.tdb2, base.header);
  const file = await parseTdb2(splitContainer(out).payload);
  const g = file.PLAY.records.find((r) => intOf(r, 'PGID') === geno.id)!;
  assert.equal(intOf(g, 'TGID'), bears.id);
  assert.equal(intOf(g, 'PYWT'), 0);
  assert.equal(intOf(g, 'POVR'), 90);
  assert.equal(intOf(g, 'PAGE'), 30);
  assert.equal(intOf(g, 'PROL'), 2);
  assert.equal(intOf(g, 'PJEN'), 12);
  assert.equal(intOf(g, 'PTHP'), 95);
  assert.equal(intOf(g, 'PSPD'), 70);
  const j = file.PLAY.records.find((r) => intOf(r, 'PGID') === someJet.id)!;
  assert.equal(intOf(j, 'TGID'), base.freeAgentTeamId);
  assert.ok(!file.DCHT.records.some((r) => intOf(r, 'PGID') === geno.id && intOf(r, 'TGID') === geno.teamId), 'old depth-chart rows dropped');
  assert.ok(!file.DCHT.records.some((r) => intOf(r, 'PGID') === someJet.id), 'cut player has no depth-chart rows');
  const blob = file.BLOB.records[0].fields.BLBM.value.records.find((r: any) => r.index === geno.id)!;
  assert.equal(strOf(blob, 'GENR'), 'gen_3_T_G_001');
  assert.equal(intOf(blob, 'CJNO'), 12);
  const louts = blob.fields.LOUT.value.records;
  const body = louts.find((l: any) => intOf(l, 'LDCT') === 5).fields.PINS.value.records[0];
  assert.equal(strOf(body, 'ITAN'), 'Thin_BodyType');
  const pins = louts.find((l: any) => intOf(l, 'LDTY') === 1).fields.PINS.value.records;
  assert.equal(strOf(pins.find((p: any) => intOf(p, 'SLOT', -1) === 106), 'ITAN'), 'GearHelmet_Speed_Flex');
  assert.equal(strOf(pins.find((p: any) => intOf(p, 'SLOT', -1) === 2), 'ITAN'), 'GearVisor_None');
  assert.equal(strOf(pins.find((p: any) => !p.fields.SLOT && strOf(p, 'ITAN').startsWith('GearFaceMask_')), 'ITAN'), 'GearFaceMask_SpeedFlex808');
  assert.equal(file.PLAY.records.length, base.players.length, 'nobody deleted');
});

test('build refuses to overwrite the base or the official roster', skipWithoutRoster, async () => {
  await assert.rejects(RosterBuildService.build({ baseName: 'ROSTER-Official', name: 'Official' }), /official/i);
  await assert.rejects(RosterBuildService.build({ baseName: 'ROSTER-Nope', name: 'x' }), /not in the Madden 27 Saves folder/);
});
