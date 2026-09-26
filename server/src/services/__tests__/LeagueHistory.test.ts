import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planLeagueHistory, NULL_REF } from '../LeagueHistoryService';
import { assertNoHistory } from '../LeagueHistoryService';
import { FRANCHISES, type SeasonHistory } from '../LeagueHistoryData';

const teams = Object.fromEntries(Object.keys(FRANCHISES).map((k, i) => [k, { logo: i, identity: `ID-${k}` }]));
const side = (franchise: string, city: string, score: number) => ({ franchise, city, score });
function season(y: number, champ: [string, string, number], loser: [string, string, number], extra: Partial<SeasonHistory> = {}): SeasonHistory {
  return { season: y, game: y < 1966 ? 'NFL Championship' : 'Super Bowl', champion: side(...champ), runnerUp: side(...loser), awards: [], ...(y >= 1966 ? { afcSide: 'runnerUp' as const } : {}), ...extra };
}
/** 1933..2025: Bears beat Giants every year (Steelers beat Cowboys in 1975, Colts beat Giants in 1958). */
function all(): SeasonHistory[] {
  const out: SeasonHistory[] = [];
  for (let y = 1933; y <= 2025; y++) {
    if (y === 1958) out.push(season(y, ['IND', 'Baltimore', 23], ['NYG', 'New York', 17]));
    else if (y === 1975) out.push(season(y, ['PIT', 'Pittsburgh', 21], ['DAL', 'Dallas', 17], { afcSide: 'champion', awards: [
      { type: 'MVP', first: 'Fran', last: 'Tarkenton', pos: 'QB', franchise: 'MIN' },
      { type: 'COY', first: 'Ted', last: 'Marchibroda', pos: 'HC', franchise: 'IND' },
      { type: 'SBMVP', first: 'Lynn', last: 'Swann', pos: 'WR', franchise: 'PIT' },
    ] }));
    else out.push(season(y, ['CHI', 'Chicago', 23], ['NYG', 'New York', 21]));
  }
  return out;
}

test('a 2026 franchise gets 1996-2025, oldest first, with period indexes -30..-1', () => {
  const p = planLeagueHistory({ seasons: all(), startSeason: 2026, currentSeasonYear: 2026, teams });
  assert.equal(p.summaries.length, 30);
  assert.equal(p.firstSeason, 1996); assert.equal(p.lastSeason, 2025);
  assert.equal(p.summaries[0].season, 1996); assert.equal(p.summaries[0].periodIndex, -30); assert.equal(p.summaries[0].row, 0);
  assert.equal(p.summaries[29].periodIndex, -1); assert.equal(p.summaries[29].row, 29);
  assert.deepEqual(p.warnings, []);
});

test('a franchise that pretends to start in 1975 gets 1945-1974 with indexes relative to the save year', () => {
  const p = planLeagueHistory({ seasons: all(), startSeason: 1975, currentSeasonYear: 2026, teams });
  assert.equal(p.firstSeason, 1945); assert.equal(p.lastSeason, 1974);
  assert.equal(p.summaries[0].periodIndex, 1945 - 2026);
});

test('fewer than thirty prior seasons writes what exists and warns', () => {
  const p = planLeagueHistory({ seasons: all(), startSeason: 1940, currentSeasonYear: 2026, teams });
  assert.equal(p.summaries.length, 7);
  assert.ok(p.warnings.some((w) => /7 seasons/.test(w)));
});

test('1966 on uses the file\'s AFC side; before 1966 the champion takes its modern conference', () => {
  const p = planLeagueHistory({ seasons: all(), startSeason: 1976, currentSeasonYear: 2026, teams });
  const s1975 = p.summaries.find((s) => s.season === 1975)!;
  assert.equal(s1975.afc.city, 'Pittsburgh'); assert.equal(s1975.afc.score, 21); assert.equal(s1975.nfc.city, 'Dallas');
  assert.equal(s1975.afc.logo, teams.PIT.logo); assert.equal(s1975.afc.identity, 'ID-PIT');
  const s1958 = p.summaries.find((s) => s.season === 1958)!;   // Colts (modern AFC) champion, Giants runner-up
  assert.equal(s1958.afc.city, 'Baltimore'); assert.equal(s1958.nfc.city, 'New York');
  const s1957 = p.summaries.find((s) => s.season === 1957)!;   // Bears (NFC) champion -> Giants go to the AFC slot
  assert.equal(s1957.nfc.city, 'Chicago'); assert.equal(s1957.afc.city, 'New York');
});

