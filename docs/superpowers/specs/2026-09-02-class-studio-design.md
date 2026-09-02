# Class Studio design

Replaces the hand-picked class builder (a modal reached through Draft options) with a
full-width "Create class" studio: the player catalog on the left half, a pick-ordered
draft board on the right, and a form for custom players. Approved 2026-09-02.

## Goals

- Build a class by picking real players from the whole 1936–2026 pool and placing them
  at specific picks, in the order they will be drafted.
- Create custom players (a new prospect who never existed) from a short form; the app
  fills in the attributes from the chosen overall and archetype, as it does for real
  players.
- Save, reopen, generate and export such classes exactly as today's custom classes.

Out of scope: editing real players' careers in the studio (the player card does that
after generation), uploading photos in the form (the player card's Appearance editor
does that), sharing classes between machines.

## UI

**Entry.** A "Create class" button in the top bar next to the year picker. The
"Hand-picked" segment in Draft options is removed; the Draft options dialog keeps
Year / All-time / Decade.

**Studio.** Full-width over the class view, closed with Escape or its Close button.

- Header: class name field, saved-class picker (open, rename, delete), the "Pad the
  class with generated prospects" toggle (default on), Save, Generate. Generate saves
  first, then builds the class and returns to the class view showing it.
- Left half: the catalog as the current builder has it (search, position group,
  year range, league, Hall of Fame, sort; 400 rows shown at once). Each row has an
  Add button; a player already on the board shows his pick number instead. Above the
  list, a "New custom player" button opens the custom-player drawer.
- Right half: the board. 402 slots numbered 1–402 in rounds of 32 (round 13 holds
  18). A filled slot shows pick, name, position, draft year and college; custom
  players carry a "custom" tag and an Edit action. Add from the left fills the first
  open slot. Slots drag to reorder (drop between slots inserts; the rest shift). A
  slot's menu offers "Move to pick…" and "Remove". A footer shows filled / 402.
- Custom-player drawer (over the left half): first and last name, position (the 22
  Madden positions), college (free text with the lookup's colleges as suggestions),
  height (inches, shown as ft/in), weight, age, jersey (optional), overall 40–99,
  dev trait (Normal / Star / Superstar / X-Factor), archetype (the position's
  archetypes from the calibration data), skin tone 1–7. Save adds him to the first
  open slot or updates him in place; Cancel discards.

## Data

```ts
interface CustomPlayer {
  id: string;             // studio-generated
  firstName: string; lastName: string;
  position: string;       // Madden label: QB, HB, …, LEDG, MIKE, SS, K, P, LS
  college: string;
  heightInches: number; weight: number; age: number;
  jersey?: number;
  overall: number;        // 40–99
  devTrait: 0 | 1 | 2 | 3;
  archetype: number;      // the app's archetype id for the position
  skinTone: number;       // 1–7
}
type BoardEntry = { key: string } | { custom: CustomPlayer };
interface CustomClass {
  id: string; name: string;
  board: BoardEntry[];    // pick order; index = pick - 1
  createdAt: number; updatedAt: number;
}
```

Saved classes stay in the browser cache where they are today. A record saved by 1.2.0
(`keys: string[]`) is migrated on load: `board = keys.map((key) => ({ key }))`. Edits
to generated players keep working because the class's league id stays
`custom:<slug>`.

## Server

`POST /draft/custom` with `source: 'picked'` accepts `board` (and still `keys`, treated
as an ordered board of real entries). Real entries resolve through the player lookup
as now. Custom entries become `BaselinePlayer` objects with `source: 'custom'`, the
given bio, `position` set to the Madden label, and `wav`/`caliber` chosen so the
generator lands on the given overall; dev trait is the given one.

`DraftClassBuilder.buildProspects` gains an `order: 'board'` option for picked
classes: prospects keep the board's order as their pick order instead of being
re-ranked by career greatness. Filling (when on) appends era-matched generated
prospects after the last entry, up to 402. Everything downstream (attributes from
archetype, gear, faces, export to .mdc for both games, CSV) is unchanged.

Position ids: the custom player's label maps through the existing position table
(the same names the equipment and profile editors use). Archetype ids come from
`CalibrationService.archetypeOptions()`, exposed through the existing lookups route
so the form lists the right archetypes per position.

## Errors

- A board entry whose real player is no longer in the lookup is skipped and reported
  (`missing`), as today.
- More than 402 entries is refused by the studio (Add is disabled when the board is
  full); the server truncates defensively and reports `truncatedKeys`.
- A custom player with an empty name, an unknown position, or an overall outside
  40–99 is rejected by the form before save and by the route with a 400.

## Testing

Server (node:test):
- a picked class with a `board` keeps that order as picks 1..n;
- a custom player round-trips through preview and export with his name, position,
  archetype, overall and dev trait, and gets 54 attributes and an era loadout;
- a 1.2.0-style `keys` request still works;
- an invalid custom player returns 400.

Web: type-check; manual pass through add, reorder, move-to-pick, custom player
create and edit, save, reopen, generate, export.
