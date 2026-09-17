# League history seeding (Madden 27 franchise)

**Date:** 2026-09-17
**Status:** approved (UI gated on in-game checks, see Gates)
**Branch:** ui-lift

## Goal

Write the real seasons that precede a Madden 27 franchise into its save, so the hub's League
History, Super Bowl history and awards screens show champions, scores and award winners. A
franchise that pretends to start in 1975 gets 1945-1974; a normal 2026 franchise gets
1996-2025. Coverage runs from 1933 (the first NFL Championship Game) to 2025.

## What the save holds (verified 2026-09-17 on a fresh M27 CAREER save)

| Table (unique id) | Rows | Fields |
|---|---|---|
| `YearSummary` (2592669074) | 30, all empty | `PeriodIndex` (s_int), `AFC_CityName`/`NFC_CityName` (string), `AFC_SB_Score`/`NFC_SB_Score`, `AFC_TeamLogo`/`NFC_TeamLogo` (int), `AFC_SB_Wins`/`NFC_SB_Wins`, `AFC_ConfChamp_Wins`/`NFC_ConfChamp_Wins`, `SB_Index`, refs `SB_MVP` -> LeagueHistoryAward, `AnnualAwards` -> LeagueHistoryAward[], `AFC_Team_Identity`/`NFC_Team_Identity` -> TeamIdentity, `AFC_SB_USER`/`NFC_SB_USER` -> UserEntity |
| `LeagueHistoryAward[]` (2466957052) | 31, all empty | `LeagueHistoryAward0..5` refs |
| `LeagueHistoryAward` (2655641637) | 217, all empty | `firstName`, `lastName`, `Position` (PositionE enum), `AwardType` (AwardType enum), `teamIdentity` -> TeamIdentity |

- `PeriodIndex` = season - `SeasonInfo.CurrentSeasonYear` (MyFranchise's dump of a 2026 save
  runs -60 to -1 for 1966 to 2025).
- Award rows need no Player record: names are strings, position is an enum.
- `AwardType` values used: `Coach_of_Year=4`, `MVP=5`, `Offensive_Player_of_Year=6`,
  `Defensive_Player_of_Year=7`, `Offensive_Rookie_of_Year=8`, `Defensive_Rookie_of_Year=9`;
  the title-game MVP row uses `INVALID=63` (as MyFranchise's dump shows).
- `Position` for coaches is `HC_CFM=35`.
- Logo ids follow Madden's team index order (Chicago 0, Cincinnati 1, Buffalo 2, ...); the
  save's `Team` table carries `TEAM_LOGO` and a `TeamIdentity` ref per club, so both come from
  the save being edited, never from a static table.
- Running counters (`*_SB_Wins`, `*_ConfChamp_Wins`) are all-time totals through that season.
- `SB_Index` is 0 on every dumped row; user refs stay null.

## Data

### `server/data/lookups/league-history.json`

```json
{
  "_source": "...", "_built": "YYYY-MM-DD",
  "seasons": [
    {
      "season": 1975, "game": "Super Bowl X",
      "champion":  { "franchise": "PIT", "city": "Pittsburgh", "score": 21 },
      "runnerUp":  { "franchise": "DAL", "city": "Dallas",     "score": 17 },
      "awards": [
        { "type": "MVP",  "first": "Fran", "last": "Tarkenton",   "pos": "QB", "franchise": "MIN" },
        { "type": "COY",  "first": "Ted",  "last": "Marchibroda", "pos": "HC", "franchise": "IND" },
        { "type": "SBMVP", "...": "..." }, { "type": "OPOY", "...": "..." }, { "type": "DPOY", "...": "..." },
        { "type": "OROY", "...": "..." }, { "type": "DROY", "...": "..." }
      ]
    }
  ]
}
```

- `franchise` is the modern franchise key used by the season packs (`franchise` field in
  `server/data/seasons/1975.json`, e.g. Baltimore Colts -> `IND`).
- `city` is the era-correct city text ("Baltimore" for the 1970 Colts).
- `pos` is a PositionE enum name (`QB`, `HB`, `WR`, `LE`, ...), `HC` for coaches (written as
  `HC_CFM`), or `Invalid_` when unknown.
- Award types: `COY`, `MVP`, `OPOY`, `DPOY`, `OROY`, `DROY`, `SBMVP`. Missing awards are
  simply absent (no DPOY before 1971, no SBMVP before 1966, none at all before 1938).

### Bake script `server/scripts/build-league-history.ts`

1. **1966-2025**: read MyFranchise 2.0.2's `static/historical/LeaguePastHistory.json` and
   `LeaguePastAwards.json` (path given on the command line, not committed). Cities, scores
   and the seven award names, positions and teams come from there; team identity binaries
   map to franchise keys via `static/team/TeamIdentity.json`.
2. **1933-1965**: Wikipedia through the same parse-API helper `build-nfl-awards.ts` uses,
   cached under `CACHE_DIR`: the *NFL Championship Game* results (champion, runner-up, score,
   cities) and the *AP NFL Coach of the Year* list (1957 on). MVP and rookie of the year
   1957-1965 come from `nfl-awards.json`; awards need the winner's team, so the bake extends
   the awards parser to keep the team column.
3. Validate before writing (see Testing). The AFL's 1960-1965 champions are not included.

## Planner (pure) - `server/src/services/LeagueHistoryService.ts`

```ts
planLeagueHistory(input: {
  seasons: SeasonHistory[];          // baked file
  startSeason: number;               // the year the franchise pretends to start in
  currentSeasonYear: number;         // SeasonInfo.CurrentSeasonYear of the save
  teams: Record<string, { logo: number; identityRow: number; modernConference: 'AFC' | 'NFC' }>;
  capacity: { summary: 30; awards: 217; arrays: 31 };
}): HistoryPlan
```

Rules:

- Seasons written: the last `capacity.summary` seasons strictly before `startSeason`,
  oldest first. `PeriodIndex = season - currentSeasonYear`.
- **Slots.** 1966 on: champion and runner-up sit on their real conference sides. Before
  1966: the champion takes the slot of its franchise's modern conference, the runner-up the
  other slot (Browns and Colts land on the AFC side, everyone else on the NFC side).
- **Counters.** `*_SB_Wins` = that franchise's titles (NFL championships and Super Bowls
  alike) through that season; `*_ConfChamp_Wins` = title-game appearances through that
  season. Both count from 1933 regardless of the written window.
