# Scouting notes for blind mode

**Date:** 2026-09-17
**Status:** approved

## Goal

A class opens blind: every overall, dev trait and attribute reads `?`. The profile card's
Scouting section is an empty box in that state. This feature fills it with two to four
sentences of scout's prose derived from the hidden attributes, so a user can scout a player
without seeing a number. A stacked player reads as a stud, a thin one as a project, which is
what a real report would say. The leak level was chosen deliberately: strengths and
weaknesses appear, numbers and tiers never do.

## Generation (server)

New pure module `server/src/services/ScoutingNotesService.ts`:

```ts
scoutingNotes(input: {
  id: number;                      // stable player id (hash seed)
  positionId: number;              // M26 position id
  attrs: Record<string, number>;   // rating key -> value
  profile: PosProfile;             // CalibrationService.positionProfile(posName, version)
}): string[]
```

1. Signature attributes for the position group come from a server-side table
   `SIGNATURE_ATTRS` (group -> rating keys) that mirrors `KEY_ATTRS` in
   `web/src/constants.ts`. The two lists must stay identical; a test asserts the server
   table covers every group the web table has. Group from position id uses
   `PositionMapper.groupFromId`.
2. For each signature attribute: `z = (value - mean) / std` where `mean` is
   `profile.attrs[key]` and `std` is `profile.attrStats?.[key]?.std`, falling back to 8
   when the profile has no spread for that key.
3. Classify: `z >= 1.6` strong strength, `z >= 0.8` strength, `z <= -1.6` strong weakness,
   `z <= -0.8` weakness, otherwise ignored.
4. Keep the top three strengths and top two weaknesses by `|z|`, then cap at four lines,
   strengths first, each group ordered by `|z|` descending.
5. Fewer than two lines: return one neutral sentence for the group, e.g. "Even profile for a
   corner: no standout trait, no glaring hole." (one per group in the phrase file).
6. Phrase choice per line: `phrases[key][direction][tier]` is an array; pick index
   `hash(id, key) % length` with a small stable string hash so a player always reads the
   same and a class does not repeat one line down the board.

## Phrase table

`server/data/lookups/scouting-phrases.json`:

```json
{
  "neutral": { "QB": "...", "RB": "...", ... },
  "attrs": {
    "throwPower": {
      "strength": { "strong": ["Rifle arm that reaches any part of the field", "..."],
                    "mild":   ["Arm strength is a plus", "..."] },
      "weakness": { "strong": ["Ball dies on deep outs", "..."],
                    "mild":   ["Arm is ordinary", "..."] }
    },
    ...
  }
}
```

Rules: two or three sentences per cell; no digits anywhere; no tier words ("elite",
"superstar", "X-Factor") that map onto a Madden label; register like MyFranchise's draft
profile notes, short and concrete. Every signature attribute of every group has all four
cells; a test loads the file and checks completeness and the no-digit rule.

## Delivery

- `PlayerRow` (web `types.ts` and the server row type) gains `scouting?: string[]`.
- Notes are computed when rows are served, in the draft, open and roster responses, from
  the attributes those rows carry. They are not written into the class cache, so wording
  changes never invalidate cached classes.
- After an attribute edit with spoilers on, the notes refresh when the class next loads.
  In blind mode attributes cannot be edited, so nothing goes stale there.

## Display

`web/src/components/ProfileModal.tsx`, Scouting section:

- Spoilers off: the dashed "hidden" box is replaced by a "Scout's read" heading and the
  notes as a short bulleted list. If `scouting` is missing or empty, the current hidden box
  stays.
- Spoilers on: the radar chart stays and the same list renders beneath it.
- Roster players (spoilers forced on) get the list under the chart.
- No change to `PlayerTable` or the meta strip.

## Testing

Unit tests in `server/src/services/__tests__/ScoutingNotes.test.ts`:

- Thresholds: a value at mean + 0.8 std is a mild strength; mean + 1.6 std strong; mean
  − 0.8 std a mild weakness; within ±0.8 ignored.
- Cap and order: seven qualifying attributes yield four lines, strengths first, by `|z|`.
- Neutral fallback when fewer than two lines qualify.
- Determinism: the same id and attrs give the same lines; a different id can pick a
  different phrasing for the same attribute.
- Phrase file completeness and the no-digit rule.
- Server `SIGNATURE_ATTRS` covers every group in the web `KEY_ATTRS`.

Preview check: open a blind class, open a card, confirm notes render and contain no digit;
tick Spoilers and confirm the chart and the list both show.

## Out of scope

- Notes in the table or as a sortable column.
- Deliberate scout error or a fog slider (the Realistic lens already has hindsight).
- Notes from combine, build or two-way roles; those facts are already visible on the card.
