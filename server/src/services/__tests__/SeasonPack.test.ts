import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeasonPackService } from '../SeasonPackService';
import { EraRulesService } from '../EraRulesService';
import { PlayerLookupService } from '../PlayerLookupService';

test('era rules: playoff fields by season match NFL history', () => {
  assert.equal(EraRulesService.rulesFor(1975)?.playoff.teams, 8);
  assert.equal(EraRulesService.rulesFor(1975)?.gamesPerTeam, 14);
  assert.equal(EraRulesService.rulesFor(1978)?.playoff.teams, 10);
  assert.equal(EraRulesService.rulesFor(1990)?.playoff.teams, 12);
  assert.equal(EraRulesService.rulesFor(2020)?.playoff.teams, 14);
  assert.equal(EraRulesService.rulesFor(2025)?.gamesPerTeam, 17);
  assert.equal(EraRulesService.rulesFor(1965), null);
  // Every season from 1970 on is covered exactly once.
  for (let y = 1970; y <= 2030; y++) assert.ok(EraRulesService.rulesFor(y), String(y));
});

test('1975 season pack: 26 teams in the real divisions, 182 games, records reconciled', () => {
  const pack = SeasonPackService.get(1975);
  assert.ok(pack, 'data/seasons/1975.json is baked');
  assert.equal(pack.teams.length, 26);
  assert.deepEqual(Object.keys(pack.divisions.AFC), ['AFC East', 'AFC Central', 'AFC West']);
  assert.deepEqual(pack.divisions.AFC['AFC East'], ['BAL', 'MIA', 'BUF', 'NYJ', 'NE']);
  assert.deepEqual(pack.divisions.NFC['NFC Central'], ['MIN', 'DET', 'CHI', 'GB']);
  assert.equal(pack.schedule.length, 182);
  const games = new Map<string, { n: number; home: number }>();
  for (const g of pack.schedule) {
    games.set(g.home, { n: (games.get(g.home)?.n ?? 0) + 1, home: (games.get(g.home)?.home ?? 0) + 1 });
    games.set(g.away, { n: (games.get(g.away)?.n ?? 0) + 1, home: games.get(g.away)?.home ?? 0 });
    assert.ok(g.homeScore != null && g.awayScore != null, `${g.week} ${g.away}@${g.home} has a score`);
  }
  for (const [team, c] of games) { assert.equal(c.n, 14, `${team} plays 14`); assert.equal(c.home, 7, `${team} hosts 7`); }
  // Steelers 12-2, Jets 3-11 (the pages that list results winner-first).
  assert.deepEqual(pack.standings.find((s) => s.team === 'PIT')?.wins, 12);
  assert.deepEqual(pack.standings.find((s) => s.team === 'NYJ')?.losses, 11);
  assert.equal(pack.warnings.length, 0, pack.warnings.join('; '));
});

test('1975 season pack: teams map to modern franchises, six clubs are parked, playoffs are the real bracket', () => {
  const pack = SeasonPackService.get(1975)!;
  const oilers = SeasonPackService.team(pack, 'HOU');
  assert.equal(oilers?.franchise, 'TEN');
  assert.equal(oilers?.modernName, 'Titans');
  assert.equal(SeasonPackService.team(pack, 'Colts')?.franchise, 'IND');
  assert.equal(SeasonPackService.team(pack, 'St. Louis Cardinals')?.modernName, 'Cardinals');
  assert.deepEqual(pack.parked, ['Buccaneers', 'Jaguars', 'Panthers', 'Ravens', 'Seahawks', 'Texans']);
  assert.equal(pack.playoffs.length, 7);
  const sb = pack.playoffs.find((g) => /Super Bowl/.test(g.round))!;
  assert.deepEqual([sb.away, sb.home, sb.awayScore, sb.homeScore], ['DAL', 'PIT', 17, 21]);
});

test('1975 season pack: rosters cover every team and most rows resolve to the player pool', () => {
  const pack = SeasonPackService.get(1975)!;
  let total = 0, matched = 0;
  for (const t of pack.teams) {
    const r = pack.rosters[t.key] ?? [];
    assert.ok(r.length >= 40, `${t.name} roster rows: ${r.length}`);
    total += r.length; matched += r.filter((p) => p.poolKey).length;
  }
  assert.ok(matched / total >= 0.75, `pool coverage ${matched}/${total}`);
  // Legal names on the roster resolve to the names the men played under.
  const pit = pack.rosters.PIT;
  assert.equal(pit.find((p) => p.last === 'Lambert')?.poolKey, '1974|NFL|jack|lambert|46');
  assert.equal(pit.find((p) => p.last === 'Blount')?.poolKey, '1970|NFL|mel|blount|53');
  assert.equal(PlayerLookupService.matchActive('Melvin', 'Blount', { season: 1975 })?.firstName, 'Mel');
  assert.equal(PlayerLookupService.matchActive('Nobody', 'Zzyzx', { season: 1975 }), null);
});
