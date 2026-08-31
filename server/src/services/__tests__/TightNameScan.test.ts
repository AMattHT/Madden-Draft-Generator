import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LikenessService } from '../LikenessService';
import { PlayerLookupService } from '../PlayerLookupService';

/**
 * The M27 scan catalog is keyed by the game's spelling of a name and the lookup
 * by its own, and m27Key strips punctuation while keeping spaces -- so "T. J.
 * Parker" keys as "t j parker" while the game's "t.j. parker" keys as "tj
 * parker". The two never met, and 2026 rookies had scans sitting unused because
 * of a full stop.
 *
 * The fix is a second, tighter key with the spaces gone too. That is looser, and
 * looser is how a class ends up wearing other people's faces, so it runs behind
 * the same era check as the exact key. With that check removed the 2026 pick 149
 * called Justin Jefferson takes the 2020 receiver's head -- verified by removing
 * it, not assumed.
 */

const find = (first: string, last: string, year: number) =>
  PlayerLookupService.byYear(year).find((p) => p.firstName === first && p.lastName === last);

test('a name the two sources punctuate differently still finds its scan', () => {
  for (const [first, last] of [['T. J.', 'Parker'], ['A. J.', 'Haulcy']] as [string, string][]) {
    const p = find(first, last, 2026);
    assert.ok(p, `${first} ${last} should be in the 2026 class`);
    const head = LikenessService.resolveHead(p!, 'm27');
    assert.ok(head?.assetName, `${first} ${last} has a scan in the catalog and should be matched to it`);
  }
});

test('the looser key does not hand a rookie an established player\'s face', () => {
  // Pick 149 of 2026 shares a name with the 2020 receiver, whose scan is in the
  // catalog. Matching on name alone finds it; the era check is what refuses it.
  const p = find('Justin', 'Jefferson', 2026);
  assert.ok(p, 'the 2026 Justin Jefferson should be in the class');
  const head = LikenessService.resolveHead(p!, 'm27');
  assert.equal(head, null, 'a 2026 rookie must not inherit the 2020 receiver\'s head');
});

test('the exact key still works, so the fallback changed nothing else', () => {
  // An unambiguous 2026 rookie with no punctuation and no namesake.
  const withScan = PlayerLookupService.byYear(2026).filter(
    (p) => LikenessService.resolveHead(p, 'm27')?.assetName
  );
  assert.ok(
    withScan.length > 200,
    `2026 should keep its scans; got ${withScan.length}`
  );
});
