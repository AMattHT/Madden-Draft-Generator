# Roster Editor v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The draft editor's profile card opens for roster players with everything editable, the Pool tab gets a compact row layout, and a roster can be started from scratch.

**Architecture:** The roster read model and edit type grow by the card's fields; `RosterBuildService.applyEdit` writes them to the PLAY row, the persona row and the visuals blob. On the web, `rosterCard.ts` adapts a roster player (or a pool preview) into the `PlayerRow` the card renders and translates card edits into `PlayerFieldEdit`; `ProfileModal` gains a `mode="roster"` that hides draft-only blocks. `CatalogPanel` gains a `compact` layout. A `fresh` flag on the document empties the view and makes the server strip every base player before adding yours.

**Tech Stack:** as the previous plans.

**Spec:** `docs/superpowers/specs/2026-09-17-roster-editor-v2-design.md`.

## Global Constraints

- The card is always revealed for roster players (no Spoilers masking); its footer reads "Edits save with the roster and apply on export."
- Roster edit vocabulary (`PlayerFieldEdit`, both sides): existing fields plus `firstName`, `lastName`, `college` (id), `heightInches`, `weight`, `archetype` (id), `personaDNA` (number[]), `focus` (0–3), `faceAsset` (scan asset), `skinTone` (1–8).
- Generic head edit writes `GENR` = head, `PEPS` = head, blob `ASNM` = ''. Face-scan edit writes `PEPS` = asset and `ASNM` = asset, leaving `GENR`.
- Names are cut to 16 (first) and 20 (last) characters, as the draft export does.
- A fresh roster's adds are created against the intact base first, then every base player's rows are removed (PLAY, PRSN, PLCT, DCHT, INJY, BLBM). Ids stay above the base maximum.
- Every `git add` names explicit files. Server commands from `draft-class-generator/server`, web from `draft-class-generator/web`, git from `draft-class-generator`.

## File Structure

| File | Responsibility |
|---|---|
| `server/src/types/roster.ts` (modify) | `PlayerFieldEdit` new fields; `RosterBuildDoc.fresh`. |
| `server/src/services/RosterFileService.ts` (modify) | `RosterPlayer` gains `archetypeId`, `collegeId`, `skinTone`, `personaDNA`, `focus`, `face`, `homeState`. |
| `server/src/services/RosterAddService.ts` (modify) | `GeneratedRosterPlayer` unchanged in shape; nothing to add (it already carries these). |
| `server/src/services/RosterBuildService.ts` (modify) | `applyEdit` writes the new fields; `apply` handles `fresh`. |
| `server/scripts/roster-gate4.ts`, `roster-gate5.ts` (new) | In-game gates. |
| `web/src/types.ts`, `web/src/api.ts` (modify) | `RosterPlayer` fields, `PlayerFieldEdit` fields, `RosterDoc.fresh`, build body `fresh`. |
| `web/src/rosterCard.ts` + test (new) | `rowFor(player, ctx)`, `patchFor(edit, ctx)`, `editFromCard(field, value, ctx)`. |
| `web/src/components/ProfileModal.tsx` (modify) | `mode?: 'draft' \| 'roster'` and `footer?: string`. |
| `web/src/components/rosters/RosterBuilder.tsx` (modify) | Card in place of the drawer; navigation lists; fresh behaviour; Pool compact. |
| `web/src/components/CatalogPanel.tsx` (modify) | `compact` layout. |
| `web/src/rosterDoc.ts` + test (modify) | `fresh` in `newRosterDoc`, `viewPlayers`, `docCounts`. |
| `web/src/components/rosters/RosterPicker.tsx`, `RostersView.tsx` (modify) | New roster action, "from scratch" label. |
| `CHANGELOG.md` (modify) | Unreleased lines. |

Facts an implementer needs:

- Card props (`ProfileModal`): `row: PlayerRow`, `patch: Record<string, number | string>` (draft vocabulary: `overall`, rating keys, `position` id, `devTrait` number, `jerseyNum`, `archetype` id, `firstName`, `lastName`, `college` id, `heightInches`, `weight`, `age`, `bodyType`, `genericHeadName`, `faceAsset`, `skinTone`, `personaDNA` comma-joined ids, `focus` id string), `gearPatch: Record<slot, asset>`, `year`, `archetypeOptions: Record<posName, {id, name}[]>`, `gameVersion`, `onEdit(field, value)`, `onGearEdit(slot, asset)`, `onReset`, `onClose`, `onNavigate(delta)`, `canPrev`, `canNext`, `spoilers`.
- `PlayerRow` fields the card reads: id, firstName, lastName, position, positionId, overall, devTrait, archetype, archetypeName, draftYear, round, wav, combine, twoWay, supplemental, frontSeven, face ('asset' | 'generic' | 'photo'), faceSource, skinTone, genericHead, toneSource, college, age, heightInches, weight, jersey, bodyType, photoUrl, portrait, gamePortrait, persona (trait names), focus (focus name), gear, ratings.
- `PersonaSection` shows `row.persona` names and `row.focus` name; edits are `personaDNA` = comma-joined ids, `focus` = id string. `api.personaLookups()` returns `{ traits: {id, name, label…}[], focus: {id, name, label…}[] }`.
- `AppearanceEditor` edits: `genericHeadName`, `faceAsset`, `skinTone`, `bodyType`.
- The recompute call: `api.recompute({ gameVersion, positionId, archetype, overall, ratings, reconcile })`.
- Roster rows: `PLTY` archetype id, `PCOL` college id, `PHSN` home state id; persona row `DNA0`–`DNA7`, `PRFC`; blob `SKNT`, `GENR`, `ASNM`, `CFNM`, `CLNM`, `HINC`, `WLBS`.
- `LookupService.idToName('archetype' | 'college' | 'state', id)`; `PersonaService.name(id)`, `PersonaService.focusName(id)` (server) for names if needed.

