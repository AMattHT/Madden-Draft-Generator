# League History Seeding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write the real seasons that precede a Madden 27 franchise (champions, title-game scores, seven awards a season, 1933 to 2025) into the save's history tables so the hub's League History and awards screens show them.

**Architecture:** A bake script produces `server/data/lookups/league-history.json` from MyFranchise's 1966 to 2025 dump plus Wikipedia for 1933 to 1965. A pure planner (`LeagueHistoryService.planLeagueHistory`) turns that file, a start season and the save's team table into row data; a thin applier writes the rows with madden-franchise (opened with `autoUnempty`) into a `CAREER-*-HISTORY` copy. An experiment preset runs the applier for the in-game gates; routes and a Franchise-tab tool follow only after Gate 2 passes.

**Tech Stack:** TypeScript, Node `node --test`, madden-franchise 4.3.6, tsx scripts, React 18 (web).

**Spec:** `docs/superpowers/specs/2026-09-17-league-history-seeding-design.md`

## Global Constraints

- Branch: `ui-lift`. Stage explicit file lists; never `git add -A`. Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Tests: from `server/`, `node --import tsx --test src/services/__tests__/<File>.test.ts`; all: `npm test`.
- Madden 27 saves only (`gameVersion === 'm27'`); Madden 26 is refused.
- Table unique ids: `YearSummary` 2592669074 (30 rows), `LeagueHistoryAward[]` 2466957052 (31 rows, fields `LeagueHistoryAward0..5`), `LeagueHistoryAward` 2655641637 (217 rows). `Team` is `TEAM_TABLE_UID`, `SeasonInfo` is `SEASONINFO_TABLE_UID` (both exported by `FranchiseService`).
- `PeriodIndex = season - SeasonInfo.CurrentSeasonYear`. Seasons written: the last 30 strictly before the start season, oldest first.
- Award type enum names: `Coach_of_Year`, `MVP`, `Offensive_Player_of_Year`, `Defensive_Player_of_Year`, `Offensive_Rookie_of_Year`, `Defensive_Rookie_of_Year`; the title-game MVP row is `INVALID`. Annual-award array order: COY, MVP, OPOY, DPOY, OROY, DROY. Coach position enum name: `HC_CFM`. Unknown position: `Invalid_`.
- Team identity for a side or an award is the raw `TeamIdentity` reference string read from that club's `Team` record; logo is its `TEAM_LOGO`. Null reference is `'0'.repeat(32)`.
- Before 1966 the champion takes the slot of its franchise's modern conference and the runner-up the other; 1966 on, the baked file says which side is AFC (`afcSide`). Running counters count from 1933 regardless of the window.
- The applier refuses a save whose `YearSummary` has any non-empty row and never overwrites the input.
- MyFranchise source files live outside the repo at `C:/Users/amatthews/Downloads/MyFranchise-2.0.2-extracted/static/` and are never committed. Wikipedia goes through the parse API only (never pro-football-reference).
- The AFL's 1960 to 1965 champions are not included.
- UI tasks (7 and 8) wait for the user's Gate 2 result recorded in the spec's Gate log.

## Data file shape (the contract every task uses)

```ts
// server/src/services/LeagueHistoryData.ts
export type AwardKindH = 'COY' | 'MVP' | 'OPOY' | 'DPOY' | 'OROY' | 'DROY' | 'SBMVP';
export interface HistorySide { franchise: string; city: string; score: number }
export interface HistoryAward { type: AwardKindH; first: string; last: string; pos: string; franchise: string }
export interface SeasonHistory {
  season: number;            // 1933..2025
  game: string;              // "NFL Championship" or "Super Bowl X"
  champion: HistorySide;
  runnerUp: HistorySide;
  /** 1966 on: which of the two was on the AFC (or AFL) side. Absent before 1966. */
  afcSide?: 'champion' | 'runnerUp';
  awards: HistoryAward[];
}
export interface LeagueHistoryFile { _source: string; _built: string; seasons: SeasonHistory[] }
```

Franchise keys are the season packs' modern keys: `ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GNB HOU IND JAX KAN LAC LAR LVR MIA MIN NWE NOR NYG NYJ PHI PIT SEA SFO TAM TEN WAS`.

---

### Task 1: Franchise tables and the data validator

**Files:**
- Create: `server/src/services/LeagueHistoryData.ts`
- Test: `server/src/services/__tests__/LeagueHistoryData.test.ts`

**Interfaces:**
- Produces: the types above; `FRANCHISES: Record<string, { name: string; conference: 'AFC' | 'NFC' }>` (key -> Madden `DisplayName` + modern conference); `NICKNAME_TO_KEY: Record<string, string>` (era nicknames, e.g. `Redskins -> WAS`, `Oilers -> TEN`, `Spartans -> DET`); `LOGO_TO_KEY: string[]` (Madden team index -> key); `POSITION_ENUM: Set<string>`; `validateLeagueHistory(file: LeagueHistoryFile): string[]` (problems, empty when valid); `loadLeagueHistory(): LeagueHistoryFile` (reads `LOOKUPS_DIR/league-history.json`).

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run it to see it fail**

Run (from `server/`): `node --import tsx --test src/services/__tests__/LeagueHistoryData.test.ts`
Expected: FAIL, cannot find module `../LeagueHistoryData`.

- [ ] **Step 3: Write the module**

