import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RetroHeadshotService } from '../RetroHeadshotService';
import { PortraitSlotService } from '../PortraitSlotService';
import { BaselinePlayer } from '../../types/player';

/** A historical player with no Madden face, no portrait, and no web photo --
 *  before the retro pack he was skipped and got nothing. */
function player(firstName: string, lastName: string): BaselinePlayer {
  return {
    firstName, lastName, position: 'QB', race: 1,
    playerAssetsId: null, photoId: null,
    headshotUrl: null, pfrImageUrl: null, wikiImageUrl: null,
  } as unknown as BaselinePlayer;
}

test('the pack resolves players off the Madden 2001-2003 discs, and only those', () => {
  assert.ok(RetroHeadshotService.available, 'retro pack missing - run scripts/build-retro-headshot-pack.ts');
  assert.equal(RetroHeadshotService.lookup('Brett', 'Favre')?.year, 2001);
  assert.ok(RetroHeadshotService.filePath('Brett', 'Favre'));
  assert.equal(RetroHeadshotService.lookup('Nobody', 'Whatsoever'), null);
  assert.equal(RetroHeadshotService.filePath('Nobody', 'Whatsoever'), null);
});

test('names match the way the rest of the lookups do (case, accents, suffixes)', () => {
  assert.ok(RetroHeadshotService.lookup('BRETT', 'favre'), 'case');
  const junior = RetroHeadshotService.lookup('Brett', 'Favre Jr.');
  assert.ok(junior, 'suffixes are stripped by normalizeName');
});

test('a player the web has no photo of still earns a portrait slot from the pack', () => {
  const known = player('Brett', 'Favre');
  const unknown = player('Nobody', 'Whatsoever');
  assert.equal(PortraitSlotService.needsCustomPortrait(known), true);
  assert.equal(PortraitSlotService.needsCustomPortrait(unknown), false);

  const [assignment] = PortraitSlotService.assignSlots([known]);
  assert.ok(assignment, 'expected a recycled slot');
  assert.equal(assignment.retroYear, 2001);
  assert.equal(assignment.photoUrl, null, 'no web photo, so the pack is the only source');
});

test('portraitPng upscales the 96x96 source to the requested square', async () => {
  const png = await RetroHeadshotService.portraitPng('Brett', 'Favre', 256);
  assert.ok(png && png.length > 0);
  // PNG IHDR: width and height are big-endian u32 at bytes 16 and 20.
  assert.equal(png!.readUInt32BE(16), 256);
  assert.equal(png!.readUInt32BE(20), 256);
  assert.equal(await RetroHeadshotService.portraitPng('Nobody', 'Whatsoever'), null);
});
