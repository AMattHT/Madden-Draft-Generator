# Rosters View and Sidebar Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A left sidebar rail and a Rosters view where the user opens a Madden 27 ROSTER save, moves, cuts and edits its players, saves the roster document in the browser and exports it as a new ROSTER file through the build route.

**Architecture:** The server's roster read model gains the fields the builder needs (base checksum, size, each player's visuals) and the build route accepts an opened roster id as well as a saves-folder name. The web keeps a `RosterDoc` of deltas (moves, edits) in IndexedDB under `roster:<id>`, pure helpers in `rosterDoc.ts` derive the view model and are unit-tested, and React components under `components/rosters/` render the picker, the builder, the team panel and the edit drawer. The franchise roster editor's detail form is extracted into `PlayerEditPanel` and shared. A `SideRail` replaces the top bar's Draft | Franchise toggle. Pool adds are the next plan (spec phase 4).

**Tech Stack:** React 18 + TypeScript, Tailwind 4 (design tokens in `web/src/index.css`), idb-keyval, Vite; web tests run with `node --import tsx --test "src/**/*.test.ts"` (pure modules only, no DOM); server Express + node:test.

**Spec:** `docs/superpowers/specs/2026-09-16-roster-builder-design.md`. Previous plan (done, Gates 1 and 2 passed in-game): `docs/superpowers/plans/2026-09-16-roster-writer-and-build.md`.

## Global Constraints

- Rail entries: Home, Draft classes, Rosters, Franchise tools (the last only when `franchiseEnabled`). Icons only below the `lg` breakpoint; a collapse toggle remembered in `localStorage` under `rail:collapsed`.
- Export writes `ROSTER-<NAME>` beside the base and refuses the base and `ROSTER-Official` (the server enforces this; the UI shows the server's message).
- Cut = move to the free-agent team id. Nobody is deleted.
- Roster documents live under `roster:<id>` in IndexedDB. Only deltas are stored.
- A saved document whose base is missing or whose checksum changed opens read-only with a notice and a "Pick the base file again" action.
- Madden 26 selected in the top bar: the Rosters view shows a notice that only Madden 27 rosters are supported and still works (rosters are always Madden 27 files).
- Another Claude session commits to this repo concurrently: every `git add` names explicit files.
- Run web commands from `draft-class-generator/web`, server commands from `draft-class-generator/server`; git from `draft-class-generator`.
- Preview: `preview_start` with the `server` and `web` entries of `.claude/launch.json` at the Madden26DraftClass root (server 5174, web 5173).
- Copy rules: no em-dashes in UI strings; labels are short nouns; no exclamation marks.

## File Structure

| File | Responsibility |
|---|---|
| `server/src/services/RosterFileService.ts` (modify) | `RosterInfo` gains `crc`, `sizeBytes`; `RosterPlayer` gains `visuals` (bodyType, genericHead, helmet, facemask); `openOpened(id)` returns a `BaseRoster` from the kept copy. |
| `server/src/services/RosterBuildService.ts`, `server/src/types/roster.ts`, `server/src/routes/roster.ts` (modify) | `RosterBuildDoc.baseId` as an alternative to `baseName`. |
| `web/src/types.ts` (modify) | `RosterTeam`, `RosterPlayer`, `RosterData`, `RosterDoc`, `RosterBuildResult`. |
| `web/src/api.ts` (modify) | `rosterSaves`, `rosterOpenSaved`, `rosterOpenFile`, `rosterGet`, `rosterBuild`. |
| `web/src/cache.ts` (modify) | `rosterList`, `rosterGet`, `rosterSet`, `rosterDel`. |
| `web/src/rosterDoc.ts` (new) + `web/src/rosterDoc.test.ts` | Pure document logic: new doc, effective team, apply moves/edits to the view, counts, dirty check, rail entries. |
| `web/src/components/PlayerEditPanel.tsx` (new) | The per-player edit form (bio, appearance, ratings, gear button) extracted from `RosterEditor`. |
| `web/src/components/RosterEditor.tsx` (modify) | Uses `PlayerEditPanel`. |
| `web/src/components/rosters/RostersView.tsx` (new) | Picker or builder, document load/save, base re-open, read-only state. |
| `web/src/components/rosters/RosterPicker.tsx` (new) | Saves-folder list, browse, saved documents. |
| `web/src/components/rosters/RosterBuilder.tsx` (new) | Header, left roster list, team panel, edit drawer, export. |
| `web/src/components/rosters/TeamPanel.tsx` (new) | Team chips with counts, the selected team's roster grouped by position, Move to…, Cut, Edit, drop target. |
| `web/src/components/SideRail.tsx` (new) | The rail. |
| `web/src/App.tsx`, `TopBar.tsx`, `MenuBar.tsx`, `HomePage.tsx` (modify) | `AppView` gains `'rosters'`; rail replaces the toggle; View menu and home door. |
| `CHANGELOG.md` (modify) | Two Unreleased feature lines. |

Facts an implementer needs:

- Server read model today (`RosterPlayer`): id, firstName, lastName, position (Madden label), positionId, teamId, team (abbr or null), teamName, overall, age, heightInches, weight, jersey, yearsPro, devTrait 0–3, archetype, college, hometown, draftRound, draftPick, assetName, portrait, ratings (54 camelCase keys). `RosterData`: id, name, gameVersion 'm27', openedAt, count, teamCount, freeAgentTeamId, teams, players.
- Web `PlayerFieldEdit` (in `web/src/api.ts`): overall, age, position, dev ('Normal' | 'Star' | 'Superstar' | 'XFactor'), jersey, ratings, bodyType, genericHead, gear (slot → asset). The server accepts the same shape.
- Web `POS_NAMES` (constants.ts) are the 22 Madden 27 labels in id order; `DEV_NAMES` are display names (index = devTrait); `ATTR_GROUPS`, `humanize`, `tierColor`, `groupForId`, `fmtHeight`, `ATTR_COLUMNS` exist. `ui.tsx` exports `RatingChip`, `DevBadge`, `Portrait`, `Pill`, `Icon`, `ICONS` (has `shuffle`, `image`, `search`, `download`, `board`).
- `api.equipmentOptions(year, gameVersion)` gives gear options by slot; `api.genericHeads('m27')` gives head pools by tone ('1'…'8'). `GearEditor` props: playerName, options, gearPatch, onGearEdit(slot, asset), onClose, gameVersion, year, positionId.
- Blob facts: body type is the `PINS` record at SLOT 129 of the loadout with `LDCT` 5 (`<Body>_BodyType`); on-field gear is the loadout with `LDTY` 1; helmet SLOT 106; facemask is the `PINS` record with no SLOT and an `ITAN` starting `GearFaceMask_`; generic head is `GENR`.
- The build route today: `POST /api/roster/build` body `{ baseName, name, moves, edits }` → `{ moved, cut, edited, skipped, input, output, outputPath }`.

---

### Task 1: Server read model for the builder

**Files:**
- Modify: `server/src/services/RosterFileService.ts`, `server/src/services/RosterBuildService.ts`, `server/src/types/roster.ts`, `server/src/routes/roster.ts`
- Test: `server/src/services/__tests__/RosterFile.test.ts`, `server/src/services/__tests__/RosterBuild.test.ts`

**Interfaces:**
- Produces: `RosterInfo.crc: number`, `RosterInfo.sizeBytes: number`; `RosterPlayer.visuals: { bodyType: string; genericHead: string; helmet: string; facemask: string }`; `RosterFileService.openOpened(id): Promise<BaseRoster>`; `RosterBuildDoc.baseName?: string; baseId?: string` (one required); `RosterBuildResult.input` is the base name.

- [ ] **Step 1: Write the failing tests**

Append to `RosterFile.test.ts`:

```ts
test('the read model carries the base checksum, size and each player visuals', skipWithoutRoster, async () => {
  const buf = fs.readFileSync(OFFICIAL);
  const data = await RosterFileService.parse(buf, 'ROSTER-Official');
  assert.equal(data.sizeBytes, buf.length);
  assert.equal(data.crc, buf.readUInt32LE(0x1a));
  const geno = data.players.find((p) => p.firstName === 'Geno' && p.lastName === 'Smith')!;
  assert.equal(geno.visuals.bodyType, 'Standard');
  assert.equal(geno.visuals.genericHead, 'gen_6_T_G_005');
  assert.equal(geno.visuals.helmet, 'GearHelmet_Speed_Flex');
  assert.equal(geno.visuals.facemask, 'GearFaceMask_SpeedFlex808');
  assert.ok(data.players.every((p) => ['Standard', 'Thin', 'Muscular', 'Heavy', 'Lean', ''].includes(p.visuals.bodyType)));
});

test('an opened roster can be reopened as a base by id', skipWithoutRoster, async () => {
  const opened = await RosterFileService.openFromSaves('ROSTER-Official');
  const base = await RosterFileService.openOpened(opened.id);
  assert.equal(base.name, 'ROSTER-Official');
  assert.equal(base.players.length, opened.count);
  await assert.rejects(RosterFileService.openOpened('0123456789abcdef'), /gone/);
});
```

Append to `RosterBuild.test.ts`:

```ts
test('build accepts an opened roster id as the base', skipWithoutRoster, async () => {
  const opened = await RosterFileService.openFromSaves('ROSTER-Official');
  await assert.rejects(RosterBuildService.build({ baseId: opened.id, name: 'Official' }), /official/i);
  await assert.rejects(RosterBuildService.build({ name: 'x' }), /baseName or baseId/);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd server && node --import tsx --test src/services/__tests__/RosterFile.test.ts src/services/__tests__/RosterBuild.test.ts`
Expected: the three new tests FAIL (`sizeBytes` undefined, `openOpened is not a function`, type error on `baseId`).

- [ ] **Step 3: Extend the read model**

In `RosterFileService.ts`:

Add to `RosterPlayer`:
```ts
  /** From the player's visuals blob: body type (Standard…Lean), generic head, helmet and facemask assets; '' when absent. */
  visuals: { bodyType: string; genericHead: string; helmet: string; facemask: string };
```
Add to `RosterInfo`:
```ts
  /** Identity of the file the roster came from, so a saved document can tell whether its base changed. */
  crc: number;
  sizeBytes: number;
```

Add a blob reader above `buildPlayer`:
```ts
function visualsOf(blob: Tdb2Record | undefined): RosterPlayer['visuals'] {
  const out = { bodyType: '', genericHead: '', helmet: '', facemask: '' };
  if (!blob) return out;
  out.genericHead = strOf(blob, 'GENR');
  const louts: Tdb2Record[] = blob.fields.LOUT?.value?.records ?? [];
  for (const l of louts) {
    const pins: Tdb2Record[] = l.fields.PINS?.value?.records ?? [];
    if (intOf(l, 'LDCT', -1) === 5) {
      const body = pins.find((p) => intOf(p, 'SLOT', -1) === 129);
      if (body) out.bodyType = strOf(body, 'ITAN').replace(/_BodyType$/, '');
    } else if (intOf(l, 'LDTY', -1) === 1) {
      for (const p of pins) {
        const asset = strOf(p, 'ITAN');
        if (intOf(p, 'SLOT', -1) === 106) out.helmet = asset;
        else if (!p.fields.SLOT && asset.startsWith('GearFaceMask_')) out.facemask = asset;
      }
    }
  }
  return out;
}
```

`buildPlayer` takes a fourth argument `blob: Tdb2Record | undefined` and sets `visuals: visualsOf(blob)`. `buildPlayers` builds `const blobs = new Map<number, Tdb2Record>(file.BLOB.records[0].fields.BLBM.value.records.map((r: Tdb2Record) => [r.index, r]));` once and passes `blobs.get(intOf(r, 'PGID'))`.

In `build(buf, name, id, openedAt)` add `crc: buf.readUInt32LE(0x1a), sizeBytes: buf.length,` to the returned entry.

Add to the service object, after `openBase`:
```ts
  /** A base roster from the copy kept for an opened id (a browsed file that is not in the saves folder). */
  async openOpened(id: string): Promise<BaseRoster> {
    const e = entries.get(id) ?? (await restore(id));
    if (!e) throw new Error('that roster is gone — open the file again');
    return parseBase(e.buf, e.name);
  },
```

- [ ] **Step 4: Accept `baseId` in the build**

`server/src/types/roster.ts`: change `baseName: string;` to
```ts
  baseName?: string;                 // ROSTER-* file in the Madden 27 saves folder, or
  baseId?: string;                   // an opened roster id (a browsed file kept by the server)
```

`RosterBuildService.build`: replace the two refusals and the open with
```ts
    const output = RosterFileService.outputNameFor(doc.name);
    if (!doc.baseName && !doc.baseId) throw new Error('baseName or baseId required');
    if (output.toUpperCase() === 'ROSTER-OFFICIAL') throw new Error('refusing to overwrite the official roster');
    if (doc.baseName && output.toUpperCase() === String(doc.baseName).toUpperCase()) throw new Error('refusing to overwrite the base roster');
    const base = doc.baseName ? await RosterFileService.openBase(doc.baseName) : await RosterFileService.openOpened(String(doc.baseId));
    if (output.toUpperCase() === base.name.toUpperCase()) throw new Error('refusing to overwrite the base roster');
```
and return `input: base.name`.

`routes/roster.ts` build handler: replace the `baseName` check with
```ts
  if ((!b.baseName || typeof b.baseName !== 'string') && (!b.baseId || typeof b.baseId !== 'string')) return res.status(400).json({ error: 'baseName or baseId required' });
```
and pass `baseId: b.baseId` through. Update the app test's regex from `/baseName/` to `/baseName or baseId/`.

- [ ] **Step 5: Run the server suite**

Run: `cd server && npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
cd draft-class-generator
git add server/src/services/RosterFileService.ts server/src/services/RosterBuildService.ts server/src/types/roster.ts server/src/routes/roster.ts server/src/services/__tests__/RosterFile.test.ts server/src/services/__tests__/RosterBuild.test.ts server/src/__tests__/app.test.ts
git commit -m "Roster read model carries base identity and player visuals; build by opened id

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Web types, API, cache and the pure document logic

**Files:**
- Modify: `web/src/types.ts`, `web/src/api.ts`, `web/src/cache.ts`
- Create: `web/src/rosterDoc.ts`
- Test: `web/src/rosterDoc.test.ts`

**Interfaces:**
- Produces (types): `RosterTeam`, `RosterPlayer` (mirrors the server, including `visuals`), `RosterData`, `RosterDoc`, `RosterBuildResult`.
- Produces (api): `api.rosterSaves()`, `api.rosterOpenSaved(name)`, `api.rosterOpenFile(name, dataBase64)`, `api.rosterGet(id)`, `api.rosterBuild(body)`.
- Produces (cache): `cache.rosterList()`, `rosterGet(id)`, `rosterSet(doc)`, `rosterDel(id)`.
- Produces (rosterDoc): `newRosterDoc(data)`, `teamOf(doc, player)`, `viewPlayers(doc, data)`, `docCounts(doc, data)`, `withMove(doc, pgid, teamId, data)`, `withEdit(doc, pgid, patch)`, `withoutEdits(doc, pgid)`, `railEntries(franchiseEnabled)`, `POSITION_ORDER`, `groupByPosition(players)`.

- [ ] **Step 1: Write the failing test**

`web/src/rosterDoc.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRosterDoc, teamOf, viewPlayers, docCounts, withMove, withEdit, withoutEdits, railEntries, groupByPosition } from './rosterDoc';
import type { RosterData, RosterPlayer } from './types';

