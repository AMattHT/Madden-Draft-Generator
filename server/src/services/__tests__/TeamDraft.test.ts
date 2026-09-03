import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skipWithoutData } from './data';
import { TeamDraftService } from '../TeamDraftService';
import { teamGreatsClass } from '../DraftEnrichment';
import type { BaselinePlayer } from '../../types/player';

const names = (ps: BaselinePlayer[]) => new Set(ps.map((p) => `${p.firstName} ${p.lastName}`));

test('the franchise list is the 32 current teams with logos', () => {
  const list = TeamDraftService.list();
  assert.equal(list.length, 32);
  assert.ok(list.every((f) => f.key && f.name && f.logo));
  assert.equal(TeamDraftService.get('dal')?.name, 'Dallas Cowboys');
  assert.equal(TeamDraftService.get('OAK'), null, 'relocated codes are not franchises of their own');
});

test('era names resolve to the franchise that carries them today', () => {
  const f = (name: string, abbr: string, season: number) => TeamDraftService.franchiseOf({ abbr, name, logo: null }, season);
  assert.equal(f('Houston Oilers', 'HOU', 1978), 'TEN');
  assert.equal(f('Baltimore Colts', 'BAL', 1983), 'IND');
  assert.equal(f('Boston Patriots', 'BOS', 1965), 'NWE');
  assert.equal(f('Chicago Cardinals', 'CRD', 1955), 'ARI');
  assert.equal(f('Los Angeles Raiders', 'RAI', 1990), 'LVR');
  assert.equal(f('Dallas Texans', 'DTX', 1961), 'KAN');
  assert.equal(f('Dallas Texans', 'DTX', 1952), null);
  assert.equal(f('Brooklyn Dodgers', 'BKN', 1940), null);
  assert.equal(f('Cleveland Browns', 'CLE', 1957), 'CLE');
  assert.equal(f('Baltimore Ravens', 'BAL', 1996), 'BAL');
});

test('a franchise class is the best players it ever drafted, ranked by career', skipWithoutData, async () => {
  const { players, generatedCount } = await teamGreatsClass('DAL');
  assert.equal(players.length, 402);
  assert.equal(generatedCount, 0);
  const n = names(players);
  for (const x of ['Emmitt Smith', 'Troy Aikman', 'Larry Allen', 'Bob Lilly', 'Randy White']) assert.ok(n.has(x), x);
  assert.ok(!n.has('Jerry Rice'), 'not drafted by Dallas');
});

test('a franchise keeps its history across relocations and renames', skipWithoutData, async () => {
  const ten = names(await TeamDraftService.draftedBy('TEN'));
  for (const x of ['Earl Campbell', 'Bruce Matthews']) assert.ok(ten.has(x), `Oilers pick ${x}`);
  const lvr = names(await TeamDraftService.draftedBy('LVR'));
  for (const x of ['Ken Stabler', 'Marcus Allen']) assert.ok(lvr.has(x), `Raiders pick ${x}`);
  const ind = names(await TeamDraftService.draftedBy('IND'));
  for (const x of ['John Elway', 'Peyton Manning']) assert.ok(ind.has(x), `Colts pick ${x}`);
});

test('the Ravens start in 1996; the Browns keep Jim Brown', skipWithoutData, async () => {
  const bal = names(await TeamDraftService.draftedBy('BAL'));
  assert.ok(bal.has('Ray Lewis'));
  assert.ok(!bal.has('Jim Brown'));
  const cle = names(await TeamDraftService.draftedBy('CLE'));
  assert.ok(cle.has('Jim Brown'));
});

test('a young franchise pads to a full class with generated prospects', skipWithoutData, async () => {
  const { players, generatedCount } = await teamGreatsClass('HOU');
  assert.equal(players.length, 402);
  assert.ok(generatedCount > 0);
  assert.ok(names(players).has('Andre Johnson'));
  assert.ok(!names(players).has('Earl Campbell'), 'the Oilers are the Titans, not the Texans');
});
