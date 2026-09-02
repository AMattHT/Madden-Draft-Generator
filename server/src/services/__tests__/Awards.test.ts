import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../../config/paths';
import { parseAwardTables, groupOfAwardPos, AwardsService } from '../AwardsService';

const hasFile = fs.existsSync(path.join(LOOKUPS_DIR, 'nfl-awards.json'));
const skipWithoutFile = hasFile ? undefined : { skip: 'nfl-awards.json not baked' };

const HTML = `<table class="wikitable sortable"><tbody>
<tr><th>Season</th><th>Player</th><th>Position</th><th>Team</th><th>Ref.</th></tr>
<tr><td><a href="/wiki/2023_NFL_season">2023</a></td><th scope="row"><span data-sort-value="Stroud, C. J."><span class="vcard"><span class="fn"><a href="/wiki/C._J._Stroud">C. J. Stroud</a></span></span></span></th><td rowspan="2"><a href="/wiki/Quarterback">Quarterback</a></td><td><a href="/wiki/Houston_Texans">Houston Texans</a></td><td><sup class="reference">[1]</sup></td></tr>
<tr><td><a href="/wiki/2024_NFL_season">2024</a></td><th scope="row"><span data-sort-value="Daniels, Jayden"><span class="fn"><a href="/wiki/Jayden_Daniels">Jayden Daniels</a></span></span></th><td><a href="/wiki/Washington_Commanders">Washington Commanders</a></td><td></td></tr>
<tr><td>2025</td><th scope="row"><span data-sort-value="McMillan, Tetairoa"><span class="fn">Tetairoa McMillan</span></span></th><td>Wide receiver</td><td>Carolina Panthers</td><td></td></tr>
</tbody></table>
<table class="wikitable"><tbody><tr><th>Awards</th><th>Player</th></tr><tr><td>3</td><td>Somebody</td></tr></tbody></table>`;

test('the winners table parses seasons, split names and a rowspan position; other tables are ignored', () => {
  const tables = parseAwardTables(HTML);
  assert.equal(tables.length, 1);
  const [rows] = tables;
  assert.deepEqual(rows.map((r) => [r.season, r.first, r.last, r.pos]), [
    [2023, 'C. J.', 'Stroud', 'Quarterback'],
    [2024, 'Jayden', 'Daniels', 'Quarterback'],
    [2025, 'Tetairoa', 'McMillan', 'Wide receiver'],
  ]);
});

test('award position words map to the app position groups, defensive tackles included', () => {
  assert.equal(groupOfAwardPos('Quarterback'), 'QB');
  assert.equal(groupOfAwardPos('Defensive tackle'), 'IDL');
  assert.equal(groupOfAwardPos('Offensive tackle'), 'OL');
  assert.equal(groupOfAwardPos('Defensive end'), 'EDGE');
  assert.equal(groupOfAwardPos('Linebacker'), 'LB');
  assert.equal(groupOfAwardPos('Running back'), 'RB');
});

test('the baked file knows the 2023 rookies of the year and keeps a namesake out', skipWithoutFile, () => {
  assert.deepEqual(AwardsService.awardsFor('C.J.', 'Stroud', 2023, 'QB'), ['OROY']);
  assert.deepEqual(AwardsService.awardsFor('Will', 'Anderson', 2023, 'EDGE'), ['DROY']);
  assert.deepEqual(AwardsService.awardsFor('Jared', 'Verse', 2024, 'EDGE'), ['DROY']);
  // The 2011 fifth-round Jared Verse does not exist, but a namesake drafted after
  // the season, or at another position, would not inherit it.
  assert.deepEqual(AwardsService.awardsFor('Jared', 'Verse', 2025, 'EDGE'), []);
  assert.deepEqual(AwardsService.awardsFor('Jared', 'Verse', 2024, 'QB'), []);
  assert.ok(AwardsService.awardsFor('Josh', 'Allen', 2018, 'QB').includes('MVP'));
});
