# Roster Pool Adds and Gate 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add players from the app's historic pool to a roster being built: a Pool tab in the Rosters view, a preview route that rates the player, and a build path that clones template rows for him, gated on an in-game check of one player with a face scan and one with a generic head.

**Architecture:** `RosterAddService` turns a catalog key into a rated Madden 27 player through the same pipeline the draft-class export uses (`boardClass` for enrichment, `DraftClassBuilder.buildProspects` under the Career lens, `PersonaService` for DNA), then `RosterBuildService` clones a same-position template player's rows (PLAY, PRSN, PLCT, BLBM blob) and overwrites identity, bio, ratings, team, persona and visuals. The web gains `withAdd`/`withoutAdd`/`withAddMove` in `rosterDoc.ts`, a `CatalogPanel` extracted from the Class Studio, and a Pool tab in the builder whose Add button previews the player and places him on the selected team. Added players show in the team panel with a tag and can be moved, removed and edited like anyone else.

**Tech Stack:** as the previous two plans (TypeScript, Express, node:test, React 18, Tailwind 4, idb-keyval).

**Spec:** `docs/superpowers/specs/2026-09-16-roster-builder-design.md` (phase 4). Previous plans: `2026-09-16-roster-writer-and-build.md` (done), `2026-09-16-rosters-view.md` (done).

## Global Constraints

- A pool player is rated under the Career lens (`mode: 'retro'`) with `gameVersion: 'm27'`. Age is his draft age plus four (clamped 22–40), years pro four; both editable afterwards.
- New player ids are `max(PGID) + 1` counting up; `POID` = `PGID`; the blob record's index and `CNID` = `PGID`.
- The template is the base roster's median-overall player at the same position; if the position has nobody, the median player of the whole roster.
- A player with a face scan the game ships writes `PEPS` = asset name and blob `ASNM` = asset name; a player without one writes `PEPS` = generic head name and blob `ASNM` = '' (this is how the game itself writes created players; verified in a game-saved community roster).
- No depth-chart rows are written for added players; the game rebuilds them on load (Gate 2 showed this for moves).
- The contract clone is the base roster's cheapest one-year contract row (lowest `PSA0` with `PCON` 1) with `PGID` replaced; `PCSA`, `PTSA` and `PVTS` on PLAY are set to that row's `PSA0`.
- Persona: `DNA0`–`DNA4` from `PersonaService.dnaFor`, `DNA5`–`DNA7` zero, `PRFC` = `focusFor(seed)` (0–3).
- `PCMT` is the announcer surname id: `commentaryIdFor(lastName)` (verified: Smith 4600, Mahomes 6585).
- Added players' edits are keyed by their `tempId` in the document and applied after the row exists.
- Every `git add` names explicit files. Run web commands from `draft-class-generator/web`, server from `draft-class-generator/server`, git from `draft-class-generator`.

## File Structure

| File | Responsibility |
|---|---|
| `server/src/services/Tdb2Engine.ts` (modify) | `cloneRecord(rec)`: deep copy of a record, subtables included, without the parser's Proxy. |
| `server/src/services/RosterAddService.ts` (new) | `generate(key)`: catalog key → `GeneratedRosterPlayer`; in-memory cache of the last 200. |
| `server/src/services/RosterBuildService.ts` (modify) | Adds: template choice, row cloning, field writes, then the add's own edits. `ApplyCounts.added`. |
| `server/src/types/roster.ts` (modify) | `AddedPlayer`, `RosterBuildDoc.adds`, `GeneratedRosterPlayer`, `ApplyCounts.added`. |
| `server/src/routes/roster.ts` (modify) | `POST /roster/preview-add`; build passes `adds`. |
| `server/scripts/roster-gate3.ts` (new) | Writes ROSTER-GATE3 with one scan player and one generic-head player. |
| `web/src/types.ts`, `web/src/api.ts` (modify) | `GeneratedRosterPlayer`, `api.rosterPreviewAdd(key)`, build body with `adds`. |
| `web/src/rosterDoc.ts` + test (modify) | `withAdd`, `withoutAdd`, `withAddMove`, `addId`, `viewPlayers(doc, data, previews)` including adds, counts. |
| `web/src/components/CatalogPanel.tsx` (new) | The pool browser (filters, sort, table, Add) extracted from `ClassStudio`. |
| `web/src/components/ClassStudio.tsx` (modify) | Uses `CatalogPanel`. |
| `web/src/components/rosters/RosterBuilder.tsx`, `TeamPanel.tsx`, `RostersView.tsx` (modify) | Pool tab, previews, added rows (tag, Remove), export with adds, preview reload for saved rosters. |
| `CHANGELOG.md` (modify) | One Unreleased line. |

