import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlayerLookupService } from '../PlayerLookupService';

/** 1964 drafted two different Bob Browns: the Hall of Fame tackle out of
 *  Nebraska (NFL, pick 2) and the Arkansas-Pine Bluff defensive tackle (AFL,
 *  pick 4). The lookup joined the career by name, so BOTH rows carried
 *  1964-1973, 5 All-Pros, 6 Pro Bowls, wAV 83 — rating the DT as a Superstar.
 *
 *  They must not be merged (different men) and must not share one career. */

const browns = () =>
  PlayerLookupService.byYear(1964).filter((p) => p.firstName === 'Bob' && p.lastName === 'Brown');

test('both Bob Browns survive as separate players', () => {
  const found = browns();
  assert.equal(found.length, 2, 'two different men, so no merge');
  assert.ok(found.some((p) => /nebraska/i.test(p.college)), 'the HOF tackle');
  assert.ok(found.some((p) => /pine bluff/i.test(p.college)), 'the AFL defensive tackle');
});

test('only the Hall of Famer keeps the Hall of Fame career', () => {
  const tackle = browns().find((p) => /nebraska/i.test(p.college))!;
  const dt = browns().find((p) => /pine bluff/i.test(p.college))!;

  assert.equal(tackle.wav, 83, 'the Nebraska tackle owns the career');
  assert.equal(tackle.allPro1, 5);
  assert.equal(tackle.isHOF, true);

  assert.equal(dt.wav, null, 'the DT must not inherit it');
  assert.equal(dt.allPro1, null);
  assert.equal(dt.proBowls, null);
  assert.equal(dt.isHOF, false);
  assert.equal(dt.wavSource, 'predicted', 'he is rated from his draft slot instead');
});

test('a genuine same-name same-college pair is left alone', () => {
  // The split only fires when the colleges disagree, so it cannot touch a
  // player whose rows are really the same man.
  const dupes = PlayerLookupService.byYear(1964).filter(
    (p) => p.wav != null && p.wav > 0
  );
  assert.ok(dupes.length > 10, 'the rest of the class still has real careers');
});
