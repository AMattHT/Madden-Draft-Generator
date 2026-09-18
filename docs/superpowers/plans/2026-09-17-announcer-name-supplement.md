# Announcer Name Supplement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift announcer-name coverage for exported players from 2,727 surnames to about 8,180 by adding a supplement table built from MyFranchise 2.0.2's commentary map, with our own verified table always winning.

**Architecture:** A one-off script writes `server/data/lookups/m27-commentary-supplement.json` holding only the surnames our generated `m27-field-stats.json` lacks. `commentaryIdFor` in `M27Fields.ts` tries the primary table, then the supplement, then returns 0. Both draft classes and roster additions already call that one function.

**Tech Stack:** TypeScript, Node 22+ (`node --test`), tsx for scripts. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-17-announcer-name-supplement-design.md`

## Global Constraints

- Branch: `ui-lift`. Every commit lands there.
- Stage explicit file lists; never `git add -A` (another session commits to this repo concurrently).
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Tests: from `server/`, `node --import tsx --test src/services/__tests__/<File>.test.ts` for one file; `npm test` for all.
- Surname keys are normalised by the existing `surnameKey` in `M27Fields.ts`: lowercase, letters only.
- Conflicts (a surname in both tables) resolve to the primary table. The supplement must not contain them.
- The generator script for the primary table (`server/scripts/build-m27-field-stats.ts`) is not touched.
- Source data lives outside the repo at `C:/Users/amatthews/Downloads/MyFranchise-2.0.2-extracted/static/player/commentary.json` and is never committed.
- Adding a file under `server/data/lookups/` changes the generator fingerprint in `server/src/routes/health.ts` automatically, so no cache version bump is needed.

---

### Task 1: Build script and the supplement file

**Files:**
- Create: `server/scripts/build-commentary-supplement.ts`
- Create: `server/data/lookups/m27-commentary-supplement.json` (script output)

**Interfaces:**
- Produces: the JSON file `{ _source: string, _built: string, surnameCommentary: Record<string, number> }` whose keys are `surnameKey`-normalised and absent from the primary table.

- [ ] **Step 1: Write the script**

```ts
/**
 * Build data/lookups/m27-commentary-supplement.json: announcer ids for surnames the
 * generated m27-field-stats.json does not know, taken from MyFranchise 2.0.2's
 * static/player/commentary.json (the same EA id space). Surnames both tables know
 * are dropped: the primary table's ids were verified in-game.
 *
 *   npx tsx scripts/build-commentary-supplement.ts <path to MyFranchise commentary.json>
 */
import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../src/config/paths';

const src = process.argv[2];
if (!src || !fs.existsSync(src)) {
  console.error('usage: build-commentary-supplement.ts <path to MyFranchise static/player/commentary.json>');
  process.exit(1);
}

const surnameKey = (s: string) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');

const primary = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'm27-field-stats.json'), 'utf8')).surnameCommentary as Record<string, number>;
const source = JSON.parse(fs.readFileSync(src, 'utf8')) as Record<string, number>;

const out: Record<string, number> = {};
let conflicts = 0, skipped = 0;
for (const [name, id] of Object.entries(source)) {
  const key = surnameKey(name);
  const n = Number(id);
  if (!key || !Number.isInteger(n) || n <= 0) { skipped++; continue; }
  if (key in primary) { conflicts++; continue; }
  if (key in out) continue; // two spellings that normalise the same: first wins
  out[key] = n;
}

const file = path.join(LOOKUPS_DIR, 'm27-commentary-supplement.json');
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(file, JSON.stringify({
  _source: `MyFranchise 2.0.2 static/player/commentary.json (EA announcer ids), surnames absent from m27-field-stats.json; built ${new Date().toISOString().slice(0, 10)} by scripts/build-commentary-supplement.ts`,
  _built: new Date().toISOString().slice(0, 10),
  surnameCommentary: sorted,
}, null, 0));
console.log(`primary ${Object.keys(primary).length}, source ${Object.keys(source).length}, added ${Object.keys(sorted).length}, conflicts ${conflicts}, skipped ${skipped} -> ${file}`);
```

- [ ] **Step 2: Run it**

Run (from `server/`):
```bash
npx tsx scripts/build-commentary-supplement.ts "C:/Users/amatthews/Downloads/MyFranchise-2.0.2-extracted/static/player/commentary.json"
```
Expected: a line like `primary 2727, source 7865, added 5453, conflicts 152, skipped 0 -> ...m27-commentary-supplement.json` (added may differ by a few if spellings collapse).

- [ ] **Step 3: Spot-check the file**

Run (from `server/`):
```bash
node -e "const d=require('./data/lookups/m27-commentary-supplement.json');console.log(Object.keys(d.surnameCommentary).length, d.surnameCommentary.aaitui, d.surnameCommentary.abdulquddus, 'reece' in d.surnameCommentary)"
```
Expected: `<count> 5657 5 false` (Aaitui and Abdul-Quddus are supplement-only; Reece is in the primary table so it must be absent here).

- [ ] **Step 4: Commit**

```bash
git add server/scripts/build-commentary-supplement.ts server/data/lookups/m27-commentary-supplement.json
git commit -m "Announcer names: supplement table built from the MyFranchise commentary map

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Fallback lookup in `commentaryIdFor`