Facts an implementer needs (beyond the previous plans' notes):

- `boardClass(board, { fill: false })` in `DraftEnrichment.ts` takes `[{ key }]` and returns enriched `BaselinePlayer`s (`players`) plus `missing: string[]`. `DraftClassBuilder.buildProspects(players, 'retro', {}, 'm27').prospects[0]` is an `MdcProspect` (`Record<string, unknown>`) with: `firstName`, `lastName`, `position` (id 0–21), `archetype` (id), `college` (id), `homeState` (id), `homeTown`, `age`, `heightInches`, `weight` (pounds), `jerseyNum`, `bodyType` (Standard…Heavy), `draftRound` (63 = undrafted), `draftPick` (within-round), `overall`, `devTrait`, `PEPS` (asset name, or `gen_…` for a generic head), `PID`, `commentaryId`, `visuals: { loadouts: [{ loadoutType: 'PlayerOnField', loadoutElements: [{ slotType, itemAssetName }] }], genericHeadName?, skinTone? }`, and one number per rating key (`prospect.speed`, … the 54 `RATING_KEYS`).
- `gearSlots(prospect)` (exported from `DraftClassBuilder.ts`) flattens the on-field loadout into editor slots (helmet, facemask, gloveLeft, …); `GEAR_SLOT_TYPES[slot]` gives the slotType names and `SLOT_ID[slotType]` (RosterBuildService) the blob SLOT ids.
- `PersonaService.dnaFor(seedKey, group, overall, devTrait): number[]` (up to 5 ids); `focusFor(seedKey): number` and `commentaryIdFor(lastName): number` are exported from `M27Fields.ts`; `PositionMapper.groupFromId(id)`; `LikenessService.generic(player, index, 'm27')` returns `{ peps, skinTone }` for a tone-matched generic head.
- Catalog keys look like `1975|NFL|walter|payton|4`; `PlayerLookupService.catalog()` lists `{ key, first, last, year, mpos, … }`. Known keys: Walter Payton `1975|NFL|walter|payton|4`, Barry Sanders `1989|NFL|barry|sanders|3`, Joe Montana `1979|NFL|joe|montana|82`.
- Roster blob per player (index = PGID): `ASNM`, `CFNM`, `CLNM`, `CJNO`, `CNID`, `GENR`, `HINC` (inches), `WLBS` (pounds), `SKNT` (1–8), `USKT`, `LOUT` → records with `LDCT` 5 (body PINS: SLOT 129 `<Body>_BodyType`) and `LDTY` 1 (on-field PINS: `ITAN` + `SLOT`; facemask has no SLOT).
- PLAY rows have `PCSA`/`PTSA`/`PVTS` equal to the contract's `PSA0` (Geno: 330); the cheapest contract in ROSTER-Official is `PCON 1, PSA0 20, PSB0 133`.
- `TDB2Table.addRecord(rec)` pushes and bumps `numEntries`; type-5 tables (BLBM) refuse a duplicate `index`. The writer sorts type-5 records by index.
- The parser wraps table records in a Proxy whose `get` returns a field's value for a field name and the record's own property otherwise; `rec.fields` still returns the fields map, so the engine helpers work on both proxied and plain records.

---

### Task 1: `cloneRecord` in the engine

**Files:**
- Modify: `server/src/services/Tdb2Engine.ts`
- Test: `server/src/services/__tests__/Tdb2Engine.test.ts`

**Interfaces:**
- Produces: `cloneRecord(rec: Tdb2Record): Tdb2Record` — a plain (non-Proxy) deep copy: every field's `key`, `type`, `rawKey`, `raw`, `length`, `isChanged`, `isDefaulted`; subtable fields (types 4 and 5) get a new table with the same `name`, `type`, `unknown1`, `unknown2`, `rawKey`, `numEntriesRaw`, `isSubTable`, `fieldDefinitions` and cloned records; `index` and `subRecord` (cloned) carried over.

- [ ] **Step 1: Write the failing test**

Append to `Tdb2Engine.test.ts`:

```ts
import { cloneRecord } from '../Tdb2Engine';

test('cloneRecord copies fields and subtables so edits to the clone leave the source alone', skipWithoutRoster, async () => {
  const file = await parseTdb2(payloadOf(OFFICIAL));
  const src = file.PLAY.records[0];
  const copy = cloneRecord(src);
  assert.notEqual(copy, src);
  assert.equal(intOf(copy, 'PGID'), intOf(src, 'PGID'));
  setInt(copy, 'POVR', 12);
  assert.notEqual(intOf(src, 'POVR'), 12, 'source untouched');
  assert.equal(intOf(copy, 'POVR'), 12);
  const blob = file.BLOB.records[0].fields.BLBM.value.records[0];
  const b2 = cloneRecord(blob);
  const pinsSrc = blob.fields.LOUT.value.records[1].fields.PINS.value;
  const pinsCopy = b2.fields.LOUT.value.records[1].fields.PINS.value;
  assert.notEqual(pinsCopy, pinsSrc);
  assert.equal(pinsCopy.records.length, pinsSrc.records.length);
  setStr(pinsCopy.records[0], 'ITAN', 'Changed_Thing');
  assert.notEqual(strOf(pinsSrc.records[0], 'ITAN'), 'Changed_Thing');
  assert.equal(b2.index, blob.index);
});
```

(Move the `import { cloneRecord }` line up to join the existing import from `'../Tdb2Engine'`.)

- [ ] **Step 2: Run it to see it fail**

Run: `cd server && node --import tsx --test src/services/__tests__/Tdb2Engine.test.ts`
Expected: FAIL, `cloneRecord` is not exported.

- [ ] **Step 3: Implement**

In `Tdb2Engine.ts` add `const TDB2Table = require('../vendor/tdb2/TDB2Table');` next to the other requires, and:

```ts
function cloneField(f: Tdb2Field): Tdb2Field {
  const c = new TDB2Field();
  c.key = f.key; c.type = f.type; c.rawKey = Buffer.from(f.rawKey);
  c.length = f.length;
  if (f.raw) c.raw = Buffer.from(f.raw);
  if ((f.type === FIELD_SUBTABLE || f.type === FIELD_SUBTABLE_COMPRESSED) && f.value) c.value = cloneTable(f.value as Tdb2Table);
  c.isChanged = f.isChanged;
  c.isDefaulted = !!f.isDefaulted;
  return c;
}

function cloneTable(t: Tdb2Table): Tdb2Table {
  const c = new TDB2Table();
  c.name = t.name; c.type = t.type; c.unknown1 = t.unknown1; c.unknown2 = t.unknown2;
  c.rawKey = (t as any).rawKey; c.numEntriesRaw = (t as any).numEntriesRaw;
  (c as any).isSubTable = (t as any).isSubTable;
  c.fieldDefinitions = t.fieldDefinitions;
  for (const r of t.records) c.records.push(cloneRecord(r));
  return c;
}

/** A plain deep copy of a record (no parser Proxy), subtables and sub-record included. */
export function cloneRecord(rec: Tdb2Record): Tdb2Record {
  const c = new TDB2Record();
  c.index = rec.index;
  for (const [k, f] of Object.entries(rec.fields)) c.fields[k] = cloneField(f);
  if (rec.subRecord) c.subRecord = cloneRecord(rec.subRecord);
  return c;
}
```

`Tdb2Table` needs `rawKey: Buffer; numEntriesRaw: Buffer; isSubTable: boolean;` added to its interface so the casts go away; add them.

- [ ] **Step 4: Run the tests, commit**

Run: `cd server && node --import tsx --test src/services/__tests__/Tdb2Engine.test.ts && npm run typecheck`
Expected: all pass.

```bash
cd draft-class-generator
git add server/src/services/Tdb2Engine.ts server/src/services/__tests__/Tdb2Engine.test.ts
git commit -m "Tdb2Engine.cloneRecord: a plain deep copy of a roster record

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: RosterAddService — a pool player rated for a roster

**Files:**
- Create: `server/src/services/RosterAddService.ts`
- Modify: `server/src/types/roster.ts`
- Test: `server/src/services/__tests__/RosterAdd.test.ts`

**Interfaces:**
- Produces: `RosterAddService.generate(key: string): Promise<GeneratedRosterPlayer>` (throws `player <key> is not in the pool`), `RosterAddService._reset()`.
- Types added to `server/src/types/roster.ts`:

```ts
export interface AddedPlayer { tempId: string; key: string; teamId: number; jersey?: number }

/** A pool player rated for a roster: everything the build needs to clone him in, and the UI needs to show him. */
export interface GeneratedRosterPlayer {
  key: string;
  firstName: string; lastName: string;
  positionId: number; position: string;
  archetypeId: number; archetype: string | null;
  collegeId: number; college: string | null;
  hometown: string; homeStateId: number;
  age: number; yearsPro: number; heightInches: number; weight: number; jersey: number;
  overall: number; devTrait: number;
  draftYear: number; draftRound: number; draftPick: number;
  ratings: Record<string, number>;
  /** Face: a scan asset the game ships, or '' when the player renders with a generic head. */
  assetName: string;
  genericHead: string; skinTone: number; bodyType: string;
  /** Editor slot -> asset (helmet, facemask, gloveLeft, …), for the drawer and the blob. */
  gear: Record<string, string>;
  personaDNA: number[]; focus: number;
  commentaryId: number;
  /** For the UI: the same portrait URL the class table would show, or null. */
  portrait: string | null;
}
```

Also `RosterBuildDoc.adds?: AddedPlayer[]` and `ApplyCounts.added: number`.

- [ ] **Step 1: Write the failing test**

`server/src/services/__tests__/RosterAdd.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RosterAddService } from '../RosterAddService';
import { RATING_KEYS } from '../AttributeModel';

