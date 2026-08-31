import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../../config/paths';
import { preferredHeadshot, NflverseCareerService } from '../NflverseCareerService';

/** preferredHeadshot sends any player last seen in 2019 or earlier to ESPN,
 *  because the NFL CDN answers for those with a silhouette placeholder. That
 *  assumed the id was right. nflverse files espn_id 17343 on Michael Carter,
 *  the 1984 SMU nose tackle (born 1960); ESPN's 17343 is a Michael Carter born
 *  in 1991. The URL resolves, so the 1984 class showed a real photograph of a
 *  man born after that player had retired.
 *
 *  build-espn-headshot-check.ts compares ESPN's birth year against nflverse's
 *  and bakes the ids that disagree. */

const blocklist = (): Record<string, unknown> => {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'espn-headshot-blocklist.json'), 'utf8'));
    return raw.blocked ?? {};
  } catch {
    return {};
  }
};

test('an id ESPN files under a different birth year is not used', () => {
  const blocked = blocklist();
  const ids = Object.keys(blocked);
  if (!ids.length) return; // list not built in this checkout
  for (const id of ids) {
    assert.equal(
      preferredHeadshot(id, 1992, null),
      null,
      `${id} points at a different person and must not become a headshot URL`
    );
    // Not even the NFL url: for a player this old that is the silhouette
    // placeholder, which would swap a stranger's face for a fake one.
    assert.equal(preferredHeadshot(id, 1992, 'https://nfl/x.png'), null);
  }
});

test('ordinary ids still resolve to the ESPN headshot', () => {
  // 2580 is not blocked; a retired player must still reach ESPN, or the whole
  // point of preferring it over the NFL silhouette is lost.
  assert.ok(!Object.keys(blocklist()).includes('2580'));
  assert.equal(
    preferredHeadshot('2580', 2010, null),
    'https://a.espncdn.com/i/headshots/nfl/players/full/2580.png'
  );
  // Current players keep the NFL photo.
  assert.equal(preferredHeadshot('2580', 2025, 'https://nfl/y.png'), 'https://nfl/y.png');
});

test('Michael Carter (1984) does not wear a modern namesake\'s face', () => {
  // Straight at the source: this is where the ESPN URL is built, and it is the
  // record DraftEnrichment copies the headshot from onto the class row.
  const carter = NflverseCareerService.get('Michael', 'Carter', 1984, 121);
  assert.ok(carter, 'nflverse should still have the 1984 nose tackle');
  assert.equal(carter!.careerTo, 1992, 'and it should be the right Michael Carter');
  const photo = carter!.headshotUrl ?? '';
  assert.ok(
    !photo.includes('/17343.'),
    `1984 Michael Carter still points at ESPN 17343, a player born in 1991 (${photo})`
  );
});