const player = (id: number, teamId: number, position = 'QB', overall = 70): RosterPlayer => ({
  id, firstName: `F${id}`, lastName: `L${id}`, position, positionId: 0, teamId, team: teamId === 1009 ? null : 'CHI', teamName: teamId === 1009 ? null : 'Chicago Bears',
  overall, age: 25, heightInches: 72, weight: 200, jersey: id, yearsPro: 3, devTrait: 0, archetype: null, college: null, hometown: null,
  draftRound: null, draftPick: null, assetName: null, portrait: null, ratings: { speed: 80 },
  visuals: { bodyType: 'Standard', genericHead: 'gen_4_T_G_001', helmet: '', facemask: '' },
});
const data: RosterData = {
  id: 'abc', name: 'ROSTER-Official', gameVersion: 'm27', openedAt: 1, count: 3, teamCount: 1, freeAgentTeamId: 1009, crc: 7, sizeBytes: 6291530,
  teams: [{ id: 1, name: 'Bears', city: 'Chicago', abbr: 'CHI' }, { id: 2, name: 'Jets', city: 'New York', abbr: 'NYJ' }, { id: 1009, name: 'FreeAgents', city: '', abbr: 'FA' }],
  players: [player(10, 1), player(11, 1, 'HB'), player(12, 1009)],
};

test('a new document records the base identity and no deltas', () => {
  const doc = newRosterDoc(data, true);
  assert.deepEqual(doc.base, { fileName: 'ROSTER-Official', openedId: 'abc', sizeBytes: 6291530, crc: 7, fromSaves: true });
  assert.deepEqual(doc.moves, {});
  assert.deepEqual(doc.edits, {});
  assert.deepEqual(doc.adds, []);
  assert.equal(doc.name, '');
});

test('moves change the effective team; cuts go to free agency; a move back clears the delta', () => {
  let doc = newRosterDoc(data, true);
  doc = withMove(doc, 10, 2, data);
  assert.equal(teamOf(doc, data.players[0]), 2);
  assert.deepEqual(docCounts(doc, data), { moved: 1, cut: 0, edited: 0 });
  doc = withMove(doc, 11, 1009, data);
  assert.deepEqual(docCounts(doc, data), { moved: 1, cut: 1, edited: 0 });
  doc = withMove(doc, 10, 1, data);
  assert.equal(doc.moves[10], undefined, 'moving home removes the delta');
  assert.deepEqual(docCounts(doc, data), { moved: 0, cut: 1, edited: 0 });
});

test('edits merge per player and the view applies them', () => {
  let doc = newRosterDoc(data, true);
  doc = withEdit(doc, 10, { overall: 90 });
  doc = withEdit(doc, 10, { ratings: { speed: 95 } });
  doc = withEdit(doc, 10, { ratings: { agility: 70 } });
  assert.deepEqual(doc.edits[10], { overall: 90, ratings: { speed: 95, agility: 70 } });
  const v = viewPlayers(doc, data);
  const p = v.find((x) => x.id === 10)!;
  assert.equal(p.overall, 90);
  assert.equal(p.ratings.speed, 95);
  assert.equal(p.edited, true);
  assert.equal(v.find((x) => x.id === 11)!.edited, false);
  doc = withoutEdits(doc, 10);
  assert.equal(doc.edits[10], undefined);
});

test('the view reflects moves and groups by position in Madden order', () => {
  const doc = withMove(newRosterDoc(data, true), 12, 1, data);
  const v = viewPlayers(doc, data);
  const bears = v.filter((p) => p.teamId === 1);
  assert.equal(bears.length, 3);
  assert.equal(bears.find((p) => p.id === 12)!.team, 'CHI');
  const groups = groupByPosition(bears);
  assert.deepEqual(groups.map((g) => g.position), ['QB', 'HB']);
  assert.equal(groups[0].players.length, 2);
});