---

### Task 0: Pool positions match the draft

**Files:**
- Modify: `server/src/services/DraftEnrichment.ts`, `server/src/services/PlayerLookupService.ts`
- Test: `server/src/services/__tests__/PoolPositions.test.ts` (new)

**Interfaces:**
- Produces: `positionLabelFor(p: BaselinePlayer, chartLabel?: string | null, pickTeam?: string | null): { label: string; weight: number | null; locked: boolean; frontSeven: FrontSevenInfo | null }` exported from `DraftEnrichment.ts`: the synchronous position steps of `enrichOne` (curated DB entry, front-seven classifier, pre-2001 DB split, heavy-end sack rule) with the weight they used (`nflverse ?? draft table`). `enrichOne` calls it (passing the chart label and pick team) and then applies the combine weight on top exactly as before; `PlayerLookupService.catalog()` calls it with no chart label and resolves `mpos` from its label and weight.

- [ ] **Step 1: Failing test**

`server/src/services/__tests__/PoolPositions.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlayerLookupService } from '../PlayerLookupService';

test('the pool lists players at the position the draft class would give them', () => {
  const cat = PlayerLookupService.catalog();
  const at = (f: string, l: string, year: number) => cat.find((p) => p.first === f && p.last === l && p.year === year)!;
  assert.equal(at('Rod', 'Woodson', 1987).mpos, 'FS');
  assert.ok(['LEDG', 'REDG'].includes(at('Julius', 'Peppers', 2002).mpos), 'Peppers is an edge');
  assert.equal(at('Julius', 'Peppers', 2002).grp, 'EDGE');
  assert.equal(at('Ronnie', 'Lott', 1981).mpos, 'SS');
  assert.equal(at('Lawrence', 'Taylor', 1981).grp, 'EDGE');
});
```

- [ ] **Step 2: Run to see it fail** (`node --import tsx --test src/services/__tests__/PoolPositions.test.ts`; Woodson reads CB, Peppers DT).

- [ ] **Step 3: Factor the helper**

In `DraftEnrichment.ts`, above `enrichOne`:

```ts
/** The position steps of enrichment that need no per-year join, for the pool and the
 *  rating path alike. `chartLabel` (a 2001+ depth-chart slot) and `pickTeam` come from the
 *  year-class join and are absent for the pool. */
export function positionLabelFor(p: BaselinePlayer, chartLabel?: string | null, pickTeam?: string | null): { label: string; weight: number | null; locked: boolean; frontSeven: FrontSevenInfo | null } {
  const curated = CuratedDbPositions.get(p.firstName, p.lastName, p.draftYear);
  const f7 = LB_BUCKET.test(p.position.trim()) || FrontSevenService.pinnedRole(p) ? FrontSevenService.resolve(p, pickTeam) : null;
  const chart = chartLabel && /^(QB|K|P|LS)$/i.test(p.position.trim()) ? null : chartLabel ?? null;
  const dbSplit = !curated && !chart && p.draftYear < 2001 ? PositionMapper.dbByBuild(p.position, p.weight, p.draftYear) : null;
  const nv = NflverseCareerService.get(p.firstName, p.lastName, p.draftYear, nflversePick(p));
  const weight = nv?.weight ?? p.weight ?? null;
  let label = curated ?? chart ?? f7?.label ?? dbSplit ?? p.position;
  const endLabel = /^(DE|LE|RE|E|LDE|RDE|DEFENSIVEEND)$/i.test((label || '').trim());
  if (endLabel && weight != null && weight >= 290 && weight < 300 && nv?.defSacks != null) {
    const seasons = (p.seasonsStarted ?? nv.seasonsStarted ?? null) || (nv.games ? nv.games / 16 : null);
    if (seasons && seasons >= 3 && nv.defSacks / seasons >= 7) label = 'EDGE';
  }
  return { label, weight, locked: !!(curated || chart || f7?.frontSeven?.lock), frontSeven: f7?.frontSeven ?? null };
}
```

`enrichOne` then uses `const pos = positionLabelFor(p, e?.positionLabel, e?.team?.abbr);` in place of its curated / f7 / dbSplit / chartLabel / label / positionLocked lines, sets `out.position = pos.label` (only when it differs from `p.position`), `if (pos.locked) out.positionLocked = true;`, `if (pos.frontSeven) out.frontSeven = pos.frontSeven;`, and keeps its own combine-first weight. The heavy-end rule inside `enrichOne` is removed (the helper has it); the FB/HB nflverse correction stays.

In `PlayerLookupService.catalog()`:

