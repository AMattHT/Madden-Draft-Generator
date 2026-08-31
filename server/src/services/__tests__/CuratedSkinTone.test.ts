import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CuratedSkinToneService } from '../CuratedSkinToneService';
import { PlayerLookupService } from '../PlayerLookupService';
import { DerivedSkinToneService } from '../DerivedSkinToneService';
import { RetroItaService } from '../RetroItaService';

/** Two thirds of the database has no tone evidence of any kind, so the tone is
 *  inferred from a position/era prior. For an individual that is a weighted
 *  coin, and it lands wrong both ways: the 1964 receiver prior made Bob Hayes
 *  white, the 1964 defensive back prior made Paul Krause black. Neither can be
 *  fixed by moving the prior without breaking the players it gets right, so
 *  Hall of Famers -- public record, and the faces people actually look at --
 *  are recorded instead. */

const light = (t: number | null) => t != null && t <= 3;
const dark = (t: number | null) => t != null && t >= 5;

test('the players who prompted this get the right end of the scale', () => {
  assert.ok(dark(CuratedSkinToneService.toneFor('Bob', 'Hayes', 1964)), 'Bob Hayes was black');
  assert.ok(light(CuratedSkinToneService.toneFor('Paul', 'Krause', 1964)), 'Paul Krause was white');
  // Krause has a portrait; it is the portrait that is wrong (ITA -31.4 off a dim
  // sepia photo), so the record has to beat measured evidence, not just fill a gap.
  const p = PlayerLookupService.byYear(1964).find((x) => x.firstName === 'Paul' && x.lastName === 'Krause');
  assert.ok(p?.photoId, 'Krause should still have the portrait that reads wrong');
});

test('every Hall of Famer with no evidence at all is covered', () => {
  const missing: string[] = [];
  for (const year of PlayerLookupService.years()) {
    for (const p of PlayerLookupService.byYear(year)) {
      if (!p.isHOF) continue;
      const portrait = p.photoId ? DerivedSkinToneService.itaForPid(p.photoId) : null;
      const retro = RetroItaService.itaFor(p.firstName, p.lastName, p.position);
      const hasEvidence =
        (portrait && (portrait.ita != null || portrait.greyL != null)) ||
        retro != null ||
        !!p.wikiImageUrl ||
        (p.race != null && p.race !== 7);
      if (hasEvidence) continue;
      if (CuratedSkinToneService.toneFor(p.firstName, p.lastName, p.draftYear) == null) {
        missing.push(`${p.firstName} ${p.lastName} (${p.draftYear})`);
      }
    }
  }
  assert.equal(
    missing.length,
    0,
    `Hall of Famers left to a prior with nothing to go on: ${missing.slice(0, 8).join(', ')}`
  );
});

test('pre-1946 draftees are light, which is history rather than judgement', () => {
  // The NFL had no black players from 1934 to 1945.
  for (const [f, l, y] of [
    ['Danny', 'Fortmann', 1936],
    ['Bulldog', 'Turner', 1940],
    ['Steve', 'Van Buren', 1944],
    ['Charley', 'Trippi', 1945],
  ] as [string, string, number][]) {
    assert.ok(light(CuratedSkinToneService.toneFor(f, l, y)), `${f} ${l} played before the NFL reintegrated`);
  }
});

test('the overlay does not reach players it was never given', () => {
  assert.equal(CuratedSkinToneService.toneFor('Nobody', 'Whatsoever', 1999), null);
  // Keyed by draft year, because names repeat: three Paul Krauses are in the
  // lookup and only the 1964 safety is recorded.
  assert.equal(CuratedSkinToneService.toneFor('Paul', 'Krause', 1967), null);
  assert.ok(CuratedSkinToneService.size >= 100, 'the overlay should have loaded');
});
