import test from 'node:test';
import assert from 'node:assert/strict';
import { SupplementalDraftService } from '../SupplementalDraftService';
import { PlayerLookupService } from '../PlayerLookupService';
import { NflverseCareerService } from '../NflverseCareerService';
import { nflversePick } from '../../types/player';

const find = (year: number, first: string, last: string, college?: string) =>
  PlayerLookupService.byYear(year, 'NFL').find((p) => p.firstName === first && p.lastName === last && (!college || p.college === college))!;

test('the supplemental table: every pick since 1977 plus the 84-man 1984 USFL/CFL draft', () => {
  const all = SupplementalDraftService.all();
  assert.equal(all.filter((p) => p.draft === 'usfl-cfl').length, 84);
  assert.ok(all.filter((p) => p.draft === 'regular').length >= 46);
  const keys = new Set(all.map((p) => `${p.year}|${p.first}|${p.last}`));
  assert.equal(keys.size, all.length); // no duplicate year+name
  assert.ok(all.every((p) => p.team && p.round >= 1 && p.round <= 12));
  assert.ok(all.filter((p) => p.draft === 'usfl-cfl').every((p) => p.pick! >= 1 && p.pick! <= 28));
});

test('Steve Young 1984: round 1, no overall pick, Buccaneers, after the regular first round; Fryar keeps pick 1', () => {
  const list = PlayerLookupService.byYear(1984, 'NFL');
  const young = list.find((p) => p.firstName === 'Steve' && p.lastName === 'Young' && p.college === 'BYU')!;
  assert.deepEqual(young.supplemental, { round: 1, pick: 1, team: 'Tampa Bay Buccaneers' });
  assert.equal(young.draftRound, 1);
  assert.equal(young.draftPick, null);
  assert.match(young.key!, /\|u$/);
  const pickOnes = list.filter((p) => p.draftPick === 1);
  assert.equal(pickOnes.length, 1);
  assert.equal(pickOnes[0].lastName, 'Fryar');
  const idx = list.indexOf(young);
  const lastRegularFirst = Math.max(...list.map((p, i) => (p.draftRound === 1 && p.draftPick != null ? i : -1)));
  const firstSecond = list.findIndex((p) => p.draftRound === 2);
  assert.ok(idx > lastRegularFirst && idx < firstSecond, `${idx} ${lastRegularFirst} ${firstSecond}`);
  // The other Steve Youngs (1976 Colorado tackle, 1978 Wake Forest end) are untouched.
  assert.equal(find(1976, 'Steve', 'Young').supplemental, undefined);
  assert.equal(find(1976, 'Steve', 'Young').draftPick, 61);
});

test('Carter, Kosar and Bosworth carry their supplemental round and club and follow the round', () => {
  const carter = find(1987, 'Cris', 'Carter');
  assert.deepEqual(carter.supplemental, { round: 4, pick: 3, team: 'Philadelphia Eagles' });
  assert.equal(carter.draftRound, 4);
  const list87 = PlayerLookupService.byYear(1987, 'NFL');
  const after = list87.slice(list87.indexOf(carter) + 1).find((p) => p.draftPick != null);
  assert.ok(after && after.draftRound! >= 5, 'Carter sits after the last regular fourth-round pick');
  assert.equal(find(1985, 'Bernie', 'Kosar').supplemental?.team, 'Cleveland Browns');
  assert.equal(find(1987, 'Brian', 'Bosworth').supplemental?.round, 1);
  const phoenix = SupplementalDraftService.teamInfo('Phoenix Cardinals', 1989);
  assert.equal(phoenix?.name, 'Phoenix Cardinals');
  assert.ok(phoenix?.logo, 'era logo resolved');
});

test('nflversePick hands nflverse the in-round ordinal, which finds the players.csv row', () => {
  const carter = find(1987, 'Cris', 'Carter');
  assert.equal(nflversePick(carter), 3);
  const bits = NflverseCareerService.get('Cris', 'Carter', 1987, nflversePick(carter));
  assert.ok(bits && bits.isHOF);
  assert.equal(nflversePick({ draftPick: 12, supplemental: null }), 12);
  assert.equal(nflversePick({ draftPick: null, supplemental: null }), null);
  assert.equal(nflversePick({ draftPick: null, supplemental: { round: 3, pick: null, team: null } }), undefined);
});

test('the 1984 USFL/CFL picks are in the 1984 class: Reggie White is a Hall of Famer, Zimmerman and Rozier present', () => {
  const white = find(1984, 'Reggie', 'White', 'Tennessee');
  assert.ok(white, 'Reggie White 1984 row');
  assert.deepEqual(white.supplemental, { round: 1, pick: 4, team: 'Philadelphia Eagles' });
  assert.ok(white.isHOF);
  assert.ok(find(1984, 'Gary', 'Zimmerman') && find(1984, 'Mike', 'Rozier'));
});
