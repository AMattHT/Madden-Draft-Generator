import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { M27_SAVES_DIR } from '../../config/paths';
import { RosterFileService } from '../RosterFileService';
import { RosterBuildService, SLOT_ID, ROSTER_POSITIONS, DEV_ID } from '../RosterBuildService';
import { splitContainer } from '../RosterContainer';
import { parseTdb2, intOf, strOf } from '../Tdb2Engine';
import { RosterAddService } from '../RosterAddService';

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
  }, new Map());
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

test('build accepts an opened roster id as the base', skipWithoutRoster, async () => {
  const opened = await RosterFileService.openFromSaves('ROSTER-Official');
  await assert.rejects(RosterBuildService.build({ baseId: opened.id, name: 'Official' }), /official/i);
  await assert.rejects(RosterBuildService.build({ name: 'x' }), /baseName or baseId/);
});

test('an added pool player gets PLAY, PRSN, PLCT and blob rows cloned from a template', skipWithoutRoster, async () => {
  const base = await RosterFileService.openBase('ROSTER-Official');
  const bears = base.teams.find((t) => t.abbr === 'CHI')!;
  const before = base.players.length;
  const maxId = Math.max(...base.players.map((p) => p.id));
  const payton = await RosterAddService.generate('1975|NFL|walter|payton|4');
  const counts = RosterBuildService.apply(base, {
    baseName: 'ROSTER-Official', name: 'test',
    adds: [{ tempId: 't1', key: payton.key, teamId: bears.id, jersey: 34 }],
    edits: { t1: { overall: 97, ratings: { speed: 93 } } },
  }, new Map([[payton.key, payton]]));
  assert.equal(counts.added, 1);
  assert.equal(counts.edited, 1);
  const out = RosterFileService.write(base.tdb2, base.header);
  const file = await parseTdb2(splitContainer(out).payload);
  assert.equal(file.PLAY.records.length, before + 1);
  const row = file.PLAY.records.find((r) => intOf(r, 'PGID') === maxId + 1)!;
  assert.ok(row, 'new player row');
  assert.equal(strOf(row, 'PFNA'), 'Walter'); assert.equal(strOf(row, 'PLNA'), 'Payton');
  assert.equal(intOf(row, 'POID'), maxId + 1);
  assert.equal(intOf(row, 'TGID'), bears.id);
  assert.equal(intOf(row, 'PPOS'), 1);
  assert.equal(intOf(row, 'POVR'), 97, 'the add edit applied');
  assert.equal(intOf(row, 'PSPD'), 93);
  assert.equal(intOf(row, 'PJEN'), 34);
  assert.equal(intOf(row, 'PYRP'), 4); assert.equal(intOf(row, 'PYWT'), 0);
  assert.equal(intOf(row, 'PWGT'), payton.weight - 160);
  assert.equal(intOf(row, 'PCOL'), payton.collegeId);
  assert.equal(intOf(row, 'PCMT'), payton.commentaryId);
  assert.equal(strOf(row, 'PEPS'), payton.assetName || payton.genericHead);
  const prsn = file.PRSN.records.find((r) => intOf(r, 'PGID') === maxId + 1)!;
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => intOf(prsn, `DNA${i}`)).filter(Boolean), payton.personaDNA);
  assert.equal(intOf(prsn, 'PRFC'), payton.focus);
  const plct = file.PLCT.records.find((r) => intOf(r, 'PGID') === maxId + 1)!;
  assert.equal(intOf(plct, 'PCON'), 1);
  assert.equal(intOf(row, 'PTSA'), intOf(plct, 'PSA0'));
  const blob = file.BLOB.records[0].fields.BLBM.value.records.find((r: any) => r.index === maxId + 1)!;
  assert.equal(strOf(blob, 'CFNM'), 'Walter'); assert.equal(intOf(blob, 'CNID'), maxId + 1);
  assert.equal(strOf(blob, 'ASNM'), payton.assetName);
  assert.equal(strOf(blob, 'GENR'), payton.genericHead);
  assert.equal(intOf(blob, 'SKNT'), payton.skinTone);
  assert.equal(intOf(blob, 'HINC'), payton.heightInches); assert.equal(intOf(blob, 'WLBS'), payton.weight);
  const louts = blob.fields.LOUT.value.records;
  const body = louts.find((l: any) => intOf(l, 'LDCT') === 5).fields.PINS.value.records.find((p: any) => intOf(p, 'SLOT', -1) === 129);
  assert.equal(strOf(body, 'ITAN'), `${payton.bodyType}_BodyType`);
  const pins = louts.find((l: any) => intOf(l, 'LDTY') === 1).fields.PINS.value.records;
  assert.equal(strOf(pins.find((p: any) => intOf(p, 'SLOT', -1) === 106), 'ITAN'), payton.gear.helmet);
  assert.ok(!file.DCHT.records.some((r) => intOf(r, 'PGID') === maxId + 1), 'no depth-chart rows for an add');
});

test('an add whose key is unknown is skipped and reported', skipWithoutRoster, async () => {
  const base = await RosterFileService.openBase('ROSTER-Official');
  const counts = RosterBuildService.apply(base, { baseName: 'ROSTER-Official', name: 'x', adds: [{ tempId: 't9', key: 'nope', teamId: 1 }] }, new Map());
  assert.equal(counts.added, 0);
  assert.ok(counts.skipped.some((s) => s.includes('nope')));
});
