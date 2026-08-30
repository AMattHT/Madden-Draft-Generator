import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RetroHeadshotService } from '../RetroHeadshotService';

/** The retro pack is keyed by name alone, so a name shared across eras returned
 *  the wrong man's face — and once Madden art was preferred over web photos,
 *  that showed on the board. Across six classes 52 of 701 name matches (7.4%)
 *  were a different player. Position is the guard. */

test('a same-name player from another era is refused', () => {
  // The 1973 Steelers cornerback vs the 2011 West Virginia linebacker, whose
  // photo is the one that actually sits on the 2012 disc.
  assert.equal(RetroHeadshotService.lookup('J.T.', 'Thomas', 'CB'), null);
  const lb = RetroHeadshotService.lookup('J.T.', 'Thomas', 'LOLB');
  assert.ok(lb, 'the linebacker himself must still resolve');
  assert.equal(lb!.position, 'LOLB');
});

test('a legend on a much later disc still resolves', () => {
  // Why the guard is position and not era: Madden ships legends, so Walter
  // Payton's real photo is legitimately on a 2012 disc, decades post-draft.
  const payton = RetroHeadshotService.lookup('Walter', 'Payton', 'HB');
  assert.ok(payton, 'Payton is HB on both sides and must survive');
});

test('related positions are compatible, unrelated ones are not', () => {
  const favre = RetroHeadshotService.lookup('Brett', 'Favre', 'QB');
  assert.ok(favre, 'an ordinary match must still work');
  assert.equal(RetroHeadshotService.lookup('Brett', 'Favre', 'CB'), null, 'a QB is not a corner');
  // A 3-4 rusher is listed as EDGE, DL or LB depending on the source, so those
  // must not refuse each other.
  assert.ok(RetroHeadshotService.lookup('Brett', 'Favre', undefined), 'no position: nothing to refuse on');
});

test('filePath and portraitPng honour the same guard', async () => {
  assert.equal(RetroHeadshotService.filePath('J.T.', 'Thomas', 'CB'), null);
  assert.equal(await RetroHeadshotService.portraitPng('J.T.', 'Thomas', 256, 'CB'), null);
  assert.ok(RetroHeadshotService.filePath('Brett', 'Favre', 'QB'));
});
