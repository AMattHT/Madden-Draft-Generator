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

test('a player re-drafted after not signing appears only in the draft he signed from', () => {
  const bo = (year: number) => PlayerLookupService.byYear(year).filter((p) => p.firstName === 'Bo' && p.lastName === 'Jackson');
  assert.equal(bo(1986).length, 0, 'Bo Jackson is not in the 1986 class');
  assert.equal(bo(1987).length, 1, 'Bo Jackson is in the 1987 class once');
  assert.equal(bo(1987)[0].draftPick, 183);
  assert.equal(bo(1987)[0].careerTo, 1990, 'his career rides along');
  const erickson = (year: number) => PlayerLookupService.byYear(year).filter((p) => p.firstName === 'Craig' && p.lastName === 'Erickson');
  assert.equal(erickson(1991).length, 0);
  assert.equal(erickson(1992).length, 1);
});

test('same-name men of the same school are kept apart when the earlier one had his own career', () => {
  const davis = (year: number) => PlayerLookupService.byYear(year).filter((p) => p.firstName === 'Mike' && p.lastName === 'Davis' && /colorado/i.test(p.college));
  assert.equal(davis(1977).length, 1, 'the Raiders safety stays in 1977');
  assert.equal(davis(1980).length, 1);
  const clay = (year: number) => PlayerLookupService.byYear(year).filter((p) => p.firstName === 'Clay' && p.lastName === 'Matthews');
  assert.equal(clay(1978).length, 1);
  assert.equal(clay(2009).length, 1);
});
