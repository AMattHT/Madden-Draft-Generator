import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRANCHISES, LOGO_TO_KEY, NICKNAME_TO_KEY, validateLeagueHistory, type LeagueHistoryFile } from '../LeagueHistoryData';

const ok = (): LeagueHistoryFile => ({
  _source: 't', _built: '2026-09-17',
  seasons: Array.from({ length: 93 }, (_, i) => ({
    season: 1933 + i, game: 1933 + i < 1966 ? 'NFL Championship' : `Super Bowl ${1933 + i - 1965}`,
    champion: { franchise: 'CHI', city: 'Chicago', score: 23 },
    runnerUp: { franchise: 'NYG', city: 'New York', score: 21 },
    ...(1933 + i >= 1966 ? { afcSide: 'runnerUp' as const } : {}),
    awards: [{ type: 'MVP', first: 'A', last: 'B', pos: 'QB', franchise: 'CHI' }],
  })),
});

test('thirty-two franchises with a Madden display name and a conference; logo order matches the Team table', () => {
  assert.equal(Object.keys(FRANCHISES).length, 32);
  assert.equal(FRANCHISES.IND.name, 'Colts'); assert.equal(FRANCHISES.IND.conference, 'AFC');
  assert.equal(FRANCHISES.WAS.name, 'Commanders'); assert.equal(FRANCHISES.WAS.conference, 'NFC');
  assert.equal(LOGO_TO_KEY.length, 32); assert.equal(LOGO_TO_KEY[0], 'CHI'); assert.equal(LOGO_TO_KEY[9], 'IND'); assert.equal(LOGO_TO_KEY[25], 'WAS'); assert.equal(LOGO_TO_KEY[31], 'HOU');
  assert.equal(NICKNAME_TO_KEY.Redskins, 'WAS'); assert.equal(NICKNAME_TO_KEY.Oilers, 'TEN'); assert.equal(NICKNAME_TO_KEY.Spartans, 'DET');
});

test('a well-formed file validates clean', () => {
  assert.deepEqual(validateLeagueHistory(ok()), []);
});

test('the validator names missing seasons, bad keys, bad positions, bad scores and a missing afcSide', () => {
  const f = ok();
  f.seasons.splice(10, 1);                                   // 1943 missing
  f.seasons[0].champion.franchise = 'XXX';
  f.seasons[1].awards[0].pos = 'Quarterback';
  f.seasons[2].champion.score = 3; f.seasons[2].runnerUp.score = 7;
  delete f.seasons[40].afcSide;                              // 1974 (index shifts by one after the splice)
  const problems = validateLeagueHistory(f);
  assert.ok(problems.some((p) => p.includes('1943')), problems.join('\n'));
  assert.ok(problems.some((p) => p.includes('XXX')));
  assert.ok(problems.some((p) => p.includes('Quarterback')));
  assert.ok(problems.some((p) => p.includes('1935') && /score/.test(p)));
  assert.ok(problems.some((p) => p.includes('afcSide')));
});

test('a season with no awards array is reported, not thrown on', () => {
  const f = ok();
  delete (f.seasons[5] as Partial<LeagueHistoryFile['seasons'][number]>).awards;
  assert.doesNotThrow(() => validateLeagueHistory(f));
});
