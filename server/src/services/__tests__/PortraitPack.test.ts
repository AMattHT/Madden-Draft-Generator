import test from 'node:test';
import assert from 'node:assert/strict';
import { PortraitPackService } from '../PortraitPackService';
import { PlayerLookupService } from '../PlayerLookupService';

test('the pack points Brady at his own id and leaves a player the game still ships alone', () => {
  const brady = PlayerLookupService.byYear(2000, 'NFL').find((p) => p.lastName === 'Brady' && p.firstName === 'Tom')!;
  const manning = PlayerLookupService.byYear(1998, 'NFL').find((p) => p.lastName === 'Manning' && p.firstName === 'Peyton')!;
  // Brady's class portrait is a tone-matched generic (M27 ships nothing for him);
  // Manning's is his regular portrait 1971, which M27 still ships.
  const prospects: Array<Record<string, unknown>> = [{ PID: 0 }, { PID: 1971 }];
  const out = PortraitPackService.apply(prospects, [brady, manning]);
  assert.equal(out.length, 1);
  assert.equal(out[0].lastName, 'Brady');
  assert.equal(out[0].pid, 494); // his M26 portrait id, free in M27
  assert.ok(prospects[0].PID === 494 && prospects[0].pinPortrait === true);
  assert.match(out[0].source, /BradyTom/);
  assert.equal(prospects[1].pinPortrait, undefined);
});

test('generated filler and players whose id M27 ships never get a pack id', () => {
  const brady = PlayerLookupService.byYear(2000, 'NFL').find((p) => p.lastName === 'Brady' && p.firstName === 'Tom')!;
  const manning = PlayerLookupService.byYear(1998, 'NFL').find((p) => p.lastName === 'Manning' && p.firstName === 'Peyton')!;
  const filler = { ...brady, source: 'generated' };
  // Filler is skipped; Manning's class portrait is his own shipped 1971, so nothing to supply.
  const a = PortraitPackService.assign([{ PID: 0 }, { PID: 1971 }], [filler, manning]);
  assert.equal(a.length, 0);
});

test('the full pack is the portraits the app holds that M27 lacks, Brady and Newton among them', () => {
  const entries = PortraitPackService.fullPackEntries();
  assert.ok(entries.length > 4500, String(entries.length));
  assert.ok(entries.some((e) => e.pid === 494 && /Brady/.test(e.name)));
  assert.ok(entries.some((e) => e.pid === 4439 && /Newton/.test(e.name)));
  assert.ok(!entries.some((e) => e.pid === 1971)); // Manning is shipped
});