test('a pool player is rated for a roster with bio, ratings, face, gear and persona', async () => {
  const p = await RosterAddService.generate('1975|NFL|walter|payton|4');
  assert.equal(p.firstName, 'Walter'); assert.equal(p.lastName, 'Payton');
  assert.equal(p.position, 'HB'); assert.equal(p.positionId, 1);
  assert.ok(p.overall >= 85, `career-lens overall ${p.overall}`);
  assert.ok(p.age >= 22 && p.age <= 40); assert.equal(p.yearsPro, 4);
  assert.ok(p.heightInches > 60 && p.weight > 150);
  for (const k of RATING_KEYS) assert.ok(p.ratings[k] >= 0 && p.ratings[k] <= 99, k);
  assert.ok(p.genericHead.startsWith('gen_'), 'a tone-matched generic head is always present');
  assert.ok(p.skinTone >= 1 && p.skinTone <= 8);
  assert.ok(['Standard', 'Thin', 'Lean', 'Muscular', 'Heavy'].includes(p.bodyType));
  assert.ok(p.gear.helmet, 'a helmet');
  assert.ok(p.personaDNA.length >= 1 && p.personaDNA.length <= 5);
  assert.ok(p.focus >= 0 && p.focus <= 3);
  assert.equal(p.draftYear, 1975); assert.equal(p.draftRound, 1);
  assert.ok(p.commentaryId >= 0);
  assert.equal(p.college, 'Jackson State');
});

