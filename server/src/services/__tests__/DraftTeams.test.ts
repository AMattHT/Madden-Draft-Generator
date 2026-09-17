import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skipWithoutData } from './data';
import { TeamDraftService } from '../TeamDraftService';
import { PlayerLookupService } from '../PlayerLookupService';

const keyOf = (first: string, last: string, year: number, league = 'NFL') =>
  PlayerLookupService.catalog().find((p) => p.first === first && p.last === last && p.year === year && p.league === league)?.key;

test('the pool knows who drafted a player: nflverse after 1980, the baked tables before, nothing for an AFL pick', skipWithoutData, async () => {
  const teams = await TeamDraftService.draftTeams();
  const brady = keyOf('Tom', 'Brady', 2000);
  assert.ok(brady, 'Brady is in the pool');
  assert.match(teams.get(brady!)?.team.name ?? '', /Patriots/);
  const brown = keyOf('Jim', 'Brown', 1957);
  assert.ok(brown, 'Jim Brown is in the pool');
  assert.equal(teams.get(brown!)?.team.abbr, 'CLE');
  const eller = keyOf('Carl', 'Eller', 1964, 'AFL');
  assert.ok(eller, 'Eller is in the pool as an AFL pick');
  assert.equal(teams.get(eller!), undefined, 'an AFL pick is not matched to the NFL draft page');
});