- **Awards.** One `LeagueHistoryAward` row per award present, one array row per season with
  the six annual awards in the fixed order COY, MVP, OPOY, DPOY, OROY, DROY (empty ref when
  absent); `SB_MVP` links the SBMVP row (`AwardType=INVALID`), null when absent.
- A season whose franchise key is not in `teams` is an error (the bake validator makes this
  impossible for real data).
- The plan is plain data: arrays of summary rows, array rows and award rows with the row
  indexes already assigned, so tests never touch a save.

## Applier - same file

`seedLeagueHistory(fileName, { startSeason }, gameVersion = 'm27')`:

1. Open the save (`openSave`), refuse `m26`.
2. Refuse when `YearSummary` has any non-empty row ("this franchise already has history").
3. Build `teams` from the `Team` table: modern franchise key from `TEAM_DBASSETNAME`,
   `TEAM_LOGO`, and the `TeamIdentity` reference row.
4. Run the planner; write award rows, array rows, then summary rows, using
   `getBinaryReferenceToRecord` for every ref and `writeField` for every scalar.
5. Save as `CAREER-<name>-HISTORY` via `outputNameFor`, never the input.
6. Return `{ outputFile, seasonsWritten, firstSeason, lastSeason, warnings }`.

## Gates (in-game, user-run, before any UI work)

Add a `history` preset to `server/scripts/franchise-experiment.ts`:

- **Gate 1**: write 2024 and 2025 into a copy of the autosave. Pass = the hub's League
  History / Super Bowl history shows both seasons with the right years, teams, scores and
  MVPs, and the awards screen lists the winners. Also note whether the game shows its own
  built-in real history alongside (it may render 1966-2025 from static data).
- **Gate 2**: full 30 seasons (1996-2025). Pass = all 30 render, ordering correct, no hang.
- **Gate 3**: `startSeason=1975` on the `EXP-1975` save. Pass = 1945-1974 render, pre-1966
  rows show sensible sides and the NFL Championship context is acceptable.

Each gate's result is appended to this spec under **Gate log**. If Gate 1 fails because the
game ignores the table, the feature stops at the experiment preset and this spec records
why.

## UI (after Gate 2 passes)

Franchise tab -> new **League history** tool (`web/src/components/franchise/LeagueHistoryTool.tsx`):

- Save picker (existing pattern), "Franchise starts in" year input, default = the save's
  `CurrentSeasonYear`, range 1934-2026.
- Preview list: the seasons that will be written, each as year, title game, champion, score,
  MVP. Warnings shown inline (e.g. fewer than 30 seasons available).
- **Write history** button -> new CAREER file; result banner names the file.
- Routes: `POST /franchise/league-history/preview` and `POST /franchise/league-history/apply`,
  mirroring `historic/preview` and `historic/arm-playoffs`. The preview route runs the planner
  only.

## Testing

- **Bake validator** (in the bake script, and a unit test over the committed file): every
  season 1933-2025 present exactly once; every `franchise` key resolves in the modern
  franchise list; every `pos` is a PositionE name, `HC` or `Invalid_`; every award type is
  one of the seven; scores are non-negative integers; champion score > runner-up score.
- **Planner tests** (`__tests__/LeagueHistory.test.ts`): period-index math; the 30-row cap and
  oldest-first order; the pre-1966 slot rule; counters accumulate from 1933 even when the
  window starts later; missing awards leave empty refs; a start year with fewer than 30
  prior seasons writes what exists.
- **Applier**: refuses a save with existing history (test with a stub file object exposing
  the same table API); the full write is covered by the gates.

## Out of scope

- AFL 1960-1965 titles.
- Seeding player stat history (`HistoricalSeasonStats`) or record books.
- Editing history on a franchise that has already played seasons.
- Madden 26 saves.

## Gate log

_(empty)_