**Files:**
- Modify: `server/src/services/M27Fields.ts:46-81` (the `load`/`surnameKey`/`commentaryIdFor` region)
- Test: `server/src/services/__tests__/CommentarySupplement.test.ts`

**Interfaces:**
- Consumes: `m27-commentary-supplement.json` from Task 1.
- Produces: unchanged signature `commentaryIdFor(lastName: string): number`, now falling back to the supplement.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { commentaryIdFor } from '../M27Fields';
import { LOOKUPS_DIR } from '../../config/paths';

test('a surname only the supplement knows resolves to the supplement id', () => {
  assert.equal(commentaryIdFor('Aaitui'), 5657);
});

test('a surname the primary table knows keeps the primary id', () => {
  // Reece is 4113 in our verified table (MyFranchise says 4117); the supplement never carries it.
  assert.equal(commentaryIdFor('Reece'), 4113);
  const sup = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'm27-commentary-supplement.json'), 'utf8'));
  assert.equal('reece' in sup.surnameCommentary, false);
});

test('an unknown surname still writes 0', () => {
  assert.equal(commentaryIdFor('Zxqvnotaname'), 0);
});

test('normalisation: punctuation, spaces and case do not matter', () => {
  assert.equal(commentaryIdFor("Abdul-Quddus"), 5);
  assert.equal(commentaryIdFor('abdul quddus'), 5);
  assert.equal(commentaryIdFor('ABDULQUDDUS'), 5);
});
```

- [ ] **Step 2: Run it to see it fail**

Run (from `server/`): `node --import tsx --test src/services/__tests__/CommentarySupplement.test.ts`
Expected: the first and fourth tests FAIL (`0 !== 5657`, `0 !== 5`); the other two pass.

- [ ] **Step 3: Add the fallback**

In `server/src/services/M27Fields.ts`, directly after the existing `load()` function (line 51) add:

```ts
let supplement: Record<string, number> | null = null;
/** Announcer ids for surnames the generated table lacks (data/lookups/m27-commentary-supplement.json,
 *  built by scripts/build-commentary-supplement.ts from MyFranchise's map). Missing file -> empty. */
function loadSupplement(): Record<string, number> {
  if (supplement) return supplement;
  try {
    supplement = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'm27-commentary-supplement.json'), 'utf8')).surnameCommentary ?? {};
  } catch {
    supplement = {};
  }
  return supplement!;
}
```

Replace the body of `commentaryIdFor`:

```ts
/** Announcer id for a surname (both games share the id space), or 0 when the game
 *  has no audio for it (the game's own classes write 0 too). Our verified table first,
 *  then the MyFranchise-derived supplement. */
export function commentaryIdFor(lastName: string): number {
  const key = surnameKey(lastName);
  return load().surnameCommentary[key] ?? loadSupplement()[key] ?? 0;
}
```

- [ ] **Step 4: Run the tests**

Run (from `server/`): `node --import tsx --test src/services/__tests__/CommentarySupplement.test.ts`
Expected: 4 passing.

Then the full suite: `npm test` from `server/`. Expected: all passing (the existing `M27Fields.test.ts` still expects Smith -> 4600 and the unknown name -> 0).

- [ ] **Step 5: Typecheck and commit**

Run (from `server/`): `npm run typecheck`. Expected: no output.

```bash
git add server/src/services/M27Fields.ts server/src/services/__tests__/CommentarySupplement.test.ts
git commit -m "Announcer names: fall back to the supplement table for surnames the game classes never showed

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Changelog and the in-game check

**Files:**
- Modify: `CHANGELOG.md:1-3`

- [ ] **Step 1: Add an Unreleased entry**

At the top of `CHANGELOG.md`, directly under `# Changelog`, insert (leave a blank line before `## 1.4.2`):

```markdown
## Unreleased

### Features

- About 5,400 more surnames get called by the broadcast: players whose name the game had audio for but our table never saw (6,200 of the 32,000-player pool) now carry their announcer id.
```

If an `## Unreleased` section already exists, add the bullet under its `### Features` instead.

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "Changelog: announcer name supplement

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 3: Hand the in-game gate to the user**

Tell the user: export any class that contains a supplement-only surname (for example a class with a player named Aaitui, Abbrederis or Achane; the 2023 class has Achane) with the Madden 27 game version, import it, and confirm the broadcast says the name. Only the user can run this; do not claim it passed.
