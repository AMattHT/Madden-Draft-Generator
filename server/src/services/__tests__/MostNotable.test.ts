import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlayerLookupService } from '../PlayerLookupService';

test('two men of one name drafted the same year are told apart by college', () => {
  // 1964: Bob Brown the Hall of Fame tackle (Nebraska, NFL pick 2) and Bob Brown
  // the AFL defensive tackle (Arkansas-Pine Bluff). Only the tackle owns the
  // legends portrait plpo_legends_BrownBob.
  assert.equal(PlayerLookupService.isMostNotable({ firstName: 'Bob', lastName: 'Brown', draftYear: 1964, college: 'Nebraska' }), true);
  assert.equal(PlayerLookupService.isMostNotable({ firstName: 'Bob', lastName: 'Brown', draftYear: 1964, college: 'Ark-Pine Bluff' }), false);
  // A caller without a college keeps the old year-level answer.
  assert.equal(PlayerLookupService.isMostNotable({ firstName: 'Bob', lastName: 'Brown', draftYear: 1964 }), true);
  assert.equal(PlayerLookupService.isMostNotable({ firstName: 'Bob', lastName: 'Brown', draftYear: 1972, college: 'Tampa' }), false);
});
