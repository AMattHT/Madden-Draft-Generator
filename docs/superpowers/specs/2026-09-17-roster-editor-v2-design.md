# Roster editor v2 design

Three changes to the Rosters view shipped in 1.4.0: the draft editor's profile card for
roster players, a cleaner Pool tab, and rosters built from scratch. Approved 2026-09-17.

## Goals

- Clicking a roster player opens the same profile card the draft editor uses, with
  everything on it editable and written to the roster file.
- The Pool tab reads like the Roster tab instead of a squeezed nine-column table.
- A roster can be started empty and filled entirely from the pool.

Out of scope: depth-chart editing, contract editing beyond the cloned deal, Madden 26
rosters, sharing rosters between machines.

## The profile card for roster players

**Open and navigate.** Clicking a row in the Roster tab or in the team panel opens the
draft editor's slide-in profile card in place of the current drawer. Left and right arrows
step through the list the row came from (the filtered Roster list, or the selected team's
roster in position order). Escape closes; nested editors (equipment, appearance, persona
picker) handle their own Escape first, as in the draft view.

**Shown.** Portrait header with name, position, the game's recomputed overall after edits,
dev badge and archetype; then bio, appearance, equipment, Persona DNA and focus, and every
attribute in groups. Hidden for roster players: draft slot, career value, combine, the
front-seven and two-way notes, and the Spoilers masking (the card is always revealed).
A section with no roster data does not render.

**Editable.** Everything the drawer edited (overall, age, position, dev, jersey, ratings,
body type, generic head, gear) plus first and last name, college, height, weight,
archetype, Persona DNA traits and focus, and the face through the appearance editor
(generic heads by skin tone and the game's face scans). The recomputed-overall call is
the existing `/api/draft/recompute` with the roster player's position, archetype and
ratings.

**Data.** `RosterPlayer` gains `archetypeId`, `collegeId`, `skinTone`, `personaDNA`
(trait ids), `focus`, `homeState`, and `face: 'asset' | 'generic'`. Pool previews carry
the same. The card is fed a `PlayerRow` built by an adapter from a roster player or a
preview; the adapter lives in `rosterCard.ts` and is unit-tested.

**Edit vocabulary.** The document keeps `PlayerFieldEdit` and extends it with
`firstName`, `lastName`, `college` (id), `heightInches`, `weight`, `archetype` (id),
`personaDNA` (trait ids), `focus` (0–3), `faceAsset` (scan asset name), `skinTone`. The
card speaks the draft vocabulary (`jerseyNum`, `devTrait` as a number, `genericHeadName`,
comma-joined `personaDNA`); the adapter translates both ways.

**Server writes.** Names to `PFNA`/`PLNA` and the blob's `CFNM`/`CLNM`; college to `PCOL`;
archetype to `PLTY`; height and weight to `PHGT`/`PWGT` and the blob's `HINC`/`WLBS`;
persona to the persona row's `DNA0`–`DNA7` and `PRFC`; a face scan to `PEPS` and the blob's
`ASNM` (and the generic head kept in `GENR`); a generic head to `GENR`, with `PEPS` set to
the head name and `ASNM` cleared, as the game writes created players; skin tone to `SKNT`.
Position, archetype and overall edits do not reconcile attributes on the server: the card
already shows the game's recomputed overall, and roster ratings are the user's to set.

**Adds.** An added pool player opens in the same card with his preview as the base values;
Reset edits restores the preview.

## Pool tab

The shared `CatalogPanel` gains a `compact` mode used by the roster builder; the Class
Studio keeps the full table.

- One toolbar: search, position group, era picker (All, 1930s … 2020s), HOF toggle, sort
  menu (Career, Name, Year, Position).
- Rows in the Roster tab's style: portrait, name with a small HOF mark, position chip, year
  and round ("1987 · Rd 1"), career-score chip, and Add on the right. Once added the row
  shows the team abbreviation (or FA) in place of Add; "Rating…" while the server rates him.
- The first 400 matches are shown with the existing "narrow the search" footer.
- A one-line hint above the list: "Rated by career, added to the selected team. Age is his
  draft age plus four; edit anything afterwards."

## New roster from scratch

**Entry.** The picker gets a "New roster" action beside the saves list. It opens the
game's own roster (`ROSTER-Official`) as the container and creates a document with
`fresh: true`.

**In the builder.** A fresh roster starts with all 32 teams empty and no players: the
Roster tab lists nothing, every team chip reads 0, and the team panel says "Nobody here.
Add players from the Pool tab." Moves and cuts apply only to added players. The picker's
"Your rosters" list shows "from scratch" instead of a base file name; the base checksum
check still applies because the container is the game's file.

**Export.** For a fresh document the server removes every base player from the file before
adding yours: their PLAY, PRSN, PLCT, DCHT and INJY rows and their BLBM blob. Team rows and
every other table stay. New player ids still start above the base roster's highest id, so
nothing collides with references the game keeps elsewhere.

**Gate 5.** A fresh roster with one team filled with 53 pool players and the other 31
empty is loaded in Madden 27; the user tries Play Now with the filled team against an empty
one. If the game refuses empty or short teams, the export warns on teams below the number
the gate establishes, and the number is recorded here.

## Pool positions match the draft

The pool listed players by a mapping of their raw draft label alone, so Rod Woodson stayed
a corner despite the curated safety entry and Julius Peppers's "LE" fell to DT on weight.
The pool now derives its position the way a draft class does: curated defensive-back
entries, the front-seven classifier (curated roles, sack rate, scheme), the pre-2001
corner/safety split by build, and the heavy-end sack rule, using the nflverse weight when
the draft table has none. The depth-chart label (2001+ year classes) needs the per-year
team join and stays out of the pool; it applies when the player is rated. Rod Woodson
(1987) is curated as a free safety.

## Testing

- Server: build tests for each new edit field written and read back; a fresh-roster test
  that the base rows are gone from every table and only the adds remain; the read model's
  new fields on Geno Smith.
- Web: `rosterCard` adapter tests (roster player → card row, card edit → `PlayerFieldEdit`,
  both directions for persona and face); `rosterDoc` tests for `fresh` (empty view, counts).
- In-game: Gate 4 (one base player renamed with a new college, build, archetype, persona
  and a face scan, plus a pool player with a chosen generic head) and Gate 5 (above).

## Sequencing

1. Read model and server writes for the new edit fields, with tests; Gate 4 script.
2. The card: adapter, wiring into the builder in place of the drawer, navigation.
3. Pool tab compact mode.
4. Fresh rosters: document flag, picker action, builder behaviour, server removal, Gate 5
   script.
