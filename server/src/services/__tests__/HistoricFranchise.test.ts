import { test } from 'node:test';
import assert from 'node:assert/strict';
import { companionBracket, type TeamRecord, type PlayedGame } from '../HistoricFranchiseService';
import { SeasonPackService } from '../SeasonPackService';
import { EraRulesService } from '../EraRulesService';

/** The 1975 final standings and results, expressed in today's team names as a save would hold them. */
function real1975() {
  const pack = SeasonPackService.get(1975)!;
  const modern = new Map(pack.teams.map((t) => [t.key, t.modernName]));
  const records = new Map<string, TeamRecord>();
  pack.standings.forEach((s, i) => records.set(modern.get(s.team)!, { name: modern.get(s.team)!, teamIndex: i, wins: s.wins, losses: s.losses, ties: s.ties, pointsFor: s.pointsFor ?? 0, pointsAgainst: s.pointsAgainst ?? 0 }));
  const games: PlayedGame[] = pack.schedule.map((g) => ({ home: modern.get(g.home)!, away: modern.get(g.away)!, homeScore: g.homeScore!, awayScore: g.awayScore! }));
  return { pack, records, games };
}

test('companion bracket seeds the real 1975 field under 1975 rules', () => {
  const { pack, records, games } = real1975();
  const era = EraRulesService.rulesFor(1975)!;
  const b = companionBracket(pack, era, records, games);
  const afc = b.conferences.AFC.map((s) => s.team);
  const nfc = b.conferences.NFC.map((s) => s.team);
  // Division winners: Steelers, Colts (10-4, over the Dolphins on the head-to-head sweep), Raiders; wild card Bengals.
  assert.deepEqual(new Set(afc), new Set(['Steelers', 'Colts', 'Raiders', 'Bengals']));
  assert.equal(b.conferences.AFC.find((s) => s.team === 'Bengals')?.via, 'wildcard');
  assert.equal(b.conferences.AFC.find((s) => s.team === 'Colts')?.via, 'division');
  // Cardinals, Vikings, Rams; wild card Cowboys.
  assert.deepEqual(new Set(nfc), new Set(['Cardinals', 'Vikings', 'Rams', 'Cowboys']));
  assert.equal(b.conferences.NFC.find((s) => s.team === 'Cowboys')?.via, 'wildcard');
  assert.equal(b.conferences.AFC[0].team, 'Steelers');
  assert.ok(b.conferences.AFC.every((s) => !s.bye), 'no byes in an 8-team field');
  assert.equal(b.games.length, 4, 'four divisional games');
  assert.ok(b.games.every((g) => /Divisional/.test(g.round)));
});

test('companion bracket applies wild cards and byes for a 12-team era', () => {
  const { pack, records, games } = real1975();
  const era = EraRulesService.rulesFor(1990)!; // 3 winners + 3 wild cards, 2 byes per conference
  const b = companionBracket(pack, era, records, games);
  assert.equal(b.conferences.AFC.length, 6);
  assert.equal(b.conferences.AFC.filter((s) => s.via === 'wildcard').length, 3);
  assert.deepEqual(b.conferences.AFC.slice(0, 2).map((s) => s.bye), [true, true]);
  assert.equal(b.games.filter((g) => g.round.startsWith('AFC')).length, 2, 'two wild-card games per conference');
});