```ts
      const pos = positionLabelFor(p);
      const posId = PositionMapper.resolve(p.firstName, p.lastName, pos.label, pos.weight);
```

(`PlayerLookupService` importing `DraftEnrichment` must not create a cycle that breaks module init: `DraftEnrichment` imports `PlayerLookupService` already. Put `positionLabelFor` in a new `server/src/services/PositionLabel.ts` that imports only `CuratedDbPositions`, `FrontSevenService`, `PositionMapper`, `NflverseCareerService` and `nflversePick` (move `nflversePick` there too, re-exported from `DraftEnrichment`), and import it from both.)

- [ ] **Step 4: Run the whole server suite** (the draft-class tests cover `enrichOne`; positions in generated classes must not change: the year-class snapshot tests will say so). Expected: all pass, plus the new one. Note the catalog build time printed by the test log stays under a few seconds.

- [ ] **Step 5: Commit**

```bash
cd draft-class-generator
git add server/src/services/PositionLabel.ts server/src/services/DraftEnrichment.ts server/src/services/PlayerLookupService.ts server/src/services/CuratedDbPositions.ts server/src/services/__tests__/PoolPositions.test.ts
git commit -m "The pool lists players at the position the draft class gives them; Rod Woodson is a free safety

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 1: Read model and edit fields on the server

**Files:**
- Modify: `server/src/types/roster.ts`, `server/src/services/RosterFileService.ts`, `server/src/services/RosterBuildService.ts`
- Test: `server/src/services/__tests__/RosterFile.test.ts`, `server/src/services/__tests__/RosterBuild.test.ts`

**Interfaces:**
- `RosterPlayer` gains `archetypeId: number; collegeId: number; homeState: number; skinTone: number; personaDNA: number[]; focus: number; face: 'asset' | 'generic'`.
- `PlayerFieldEdit` gains `firstName?, lastName?, college?, heightInches?, weight?, archetype?, personaDNA?, focus?, faceAsset?, skinTone?`.
- `RosterBuildDoc.fresh?: boolean`.

- [ ] **Step 1: Failing tests**

Append to `RosterFile.test.ts`:

```ts
test('the read model carries archetype and college ids, skin tone, persona and the face kind', skipWithoutRoster, async () => {
  const data = await RosterFileService.parse(fs.readFileSync(OFFICIAL), 'ROSTER-Official');
  const geno = data.players.find((p) => p.firstName === 'Geno' && p.lastName === 'Smith')!;
  assert.equal(geno.face, 'asset');
  assert.equal(geno.skinTone, 6);
  assert.deepEqual(geno.personaDNA, [45, 51, 17, 25, 32, 30]);
  assert.equal(geno.focus, 0);
  assert.ok(geno.collegeId > 0 && geno.archetypeId >= 0);
  assert.ok(data.players.every((p) => p.face === 'asset' || p.face === 'generic'));
});
```

Append to `RosterBuild.test.ts`:

```ts
test('the card fields write to the player row, the persona row and the blob', skipWithoutRoster, async () => {
  const base = await RosterFileService.openBase('ROSTER-Official');
  const geno = base.players.find((p) => p.firstName === 'Geno' && p.lastName === 'Smith')!;
  const counts = RosterBuildService.apply(base, {
    baseName: 'ROSTER-Official', name: 'x',
    edits: { [geno.id]: { firstName: 'Eugene', lastName: 'Smithsonian-The-Third-Of-Them', college: 7, heightInches: 78, weight: 240, archetype: 2, personaDNA: [3, 4, 5], focus: 2, genericHead: 'gen_2_T_G_001', skinTone: 2 } },
  }, new Map());
  assert.equal(counts.edited, 1);
  const file = await parseTdb2(splitContainer(RosterFileService.write(base.tdb2, base.header)).payload);
  const row = file.PLAY.records.find((r) => intOf(r, 'PGID') === geno.id)!;
  assert.equal(strOf(row, 'PFNA'), 'Eugene');
  assert.equal(strOf(row, 'PLNA'), 'Smithsonian-The-Third-Of-Them'.slice(0, 20));
  assert.equal(intOf(row, 'PCOL'), 7); assert.equal(intOf(row, 'PLTY'), 2);
  assert.equal(intOf(row, 'PHGT'), 78); assert.equal(intOf(row, 'PWGT'), 80);
  assert.equal(strOf(row, 'PEPS'), 'gen_2_T_G_001', 'a generic head replaces the scan in PEPS');
  const prsn = file.PRSN.records.find((r) => intOf(r, 'PGID') === geno.id)!;
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map((i) => intOf(prsn, `DNA${i}`)), [3, 4, 5, 0, 0, 0, 0, 0]);
  assert.equal(intOf(prsn, 'PRFC'), 2);
  const blob = file.BLOB.records[0].fields.BLBM.value.records.find((r: any) => r.index === geno.id)!;
  assert.equal(strOf(blob, 'CFNM'), 'Eugene'); assert.equal(strOf(blob, 'CLNM'), 'Smithsonian-The-Third-Of-Them'.slice(0, 20));
  assert.equal(intOf(blob, 'HINC'), 78); assert.equal(intOf(blob, 'WLBS'), 240);
  assert.equal(strOf(blob, 'GENR'), 'gen_2_T_G_001'); assert.equal(strOf(blob, 'ASNM'), '');
  assert.equal(intOf(blob, 'SKNT'), 2);
});

