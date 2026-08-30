import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enrichedClass } from '../DraftEnrichment';
import { RetroItaService } from '../RetroItaService';

/** A player with no in-game portrait was toned from his Wikipedia photo plus the
 *  position/era prior. Mike Pritchard (1991 WR, Colorado) came out tone 2 that
 *  way and drew a white generic head. His Madden disc headshot — a studio crop
 *  framed like the portraits the ITA model was calibrated on — reads -37.5,
 *  squarely tone 7. */

test('the retro headshot supplies a skin sample', () => {
  const ita = RetroItaService.itaFor('Mike', 'Pritchard');
  assert.ok(ita != null, 'Pritchard is on the 2001 disc');
  assert.ok(ita! < -20, `expected a clearly dark reading, got ${ita}`);
  assert.equal(RetroItaService.itaFor('Nobody', 'Whatsoever'), null);
});

test('it corrects the tone without disturbing the obvious cases', async () => {
  const { players } = await enrichedClass(1991, 'NFL', { fill: false });
  const find = (last: string) => players.find((p) => p.lastName === last);
  assert.equal(find('Pritchard')?.race, 7, 'was tone 2 off a wiki reading of 3');
  assert.equal(find('Favre')?.race, 2, 'must stay light');
  assert.equal(find('Marinovich')?.race, 2, 'must stay light');
});
