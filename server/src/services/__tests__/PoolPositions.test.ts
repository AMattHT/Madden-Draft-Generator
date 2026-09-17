import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlayerLookupService } from '../PlayerLookupService';

test('the pool lists players at the position the draft class would give them', () => {
  const cat = PlayerLookupService.catalog();
  const at = (f: string, l: string, year: number) => cat.find((p) => p.first === f && p.last === l && p.year === year)!;
  assert.equal(at('Rod', 'Woodson', 1987).mpos, 'FS');
  assert.ok(['LEDG', 'REDG'].includes(at('Julius', 'Peppers', 2002).mpos), 'Peppers is an edge');
  assert.equal(at('Julius', 'Peppers', 2002).grp, 'EDGE');
  assert.equal(at('Ronnie', 'Lott', 1981).mpos, 'SS');
  assert.equal(at('Lawrence', 'Taylor', 1981).grp, 'EDGE');
});
