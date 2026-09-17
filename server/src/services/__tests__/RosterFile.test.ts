import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { M27_SAVES_DIR } from '../../config/paths';
import { RosterFileService, decodeSmall, payloadOffset } from '../RosterFileService';
import { RATING_KEYS } from '../AttributeModel';

const OFFICIAL = path.join(M27_SAVES_DIR, 'ROSTER-Official');
const skipWithoutRoster = { skip: fs.existsSync(OFFICIAL) ? false : 'no Madden 27 ROSTER-Official in the Saves folder' };

test('small numbers decode: 6-bit digits read back as 7-bit ones', () => {
  assert.equal(decodeSmall(12), 12);
  assert.equal(decodeSmall(63), 63);
  assert.equal(decodeSmall(140), 76);
  assert.equal(decodeSmall(163), 99);
  assert.equal(decodeSmall(293), 165); // Lane Johnson's weight over 160
  assert.equal(decodeSmall(392), 200);
  assert.equal(decodeSmall(43314), 43314); // a record reference: a digit of 64+ leaves it alone
});

test('only a Madden 27 FBCHUNKS container with a zlib payload is a roster', () => {
  assert.equal(payloadOffset(Buffer.alloc(4096)), -1);
  const fake = Buffer.alloc(4096);
  fake.write('FBCHUNKS', 0, 'latin1');
  fake.write('Madden-27-RL2-9157631', 0x2d, 'latin1');
  fake[0x4a] = 0x78; fake[0x4b] = 0xda;
  assert.equal(payloadOffset(fake), 0x4a);
  assert.equal(RosterFileService.isRoster(Buffer.from('CAREERDRAFT')), false);
});

test('the shipped roster parses: teams, players, positions, ratings and faces', skipWithoutRoster, async () => {
  const data = await RosterFileService.parse(fs.readFileSync(OFFICIAL), 'ROSTER-Official');
  assert.ok(data.players.length >= 2500 && data.players.length <= 3500, `players: ${data.players.length}`);
  assert.equal(data.teamCount, 32);
  const abbrs = new Set(data.teams.map((t) => t.abbr));
  for (const a of ['DAL', 'PHI', 'KC', 'CHI']) assert.ok(abbrs.has(a) || abbrs.has(a.slice(0, 3)), `team ${a}`);
  const geno = data.players.find((p) => p.firstName === 'Geno' && p.lastName === 'Smith');
  assert.ok(geno, 'Geno Smith is in the roster');
  assert.equal(geno!.position, 'QB'); // position 0 is omitted from the file and means QB
  assert.ok(geno!.overall >= 60 && geno!.overall <= 99, `Geno overall ${geno!.overall}`);
  assert.ok(geno!.ratings.throwPower >= 80, `Geno throw power ${geno!.ratings.throwPower}`);
  assert.equal(geno!.assetName, 'SmithGeno_112');
  // Every rating decoded into 0-99, every player has a position label and a team or free agency.
  for (const p of data.players) {
    for (const k of RATING_KEYS) assert.ok(p.ratings[k] >= 0 && p.ratings[k] <= 99, `${p.firstName} ${p.lastName} ${k}=${p.ratings[k]}`);
    assert.ok(p.position && p.position !== 'undefined');
  }
  const fast = Math.max(...data.players.map((p) => p.ratings.speed));
  assert.ok(fast >= 95 && fast <= 99, `fastest speed ${fast}`);
  const onTeams = data.players.filter((p) => p.team).length;
  assert.ok(onTeams >= 1500, `players on teams: ${onTeams}`);
  const dev = data.players.filter((p) => p.devTrait > 0).length;
  assert.ok(dev >= 300 && dev <= 900, `players above Normal: ${dev}`);
  assert.ok(data.players.filter((p) => p.portrait).length >= 1000, 'most faces map to a portrait');
  const garrett = data.players.find((p) => p.firstName === 'Myles' && p.lastName === 'Garrett');
  assert.equal(garrett?.college, 'Texas A&M', 'college ids decode like the ratings');
  const chase = data.players.find((p) => p.firstName === "Ja'Marr" && p.lastName === 'Chase');
  assert.equal(chase?.college, 'LSU');
  assert.ok(chase!.archetype, 'archetype resolves');
  assert.ok(data.players.every((p) => p.archetype), 'every player has an archetype (absent id = 0)');
  const heights = data.players.map((p) => p.heightInches).filter(Boolean);
  assert.ok(Math.min(...heights) >= 64 && Math.max(...heights) <= 82, 'heights are inches');
  const weights = data.players.map((p) => p.weight).filter(Boolean);
  assert.ok(Math.min(...weights) >= 150 && Math.max(...weights) <= 450, `weights are pounds (Desmond Watson is 415) (${Math.min(...weights)}-${Math.max(...weights)})`);
});

test('a roster opened by name is kept and found again by id', skipWithoutRoster, async () => {
  const opened = await RosterFileService.openFromSaves('ROSTER-Official');
  assert.equal((await RosterFileService.get(opened.id))?.count, opened.count);
  await assert.rejects(RosterFileService.openFromSaves('../ROSTER-Official'), /not a roster file name/);
  assert.equal(await RosterFileService.get('0123456789abcdef'), null);
});

test('openBase exposes the parsed file, the free-agent team and an output name', skipWithoutRoster, async () => {
  const base = await RosterFileService.openBase('ROSTER-Official');
  assert.equal(base.name, 'ROSTER-Official');
  assert.equal(base.header.length, 0x4a);
  assert.equal(base.tdb2.PLAY.records.length, base.players.length);
  assert.equal(base.freeAgentTeamId, base.teams.find((t) => /free/i.test(t.name))!.id);
  assert.ok(base.players.every((p) => p.teamId === base.freeAgentTeamId ? p.team === null : p.team !== null));
  const out = RosterFileService.write(base.tdb2, base.header);
  assert.equal(out.length, 6_291_530);
  assert.equal(RosterFileService.outputNameFor('My 85 Bears!'), 'ROSTER-MY85BEARS');
  assert.equal(RosterFileService.outputNameFor(''), 'ROSTER-CUSTOM');
  assert.equal(RosterFileService.outputNameFor('a'.repeat(40)), 'ROSTER-' + 'A'.repeat(16));
});

test('the read model carries the base checksum, size and each player visuals', skipWithoutRoster, async () => {
  const buf = fs.readFileSync(OFFICIAL);
  const data = await RosterFileService.parse(buf, 'ROSTER-Official');
  assert.equal(data.sizeBytes, buf.length);
  assert.equal(data.crc, buf.readUInt32LE(0x1a));
  const geno = data.players.find((p) => p.firstName === 'Geno' && p.lastName === 'Smith')!;
  assert.equal(geno.visuals.bodyType, 'Standard');
  assert.equal(geno.visuals.genericHead, 'gen_6_T_G_005');
  assert.equal(geno.visuals.helmet, 'GearHelmet_Speed_Flex');
  assert.equal(geno.visuals.facemask, 'GearFaceMask_SpeedFlex808');
  assert.ok(data.players.every((p) => ['Standard', 'Thin', 'Muscular', 'Heavy', 'Lean', ''].includes(p.visuals.bodyType)));
});

test('an opened roster can be reopened as a base by id', skipWithoutRoster, async () => {
  const opened = await RosterFileService.openFromSaves('ROSTER-Official');
  const base = await RosterFileService.openOpened(opened.id);
  assert.equal(base.name, 'ROSTER-Official');
  assert.equal(base.players.length, opened.count);
  await assert.rejects(RosterFileService.openOpened('0123456789abcdef'), /gone/);
});
