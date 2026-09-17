import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teamInfoMap } from './rosterTeams';

test('roster teams find their franchise logo by nickname, then by city', () => {
  const teams = [
    { id: 1, name: 'Bears', city: 'Chicago', abbr: 'CHI' },
    { id: 26, name: 'Redskins', city: 'Washington', abbr: 'WAS' },
    { id: 15, name: '49ers', city: 'San Francisco', abbr: 'SF' },
    { id: 1009, name: 'FreeAgents', city: '', abbr: 'FA' },
    { id: 99, name: 'Yankees', city: 'Bronx', abbr: 'NYY' },
  ];
  const franchises = [
    { key: 'CHI', name: 'Chicago Bears', logo: '/l/chi.png' },
    { key: 'WAS', name: 'Washington Commanders', logo: '/l/was.png' },
    { key: 'SFO', name: 'San Francisco 49ers', logo: '/l/sfo.png' },
  ];
  const m = teamInfoMap(teams, franchises);
  assert.deepEqual(m.get(1), { abbr: 'CHI', name: 'Chicago Bears', logo: '/l/chi.png' });
  assert.equal(m.get(26)?.logo, '/l/was.png', 'city fallback for the renamed club');
  assert.equal(m.get(15)?.logo, '/l/sfo.png');
  assert.equal(m.has(1009), false, 'free agency has no logo');
  assert.equal(m.has(99), false, 'unmatched teams fall back to text');
});