test('counters run from 1933 even when the window starts later', () => {
  const p = planLeagueHistory({ seasons: all(), startSeason: 2026, currentSeasonYear: 2026, teams });
  const s2025 = p.summaries.find((s) => s.season === 2025)!;
  // Bears titles through 2025: every year 1933-2025 except 1958 and 1975 = 91; appearances the same 91.
  assert.equal(s2025.nfc.titles, 91); assert.equal(s2025.nfc.appearances, 91);
  // Giants: 0 titles, appearances every year except 1975 = 92.
  assert.equal(s2025.afc.titles, 0); assert.equal(s2025.afc.appearances, 92);
});

test('awards become rows and links; missing awards leave null slots', () => {
  const p = planLeagueHistory({ seasons: all(), startSeason: 1976, currentSeasonYear: 2026, teams });
  const s1975 = p.summaries.find((s) => s.season === 1975)!;
  const arr = p.arrays.find((a) => a.row === s1975.arrayRow)!;
  assert.equal(arr.slots.length, 6);
  const coy = p.awards.find((a) => a.row === arr.slots[0])!;
  assert.equal(coy.awardType, 'Coach_of_Year'); assert.equal(coy.pos, 'HC_CFM'); assert.equal(coy.last, 'Marchibroda'); assert.equal(coy.identity, 'ID-IND');
  const mvp = p.awards.find((a) => a.row === arr.slots[1])!;
  assert.equal(mvp.awardType, 'MVP'); assert.equal(mvp.pos, 'QB');
  assert.deepEqual(arr.slots.slice(2), [null, null, null, null]);
  const sb = p.awards.find((a) => a.row === s1975.sbMvpRow)!;
  assert.equal(sb.awardType, 'INVALID'); assert.equal(sb.last, 'Swann');
  const s1974 = p.summaries.find((s) => s.season === 1974)!;
  assert.equal(s1974.sbMvpRow, null);
  // award rows are numbered from 0 without gaps
  assert.deepEqual(p.awards.map((a) => a.row), p.awards.map((_, i) => i));
});

test('an award with no franchise gets the null identity; a side with an unknown franchise throws', () => {
  const seasons = all();
  seasons.find((s) => s.season === 1975)!.awards.push({ type: 'OPOY', first: 'A', last: 'B', pos: 'WR', franchise: '' });
  const p = planLeagueHistory({ seasons, startSeason: 1976, currentSeasonYear: 2026, teams });
  assert.equal(p.awards.find((a) => a.last === 'B')!.identity, NULL_REF);
  seasons.find((s) => s.season === 1974)!.champion.franchise = 'XXX';
  assert.throws(() => planLeagueHistory({ seasons, startSeason: 1976, currentSeasonYear: 2026, teams }), /XXX/);
});

test('capacity.summary of 0 throws before the window is computed', () => {
  assert.throws(
    () => planLeagueHistory({ seasons: all(), startSeason: 2026, currentSeasonYear: 2026, teams, capacity: { summary: 0, awards: 217, arrays: 31 } }),
    /capacity\.summary must be a positive integer/,
  );
});

test('a duplicated season in the source array can push summaries past capacity even though the window looked fine', () => {
  const seasons = all();
  seasons.push({ ...seasons.find((s) => s.season === 1975)! }); // 1975 now appears twice
  const p = planLeagueHistory({ seasons, startSeason: 1976, currentSeasonYear: 2026, teams });
  assert.ok(p.summaries.length <= 30, `${p.summaries.length} summaries`);
  assert.throws(
    () => planLeagueHistory({ seasons, startSeason: 1976, currentSeasonYear: 2026, teams, capacity: { summary: 1, awards: 217, arrays: 31 } }),
    /season summaries exceed the table's 1/,
  );
});

test('a save that already has history is refused', () => {
  assert.doesNotThrow(() => assertNoHistory({ records: [{ isEmpty: true }, { isEmpty: true }] }));
  assert.throws(() => assertNoHistory({ records: [{ isEmpty: true }, { isEmpty: false }] }), /already has league history/);
});
