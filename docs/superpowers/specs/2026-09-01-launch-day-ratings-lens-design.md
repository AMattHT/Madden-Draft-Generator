# Launch Day Ratings lens — design

Date: 2026-09-01 · Status: approved by user, implementing.

## Problem

Recent classes (2018 onward) rate players from two or three seasons of wAV, or from
draft slot alone, so their rookie overalls are modeled guesses. Users asked for the
rating EA actually shipped for each rookie on the game's launch day.

## Source

maddenratings.net publishes, per Madden edition, a spreadsheet of the full launch
roster: every player with overall, all attributes, archetype, height, weight, age,
college and years pro. A rookie is a row with 0 years pro, so the Madden 24 launch
file holds the 2023 class's launch-day ratings. Full launch files exist for Madden
19, 20, 21, 23, 24 and 27 (classes 2018, 2019, 2020, 2022, 2023, 2026). Madden 22 only
offers a final-season roster (not launch), and the 2024-edition Madden 25 and Madden 26
are not on the site, so 2021, 2024 and 2025 have no launch data. Matching the Madden 24
rookies to the 2023 class by name hits 288 of 334; the misses are undrafted players
who never made a roster and a few name variants.

The files are downloaded **once** by a bake script and shipped as a lookup; the app
never fetches at runtime. The site is fan-run with no stated reuse terms: the lookup
and README credit it.

## Design

### Bake: `server/scripts/build-launch-ratings.ts`

Downloads each edition's full launch file (URLs in a table in the script), unzips
the xlsx (`fflate`), reads the first sheet, normalises headers (editions differ:
`Full Name` vs `Name` vs `First Name`+`Last Name`; `Overall Rating` vs `Overall`
vs `OverallRating`; `Speed` vs `SpeedRating`; the 2013 file misspells `Stength`),
keeps rows with 0 years pro, maps attribute columns onto `RATING_KEYS`, and writes
`server/data/lookups/rookie-launch-ratings.json`:

```
{ _source, _built, editions: { "2023": { madden: 24, rookies: 347 } },
  players: { "2023|cj|stroud": [ { pos: "QB", ovr: 73, attrs: { speed: 68, ... } } ] } }
```

Keys use `normalizeName` on first and last (suffix-blind). A name shared by two
rookies of one year keeps both entries; lookup disambiguates by position group.
Attributes an older edition lacks are simply absent from `attrs`.

### Service: `LaunchRatingsService`

- `get(first, last, draftYear, posId): { ovr, attrs, pos } | null` — exact key,
  then position-group match when several entries share the name.
- `hasYear(draftYear): boolean` — whether any launch data exists for the class.
- `years(): number[]`.

### Builder: a third `GenMode`, `'launch'`

`GenMode = 'madden' | 'retro' | 'launch'`. Launch mode ranks and rates exactly like
`madden` (Realistic), then for every player with a launch entry:

- `overall` becomes EA's launch overall (the class curve no longer applies to him);
- attributes are generated as usual, then the file's attributes overlay them
  (missing keys keep the generated value), then the usual reconcile to the launch
  overall runs so Madden's recompute agrees;
- dev trait is unchanged (the Realistic assignment stands — dev is a separate
  problem);
- the row is tagged `wavSource: 'launch'`.

Players without an entry, and whole years without launch data, are identical to
Realistic. Modifiers (strength, studs, generational, hindsight) apply to the ranking
pass as today and never override a launch overall. `PreviewResult` gains
`launchCount` so the UI can say "no launch data for this year".

### Routes

`/draft/:year/generated`, `/draft/custom`, `/export/mdc` accept `mode=launch`.

### Client

- `GenMode` gains `'launch'`; the top-bar RATING LENS toggle shows three segments:
  **Launch Day**, **Realistic**, **Career**. Tooltip on Launch Day: "EA's launch-day
  rookie ratings where they exist (2018–2020, 2022–2023, 2026); everyone else as
  Realistic."
- Class header pill: "Launch-day lens"; when `launchCount === 0` in launch mode, a
  muted pill "no launch data for this year".
- Board wAV tag: `launch` → "EA" with title "EA's launch-day rating (Madden NN)".
- Cache keys already include the mode string.

### Testing

- Header/row normalisation unit test on a tiny synthetic sheet (three editions'
  header styles).
- `LaunchRatingsService.get` resolves Stroud 2023 to 73 and disambiguates a shared
  name by position (skips when the JSON is absent).
- Builder: 2023 in launch mode gives Stroud overall 73 with the file's throw power,
  a player without an entry matches Realistic, and 2023 in Realistic is unchanged;
  1998 launch mode equals Realistic row for row.

## Out of scope

Dev traits (a separate design), the 2021/2024/2025 gaps, archetype from the file,
per-team files for pre-2018 editions.
