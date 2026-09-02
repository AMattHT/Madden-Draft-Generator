# Quality-of-life pass: full CSV, Madden-owned overall, hand-picked classes — design

Date: 2026-09-01 · Status: approved by user (defaults accepted), implementing.

Three user requests, shipped in order. Each is independently useful; each lands on
`master` without cutting a release (releases are on hold until the FMT reads M27).

## 1. Full CSV export

**Problem.** The existing *Export CSV* writes 15 columns (pick, name, position, OVR, dev,
wAV, team, college, height, weight, age, jersey, round, draft pick) and ignores rating
edits. Users want the attributes and overalls in a spreadsheet.

**Design.** Extend the existing menu item; no new entry point.

- Client-side, from the board's effective rows (`ClassView.effRows`) with **all** edits
  applied: names, position, dev trait, bio fields, and every edited attribute. Today
  `effRows` only merges name/overall/dev/position; the CSV builder merges ratings and bio
  from the per-player patch itself so the sheet equals what the `.mdc` will contain.
- Column order: `Pick, First, Last, Pos, Archetype, OVR, Dev, wAV, wAVSource, Team, College,
  DraftYear, Round, DraftPick, Height, HeightIn, Weight, Age, Jersey, BodyType, Face,
  Forty, Bench, Vertical, Broad, Cone, Shuttle`, then the 54 attributes in board order
  using Madden's abbreviations from `ATTR_COLUMNS` (SPD, ACC, AGI, …).
- `OVR` is Madden's recomputed overall (part 2 makes that the row's `overall`).
- File starts with a UTF-8 byte-order mark so Excel opens accented names correctly.
  Filename stays `DraftClass_<year>_<league>.csv`; a hand-picked class uses its slug.
- The export includes overalls and attributes even when *Spoilers* is off. The menu item
  reads "Export CSV (all attributes)" and its tooltip says it reveals everything.

**Testing.** The CSV builder is a pure function (`rows, edits → string`) in its own module
(`web/src/csv.ts`) so it can be unit-tested with node's test runner (header count = 27 + 54,
BOM present, quoting of commas/quotes, edits applied).

## 2. The overall belongs to Madden

**Problem.** The player card has an editable *Overall*. Madden ignores the OVR byte and
recomputes from attributes, so the app reshapes attributes to hit the typed number and shows
a "game shows X" badge when they disagree. Users find this confusing: they should never touch
OVR; the app should show what Madden will show.

**Evidence.** For the 2003 M27 class, the game's recompute of the generated attributes equals
the displayed overall for 402 of 402 rows (one archetype label differs). The base class is
already right; only the editing flow changes.

**Design.**

- **Player card.** Remove the *Overall* number input. The OVR chip is read-only and shows the
  game's recompute of the *current* (edited) attributes, position and archetype. It updates
  live (debounced) via the existing `/api/draft/recompute`. The "game shows X" badge goes
  away; the archetype-differs note stays (as a small "as <archetype>" suffix) because the
  game may label the prospect under a different archetype.
- **Position / archetype edits** keep the existing behaviour: attributes are re-solved so the
  prospect stays at his level (`reconcileToTarget` against the pre-edit overall), and the
  chip shows where he lands.
- **Board.** A new `POST /api/draft/recompute-batch` takes
  `{ gameVersion, items: [{ id, positionId, archetype, ratings, overall? }] }` and returns
  `[{ id, overall, archetype }]`. `ClassView` calls it (debounced, edited rows only) whenever
  edits change and overlays the results onto `effRows`, so the OVR column and OVR sort
  reflect edits. The calculation is ~1 ms per class.
- **Legacy edits.** Existing saved patches may carry an `overall` key. The server export
  still honours it (reconcile to that target, unchanged). The batch endpoint does the same
  when `overall` is present in an item so the board and the file agree. The UI no longer
  writes `overall`.
- **Franchise Tools roster editor** keeps its OVR input; that view is outside the release.

**Testing.** Server: a unit test that `recompute-batch` returns the same overall as
`gameOverall` and honours a legacy `overall` target. Client: type-check; manual check that
editing SPD on a WR moves the chip and the board.

## 3. Hand-picked draft classes

**Problem.** Users want to build their own class from the whole 32,140-player pool, browsing
and sorting by position and era, capped at Madden's 402 slots.

### Identity

Every catalog player gets a **stable key**: `draftYear|league|firstName|lastName|pick`
(names normalised with `normalizeName`, pick `u` when undrafted). Keys are built once at
lookup load and survive data refreshes and app updates, unlike the source-row index used by
the dropped-players include list. Duplicate keys within the merged pool get a `#2`, `#3`
suffix in load order so every player is addressable.