```ts
import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../config/paths';

export type AwardKindH = 'COY' | 'MVP' | 'OPOY' | 'DPOY' | 'OROY' | 'DROY' | 'SBMVP';
export const AWARD_KINDS: AwardKindH[] = ['COY', 'MVP', 'OPOY', 'DPOY', 'OROY', 'DROY', 'SBMVP'];
export interface HistorySide { franchise: string; city: string; score: number }
export interface HistoryAward { type: AwardKindH; first: string; last: string; pos: string; franchise: string }
export interface SeasonHistory {
  season: number;
  game: string;
  champion: HistorySide;
  runnerUp: HistorySide;
  afcSide?: 'champion' | 'runnerUp';
  awards: HistoryAward[];
}
export interface LeagueHistoryFile { _source: string; _built: string; seasons: SeasonHistory[] }

export const FIRST_SEASON = 1933;
export const LAST_SEASON = 2025;
export const FIRST_SUPER_BOWL_SEASON = 1966;

/** Modern franchise key -> the Madden Team.DisplayName and today's conference. */
export const FRANCHISES: Record<string, { name: string; conference: 'AFC' | 'NFC' }> = {
  ARI: { name: 'Cardinals', conference: 'NFC' }, ATL: { name: 'Falcons', conference: 'NFC' }, BAL: { name: 'Ravens', conference: 'AFC' },
  BUF: { name: 'Bills', conference: 'AFC' }, CAR: { name: 'Panthers', conference: 'NFC' }, CHI: { name: 'Bears', conference: 'NFC' },
  CIN: { name: 'Bengals', conference: 'AFC' }, CLE: { name: 'Browns', conference: 'AFC' }, DAL: { name: 'Cowboys', conference: 'NFC' },
  DEN: { name: 'Broncos', conference: 'AFC' }, DET: { name: 'Lions', conference: 'NFC' }, GNB: { name: 'Packers', conference: 'NFC' },
  HOU: { name: 'Texans', conference: 'AFC' }, IND: { name: 'Colts', conference: 'AFC' }, JAX: { name: 'Jaguars', conference: 'AFC' },
  KAN: { name: 'Chiefs', conference: 'AFC' }, LAC: { name: 'Chargers', conference: 'AFC' }, LAR: { name: 'Rams', conference: 'NFC' },
  LVR: { name: 'Raiders', conference: 'AFC' }, MIA: { name: 'Dolphins', conference: 'AFC' }, MIN: { name: 'Vikings', conference: 'NFC' },
  NWE: { name: 'Patriots', conference: 'AFC' }, NOR: { name: 'Saints', conference: 'NFC' }, NYG: { name: 'Giants', conference: 'NFC' },
  NYJ: { name: 'Jets', conference: 'AFC' }, PHI: { name: 'Eagles', conference: 'NFC' }, PIT: { name: 'Steelers', conference: 'AFC' },
  SEA: { name: 'Seahawks', conference: 'NFC' }, SFO: { name: '49ers', conference: 'NFC' }, TAM: { name: 'Buccaneers', conference: 'NFC' },
  TEN: { name: 'Titans', conference: 'AFC' }, WAS: { name: 'Commanders', conference: 'NFC' },
};

/** Madden team index (= TEAM_LOGO id) -> key. Dumped from a Madden 27 CAREER save's Team table on 2026-09-17. */
export const LOGO_TO_KEY: string[] = [
  'CHI', 'CIN', 'BUF', 'DEN', 'CLE', 'TAM', 'ARI', 'LAC', 'KAN', 'IND', 'DAL', 'MIA', 'PHI', 'ATL', 'SFO', 'NYG',
  'JAX', 'NYJ', 'DET', 'GNB', 'CAR', 'NWE', 'LVR', 'LAR', 'BAL', 'WAS', 'NOR', 'SEA', 'PIT', 'TEN', 'MIN', 'HOU',
];

/** Every nickname a title-game side or an award winner's team has carried since 1933 -> key. */
export const NICKNAME_TO_KEY: Record<string, string> = {
  ...Object.fromEntries(Object.entries(FRANCHISES).map(([k, v]) => [v.name, k])),
  Redskins: 'WAS', Spartans: 'DET', Oilers: 'TEN', Niners: 'SFO',
};

/** PositionE enum names the LeagueHistoryAward table accepts (plus HC, which the writer maps to HC_CFM). */
export const POSITION_ENUM = new Set(['QB', 'HB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'LE', 'RE', 'DT', 'LOLB', 'MLB', 'ROLB', 'CB', 'FS', 'SS', 'K', 'P', 'LS', 'HC', 'Invalid_']);

export function validateLeagueHistory(file: LeagueHistoryFile): string[] {
  const problems: string[] = [];
  const seen = new Map<number, number>();
  for (const s of file.seasons ?? []) seen.set(s.season, (seen.get(s.season) ?? 0) + 1);
  for (let y = FIRST_SEASON; y <= LAST_SEASON; y++) {
    const n = seen.get(y) ?? 0;
    if (n !== 1) problems.push(`season ${y}: expected once, found ${n}`);
  }
  for (const s of file.seasons ?? []) {
    for (const side of [s.champion, s.runnerUp]) {
      if (!FRANCHISES[side.franchise]) problems.push(`season ${s.season}: unknown franchise ${side.franchise}`);
      if (!side.city) problems.push(`season ${s.season}: ${side.franchise} has no city`);
      if (!Number.isInteger(side.score) || side.score < 0) problems.push(`season ${s.season}: bad score ${side.score}`);
    }
    if (s.champion.score <= s.runnerUp.score) problems.push(`season ${s.season}: champion score ${s.champion.score} not above runner-up ${s.runnerUp.score}`);
    if (s.season >= FIRST_SUPER_BOWL_SEASON && s.afcSide !== 'champion' && s.afcSide !== 'runnerUp') problems.push(`season ${s.season}: afcSide missing`);
    for (const a of s.awards ?? []) {
      if (!AWARD_KINDS.includes(a.type)) problems.push(`season ${s.season}: bad award type ${a.type}`);
      if (!POSITION_ENUM.has(a.pos)) problems.push(`season ${s.season} ${a.type}: bad position ${a.pos}`);
      if (a.franchise && !FRANCHISES[a.franchise]) problems.push(`season ${s.season} ${a.type}: unknown franchise ${a.franchise}`);
      if (!a.last) problems.push(`season ${s.season} ${a.type}: no last name`);
    }
    if (s.awards.filter((a) => a.type === 'SBMVP').length > 1) problems.push(`season ${s.season}: more than one SBMVP`);
  }
  return problems;
}

let cached: LeagueHistoryFile | null = null;
export function loadLeagueHistory(): LeagueHistoryFile {
  if (cached) return cached;
  cached = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'league-history.json'), 'utf8')) as LeagueHistoryFile;
  return cached;
}
```

- [ ] **Step 4: Run the test**

Run (from `server/`): `node --import tsx --test src/services/__tests__/LeagueHistoryData.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/LeagueHistoryData.ts server/src/services/__tests__/LeagueHistoryData.test.ts
git commit -m "League history: data contract, franchise tables and the file validator

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Award parser keeps the team column; shared Wikipedia fetch

**Files:**
- Modify: `server/src/services/AwardsService.ts:15-22` (`AwardRow`) and `:89-140` (`parseAwardTables`)
- Create: `server/scripts/lib/wikipedia.ts`
- Modify: `server/scripts/build-nfl-awards.ts:22-35` (use the shared fetch)
- Test: `server/src/services/__tests__/Awards.test.ts` (append)

**Interfaces:**
- Produces: `AwardRow.team?: string` (the Team column's text, footnote markers stripped); `wikiPageHtml(page: string): Promise<string>` (parse API, cached 24h under `CACHE_DIR/wiki_<page>.html`).

- [ ] **Step 1: Append the failing parser test**

```ts
test('the winners table keeps the team column', () => {
  const html = `<table class="wikitable"><tr><th>Season</th><th>Player</th><th>Position</th><th>Team</th><th>Ref.</th></tr>
<tr><td>1963</td><th scope="row"><span class="fn"><a href="/wiki/Y._A._Tittle">Y. A. Tittle</a></span></th><td><a href="/wiki/Quarterback" title="Quarterback">QB</a></td><td><a href="/wiki/1963_New_York_Giants_season">New York Giants</a>*</td><td>[1]</td></tr>
</table>`;
  const [rows] = parseAwardTables(html);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].last, 'Tittle');
  assert.equal(rows[0].team, 'New York Giants');
});
```

(Add `parseAwardTables` to the test file's import from `../AwardsService` if it is not already there.)

- [ ] **Step 2: Run to see it fail**

Run (from `server/`): `node --import tsx --test src/services/__tests__/Awards.test.ts`
Expected: the new test FAILS (`undefined !== 'New York Giants'`).

- [ ] **Step 3: Keep the team column**

In `AwardsService.ts`, add to `AwardRow`:

```ts
  /** The Team column's text ("Baltimore Colts"), footnote marks removed; absent when the table has none. */
  team?: string;