test('a face scan edit writes the asset to the row and the blob', skipWithoutRoster, async () => {
  const base = await RosterFileService.openBase('ROSTER-Official');
  const geno = base.players.find((p) => p.firstName === 'Geno' && p.lastName === 'Smith')!;
  RosterBuildService.apply(base, { baseName: 'ROSTER-Official', name: 'x', edits: { [geno.id]: { faceAsset: 'MahomesIIPatrick_12635' } } }, new Map());
  const file = await parseTdb2(splitContainer(RosterFileService.write(base.tdb2, base.header)).payload);
  const row = file.PLAY.records.find((r) => intOf(r, 'PGID') === geno.id)!;
  const blob = file.BLOB.records[0].fields.BLBM.value.records.find((r: any) => r.index === geno.id)!;
  assert.equal(strOf(row, 'PEPS'), 'MahomesIIPatrick_12635');
  assert.equal(strOf(blob, 'ASNM'), 'MahomesIIPatrick_12635');
  assert.equal(strOf(blob, 'GENR'), 'gen_6_T_G_005', 'the generic head stays');
});

test('a fresh roster keeps only the added players', skipWithoutRoster, async () => {
  const base = await RosterFileService.openBase('ROSTER-Official');
  const baseIds = new Set(base.players.map((p) => p.id));
  const bears = base.teams.find((t) => t.abbr === 'CHI')!;
  const payton = await RosterAddService.generate('1975|NFL|walter|payton|4');
  const counts = RosterBuildService.apply(base, { baseName: 'ROSTER-Official', name: 'x', fresh: true, adds: [{ tempId: 'a', key: payton.key, teamId: bears.id }] }, new Map([[payton.key, payton]]));
  assert.equal(counts.added, 1);
  const file = await parseTdb2(splitContainer(RosterFileService.write(base.tdb2, base.header)).payload);
  assert.equal(file.PLAY.records.length, 1);
  for (const t of ['PRSN', 'PLCT', 'DCHT', 'INJY']) assert.ok(!file[t].records.some((r: any) => baseIds.has(intOf(r, 'PGID'))), `${t} has no base rows`);
  const blobs = file.BLOB.records[0].fields.BLBM.value.records;
  assert.equal(blobs.length, 1);
  assert.equal(file.TEAM.records.length, 33);
  assert.ok(intOf(file.PLAY.records[0], 'PGID') > Math.max(...baseIds));
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd server && node --import tsx --test src/services/__tests__/RosterFile.test.ts src/services/__tests__/RosterBuild.test.ts`
Expected: the four new tests FAIL.

- [ ] **Step 3: Types**

`server/src/types/roster.ts`, `PlayerFieldEdit`:

```ts
  firstName?: string; lastName?: string;
  college?: number;      // college id
  heightInches?: number; weight?: number;
  archetype?: number;    // archetype id
  personaDNA?: number[]; // up to 8 trait ids; empty slots are 0
  focus?: number;        // 0..3
  faceAsset?: string;    // a face-scan asset the game ships (sets PEPS and the blob's ASNM)
  skinTone?: number;     // 1..8
```

`RosterBuildDoc`: `fresh?: boolean; // remove every base player before adding yours`.

- [ ] **Step 4: Read model**

In `RosterFileService.ts` `RosterPlayer` add `archetypeId: number; collegeId: number; homeState: number; skinTone: number; personaDNA: number[]; focus: number; face: 'asset' | 'generic';`. `buildPlayers` builds `const persona = new Map(file.PRSN.records.map((r) => [intOf(r, 'PGID'), r]))` and passes the row; `buildPlayer(r, teamById, faId, blob, prsn)` sets:

```ts
    archetypeId: intOf(r, 'PLTY'),
    collegeId: intOf(r, 'PCOL'),
    homeState: intOf(r, 'PHSN'),
    skinTone: blob ? Math.max(1, Math.min(8, intOf(blob, 'SKNT', 4))) : 4,
    personaDNA: prsn ? [0, 1, 2, 3, 4, 5, 6, 7].map((i) => intOf(prsn, `DNA${i}`)).filter((v) => v > 0) : [],
    focus: prsn ? intOf(prsn, 'PRFC') : 0,
    face: asset && !/^gen_/i.test(asset) ? 'asset' : 'generic',
```

- [ ] **Step 5: Edits**

In `RosterBuildService.applyEdit`, after the jersey line:

```ts
  if (e.firstName != null) { setStr(row, 'PFNA', String(e.firstName).slice(0, 16)); touched = true; }
  if (e.lastName != null) { setStr(row, 'PLNA', String(e.lastName).slice(0, 20)); touched = true; }
  if (e.college != null && Number.isFinite(e.college)) { setInt(row, 'PCOL', Math.max(0, Math.round(e.college))); touched = true; }
  if (e.archetype != null && Number.isFinite(e.archetype)) { setInt(row, 'PLTY', Math.max(0, Math.round(e.archetype))); touched = true; }
  if (e.heightInches != null) { setInt(row, 'PHGT', Math.max(60, Math.min(84, Math.round(e.heightInches)))); touched = true; }
  if (e.weight != null) { setInt(row, 'PWGT', Math.max(0, Math.min(240, Math.round(e.weight) - 160))); touched = true; }
```

and after `const blob = blobRow(base, pgid);`:

```ts
  if (blob) {
    if (e.firstName != null) setStr(blob, 'CFNM', String(e.firstName).slice(0, 16));
    if (e.lastName != null) setStr(blob, 'CLNM', String(e.lastName).slice(0, 20));
    if (e.heightInches != null) setInt(blob, 'HINC', Math.max(60, Math.min(84, Math.round(e.heightInches))));
    if (e.weight != null) setInt(blob, 'WLBS', Math.max(160, Math.min(400, Math.round(e.weight))));
    if (e.skinTone != null) setInt(blob, 'SKNT', Math.max(1, Math.min(8, Math.round(e.skinTone))));
    if (e.faceAsset && !/^gen_/i.test(e.faceAsset)) { setStr(row, 'PEPS', e.faceAsset); setStr(blob, 'ASNM', e.faceAsset); touched = true; }
  }
  if (e.personaDNA || e.focus != null) {
    const prsn = base.tdb2.PRSN.records.find((r) => intOf(r, 'PGID') === pgid);
    if (!prsn) skipped.push(`edit: no persona row for ${pgid}`);
    else {
      if (e.personaDNA) { const ids = [...new Set(e.personaDNA.map((n) => Math.round(Number(n))).filter((n) => n >= 1 && n <= 63))].slice(0, 8); for (let i = 0; i < 8; i++) setInt(prsn, `DNA${i}`, ids[i] ?? 0); touched = true; }
      if (e.focus != null && [0, 1, 2, 3].includes(Math.round(e.focus))) { setInt(prsn, 'PRFC', Math.round(e.focus)); touched = true; }
    }
  }
```

Change the generic-head branch to also set `PEPS` to the head and clear `ASNM`:

```ts
  if (e.genericHead) {
    if (/^gen_\d/i.test(e.genericHead) && blob) { setStr(blob, 'GENR', e.genericHead); setStr(row, 'PEPS', e.genericHead); setStr(blob, 'ASNM', ''); touched = true; }
    else skipped.push(`edit: bad generic head ${e.genericHead} for ${pgid}`);
  }
```

(When both `genericHead` and `faceAsset` are present, the scan wins: apply `faceAsset` after the generic-head branch.)

Fresh rosters in `apply`, after the adds loop and before the edits loop:

```ts
    if (doc.fresh) {
      const baseIds = new Set(base.players.filter((p) => !idOfTemp.has(String(p.id)) && ![...idOfTemp.values()].includes(p.id)).map((p) => p.id));
      // Adds were appended above with ids past the base maximum; everything the base file had goes.
      const keepRow = (r: Tdb2Record) => !baseIds.has(intOf(r, 'PGID'));
      for (const t of [base.tdb2.PLAY, base.tdb2.PRSN, base.tdb2.PLCT, base.tdb2.DCHT, base.tdb2.INJY]) {
        if (!t) continue;
        const keep = t.records.filter(keepRow);
        t.records.length = 0; t.records.push(...keep); t.numEntries = keep.length;
      }
      const blobs: Tdb2Table = base.tdb2.BLOB.records[0].fields.BLBM.value;
      const keepBlobs = blobs.records.filter((r) => !baseIds.has(r.index));
      blobs.records.length = 0; blobs.records.push(...keepBlobs); blobs.numEntries = keepBlobs.length;
      base.players = base.players.filter((p) => !baseIds.has(p.id));
      counts.moved = 0; counts.cut = 0;
    }
```

Simplify `baseIds`: capture `const baseIds = new Set(base.players.map((p) => p.id))` at the top of `apply`, before any add pushes into `base.players`. Moves in a fresh document only apply to adds (the UI never produces others); a move for a removed id is skipped with a message.

- [ ] **Step 6: Run the server suite, commit**

Run: `cd server && npm test && npm run typecheck` (expected: all pass; 320 + 4).

```bash
cd draft-class-generator
git add server/src/types/roster.ts server/src/services/RosterFileService.ts server/src/services/RosterBuildService.ts server/src/services/__tests__/RosterFile.test.ts server/src/services/__tests__/RosterBuild.test.ts
git commit -m "Roster edits cover names, college, build, archetype, persona and face; fresh rosters drop the base players

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Gate 4 and Gate 5 scripts

**Files:**
- Create: `server/scripts/roster-gate4.ts`, `server/scripts/roster-gate5.ts`

- [ ] **Step 1: Gate 4**

```ts
/**
 * Gate 4: the card's new edits on a base player, plus a pool player with a chosen generic
 * head, written as ROSTER-GATE4.
 *
 *   npx tsx scripts/roster-gate4.ts
 *
 * In Madden 27, load ROSTER-GATE4, Jets: "Eugene Smithson" QB (was Geno Smith) at 6'6" 240
 * from Alabama, archetype changed, with Patrick Mahomes's face and a new Persona; Bears:
 * Walter Payton with head gen_1_T_G_001.
 */
import { RosterFileService } from '../src/services/RosterFileService';
import { RosterBuildService } from '../src/services/RosterBuildService';
import { LookupService } from '../src/services/LookupService';

async function main() {
  const base = await RosterFileService.openBase('ROSTER-Official');
  const geno = base.players.find((p) => p.firstName === 'Geno' && p.lastName === 'Smith')!;
  const bears = base.teams.find((t) => t.abbr === 'CHI')!;
  const alabama = LookupService.nameToId('college', 'Alabama') ?? geno.collegeId;
  const result = await RosterBuildService.build({
    baseName: 'ROSTER-Official', name: 'GATE4',
    adds: [{ tempId: 'p', key: '1975|NFL|walter|payton|4', teamId: bears.id }],
    edits: {
      [geno.id]: { firstName: 'Eugene', lastName: 'Smithson', college: alabama, heightInches: 78, weight: 240, archetype: geno.archetypeId === 0 ? 1 : 0, personaDNA: [3, 4, 5], focus: 2, faceAsset: 'MahomesIIPatrick_12635' },
      p: { genericHead: 'gen_1_T_G_001', skinTone: 1 },
    },
  });
  console.log(result);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Check the head name exists in `api.genericHeads('m27')`'s tone-1 pool (`server/data/lookups`, generic heads file) and replace it with the first entry if not.

- [ ] **Step 2: Gate 5**

```ts
/**
 * Gate 5: a roster from scratch. Every base player removed, one team (Bears) filled with
 * 53 pool players, the other 31 empty. Written as ROSTER-GATE5.
 *
 *   npx tsx scripts/roster-gate5.ts
 *
 * In Madden 27, load ROSTER-GATE5: the Bears have 53 players, everyone else nobody, free
 * agency empty. Then Play Now, Bears against any team, and note whether the game allows it.
 */
import { RosterFileService } from '../src/services/RosterFileService';
import { RosterBuildService } from '../src/services/RosterBuildService';
import { PlayerLookupService } from '../src/services/PlayerLookupService';

const WANT: [string, number][] = [['QB', 3], ['HB', 4], ['FB', 1], ['WR', 6], ['TE', 3], ['OL', 9], ['EDGE', 4], ['IDL', 4], ['LB', 6], ['CB', 6], ['S', 4], ['K', 1], ['P', 1], ['LS', 1]];

async function main() {
  const base = await RosterFileService.openBase('ROSTER-Official');
  const bears = base.teams.find((t) => t.abbr === 'CHI')!;
  const cat = PlayerLookupService.catalog().filter((p) => p.year >= 1980 && p.year <= 2010).sort((a, b) => b.cal - a.cal);
  const adds = [];
  for (const [grp, n] of WANT) for (const p of cat.filter((p) => p.grp === grp).slice(0, n)) adds.push({ tempId: `t${adds.length}`, key: p.key, teamId: bears.id });
  const result = await RosterBuildService.build({ baseName: 'ROSTER-Official', name: 'GATE5', fresh: true, adds });
  console.log(result, 'players on the Bears:', adds.length);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Run both, commit**

Run: `cd server && npx tsx scripts/roster-gate4.ts && npx tsx scripts/roster-gate5.ts`
Expected: ROSTER-GATE4 with `edited: 2, added: 1`; ROSTER-GATE5 with `added: 53`.

```bash
cd draft-class-generator
git add server/scripts/roster-gate4.ts server/scripts/roster-gate5.ts
git commit -m "Gate 4 and 5 scripts: card edits on a base player; a roster from scratch

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Tell the user both files are ready; the web tasks continue meanwhile.

---

### Task 3: Web types, document flag and the card adapter

**Files:**
- Modify: `web/src/types.ts`, `web/src/api.ts`, `web/src/rosterDoc.ts`, `web/src/rosterDoc.test.ts`
- Create: `web/src/rosterCard.ts`, `web/src/rosterCard.test.ts`

**Interfaces:**
- `web/src/api.ts` `PlayerFieldEdit`: the server's new fields. `rosterBuild` body gains `fresh: boolean`.
- `web/src/types.ts` `RosterPlayer`: the read model's new fields; `RosterDoc.fresh: boolean`; `GeneratedRosterPlayer` unchanged.
- `rosterDoc.ts`: `newRosterDoc(data, fromSaves, fresh = false)`; `viewPlayers` returns no base rows when `doc.fresh`; `docCounts` reports `moved: 0, cut: 0` for fresh docs.
- `rosterCard.ts`:

```ts
export interface CardCtx { traits: PersonaTrait[]; focus: PersonaFocusOption[]; colleges: { id: number; name: string }[]; archetypes: Record<string, ArchetypeOption[]> }
/** The card's row for a roster player (base or added) with no edits applied: edits ride in the patch. */
export function rowFor(p: RosterPlayer, ctx: CardCtx, draftYearHint?: number): PlayerRow
/** A roster edit as the card's patch (draft vocabulary). */
export function patchFor(e: PlayerFieldEdit | undefined, base: RosterPlayer): Record<string, number | string>
/** One card edit as a roster patch to merge with withEdit. Unknown fields return null. */
export function editFromCard(field: string, value: number | string): PlayerFieldEdit | null
```

Mapping (`rowFor`): `id`, `pick: 0`, names, `position`/`positionId`, `overall`, `devTrait`, `archetype: p.archetypeId`, `archetypeName: p.archetype ?? ''`, `draftYear: draftYearHint ?? (2026 - p.yearsPro)`, `round: p.draftRound`, `draftPick: p.draftPick`, `wav: null`, `wavSource: 'preset'`, `face: p.face`, `skinTone`, `genericHead: p.visuals.genericHead || null`, `college: p.college ?? ''`, `age`, `heightInches`, `weight`, `jersey`, `bodyType: p.visuals.bodyType || 'Standard'`, `photoUrl: null`, `portrait: p.portrait`, `gamePortrait: p.portrait`, `persona: p.personaDNA.map((id) => ctx.traits.find((t) => t.id === id)?.name ?? \`#${id}\`)`, `focus: ctx.focus.find((f) => f.id === p.focus)?.name`, `gear: { helmet: p.visuals.helmet, facemask: p.visuals.facemask }` (empty values dropped), `ratings: p.ratings`.

`patchFor`: `overall`, rating keys, `position` → `POS_NAMES.indexOf(e.position)`, `dev` → `DEV_KEY`, `jersey` → `jerseyNum`, `age`, `heightInches`, `weight`, `firstName`, `lastName`, `college`, `archetype`, `bodyType`, `genericHead` → `genericHeadName`, `faceAsset`, `skinTone`, `personaDNA` → joined with commas, `focus` → `String(focus)`.

`editFromCard`: the inverse, one field at a time; rating keys become `{ ratings: { [k]: v } }`; `position` id → label; `devTrait` number → name; `jerseyNum` → `jersey`; `genericHeadName` → `genericHead`; `personaDNA` string → `number[]`; `focus` string → number; unknown → `null`.

- [ ] **Step 1: Tests**

`web/src/rosterCard.test.ts` covers: a base player row (face, persona names via a two-trait ctx, focus name, gear without empties, draftYear from yearsPro); `patchFor` with every field set; `editFromCard` round-trips for `position`, `devTrait`, `jerseyNum`, `genericHeadName`, `personaDNA` ('3,4' → [3, 4]), `focus` ('2' → 2), a rating key, and returns `null` for `nonsense`. Extend `rosterDoc.test.ts` with a fresh document: `viewPlayers` has no base rows and `docCounts` reports zero moves after a `withMove` attempt.

- [ ] **Step 2: Implement, run `node --import tsx --test "src/**/*.test.ts"` and `npm run typecheck`, commit**

```bash
cd draft-class-generator
git add web/src/types.ts web/src/api.ts web/src/rosterDoc.ts web/src/rosterDoc.test.ts web/src/rosterCard.ts web/src/rosterCard.test.ts
git commit -m "Roster card adapter and the fresh-roster document flag

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The card in the builder

**Files:**
- Modify: `web/src/components/ProfileModal.tsx`, `web/src/components/rosters/RosterBuilder.tsx`

- [ ] **Step 1: `mode` on the card**

`ProfileModal` gains `mode?: 'draft' | 'roster'` (default `'draft'`) and `footer?: string`. In roster mode: the jump-nav omits Scouting; the scouting block (radar) still renders under Ratings (it is useful) but the combine block, the `wAV` and `Rd` fragments of the bio line, and the Unverified-tone pill are skipped; `spoilers` is forced true; the footer text is `footer ?? 'Edits save automatically & apply to the .mdc export.'`; navigation tooltips say "Previous player" / "Next player".

- [ ] **Step 2: Replace the drawer**

In `RosterBuilder.tsx`: load `ctx` once (`api.personaLookups()`, `api.lookup('college')`, `api.archetypesByPosition()`); keep `editing` (a view id) and add `navList: 'roster' | 'team'` set by whichever list was clicked; `navigatePlayer(delta)` moves within `rows` (Roster tab) or the selected team's players in position order (team panel). Render:

```tsx
{editingPlayer && editingBase && editKey != null && (
  <ProfileModal
    mode="roster"
    footer="Edits save with the roster and apply on export."
    row={rowFor(editingBase, ctx)}
    patch={patchFor(doc.edits[editKey], editingBase)}
    gearPatch={doc.edits[editKey]?.gear ?? {}}
    year={2026}
    archetypeOptions={ctx.archetypes}
    gameVersion="m27"
    onEdit={(f, v) => { const e = editFromCard(f, v); if (e) edit(editKey, e); }}
    onGearEdit={(slot, asset) => edit(editKey, { gear: { [slot]: asset } })}
    onReset={() => { if (!readOnly) onChange(withoutEdits(doc, editKey)); }}
    onClose={() => setEditing(null)}
    onNavigate={navigatePlayer}
    canPrev={navIndex > 0}
    canNext={navIndex >= 0 && navIndex < navRows.length - 1}
  />
)}
```

where `editingBase` is the base `RosterPlayer` for a base player or `playerFromPreview(g, addId(tempId), teamId, jersey)` for an add. Delete the drawer JSX and the `PlayerEditPanel` import from the builder (the franchise editor still uses the panel). Read-only rosters pass edit handlers that do nothing.

- [ ] **Step 3: Typecheck and preview**

Open ROSTER-Official, click Geno Smith: the card opens with his portrait, persona names, gear pills; rename him, change college, height, archetype, pick a generic head in the appearance editor, add a persona trait; the header counts 1 edited; arrows walk the list; Escape closes. Open the same on an added pool player. Export: the banner reports the edit.

- [ ] **Step 4: Commit**

```bash
cd draft-class-generator
git add web/src/components/ProfileModal.tsx web/src/components/rosters/RosterBuilder.tsx
git commit -m "Roster players open in the draft editor's profile card, everything editable

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Pool tab compact layout

**Files:**
- Modify: `web/src/components/CatalogPanel.tsx`, `web/src/components/rosters/RosterBuilder.tsx`

- [ ] **Step 1: `compact` mode**

`CatalogPanel` gains `compact?: boolean`. When set: the toolbar is search, position group, an era select (`ALL`, `1930`, `1940` … `2020`, applied as `year >= era && year < era + 10`), the HOF checkbox and a sort select (`cal` Career, `name`, `year`, `pos`); the list renders rows instead of a table:

```tsx
<div className="flex items-center gap-2.5 border-b border-border/60 px-3 py-1.5 text-sm hover:bg-surface-2/70">
  <Portrait src={headshot(p)} fallback={headshotFallback(p)} size="xs" />
  <span className="min-w-0 flex-1 truncate font-medium text-neutral-100">{p.first} {p.last}{p.hof && <span className="ml-1 rounded bg-gold/15 px-1 text-[10px] font-semibold text-gold">HOF</span>}</span>
  <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-neutral-300">{p.mpos}</span>
  <span className="w-20 text-right text-xs tabular-nums text-neutral-400">{p.year}{p.round != null ? ` · Rd ${p.round}` : ''}</span>
  <span className="w-8 rounded bg-surface-2 px-1 py-0.5 text-center text-xs font-semibold tabular-nums text-neutral-200" title="Career score">{p.cal}</span>
  {st ? <span className="w-12 rounded-md border border-success/40 bg-success/10 px-1.5 py-0.5 text-center text-xs text-success" title={st.title}>{st.label}</span>
      : <button onClick={() => onAdd(p.key)} disabled={addDisabled} className="w-12 rounded-md border border-primary/50 bg-primary/10 px-1.5 py-0.5 text-xs text-primary hover:bg-primary/20 disabled:opacity-40">Add</button>}
</div>
```

The Class Studio passes nothing and keeps the table.

- [ ] **Step 2: Builder**

Pass `compact` to the Pool tab's `CatalogPanel`.

- [ ] **Step 3: Typecheck, preview (rows and toolbar fit the half-width panel with no horizontal scroll at 1280px), commit**

```bash
cd draft-class-generator
git add web/src/components/CatalogPanel.tsx web/src/components/rosters/RosterBuilder.tsx
git commit -m "Pool tab: compact rows and a single toolbar

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: New roster from scratch

**Files:**
- Modify: `web/src/components/rosters/RosterPicker.tsx`, `web/src/components/rosters/RostersView.tsx`, `web/src/components/rosters/RosterBuilder.tsx`, `web/src/components/rosters/TeamPanel.tsx`, `CHANGELOG.md`

- [ ] **Step 1: Picker**

A "New roster" button in the "Start from a roster" card header (right side): `onNew()` → `RostersView` opens `ROSTER-Official` via `api.rosterOpenSaved` and calls `newRosterDoc(data, true, true)`. Saved rosters with `fresh` show "from scratch" instead of `from <file>`.

- [ ] **Step 2: Builder and team panel**

For `doc.fresh`: the header shows "from scratch" in place of the base file name; the counts line omits moved and cut; the Roster tab lists nothing and shows "Nothing here yet. Add players from the Pool tab."; the team panel's empty text says the same; export sends `fresh: doc.fresh`.

- [ ] **Step 3: CHANGELOG**

Under Unreleased → Features:

```markdown
- Roster players open in the same profile card as the draft editor, with names, college, build, archetype, persona and face editable.
- Rosters can be built from scratch: empty teams, filled entirely from the player pool.
- The Pool tab is a compact list with one toolbar.
```

(Create `## Unreleased` above `## 1.4.0` with a `### Features` heading.)

- [ ] **Step 4: Typecheck, web tests, preview (New roster → empty chips → add three pool players to two teams → export names ROSTER-… with `added: 3`), commit**

```bash
cd draft-class-generator
git add web/src/components/rosters/RosterPicker.tsx web/src/components/rosters/RostersView.tsx web/src/components/rosters/RosterBuilder.tsx web/src/components/rosters/TeamPanel.tsx CHANGELOG.md
git commit -m "Rosters from scratch: empty teams filled from the pool

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Report to the user with the Gate 4 and Gate 5 files to check.

---

## Self-review notes

- Spec coverage: card open/navigate/hidden blocks/editable fields/data/vocabulary/server writes/adds (Tasks 1, 3, 4); Pool compact (Task 5); fresh rosters entry/builder/export/Gate 5 (Tasks 1, 2, 6); tests as listed; Gate 4 (Task 2).
- Type consistency: `PlayerFieldEdit` fields identical on both sides; `RosterPlayer` new fields identical; `rowFor`/`patchFor`/`editFromCard` names used in Task 4 as defined in Task 3; `fresh` on both `RosterDoc` and `RosterBuildDoc`.
- Risk flagged: `faceAsset` on a base player replaces his scan; the card's appearance editor only offers scans the game ships, which is the point.
