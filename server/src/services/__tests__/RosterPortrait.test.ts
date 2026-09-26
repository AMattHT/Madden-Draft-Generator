import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { M27_SAVES_DIR } from '../../config/paths';
import { RosterAddService } from '../RosterAddService';
import { RosterBuildService } from '../RosterBuildService';
import { RosterFileService } from '../RosterFileService';
import { genericHeadPid } from '../M27Fields';
import { intOf, strOf, parseTdb2 } from '../Tdb2Engine';
import { splitContainer } from '../RosterContainer';

const skipWithoutRoster = { skip: fs.existsSync(path.join(M27_SAVES_DIR, 'ROSTER-Official')) ? false : 'no local official roster' };
const ravens = [
  ['2008|NFL|joe|flacco|18', 1115],
  ['1996|NFL|ray|lewis|26', 1902],
  ['2002|NFL|ed|reed|24', 2501],
] as const;

test('roster generation carries regular, legend and generic menu portrait IDs', async () => {
  for (const [key, pid] of ravens) {
    const p = await RosterAddService.generate(key);
    assert.equal(p.portraitPid, pid, key);
    assert.equal(p.portrait, `/api/portrait/pid/${pid}`);
  }
  const rice = await RosterAddService.generate('2008|NFL|ray|rice|55');
  assert.equal(rice.assetName, '', 'no verified Rice scan in the catalog');
  const pid = genericHeadPid(rice.genericHead);
  assert.ok(pid > 0, 'selected head has a game portrait');
  assert.equal(rice.portraitPid, pid);
  assert.equal(rice.portrait, `/api/portrait/pid/${pid}`);
});

test('added Ravens overwrite template portraits in serialized roster bytes', skipWithoutRoster, async () => {
  const base = await RosterFileService.openBase('ROSTER-Official');
  const original = new Map(base.tdb2.PLAY.records.map(r => [intOf(r, 'PGID'), intOf(r, 'PSXP')]));
  const keys = [...ravens.map(([key]) => key), '2008|NFL|ray|rice|55'];
  const players = await Promise.all(keys.map(key => RosterAddService.generate(key)));
  const teamId = base.teams.find(t => t.abbr === 'BAL')!.id;
  const counts = RosterBuildService.apply(base, {
    name: 'portrait-test', adds: players.map((p, i) => ({ tempId: `a${i}`, key: p.key, teamId })),
  }, new Map(players.map(p => [p.key, p])));
  assert.equal(counts.added, 4);
  const file = await parseTdb2(splitContainer(RosterFileService.write(base.tdb2, base.header)).payload);
  const added = file.PLAY.records.filter(r => !original.has(intOf(r, 'PGID')));
  assert.equal(added.length, 4);
  for (const [i, p] of players.entries()) {
    const row = added.find(r => strOf(r, 'PFNA') === p.firstName && strOf(r, 'PLNA') === p.lastName)!;
    const expected = i < ravens.length ? ravens[i][1] : genericHeadPid(p.genericHead);
    assert.equal(intOf(row, 'PSXP'), expected, `${p.firstName} ${p.lastName}`);
    assert.equal(strOf(row, 'PEPS'), p.assetName || p.genericHead, '3D face unchanged');
  }
  for (const row of file.PLAY.records.filter(r => original.has(intOf(r, 'PGID')))) {
    assert.equal(intOf(row, 'PSXP'), original.get(intOf(row, 'PGID')), 'base portraits preserved');
  }
});

test('an explicit missing portrait clears the cloned ID', skipWithoutRoster, async () => {
  const base = await RosterFileService.openBase('ROSTER-Official');
  const p = { ...await RosterAddService.generate(ravens[0][0]), portraitPid: 0, portrait: null };
  const maxId = Math.max(...base.players.map(p => p.id));
  RosterBuildService.apply(base, { name: 'portrait-test', adds: [{ tempId: 'a', key: p.key, teamId: base.freeAgentTeamId }] }, new Map([[p.key, p]]));
  const file = await parseTdb2(splitContainer(RosterFileService.write(base.tdb2, base.header)).payload);
  assert.equal(intOf(file.PLAY.records.find(r => intOf(r, 'PGID') > maxId)!, 'PSXP'), 0);
});

test('face edits update the portrait; scan wins over generic and unknown scans fall back', skipWithoutRoster, async () => {
  for (const [edit, expected] of [
    [{ genericHead: 'gen_2_H_GM_004' }, 4196],
    [{ genericHead: 'gen_2_H_GM_004', faceAsset: 'MahomesIIPatrick_12635' }, 8648],
    [{ genericHead: 'gen_2_H_GM_004', faceAsset: 'UnknownScan_123' }, 4196],
  ] as const) {
    const base = await RosterFileService.openBase('ROSTER-Official');
    const player = base.players.find(p => p.firstName === 'Geno' && p.lastName === 'Smith')!;
    RosterBuildService.apply(base, { name: 'portrait-test', edits: { [player.id]: edit } }, new Map());
    const file = await parseTdb2(splitContainer(RosterFileService.write(base.tdb2, base.header)).payload);
    assert.equal(intOf(file.PLAY.records.find(r => intOf(r, 'PGID') === player.id)!, 'PSXP'), expected);
  }
});

test('roster preview uses the saved menu portrait field', skipWithoutRoster, async () => {
  const base = await RosterFileService.openBase('ROSTER-Official');
  const flacco = base.players.find(p => p.firstName === 'Joe' && p.lastName === 'Flacco')!;
  assert.equal(flacco.portrait, '/api/portrait/pid/1115');
});