```

In `parseAwardTables`, after the line `if (posCell) lastPos = pos;` and before `if (first && last) list.push(...)`, add:

```ts
      const anchor = posCell ?? playerCell;
      const teamCell = cells.find((c, i) => i > cells.indexOf(anchor) && /<a /.test(c.html) && /[A-Za-z]/.test(c.text) && !/^\[/.test(c.text));
      const team = teamCell ? teamCell.text.replace(/[*^†‡~]|\[\d+\]/g, '').trim() : undefined;
```

and change the push to `list.push({ season, first, last, pos, ...(team ? { team } : {}) })`.

- [ ] **Step 4: Shared fetch helper**

`server/scripts/lib/wikipedia.ts`:

```ts
import fs from 'fs';
import path from 'path';
import { CACHE_DIR } from '../../src/config/paths';

const UA = 'MaddenDraftClassGenerator/1.1 (personal modding tool)';

/** A Wikipedia page's rendered HTML through the parse API, cached for a day. */
export async function wikiPageHtml(page: string): Promise<string> {
  const cached = path.join(CACHE_DIR, `wiki_${page}.html`);
  if (fs.existsSync(cached) && Date.now() - fs.statSync(cached).mtimeMs < 24 * 3600e3) return fs.readFileSync(cached, 'utf8');
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${page}&prop=text&format=json&formatversion=2&redirects=1`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`wikipedia ${page}: HTTP ${res.status}`);
  const json = (await res.json()) as { parse?: { text?: string }; error?: { info?: string } };
  if (json.error || !json.parse?.text) throw new Error(`wikipedia ${page}: ${json.error?.info ?? 'no text'}`);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cached, json.parse.text);
  return json.parse.text;
}
```

In `build-nfl-awards.ts`, delete the local `UA` constant and `pageHtml` function, add `import { wikiPageHtml } from './lib/wikipedia';`, and replace the call `parseAwardTables(await pageHtml(page))` with `parseAwardTables(await wikiPageHtml(page))`. (The old cache file name was `wiki_award_<page>.html`; the new one is `wiki_<page>.html`, so the first run refetches once.)

- [ ] **Step 5: Run tests and typecheck**

Run (from `server/`): `node --import tsx --test src/services/__tests__/Awards.test.ts` -> all passing. `npm run typecheck` -> no output.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/AwardsService.ts server/src/services/__tests__/Awards.test.ts server/scripts/lib/wikipedia.ts server/scripts/build-nfl-awards.ts
git commit -m "Awards parser keeps the team column; Wikipedia fetch shared between bake scripts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The bake script and the committed data file

**Files:**
- Create: `server/scripts/build-league-history.ts`
- Create: `server/data/lookups/league-history.json` (script output)
- Test: `server/src/services/__tests__/LeagueHistoryData.test.ts` (append one test over the real file)

**Interfaces:**
- Consumes: `wikiPageHtml`, `parseAwardTables` (with `team`), `validateLeagueHistory`, `LOGO_TO_KEY`, `NICKNAME_TO_KEY`, `FRANCHISES`.
- Produces: `league-history.json` matching the contract.

Wikipedia table shapes (checked 2026-09-17): `NFL_Championship_Game` has a wikitable headed `Season | League | Winning team | Score | Losing team | Venue | Attendance` with 33 rows 1933 to 1965 (winning team carries a "(n)" title count, score uses an en dash). `Associated_Press_NFL_Coach_of_the_Year_Award` has a wikitable headed `Season | Coach | Team | Record | Ref.` from 1957 (coach names carry `~`/`†` marks, team names a `*`).

- [ ] **Step 1: Write the script**

```ts
/**
 * Bake data/lookups/league-history.json: every NFL title game and the season awards,
 * 1933 to 2025, in the shape LeagueHistoryService writes into a Madden 27 franchise.
 *
 *   npx tsx scripts/build-league-history.ts <MyFranchise static dir>
 *
 *   <MyFranchise static dir> = .../MyFranchise-2.0.2-extracted/static (not committed): its
 *   historical/LeaguePastHistory.json + LeaguePastAwards.json cover 1966-2025 with all seven
 *   awards; team/TeamIdentity.json resolves their team references.
 *   1933-1965 come from Wikipedia (NFL Championship Game results, AP Coach of the Year) and
 *   the AP award pages the awards bake already reads (MVP/OROY 1957 on, with the team column).
 */
import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../src/config/paths';
import { parseAwardTables } from '../src/services/AwardsService';
import { wikiPageHtml } from './lib/wikipedia';
import {
  FIRST_SUPER_BOWL_SEASON, FRANCHISES, LOGO_TO_KEY, NICKNAME_TO_KEY, validateLeagueHistory,
  type AwardKindH, type HistoryAward, type LeagueHistoryFile, type SeasonHistory,
} from '../src/services/LeagueHistoryData';

const staticDir = process.argv[2];
if (!staticDir || !fs.existsSync(path.join(staticDir, 'historical', 'LeaguePastHistory.json'))) {
  console.error('usage: build-league-history.ts <MyFranchise static dir>');
  process.exit(1);
}
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#160;|&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const clean = (s: string) => s.replace(/\[\d+\]|[*^†‡~]/g, '').trim();

/** "Chicago Bears (3)" -> { key: 'CHI', city: 'Chicago' }; the nickname is the last word. */
function sideOf(teamText: string): { key: string; city: string } {
  const name = clean(teamText).replace(/\s*\(\d+\)\s*$/, '');
  const parts = name.split(' ');
  const nick = parts[parts.length - 1];
  const key = NICKNAME_TO_KEY[nick];
  if (!key) throw new Error(`unknown team "${name}"`);
  return { key, city: parts.slice(0, -1).join(' ') };
}

/** Wikipedia position text -> PositionE enum name. */
function posEnum(raw: string): string {
  const p = raw.toLowerCase();
  if (/quarterback/.test(p)) return 'QB';
  if (/fullback/.test(p)) return 'FB';
  if (/halfback|running back|tailback/.test(p)) return 'HB';
  if (/wide receiver|split end|flanker|\bend\b/.test(p) && !/tight|defensive/.test(p)) return 'WR';
  if (/tight end/.test(p)) return 'TE';
  if (/offensive tackle|\btackle\b/.test(p) && !/defensive/.test(p)) return 'LT';
  if (/guard/.test(p)) return 'LG';
  if (/center/.test(p)) return 'C';
  if (/defensive end/.test(p)) return 'LE';
  if (/defensive tackle|nose/.test(p)) return 'DT';
  if (/linebacker/.test(p)) return 'MLB';
  if (/cornerback|defensive back/.test(p)) return 'CB';
  if (/safety/.test(p)) return 'FS';
  if (/kicker/.test(p)) return 'K';
  if (/punter/.test(p)) return 'P';
  if (/coach/.test(p)) return 'HC';
  return 'Invalid_';
}

function splitName(full: string): { first: string; last: string } {
  const parts = clean(full).split(' ').filter(Boolean);
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') };
}

// ---------------------------------------------------------------- 1966-2025 from MyFranchise
function superBowlEra(): SeasonHistory[] {
  const rows = readJson(path.join(staticDir, 'historical', 'LeaguePastHistory.json')) as any[];
  const awardRows = readJson(path.join(staticDir, 'historical', 'LeaguePastAwards.json')) as any[];
  const identities = readJson(path.join(staticDir, 'team', 'TeamIdentity.json')) as any[];
  const awardByBinary = new Map(awardRows.map((a) => [a.Binary, a]));
  const keyByIdentity = new Map<string, string>();
  for (const t of identities) { const k = NICKNAME_TO_KEY[t.DisplayName]; if (k) keyByIdentity.set(t.Binary, k); }
  const ref = (bin: string, type: AwardKindH): HistoryAward | null => {
    const a = awardByBinary.get(bin);
    if (!a || /^n\/a/i.test(String(a.firstName)) || /^n\/a/i.test(String(a.lastName))) return null;
    const pos = a.Position === 'HC_CFM' ? 'HC' : String(a.Position || 'Invalid_');
    return { type, first: String(a.firstName).trim(), last: String(a.lastName).trim(), pos, franchise: keyByIdentity.get(a.teamIdentity) ?? '' };
  };
  const out: SeasonHistory[] = [];
  for (const r of rows) {
    const season = 2026 + Number(r.PeriodIndex); // the dump is from a 2026 save: -60 -> 1966
    const afc = { franchise: LOGO_TO_KEY[Number(r.AFC_TeamLogo)], city: String(r.AFC_CityName), score: Number(r.AFC_SB_Score) };
    const nfc = { franchise: LOGO_TO_KEY[Number(r.NFC_TeamLogo)], city: String(r.NFC_CityName), score: Number(r.NFC_SB_Score) };
    const afcWon = afc.score > nfc.score;
    const awards = [
      ref(r.CoachOfTheYear, 'COY'), ref(r.NFL_MVP, 'MVP'), ref(r.OffensivePOTY, 'OPOY'), ref(r.DefensivePOTY, 'DPOY'),
      ref(r.OffensiveROTY, 'OROY'), ref(r.DefensiveROTY, 'DROY'), ref(r.SB_MVP, 'SBMVP'),
    ].filter((a): a is HistoryAward => !!a);
    out.push({ season, game: `Super Bowl ${roman(season - 1965)}`, champion: afcWon ? afc : nfc, runnerUp: afcWon ? nfc : afc, afcSide: afcWon ? 'champion' : 'runnerUp', awards });
  }
  return out;
}
function roman(n: number): string {
  const t: [number, string][] = [[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = ''; for (const [v, r] of t) while (n >= v) { s += r; n -= v; } return s;
}

// ---------------------------------------------------------------- 1933-1965 from Wikipedia
function tablesWithHeader(html: string, ...heads: string[]): string[][][] {
  const out: string[][][] = [];
  for (const table of html.match(/<table[^>]*wikitable[\s\S]*?<\/table>/g) ?? []) {
    const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
    const header = [...(rows[0] ?? '').matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => text(m[1]));
    if (!heads.every((h, i) => new RegExp(`^${h}$`, 'i').test(header[i] ?? ''))) continue;
    out.push(rows.slice(1).map((r) => [...r.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => text(m[1]))));
  }
  return out;
}

async function championshipEra(): Promise<SeasonHistory[]> {
  const html = await wikiPageHtml('NFL_Championship_Game');
  const [table] = tablesWithHeader(html, 'Season', 'League', 'Winning team', 'Score', 'Losing team');
  if (!table) throw new Error('NFL_Championship_Game: results table not found');
  const out: SeasonHistory[] = [];
  for (const cells of table) {
    const season = Number(/(19\d\d)/.exec(cells[0] ?? '')?.[1]);
    if (!season || season < 1933 || season > 1965) continue;
    const [w, l] = (cells[3] ?? '').split(/[–-]/).map((n) => Number(n.trim()));
    if (!Number.isInteger(w) || !Number.isInteger(l)) throw new Error(`${season}: bad score "${cells[3]}"`);
    const win = sideOf(cells[2]), lose = sideOf(cells[4]);
    out.push({ season, game: 'NFL Championship', champion: { ...win, franchise: win.key, score: w }, runnerUp: { ...lose, franchise: lose.key, score: l }, awards: [] } as SeasonHistory);
  }
  if (out.length !== 33) throw new Error(`NFL_Championship_Game: expected 33 seasons 1933-1965, parsed ${out.length}`);
  for (const s of out) { delete (s.champion as any).key; delete (s.runnerUp as any).key; }
  return out;
}

async function earlyAwards(): Promise<Map<number, HistoryAward[]>> {
  const byYear = new Map<number, HistoryAward[]>();
  const add = (season: number, a: HistoryAward) => { if (!byYear.has(season)) byYear.set(season, []); byYear.get(season)!.push(a); };
  const coy = tablesWithHeader(await wikiPageHtml('Associated_Press_NFL_Coach_of_the_Year_Award'), 'Season', 'Coach', 'Team')[0];
  if (!coy) throw new Error('Coach of the Year table not found');
  for (const cells of coy) {
    const season = Number(/(19\d\d)/.exec(cells[0] ?? '')?.[1]);
    if (!season || season >= FIRST_SUPER_BOWL_SEASON) continue;
    const { first, last } = splitName(cells[1]);
    add(season, { type: 'COY', first, last, pos: 'HC', franchise: sideOf(cells[2]).key });
  }
  const pages: Array<{ page: string; kinds: AwardKindH[] }> = [
    { page: 'Associated_Press_NFL_Most_Valuable_Player_Award', kinds: ['MVP'] },
    { page: 'Associated_Press_NFL_Rookie_of_the_Year_Award', kinds: ['OROY', 'DROY'] },
  ];
  for (const { page, kinds } of pages) {
    const tables = parseAwardTables(await wikiPageHtml(page));
    kinds.forEach((type, i) => {
      for (const r of tables[i] ?? []) {
        if (r.season >= FIRST_SUPER_BOWL_SEASON) continue;
        add(r.season, { type, first: r.first, last: r.last, pos: posEnum(r.pos), franchise: r.team ? sideOf(r.team).key : '' });
      }
    });
    await new Promise((res) => setTimeout(res, 800));
  }
  return byYear;
}

(async () => {
  const early = await championshipEra();
  const awards = await earlyAwards();
  for (const s of early) s.awards = awards.get(s.season) ?? [];
  const seasons = [...early, ...superBowlEra()].sort((a, b) => a.season - b.season);
  const file: LeagueHistoryFile = {
    _source: 'MyFranchise 2.0.2 static/historical (1966-2025) + Wikipedia NFL_Championship_Game, AP Coach of the Year, AP MVP and Rookie of the Year pages (1933-1965) via scripts/build-league-history.ts',
    _built: new Date().toISOString().slice(0, 10),
    seasons,
  };
  const problems = validateLeagueHistory(file);
  if (problems.length) { console.error(problems.join('\n')); throw new Error(`${problems.length} validation problems`); }
  const out = path.join(LOOKUPS_DIR, 'league-history.json');
  fs.writeFileSync(out, JSON.stringify(file, null, 0));
  const nAwards = seasons.reduce((n, s) => n + s.awards.length, 0);
  console.log(`${seasons.length} seasons ${seasons[0].season}-${seasons[seasons.length - 1].season}, ${nAwards} awards -> ${out}`);
  for (const y of [1933, 1958, 1966, 1975, 2025]) { const s = seasons.find((x) => x.season === y)!; console.log(`  ${y} ${s.game}: ${s.champion.city} ${s.champion.score}-${s.runnerUp.score} ${s.runnerUp.city}; ${s.awards.map((a) => `${a.type} ${a.last}`).join(', ')}`); }
})().catch((e) => { console.error('ERR', e && (e.stack || e.message)); process.exit(1); });
```

- [ ] **Step 2: Run it**

Run (from `server/`):
```bash
npx tsx scripts/build-league-history.ts "C:/Users/amatthews/Downloads/MyFranchise-2.0.2-extracted/static"
```
Expected: `93 seasons 1933-2025, <about 480> awards -> ...league-history.json`, then the five sample lines. Check them against memory: 1933 Chicago 23-21 New York; 1958 Baltimore 23-17 New York with COY Ewbank and MVP Brown; 1966 Green Bay 35-10 Kansas City with SBMVP Starr and COY Landry; 1975 Pittsburgh 21-17 Dallas; 2025 Seattle 29-13 New England with SBMVP Walker. If the validator throws, read the listed problems, fix the map or the parser, rerun. If the "unknown team" error names a nickname, add it to `NICKNAME_TO_KEY` in `LeagueHistoryData.ts`.

- [ ] **Step 3: Append the real-file test**

```ts
import { loadLeagueHistory } from '../LeagueHistoryData';

test('the committed league-history.json validates and has the fixed points', () => {
  const f = loadLeagueHistory();
  assert.deepEqual(validateLeagueHistory(f), []);
  const by = (y: number) => f.seasons.find((s) => s.season === y)!;
  assert.equal(by(1933).champion.franchise, 'CHI');
  assert.equal(by(1958).champion.franchise, 'IND'); assert.equal(by(1958).champion.city, 'Baltimore');
  assert.equal(by(1966).afcSide, 'runnerUp'); assert.equal(by(1966).awards.find((a) => a.type === 'SBMVP')?.last, 'Starr');
  assert.equal(by(1975).champion.franchise, 'PIT'); assert.equal(by(1975).runnerUp.score, 17);
  assert.equal(by(2025).champion.franchise, 'SEA');
});
```

Run (from `server/`): `node --import tsx --test src/services/__tests__/LeagueHistoryData.test.ts` -> 4 passing.

- [ ] **Step 4: Commit**

```bash
git add server/scripts/build-league-history.ts server/data/lookups/league-history.json server/src/services/__tests__/LeagueHistoryData.test.ts
git commit -m "League history: bake 1933-2025 title games and awards into a lookup

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The planner

**Files:**
- Create: `server/src/services/LeagueHistoryService.ts` (planner only in this task)
- Test: `server/src/services/__tests__/LeagueHistory.test.ts`

**Interfaces:**
- Produces:

```ts
export interface TeamRef { logo: number; identity: string }          // from the save's Team table
export interface PlanInput { seasons: SeasonHistory[]; startSeason: number; currentSeasonYear: number; teams: Record<string, TeamRef>; capacity?: { summary: number; awards: number; arrays: number } }
export interface SideRow { city: string; score: number; logo: number; identity: string; titles: number; appearances: number }
export interface SummaryRow { row: number; season: number; periodIndex: number; afc: SideRow; nfc: SideRow; sbMvpRow: number | null; arrayRow: number }
export interface ArrayRow { row: number; slots: (number | null)[] }   // 6 slots: COY MVP OPOY DPOY OROY DROY
export interface AwardRow { row: number; first: string; last: string; pos: string; awardType: string; identity: string }
export interface HistoryPlan { summaries: SummaryRow[]; arrays: ArrayRow[]; awards: AwardRow[]; firstSeason: number | null; lastSeason: number | null; warnings: string[] }
export function planLeagueHistory(input: PlanInput): HistoryPlan
export const NULL_REF: string
```

- [ ] **Step 1: Write the failing tests**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planLeagueHistory, NULL_REF } from '../LeagueHistoryService';
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
```

- [ ] **Step 2: Run to see them fail**

Run (from `server/`): `node --import tsx --test src/services/__tests__/LeagueHistory.test.ts`
Expected: FAIL, cannot find module `../LeagueHistoryService`.

- [ ] **Step 3: Write the planner**

`server/src/services/LeagueHistoryService.ts`:

```ts
import { FIRST_SUPER_BOWL_SEASON, FRANCHISES, type HistoryAward, type SeasonHistory } from './LeagueHistoryData';

/**
 * League history seeding for Madden 27 franchises: the real seasons before the one the
 * franchise pretends to start in, written into YearSummary / LeagueHistoryAward[] /
 * LeagueHistoryAward. Spec: docs/superpowers/specs/2026-09-17-league-history-seeding-design.md
 */

export const NULL_REF = '0'.repeat(32);
export const YEARSUMMARY_TABLE_UID = 2592669074;
export const HISTORYARRAY_TABLE_UID = 2466957052;
export const HISTORYAWARD_TABLE_UID = 2655641637;
const CAPACITY = { summary: 30, awards: 217, arrays: 31 };

export interface TeamRef { logo: number; identity: string }
export interface PlanInput { seasons: SeasonHistory[]; startSeason: number; currentSeasonYear: number; teams: Record<string, TeamRef>; capacity?: typeof CAPACITY }
export interface SideRow { city: string; score: number; logo: number; identity: string; titles: number; appearances: number }
export interface SummaryRow { row: number; season: number; periodIndex: number; afc: SideRow; nfc: SideRow; sbMvpRow: number | null; arrayRow: number }
export interface ArrayRow { row: number; slots: (number | null)[] }
export interface AwardRow { row: number; first: string; last: string; pos: string; awardType: string; identity: string }
export interface HistoryPlan { summaries: SummaryRow[]; arrays: ArrayRow[]; awards: AwardRow[]; firstSeason: number | null; lastSeason: number | null; warnings: string[] }

const ANNUAL_ORDER: HistoryAward['type'][] = ['COY', 'MVP', 'OPOY', 'DPOY', 'OROY', 'DROY'];
const AWARD_ENUM: Record<HistoryAward['type'], string> = {
  COY: 'Coach_of_Year', MVP: 'MVP', OPOY: 'Offensive_Player_of_Year', DPOY: 'Defensive_Player_of_Year',
  OROY: 'Offensive_Rookie_of_Year', DROY: 'Defensive_Rookie_of_Year', SBMVP: 'INVALID',
};
const posEnum = (p: string) => (p === 'HC' ? 'HC_CFM' : p || 'Invalid_');

export function planLeagueHistory({ seasons, startSeason, currentSeasonYear, teams, capacity = CAPACITY }: PlanInput): HistoryPlan {
  const all = [...seasons].sort((a, b) => a.season - b.season);
  const warnings: string[] = [];
  // Counters from the first baked season, whatever window is written.
  const titles = new Map<string, number>(), appearances = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  const teamOf = (key: string, season: number): TeamRef => {
    const t = teams[key];
    if (!t) throw new Error(`season ${season}: no team in this save for franchise ${key}`);
    return t;
  };

  const window = all.filter((s) => s.season < startSeason).slice(-capacity.summary);
  if (window.length < capacity.summary) warnings.push(`only ${window.length} seasons before ${startSeason} are available`);
  const wanted = new Set(window.map((s) => s.season));

  const summaries: SummaryRow[] = [], arrays: ArrayRow[] = [], awards: AwardRow[] = [];
  let seasonRow = 0;
  for (const s of all) {
    bump(titles, s.champion.franchise); bump(appearances, s.champion.franchise); bump(appearances, s.runnerUp.franchise);
    if (!wanted.has(s.season)) continue;
    const champIsAfc = s.season >= FIRST_SUPER_BOWL_SEASON ? s.afcSide === 'champion' : FRANCHISES[s.champion.franchise]?.conference === 'AFC';
    const sideRow = (side: SeasonHistory['champion']): SideRow => {
      const t = teamOf(side.franchise, s.season);
      return { city: side.city, score: side.score, logo: t.logo, identity: t.identity, titles: titles.get(side.franchise) ?? 0, appearances: appearances.get(side.franchise) ?? 0 };
    };
    const afc = sideRow(champIsAfc ? s.champion : s.runnerUp);
    const nfc = sideRow(champIsAfc ? s.runnerUp : s.champion);
    const addAward = (a: HistoryAward): number => {
      const row = awards.length;
      awards.push({ row, first: a.first, last: a.last, pos: posEnum(a.pos), awardType: AWARD_ENUM[a.type], identity: a.franchise && teams[a.franchise] ? teams[a.franchise].identity : NULL_REF });
      return row;
    };
    const slots = ANNUAL_ORDER.map((type) => { const a = s.awards.find((x) => x.type === type); return a ? addAward(a) : null; });
    const sb = s.awards.find((x) => x.type === 'SBMVP');
    const sbMvpRow = sb ? addAward(sb) : null;
    arrays.push({ row: seasonRow, slots });
    summaries.push({ row: seasonRow, season: s.season, periodIndex: s.season - currentSeasonYear, afc, nfc, sbMvpRow, arrayRow: seasonRow });
    seasonRow++;
  }
  if (awards.length > capacity.awards) throw new Error(`${awards.length} award rows exceed the table's ${capacity.awards}`);
  if (arrays.length > capacity.arrays) throw new Error(`${arrays.length} award arrays exceed the table's ${capacity.arrays}`);
  return { summaries, arrays, awards, firstSeason: summaries[0]?.season ?? null, lastSeason: summaries[summaries.length - 1]?.season ?? null, warnings };
}
```

- [ ] **Step 4: Run the tests**

Run (from `server/`): `node --import tsx --test src/services/__tests__/LeagueHistory.test.ts` -> 7 passing. `npm run typecheck` -> no output.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/LeagueHistoryService.ts server/src/services/__tests__/LeagueHistory.test.ts
git commit -m "League history: pure planner from the baked seasons to save rows

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The applier

**Files:**
- Modify: `server/src/services/FranchiseService.ts:107-116` (`openSave` gains an options argument)
- Modify: `server/src/services/LeagueHistoryService.ts` (append)
- Test: `server/src/services/__tests__/LeagueHistory.test.ts` (append)

**Interfaces:**
- `openSave(inputPath, gameVersion, opts: { autoUnempty?: boolean } = {})`: passes `autoUnempty` through to `madden.create` so a write to an empty record makes it live and fixes the empty-record chain (the library only does that for first-4-byte fields otherwise).
- Produces in `LeagueHistoryService`:

```ts
export function assertNoHistory(yearSummary: { records: Array<{ isEmpty: boolean }> }): void   // throws when any row is live
export async function readSaveContext(file: any): Promise<{ currentSeasonYear: number; teams: Record<string, TeamRef> }>
export async function applyPlan(file: any, plan: HistoryPlan): Promise<void>
export interface SeedOptions { startSeason?: number; maxSeasons?: number; outputName?: string }
export interface SeedResult { input: string; output: string; outputPath: string; currentSeasonYear: number; startSeason: number; seasonsWritten: number; firstSeason: number | null; lastSeason: number | null; warnings: string[] }
export const LeagueHistoryService = { preview(fileName, opts, gameVersion), seed(fileName, opts, gameVersion) }
```

- [ ] **Step 1: Append the failing refusal test**

```ts
import { assertNoHistory } from '../LeagueHistoryService';

test('a save that already has history is refused', () => {
  assert.doesNotThrow(() => assertNoHistory({ records: [{ isEmpty: true }, { isEmpty: true }] }));
  assert.throws(() => assertNoHistory({ records: [{ isEmpty: true }, { isEmpty: false }] }), /already has league history/);
});
```

Run (from `server/`): `node --import tsx --test src/services/__tests__/LeagueHistory.test.ts` -> the new test FAILS (`assertNoHistory is not a function`).

- [ ] **Step 2: `openSave` option**

In `FranchiseService.ts` replace the `openSave` signature and the `madden.create` line:

```ts
export async function openSave(inputPath: string, gameVersion: GameVersion, opts: { autoUnempty?: boolean } = {}): Promise<any> {
  const expected = gameVersion === 'm27' ? 27 : 26;
  const file = await madden.create(inputPath, { autoParse: true, ...(opts.autoUnempty ? { autoUnempty: true } : {}) });
```

(the rest of the function is unchanged).

- [ ] **Step 3: Append the applier**

Add these imports at the top of `LeagueHistoryService.ts`:

```ts
import fs from 'fs';
import path from 'path';
import { openSave, savesDir, writeField, outputNameFor, TEAM_TABLE_UID, SEASONINFO_TABLE_UID, type GameVersion } from './FranchiseService';
import { loadLeagueHistory } from './LeagueHistoryData';
```

and append:

```ts
export function assertNoHistory(yearSummary: { records: Array<{ isEmpty: boolean }> }): void {
  const live = yearSummary.records.filter((r) => !r.isEmpty).length;
  if (live > 0) throw new Error(`this franchise already has league history (${live} seasons); seeding only fills an empty history`);
}

const val = (r: any, k: string) => { try { return r[k]; } catch { return undefined; } };

/** The save's current season year and, per franchise key, the club's logo id and raw TeamIdentity reference. */
export async function readSaveContext(file: any): Promise<{ currentSeasonYear: number; teams: Record<string, TeamRef> }> {
  const si = file.getTableByUniqueId(SEASONINFO_TABLE_UID); await si.readRecords();
  const currentSeasonYear = Number(val(si.records[0], 'CurrentSeasonYear'));
  if (!Number.isInteger(currentSeasonYear)) throw new Error('SeasonInfo.CurrentSeasonYear unreadable');
  const tt = file.getTableByUniqueId(TEAM_TABLE_UID); await tt.readRecords();
  const byName = new Map<string, any>();
  for (const r of tt.records) { if (r.isEmpty) continue; const idx = Number(val(r, 'TeamIndex')); if (idx >= 0 && idx < 32) byName.set(String(val(r, 'DisplayName')), r); }
  const teams: Record<string, TeamRef> = {};
  for (const [key, f] of Object.entries(FRANCHISES)) {
    const r = byName.get(f.name);
    if (!r) continue; // a relocated/renamed club: the planner throws only if a written season needs it
    teams[key] = { logo: Number(val(r, 'TEAM_LOGO')), identity: String(val(r, 'TeamIdentity') ?? NULL_REF) };
  }
  return { currentSeasonYear, teams };
}

/** Write the plan. The file must have been opened with autoUnempty so empty rows go live on write. */
export async function applyPlan(file: any, plan: HistoryPlan): Promise<void> {
  const ys = file.getTableByUniqueId(YEARSUMMARY_TABLE_UID), arr = file.getTableByUniqueId(HISTORYARRAY_TABLE_UID), aw = file.getTableByUniqueId(HISTORYAWARD_TABLE_UID);
  for (const t of [ys, arr, aw]) { if (!t) throw new Error('league history tables not found in this save'); await t.readRecords(); }
  assertNoHistory(ys);
  const awardRef = (row: number | null) => (row == null ? NULL_REF : aw.getBinaryReferenceToRecord(row));
  for (const a of plan.awards) {
    const r = aw.records[a.row];
    writeField(r, 'firstName', a.first, true);
    writeField(r, 'lastName', a.last, true);
    writeField(r, 'Position', a.pos, true);
    writeField(r, 'AwardType', a.awardType, true);
    r.teamIdentity = a.identity;
  }
  for (const x of plan.arrays) {
    const r = arr.records[x.row];
    x.slots.forEach((slot, i) => { r[`LeagueHistoryAward${i}`] = awardRef(slot); });
  }
  for (const s of plan.summaries) {
    const r = ys.records[s.row];
    writeField(r, 'PeriodIndex', s.periodIndex, true);
    writeField(r, 'SB_Index', 0, true);
    for (const [side, d] of [['AFC', s.afc], ['NFC', s.nfc]] as const) {
      writeField(r, `${side}_CityName`, d.city, true);
      writeField(r, `${side}_SB_Score`, d.score, true);
      writeField(r, `${side}_TeamLogo`, d.logo, true);
      writeField(r, `${side}_SB_Wins`, d.titles, true);
      writeField(r, `${side}_ConfChamp_Wins`, d.appearances, true);
      r[`${side}_Team_Identity`] = d.identity;
      r[`${side}_SB_USER`] = NULL_REF;
    }
    r.SB_MVP = awardRef(s.sbMvpRow);
    r.AnnualAwards = arr.getBinaryReferenceToRecord(s.arrayRow);
  }
}

export interface SeedOptions { startSeason?: number; maxSeasons?: number; outputName?: string }
export interface SeedResult { input: string; output: string; outputPath: string; currentSeasonYear: number; startSeason: number; seasonsWritten: number; firstSeason: number | null; lastSeason: number | null; warnings: string[] }
export interface SeedPreview { input: string; currentSeasonYear: number; startSeason: number; alreadyHasHistory: boolean; seasons: Array<{ season: number; game: string; champion: string; score: string; runnerUp: string; mvp: string | null }>; warnings: string[] }

function planFor(opts: SeedOptions, ctx: { currentSeasonYear: number; teams: Record<string, TeamRef> }): { plan: HistoryPlan; startSeason: number } {
  const startSeason = opts.startSeason ?? ctx.currentSeasonYear;
  const cap = opts.maxSeasons ? { summary: Math.min(30, opts.maxSeasons), awards: 217, arrays: 31 } : undefined;
  const plan = planLeagueHistory({ seasons: loadLeagueHistory().seasons, startSeason, currentSeasonYear: ctx.currentSeasonYear, teams: ctx.teams, capacity: cap });
  return { plan, startSeason };
}

export const LeagueHistoryService = {
  /** Planner only: what seeding would write, plus whether the save already has history. */
  async preview(fileName: string, opts: SeedOptions = {}, gameVersion: GameVersion = 'm27'): Promise<SeedPreview> {
    if (gameVersion !== 'm27') throw new Error('league history seeding targets Madden 27 saves');
    const inputPath = path.join(savesDir(gameVersion), fileName);
    if (!fs.existsSync(inputPath)) throw new Error(`franchise not found: ${fileName}`);
    const file = await openSave(inputPath, gameVersion);
    const ctx = await readSaveContext(file);
    const ys = file.getTableByUniqueId(YEARSUMMARY_TABLE_UID); await ys.readRecords();
    const { plan, startSeason } = planFor(opts, ctx);
    const bySeason = new Map(loadLeagueHistory().seasons.map((s) => [s.season, s]));
    return {
      input: fileName, currentSeasonYear: ctx.currentSeasonYear, startSeason,
      alreadyHasHistory: ys.records.some((r: any) => !r.isEmpty),
      seasons: plan.summaries.map((s) => { const h = bySeason.get(s.season)!; const mvp = h.awards.find((a) => a.type === 'MVP'); return { season: s.season, game: h.game, champion: `${h.champion.city} ${FRANCHISES[h.champion.franchise].name}`, score: `${h.champion.score}-${h.runnerUp.score}`, runnerUp: `${h.runnerUp.city} ${FRANCHISES[h.runnerUp.franchise].name}`, mvp: mvp ? `${mvp.first} ${mvp.last}` : null }; }),
      warnings: plan.warnings,
    };
  },

  /** Write the seasons into a CAREER-*-HISTORY copy. */
  async seed(fileName: string, opts: SeedOptions = {}, gameVersion: GameVersion = 'm27'): Promise<SeedResult> {
    if (gameVersion !== 'm27') throw new Error('league history seeding targets Madden 27 saves');
    const dir = savesDir(gameVersion);
    const inputPath = path.join(dir, fileName);
    if (!fs.existsSync(inputPath)) throw new Error(`franchise not found: ${fileName}`);
    const output = outputNameFor(fileName, 'HISTORY', opts.outputName);
    const outputPath = path.join(dir, output);
    if (path.resolve(outputPath) === path.resolve(inputPath)) throw new Error('refusing to overwrite the input file');
    const file = await openSave(inputPath, gameVersion, { autoUnempty: true });
    const ctx = await readSaveContext(file);
    const { plan, startSeason } = planFor(opts, ctx);
    if (!plan.summaries.length) throw new Error(`no seasons before ${startSeason} to write`);
    await applyPlan(file, plan);
    await file.save(outputPath, {});
    return { input: fileName, output, outputPath, currentSeasonYear: ctx.currentSeasonYear, startSeason, seasonsWritten: plan.summaries.length, firstSeason: plan.firstSeason, lastSeason: plan.lastSeason, warnings: plan.warnings };
  },
};
```

- [ ] **Step 4: Run tests and typecheck**

Run (from `server/`): `node --import tsx --test src/services/__tests__/LeagueHistory.test.ts` -> 8 passing. `npm test` -> all passing. `npm run typecheck` -> no output.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/FranchiseService.ts server/src/services/LeagueHistoryService.ts server/src/services/__tests__/LeagueHistory.test.ts
git commit -m "League history: applier writes the plan into a CAREER-*-HISTORY copy

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Experiment preset and the in-game gates

**Files:**
- Modify: `server/scripts/franchise-experiment.ts:1-30` (usage comment), `:82-96` (`load`), `:531-548` (main dispatch and suffix table)
- Modify: `docs/superpowers/specs/2026-09-17-league-history-seeding-design.md` (Gate log, filled in by the user's results)
- Delete: `server/scripts/probes/probe-history.ts`, `probe-history2.ts`, `probe-history3.ts`, `probe-teams.ts` (research scratch; untracked)

**Interfaces:**
- Consumes: `readSaveContext`, `planFor` logic through `planLeagueHistory`, `applyPlan`, `loadLeagueHistory`.
- Produces: `npx tsx scripts/franchise-experiment.ts history [--start <year>] [--seasons <n>] [--save CAREER-...]` writing `CAREER-<base>-EXP-HISTORY`.

- [ ] **Step 1: Usage line**

In the header comment of `franchise-experiment.ts`, after the `noop` usage line add:

```
 *   npx tsx scripts/franchise-experiment.ts history        [--start 2026] [--seasons 30]   (league history rows)
```

and in the "What each preset probes" block:

```
 *   history        Writes the real seasons before --start (default: the save's season year)
 *                  into YearSummary / LeagueHistoryAward[] / LeagueHistoryAward. --seasons
 *                  caps the count (Gate 1 uses 2). Opened with autoUnempty so the empty rows
 *                  go live. Check the hub's League History and awards screens.
```

- [ ] **Step 2: `load` takes the open option**

Replace the `load` signature and its first line:

```ts
async function load(saveName: string, open: { autoUnempty?: boolean } = {}): Promise<Ctx> {
  const file = await openSave(path.join(M27_SAVES_DIR, saveName), 'm27', open);
```

- [ ] **Step 3: The preset**

Add the import at the top of the script:

```ts
import { applyPlan, planLeagueHistory, readSaveContext } from '../src/services/LeagueHistoryService';
import { loadLeagueHistory } from '../src/services/LeagueHistoryData';
```

Add the preset function before the `// ---- main` marker:

```ts
// ---------------------------------------------------------------- history
async function historyPreset(ctx: Ctx): Promise<void> {
  const sctx = await readSaveContext(ctx.file);
  const startSeason = parseInt(opt('start', String(sctx.currentSeasonYear)), 10);
  const n = parseInt(opt('seasons', '30'), 10);
  const plan = planLeagueHistory({ seasons: loadLeagueHistory().seasons, startSeason, currentSeasonYear: sctx.currentSeasonYear, teams: sctx.teams, capacity: { summary: Math.min(30, n), awards: 217, arrays: 31 } });
  for (const s of plan.summaries) ctx.changes.push(`row ${s.row} season ${s.season} (PeriodIndex ${s.periodIndex}): AFC ${s.afc.city} ${s.afc.score} - NFC ${s.nfc.city} ${s.nfc.score}; sbMvp=${s.sbMvpRow ?? '-'}`);
  ctx.changes.push(`${plan.awards.length} award rows, ${plan.arrays.length} arrays${plan.warnings.length ? '; ' + plan.warnings.join('; ') : ''}`);
  if (dryRun) return;
  await applyPlan(ctx.file, plan);
}
```

In `main`: change `const ctx = await load(saveName);` to `const ctx = await load(saveName, { autoUnempty: preset === 'history' });`, add `history: 'EXP-HISTORY'` to the `suffix` table, and add `case 'history': await historyPreset(ctx); break;` to the switch.

- [ ] **Step 4: Dry run, then Gate 1 file**

Run (from `server/`):
```bash
npx tsx scripts/franchise-experiment.ts history --seasons 2 --save CAREER-SEP06-05h30m23p-AUTOSAVE --dry-run
```
Expected: two `row` lines, `row 0 season 2024 (PeriodIndex -2): AFC Kansas City 22 - NFC Philadelphia 40` and `row 1 season 2025 (PeriodIndex -1): AFC New England 13 - NFC Seattle 29`, then `14 award rows, 2 arrays`.

Then without `--dry-run`. Expected: `wrote ...CAREER-SEP06-05h30m23p-EXP-HISTORY`.

Re-open the output and confirm the rows are live:
```bash
node --import tsx -e "import('./src/services/FranchiseService').then(async m=>{const f=await m.openSave('C:/Users/amatthews/Documents/Madden NFL 27/Saves/CAREER-SEP06-05h30m23p-EXP-HISTORY','m27');for(const u of [2592669074,2466957052,2655641637]){const t=f.getTableByUniqueId(u);await t.readRecords();console.log(t.header.name,t.records.filter(r=>!r.isEmpty).length,'live; nextRecordToUse',t.header.nextRecordToUse)}const ys=f.getTableByUniqueId(2592669074);console.log(ys.records[1].PeriodIndex,ys.records[1].AFC_CityName,ys.records[1].NFC_CityName,ys.records[1].NFC_SB_Score)})"
```
Expected: `YearSummary 2 live; nextRecordToUse 2`, `LeagueHistoryAward[] 2 live; ...`, `LeagueHistoryAward 14 live; ...`, then `-1 New England Seattle 29`.

- [ ] **Step 5: Remove the research probes and commit**

```bash
rm server/scripts/probes/probe-history.ts server/scripts/probes/probe-history2.ts server/scripts/probes/probe-history3.ts server/scripts/probes/probe-teams.ts
git add server/scripts/franchise-experiment.ts
git commit -m "Franchise experiment: history preset writes league-history rows for the in-game gates

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 6: Hand Gate 1 to the user (STOP here until answered)**

Tell the user exactly this, then stop the plan:

> Load `CAREER-SEP06-05h30m23p-EXP-HISTORY` in Madden 27 and open the franchise hub's League History (and the awards / Super Bowl history screens). Gate 1 passes if the 2024 and 2025 seasons show with those years, Eagles over Chiefs 40-22 and Seahawks over Patriots 29-13, MVPs Allen and Stafford, and the awards list the winners. Also tell me whether the game shows its own built-in history for 1966-2025 alongside, and whether the save loads and advances a week without hanging.

Record the answer under **Gate log** in the spec (date, file, what showed, what did not) and commit the spec. If Gate 1 fails because the game ignores the table, stop: the spec records why and Tasks 7 and 8 are not done.

- [ ] **Step 7: Gates 2 and 3 (after Gate 1 passes)**

Gate 2: `npx tsx scripts/franchise-experiment.ts history --save CAREER-SEP06-05h30m23p-AUTOSAVE` (30 seasons, 1996-2025). User checks all 30 render in order and the save advances. Gate 3: `npx tsx scripts/franchise-experiment.ts history --start 1975 --save CAREER-SEP06-05h30m23p-EXP-1975` (1945-1974). User checks the pre-1966 rows read sensibly. Record both under **Gate log** and commit the spec.

---

### Task 7: Routes and the API client (after Gate 2 passes)

**Files:**
- Modify: `server/src/routes/franchise.ts:1-32` (imports and two new routes next to the historic ones)
- Modify: `web/src/api.ts:351-365` (types) and `:666-700` (two client functions)

**Interfaces:**
- `POST /api/franchise/league-history/preview` `{ fileName, startSeason?, gameVersion }` -> `SeedPreview`
- `POST /api/franchise/league-history/apply` `{ fileName, startSeason?, gameVersion }` -> `SeedResult`
- Web: `api.franchiseLeagueHistoryPreview(fileName, startSeason?)`, `api.franchiseLeagueHistoryApply(fileName, startSeason?)`.

- [ ] **Step 1: Routes**

In `franchise.ts` add the import `import { LeagueHistoryService } from '../services/LeagueHistoryService';` and, after the `historic/preview` route:

```ts
/** What seeding league history would write (planner only; reads the save's season year and teams). */
router.post('/franchise/league-history/preview', async (req: Request, res: Response) => {
  const { fileName, startSeason } = (req.body ?? {}) as { fileName?: string; startSeason?: number };
  if (!fileName) return res.status(400).json({ error: 'fileName required' });
  try { res.json(await LeagueHistoryService.preview(fileName, { startSeason: startSeason ? Number(startSeason) : undefined }, versionOf(req.body))); }
  catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

/** Write the real seasons before the start year into a CAREER-*-HISTORY copy. */
router.post('/franchise/league-history/apply', async (req: Request, res: Response) => {
  const { fileName, startSeason } = (req.body ?? {}) as { fileName?: string; startSeason?: number };
  if (!fileName) return res.status(400).json({ error: 'fileName required' });
  try { res.json(await LeagueHistoryService.seed(fileName, { startSeason: startSeason ? Number(startSeason) : undefined }, versionOf(req.body))); }
  catch (e) { res.status(500).json({ error: (e as Error).message }); }
});
```

- [ ] **Step 2: Client types and functions**

In `web/src/api.ts` next to `HistoricPreview` add:

```ts
export interface LeagueHistoryPreview {
  input: string; currentSeasonYear: number; startSeason: number; alreadyHasHistory: boolean;
  seasons: Array<{ season: number; game: string; champion: string; score: string; runnerUp: string; mvp: string | null }>;
  warnings: string[];
}
export interface LeagueHistoryResult { input: string; output: string; outputPath: string; currentSeasonYear: number; startSeason: number; seasonsWritten: number; firstSeason: number | null; lastSeason: number | null; warnings: string[] }
```

In the `api` object after `franchiseArmPlayoffs` add:

```ts
  /** What league-history seeding would write into a save. */
  async franchiseLeagueHistoryPreview(fileName: string, startSeason?: number): Promise<LeagueHistoryPreview> {
    const res = await fetch('/api/franchise/league-history/preview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, startSeason, gameVersion: franchiseGameVersion }),
    });
    if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.error || `HTTP ${res.status}`); }
    return res.json();
  },

  /** Write league history into a CAREER-*-HISTORY copy. */
  async franchiseLeagueHistoryApply(fileName: string, startSeason?: number): Promise<LeagueHistoryResult> {
    const res = await fetch('/api/franchise/league-history/apply', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, startSeason, gameVersion: franchiseGameVersion }),
    });
    if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.error || `HTTP ${res.status}`); }
    return res.json();
  },
