import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlayerLookupService, playerKey } from '../PlayerLookupService';

test('every catalog player has a unique key and the key round-trips through byKeys', () => {
  const cat = PlayerLookupService.catalog();
  assert.ok(cat.length > 30000, `${cat.length} players`);
  assert.equal(new Set(cat.map((p) => p.key)).size, cat.length, 'keys unique');
  const manning = cat.find((p) => p.last === 'Manning' && p.first === 'Peyton');
  assert.ok(manning);
  assert.equal(manning!.key, '1998|NFL|peyton|manning|1');
  assert.equal(manning!.mpos, 'QB');
  assert.equal(manning!.grp, 'QB');
  const { players, missing } = PlayerLookupService.byKeys([manning!.key, 'nope|x|y|z|u', manning!.key]);
  assert.equal(players.length, 1);
  assert.equal(players[0].lastName, 'Manning');
  assert.deepEqual(missing, ['nope|x|y|z|u']);
});

test('playerKey uses u for undrafted and normalises names', () => {
  const p = { draftYear: 1994, league: 'NFL', firstName: 'Kurt', lastName: 'Warner‡', draftPick: null } as never;
  assert.equal(playerKey(p), '1994|NFL|kurt|warner|u');
});
