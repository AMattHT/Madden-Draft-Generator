import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NflverseCareerService } from '../NflverseCareerService';

// Reads the real cached nflverse CSVs in server/cache (present in this checkout).
test('career bits carry interceptions, games and the drafting team (Andre Tippett, 1982 Patriots)', () => {
  const c = NflverseCareerService.get('Andre', 'Tippett', 1982);
  assert.ok(c, 'Tippett should be in nflverse draft_picks');
  assert.equal(c!.defSacks, 100);
  assert.equal(c!.defInts, 1);
  assert.ok((c!.games ?? 0) > 100, `games should be populated, got ${c!.games}`);
  assert.equal(c!.draftTeam, 'NWE');
});

test('players.csv draft_team fills the team for a pre-1980 draftee missing from draft_picks', () => {
  // Robert Brazile, 1975 Oilers (nflverse players.csv uses current codes: HOU for the Oilers)
  const c = NflverseCareerService.get('Robert', 'Brazile', 1975);
  assert.ok(c, 'Brazile should be in nflverse players.csv');
  assert.equal(c!.draftTeam, 'HOU');
});

test('same name + same draft year resolve by overall pick (two Chad Browns, 1993)', () => {
  const lb = NflverseCareerService.get('Chad', 'Brown', 1993, 44);
  const de = NflverseCareerService.get('Chad', 'Brown', 1993, 199);
  assert.equal(lb?.defSacks, 79);
  assert.equal(lb?.draftTeam, 'PIT');
  assert.equal(de?.defSacks, 0.5);
  assert.equal(de?.draftTeam, 'PHO');
});

test('without a pick, a name collision returns the more notable career (higher wAV)', () => {
  const c = NflverseCareerService.get('Chad', 'Brown', 1993);
  assert.equal(c?.defSacks, 79);
});
