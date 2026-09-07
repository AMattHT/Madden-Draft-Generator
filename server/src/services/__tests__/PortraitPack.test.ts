import test from 'node:test';
import assert from 'node:assert/strict';
import { PortraitPackService } from '../PortraitPackService';
import { PlayerLookupService } from '../PlayerLookupService';

test('the pack gives Brady a recycled id and leaves a player the game still ships alone', () => {
  assert.ok(PortraitPackService.slotCount > 500);
  const brady = PlayerLookupService.byYear(2000, 'NFL').find((p) => p.lastName === 'Brady' && p.firstName === 'Tom')!;
  const manning = PlayerLookupService.byYear(1998, 'NFL').find((p) => p.lastName === 'Manning' && p.firstName === 'Peyton')!;
  // Brady's class portrait is a tone-matched generic (M27 ships nothing for him);
  // Manning's is his regular portrait 1971, which M27 still ships.
  const prospects: Array<Record<string, unknown>> = [{ PID: 0 }, { PID: 1971 }];
  const out = PortraitPackService.apply(prospects, [brady, manning]);
  assert.equal(out.length, 1);
  assert.equal(out[0].lastName, 'Brady');
  assert.ok(out[0].pid > 0 && prospects[0].PID === out[0].pid && prospects[0].pinPortrait === true);
  assert.match(out[0].source, /BradyTom/);
  assert.equal(prospects[1].pinPortrait, undefined);
});

test('generated filler never takes a slot; assignment is deterministic', () => {
  const brady = PlayerLookupService.byYear(2000, 'NFL').find((p) => p.lastName === 'Brady' && p.firstName === 'Tom')!;
  const filler = { ...brady, source: 'generated' };
  const a = PortraitPackService.assign([{ PID: 0 }, { PID: 0 }], [filler, brady]);
  const b = PortraitPackService.assign([{ PID: 0 }, { PID: 0 }], [filler, brady]);
  assert.deepEqual(a.map((x) => [x.index, x.pid]), b.map((x) => [x.index, x.pid]));
  assert.equal(a.length, 1);
  assert.equal(a[0].index, 1);
});
