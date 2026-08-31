import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RetroHeadshotService } from '../RetroHeadshotService';
import { RetroItaService } from '../RetroItaService';
import { NflverseCareerService } from '../NflverseCareerService';

/** The retro pack was keyed by name alone, and the earliest disc won. That is
 *  right for one man across several discs and wrong for two men who share a
 *  name: a 2008 safety called Cam Newton claimed the key, so the 2011
 *  quarterback -- whose photo is on six discs -- had none, and every lookup for
 *  him was refused by the position guard. 343 names were hiding a second player
 *  this way. The pack now keeps the earliest disc per position group. */

test('a name covering two players holds both their photos', () => {
  const qb = RetroHeadshotService.lookup('Cam', 'Newton', 'QB');
  const db = RetroHeadshotService.lookup('Cam', 'Newton', 'SS');
  assert.ok(qb, 'the quarterback should have a headshot of his own');
  assert.ok(db, 'the safety should keep his');
  assert.equal(qb!.position, 'QB');
  assert.notEqual(qb!.file, db!.file, 'two players must not share one photo');
  assert.ok(RetroHeadshotService.filePath('Cam', 'Newton', 'QB'), 'and the file should exist');
});

test('skin tone is measured off the right photo', () => {
  // Taking the name's first entry gave the quarterback the safety's tone.
  const qb = RetroItaService.itaFor('Cam', 'Newton', 'QB');
  const db = RetroItaService.itaFor('Cam', 'Newton', 'SS');
  assert.ok(qb != null && db != null, 'both photos should have a measurement');
  assert.notEqual(qb, db, 'and they should not be the same reading');
});

test('a player at one position still resolves without a position hint', () => {
  // The overwhelming majority of names hold one man; nothing about the change
  // may cost them their photo.
  const hit = RetroHeadshotService.lookup('Walter', 'Payton', 'HB');
  assert.ok(hit, 'Walter Payton ships on the Madden discs as a legend');
  assert.ok(RetroHeadshotService.filePath('Walter', 'Payton', 'HB'));
});

test('a fullback filed under HB by the draft table is corrected', () => {
  // Kyle Juszczyk (2013, round 4 pick 130) is "HB" in ALL_PLAYER_LOOKUP and FB
  // everywhere else. Madden has a separate FB with its own ratings, so the
  // label decides what kind of player he becomes.
  const nv = NflverseCareerService.get('Kyle', 'Juszczyk', 2013, 130);
  assert.ok(nv, 'nflverse should have him');
  assert.equal(nv!.position, 'FB', 'and it should know he is a fullback');
});