### Server

- `GET /api/players/catalog` → `{ players: CatalogPlayer[] }`, one compact row per merged
  player (about 3 MB, built once and held in memory):
  `{ key, first, last, pos (raw label), mpos (Madden position name), grp (position group),
  year, league, round, pick, college, wav, cal (career caliber 0–99), hof, pb, ap1 }`.
- `POST /api/draft/custom` and `POST /api/export/mdc` accept `source: 'picked'` with
  `keys: string[]` (≤ 402, deduped) and `fill: boolean` (default true) and `name: string`.
  - Players resolve by key; unknown keys are echoed back as `missing: string[]` on the
    preview response (the UI flags them) and are ignored by the export.
  - Picked players are ordered by the All-Time greatness score
    (`wav + 4·AP1 + 2·PB + 40·HOF`), highest first, then run through
    `DraftClassBuilder.preview` / `buildMdc*` unchanged; modifiers (strength, hindsight,
    studs, generational, variant) apply as for any custom class.
  - `fill: true` pads to 402 with `GenericFillerService.build(medianYear, players)` where
    `medianYear` is the median draft year of the picked players.
  - Export filename: `CAREERDRAFT-<SLUG>` where `SLUG` is the class name's letters and
    digits, upper-cased, at most 16 characters, falling back to `CUSTOM`.
- A new `DraftEnrichment.pickedClass(keys, fill)` mirrors `allTimeGreatsClass` (enriches via
  `enrichOne`).

### Client

- **Data model.** `CustomClass { id, name, keys: string[], createdAt, updatedAt }` persisted
  in IndexedDB under `custom:<id>`; `cache.customList/customGet/customSet/customDel`. Edits,
  gear and filters for a custom class use the existing per-class stores with
  `year = 0, league = 'custom:<id>'`.
- **Entry point.** `DraftOptions` Source gains a fourth segment **Hand-picked**. Choosing it
  shows a class dropdown (saved classes) and a **Build class…** button. `DraftOpts` gains
  `customId?: string` and `fill?: boolean`; `isCustomDraft` is true for `source === 'picked'`.
- **Builder** (`ClassBuilder.tsx`): full-screen dialog in the `DroppedPanel` style.
  - Left: the catalog, fetched once per session (`api.catalog()`, held in module state).
    Controls: name search, position group (`POS_GROUP_ORDER` + All), draft-year range
    (two selects), league (All / NFL / AFL / other), HOF-only toggle, sort
    (year ↓, name, position, round/pick, wAV ↓, career rating ↓, Pro Bowls ↓).
    Rendering is capped at 400 rows with a "showing 400 of N, narrow the filter" footer.
    Each row: name, pos, year, Rd/pick, college, wAV, HOF mark, **Add** (disabled when
    already in the class or the class is full). **Add all shown** adds from the top of the
    current list until the class is full.
  - Right: the class. Header `n / 402`, name field, per-position-group counts, the players
    grouped by group in greatness order, each with a remove ×. Footer: *Fill the rest with
    generated prospects* checkbox (default on), **Clear**, **Save**, **Save & generate**.
  - "My classes" strip at the top of the right pane: open, duplicate, delete saved classes.
    Delete asks once inline.
- **Loading.** `App.select` for `source === 'picked'` reads the saved class, calls
  `api.generatedCustom({ source: 'picked', keys, fill, name, …modifiers })`, uses
  `ekYear = 0, league = 'custom:<id>'` for edits. `ClassView` header shows the class name in
  gold ("Custom · <name>") with a "n picked" pill; the `missing` list, if any, shows as a
  warning pill with a tooltip naming the players.
- **Export.** `ExportMenu` passes `source: 'picked'`, `keys`, `fill`, `name`; the download
  filename matches the server's `CAREERDRAFT-<SLUG>`.

### Error handling

- Catalog fetch failure: the builder shows a retry banner; the rest of the app is unaffected.
- Unknown keys after a data refresh: preview returns `missing`; UI shows them and the
  builder marks them "not found" with a remove button.
- More than 402 keys in a request: server truncates to 402 (after dedupe) and says so in the
  response (`truncatedKeys: true`); the UI never sends more.

### Testing

- Server: `PickedClass.test.ts` — keys resolve to the right players; order is by greatness;
  `fill` pads to 402 with the median-year filler; unknown keys are reported; 402 cap holds;
  filename slug rules.
- Client: type-check and a manual run: build a 30-player QB/WR class, generate, export,
  reopen from *My classes* with edits intact.

## Out of scope

Manual ordering of picked players; per-position quotas in the builder; CSV import; changes to
the Franchise Tools roster editor.
