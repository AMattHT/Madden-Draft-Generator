# Announcer name supplement

**Date:** 2026-09-17
**Status:** approved

## Goal

More exported players get their surname called by the Madden 27 broadcast. Today the
`surnameCommentary` table in `server/data/lookups/m27-field-stats.json` covers 2,727
surnames, all read from real Madden 27 and 26 classes and career saves. MyFranchise 2.0.2
ships a surname → commentary-id table of 7,859 names using the same id space. Merging the
names we lack lifts coverage of the 32,246-player pool from 17,843 players to 24,070.

## Data

- **New file:** `server/data/lookups/m27-commentary-supplement.json`
  - Shape: `{ "_source": "<provenance note>", "surnameCommentary": { "<key>": <id> } }`
  - Keys use the same normalisation as the primary table: lowercase, letters only
    (`surnameKey` in `M27Fields.ts`).
  - Contains only surnames absent from the primary table (5,453 at build time).
  - `_source` names MyFranchise 2.0.2 `static/player/commentary.json` as the origin and the
    build date.
- The primary table and its generator (`server/scripts/build-m27-field-stats.ts`) are
  unchanged. Regenerating the primary table never touches the supplement.
- A one-off script `server/scripts/build-commentary-supplement.ts` builds the supplement
  from a path to the MyFranchise file, skipping keys the primary table already has and
  keys that normalise to an empty string. Conflicts (152 at build time) are dropped, not
  merged: the primary table's ids were verified in-game.

## Code

`commentaryIdFor(lastName)` in `server/src/services/M27Fields.ts`:

1. Look up the key in the primary table.
2. If absent, look it up in the supplement (lazy-loaded once, missing file → empty map).
3. Otherwise return 0, as today.

Both callers (`DraftClassBuilder` for classes, `RosterAddService` for roster additions)
go through this function, so no other code changes.

## Testing

Unit tests in `server/src/services/__tests__/`:

- A surname only in the supplement resolves to the supplement id.
- A surname in both tables resolves to the primary id.
- An unknown surname resolves to 0.
- Normalisation: `"O'Neal"`, `"o neal"` and `"ONEAL"` resolve identically.

Manual gate (user): export a class containing a newly covered surname and confirm the
broadcast says the name in-game.

## Out of scope

- Re-deriving the 152 conflicting ids.
- Any change to how ids are written to the `.mdc` or roster file.