```

- [ ] **Step 3: Verify with the running server**

Start the `server` preview. Run:
```bash
curl -s -X POST http://localhost:5174/api/franchise/league-history/preview -H "Content-Type: application/json" -d "{\"fileName\":\"CAREER-SEP06-05h30m23p-AUTOSAVE\",\"gameVersion\":\"m27\",\"startSeason\":1975}"
```
Expected: JSON with `startSeason: 1975`, `alreadyHasHistory: false`, 30 seasons 1945 to 1974, the 1958 entry `"champion":"Baltimore Colts","score":"23-17"`.

- [ ] **Step 4: Typecheck and commit**

`npm run typecheck` in `server/` and `web/` -> no output.

```bash
git add server/src/routes/franchise.ts web/src/api.ts
git commit -m "League history: preview and apply routes with their client calls

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The League history tool (after Gate 2 passes)

**Files:**
- Create: `web/src/components/franchise/LeagueHistoryTool.tsx`
- Modify: `web/src/components/franchise/FranchiseView.tsx:16-30` (tab list and `OUTPUT_SUFFIX`), `:162` (mount)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: The component**

```tsx
import { useEffect, useState } from 'react';
import { api, type LeagueHistoryPreview, type LeagueHistoryResult } from '../../api';
import { ToolHeader, ErrorCard, SuccessCard, Field, cardCls, btnGhost, btnPrimary, inputCls } from './shared';

/**
 * League history (Madden 27): write the real seasons before the year the franchise pretends
 * to start in - champions, title-game scores and the season awards - so the hub's League
 * History and awards screens have a past. Seeds only a save whose history is still empty.
 */
export function LeagueHistoryTool({ save, gameVersion, onWrote }: { save: string; gameVersion: 'm26' | 'm27'; onWrote?: () => void }) {
  const [startSeason, setStartSeason] = useState<number | ''>('');
  const [preview, setPreview] = useState<LeagueHistoryPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [writeBusy, setWriteBusy] = useState(false);
  const [written, setWritten] = useState<LeagueHistoryResult | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);

  async function run(year?: number) {
    if (!save) return;
    setBusy(true); setError(null); setWritten(null);
    try {
      const p = await api.franchiseLeagueHistoryPreview(save, year);
      setPreview(p);
      if (startSeason === '') setStartSeason(p.startSeason);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function write() {
    if (!save || !preview) return;
    setWriteBusy(true); setWriteError(null);
    try { setWritten(await api.franchiseLeagueHistoryApply(save, startSeason === '' ? undefined : startSeason)); onWrote?.(); }
    catch (e) { setWriteError((e as Error).message); }
    finally { setWriteBusy(false); }
  }

  useEffect(() => { setPreview(null); setStartSeason(''); setWritten(null); if (save && gameVersion === 'm27') run(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save, gameVersion]);

  return (
    <>
      <ToolHeader title="League history">
        Give the franchise a past: the real title games and season awards from before the year it starts in are written
        into the save, so League History, Super Bowl history and the awards screens are not blank. Up to thirty seasons,
        back to the first NFL Championship Game in 1933. Only a save with no history yet can be seeded.
      </ToolHeader>

      {gameVersion !== 'm27' && (
        <div className="rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold">League history targets Madden 27 saves. Switch the game in the top bar.</div>
      )}

      <div className={cardCls}>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Franchise starts in" hint={preview ? `the save's own season is ${preview.currentSeasonYear}` : undefined}>
            <input type="number" min={1934} max={2026} value={startSeason} onChange={(e) => setStartSeason(e.target.value === '' ? '' : Number(e.target.value))} className={`${inputCls} w-28`} />
          </Field>
          <button className={btnGhost} disabled={!save || busy || gameVersion !== 'm27'} onClick={() => run(startSeason === '' ? undefined : startSeason)}>{busy ? 'Reading…' : 'Preview'}</button>
          <button className={btnPrimary} disabled={!preview || preview.alreadyHasHistory || preview.seasons.length === 0 || writeBusy} onClick={write}>{writeBusy ? 'Writing…' : 'Write history'}</button>
        </div>
        {error && <div className="mt-3"><ErrorCard message={error} /></div>}
        {preview?.alreadyHasHistory && <div className="mt-3 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold">This franchise already has league history; seeding only fills an empty one.</div>}
        {preview?.warnings.map((w) => <div key={w} className="mt-2 text-xs text-muted">{w}</div>)}
      </div>

      {preview && preview.seasons.length > 0 && (
        <div className={cardCls}>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{preview.seasons.length} seasons, {preview.seasons[0].season}–{preview.seasons[preview.seasons.length - 1].season}</div>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted"><th className="py-1 pr-3">Season</th><th className="py-1 pr-3">Game</th><th className="py-1 pr-3">Champion</th><th className="py-1 pr-3">Score</th><th className="py-1 pr-3">Runner-up</th><th className="py-1">MVP</th></tr></thead>
            <tbody>
              {preview.seasons.map((s) => (
                <tr key={s.season} className="border-t border-white/[0.05]"><td className="py-1 pr-3 tabular-nums">{s.season}</td><td className="py-1 pr-3 text-muted">{s.game}</td><td className="py-1 pr-3">{s.champion}</td><td className="py-1 pr-3 tabular-nums">{s.score}</td><td className="py-1 pr-3">{s.runnerUp}</td><td className="py-1">{s.mvp ?? '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {writeError && <ErrorCard message={writeError} />}
      {written && (
        <SuccessCard>
          Wrote {written.seasonsWritten} seasons ({written.firstSeason}–{written.lastSeason}) to <span className="font-mono">{written.output}</span>. Load it in Madden 27 and open League History.
        </SuccessCard>
      )}
    </>
  );
}
```

- [ ] **Step 2: Mount it**

In `FranchiseView.tsx`:
- `type Tab` gains `| 'history'`; `TABS` gains `{ id: 'history', label: 'League history' }` after the historic entry.
- `OUTPUT_SUFFIX` gains `|HISTORY` inside the group: `...|HISTORIC\d*|PLAYOFFS|HISTORY)$/i`.
- Import: `import { LeagueHistoryTool } from './LeagueHistoryTool';`
- After the `{tab === 'historic' && ...}` line add: `{tab === 'history' && <LeagueHistoryTool save={selected} gameVersion={props.gameVersion} onWrote={refresh} />}`

- [ ] **Step 3: Verify in the preview**

`npm run typecheck` in `web/` -> no output. Start `server` and `web` previews; switch the top bar to Madden 27; open Franchise tools, the League history tab, select `CAREER-SEP06-05h30m23p-AUTOSAVE`. `read_page`: the table lists 1996 to 2025 with 2025 as `Seattle Seahawks 29-13 New England Patriots`. Set the start year to 1975, Preview: 1945 to 1974, 1958 `Baltimore Colts 23-17 New York Giants`. Do not press Write history in the preview unless the user asks; the gates already cover the write. Screenshot the table for the user.

- [ ] **Step 4: Changelog**

Under `## Unreleased` / `### Features` in `CHANGELOG.md` add:

```markdown
- League history (Madden 27 franchise tools): write the real seasons before the year your franchise starts in, champions, title-game scores and the season awards back to 1933, so League History and the awards screens have a past.
```

- [ ] **Step 5: Commit**

```bash
git add web/src/components/franchise/LeagueHistoryTool.tsx web/src/components/franchise/FranchiseView.tsx CHANGELOG.md
git commit -m "Franchise tools: League history tab seeds a save's past seasons

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
