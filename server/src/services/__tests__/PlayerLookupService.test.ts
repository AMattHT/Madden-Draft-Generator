import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlayerLookupService } from '../PlayerLookupService';

test('1960 AFL draftees have rounds (source rows say "AFL 1" / "ALF 1")', () => {
  const afl = PlayerLookupService.byYear(1960, 'AFL');
  assert.ok(afl.length > 200, `AFL 1960 rows: ${afl.length}`);
  const drafted = afl.filter((p) => p.draftRound != null);
  assert.ok(drafted.length >= 200, `with a round: ${drafted.length}`);
  assert.ok(new Set(drafted.map((p) => p.draftRound)).size > 5, 'rounds should be spread, not all round 1');
});

test('1960 combined class interleaves AFL stars with the NFL rounds (Talamini inside the 402)', () => {
  const combined = PlayerLookupService.byYear(1960, 'combined');
  const idx = combined.findIndex((p) => p.lastName === 'Talamini');
  assert.ok(idx >= 0 && idx < 402, `Talamini at index ${idx}`);
});

test('1967-69 common drafts are one league, not "AFL"', () => {
  for (const year of [1967, 1968, 1969]) {
    const nfl = PlayerLookupService.byYear(year, 'NFL');
    assert.ok(nfl.length > 400, `${year} NFL view has ${nfl.length} players`);
  }
});

test('wiki photo URLs: icons/SVGs are dropped and a photo shared across decades stays only with its real owner', () => {
  const all = PlayerLookupService.years().flatMap((y) => PlayerLookupService.byYear(y, 'combined'));
  const svg = all.filter((p) => p.wikiImageUrl && /\.svg(\.png)?$/i.test(p.wikiImageUrl));
  assert.equal(svg.length, 0, `${svg.length} SVG photo URLs survive`);
  const smiths = all.filter((p) => p.firstName === 'Bruce' && p.lastName === 'Smith' && p.wikiImageUrl);
  assert.ok(smiths.every((p) => p.draftYear >= 1980), `Bruce Smith photo on draft years ${smiths.map((p) => p.draftYear).join(',')}`);
  // no URL is attached to rows from more than one draft year (other than dual-draft same-year rows)
  const byUrl = new Map<string, Set<number>>();
  for (const p of all) if (p.wikiImageUrl) byUrl.set(p.wikiImageUrl, (byUrl.get(p.wikiImageUrl) ?? new Set()).add(p.draftYear));
  const shared = [...byUrl.values()].filter((ys) => ys.size > 1).length;
  assert.equal(shared, 0, `${shared} photo URLs still shared across draft years`);
});
