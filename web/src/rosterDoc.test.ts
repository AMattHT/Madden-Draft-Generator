import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRosterDoc, teamOf, viewPlayers, docCounts, withMove, withEdit, withoutEdits, railEntries, groupByPosition } from './rosterDoc';
import type { RosterData, RosterPlayer } from './types';

const player = (id: number, teamId: number, position = 'QB', overall = 70): RosterPlayer => ({
  id, firstName: `F${id}`, lastName: `L${id}`, position, positionId: 0, teamId, team: teamId === 1009 ? null : 'CHI', teamName: teamId === 1009 ? null : 'Chicago Bears',
  overall, age: 25, heightInches: 72, weight: 200, jersey: id, yearsPro: 3, devTrait: 0, archetype: null, college: null, hometown: null,
  draftRound: null, draftPick: null, assetName: null, portrait: null, ratings: { speed: 80 },
  visuals: { bodyType: 'Standard', genericHead: 'gen_4_T_G_001', helmet: '', facemask: '' },
});
const data: RosterData = {
  id: 'abc', name: 'ROSTER-Official', gameVersion: 'm27', openedAt: 1, count: 3, teamCount: 1, freeAgentTeamId: 1009, crc: 7, sizeBytes: 6291530,
  teams: [{ id: 1, name: 'Bears', city: 'Chicago', abbr: 'CHI' }, { id: 2, name: 'Jets', city: 'New York', abbr: 'NYJ' }, { id: 1009, name: 'FreeAgents', city: '', abbr: 'FA' }],
  players: [player(10, 1), player(11, 1, 'HB'), player(12, 1009)],
};

test('a new document records the base identity and no deltas', () => {
  const doc = newRosterDoc(data, true);
  assert.deepEqual(doc.base, { fileName: 'ROSTER-Official', openedId: 'abc', sizeBytes: 6291530, crc: 7, fromSaves: true });
  assert.deepEqual(doc.moves, {});
  assert.deepEqual(doc.edits, {});
  assert.deepEqual(doc.adds, []);
  assert.equal(doc.name, '');
});

test('moves change the effective team; cuts go to free agency; a move back clears the delta', () => {
  let doc = newRosterDoc(data, true);
  doc = withMove(doc, 10, 2, data);
  assert.equal(teamOf(doc, data.players[0]), 2);
  assert.deepEqual(docCounts(doc, data), { moved: 1, cut: 0, edited: 0 });
  doc = withMove(doc, 11, 1009, data);
  assert.deepEqual(docCounts(doc, data), { moved: 1, cut: 1, edited: 0 });
  doc = withMove(doc, 10, 1, data);
  assert.equal(doc.moves[10], undefined, 'moving home removes the delta');
  assert.deepEqual(docCounts(doc, data), { moved: 0, cut: 1, edited: 0 });
});

test('edits merge per player and the view applies them', () => {
  let doc = newRosterDoc(data, true);
  doc = withEdit(doc, 10, { overall: 90 });
  doc = withEdit(doc, 10, { ratings: { speed: 95 } });
  doc = withEdit(doc, 10, { ratings: { agility: 70 } });
  assert.deepEqual(doc.edits[10], { overall: 90, ratings: { speed: 95, agility: 70 } });
  const v = viewPlayers(doc, data);
  const p = v.find((x) => x.id === 10)!;
  assert.equal(p.overall, 90);
  assert.equal(p.ratings.speed, 95);
  assert.equal(p.edited, true);
  assert.equal(v.find((x) => x.id === 11)!.edited, false);
  doc = withoutEdits(doc, 10);
  assert.equal(doc.edits[10], undefined);
});

test('the view reflects moves and groups by position in Madden order', () => {
  const doc = withMove(newRosterDoc(data, true), 12, 1, data);
  const v = viewPlayers(doc, data);
  const bears = v.filter((p) => p.teamId === 1);
  assert.equal(bears.length, 3);
  assert.equal(bears.find((p) => p.id === 12)!.team, 'CHI');
  const groups = groupByPosition(bears);
  assert.deepEqual(groups.map((g) => g.position), ['QB', 'HB']);
  assert.equal(groups[0].players.length, 2);
});

test('rail entries follow the franchise flag', () => {
  assert.deepEqual(railEntries(false).map((e) => e.view), ['home', 'draft', 'rosters']);
  assert.deepEqual(railEntries(true).map((e) => e.view), ['home', 'draft', 'rosters', 'franchise']);
});