test('generation is cached per key and unknown keys are refused', async () => {
  const a = await RosterAddService.generate('1989|NFL|barry|sanders|3');
  const b = await RosterAddService.generate('1989|NFL|barry|sanders|3');
  assert.equal(a, b, 'same object from the cache');
  await assert.rejects(RosterAddService.generate('1900|NFL|nobody|here|1'), /not in the pool/);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd server && node --import tsx --test src/services/__tests__/RosterAdd.test.ts`
Expected: FAIL, `Cannot find module '../RosterAddService'`.

- [ ] **Step 3: Implement**

`server/src/services/RosterAddService.ts`:

```ts
import { boardClass } from './DraftEnrichment';
import { DraftClassBuilder, gearSlots, RATING_KEYS } from './DraftClassBuilder';
import { PositionMapper } from './PositionMapper';
import { PersonaService } from './PersonaService';
import { LookupService } from './LookupService';
import { LikenessService } from './LikenessService';
import { commentaryIdFor, focusFor } from './M27Fields';
import type { GeneratedRosterPlayer } from '../types/roster';

const CACHE_MAX = 200;
const cache = new Map<string, GeneratedRosterPlayer>();

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Rate one pool player for a roster: the draft-class pipeline under the Career lens
 *  for Madden 27, then the roster-only extras (age as a veteran, persona, announcer id). */
export const RosterAddService = {
  async generate(key: string): Promise<GeneratedRosterPlayer> {
    const hit = cache.get(key);
    if (hit) return hit;
    const { players } = await boardClass([{ key }], { fill: false });
    const player = players[0];
    if (!player) throw new Error(`player ${key} is not in the pool`);
    const { prospects } = DraftClassBuilder.buildProspects([player], 'retro', {}, 'm27');
    const p = prospects[0] as Record<string, unknown>;
    const positionId = num(p.position);
    const position = PositionMapper.name(positionId);
    const overall = num(p.overall);
    const devTrait = num(p.devTrait);
    const seed = `${player.firstName}|${player.lastName}`;
    const peps = str(p.PEPS);
    const visuals = (p.visuals ?? {}) as { genericHeadName?: string; skinTone?: number };
    const isScan = !!peps && !/^gen_/i.test(peps);
    // A scan player still gets a tone-matched generic head for the blob's GENR.
    const generic = visuals.genericHeadName ? { peps: visuals.genericHeadName, skinTone: visuals.skinTone ?? 4 } : LikenessService.generic(player, 0, 'm27');
    const toneMatch = /^gen_(\d+)/i.exec(generic.peps);
    const ratings: Record<string, number> = {};
    for (const k of RATING_KEYS) ratings[k] = Math.max(0, Math.min(99, Math.round(num(p[k]))));
    const draftAge = num(player.age, num(p.age, 22));
    const out: GeneratedRosterPlayer = {
      key,
      firstName: str(p.firstName) || player.firstName,
      lastName: str(p.lastName) || player.lastName,
      positionId, position,
      archetypeId: num(p.archetype), archetype: LookupService.idToName('archetype', num(p.archetype)) || null,
      collegeId: num(p.college), college: LookupService.idToName('college', num(p.college)) || null,
      hometown: str(p.homeTown), homeStateId: num(p.homeState),
      age: Math.max(22, Math.min(40, Math.round(draftAge + 4))), yearsPro: 4,
      heightInches: num(p.heightInches, 72), weight: num(p.weight, 200), jersey: num(p.jerseyNum),
      overall, devTrait,
      draftYear: player.draftYear, draftRound: num(p.draftRound, 63), draftPick: num(p.draftPick),
      ratings,
      assetName: isScan ? peps : '',
      genericHead: generic.peps,
      skinTone: Math.max(1, Math.min(8, toneMatch ? Number(toneMatch[1]) : num(generic.skinTone, 4))),
      bodyType: str(p.bodyType) || 'Standard',
      gear: gearSlots(p),
      personaDNA: PersonaService.dnaFor(seed, PositionMapper.groupFromId(positionId), overall, devTrait).slice(0, 5),
      focus: focusFor(`${seed}|0`),
      commentaryId: commentaryIdFor(player.lastName),
      portrait: num(p.PID) ? `/api/portrait/pid/${num(p.PID)}` : null,
    };
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(key, out);
    return out;
  },

  _reset(): void { cache.clear(); },
};
```

Check `LikenessService.generic`'s real signature and return shape (grep `generic(` in `LikenessService.ts`) and adjust the call; it is used in `DraftClassBuilder.toProspect` as `LikenessService.generic(player, index, gameVersion)` returning `{ peps, kind, skinTone }`.

- [ ] **Step 4: Run the tests**

Run: `cd server && node --import tsx --test src/services/__tests__/RosterAdd.test.ts && npm run typecheck`
Expected: pass. If Payton's college resolves to a different string, print `p.college` and fix the assertion to the lookup's spelling (not the code).

- [ ] **Step 5: Commit**

```bash
cd draft-class-generator
git add server/src/services/RosterAddService.ts server/src/types/roster.ts server/src/services/__tests__/RosterAdd.test.ts
git commit -m "RosterAddService: a pool player rated for a Madden 27 roster

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Adds in the build service

**Files:**
- Modify: `server/src/services/RosterBuildService.ts`, `server/src/routes/roster.ts`
- Test: `server/src/services/__tests__/RosterBuild.test.ts`, `server/src/__tests__/app.test.ts`

**Interfaces:**
- `RosterBuildService.apply(base, doc, generated: Map<string, GeneratedRosterPlayer>): ApplyCounts` — `generated` is keyed by catalog key; `build(doc)` generates every add first. `ApplyCounts.added`. Adds' edits: `doc.edits[add.tempId]`.
- Route: `POST /roster/preview-add` body `{ key }` → `GeneratedRosterPlayer` or 400.

- [ ] **Step 1: Write the failing tests**

Append to `RosterBuild.test.ts`:

```ts
import { RosterAddService } from '../RosterAddService';

test('an added pool player gets PLAY, PRSN, PLCT and blob rows cloned from a template', skipWithoutRoster, async () => {
  const base = await RosterFileService.openBase('ROSTER-Official');
  const bears = base.teams.find((t) => t.abbr === 'CHI')!;
  const before = base.players.length;
  const maxId = Math.max(...base.players.map((p) => p.id));
  const payton = await RosterAddService.generate('1975|NFL|walter|payton|4');
  const counts = RosterBuildService.apply(base, {
    baseName: 'ROSTER-Official', name: 'test',
    adds: [{ tempId: 't1', key: payton.key, teamId: bears.id, jersey: 34 }],
    edits: { t1: { overall: 97, ratings: { speed: 93 } } },
  }, new Map([[payton.key, payton]]));
  assert.equal(counts.added, 1);
  assert.equal(counts.edited, 1);
  const out = RosterFileService.write(base.tdb2, base.header);
  const file = await parseTdb2(splitContainer(out).payload);
  assert.equal(file.PLAY.records.length, before + 1);
  const row = file.PLAY.records.find((r) => intOf(r, 'PGID') === maxId + 1)!;
  assert.ok(row, 'new player row');
  assert.equal(strOf(row, 'PFNA'), 'Walter'); assert.equal(strOf(row, 'PLNA'), 'Payton');
  assert.equal(intOf(row, 'POID'), maxId + 1);
  assert.equal(intOf(row, 'TGID'), bears.id);
  assert.equal(intOf(row, 'PPOS'), 1);
  assert.equal(intOf(row, 'POVR'), 97, 'the add edit applied');
  assert.equal(intOf(row, 'PSPD'), 93);
  assert.equal(intOf(row, 'PJEN'), 34);
  assert.equal(intOf(row, 'PYRP'), 4); assert.equal(intOf(row, 'PYWT'), 0);
  assert.equal(intOf(row, 'PWGT'), payton.weight - 160);
  assert.equal(intOf(row, 'PCOL'), payton.collegeId);
  assert.equal(intOf(row, 'PCMT'), payton.commentaryId);
  assert.equal(strOf(row, 'PEPS'), payton.assetName || payton.genericHead);
  const prsn = file.PRSN.records.find((r) => intOf(r, 'PGID') === maxId + 1)!;
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => intOf(prsn, `DNA${i}`)).filter(Boolean), payton.personaDNA);
  assert.equal(intOf(prsn, 'PRFC'), payton.focus);
  const plct = file.PLCT.records.find((r) => intOf(r, 'PGID') === maxId + 1)!;
  assert.equal(intOf(plct, 'PCON'), 1);
  assert.equal(intOf(row, 'PTSA'), intOf(plct, 'PSA0'));
  const blob = file.BLOB.records[0].fields.BLBM.value.records.find((r: any) => r.index === maxId + 1)!;
  assert.equal(strOf(blob, 'CFNM'), 'Walter'); assert.equal(intOf(blob, 'CNID'), maxId + 1);
  assert.equal(strOf(blob, 'ASNM'), payton.assetName);
  assert.equal(strOf(blob, 'GENR'), payton.genericHead);
  assert.equal(intOf(blob, 'SKNT'), payton.skinTone);
  assert.equal(intOf(blob, 'HINC'), payton.heightInches); assert.equal(intOf(blob, 'WLBS'), payton.weight);
  const louts = blob.fields.LOUT.value.records;
  const body = louts.find((l: any) => intOf(l, 'LDCT') === 5).fields.PINS.value.records.find((p: any) => intOf(p, 'SLOT', -1) === 129);
  assert.equal(strOf(body, 'ITAN'), `${payton.bodyType}_BodyType`);
  const pins = louts.find((l: any) => intOf(l, 'LDTY') === 1).fields.PINS.value.records;
  assert.equal(strOf(pins.find((p: any) => intOf(p, 'SLOT', -1) === 106), 'ITAN'), payton.gear.helmet);
  assert.ok(!file.DCHT.records.some((r) => intOf(r, 'PGID') === maxId + 1), 'no depth-chart rows for an add');
});

test('an add whose key is unknown is skipped and reported', skipWithoutRoster, async () => {
  const base = await RosterFileService.openBase('ROSTER-Official');
  const counts = RosterBuildService.apply(base, { baseName: 'ROSTER-Official', name: 'x', adds: [{ tempId: 't9', key: 'nope', teamId: 1 }] }, new Map());
  assert.equal(counts.added, 0);
  assert.ok(counts.skipped.some((s) => s.includes('nope')));
});
```

Update the earlier `apply` calls in this file to pass `new Map()` as the third argument. In `app.test.ts` add:

```ts
test('POST /api/roster/preview-add validates its body', async () => {
  const { default: roster } = await import('../routes/roster');
  const app = express(); app.use(express.json()); app.use('/api', roster); attachErrorHandling(app);
  const server = await new Promise<http.Server>((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  try {
    const port = (server.address() as { port: number }).port;
    const res = await post(port, '/api/roster/preview-add', {});
    assert.equal(res.status, 400);
    assert.match(JSON.parse(res.body).error, /key/);
  } finally { server.close(); }
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd server && node --import tsx --test src/services/__tests__/RosterBuild.test.ts src/__tests__/app.test.ts`
Expected: FAIL (`apply` ignores adds; route missing).

- [ ] **Step 3: Implement the adds**

In `RosterBuildService.ts` add imports: `cloneRecord` from `./Tdb2Engine`, `RosterAddService` from `./RosterAddService`, `GeneratedRosterPlayer` and `AddedPlayer` types. Add these helpers above `applyEdit`:

```ts
/** The base roster's median-overall player at the position, else the median of everyone. */
function templateFor(base: BaseRoster, positionId: number): Tdb2Record {
  const rows = base.tdb2.PLAY.records;
  const same = rows.filter((r) => intOf(r, 'PPOS') === positionId);
  const pool = (same.length ? same : rows).slice().sort((a, b) => intOf(a, 'POVR') - intOf(b, 'POVR'));
  return pool[Math.floor(pool.length / 2)];
}

function cheapestContract(base: BaseRoster): Tdb2Record | undefined {
  const rows = base.tdb2.PLCT.records.filter((r) => intOf(r, 'PCON') === 1);
  return rows.slice().sort((a, b) => intOf(a, 'PSA0') - intOf(b, 'PSA0'))[0];
}

function nextId(base: BaseRoster): number {
  return Math.max(0, ...base.tdb2.PLAY.records.map((r) => intOf(r, 'PGID'))) + 1;
}

/** Clone a template player's PLAY, PRSN, PLCT and blob rows for a pool player and write his values. */
function addPlayer(base: BaseRoster, add: AddedPlayer, g: GeneratedRosterPlayer, skipped: string[]): number | null {
  const template = templateFor(base, g.positionId);
  const templateId = intOf(template, 'PGID');
  const pgid = nextId(base);
  const salaryRow = cheapestContract(base);
  const salary = salaryRow ? intOf(salaryRow, 'PSA0') : 20;

  const row = cloneRecord(template);
  setInt(row, 'PGID', pgid); setInt(row, 'POID', pgid);
  setStr(row, 'PFNA', g.firstName); setStr(row, 'PLNA', g.lastName);
  setInt(row, 'TGID', add.teamId);
  setInt(row, 'PPOS', g.positionId); setInt(row, 'PLTY', g.archetypeId);
  setInt(row, 'POVR', g.overall); setInt(row, 'PROL', g.devTrait);
  setInt(row, 'PAGE', g.age); setInt(row, 'PYRP', g.yearsPro); setInt(row, 'PYWT', 0);
  setInt(row, 'PHGT', g.heightInches); setInt(row, 'PWGT', Math.max(0, g.weight - 160));
  setInt(row, 'PJEN', add.jersey ?? g.jersey);
  setInt(row, 'PCOL', g.collegeId); setStr(row, 'PHTN', g.hometown); setInt(row, 'PHSN', g.homeStateId);
  setInt(row, 'PDRO', g.draftRound); setInt(row, 'PDPI', g.draftPick); setInt(row, 'PLDT', 0);
  setStr(row, 'PEPS', g.assetName || g.genericHead);
  setInt(row, 'PCMT', g.commentaryId);
  setInt(row, 'PCSA', salary); setInt(row, 'PTSA', salary); setInt(row, 'PVTS', salary);
  for (const k of RATING_KEYS) setInt(row, PLAY_RATING_KEY[k], g.ratings[k] ?? 0);
  base.tdb2.PLAY.addRecord(row);

  const prsnT = base.tdb2.PRSN.records.find((r) => intOf(r, 'PGID') === templateId) ?? base.tdb2.PRSN.records[0];
  if (prsnT) {
    const prsn = cloneRecord(prsnT);
    setInt(prsn, 'PGID', pgid);
    for (let i = 0; i < 8; i++) setInt(prsn, `DNA${i}`, g.personaDNA[i] ?? 0);
    setInt(prsn, 'PRFC', g.focus);
    base.tdb2.PRSN.addRecord(prsn);
  } else skipped.push(`add: no persona template for ${g.key}`);

  if (salaryRow) {
    const plct = cloneRecord(salaryRow);
    setInt(plct, 'PGID', pgid);
    base.tdb2.PLCT.addRecord(plct);
  } else skipped.push(`add: no contract template for ${g.key}`);

  const blobs: Tdb2Table = base.tdb2.BLOB.records[0].fields.BLBM.value;
  const blobT = blobs.records.find((r) => r.index === templateId) ?? blobs.records[0];
  if (blobT) {
    const blob = cloneRecord(blobT);
    blob.index = pgid;
    setInt(blob, 'CNID', pgid);
    setStr(blob, 'ASNM', g.assetName);
    setStr(blob, 'CFNM', g.firstName); setStr(blob, 'CLNM', g.lastName);
    setInt(blob, 'CJNO', add.jersey ?? g.jersey);
    setStr(blob, 'GENR', g.genericHead);
    setInt(blob, 'SKNT', g.skinTone);
    setInt(blob, 'HINC', g.heightInches); setInt(blob, 'WLBS', g.weight);
    const { onField, body } = loadouts(blob);
    if (body) setPin(body, BODY_SLOT, `${g.bodyType}_BodyType`);
    if (onField) {
      for (const [slot, asset] of Object.entries(g.gear)) {
        if (!asset) continue;
        if (slot === 'facemask') { setFacemask(onField, asset); continue; }
        for (const t of GEAR_SLOT_TYPES[slot] ?? []) { const id = SLOT_ID[t]; if (id != null) setPin(onField, id, asset); }
      }
    }
    blobs.addRecord(blob);
  } else skipped.push(`add: no visuals template for ${g.key}`);

  // The read model is what teamOf/playerRow consult for later moves and edits in this apply.
  base.players.push({
    id: pgid, firstName: g.firstName, lastName: g.lastName, position: g.position, positionId: g.positionId,
    teamId: add.teamId, team: base.teams.find((t) => t.id === add.teamId)?.abbr ?? null, teamName: null,
    overall: g.overall, age: g.age, heightInches: g.heightInches, weight: g.weight, jersey: add.jersey ?? g.jersey,
    yearsPro: g.yearsPro, devTrait: g.devTrait, archetype: g.archetype, college: g.college, hometown: g.hometown,
    draftRound: g.draftRound < 63 ? g.draftRound : null, draftPick: g.draftPick || null,
    assetName: g.assetName || null, portrait: g.portrait, ratings: { ...g.ratings },
    visuals: { bodyType: g.bodyType, genericHead: g.genericHead, helmet: g.gear.helmet ?? '', facemask: g.gear.facemask ?? '' },
  });
  return pgid;
}
```

In `apply(base, doc, generated)`: initialise `counts.added = 0`; before the edits loop:

```ts
    const idOfTemp = new Map<string, number>();
    for (const add of doc.adds ?? []) {
      const g = generated.get(add.key);
      if (!g) { counts.skipped.push(`add: player ${add.key} could not be generated`); continue; }
      if (!teamIds.has(add.teamId)) { counts.skipped.push(`add: team ${add.teamId} is not in the base roster`); continue; }
      const pgid = addPlayer(base, add, g, counts.skipped);
      if (pgid != null) { idOfTemp.set(add.tempId, pgid); counts.added++; }
    }
```

and in the edits loop resolve the id: `const pgid = idOfTemp.get(idStr) ?? Number(idStr); if (!Number.isFinite(pgid)) { counts.skipped.push(\`edit: ${idStr} is not a player\`); continue; }`. In `build(doc)`: after opening the base, `const generated = new Map<string, GeneratedRosterPlayer>(); for (const add of doc.adds ?? []) { try { generated.set(add.key, await RosterAddService.generate(add.key)); } catch (e) { /* reported by apply as skipped */ } }` then `apply(base, doc, generated)`.

- [ ] **Step 4: The route**

In `routes/roster.ts`:

```ts
import { RosterAddService } from '../services/RosterAddService';

/** Rate a pool player for a roster without writing anything (the Pool tab's Add preview). */
r.post('/roster/preview-add', async (req, res) => {
  const key = (req.body ?? {}).key;
  if (!key || typeof key !== 'string') return res.status(400).json({ error: 'key required' });
  try { return res.json(await RosterAddService.generate(key)); } catch (e) { return res.status(400).json({ error: (e as Error).message }); }
});
```

and pass `adds: b.adds ?? []` through in the build handler (validate it is an array of `{ tempId: string, key: string, teamId: number }`; reject otherwise with 400 `adds must be a list`).

- [ ] **Step 5: Run the server suite, commit**

Run: `cd server && npm test && npm run typecheck`
Expected: all pass.

```bash
cd draft-class-generator
git add server/src/services/RosterBuildService.ts server/src/routes/roster.ts server/src/services/__tests__/RosterBuild.test.ts server/src/__tests__/app.test.ts
git commit -m "Roster build adds pool players by cloning a same-position template's rows

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Gate 3 script

**Files:**
- Create: `server/scripts/roster-gate3.ts`

- [ ] **Step 1: Write it**

```ts
/**
 * Gate 3: two pool players added to the Bears, written as ROSTER-GATE3: one whose face
 * the game ships as a scan and one rendered with a generic head.
 *
 *   npx tsx scripts/roster-gate3.ts
 *
 * In Madden 27, load ROSTER-GATE3, open the Bears: both players are there with the
 * printed overalls; check the face, the gear, the Persona DNA and the contract screen.
 */
import { RosterAddService } from '../src/services/RosterAddService';
import { RosterFileService } from '../src/services/RosterFileService';
import { RosterBuildService } from '../src/services/RosterBuildService';

const CANDIDATES = ['1989|NFL|barry|sanders|3', '1975|NFL|walter|payton|4', '1979|NFL|joe|montana|82', '1964|NFL|dick|butkus|3', '1985|NFL|jerry|rice|16'];

async function main() {
  let scan: string | null = null, generic: string | null = null;
  for (const key of CANDIDATES) {
    const g = await RosterAddService.generate(key).catch(() => null);
    if (!g) continue;
    if (g.assetName && !scan) scan = key;
    else if (!g.assetName && !generic) generic = key;
    if (scan && generic) break;
  }
  if (!scan || !generic) throw new Error(`could not find both kinds among the candidates (scan=${scan}, generic=${generic}); add more keys`);
  const base = await RosterFileService.openBase('ROSTER-Official');
  const bears = base.teams.find((t) => t.abbr === 'CHI')!;
  const result = await RosterBuildService.build({
    baseName: 'ROSTER-Official', name: 'GATE3',
    adds: [{ tempId: 'a', key: scan, teamId: bears.id }, { tempId: 'b', key: generic, teamId: bears.id }],
  });
  const a = await RosterAddService.generate(scan), b = await RosterAddService.generate(generic);
  console.log(result);
  console.log(`scan face:    ${a.firstName} ${a.lastName} ${a.position} ${a.overall} OVR, asset ${a.assetName}`);
  console.log(`generic head: ${b.firstName} ${b.lastName} ${b.position} ${b.overall} OVR, head ${b.genericHead}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it, commit**

Run: `cd server && npx tsx scripts/roster-gate3.ts`
Expected: `added: 2`, output `ROSTER-GATE3`, and the two lines naming the players.

```bash
cd draft-class-generator
git add server/scripts/roster-gate3.ts
git commit -m "Gate 3 script: two pool players added for the in-game check

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

**STOP HERE until the user reports the in-game result for ROSTER-GATE3.** Passing: both players are on the Bears with the printed overalls, the scan player shows his real face and the other a generic head, gear renders, Persona DNA and the contract screen open. If the generic-head player fails, retry with `PEPS` left empty (absent) instead of the head name and report. The web tasks below do not depend on Gate 3, so continue with them while waiting; only the "pool adds" changelog line waits for the pass.

---

### Task 5: Web document logic for adds

**Files:**
- Modify: `web/src/types.ts`, `web/src/api.ts`, `web/src/rosterDoc.ts`
- Test: `web/src/rosterDoc.test.ts`

**Interfaces:**
- `types.ts`: `GeneratedRosterPlayer` (same shape as the server's), `RosterDoc.adds: AddedPlayer[]` already exists as an inline type; give it a name `AddedPlayer`.
- `api.ts`: `rosterPreviewAdd(key: string): Promise<GeneratedRosterPlayer>`; `rosterBuild` body gains `adds: RosterDoc['adds']`.
- `rosterDoc.ts`: `addId(tempId): number` (a stable negative id: `-(hash(tempId) % 1e9 + 1)`), `withAdd(doc, key, teamId): RosterDoc` (no-op when the key is already added), `withoutAdd(doc, tempId)` (also drops `edits[tempId]`), `withAddMove(doc, tempId, teamId)`, `viewPlayers(doc, data, previews: Record<string, GeneratedRosterPlayer>)` returning base players plus one `ViewPlayer` per add that has a preview, with `added: true`, `tempId`, `id = addId(tempId)`, edits from `doc.edits[tempId]` applied; `docCounts` gains `added` (adds count), `addedKeys(doc): Set<string>`.

- [ ] **Step 1: Write the failing tests**

Append to `rosterDoc.test.ts`:

```ts
import { withAdd, withoutAdd, withAddMove, addId, addedKeys } from './rosterDoc';
import type { GeneratedRosterPlayer } from './types';

const payton: GeneratedRosterPlayer = {
  key: '1975|NFL|walter|payton|4', firstName: 'Walter', lastName: 'Payton', positionId: 1, position: 'HB', archetypeId: 0, archetype: 'Elusive Back',
  collegeId: 1, college: 'Jackson State', hometown: 'Columbia', homeStateId: 1, age: 26, yearsPro: 4, heightInches: 70, weight: 200, jersey: 34,
  overall: 96, devTrait: 3, draftYear: 1975, draftRound: 1, draftPick: 4, ratings: { speed: 92 }, assetName: '', genericHead: 'gen_6_T_G_005', skinTone: 6,
  bodyType: 'Muscular', gear: { helmet: 'GearHelmet_Speed_Flex' }, personaDNA: [1, 2], focus: 1, commentaryId: 0, portrait: null,
};

test('adds join the view with a negative id and follow moves, edits and removal', () => {
  let doc = withAdd(newRosterDoc(data, true), payton.key, 1);
  doc = withAdd(doc, payton.key, 2);
  assert.equal(doc.adds.length, 1, 'a key is added once');
  const tempId = doc.adds[0].tempId;
  assert.ok(addedKeys(doc).has(payton.key));
  let v = viewPlayers(doc, data, { [payton.key]: payton });
  const p = v.find((x) => x.added)!;
  assert.equal(p.id, addId(tempId)); assert.ok(p.id < 0);
  assert.equal(p.teamId, 1); assert.equal(p.team, 'CHI'); assert.equal(p.overall, 96); assert.equal(p.tempId, tempId);
  assert.deepEqual(docCounts(doc, data), { moved: 0, cut: 0, edited: 0, added: 1 });
  doc = withAddMove(doc, tempId, 1009);
  doc = withEdit(doc, tempId, { overall: 99 });
  v = viewPlayers(doc, data, { [payton.key]: payton });
  assert.equal(v.find((x) => x.added)!.teamId, 1009);
  assert.equal(v.find((x) => x.added)!.overall, 99);
  assert.equal(viewPlayers(doc, data, {}).some((x) => x.added), false, 'no preview yet, no row');
  doc = withoutAdd(doc, tempId);
  assert.equal(doc.adds.length, 0); assert.equal(doc.edits[tempId], undefined);
});
```

(`withEdit` must accept a string id: change its signature to `withEdit(doc, id: number | string, patch)`; the edits map is keyed by string anyway.)

- [ ] **Step 2: Run it to see it fail**

Run: `cd web && node --import tsx --test src/rosterDoc.test.ts`
Expected: FAIL on the missing exports.

- [ ] **Step 3: Implement**

`types.ts`: add

```ts
export interface AddedPlayer { tempId: string; key: string; teamId: number; jersey?: number }
export interface GeneratedRosterPlayer {
  key: string; firstName: string; lastName: string; positionId: number; position: string;
  archetypeId: number; archetype: string | null; collegeId: number; college: string | null;
  hometown: string; homeStateId: number; age: number; yearsPro: number; heightInches: number; weight: number; jersey: number;
  overall: number; devTrait: number; draftYear: number; draftRound: number; draftPick: number;
  ratings: Record<string, number>; assetName: string; genericHead: string; skinTone: number; bodyType: string;
  gear: Record<string, string>; personaDNA: number[]; focus: number; commentaryId: number; portrait: string | null;
}
```
and change `RosterDoc.adds` to `AddedPlayer[]`. `RosterBuildResult` gains `added: number`.

`api.ts`: add `rosterPreviewAdd: (key: string) => jsend<GeneratedRosterPlayer>('POST', '/api/roster/preview-add', { key }),` and `adds: RosterDoc['adds']` to `rosterBuild`'s body type.

`rosterDoc.ts`:

```ts
export function addId(tempId: string): number {
  let h = 2166136261;
  for (let i = 0; i < tempId.length; i++) { h ^= tempId.charCodeAt(i); h = Math.imul(h, 16777619); }
  return -((h >>> 0) % 1_000_000_000 + 1);
}
export const addedKeys = (doc: RosterDoc) => new Set(doc.adds.map((a) => a.key));
export function withAdd(doc: RosterDoc, key: string, teamId: number): RosterDoc {
  if (doc.adds.some((a) => a.key === key)) return doc;
  return { ...doc, adds: [...doc.adds, { tempId: newId(), key, teamId }], updatedAt: Date.now() };
}
export function withoutAdd(doc: RosterDoc, tempId: string): RosterDoc {
  const edits = { ...doc.edits }; delete edits[tempId];
  return { ...doc, adds: doc.adds.filter((a) => a.tempId !== tempId), edits, updatedAt: Date.now() };
}
export function withAddMove(doc: RosterDoc, tempId: string, teamId: number): RosterDoc {
  return { ...doc, adds: doc.adds.map((a) => (a.tempId === tempId ? { ...a, teamId } : a)), updatedAt: Date.now() };
}
```

`ViewPlayer` gains `added: boolean; tempId?: string`. `viewPlayers(doc, data, previews: Record<string, GeneratedRosterPlayer> = {})`: base rows get `added: false`; then for each add with `previews[add.key]`, build a `RosterPlayer` from the preview (`id: addId(add.tempId)`, team fields from `add.teamId` like the base rows, `jersey: add.jersey ?? g.jersey`, `draftRound: g.draftRound < 63 ? g.draftRound : null`, `visuals: { bodyType, genericHead, helmet: g.gear.helmet ?? '', facemask: g.gear.facemask ?? '' }`) and apply `doc.edits[add.tempId]` with the same overlay code as the base rows (factor the overlay into `applyEdit(p, e, teamId, data)` used by both), then push `{ ...overlaid, added: true, tempId: add.tempId, moved: false, edited: !!doc.edits[add.tempId] }`. `docCounts` returns `added: doc.adds.length`.

- [ ] **Step 4: Run the tests, typecheck, commit**

Run: `cd web && node --import tsx --test "src/**/*.test.ts" && npm run typecheck`
Expected: pass (RosterBuilder's `viewPlayers` call still compiles with the default previews).

```bash
cd draft-class-generator
git add web/src/types.ts web/src/api.ts web/src/rosterDoc.ts web/src/rosterDoc.test.ts
git commit -m "Roster documents carry pool adds: view rows, moves, removal, edits by temp id

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: CatalogPanel extracted from the Class Studio

**Files:**
- Create: `web/src/components/CatalogPanel.tsx`
- Modify: `web/src/components/ClassStudio.tsx`

**Interfaces:**
- `CatalogPanel({ catalog, error, onRetry, status, onAdd, addDisabled, toolbarExtra })`: `catalog: CatalogPlayer[] | null`; `status(key) => { label: string; title?: string } | null` (a non-null status replaces the Add button: the studio passes `#12`, the builder passes the team abbreviation or 'FA'); `onAdd(key)`; `addDisabled?: boolean`; `toolbarExtra?: ReactNode` rendered at the toolbar's right (the studio's "Add all shown" and "New custom player" buttons); `onListChange?: (keys: string[]) => void` so the studio's Add all shown knows the filtered list. The panel owns the filter state and the table exactly as the studio has it today, including `headshot`/`headshotFallback` and `SHOW_MAX = 400`.

- [ ] **Step 1: Create the panel**

Move from `ClassStudio.tsx` into `CatalogPanel.tsx`: `SortKey`, `SHOW_MAX`, `headshot`, `headshotFallback`, the filter state (`q`, `grp`, `from`, `to`, `league`, `hof`, `sort`), the `years`/`leagues` memos, the `list` memo, the `sel`/`th`/`sortBtn` helpers, and the whole "Left: catalog" JSX (toolbar + table + footer), with these substitutions: `full` → `addDisabled`; the `at != null ? … #{at+1} : Add` cell becomes `status(p.key)` → render the label pill (title from `title`) else the Add button; the two toolbar buttons become `{toolbarExtra}`; add a `useEffect(() => onListChange?.(list.map((p) => p.key)), [list])`. Export it as `export function CatalogPanel(...)`. Keep the outer `<div className="relative flex min-w-0 flex-1 flex-col border-r border-border">` in the studio and render the panel inside it, so the studio's drawer overlay still positions over the catalog. The panel's root is `<div className="flex min-h-0 flex-1 flex-col">`.

- [ ] **Step 2: Use it in the studio**

In `ClassStudio.tsx`: keep `catalog`, `error`, `loadCatalog`, `byKey`, `onBoard`, `colleges` (the custom-player drawer needs colleges; compute it from `catalog` as now). Replace the left column's contents with:

```tsx
<CatalogPanel
  catalog={catalog}
  error={error}
  onRetry={loadCatalog}
  status={(key) => { const at = onBoard.get(key); return at != null ? { label: `#${at + 1}`, title: 'On the board at this pick' } : null; }}
  onAdd={add}
  addDisabled={full}
  onListChange={setShownKeys}
  toolbarExtra={<>
    <button onClick={addAllShown} …>Add all shown</button>
    <button onClick={() => setDrawer({ player: blankCustom(), index: null })} …>New custom player</button>
  </>}
/>
```

with `const [shownKeys, setShownKeys] = useState<string[]>([]);` and `addAllShown` reading `shownKeys` instead of `list`. Delete the moved code from the studio.

- [ ] **Step 3: Typecheck and look**

Run: `cd web && npm run typecheck`. Then in the preview (both servers), open Create class: the catalog filters, sorting, HOF chip, Add and the `#N` pill behave as before; Add all shown fills the board from the filtered list; New custom player opens the drawer.

- [ ] **Step 4: Commit**

```bash
cd draft-class-generator
git add web/src/components/CatalogPanel.tsx web/src/components/ClassStudio.tsx
git commit -m "CatalogPanel: the Class Studio's player pool browser as a shared component

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Pool tab, added rows and export with adds

**Files:**
- Modify: `web/src/components/rosters/RosterBuilder.tsx`, `web/src/components/rosters/TeamPanel.tsx`, `web/src/components/rosters/RostersView.tsx`, `CHANGELOG.md`

- [ ] **Step 1: Previews and the Pool tab in the builder**

In `RosterBuilder.tsx`:
- state: `const [tab, setTab] = useState<'roster' | 'pool'>('roster'); const [catalog, setCatalog] = useState<CatalogPlayer[] | null>(null); const [catalogErr, setCatalogErr] = useState<string | null>(null); const [previews, setPreviews] = useState<Record<string, GeneratedRosterPlayer>>({}); const [adding, setAdding] = useState<Set<string>>(new Set());`
- load the catalog when the Pool tab first opens: `useEffect(() => { if (tab === 'pool' && !catalog) api.catalog().then(setCatalog).catch((e) => setCatalogErr((e as Error).message)); }, [tab, catalog]);`
- previews for adds already in the document (a saved roster reopened): `useEffect(() => { for (const a of doc.adds) if (!previews[a.key] && !adding.has(a.key)) fetchPreview(a.key); }, [doc.adds]);` where `fetchPreview(key)` marks `adding`, calls `api.rosterPreviewAdd(key)`, stores the result in `previews`, records a failure message in a `previewErr` map, and clears `adding`.
- `players` becomes `viewPlayers(doc, data, previews)`.
- `addFromPool(key)`: `if (readOnly) return; await fetchPreview(key); onChange(withAdd(doc, key, selectedTeam));` (the add is placed on the selected team; the row now shows his team).
- the left section's tab strip gets two buttons, Roster and Pool, styled like the existing single tab; the Pool tab renders `<CatalogPanel catalog={catalog} error={catalogErr} onRetry={…} status={(key) => { const a = doc.adds.find((x) => x.key === key); if (!a) return adding.has(key) ? { label: '…' } : null; const t = data.teams.find((t) => t.id === a.teamId); return { label: a.teamId === data.freeAgentTeamId ? 'FA' : t?.abbr ?? '?', title: 'Added to this roster' }; }} onAdd={addFromPool} addDisabled={readOnly} />` inside the same bordered section, with a one-line hint above it: "Rated by career, added to the selected team. Age is his draft age plus four; edit anything afterwards."
- `move(pgid, teamId)` handles adds: `const vp = players.find((p) => p.id === pgid); if (vp?.added && vp.tempId) onChange(withAddMove(doc, vp.tempId, teamId)); else onChange(withMove(doc, pgid, teamId, data));`
- `remove(tempId)`: `onChange(withoutAdd(doc, tempId))`, passed to `TeamPanel` as `onRemove`.
- the drawer: for an added player, `editingBase` comes from the preview: build the `player` prop from `previews[key]` (`dev: DEV_LABELS[g.devTrait]`, `bodyType: g.bodyType`, `genericHead: g.genericHead`, `helmet: g.gear.helmet ?? ''`, `facemask: g.gear.facemask ?? ''`), `edit={doc.edits[tempId]}`, `onEdit={(patch) => edit(tempId, patch)}`; `edit`'s id becomes `number | string`. Reset edits uses `withoutEdits(doc, tempId)` (make its id `number | string` too).
- the header counts line adds `· <b>{counts.added}</b> added`; export sends `adds: doc.adds`; the result banner adds `{result.added} added`.

- [ ] **Step 2: Added rows in the team panel and the roster list**

`PlayerRow` (in `RosterBuilder.tsx`): after the name, when `p.added` render `<span className="ml-1 rounded bg-gold/15 px-1 text-[10px] font-semibold text-gold" title="Added from the player pool">added</span>`.

`TeamPanel` props gain `onRemove: (tempId: string) => void`; for a row with `p.added && p.tempId`, the actions are `Move to…`, `Remove` (calls `onRemove(p.tempId)`) and `Edit` (no Cut). The team strip counts already include adds because they come from `players`.

The left Roster tab lists base players only (`players.filter((p) => !p.added)`); added players live in the team panel and the Pool tab's status pills.

- [ ] **Step 3: RostersView**

Nothing changes for open and save; `newRosterDoc` already sets `adds: []`. For a saved roster whose adds fail to preview (server restarted without the pool, or a key gone), the builder shows the `previewErr` message in the notice area: "Could not rate <first last> from the pool: <error>. Remove him or try again."

- [ ] **Step 4: CHANGELOG**

Under Unreleased → Features, extend the Rosters line: "Rosters: open a Madden 27 ROSTER save, move, cut and edit its players, add anyone from the player pool, and export it as a new roster file."

- [ ] **Step 5: Typecheck, tests, preview**

Run: `cd web && npm run typecheck && node --import tsx --test "src/**/*.test.ts"` (expected clean).

In the preview: open ROSTER-Official, Pool tab: search "Payton", Add: the row shows CHI (the selected team) after a moment, the team panel lists Walter Payton under HB with the added tag, the header says 1 added. Edit him: the drawer shows his generated ratings; set overall 99; the row updates. Move him to DET via Move to…, then Remove: he is gone from the panel and the Pool row shows Add again. Add him again, name the roster "Pool test", Save, Close, reopen: he is back on the team after the preview loads. Export: the banner reports 1 added and the file is 6,291,530 bytes. `read_console_messages` shows no errors.

- [ ] **Step 6: Commit**

```bash
cd draft-class-generator
git add web/src/components/rosters/RosterBuilder.tsx web/src/components/rosters/TeamPanel.tsx web/src/components/rosters/RostersView.tsx CHANGELOG.md
git commit -m "Rosters view: Pool tab adds players from the historic pool; added rows move, edit and remove

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Then report to the user with the Gate 3 status. When Gate 3 has passed, record it in the memory note `m27-roster-format` and the spec's phase 4 is complete.

---

## Self-review notes

- Spec coverage for phase 4: Pool tab from the extracted catalog (Tasks 6 and 7), adds through the pipeline under the Career lens with age = draft age + 4 (Task 2), template clone of PLAY, PRSN, PLCT and blob with fresh ids (Task 3), `preview-add` route (Task 3), Gate 3 (Task 4), added players in the team panel with the same actions plus Remove (Task 7), edits keyed by temp id (Tasks 3, 5, 7), export with adds (Task 7).
- Deviations: added players get Remove instead of Cut (they are not in the base file, so removing is the honest action; cutting to free agency is still available through Move to… → Free agents). `withEdit`/`withoutEdits`/`edit` accept string ids for adds.
- Type consistency: `GeneratedRosterPlayer` is identical on both sides; `AddedPlayer` on both sides; `ApplyCounts.added` / `RosterBuildResult.added` / `docCounts().added`; `SLOT_ID`, `setPin`, `setFacemask`, `loadouts`, `BODY_SLOT` reused from the earlier build service; `cloneRecord` from Task 1 used in Task 3.
- Open risk flagged for Gate 3: the game's handling of a cloned `PSXP`/`PLBD` reference field on the new PLAY row (kept from the template) and the generic-head asset name in `PEPS`. Both are exactly what Gate 3 exercises, with the documented retry.
