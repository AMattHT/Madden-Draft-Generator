import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NflverseCareerService } from '../NflverseCareerService';
import { enrichedClass } from '../DraftEnrichment';
import { RatingService } from '../RatingService';

/** ALL_PLAYER_LOOKUP holds 4,201 undrafted rows with essentially no career data
 *  (0% seasons-started, 0% wAV, 0.1% All-Pro). nflverse knows 3,479 of them and
 *  has a rookie/last season for 100% of those -- but no draft_year, so the
 *  year-keyed career index cannot reach them. Matching on name + rookie season
 *  recovers the span; the season tolerance is what keeps a same-name player from
 *  another era out. */

test('an undrafted player resolves his career span from nflverse', () => {
  const robinson = NflverseCareerService.getUndrafted('Eugene', 'Robinson', 1985);
  assert.ok(robinson, 'Eugene Robinson (UDFA 1985, 16 seasons) should resolve');
  assert.equal(robinson!.careerFrom, 1985);
  assert.ok((robinson!.careerTo ?? 0) >= 1999, 'his career ran to 2000');
});

test('the season tolerance refuses a same-name player from another era', () => {
  // Right name, wrong decade: must not attach someone else's career.
  assert.equal(NflverseCareerService.getUndrafted('Eugene', 'Robinson', 1940), null);
  assert.equal(NflverseCareerService.getUndrafted('Eugene', 'Robinson', 2015), null);
  // And an unknown name resolves to nothing rather than guessing.
  assert.equal(NflverseCareerService.getUndrafted('Nobody', 'Whatsoever', 1985), null);
});

test('undrafted players no longer collapse onto the draft-slot floor', async () => {
  // Measured recovery by class: 1975 92%, 1985 39%, 1995 85%, 2005 86%, 2015 86%
  // -- 75% overall. A miss is usually correct: nflverse only lists players who
  // actually appeared in a game, and many undrafted rows never did (1985 is the
  // low outlier, the USFL years). So assert the aggregate, not a single class.
  let undrafted = 0;
  let withSpan = 0;
  for (const year of [1975, 1995, 2005, 2015]) {
    const { players } = await enrichedClass(year, 'NFL', { fill: false });
    const ud = players.filter((p) => p.draftRound == null);
    undrafted += ud.length;
    withSpan += ud.filter((p) => p.careerFrom != null && p.careerTo != null).length;
  }
  assert.ok(undrafted > 100, `expected a real undrafted cohort, got ${undrafted}`);
  assert.ok(withSpan > undrafted * 0.6,
    `${withSpan}/${undrafted} recovered a career span; expected well over 60%`);
});

test('a long undrafted career outrates the draft-slot floor', async () => {
  const { players } = await enrichedClass(1985, 'NFL', { fill: false });
  const robinson = players.find((p) => p.firstName === 'Eugene' && p.lastName === 'Robinson');
  assert.ok(robinson, 'Eugene Robinson should be in the 1985 class');
  // 16 seasons, two Pro Bowls -- he was rated ~2 before this backfill.
  assert.ok(RatingService.predictedWav(robinson!) > 30,
    `a 16-season starter should not rate like a camp body (got ${RatingService.predictedWav(robinson!)})`);
});