test('rail entries follow the franchise flag', () => {
  assert.deepEqual(railEntries(false).map((e) => e.view), ['home', 'draft', 'rosters']);
  assert.deepEqual(railEntries(true).map((e) => e.view), ['home', 'draft', 'rosters', 'franchise']);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd web && node --import tsx --test src/rosterDoc.test.ts`
Expected: FAIL, `Cannot find module './rosterDoc'`.

- [ ] **Step 3: Types**

Append to `web/src/types.ts`:

```ts
/** A Madden 27 ROSTER save as the server reads it. */
export interface RosterTeam { id: number; name: string; city: string; abbr: string }
export interface RosterPlayer {
  id: number;
  firstName: string;
  lastName: string;
  position: string;
  positionId: number;
  teamId: number;
  team: string | null;
  teamName: string | null;
  overall: number;
  age: number;
  heightInches: number;
  weight: number;
  jersey: number;
  yearsPro: number;
  devTrait: number;
  archetype: string | null;
  college: string | null;
  hometown: string | null;
  draftRound: number | null;
  draftPick: number | null;
  assetName: string | null;
  portrait: string | null;
  ratings: Record<string, number>;
  visuals: { bodyType: string; genericHead: string; helmet: string; facemask: string };
}
export interface RosterData {
  id: string;
  name: string;
  gameVersion: 'm27';
  openedAt: number;
  count: number;
  teamCount: number;
  freeAgentTeamId: number;
  crc: number;
  sizeBytes: number;
  teams: RosterTeam[];
  players: RosterPlayer[];
}

/** A roster the user is building: deltas against a base ROSTER file. */
export interface RosterDoc {
  id: string;
  name: string;
  /** fromSaves: the base was picked from the saves folder (export can name it); false for a browsed file (export uses openedId). */
  base: { fileName: string; openedId: string; sizeBytes: number; crc: number; fromSaves: boolean };
  moves: Record<number, number>;
  adds: { tempId: string; key: string; teamId: number; jersey?: number }[];
  edits: Record<string, import('./api').PlayerFieldEdit>;
  createdAt: number;
  updatedAt: number;
}

export interface RosterBuildResult {
  moved: number; cut: number; edited: number; skipped: string[];
  input: string; output: string; outputPath: string;
}
```

- [ ] **Step 4: API**

In `web/src/api.ts` add `RosterData, RosterDoc, RosterBuildResult` to the type import and these entries on `api` (next to `openSavesList`):

```ts
  /** Madden 27 ROSTER saves (Rosters view): list, open, reopen, build. */
  rosterSaves: () => jget<{ gameVersion: 'm27'; dir: string; files: SaveFileInfo[] }>('/api/roster/saves'),
  rosterOpenSaved: (name: string) => jsend<RosterData>('POST', '/api/roster/open', { name }),
  rosterOpenFile: (name: string, dataBase64: string) => jsend<RosterData>('POST', '/api/roster/open', { name, dataBase64 }),
  rosterGet: (id: string) => jget<RosterData>(`/api/roster/${encodeURIComponent(id)}`),
  rosterBuild: (body: { baseName?: string; baseId?: string; name: string; moves: RosterDoc['moves']; edits: RosterDoc['edits'] }) =>
    jsend<RosterBuildResult>('POST', '/api/roster/build', body),
```

(`jget` and `jsend` are the file's existing helpers; check their names at the top of `api.ts` and match them.)

- [ ] **Step 5: Cache**

In `web/src/cache.ts` add `RosterDoc` to the type import and, after the custom-class block:

```ts
  // Rosters being built: one document per roster under roster:<id>.
  async rosterList(): Promise<RosterDoc[]> {
    const all = (await keys()) as string[];
    const out: RosterDoc[] = [];
    for (const k of all) {
      if (!/^roster:/.test(String(k))) continue;
      const d = await get<RosterDoc>(k);
      if (d) out.push(d);
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  },
  rosterGet: (id: string) => get<RosterDoc>(`roster:${id}`),
  rosterSet: (d: RosterDoc) => set(`roster:${d.id}`, d),
  rosterDel: (id: string) => del(`roster:${id}`),
```

- [ ] **Step 6: The document logic**

`web/src/rosterDoc.ts`:

```ts
import type { PlayerFieldEdit } from './api';
import type { RosterData, RosterDoc, RosterPlayer } from './types';
import type { AppView } from './App';
import { POS_NAMES, DEV_NAMES } from './constants';

/** A roster player as the builder shows him: base values with the document's deltas applied. */
export interface ViewPlayer extends RosterPlayer {
  edited: boolean;
  moved: boolean;
}

export const POSITION_ORDER: string[] = POS_NAMES;

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

export function newRosterDoc(data: RosterData, fromSaves: boolean): RosterDoc {
  const now = Date.now();
  return {
    id: newId(),
    name: '',
    base: { fileName: data.name, openedId: data.id, sizeBytes: data.sizeBytes, crc: data.crc, fromSaves },
    moves: {},
    adds: [],
    edits: {},
    createdAt: now,
    updatedAt: now,
  };
}

/** The team a player is on once the document's moves apply. */
export function teamOf(doc: RosterDoc, p: RosterPlayer): number {
  return doc.moves[p.id] ?? p.teamId;
}

/** Move a player; moving him back to his base team drops the delta. */
export function withMove(doc: RosterDoc, pgid: number, teamId: number, data: RosterData): RosterDoc {
  const base = data.players.find((p) => p.id === pgid);
  if (!base) return doc;
  const moves = { ...doc.moves };
  if (teamId === base.teamId) delete moves[pgid];
  else moves[pgid] = teamId;
  return { ...doc, moves, updatedAt: Date.now() };
}

/** Merge a patch into a player's edits (ratings and gear merge one level deep). */
export function withEdit(doc: RosterDoc, pgid: number, patch: PlayerFieldEdit): RosterDoc {
  const prev = doc.edits[pgid] ?? {};
  const next: PlayerFieldEdit = { ...prev, ...patch };
  if (patch.ratings) next.ratings = { ...(prev.ratings ?? {}), ...patch.ratings };
  if (patch.gear) next.gear = { ...(prev.gear ?? {}), ...patch.gear };
  return { ...doc, edits: { ...doc.edits, [pgid]: next }, updatedAt: Date.now() };
}

export function withoutEdits(doc: RosterDoc, pgid: number): RosterDoc {
  const edits = { ...doc.edits };
  delete edits[pgid];
  return { ...doc, edits, updatedAt: Date.now() };
}

const DEV_KEY: Record<string, number> = { Normal: 0, Star: 1, Superstar: 2, XFactor: 3 };

/** Every base player with moves and edits applied. */
export function viewPlayers(doc: RosterDoc, data: RosterData): ViewPlayer[] {
  const teamById = new Map(data.teams.map((t) => [t.id, t]));
  return data.players.map((p) => {
    const e = doc.edits[p.id];
    const teamId = teamOf(doc, p);
    const team = teamById.get(teamId);
    const isFa = teamId === data.freeAgentTeamId || !team;
    const position = e?.position && POS_NAMES.includes(e.position) ? e.position : p.position;
    return {
      ...p,
      teamId,
      team: isFa ? null : team!.abbr,
      teamName: isFa ? null : `${team!.city} ${team!.name}`,
      overall: e?.overall ?? p.overall,
      age: e?.age ?? p.age,
      jersey: e?.jersey ?? p.jersey,
      position,
      positionId: POS_NAMES.indexOf(position),
      devTrait: e?.dev != null && e.dev in DEV_KEY ? DEV_KEY[e.dev] : p.devTrait,
      ratings: e?.ratings ? { ...p.ratings, ...e.ratings } : p.ratings,
      visuals: {
        bodyType: e?.bodyType ?? p.visuals.bodyType,
        genericHead: e?.genericHead ?? p.visuals.genericHead,
        helmet: e?.gear?.helmet ?? p.visuals.helmet,
        facemask: e?.gear?.facemask ?? p.visuals.facemask,
      },
      edited: !!e,
      moved: doc.moves[p.id] != null,
    };
  });
}

export function docCounts(doc: RosterDoc, data: RosterData): { moved: number; cut: number; edited: number } {
  let moved = 0, cut = 0;
  for (const t of Object.values(doc.moves)) { if (t === data.freeAgentTeamId) cut++; else moved++; }
  return { moved, cut, edited: Object.keys(doc.edits).length };
}

export function isDocEmpty(doc: RosterDoc): boolean {
  return !Object.keys(doc.moves).length && !Object.keys(doc.edits).length && !doc.adds.length;
}

/** Players of one team, grouped by position in Madden order; empty groups are left out. */
export function groupByPosition<T extends RosterPlayer>(players: T[]): { position: string; players: T[] }[] {
  const out: { position: string; players: T[] }[] = [];
  for (const position of POSITION_ORDER) {
    const ps = players.filter((p) => p.position === position).sort((a, b) => b.overall - a.overall || a.lastName.localeCompare(b.lastName));
    if (ps.length) out.push({ position, players: ps });
  }
  return out;
}

export const devLabel = (dev: number) => DEV_NAMES[dev] ?? DEV_NAMES[0];

export interface RailEntry { view: AppView; label: string; icon: string }
const ICON_HOME = 'M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z';
const ICON_DRAFT = 'M5 8l7 4 7-4M5 13l7 4 7-4';
const ICON_ROSTERS = 'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0';
const ICON_FRANCHISE = 'M12 3l7 3v5c0 4.2-3 7.4-7 8.5-4-1.1-7-4.3-7-8.5V6l7-3z';

export function railEntries(franchiseEnabled: boolean): RailEntry[] {
  const out: RailEntry[] = [
    { view: 'home', label: 'Home', icon: ICON_HOME },
    { view: 'draft', label: 'Draft classes', icon: ICON_DRAFT },
    { view: 'rosters', label: 'Rosters', icon: ICON_ROSTERS },
  ];
  if (franchiseEnabled) out.push({ view: 'franchise', label: 'Franchise tools', icon: ICON_FRANCHISE });
  return out;
}
```

`AppView` in `App.tsx` must already include `'rosters'` for this to typecheck; add it now: `export type AppView = 'home' | 'draft' | 'franchise' | 'rosters';` (the rendering comes in Task 7).

- [ ] **Step 7: Run the tests and typecheck**

Run: `cd web && node --import tsx --test src/rosterDoc.test.ts && npm run typecheck`
Expected: 5 passing; typecheck clean (the `import('./api')` type in `types.ts` avoids a cycle at runtime).

- [ ] **Step 8: Commit**

```bash
cd draft-class-generator
git add web/src/types.ts web/src/api.ts web/src/cache.ts web/src/rosterDoc.ts web/src/rosterDoc.test.ts web/src/App.tsx
git commit -m "Roster documents: types, API, cache and the pure delta logic

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Extract PlayerEditPanel from the franchise roster editor

**Files:**
- Create: `web/src/components/PlayerEditPanel.tsx`
- Modify: `web/src/components/RosterEditor.tsx`

**Interfaces:**
- Produces: `PlayerEditPanel` props:
```ts
{
  title: string;            // "Geno Smith"
  subtitle: string;         // "NYJ · 13 yrs pro"
  positions: string[];      // the labels the select offers
  player: { position: string; overall: number; age: number; dev: string; jersey: number; ratings: Record<string, number>; bodyType: string; genericHead: string; helmet: string; facemask: string };
  edit: PlayerFieldEdit | undefined;
  onEdit: (patch: PlayerFieldEdit) => void;   // merges one field (ratings/gear merge inside)
  heads: Record<string, string[]>;
  gearOpts: Record<string, GearOption[]>;
  gameVersion: 'm26' | 'm27';
  year: number;
  showJersey?: boolean;     // default false (the franchise editor has no jersey field)
}
```
It renders the bio grid, appearance block (body type, head picker, Edit gear button that opens `GearEditor`), and the rating groups. Effective values = edit ?? player.

- [ ] **Step 1: Write the component**

`web/src/components/PlayerEditPanel.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { PlayerFieldEdit } from '../api';
import type { GearOption } from '../types';
import { ATTR_GROUPS, humanize, tierColor, POS_NAMES } from '../constants';
import { GearEditor } from './GearEditor';
import { Icon, ICONS } from './ui';

const DEVS = ['Normal', 'Star', 'Superstar', 'XFactor'];
const BODY_TYPES = ['Standard', 'Thin', 'Lean', 'Muscular', 'Heavy'];
const inputCls = 'rounded-md border border-border bg-surface-0 px-2 py-1 text-sm text-neutral-200 focus:border-primary focus:outline-none';

export interface EditablePlayer {
  position: string;
  overall: number;
  age: number;
  dev: string;
  jersey: number;
  ratings: Record<string, number>;
  bodyType: string;
  genericHead: string;
  helmet: string;
  facemask: string;
}

/** The per-player edit form shared by the franchise roster editor and the Rosters view:
 *  bio, appearance (body type, generic head, gear) and every rating in groups. */
export function PlayerEditPanel({ title, subtitle, positions, player, edit, onEdit, heads, gearOpts, gameVersion, year, showJersey = false }: {
  title: string;
  subtitle: string;
  positions: string[];
  player: EditablePlayer;
  edit: PlayerFieldEdit | undefined;
  onEdit: (patch: PlayerFieldEdit) => void;
  heads: Record<string, string[]>;
  gearOpts: Record<string, GearOption[]>;
  gameVersion: 'm26' | 'm27';
  year: number;
  showJersey?: boolean;
}) {
  const [gearOpen, setGearOpen] = useState(false);
  const [headTone, setHeadTone] = useState(4);
  const eff = {
    overall: edit?.overall ?? player.overall,
    age: edit?.age ?? player.age,
    dev: edit?.dev ?? player.dev,
    position: edit?.position ?? player.position,
    jersey: edit?.jersey ?? player.jersey,
    bodyType: edit?.bodyType ?? player.bodyType ?? 'Standard',
    genericHead: edit?.genericHead ?? player.genericHead ?? '',
    rating: (k: string) => edit?.ratings?.[k] ?? player.ratings[k] ?? 0,
  };
  useEffect(() => {
    const m = String(eff.genericHead).match(/^gen_(\d+)/i);
    setHeadTone(m ? parseInt(m[1], 10) : 4);
    // Only re-derive when the player or his head changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, eff.genericHead]);
  const headPool = heads[String(headTone)] ?? [];
  const headIdx = headPool.indexOf(eff.genericHead);
  const pickHead = (i: number) => { if (headPool.length) onEdit({ genericHead: headPool[((i % headPool.length) + headPool.length) % headPool.length] }); };
  const gearPatch: Record<string, string> = { helmet: player.helmet, facemask: player.facemask, ...(edit?.gear ?? {}) };
  const editRating = (k: string, v: number) => onEdit({ ratings: { [k]: v } });

  return (
    <>
      <div className="sticky top-0 z-10 border-b border-border bg-surface-1 px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-base font-bold text-neutral-50">{title}</div>
          <div className="text-lg font-bold tabular-nums" style={{ color: tierColor(eff.overall) }}>{eff.overall}</div>
        </div>
        <div className="text-xs text-muted">{subtitle}</div>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-wider text-muted">Overall</span>
            <input type="number" min={0} max={99} value={eff.overall} onChange={(ev) => onEdit({ overall: Number(ev.target.value) })} className={inputCls} /></label>
          <label className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-wider text-muted">Age</span>
            <input type="number" min={18} max={50} value={eff.age} onChange={(ev) => onEdit({ age: Number(ev.target.value) })} className={inputCls} /></label>
          <label className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-wider text-muted">Position</span>
            <select value={eff.position} onChange={(ev) => onEdit({ position: ev.target.value })} className={inputCls}>
              {positions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select></label>
          <label className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-wider text-muted">Dev trait</span>
            <select value={eff.dev} onChange={(ev) => onEdit({ dev: ev.target.value })} className={inputCls}>
              {DEVS.map((d) => <option key={d} value={d}>{d === 'XFactor' ? 'X-Factor' : d}</option>)}
            </select></label>
          {showJersey && (
            <label className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-wider text-muted">Jersey</span>
              <input type="number" min={0} max={99} value={eff.jersey} onChange={(ev) => onEdit({ jersey: Number(ev.target.value) })} className={inputCls} /></label>
          )}
        </div>

        <div className="mt-3 space-y-2 border-t border-border/50 pt-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-wider text-muted">Body type</span>
              <select value={eff.bodyType} onChange={(ev) => onEdit({ bodyType: ev.target.value })} className={inputCls}>
                {BODY_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select></label>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Face (generic head)</span>
              <div className="flex items-center gap-1">
                <select value={headTone} onChange={(ev) => setHeadTone(Number(ev.target.value))} className={`${inputCls} px-1`} title="Skin tone">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((t) => <option key={t} value={t}>T{t}</option>)}
                </select>
                <button type="button" onClick={() => pickHead(headIdx < 0 ? 0 : headIdx - 1)} disabled={!headPool.length} className="rounded border border-border-strong bg-surface-2 px-1.5 py-1 text-xs text-neutral-200 hover:bg-surface-3 disabled:opacity-40">‹</button>
                <span className="flex-1 text-center text-xs tabular-nums text-neutral-300">{headIdx >= 0 ? `${headIdx + 1}/${headPool.length}` : '—'}</span>
                <button type="button" onClick={() => pickHead(headIdx < 0 ? 0 : headIdx + 1)} disabled={!headPool.length} className="rounded border border-border-strong bg-surface-2 px-1.5 py-1 text-xs text-neutral-200 hover:bg-surface-3 disabled:opacity-40">›</button>
                <button type="button" onClick={() => pickHead(Math.floor(Math.random() * headPool.length))} disabled={!headPool.length} className="rounded border border-border-strong bg-surface-2 px-1.5 py-1 text-neutral-200 hover:bg-surface-3 disabled:opacity-40" title="Random"><Icon path={ICONS.shuffle} className="h-3 w-3" /></button>
              </div>
            </div>
          </div>
          <button type="button" onClick={() => setGearOpen(true)} className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border-strong bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:bg-surface-3">
            <Icon path={ICONS.image} className="h-3.5 w-3.5" /> Edit gear
          </button>
          <div className="truncate text-[10px] text-muted">
            Helmet: {gearOpts.helmet?.find((o) => o.value === gearPatch.helmet)?.label ?? gearPatch.helmet ?? '—'} · Facemask: {gearOpts.facemask?.find((o) => o.value === gearPatch.facemask)?.label ?? gearPatch.facemask ?? '—'}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {ATTR_GROUPS.map((g) => (
            <div key={g.title}>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">{g.title}</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {g.keys.filter((k) => player.ratings[k] !== undefined).map((k) => (
                  <label key={k} className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-neutral-400" title={humanize(k)}>{humanize(k)}</span>
                    <input type="number" min={0} max={99} value={eff.rating(k)} onChange={(ev) => editRating(k, Number(ev.target.value))}
                      className="w-14 rounded border border-border bg-surface-0 px-1.5 py-0.5 text-right text-sm tabular-nums text-neutral-200 focus:border-primary focus:outline-none" />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {gearOpen && (
        <GearEditor
          playerName={title}
          options={gearOpts}
          gearPatch={gearPatch}
          onGearEdit={(slot, asset) => onEdit({ gear: { [slot]: asset } })}
          onClose={() => setGearOpen(false)}
          gameVersion={gameVersion}
          year={year}
          positionId={Math.max(0, POS_NAMES.indexOf(eff.position))}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Use it in RosterEditor**

In `web/src/components/RosterEditor.tsx`:
- Import `PlayerEditPanel`; drop the imports it no longer needs (`GearEditor`, `ATTR_GROUPS`, `humanize`, `POS_NAMES`, `Icon`, `ICONS` if unused after the change; keep `tierColor` for the table).
- Delete the `gearOpen`, `headTone`, `headPool`, `headIdx`, `pickHead`, `gearPatch`, `editGear`, `eff`, `editRating` state and helpers and the `useEffect` that derives the tone.
- Change `editPlayer(id, patch)` to merge ratings and gear one level deep:

```ts
  const editPlayer = (id: number, patch: PlayerFieldEdit) => setEdits((prev) => {
    const cur = prev[id] ?? {};
    const next: PlayerFieldEdit = { ...cur, ...patch };
    if (patch.ratings) next.ratings = { ...(cur.ratings ?? {}), ...patch.ratings };
    if (patch.gear) next.gear = { ...(cur.gear ?? {}), ...patch.gear };
    return { ...prev, [id]: next };
  });
```
- Replace the whole `{!sel ? (...) : (<> …editor… </>)}` block inside the editor column with:

```tsx
            {!sel ? (
              <div className="flex h-full items-center justify-center p-4 text-sm text-muted">Select a player to edit</div>
            ) : (
              <PlayerEditPanel
                title={`${sel.firstName} ${sel.lastName}`}
                subtitle={`${sel.team || sel.status} · ${sel.yearsPro} yrs pro`}
                positions={POSITIONS}
                player={{ position: sel.position, overall: sel.overall, age: sel.age, dev: sel.dev, jersey: sel.jersey, ratings: sel.ratings, bodyType: sel.bodyType, genericHead: sel.genericHead, helmet: sel.helmet, facemask: sel.facemask }}
                edit={e}
                onEdit={(patch) => editPlayer(sel.id, patch)}
                heads={heads}
                gearOpts={gearOpts}
                gameVersion="m26"
                year={2025}
              />
            )}
```
- Remove the trailing `{gearOpen && sel && (<GearEditor … />)}` block.
- The table's `ov` uses `ed?.overall ?? p.overall` as before.

- [ ] **Step 3: Typecheck and look at it**

Run: `cd web && npm run typecheck`
Expected: clean. Then `preview_start` the `server` and `web` entries; with `DRAFT_TOOL_FRANCHISE=1` set for the server (the launch entry may already set it; if not, this check is skipped and the typecheck stands), open Franchise tools → Roster, load a roster, pick a player: the form renders as before, a rating edit marks the row edited, Edit gear opens the gear editor.

- [ ] **Step 4: Commit**

```bash
cd draft-class-generator
git add web/src/components/PlayerEditPanel.tsx web/src/components/RosterEditor.tsx
git commit -m "PlayerEditPanel: the franchise roster editor's form, shared with the Rosters view

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: RostersView and RosterPicker

**Files:**
- Create: `web/src/components/rosters/RosterPicker.tsx`, `web/src/components/rosters/RostersView.tsx`, `web/src/components/rosters/RosterBuilder.tsx` (a first, list-only version; Tasks 5 and 6 fill it)

**Interfaces:**
- Produces: `RostersView({ gameVersion })`; `RosterPicker({ savedDocs, onOpenBase(data, fromSaves), onOpenDoc(doc), onDeleteDoc(id) })`; `RosterBuilder({ data, doc, readOnly, notice, onChange(doc), onSave(doc), onClose(), onRebase() })`.

- [ ] **Step 1: The picker**

`web/src/components/rosters/RosterPicker.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import type { RosterData, RosterDoc, SaveFileInfo } from '../../types';

const fmtSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const fmtWhen = (t: number) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
const btn = 'rounded-md border border-border-strong bg-surface-2 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-surface-3 disabled:opacity-50';

/** Empty state of the Rosters view: a base file from the saves folder or elsewhere, or a roster saved earlier. */
export function RosterPicker({ savedDocs, onOpenBase, onOpenDoc, onDeleteDoc }: {
  savedDocs: RosterDoc[];
  onOpenBase: (data: RosterData, fromSaves: boolean) => void;
  onOpenDoc: (doc: RosterDoc) => void;
  onDeleteDoc: (id: string) => void;
}) {
  const [state, setState] = useState<{ dir: string; files: SaveFileInfo[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let alive = true;
    api.rosterSaves().then((r) => alive && setState(r)).catch((e) => alive && setErr((e as Error).message));
    return () => { alive = false; };
  }, []);
  const run = async (key: string, fromSaves: boolean, fn: () => Promise<RosterData>) => {
    setBusy(key); setErr(null);
    try { onOpenBase(await fn(), fromSaves); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const onFile = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => run('file', false, () => api.rosterOpenFile(f.name, String(reader.result)));
    reader.onerror = () => setErr('Could not read that file');
    reader.readAsDataURL(f);
  };
  // Outputs this app wrote are listed after the game's and downloaded rosters.
  const ours = (f: SaveFileInfo) => /^ROSTER-(GATE\d+|[A-Z0-9]{1,16})$/.test(f.name) && f.name !== 'ROSTER-Official';

  return (
    <div className="mx-auto mt-8 grid w-[960px] max-w-full grid-cols-1 gap-5 lg:grid-cols-[1fr_20rem]">
      <div className="rounded-xl border border-border bg-surface-1 p-5">
        <div className="text-sm font-bold tracking-tight text-neutral-100">Start from a roster</div>
        <p className="mt-1 text-[12px] leading-relaxed text-neutral-400">
          A Madden 27 ROSTER save: the game's own, one you downloaded, or one this app wrote. Move, cut and edit its players, then export a new file. The base file is never changed.
        </p>
        <div className="mt-4 rounded-lg border border-border bg-surface-0">
          <header className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-2">
            <span className="text-xs font-semibold text-neutral-100">Madden 27 saves</span>
            <span className="truncate text-[10px] text-muted" title={state?.dir}>{state?.dir ?? ''}</span>
          </header>
          <div className="max-h-80 overflow-auto">
            {!state && !err && <div className="px-3 py-4 text-xs text-muted">Looking…</div>}
            {state?.files.length === 0 && <div className="px-3 py-5 text-center text-xs text-muted">No ROSTER files in this folder. Browse for one below.</div>}
            {state && [...state.files].sort((a, b) => Number(ours(a)) - Number(ours(b)) || b.modified - a.modified).map((f) => (
              <button key={f.name} onClick={() => run(f.name, true, () => api.rosterOpenSaved(f.name))} disabled={!!busy}
                className="flex w-full items-center justify-between gap-3 border-b border-border/60 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-surface-2 disabled:opacity-50">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-neutral-100">{f.name}</span>
                  <span className="block text-[10px] text-muted">{fmtSize(f.sizeBytes)} · {fmtWhen(f.modified)}{ours(f) ? ' · written by this app' : ''}</span>
                </span>
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-primary">{busy === f.name ? 'Opening…' : 'Open'}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={() => fileRef.current?.click()} disabled={!!busy} className={btn}>{busy === 'file' ? 'Opening…' : 'Browse for a roster file…'}</button>
          <input ref={fileRef} type="file" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
          {err && <span className="text-xs text-red-300">{err}</span>}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-1 p-5">
        <div className="text-sm font-bold tracking-tight text-neutral-100">Your rosters</div>
        <p className="mt-1 text-[12px] text-neutral-400">Saved in this app. Each one remembers its base file and your changes.</p>
        <div className="mt-3 flex flex-col gap-1.5">
          {savedDocs.length === 0 && <div className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs text-muted">Nothing saved yet</div>}
          {savedDocs.map((d) => (
            <div key={d.id} className="flex items-center gap-2 rounded-lg border border-border bg-surface-0 px-3 py-2">
              <button onClick={() => onOpenDoc(d)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-medium text-neutral-100">{d.name || 'Untitled roster'}</span>
                <span className="block truncate text-[10px] text-muted">from {d.base.fileName} · {fmtWhen(d.updatedAt)}</span>
              </button>
              <button onClick={() => { if (confirm(`Delete "${d.name || 'Untitled roster'}"? The base file is not touched.`)) onDeleteDoc(d.id); }} className="text-[10px] text-muted hover:text-red-300">Delete</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: The view**

`web/src/components/rosters/RostersView.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { cache } from '../../cache';
import type { GameVersion, RosterData, RosterDoc } from '../../types';
import { newRosterDoc } from '../../rosterDoc';
import { RosterPicker } from './RosterPicker';
import { RosterBuilder } from './RosterBuilder';

interface Open { data: RosterData; doc: RosterDoc; readOnly: boolean; notice: string | null }

/**
 * Rosters: open a Madden 27 ROSTER save (or a roster saved here), move, cut and edit
 * players, and export a new ROSTER file. The document holds only deltas; the base is
 * re-read whenever a saved roster is opened, and a changed base makes it read-only.
 */
export function RostersView({ gameVersion }: { gameVersion: GameVersion }) {
  const [saved, setSaved] = useState<RosterDoc[]>([]);
  const [open, setOpen] = useState<Open | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refreshSaved = useCallback(() => { cache.rosterList().then(setSaved).catch(() => {}); }, []);
  useEffect(refreshSaved, [refreshSaved]);

  const openBase = (data: RosterData, fromSaves: boolean) => { setOpen({ data, doc: newRosterDoc(data, fromSaves), readOnly: false, notice: null }); setErr(null); };

  /** Re-read a saved roster's base: from the saves folder by name, else the server's kept copy. */
  const openDoc = async (doc: RosterDoc) => {
    setLoading(doc.id); setErr(null);
    try {
      let data: RosterData | null = null;
      try { data = await api.rosterOpenSaved(doc.base.fileName); } catch { data = null; }
      if (!data) { try { data = await api.rosterGet(doc.base.openedId); } catch { data = null; } }
      if (!data) {
        setErr(`The base file ${doc.base.fileName} is not in the saves folder any more. Put it back, or pick it again.`);
        return;
      }
      const changed = data.crc !== doc.base.crc || data.sizeBytes !== doc.base.sizeBytes;
      setOpen({
        data,
        doc: { ...doc, base: { ...doc.base, openedId: data.id } },
        readOnly: changed,
        notice: changed ? `${doc.base.fileName} has changed since this roster was saved, so it is read-only. Pick the base file again to keep editing.` : null,
      });
    } finally {
      setLoading(null);
    }
  };

  const save = async (doc: RosterDoc) => { await cache.rosterSet(doc); refreshSaved(); };
  const del = async (id: string) => { await cache.rosterDel(id); refreshSaved(); };
  /** Bind the open document to a freshly picked base and lift the read-only state. */
  const rebase = (data: RosterData, fromSaves: boolean) => setOpen((o) => o && ({
    data, readOnly: false, notice: null,
    doc: { ...o.doc, base: { fileName: data.name, openedId: data.id, sizeBytes: data.sizeBytes, crc: data.crc, fromSaves }, updatedAt: Date.now() },
  }));
  const [rebasing, setRebasing] = useState(false);

  if (open && rebasing) {
    return (
      <div className="h-full overflow-auto px-6 py-4">
        <div className="mx-auto mt-2 w-[960px] max-w-full rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-gold">Pick the base file for "{open.doc.name || 'Untitled roster'}". Your moves and edits are kept.</div>
        <RosterPicker savedDocs={[]} onOpenBase={(d, fromSaves) => { rebase(d, fromSaves); setRebasing(false); }} onOpenDoc={() => {}} onDeleteDoc={() => {}} />
        <div className="mx-auto mt-3 w-[960px] max-w-full"><button onClick={() => setRebasing(false)} className="text-xs text-muted hover:text-neutral-200">Cancel</button></div>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="h-full overflow-auto px-6 py-4">
        {gameVersion !== 'm27' && (
          <div className="mx-auto mt-2 w-[960px] max-w-full rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-gold">Rosters are Madden 27 files. Madden 26 rosters are not supported yet.</div>
        )}
        {err && <div className="mx-auto mt-2 w-[960px] max-w-full rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-red-200">{err}</div>}
        {loading && <div className="mx-auto mt-2 w-[960px] max-w-full text-xs text-muted">Opening…</div>}
        <RosterPicker savedDocs={saved} onOpenBase={openBase} onOpenDoc={openDoc} onDeleteDoc={del} />
      </div>
    );
  }

  return (
    <RosterBuilder
      data={open.data}
      doc={open.doc}
      readOnly={open.readOnly}
      notice={open.notice}
      onChange={(doc) => setOpen((o) => o && { ...o, doc })}
      onSave={save}
      onClose={() => { setOpen(null); refreshSaved(); }}
      onRebase={() => setRebasing(true)}
    />
  );
}
```

- [ ] **Step 3: The builder, list-only version**

`web/src/components/rosters/RosterBuilder.tsx` (Tasks 5 and 6 add the team panel, the drawer and export; this version has the header, the notice and the left roster list so the view is usable and typechecks):

```tsx
import { useMemo, useState } from 'react';
import type { RosterData, RosterDoc } from '../../types';
import { docCounts, isDocEmpty, viewPlayers, type ViewPlayer } from '../../rosterDoc';
import { groupForId } from '../../constants';
import { DevBadge, Icon, ICONS, Portrait, RatingChip } from '../ui';

const GROUPS: [string, string][] = [
  ['ALL', 'All positions'], ['QB', 'QB'], ['RB', 'RB'], ['WR', 'WR'], ['TE', 'TE'], ['OL', 'OL'],
  ['EDGE', 'EDGE'], ['IDL', 'IDL'], ['LB', 'LB'], ['CB', 'CB'], ['S', 'S'], ['K', 'K'], ['P', 'P'],
];
export const selectCls = 'rounded-md border border-border bg-surface-0 px-2.5 py-1.5 text-sm text-neutral-300 focus:border-primary focus:outline-none';
export const btnCls = 'rounded-md border border-border-strong bg-surface-2 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-surface-3 disabled:opacity-50';

/** One row of the left panel: a base-roster player with his current team. */
export function PlayerRow({ p, selected, onClick, onDragStart, trailing }: {
  p: ViewPlayer; selected?: boolean; onClick?: () => void; onDragStart?: (e: React.DragEvent) => void; trailing?: React.ReactNode;
}) {
  return (
    <div draggable={!!onDragStart} onDragStart={onDragStart} onClick={onClick}
      className={`flex items-center gap-2.5 border-b border-border/60 px-3 py-1.5 text-sm ${onClick ? 'cursor-pointer' : ''} ${selected ? 'bg-primary/10' : 'hover:bg-surface-2/70'}`}>
      <Portrait src={p.portrait} size="xs" />
      <span className="min-w-0 flex-1 truncate font-medium text-neutral-100">
        {p.edited && <span className="mr-1 text-gold" title="edited">●</span>}{p.firstName} {p.lastName}
        <span className="ml-1 text-[10px] text-muted">#{p.jersey}</span>
      </span>
      <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-neutral-300">{p.position}</span>
      <RatingChip ovr={p.overall} size="sm" />
      <span className="w-6 text-right text-xs tabular-nums text-neutral-400">{p.age || ''}</span>
      <DevBadge dev={p.devTrait} />
      <span className={`w-9 text-right text-xs ${p.moved ? 'text-gold' : 'text-neutral-400'}`} title={p.teamName ?? 'Free agent'}>{p.team ?? 'FA'}</span>
      {trailing}
    </div>
  );
}

export function RosterBuilder({ data, doc, readOnly, notice, onChange, onSave, onClose, onRebase }: {
  data: RosterData;
  doc: RosterDoc;
  readOnly: boolean;
  notice: string | null;
  onChange: (doc: RosterDoc) => void;
  onSave: (doc: RosterDoc) => Promise<void>;
  onClose: () => void;
  onRebase: () => void;
}) {
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [team, setTeam] = useState('ALL');
  const [group, setGroup] = useState('ALL');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'ovr' | 'name' | 'age' | 'pos'>('ovr');

  const players = useMemo(() => viewPlayers(doc, data), [doc, data]);
  const counts = docCounts(doc, data);
  const teams = useMemo(() => data.teams.filter((t) => t.id !== data.freeAgentTeamId).sort((a, b) => a.city.localeCompare(b.city)), [data]);
  const rows = useMemo(() => {
    let r = players;
    if (team === 'FA') r = r.filter((p) => !p.team);
    else if (team !== 'ALL') r = r.filter((p) => p.team === team);
    if (group !== 'ALL') r = r.filter((p) => groupForId(p.positionId) === group);
    if (search.trim()) { const q = search.toLowerCase(); r = r.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q)); }
    return [...r].sort((a, b) => {
      if (sort === 'ovr') return b.overall - a.overall || a.lastName.localeCompare(b.lastName);
      if (sort === 'age') return a.age - b.age || b.overall - a.overall;
      if (sort === 'pos') return a.positionId - b.positionId || b.overall - a.overall;
      return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
    });
  }, [players, team, group, search, sort]);

  const dirty = savedAt == null ? !isDocEmpty(doc) || !!doc.name : doc.updatedAt > savedAt;
  const save = async () => { await onSave(doc); setSavedAt(Date.now()); };
  const close = () => { if (dirty && !confirm('Close without saving? Unsaved moves and edits are lost.')) return; onClose(); };

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <input value={doc.name} onChange={(e) => onChange({ ...doc, name: e.target.value, updatedAt: Date.now() })} placeholder="Roster name" disabled={readOnly}
            className="w-64 rounded-md border border-border bg-surface-0 px-3 py-1.5 text-sm font-semibold text-neutral-100 placeholder:font-normal placeholder:text-muted focus:border-primary focus:outline-none disabled:opacity-60" />
          <div className="text-xs text-neutral-400">
            from <span className="text-neutral-200">{doc.base.fileName}</span> · <b className="text-neutral-200">{counts.moved}</b> moved · <b className="text-neutral-200">{counts.cut}</b> cut · <b className="text-neutral-200">{counts.edited}</b> edited
          </div>
        </div>
        <div className="flex items-center gap-2">
          {readOnly ? (
            <button onClick={onRebase} className={btnCls}>Pick the base file again</button>
          ) : (
            <button onClick={save} disabled={!dirty} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-light disabled:opacity-50">{dirty ? 'Save' : 'Saved'}</button>
          )}
          <button onClick={close} className={btnCls}>Close</button>
        </div>
      </header>
      {notice && <div className="mx-6 mt-3 rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-gold">{notice}</div>}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 px-6 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-1">
          <div className="flex items-center gap-1 border-b border-border px-2 pt-2">
            <span className="rounded-t-md bg-surface-2 px-3 py-1.5 text-xs font-semibold text-neutral-100">Roster</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"><Icon path={ICONS.search} className="h-4 w-4" /></span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search players…" className="w-48 rounded-md border border-border bg-surface-0 py-1.5 pl-8 pr-3 text-sm text-neutral-200 placeholder:text-muted focus:border-primary focus:outline-none" />
            </div>
            <select value={team} onChange={(e) => setTeam(e.target.value)} className={selectCls}>
              <option value="ALL">All teams</option>
              {teams.map((t) => <option key={t.id} value={t.abbr}>{t.city} {t.name}</option>)}
              <option value="FA">Free agents</option>
            </select>
            <select value={group} onChange={(e) => setGroup(e.target.value)} className={selectCls}>
              {GROUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={selectCls}>
              <option value="ovr">Sort: Overall</option>
              <option value="name">Sort: Name</option>
              <option value="pos">Sort: Position</option>
              <option value="age">Sort: Age</option>
            </select>
            <span className="ml-auto text-xs tabular-nums text-muted"><span className="font-semibold text-neutral-300">{rows.length}</span> of {data.count}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {rows.slice(0, 1500).map((p) => <PlayerRow key={p.id} p={p} />)}
            {rows.length > 1500 && <div className="px-3 py-3 text-center text-xs text-muted">Showing the first 1,500 of {rows.length}. Narrow by team or position.</div>}
          </div>
        </section>
        <section className="flex min-h-0 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted">Teams</section>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `cd web && npm run typecheck`
Expected: clean (nothing renders `RostersView` yet; Task 7 wires it).

- [ ] **Step 5: Commit**

```bash
cd draft-class-generator
git add web/src/components/rosters/RosterPicker.tsx web/src/components/rosters/RostersView.tsx web/src/components/rosters/RosterBuilder.tsx
git commit -m "Rosters view: picker for base files and saved rosters, builder with the roster list

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: TeamPanel with moves, cuts and drag

**Files:**
- Create: `web/src/components/rosters/TeamPanel.tsx`
- Modify: `web/src/components/rosters/RosterBuilder.tsx`

**Interfaces:**
- Produces: `TeamPanel({ data, players, selectedTeam, onSelectTeam, onMove(pgid, teamId), onEdit(pgid), readOnly })`. Drag payload: `dataTransfer.setData('text/plain', String(pgid))` on the left rows and on team rows; team chips and the selected team's list are drop targets.

- [ ] **Step 1: The panel**

`web/src/components/rosters/TeamPanel.tsx`:

```tsx
import { useMemo, useState } from 'react';
import type { RosterData } from '../../types';
import { groupByPosition, type ViewPlayer } from '../../rosterDoc';
import { PlayerRow, btnCls, selectCls } from './RosterBuilder';

const ROSTER_LIMIT = 53;

/** Team chips (with counts) and the selected team's roster grouped by position. Rows can be
 *  moved with a menu, cut, edited, or dragged onto another team chip. */
export function TeamPanel({ data, players, selectedTeam, onSelectTeam, onMove, onEdit, readOnly }: {
  data: RosterData;
  players: ViewPlayer[];
  selectedTeam: number;
  onSelectTeam: (teamId: number) => void;
  onMove: (pgid: number, teamId: number) => void;
  onEdit: (pgid: number) => void;
  readOnly: boolean;
}) {
  const [moving, setMoving] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const fa = data.freeAgentTeamId;
  const teams = useMemo(() => data.teams.filter((t) => t.id !== fa).sort((a, b) => a.abbr.localeCompare(b.abbr)), [data, fa]);
  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of players) m.set(p.teamId, (m.get(p.teamId) ?? 0) + 1);
    return m;
  }, [players]);
  const onTeam = useMemo(() => players.filter((p) => p.teamId === selectedTeam), [players, selectedTeam]);
  const groups = useMemo(() => groupByPosition(onTeam), [onTeam]);
  const selected = data.teams.find((t) => t.id === selectedTeam);
  const isFa = selectedTeam === fa;

  const drop = (teamId: number) => (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(null);
    if (readOnly) return;
    const pgid = Number(e.dataTransfer.getData('text/plain'));
    if (pgid) onMove(pgid, teamId);
  };
  const allowDrop = (teamId: number) => (e: React.DragEvent) => { if (!readOnly) { e.preventDefault(); setDragOver(teamId); } };

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-1">
      <div className="flex flex-wrap gap-1 border-b border-border px-2 py-2">
        {teams.map((t) => {
          const n = counts.get(t.id) ?? 0;
          return (
            <button key={t.id} onClick={() => onSelectTeam(t.id)} onDragOver={allowDrop(t.id)} onDragLeave={() => setDragOver(null)} onDrop={drop(t.id)}
              title={`${t.city} ${t.name}`}
              className={`rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums transition-colors ${t.id === selectedTeam ? 'bg-primary text-white' : dragOver === t.id ? 'bg-primary/30 text-neutral-100' : 'bg-surface-2 text-neutral-300 hover:bg-surface-3'}`}>
              {t.abbr} <span className={n > ROSTER_LIMIT ? 'text-red-300' : 'opacity-70'}>{n}</span>
            </button>
          );
        })}
        <button onClick={() => onSelectTeam(fa)} onDragOver={allowDrop(fa)} onDragLeave={() => setDragOver(null)} onDrop={drop(fa)}
          className={`rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums ${isFa ? 'bg-primary text-white' : dragOver === fa ? 'bg-primary/30 text-neutral-100' : 'bg-surface-2 text-neutral-300 hover:bg-surface-3'}`}>
          FA <span className="opacity-70">{counts.get(fa) ?? 0}</span>
        </button>
      </div>

      <div className="flex items-baseline justify-between border-b border-border px-3 py-2">
        <div className="text-sm font-bold text-neutral-100">{isFa ? 'Free agents' : selected ? `${selected.city} ${selected.name}` : ''}</div>
        <div className="text-xs tabular-nums text-muted">
          {isFa ? `${onTeam.length} players` : <><span className={onTeam.length > ROSTER_LIMIT ? 'font-semibold text-red-300' : 'font-semibold text-neutral-300'}>{onTeam.length}</span> of {ROSTER_LIMIT}</>}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto" onDragOver={allowDrop(selectedTeam)} onDrop={drop(selectedTeam)}>
        {onTeam.length === 0 && <div className="px-3 py-8 text-center text-xs text-muted">Nobody here. Drag players in from the roster list.</div>}
        {groups.map((g) => (
          <div key={g.position}>
            <div className="sticky top-0 z-10 flex items-baseline justify-between bg-surface-2 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
              <span>{g.position}</span><span className="tabular-nums">{g.players.length}</span>
            </div>
            {g.players.map((p) => (
              <PlayerRow key={p.id} p={p} onDragStart={readOnly ? undefined : (e) => e.dataTransfer.setData('text/plain', String(p.id))}
                trailing={
                  <span className="flex items-center gap-1">
                    {moving === p.id ? (
                      <select autoFocus defaultValue="" onBlur={() => setMoving(null)} onChange={(e) => { const v = Number(e.target.value); setMoving(null); if (v) onMove(p.id, v); }} className={`${selectCls} px-1 py-0.5 text-xs`}>
                        <option value="">Move to…</option>
                        {teams.filter((t) => t.id !== p.teamId).map((t) => <option key={t.id} value={t.id}>{t.abbr}</option>)}
                        {!isFa && <option value={fa}>Free agents</option>}
                      </select>
                    ) : (
                      <>
                        <button disabled={readOnly} onClick={() => setMoving(p.id)} className={`${btnCls} px-2 py-0.5`}>Move to…</button>
                        {!isFa && <button disabled={readOnly} onClick={() => onMove(p.id, fa)} className={`${btnCls} px-2 py-0.5`}>Cut</button>}
                        <button disabled={readOnly} onClick={() => onEdit(p.id)} className={`${btnCls} px-2 py-0.5`}>Edit</button>
                      </>
                    )}
                  </span>
                } />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wire it into the builder**

In `RosterBuilder.tsx`:
- import `TeamPanel` and `withMove` from `../../rosterDoc`;
- add state `const [selectedTeam, setSelectedTeam] = useState(() => data.teams.find((t) => t.id !== data.freeAgentTeamId)?.id ?? data.freeAgentTeamId);`
- add `const move = (pgid: number, teamId: number) => { if (!readOnly) onChange(withMove(doc, pgid, teamId, data)); };`
- left rows become draggable: `<PlayerRow key={p.id} p={p} onDragStart={readOnly ? undefined : (e) => e.dataTransfer.setData('text/plain', String(p.id))} />`
- replace the dashed "Teams" placeholder section with `<TeamPanel data={data} players={players} selectedTeam={selectedTeam} onSelectTeam={setSelectedTeam} onMove={move} onEdit={() => {}} readOnly={readOnly} />` (the edit callback is filled in Task 6).

- [ ] **Step 3: Typecheck and commit**

Run: `cd web && npm run typecheck` (expected clean).

```bash
cd draft-class-generator
git add web/src/components/rosters/TeamPanel.tsx web/src/components/rosters/RosterBuilder.tsx
git commit -m "Rosters view: team panel with moves, cuts and drag between teams

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Edit drawer and export

**Files:**
- Modify: `web/src/components/rosters/RosterBuilder.tsx`

**Interfaces:**
- Consumes: `PlayerEditPanel` (Task 3), `withEdit`, `withoutEdits` (Task 2), `api.rosterBuild`, `api.equipmentOptions(2026, 'm27')`, `api.genericHeads('m27')`.

- [ ] **Step 1: The drawer**

In `RosterBuilder.tsx` add imports: `useEffect` from react, `api` from `../../api`, `PlayerEditPanel` from `../PlayerEditPanel`, `withEdit, withoutEdits` from `../../rosterDoc`, `POS_NAMES` from `../../constants`, `type GearOption, type RosterBuildResult` from `../../types`, `type PlayerFieldEdit` from `../../api`.

Add state and loaders inside the component:

```tsx
  const [editing, setEditing] = useState<number | null>(null);
  const [gearOpts, setGearOpts] = useState<Record<string, GearOption[]>>({});
  const [heads, setHeads] = useState<Record<string, string[]>>({});
  useEffect(() => {
    api.equipmentOptions(2026, 'm27').then(setGearOpts).catch(() => {});
    api.genericHeads('m27').then(setHeads).catch(() => {});
  }, []);
  const editingPlayer = editing != null ? players.find((p) => p.id === editing) ?? null : null;
  const edit = (pgid: number, patch: PlayerFieldEdit) => { if (!readOnly) onChange(withEdit(doc, pgid, patch)); };
```

Pass `onEdit={setEditing}` to `TeamPanel`, and make left rows open the drawer on click: `onClick={() => setEditing(p.id)}`.

Render the drawer after the grid, inside the root div:

```tsx
      {editingPlayer && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={() => setEditing(null)}>
          <aside className="flex h-full w-[28rem] max-w-full flex-col overflow-auto border-l border-border bg-surface-1 shadow-[0_0_48px_rgba(0,0,0,0.6)]" onClick={(e) => e.stopPropagation()}>
            <PlayerEditPanel
              title={`${editingPlayer.firstName} ${editingPlayer.lastName}`}
              subtitle={`${editingPlayer.teamName ?? 'Free agent'} · ${editingPlayer.yearsPro} yrs pro · ${editingPlayer.college ?? ''}`}
              positions={POS_NAMES}
              player={{
                position: data.players.find((p) => p.id === editingPlayer.id)!.position,
                overall: data.players.find((p) => p.id === editingPlayer.id)!.overall,
                age: data.players.find((p) => p.id === editingPlayer.id)!.age,
                dev: ['Normal', 'Star', 'Superstar', 'XFactor'][data.players.find((p) => p.id === editingPlayer.id)!.devTrait] ?? 'Normal',
                jersey: data.players.find((p) => p.id === editingPlayer.id)!.jersey,
                ratings: data.players.find((p) => p.id === editingPlayer.id)!.ratings,
                bodyType: data.players.find((p) => p.id === editingPlayer.id)!.visuals.bodyType,
                genericHead: data.players.find((p) => p.id === editingPlayer.id)!.visuals.genericHead,
                helmet: data.players.find((p) => p.id === editingPlayer.id)!.visuals.helmet,
                facemask: data.players.find((p) => p.id === editingPlayer.id)!.visuals.facemask,
              }}
              edit={doc.edits[editingPlayer.id]}
              onEdit={(patch) => edit(editingPlayer.id, patch)}
              heads={heads}
              gearOpts={gearOpts}
              gameVersion="m27"
              year={2026}
              showJersey
            />
            <div className="mt-auto flex items-center justify-between gap-2 border-t border-border px-4 py-3">
              <button onClick={() => { if (!readOnly) onChange(withoutEdits(doc, editingPlayer.id)); }} disabled={readOnly || !doc.edits[editingPlayer.id]} className={btnCls}>Reset edits</button>
              <button onClick={() => setEditing(null)} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-light">Done</button>
            </div>
          </aside>
        </div>
      )}
```

Tidy the repeated lookup: compute `const baseOf = (id: number) => data.players.find((p) => p.id === id)!;` once and use `baseOf(editingPlayer.id)` for the ten fields (the panel needs base values; the edit overlays them).

- [ ] **Step 2: Export**

Add state `const [exporting, setExporting] = useState(false); const [result, setResult] = useState<RosterBuildResult | null>(null); const [exportErr, setExportErr] = useState<string | null>(null);` and:

```tsx
  const exportToMadden = async () => {
    if (readOnly) return;
    setExporting(true); setExportErr(null); setResult(null);
    try {
      await save();
      const r = await api.rosterBuild({ baseName: doc.base.fromSaves ? doc.base.fileName : undefined, baseId: doc.base.openedId, name: doc.name, moves: doc.moves, edits: doc.edits });
      setResult(r);
    } catch (e) {
      setExportErr((e as Error).message);
    } finally {
      setExporting(false);
    }
  };
```

The server prefers `baseName` (a file in the saves folder) and falls back to the kept copy by `baseId`, which is why a browsed file sends only the id.

In the header, before Close: `<button onClick={exportToMadden} disabled={readOnly || exporting || !doc.name.trim()} title={doc.name.trim() ? '' : 'Name the roster first'} className="rounded-md bg-gold px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90 disabled:opacity-50">{exporting ? 'Writing…' : 'Export to Madden'}</button>`.

Under the notice, the result and error banners:

```tsx
      {exportErr && <div className="mx-6 mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-red-200">{exportErr}</div>}
      {result && (
        <div className="mx-6 mt-3 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-green-100">
          Wrote <code className="rounded bg-black/30 px-1">{result.output}</code> to the Madden 27 saves folder: {result.moved} moved, {result.cut} cut, {result.edited} edited. In Madden: Load and Save, then Load, then Roster.
          {result.skipped.length > 0 && <div className="mt-1 text-gold">Skipped: {result.skipped.join('; ')}</div>}
        </div>
      )}
```

- [ ] **Step 3: Typecheck, run the web tests, commit**

Run: `cd web && npm run typecheck && node --import tsx --test "src/**/*.test.ts"`
Expected: clean; all web tests pass.

```bash
cd draft-class-generator
git add web/src/components/rosters/RosterBuilder.tsx
git commit -m "Rosters view: edit drawer with the shared player panel; export through the build route

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Sidebar rail, home door, menu and wiring

**Files:**
- Create: `web/src/components/SideRail.tsx`
- Modify: `web/src/App.tsx`, `web/src/components/TopBar.tsx`, `web/src/components/MenuBar.tsx`, `web/src/components/HomePage.tsx`, `CHANGELOG.md`

- [ ] **Step 1: The rail**

`web/src/components/SideRail.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { AppView } from '../App';
import { railEntries } from '../rosterDoc';

const KEY = 'rail:collapsed';

/** Left navigation: Home, Draft classes, Rosters, Franchise tools. Icons only on narrow
 *  windows or when collapsed; the collapse choice is remembered per browser. */
export function SideRail({ view, onSetView, franchiseEnabled }: { view: AppView; onSetView: (v: AppView) => void; franchiseEnabled: boolean }) {
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem(KEY, collapsed ? '1' : '0'); } catch { /* private mode */ } }, [collapsed]);
  const entries = railEntries(franchiseEnabled);
  return (
    <nav aria-label="Areas" className={`flex shrink-0 flex-col border-r border-border bg-surface-1 py-2 ${collapsed ? 'w-14' : 'w-14 lg:w-28'}`}>
      {entries.map((e) => {
        const active = view === e.view;
        return (
          <button key={e.view} onClick={() => onSetView(e.view)} aria-current={active ? 'page' : undefined} title={e.label}
            className={`mx-1.5 my-0.5 flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-semibold leading-tight transition-colors ${active ? 'bg-primary/15 text-primary-light' : 'text-neutral-400 hover:bg-surface-2 hover:text-neutral-100'}`}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={e.icon} /></svg>
            <span className={`text-center ${collapsed ? 'hidden' : 'hidden lg:block'}`}>{e.label}</span>
          </button>
        );
      })}
      <button onClick={() => setCollapsed((c) => !c)} title={collapsed ? 'Expand' : 'Collapse'} className="mx-1.5 mt-auto hidden rounded-lg px-1 py-2 text-[10px] text-muted hover:bg-surface-2 hover:text-neutral-200 lg:block">
        {collapsed ? '»' : '«'}
      </button>
    </nav>
  );
}
```

- [ ] **Step 2: Wire the app**

In `App.tsx`:
- import `SideRail` and `RostersView` (`./components/rosters/RostersView`).
- `AppView` already has `'rosters'` (Task 2).
- Wrap the main area: replace `<div className="flex min-h-0 flex-1">` … `<main …>` with

```tsx
      <div className="flex min-h-0 flex-1">
        <SideRail view={view} onSetView={setView} franchiseEnabled={franchiseEnabled} />
        <main className="min-w-0 flex-1">
          {view === 'home' && <HomePage onSelect={setView} franchiseEnabled={franchiseEnabled} title={…same as today…} />}
          {view === 'rosters' && <RostersView gameVersion={gameVersion} />}
          …franchise and draft as today…
```
- Home is available without the franchise flag now: change `onGoHome={() => setView(franchiseEnabled ? 'home' : 'draft')}` to `onGoHome={() => setView('home')}`. Leave the initial view logic (`draft`, or `home` when franchise is on) as it is.

In `TopBar.tsx`: delete the `ViewToggle` component and its use (the `franchiseEnabled && (<><div className="ml-1 h-6 w-px bg-border" /><ViewToggle … /></>)` block); the `view`/`onSetView` props stay for `draft` checks. Update the subtitle under the title: `{franchiseEnabled ? 'Draft classes · Rosters · Franchise tools' : 'Draft classes · Rosters'}`.

In `MenuBar.tsx` View menu, after the Draft classes item: `{ kind: 'item', label: 'Rosters', checked: view === 'rosters', onSelect: () => onSetView('rosters') },`.

In `HomePage.tsx`: add a `franchiseEnabled: boolean` prop; render the grid as `md:grid-cols-2 xl:grid-cols-3` when franchise is on, `md:grid-cols-2` otherwise; add the third door between the two:

```tsx
        <ModePanel
          accent="blue"
          icon={ROSTERS_ICON}
          title="Rosters"
          tagline="Build a custom Madden 27 roster from any ROSTER save."
          features={[
            'Move, cut and sign players across all 32 teams',
            'Edit ratings, positions, dev traits and gear',
            'Exports a new ROSTER file; the base is never touched',
          ]}
          onClick={() => onSelect('rosters')}
        />
```
with `const ROSTERS_ICON = 'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0';` and the franchise door wrapped in `{franchiseEnabled && (…)}`. Update the intro line to "Generate historically-rated draft classes, build a custom roster, or run tools for your franchise. Choose where to start."

- [ ] **Step 3: CHANGELOG**

Under `## Unreleased` → `### Features`, add:

```markdown
- Rosters: open a Madden 27 ROSTER save, move, cut and edit its players, and export it as a new roster file.
- A left sidebar switches between Draft classes, Rosters and Franchise tools.
```

- [ ] **Step 4: Typecheck, tests, preview**

Run: `cd web && npm run typecheck && node --import tsx --test "src/**/*.test.ts"` (expected clean, all pass).

Then `preview_start` the `server` and `web` entries and verify in the browser pane:
1. The rail shows Home, Draft classes, Rosters (and Franchise tools when the server flag is on); the active entry follows clicks; the top bar no longer has the Draft | Franchise toggle; the home page shows the Rosters door.
2. Rosters: the picker lists `ROSTER-Official`, `ROSTER-GATE1`, `ROSTER-GATE2`; opening ROSTER-Official shows the builder with 3,111 players and 32 team chips.
3. Drag Geno Smith from the roster list onto CHI: the CHI count rises, the header says 1 moved, his row shows CHI in gold. Cut a Bear: 1 cut, he appears under FA.
4. Edit a player: change overall to 90 and one rating; the row shows the edited dot; Reset edits clears it; redo the edit.
5. Name the roster "Preview", Save, Close, reopen it from "Your rosters": the moves and edits are back.
6. Export to Madden: the banner names `ROSTER-PREVIEW` with the counts; the file exists in the saves folder at 6,291,530 bytes.
7. `resize_window` to `mobile`: the rail is icons only, no horizontal scroll; back to `desktop`.
Check `read_console_messages` for errors. Take a screenshot of the builder for the user.

- [ ] **Step 5: Commit**

```bash
cd draft-class-generator
git add web/src/components/SideRail.tsx web/src/App.tsx web/src/components/TopBar.tsx web/src/components/MenuBar.tsx web/src/components/HomePage.tsx CHANGELOG.md
git commit -m "Sidebar rail with Home, Draft classes, Rosters and Franchise tools; Rosters view wired in

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Then tell the user the Rosters view is live and that the next plan (pool adds and Gate 3) can start.

---

## Self-review notes

- Spec coverage for phase 3: rail (Task 7), empty state picker with saves folder, browse and saved rosters (Task 4), builder header with name, base, counts, Save, Export, Close (Tasks 4 and 6), left Roster tab with filters and sort (Task 4; the Pool tab is phase 4), team strip with counts and 53-man count, grouped by position, Move to…, Cut, Edit, drag (Task 5), edit drawer with the extracted panel (Tasks 3 and 6), document in the browser cache with deltas only and the read-only path when the base changed (Tasks 2 and 4), export refusing base and official via the server (Task 1 + existing build), Madden 26 notice (Task 4), CHANGELOG (Task 7).
- Deviations from the spec, deliberate: export sends `baseId` as a fallback so a browsed file (not in the saves folder) can still be built (Task 1); the document also stores `openedId` and `fromSaves` for that.
- Type consistency: `RosterDoc.base = { fileName, openedId, sizeBytes, crc, fromSaves }` from Task 2 on; `newRosterDoc(data, fromSaves)`; `RosterPicker.onOpenBase(data, fromSaves)`. `PlayerEditPanel` props are the same in Tasks 3 and 6. `PlayerRow`, `btnCls`, `selectCls` are exported from `RosterBuilder.tsx` and imported by `TeamPanel.tsx`; `TeamPanel` is imported back by `RosterBuilder.tsx` (a module cycle that is fine for function components resolved at render time). If Vite warns about the cycle, move `PlayerRow`, `btnCls` and `selectCls` to `web/src/components/rosters/shared.tsx`.
