# Launch Day Ratings lens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third rating lens, "Launch Day", that rates rookies with EA's launch-day overall and attributes from each Madden edition's launch roster, falling back to Realistic where no launch data exists.

**Architecture:** A bake script downloads six launch spreadsheets from maddenratings.net once and writes `rookie-launch-ratings.json`. `LaunchRatingsService` answers name+year+position lookups from it. `DraftClassBuilder` gains `GenMode 'launch'`: Realistic ranking, then launch overall/attributes for matched players. Routes accept `mode=launch`; the client adds the segment, pills and an "EA" tag.

**Tech Stack:** TypeScript, Express, `fflate` (xlsx unzip, dev-only), React.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-01-launch-day-ratings-lens-design.md`.
- No runtime network: the JSON is baked and shipped in `server/data/lookups`.
- Dev traits untouched in launch mode.
- Server tests `cd server && npm test`; type-check both packages before each commit.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Land on master, no release.

---

### Task 1: xlsx reader and row normaliser (pure, tested)

**Files:** Create `server/src/util/xlsx.ts`, `server/src/services/LaunchRatingsService.ts`, `server/src/services/__tests__/LaunchRatings.test.ts`.

**Interfaces:**
- `readFirstSheet(buf: Uint8Array): { headers: string[]; rows: string[][] }` (xlsx → first sheet, shared strings resolved).
- `parseLaunchRows(headers: string[], rows: string[][]): LaunchRookie[]` where `LaunchRookie = { first: string; last: string; pos: string; ovr: number; attrs: Record<string, number> }` — only rows with years pro `0`.
- `LaunchRatingsService.get(first, last, draftYear, posId)`, `.hasYear(y)`, `.years()`; file shape per spec.

- [ ] Test: three header styles (`Full Name|Overall Rating|Speed|Years Pro`, `Name|OverallRating|SpeedRating|YearsPro`, `First Name|Last Name|Overall|Stength|Years Pro`) each yield the same rookie with `attrs.speed`/`attrs.strength`; a `Years Pro 3` row is dropped; `BCVision`→`ballCarrierVision`, `Press`→`pressCoverage`.
- [ ] Test (skip without JSON): `get('C.J.','Stroud',2023, QB)` → ovr 73; `get` on a name shared by two rookies picks by position group; `hasYear(1998)` false.
- [ ] Implement; run; commit "Read launch rosters and answer rookie launch ratings".

### Task 2: bake script

**Files:** Create `server/scripts/build-launch-ratings.ts`; output `server/data/lookups/rookie-launch-ratings.json`.

Editions table: `{ class: 2018, madden: 19, url: '.../madden_nfl_19_-_full_player_ratings_1.xlsx' }`, 2019→20 `madden_nfl_20_-_full_player_ratings.xlsx`, 2020→21 `madden_nfl_21_-_full_player_ratings.xlsx`, 2022→23 `madden_nfl_23_player_ratings.xlsx`, 2023→24 `maddennfl24fullplayerratings.xlsx`, 2026→27 `madden_nfl_27_-_full_player_ratings__official_launch_roster_.xlsx` (all under `https://www.maddenratings.net/uploads/1/4/0/9/14097292/`). Download with a UA string, 1.5 s between files, parse, key `${class}|${normalizeName(first)}|${normalizeName(last)}` → array. Print per-edition rookie counts. Run it; commit the JSON with "Bake EA's launch-day rookie ratings, Madden 19–27".

### Task 3: builder launch mode

**Files:** Modify `server/src/services/DraftClassBuilder.ts` (GenMode, RankedItem.launch, ranking pass, toProspect overlay, preview `wavSource`/`launchCount`), `server/src/routes/draft.ts`, `server/src/routes/export.ts` (mode parsing), test `server/src/services/__tests__/LaunchMode.test.ts`.

- [ ] Test (skipWithoutData + JSON): 2023 launch preview has Stroud overall 73 and `ratings.throwPower` equal to the file's; a row without an entry equals the Realistic row; `launchCount > 250`; 1998 launch preview equals Realistic preview row for row; export builds in launch mode.
- [ ] Implement: `parseMode(raw): GenMode` shared by routes; in `buildProspects` after the madden ranking, when `mode === 'launch'` set `it.overall = hit.ovr; it.launch = hit` for matched items; in `toProspect` after two-way, `if (it.launch) Object.assign(prospect, it.launch.attrs)` then the existing reconcile; preview rows `wavSource: launchSet.has(i) ? 'launch' : …`; `launchCount`.
- [ ] Commit "Rate rookies at EA's launch-day numbers under a Launch Day lens".

### Task 4: client lens

**Files:** `web/src/App.tsx` (GenMode), `web/src/components/TopBar.tsx` (third segment, first), `web/src/components/ClassView.tsx` (pills, mode prop type), `web/src/components/ExportMenu.tsx` (mode type), `web/src/components/PlayerTable.tsx` (`launch` tag), `web/src/types.ts` (`launchCount`).

- [ ] Implement, type-check, run the app: switch lens on 2023 (Stroud 73, EA tag), 1998 (pill "no launch data"), export in launch mode.
- [ ] Commit "Add the Launch Day lens to the top bar".

### Task 5: docs

README "Two ways to rate a class" → three, crediting maddenratings.net; CHANGELOG Unreleased entry. Commit.
