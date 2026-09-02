import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WikipediaTeamService } from '../WikipediaTeamService';

const row = (pick: number, team: string, player: string, pos: string, college: string) =>
  `<tr><td>${pick}</td><td><a href="/wiki/x">${team}</a></td><td><a href="/wiki/y">${player}</a></td><td>${pos}</td><td>${college}</td></tr>`;
const HTML = `<table class="wikitable"><tbody>
<tr><th>Pick #</th><th>NFL team</th><th>Player</th><th>Position</th><th>College</th></tr>
${row(1, 'San Francisco 49ers', 'Dave Parks', 'End', 'Texas Tech')}
${row(2, 'Philadelphia Eagles', 'Bob Brown', 'Offensive tackle', 'Nebraska')}
${row(169, 'San Francisco 49ers', 'Bob Brown', 'Tackle', 'Arkansas A&amp;M')}
</tbody></table>`;

test('a name two draftees share is keyed by college, and the bare name is dropped as ambiguous', () => {
  const map = WikipediaTeamService.parseHtml(HTML, 1964);
  assert.equal(map.get('daveparks')?.abbr, 'SF');
  assert.equal(map.get('daveparks|texastech')?.abbr, 'SF');
  assert.equal(map.get('bobbrown|nebraska')?.abbr, 'PHI');
  assert.equal(map.get('bobbrown|arkansasam')?.abbr, 'SF');
  assert.equal(map.get('bobbrown'), undefined, 'ambiguous bare name must not resolve');
});

test('teamFor prefers the college key and falls back to a unique bare name', () => {
  const map = WikipediaTeamService.parseHtml(HTML, 1964);
  assert.equal(WikipediaTeamService.teamFor(map, 'Bob', 'Brown', 'Nebraska')?.abbr, 'PHI');
  assert.equal(WikipediaTeamService.teamFor(map, 'Bob', 'Brown', 'Ark-Pine Bluff'), undefined, 'college the page spells differently: no guess');
  assert.equal(WikipediaTeamService.teamFor(map, 'Dave', 'Parks', 'Some Other College')?.abbr, 'SF', 'unique name wins even when the college disagrees');
  assert.equal(WikipediaTeamService.teamFor(map, 'Dave', 'Parks', null)?.abbr, 'SF');
});
