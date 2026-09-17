# Roster builder design

A Rosters view where the user opens a Madden 27 ROSTER save, moves, cuts, signs and edits
its players, adds players from the app's 32,140-player pool, and writes the result back as
a new ROSTER file the game loads. Approved 2026-09-16.

## Goals

- Build a custom roster from a base roster (the game's own or a downloaded one) plus the
  app's historic player pool, and load it in Madden 27.
- Reuse what the app already has: the roster parser, the draft-class player pipeline
  (ratings, faces, gear, persona), the franchise roster editor's detail panel and the
  Class Studio catalog.
- Never damage the base file: exports are new files, and the base is re-read on every build.

Out of scope for this version: rosters for other seasons and historic team rosters (the
long-term goal; the source panel is designed so a third source can be added), Madden 26
rosters, deleting players from the file, depth-chart editing, contract editing beyond the
cloned deal, sharing rosters between machines.

## Format findings the design rests on

Verified 2026-09-16 against ROSTER-Official (Madden-27-RL2_5) and a downloaded
ROSTER-ALLTIME (see the memory note `m27-roster-format` and the session's spike scripts).

- The file is a 6,291,530-byte FBCHUNKS container: 74-byte header, zlib stream at 0x4a,
  zero padding. Header: `0x10` u16 capacity in 64 KiB units, `0x12` u32 inflated payload
  length, `0x16` u32 constant 0x207eb, `0x1a` u32 LE CRC-32 in MSB-first bit order (poly
  0x04C11DB7, init and xorout 0xFFFFFFFF; "CRC-32/BZIP2") over the whole inflated payload,
  `0x1e` u32 = file length - 18, `0x22` six u16 = save time Y M D h m s, `0x2e` product
  string. The game validates length and checksum; padding and timestamp are not validated.
- The payload is a TDB2 database (bep713/madden-file-tools, MIT). Tables: BLOB (one record
  whose BLBM subtable holds one gzip record per player: asset name, names, generic head,
  body type, every gear slot), DCHT depth chart (PGID TGID DDEP PPOS), DFTP draft picks,
  INJY injuries, PLAY players (3,111; 106 distinct fields; the app's 3-byte field ids are
  the six-bit packed four-character names, so PLAY = 0xc2c879, PGID = id, TGID = team,
  POVR = overall), PLCT contracts (2,215), PRSN personas (3,111; DNA0-7, PRFC), TEAM (33,
  the last being free agency).
- A no-edit round trip through the library's writer produces a self-consistent file whose
  payload is about 370 KB larger than the original because the writer emits every field
  the table knows for every record, zero defaults included, where the game writes only
  non-default fields. The library's Madden 26 output has loaded in-game; nothing it wrote
  has been loaded in Madden 27 yet. That is what Gate 1 tests.

## Navigation

A slim left sidebar rail replaces the Draft | Franchise toggle in the top bar. Entries:
Home, Draft classes, Rosters, and Franchise tools when `DRAFT_TOOL_FRANCHISE` is on. Each
entry is an icon with a label beneath it; the active one uses the primary colour. Below a
wide breakpoint the rail shows icons only; the user can also collapse it, and that choice
is remembered per browser. The top bar keeps the logo, backend status and the current
view's own controls. The home page gains a third door for Rosters. The View menu items
stay and mirror the rail. `AppView` gains `'rosters'`.

## Rosters view

**Empty state.** A picker: ROSTER files in the Madden 27 saves folder, a Browse button for
a file elsewhere, and the rosters saved earlier in this app (name, base file, last edit).
Opening a base file starts a new unnamed roster document. With Madden 26 selected a notice
says only Madden 27 rosters are supported.

**Builder.** Full width, three parts.

- Header: roster name, the base file, counts of moves, cuts, adds and edits, then Save,
  Export to Madden, Close. Export writes `ROSTER-<NAME>` (name upper-cased, non
  alphanumerics dropped, 16 characters) beside the base and refuses a name that matches the
  base or `ROSTER-Official`.
- Left panel, two tabs. *Roster*: the base roster's players with team filter, position
  group, search and sort; rows show portrait, name, position, overall, age, dev trait,
  team. *Pool*: the Class Studio catalog panel, extracted into a shared component
  (search, position group, year range, league, Hall of Fame, sort). Each pool row has Add,
  which places the player on the selected team; a player already added shows his team.
- Right panel: a strip of the 32 team chips plus Free agents with roster counts, and the
  selected team's roster grouped by position with a 53-man count and per-position counts.
  Rows have Move to…, Cut and Edit. Dragging from the left panel or between teams also
  moves. Cut sends a player to free agency; nobody is deleted from the file.

**Editing.** Edit opens a side drawer holding the franchise roster editor's detail panel,
extracted into a shared component: overall, age, position, dev trait, jersey, all ratings
in groups, body type, generic head, gear editor. Added pool players open in the same
drawer. Edits are kept per player in the existing `PlayerFieldEdit` shape.

## Data model (web, browser cache)

Saved under `roster:<id>` beside the custom classes.

```ts
interface RosterDoc {
  id: string; name: string;
  base: { fileName: string; sizeBytes: number; crc: number }; // crc = header word at 0x1a
  moves: Record<number, number>;          // pgid -> team id (the free-agent team id for a cut)
  adds: AddedPlayer[];
  edits: Record<string, PlayerFieldEdit>; // pgid, or an added player's tempId
  createdAt: number; updatedAt: number;
}
interface AddedPlayer { tempId: string; key: string; teamId: number; jersey?: number }
```

The document stores only deltas against the base. On load the base is re-opened from the
saves folder; if it is missing or its checksum differs, the roster opens read-only with a
notice and a "Pick the base file again" action.

## Server

**Vendored TDB2 engine.** `server/src/vendor/tdb2/` holds the parser, writer, subtable
writer, field, record, table and file classes and the six-bit string and modified-LEB
helpers from madden-file-tools, with its MIT licence and a README naming the origin and
commit. Its four pure JavaScript dependencies (`crc-32`, `bit-buffer`, `stream-parser`,
`leb`) become server dependencies. Nothing else from the library comes over.

**RosterFileService** keeps its read API. Its parse path moves onto the vendored engine so
reading and writing share one model, and the existing tests keep passing. It gains
`write(file, header)`: the parsed TDB2 file and the base's 74-byte header in, the full
6,291,530-byte container out with length, checksum and save time recomputed and the zero
padding restored.

**RosterBuildService** applies a document to a base roster.

- Moves: set TGID on the PLAY row, drop the player's DCHT rows for the old team (the game
  rebuilds depth charts on load), reset years with team to 0.
- Adds: run the draft-class pipeline for the one pool player under the Career lens with the
  Madden 27 target, giving ratings, overall, archetype, dev trait, body type, generic head
  or scan asset, gear loadout and persona DNA. Age is the player's draft age plus four and
  years pro is four; both are editable. Clone the base roster's median-overall player at
  the same position as a template PLAY row and overwrite names, ids, bio, ratings, team,
  draft year and round, college, hometown, dev, archetype and jersey. Clone the template's
  PRSN row with the generated DNA, his PLCT row as a one-year league-minimum deal, and his
  BLBM blob with the generated head, body type and gear slots. New PGID and POID are the
  current maximum plus one.
- Edits: `PlayerFieldEdit` fields map onto PLAY and the blob the way the franchise roster
  editor maps them onto the Player table.

**Routes.** `POST /roster/build` takes the document, writes `ROSTER-<NAME>` and returns the
path and counts. `POST /roster/preview-add` returns a generated pool player without
writing, so the panel can show his overall before placing him. The existing list, open
and reopen routes stay.

**Errors.** Refusals name the cause: base missing, base changed, name collides with the base
or the official roster, no player at the template position, a player id no longer in the
base. A build assembles the whole buffer, writes to a temporary name, then renames, so no
partial file is ever left behind.

## Testing

Automated (node:test, like the existing roster tests):

- Header writer: a fixture header round-trips; length and checksum equal the CRC-32/BZIP2
  of the payload; padding is exact; the timestamp is today's.
- Round trip: with ROSTER-Official in the saves folder, load, write and reparse; every
  player, team, contract, persona and blob record reads back equal. Skipped without the
  fixture.
- Build service, on the shipped roster: a move changes one TGID and drops the old DCHT
  rows; a cut lands in the free-agent team; an add yields PLAY, PRSN, PLCT and BLBM rows
  with fresh, non-colliding ids; an edit changes exactly the fields asked. Each case
  rewrites and reparses.
- Pool player mapping: a known player maps to the expected position id, college id and
  asset name; a player without a scan gets a generic head from the head list.
- Web: the roster document cache shape and its migration guard; the rail's active entry
  follows the view.

In-game gates, run by the user in Madden 27, each with a script under `server/scripts/`
that writes a clearly named test file into the saves folder:

1. Gate 1, before any UI work: a no-edit round trip of ROSTER-Official loads and a few
   players look right. If the game refuses it, the writer moves to a byte-faithful
   serializer in RosterFileService (only non-default fields, the original integer
   encoding) and the rest of the plan stands.
2. Gate 2, after the build service: one edited overall and one team move; the rating shows
   and the moved player has a depth-chart slot on his new team.
3. Gate 3, after adds: a pool player with a scan face and one with a generic head; face,
   gear, persona and contract screen look right.

## Sequencing

1. Vendor the engine, header writer, round-trip test, Gate 1 script.
2. Build service with moves, cuts and edits, its tests, Gate 2 script.
3. Sidebar rail, home door, Rosters view with open, save, move, cut, edit and export.
4. Pool adds with preview, Gate 3 script, then the shared catalog panel and drag.

Each shipped piece adds a short line to CHANGELOG.md under Unreleased.
