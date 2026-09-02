import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClassCsv, CSV_FIXED_COLUMNS } from './csv';
import { ATTR_COLUMNS } from './constants';
import type { PlayerRow } from './types';

function row(over: Partial<PlayerRow> = {}): PlayerRow {
  const ratings: Record<string, number> = {};
  for (const c of ATTR_COLUMNS) ratings[c.key] = 50;
  return {
    id: 1, pick: 1, firstName: 'Peyton', lastName: 'Manning', position: 'QB', positionId: 0,
    overall: 80, devTrait: 3, archetype: 1, archetypeName: 'Field General', draftYear: 1998,
    round: 1, draftPick: 1, wav: 271, wavSource: 'actual', face: 'asset', college: 'Tennessee',
    age: 22, heightInches: 77, weight: 230, jersey: 18, bodyType: 'Standard', photoUrl: null,
    team: { abbr: 'IND', name: 'Indianapolis Colts', logo: null },
    combine: { forty: 4.8, bench: null, vertical: 30, broad: null, cone: null, shuttle: null },
    ratings, ...over,
  };
}

test('header is the fixed columns followed by every attribute abbreviation', () => {
  const [header] = buildClassCsv([row()], {}).split('\n');
  assert.equal(header, [...CSV_FIXED_COLUMNS, ...ATTR_COLUMNS.map((c) => c.label)].join(','));
  assert.equal(CSV_FIXED_COLUMNS.length, 27);
});

test('edits to names, position, dev, bio and ratings are applied', () => {
  const csv = buildClassCsv([row()], { 1: { lastName: 'Manning, Sr.', position: 3, devTrait: 0, weight: 240, speed: 99 } });
  const [, line] = csv.split('\n');
  const cells = line.split(',');
  // "Manning, Sr." is quoted because of the comma, so it spans two split cells.
  assert.equal(`${cells[2]},${cells[3]}`, '"Manning, Sr."');
  const shift = 1; // one extra split cell from the quoted comma
  assert.equal(cells[3 + shift], 'WR');
  assert.equal(cells[6 + shift], 'Normal');
  assert.equal(cells[CSV_FIXED_COLUMNS.indexOf('Weight') + shift], '240');
  assert.equal(cells[CSV_FIXED_COLUMNS.length + ATTR_COLUMNS.findIndex((c) => c.key === 'speed') + shift], '99');
});

test('height is written both formatted and in inches; blanks for missing combine numbers', () => {
  const [, line] = buildClassCsv([row()], {}).split('\n');
  const cells = line.split(',');
  assert.equal(cells[CSV_FIXED_COLUMNS.indexOf('Height')], '"6\'5"""');
  assert.equal(cells[CSV_FIXED_COLUMNS.indexOf('HeightIn')], '77');
  assert.equal(cells[CSV_FIXED_COLUMNS.indexOf('Bench')], '');
});
