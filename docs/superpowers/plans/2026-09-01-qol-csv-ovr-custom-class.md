# QOL pass (full CSV, Madden-owned OVR, hand-picked classes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three user-requested quality-of-life features: a CSV export with every attribute, a read-only overall that always shows Madden's recompute, and a builder for hand-picked 402-player draft classes from the whole 32,140-player pool.

**Architecture:** The Express server (`server/src`) already generates classes from `BaselinePlayer[]` through `DraftClassBuilder.preview`/`buildMdc*`; the React client (`web/src`) renders and edits them, persisting edits in IndexedDB. Feature 1 is client-only (a pure CSV builder). Feature 2 adds one batch recompute endpoint and removes the OVR input. Feature 3 adds a stable per-player `key`, a catalog endpoint, a `picked` source for the existing custom/export routes, and a builder dialog on the client.

**Tech Stack:** TypeScript, Express 4, React 18 + Vite + Tailwind 4, idb-keyval, node:test via `tsx`.

## Global Constraints

- Everything lands on `master`; do **not** cut a release or bump versions (releases are on hold until the FMT reads M27).
- Class capacity is `402` (`LOGICAL_CAPACITY` in `DraftClassBuilder.ts`).
- Server tests: `cd server && npm test` (node:test via tsx; data-bound tests use `skipWithoutData` from `server/src/services/__tests__/data.ts`).
- Type-check both packages before each commit: `cd server && npm run typecheck`, `cd web && npm run typecheck`.
- Menu copy: "Export CSV (all attributes)". Custom class export filename: `CAREERDRAFT-<SLUG>` (letters+digits of the name, upper-cased, max 16 chars, fallback `CUSTOM`).
- Player key format: `draftYear|league|normFirst|normLast|pick-or-u`, with `#2`, `#3` suffixes for collisions.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## Part 1 — Full CSV export

### Task 1: Pure CSV builder with tests

**Files:**
- Modify: `web/src/constants.ts` (append `ATTR_COLUMNS`)
- Modify: `web/src/components/PlayerTable.tsx:16-75` (replace the `ATTR_COLUMNS` definition with a re-export)
- Create: `web/src/csv.ts`
- Create: `web/src/csv.test.ts`
- Modify: `web/package.json` (add `tsx` devDependency and a `test` script)
- Modify: `web/src/components/ExportMenu.tsx:105-130` (use the builder; rename the item; BOM)

**Interfaces:**
- Produces: `buildClassCsv(rows: PlayerRow[], edits: ClassEdits): string` (no BOM; the caller prepends `﻿`), `CSV_FIXED_COLUMNS: string[]`.
- Produces: `ATTR_COLUMNS` exported from `web/src/constants.ts` (same shape as today, `{ id, label, key }[] as const`).

- [ ] **Step 1: Move `ATTR_COLUMNS` to `constants.ts`**

Cut the whole `export const ATTR_COLUMNS = [ … ] as const;` block (with its doc comment) out of `web/src/components/PlayerTable.tsx` and paste it at the end of `web/src/constants.ts`. In `PlayerTable.tsx` add, where it was:

```ts
import { ATTR_COLUMNS } from '../constants';
export { ATTR_COLUMNS };
```

Run `cd web && npm run typecheck`. Expected: no errors (ClassView still imports `ATTR_COLUMNS` from `./PlayerTable`).

- [ ] **Step 2: Add the test runner to the web package**

```bash
cd web && npm i -D tsx
```

In `web/package.json` scripts add: `"test": "node --import tsx --test \"src/**/*.test.ts\""`.

- [ ] **Step 3: Write the failing test** — `web/src/csv.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClassCsv, CSV_FIXED_COLUMNS } from './csv';
import { ATTR_COLUMNS } from './constants';
import type { PlayerRow } from './types';

function row(over: Partial<PlayerRow> = {}): PlayerRow {
  const ratings: Record<string, number> = {};
  for (const c of ATTR_COLUMNS) ratings[c.key] = 50;
  return {
    id: 1, pick: 1, firstName: 'Peyton', lastName: 'Manning', position: 'QB', positionId: 0,
    overall: 80, devTrait: 3, archetype: 1, archetypeName: 'Field General', draftYear: 1998,
    round: 1, draftPick: 1, wav: 271, wavSource: 'actual', face: 'asset', college: 'Tennessee',
    age: 22, heightInches: 77, weight: 230, jersey: 18, bodyType: 'Standard', photoUrl: null,
    team: { abbr: 'IND', name: 'Indianapolis Colts', logo: null },
    combine: { forty: 4.8, bench: null, vertical: 30, broad: null, cone: null, shuttle: null },
    ratings, ...over,
  };
}

test('header is the fixed columns followed by every attribute abbreviation', () => {
  const [header] = buildClassCsv([row()], {}).split('\n');
  assert.equal(header, [...CSV_FIXED_COLUMNS, ...ATTR_COLUMNS.map((c) => c.label)].join(','));
  assert.equal(CSV_FIXED_COLUMNS.length, 27);
});

test('edits to names, position, dev, bio and ratings are applied', () => {
  const csv = buildClassCsv([row()], { 1: { lastName: 'Manning, Sr.', position: 3, devTrait: 0, weight: 240, speed: 99 } });
  const [, line] = csv.split('\n');
  const cells = line.split(',');
  assert.equal(cells[2], '"Manning, Sr."'); // quoted because of the comma
  assert.equal(cells[3], 'WR');
  assert.equal(cells[6], 'Normal');
  assert.equal(cells[CSV_FIXED_COLUMNS.indexOf('Weight')], '240');
  assert.equal(cells[CSV_FIXED_COLUMNS.length + ATTR_COLUMNS.findIndex((c) => c.key === 'speed')], '99');
});

test('height is written both formatted and in inches; blanks for missing combine numbers', () => {
  const [, line] = buildClassCsv([row()], {}).split('\n');
  const cells = line.split(',');
  assert.equal(cells[CSV_FIXED_COLUMNS.indexOf('Height')], '"6\'5"""');
  assert.equal(cells[CSV_FIXED_COLUMNS.indexOf('HeightIn')], '77');
  assert.equal(cells[CSV_FIXED_COLUMNS.indexOf('Bench')], '');
});
```

- [ ] **Step 4: Run it to make sure it fails**

Run: `cd web && npm test`
Expected: FAIL — cannot find module `./csv`.

- [ ] **Step 5: Implement `web/src/csv.ts`**

```ts
import { ATTR_COLUMNS, DEV_NAMES, POS_NAMES, fmtHeight } from './constants';
import type { ClassEdits, PlayerRow } from './types';

/** Fixed (non-attribute) columns, in sheet order. The 54 attributes follow, using
 *  Madden's abbreviations from ATTR_COLUMNS. */
export const CSV_FIXED_COLUMNS = [
  'Pick', 'First', 'Last', 'Pos', 'Archetype', 'OVR', 'Dev', 'wAV', 'wAVSource', 'Team', 'College',
  'DraftYear', 'Round', 'DraftPick', 'Height', 'HeightIn', 'Weight', 'Age', 'Jersey', 'BodyType', 'Face',
  'Forty', 'Bench', 'Vertical', 'Broad', 'Cone', 'Shuttle',
];

const esc = (v: unknown): string => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One board as a spreadsheet, with the player's edits applied the way the export
 *  applies them (names, position, dev, bio, every rating). No byte-order mark:
 *  the caller adds it so tests can compare plain text. */
export function buildClassCsv(rows: PlayerRow[], edits: ClassEdits): string {
  const lines = [[...CSV_FIXED_COLUMNS, ...ATTR_COLUMNS.map((c) => c.label)].join(',')];
  for (const r of rows) {
    const e = edits[r.id] ?? {};
    const num = (k: string, base: number) => (e[k] != null && e[k] !== '' ? Number(e[k]) : base);
    const str = (k: string, base: string) => (typeof e[k] === 'string' ? (e[k] as string) : base);
    const posId = num('position', r.positionId);
    const heightIn = num('heightInches', r.heightInches);
    const fixed = [
      r.pick, str('firstName', r.firstName), str('lastName', r.lastName), POS_NAMES[posId] ?? r.position,
      r.archetypeName, num('overall', r.overall), DEV_NAMES[num('devTrait', r.devTrait)] ?? '', r.wav ?? '',
      r.wavSource, r.team?.abbr ?? '', r.college, r.draftYear, r.round ?? '', r.draftPick ?? '',
      fmtHeight(heightIn), heightIn, num('weight', r.weight), num('age', r.age), num('jerseyNum', r.jersey),
      str('bodyType', r.bodyType), r.face,
      r.combine?.forty ?? '', r.combine?.bench ?? '', r.combine?.vertical ?? '', r.combine?.broad ?? '',
      r.combine?.cone ?? '', r.combine?.shuttle ?? '',
    ];
    const attrs = ATTR_COLUMNS.map((c) => num(c.key, r.ratings?.[c.key] ?? 0));
    lines.push([...fixed, ...attrs].map(esc).join(','));
  }
  return lines.join('\n');
}
```

- [ ] **Step 6: Run the tests**

Run: `cd web && npm test`
Expected: 3 passing.

- [ ] **Step 7: Use it in `ExportMenu.tsx`**

Replace the body of `downloadCsv()` with:

```ts
  function downloadCsv() {
    const csv = '﻿' + buildClassCsv(rows, edits);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DraftClass_${year}_${league}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMsg({ ok: true, text: `Exported DraftClass_${year}_${league}.csv — ${rows.length} players, overalls and all ${ATTR_COLUMNS.length} attributes${editedCount ? `, ${editedCount} edited` : ''}.` });
  }
```

Add imports `import { buildClassCsv } from '../csv';` and `import { ATTR_COLUMNS } from '../constants';`; drop the now-unused `DEV_NAMES` import if nothing else uses it. Change the menu button to:

```tsx
          <button
            onClick={() => { setOpen(false); downloadCsv(); }}
            disabled={!!busy}
            className={item}
            title="Every player with overall, dev trait, bio, combine and all 54 attributes — edits applied. Reveals hidden ratings even with Spoilers off."
          >
            <span>Export CSV (all attributes)</span>
          </button>
```

- [ ] **Step 8: Type-check and commit**

```bash
cd web && npm run typecheck && npm test
git add web/package.json web/package-lock.json web/src/constants.ts web/src/csv.ts web/src/csv.test.ts web/src/components/PlayerTable.tsx web/src/components/ExportMenu.tsx
git commit -m "Export the whole sheet: every attribute, combine and bio, with edits applied"
```

---

## Part 2 — The overall belongs to Madden

### Task 2: Batch recompute service and endpoint

**Files:**
- Create: `server/src/services/RecomputeService.ts`
- Create: `server/src/services/__tests__/RecomputeService.test.ts`
- Modify: `server/src/routes/draft.ts` (add `POST /draft/recompute-batch` after `/draft/recompute`)

**Interfaces:**
- Produces: `recomputeBatch(items: RecomputeItem[], gameVersion: 'm26' | 'm27'): RecomputeResult[]` where
  `RecomputeItem = { id: number; positionId: number; archetype: number; ratings: Record<string, number>; overall?: number }`
  and `RecomputeResult = { id: number; overall: number | null; archetype: number }`.
- Route body: `{ gameVersion, items }` → `{ results: RecomputeResult[] }`.

- [ ] **Step 1: Write the failing test** — `server/src/services/__tests__/RecomputeService.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recomputeBatch } from '../RecomputeService';
import { gameOverall, RATING_KEYS } from '../AttributeModel';

const flat = (v: number) => Object.fromEntries(RATING_KEYS.map((k) => [k, v]));

test('each item comes back with the overall Madden computes from its attributes', () => {
  const items = [
    { id: 1, positionId: 0, archetype: 0, ratings: flat(70) },
    { id: 2, positionId: 3, archetype: 0, ratings: flat(85) },
  ];
  const out = recomputeBatch(items, 'm27');
  assert.equal(out.length, 2);
  for (const [i, it] of items.entries()) {
    const g = gameOverall(it.ratings, it.positionId, it.archetype, 'm27');
    assert.equal(out[i].id, it.id);
    assert.equal(out[i].overall, g.overall);
    assert.equal(out[i].archetype, g.archetype);
  }
});

test('a legacy overall target is honoured by reconciling the attributes first', () => {
  const [r] = recomputeBatch([{ id: 9, positionId: 0, archetype: 0, ratings: flat(60), overall: 80 }], 'm27');
  assert.ok(r.overall != null && Math.abs(r.overall - 80) <= 1, `landed on ${r.overall}`);
});

test('ratings are clamped to 0..99 and non-numbers ignored', () => {
  const ratings = { ...flat(50), speed: 500, awareness: -20, catching: Number.NaN };
  const [r] = recomputeBatch([{ id: 1, positionId: 3, archetype: 0, ratings }], 'm26');
  assert.ok(r.overall != null && r.overall >= 0 && r.overall <= 99);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd server && node --import tsx --test src/services/__tests__/RecomputeService.test.ts`
Expected: FAIL — cannot find module `../RecomputeService`.

- [ ] **Step 3: Implement `server/src/services/RecomputeService.ts`**

```ts
import { gameOverall, reconcileToTarget } from './AttributeModel';

export interface RecomputeItem {
  id: number;
  positionId: number;
  archetype: number;
  ratings: Record<string, number>;
  /** Legacy edit target: reconcile the attributes to it first (what the export does). */
  overall?: number;
}

export interface RecomputeResult {
  id: number;
  overall: number | null;
  archetype: number;
}

/**
 * Madden recomputes a prospect's overall from his attributes on import, so the
 * board must show that number for edited players. Pure, ~2 µs per item.
 */
export function recomputeBatch(items: RecomputeItem[], gameVersion: 'm26' | 'm27'): RecomputeResult[] {
  return items.map((it) => {
    const posId = Number(it.positionId) || 0;
    const archetype = Number(it.archetype) || 0;
    const ratings: Record<string, number> = {};
    for (const [k, v] of Object.entries(it.ratings ?? {})) {
      const n = Number(v);
      if (Number.isFinite(n)) ratings[k] = Math.max(0, Math.min(99, Math.round(n)));
    }
    if (it.overall != null && Number.isFinite(Number(it.overall))) {
      reconcileToTarget(ratings, posId, archetype, Number(it.overall), gameVersion);
    }
    const g = gameOverall(ratings, posId, archetype, gameVersion);
    return { id: Number(it.id), overall: g.overall, archetype: g.archetype };
  });
}
```

- [ ] **Step 4: Run the tests** — expected 3 passing.

- [ ] **Step 5: Add the route** in `server/src/routes/draft.ts` after `r.post('/draft/recompute', …)`:

```ts
/** Board-wide version of /recompute: the game's overall for every edited prospect
 *  in one call, so the OVR column and sort reflect attribute edits. */
r.post('/draft/recompute-batch', (req, res) => {
  const b = (req.body ?? {}) as { gameVersion?: string; items?: RecomputeItem[] };
  const gameVersion: 'm26' | 'm27' = b.gameVersion === 'm27' ? 'm27' : 'm26';
  const items = Array.isArray(b.items) ? b.items.slice(0, 402) : [];
  res.json({ results: recomputeBatch(items, gameVersion) });
});
```

with `import { recomputeBatch, RecomputeItem } from '../services/RecomputeService';`.

- [ ] **Step 6: Type-check, test, commit**

```bash
cd server && npm run typecheck && npm test
git add server/src/services/RecomputeService.ts server/src/services/__tests__/RecomputeService.test.ts server/src/routes/draft.ts
git commit -m "Recompute the game's overall for a whole board in one call"
```

### Task 3: Read-only overall in the card and on the board

**Files:**
- Modify: `web/src/api.ts` (add `recomputeBatch`)
- Modify: `web/src/components/ClassView.tsx:117-135` (overlay recomputed overalls onto `effRows`)
- Modify: `web/src/components/ProfileModal.tsx:280-305, 390-405, 535-540`

**Interfaces:**
- Consumes: `POST /api/draft/recompute-batch` from Task 2.
- Produces: `api.recomputeBatch(body: { gameVersion: GameVersion; items: … }): Promise<{ id: number; overall: number | null; archetype: number }[]>`.

- [ ] **Step 1: Add the client call** in `web/src/api.ts` next to `recompute`:

```ts
  /** The game's overall for every edited prospect on the board (see /recompute). */
  recomputeBatch: (body: { gameVersion: GameVersion; items: { id: number; positionId: number; archetype: number; ratings: Record<string, number>; overall?: number }[] }) =>
    fetch('/api/draft/recompute-batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then((r) => r.json() as Promise<{ results: { id: number; overall: number | null; archetype: number }[] }>)
      .then((r) => r.results),
```

- [ ] **Step 2: Overlay on the board** in `ClassView.tsx`. After the `effRows` memo, add a state `const [gameOvr, setGameOvr] = useState<Record<number, number>>({});` and an effect:

```ts
  // Madden recomputes the overall from the attributes on import, so edited
  // players show the game's number, not the generated target (debounced).
  useEffect(() => {
    const ids = Object.keys(edits).map(Number).filter((id) => {
      const e = edits[id]; if (!e) return false;
      return Object.keys(e).some((k) => k === 'position' || k === 'archetype' || k === 'overall' || k in (data.rows[0]?.ratings ?? {}));
    });
    if (!ids.length) { setGameOvr({}); return; }
    const t = setTimeout(() => {
      const items = ids.map((id) => {
        const r = data.rows.find((x) => x.id === id)!;
        const e = edits[id];
        const ratings: Record<string, number> = { ...r.ratings };
        for (const k of Object.keys(ratings)) if (e[k] != null && e[k] !== '') ratings[k] = Number(e[k]);
        return { id, positionId: e.position != null ? Number(e.position) : r.positionId, archetype: e.archetype != null ? Number(e.archetype) : r.archetype, ratings, overall: e.overall != null ? Number(e.overall) : undefined };
      });
      api.recomputeBatch({ gameVersion: data.gameVersion ?? 'm26', items })
        .then((res) => setGameOvr(Object.fromEntries(res.filter((x) => x.overall != null).map((x) => [x.id, x.overall as number]))))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [edits, data]);
```

and in the `effRows` mapping replace `overall: e.overall != null ? Number(e.overall) : r.overall,` with `overall: gameOvr[r.id] ?? (e.overall != null ? Number(e.overall) : r.overall),` and add `gameOvr` to the memo deps. Import `api` from `'../api'`.

- [ ] **Step 3: Card: the chip is the game's number.** In `ProfileModal.tsx`:

Change the `gameView` effect so it runs for *every* edited state exactly as now, but the chip uses it:

```tsx
              <RatingChip ovr={gameView?.overall ?? overall} size="sm" hidden={!spoilers} />
              {gameView && gameView.archetype != null && gameView.archetype !== archetype && (
                <span className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning"
                  title="Madden labels a prospect with whichever of its archetypes scores his attributes highest.">
                  as {archOpts.find((o) => o.id === gameView.archetype)?.name ?? `#${gameView.archetype}`}
                </span>
              )}
```

(delete the old "game shows" span). Delete the `Overall` label + `num('overall')` block from the ratings grid and change that grid to `grid-cols-2`. Keep `const overall = Number(patch.overall ?? row.overall);` (legacy patches) and the `reconcile` trigger on position/archetype.

Also: the radar/`tierColor(overall)` at line ~491 should use `gameView?.overall ?? overall`.

- [ ] **Step 4: Type-check, run the app, verify manually**

`cd web && npm run typecheck`. Then `npm run dev` from the repo root, open a class, edit a WR's SPD from the card: the chip changes; close the card; the OVR column shows the same number and sorting by OVR respects it. Change position to TE: attributes re-solve and the chip holds his level.

- [ ] **Step 5: Commit**

```bash
git add web/src/api.ts web/src/components/ClassView.tsx web/src/components/ProfileModal.tsx
git commit -m "Let Madden own the overall: the card and board show the game's recompute"
```

---

## Part 3 — Hand-picked classes

### Task 4: Stable player keys and the catalog

**Files:**
- Modify: `server/src/types/player.ts` (add `key?: string` to `BaselinePlayer`)
- Modify: `server/src/services/PlayerLookupService.ts` (`load()` assigns keys; add `byKeys`, `catalog`)
- Create: `server/src/services/__tests__/Catalog.test.ts`

**Interfaces:**
- Produces: `PlayerLookupService.byKeys(keys: string[]): { players: BaselinePlayer[]; missing: string[] }` (players in the order of `keys`, deduped),
  `PlayerLookupService.catalog(): CatalogPlayer[]` with
  `CatalogPlayer = { key: string; first: string; last: string; pos: string; mpos: string; grp: string; year: number; league: string; round: number | null; pick: number | null; college: string; wav: number | null; cal: number; hof: boolean; pb: number; ap1: number }`.
- Produces: `playerKey(p: BaselinePlayer): string` (exported for tests).

- [ ] **Step 1: Write the failing test** — `server/src/services/__tests__/Catalog.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlayerLookupService, playerKey } from '../PlayerLookupService';

test('every catalog player has a unique key and the key round-trips through byKeys', () => {
  const cat = PlayerLookupService.catalog();
  assert.ok(cat.length > 30000, `${cat.length} players`);
  assert.equal(new Set(cat.map((p) => p.key)).size, cat.length, 'keys unique');
  const manning = cat.find((p) => p.last === 'Manning' && p.first === 'Peyton');
  assert.ok(manning);
  assert.equal(manning!.key, '1998|NFL|peyton|manning|1');
  assert.equal(manning!.mpos, 'QB');
  assert.equal(manning!.grp, 'QB');
  const { players, missing } = PlayerLookupService.byKeys([manning!.key, 'nope|x|y|z|u', manning!.key]);
  assert.equal(players.length, 1);
  assert.equal(players[0].lastName, 'Manning');
  assert.deepEqual(missing, ['nope|x|y|z|u']);
});

test('playerKey uses u for undrafted and normalises names', () => {
  const p = { draftYear: 1994, league: 'NFL', firstName: 'Kurt', lastName: 'Warner‡', draftPick: null } as never;
  assert.equal(playerKey(p), '1994|NFL|kurt|warner|u');
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd server && node --import tsx --test src/services/__tests__/Catalog.test.ts`
Expected: FAIL — `playerKey` is not exported / `catalog` is not a function.

- [ ] **Step 3: Implement.** In `server/src/types/player.ts` add to `BaselinePlayer`:

```ts
  /** Stable identity across data refreshes: draftYear|league|first|last|pick (see playerKey). */
  key?: string;
```

In `PlayerLookupService.ts`:

```ts
/** Stable identity for a merged player: year|league|first|last|pick ('u' = undrafted). */
export function playerKey(p: Pick<BaselinePlayer, 'draftYear' | 'league' | 'firstName' | 'lastName' | 'draftPick'>): string {
  return `${p.draftYear}|${p.league}|${normalizeName(p.firstName)}|${normalizeName(p.lastName)}|${p.draftPick ?? 'u'}`;
}

let byKey: Map<string, BaselinePlayer> | null = null;
let catalogCache: CatalogPlayer[] | null = null;

export interface CatalogPlayer {
  key: string; first: string; last: string; pos: string; mpos: string; grp: string;
  year: number; league: string; round: number | null; pick: number | null; college: string;
  wav: number | null; cal: number; hof: boolean; pb: number; ap1: number;
}
```

At the end of `load()` (after `reconstructUnorderedDrafts();`):

```ts
  byKey = new Map();
  for (const p of merged) {
    let k = playerKey(p);
    for (let n = 2; byKey.has(k); n++) k = `${playerKey(p)}#${n}`;
    p.key = k;
    byKey.set(k, p);
  }
```

Add to the exported object:

```ts
  /** Players for a list of keys, in that order, deduped; unknown keys reported. */
  byKeys(keys: string[]): { players: BaselinePlayer[]; missing: string[] } {
    load();
    const seen = new Set<string>();
    const players: BaselinePlayer[] = [];
    const missing: string[] = [];
    for (const k of keys) {
      if (seen.has(k)) continue;
      seen.add(k);
      const p = byKey!.get(k);
      if (p) players.push(p); else missing.push(k);
    }
    return { players, missing };
  },

  /** Every merged player as a compact browse row (built once). */
  catalog(): CatalogPlayer[] {
    load();
    if (catalogCache) return catalogCache;
    catalogCache = [...byKey!.values()].map((p) => {
      const posId = PositionMapper.resolve(p.firstName, p.lastName, p.position, p.weight);
      return {
        key: p.key!, first: p.firstName, last: p.lastName, pos: p.position,
        mpos: PositionMapper.name(posId), grp: PositionMapper.groupFromId(posId),
        year: p.draftYear, league: p.league, round: p.draftRound, pick: p.draftPick, college: p.college,
        wav: p.wav, cal: RatingService.caliber(p, posId), hof: p.isHOF, pb: p.proBowls ?? 0, ap1: p.allPro1 ?? 0,
      };
    });
    return catalogCache;
  },
```

Import `PositionMapper` and `RatingService` at the top if not already imported (check for a circular import: `RatingService` imports `PositionMapper` only — fine; `PositionMapper` must not import `PlayerLookupService`. Verify with `grep -n "PlayerLookupService" server/src/services/PositionMapper.ts server/src/services/RatingService.ts` — expected no matches).

- [ ] **Step 4: Run the tests** — expected 2 passing.

- [ ] **Step 5: Add the route** in `server/src/routes/players.ts`:

```ts
/** Every player in the pool as compact rows for the class builder (one fetch, ~3 MB). */
r.get('/players/catalog', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ players: PlayerLookupService.catalog() });
});
```

- [ ] **Step 6: Type-check, test, commit**

```bash
cd server && npm run typecheck && npm test
git add server/src/types/player.ts server/src/services/PlayerLookupService.ts server/src/services/__tests__/Catalog.test.ts server/src/routes/players.ts
git commit -m "Give every player a stable key and serve the whole pool as a catalog"
```

### Task 5: The `picked` source on the server

**Files:**
- Modify: `server/src/services/DraftEnrichment.ts` (add `pickedClass`)
- Create: `server/src/services/ClassName.ts` (slug helper)
- Create: `server/src/services/__tests__/PickedClass.test.ts`
- Modify: `server/src/routes/draft.ts` (`/draft/custom` handles `source === 'picked'`)
- Modify: `server/src/routes/export.ts` (`/export/mdc` handles `source === 'picked'`)

**Interfaces:**
- Produces: `pickedClass(keys: string[], opts: { fill?: boolean }): Promise<{ players: BaselinePlayer[]; generatedCount: number; missing: string[]; truncatedKeys: boolean }>`.
- Produces: `classSlug(name: string): string` → `CAREERDRAFT-<SLUG>` is `` `CAREERDRAFT-${classSlug(name)}` ``.
- Request body additions (both routes): `source: 'picked'`, `keys: string[]`, `fill?: boolean`, `name?: string`.
- Preview response additions: `source: 'picked'`, `name`, `missing: string[]`, `truncatedKeys: boolean`, `pickedCount: number`.

- [ ] **Step 1: Write the failing tests** — `server/src/services/__tests__/PickedClass.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skipWithoutData } from './data';
import { pickedClass } from '../DraftEnrichment';
import { classSlug } from '../ClassName';
import { PlayerLookupService } from '../PlayerLookupService';
import { DraftClassBuilder } from '../DraftClassBuilder';

test('classSlug keeps letters and digits, upper-cases, caps at 16, falls back to CUSTOM', () => {
  assert.equal(classSlug('My 90s Legends!'), 'MY90SLEGENDS');
  assert.equal(classSlug('abcdefghijklmnopqrstuvwxyz'), 'ABCDEFGHIJKLMNOP');
  assert.equal(classSlug('   '), 'CUSTOM');
  assert.equal(classSlug(''), 'CUSTOM');
});

test('a picked class resolves keys, orders by greatness, reports unknown keys and pads to 402', skipWithoutData, async () => {
  const cat = PlayerLookupService.catalog();
  const key = (first: string, last: string, year: number) => cat.find((p) => p.first === first && p.last === last && p.year === year)!.key;
  const keys = [key('Ryan', 'Leaf', 1998), key('Peyton', 'Manning', 1998), key('Tom', 'Brady', 2000), 'ghost|NFL|a|b|u'];
  const { players, generatedCount, missing } = await pickedClass(keys, { fill: true });
  assert.deepEqual(missing, ['ghost|NFL|a|b|u']);
  assert.equal(players.length, 402);
  assert.equal(generatedCount, 399);
  assert.deepEqual(players.slice(0, 3).map((p) => p.lastName), ['Brady', 'Manning', 'Leaf']);
  // Fillers come from the era of the picks (median year 1998), not from today.
  assert.ok(players.slice(3).every((p) => p.draftYear === 1998), 'filler draft year');
  const short = await pickedClass(keys, { fill: false });
  assert.equal(short.players.length, 3);
  const pv = DraftClassBuilder.preview(short.players, 'madden', {}, 'm27');
  assert.equal(pv.rows.length, 3);
  assert.equal(pv.rows[0].lastName, 'Brady');
});

test('more than 402 keys are truncated and flagged', skipWithoutData, async () => {
  const keys = PlayerLookupService.catalog().slice(0, 450).map((p) => p.key);
  const r = await pickedClass(keys, { fill: false });
  assert.equal(r.players.length, 402);
  assert.equal(r.truncatedKeys, true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && node --import tsx --test src/services/__tests__/PickedClass.test.ts`
Expected: FAIL — cannot find module `../ClassName` / `pickedClass` not exported.

- [ ] **Step 3: Implement `server/src/services/ClassName.ts`**

```ts
/** Madden save name fragment for a user-named class: letters and digits only,
 *  upper-cased, at most 16 characters, so several custom classes coexist in the
 *  Saves folder as CAREERDRAFT-<SLUG>. */
export function classSlug(name: string): string {
  const s = String(name ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 16);
  return s || 'CUSTOM';
}
```

- [ ] **Step 4: Implement `pickedClass`** at the end of `DraftEnrichment.ts`:

```ts
/** Greatness score the All-Time class ranks by (wAV + accolades + HOF bonus). */
const greatness = (p: BaselinePlayer) => (p.wav ?? 0) + 4 * (p.allPro1 ?? 0) + 2 * (p.proBowls ?? 0) + (p.isHOF ? 40 : 0);

/**
 * A hand-picked class: the players behind `keys` (unknown keys reported, at most
 * 402 kept), ordered best-first by career greatness so pick 1 is the best player
 * chosen, enriched like any other class, and — when `fill` — padded to a full
 * class with generics from the era of the picks (their median draft year).
 */
export async function pickedClass(
  keys: string[],
  opts: { fill?: boolean } = {}
): Promise<{ players: BaselinePlayer[]; generatedCount: number; missing: string[]; truncatedKeys: boolean }> {
  const { players: found, missing } = PlayerLookupService.byKeys(keys);
  const truncatedKeys = found.length > FULL_CLASS_SIZE;
  const picked = [...found].sort((a, b) => greatness(b) - greatness(a)).slice(0, FULL_CLASS_SIZE);
  const real = await Promise.all(picked.map((p) => enrichOne(p)));
  let fillers: BaselinePlayer[] = [];
  if (opts.fill !== false && real.length < FULL_CLASS_SIZE && real.length > 0) {
    const years = real.map((p) => p.draftYear).sort((a, b) => a - b);
    const medianYear = years[Math.floor(years.length / 2)];
    fillers = GenericFillerService.build(medianYear, real);
  }
  return { players: [...real, ...fillers], generatedCount: fillers.length, missing, truncatedKeys };
}
```

Import `FULL_CLASS_SIZE` from `./GenericFillerService` (already imported module).

- [ ] **Step 5: Run the tests** — expected 3 passing (data-bound ones skip without the cache).

- [ ] **Step 6: Wire `/draft/custom`.** In `server/src/routes/draft.ts`, extend the body type with `keys?: unknown; fill?: unknown; name?: unknown;` and `source?: 'year' | 'alltime' | 'decade' | 'picked'`. Before the `alltime`/`decade` branch add:

```ts
  if (b.source === 'picked') {
    const keys = parseKeys(b.keys);
    if (!keys.length) return res.status(400).json({ error: 'no players picked' });
    const { players, generatedCount, missing, truncatedKeys } = await pickedClass(keys, { fill: b.fill !== false });
    if (!players.length) return res.status(404).json({ error: 'none of the picked players were found' });
    const preview = DraftClassBuilder.preview(players, mode, opts, gameVersion);
    const name = String(b.name ?? '').slice(0, 60);
    return res.json({ year: 0, league: `custom:${classSlug(name)}`, mode, gameVersion, source: 'picked', name, generatedCount, missing, truncatedKeys, pickedCount: players.length - generatedCount, ...preview });
  }
```

with a helper next to `parseInclude`:

```ts
/** `keys`: stable player keys for a hand-picked class (array or comma list), deduped, ≤ 402. */
function parseKeys(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  return [...new Set(list.map((x) => String(x).trim()).filter(Boolean))].slice(0, 402);
}
```

Imports: `pickedClass` from `../services/DraftEnrichment`, `classSlug` from `../services/ClassName`. Note the `league` echo is a placeholder; the client overrides `league` with its own `custom:<id>` key (Task 6) so edits stay with the saved class, not with its current name.

- [ ] **Step 7: Wire `/export/mdc`.** In `server/src/routes/export.ts`:

```ts
  const source = req.body?.source === 'alltime' ? 'alltime' : req.body?.source === 'decade' ? 'decade' : req.body?.source === 'picked' ? 'picked' : 'year';
```

and in the `let players; let filename` block add a first branch:

```ts
  if (source === 'picked') {
    const raw = req.body?.keys;
    const keys = [...new Set((Array.isArray(raw) ? raw : []).map((x: unknown) => String(x).trim()).filter(Boolean))].slice(0, 402);
    if (!keys.length) return res.status(400).json({ error: 'no players picked' });
    ({ players } = await pickedClass(keys, { fill: req.body?.fill !== false }));
    filename = `CAREERDRAFT-${classSlug(String(req.body?.name ?? ''))}`;
  } else if (source === 'alltime' || source === 'decade') {
```

Imports: `pickedClass`, `classSlug`.

- [ ] **Step 8: Type-check, test, commit**

```bash
cd server && npm run typecheck && npm test
git add server/src/services/ClassName.ts server/src/services/DraftEnrichment.ts server/src/services/__tests__/PickedClass.test.ts server/src/routes/draft.ts server/src/routes/export.ts
git commit -m "Generate and export a hand-picked class from stable player keys"
```

### Task 6: Client data model and loading for hand-picked classes

**Files:**
- Modify: `web/src/types.ts` (add `CustomClass`, `CatalogPlayer`; extend `GeneratedClass`)
- Modify: `web/src/cache.ts` (custom-class store)
- Modify: `web/src/api.ts` (`catalog()`, `generatedCustom` / `downloadMdc` / `saveMdcToSaves` accept `picked`)
- Modify: `web/src/App.tsx` (`DraftOpts.customId`, `DraftOpts.fill`, `isCustomDraft`, `select`, `applyDraftOpts`)

**Interfaces:**
- Produces: `CustomClass { id: string; name: string; keys: string[]; createdAt: number; updatedAt: number }`.
- Produces: `cache.customList(): Promise<CustomClass[]>`, `customGet(id)`, `customSet(c)`, `customDel(id)`.
- Produces: `api.catalog(): Promise<CatalogPlayer[]>` (module-cached after the first call).
- Produces: `DraftOpts.source` union gains `'picked'`; `DraftOpts.customId?: string`; `DraftOpts.fill?: boolean` (default `true`).
- Produces: `GeneratedClass` gains `source?: 'year' | 'alltime' | 'decade' | 'picked'; name?: string; missing?: string[]; truncatedKeys?: boolean; pickedCount?: number`.
- Edits/gear/filters for a custom class are keyed `year = 0, league = 'custom:<id>'`.

- [ ] **Step 1: Types.** In `web/src/types.ts` add:

```ts
/** A saved hand-picked class (player keys are stable across data refreshes). */
export interface CustomClass {
  id: string;
  name: string;
  keys: string[];
  createdAt: number;
  updatedAt: number;
}

/** One row of the whole-pool catalog the class builder browses. */
export interface CatalogPlayer {
  key: string; first: string; last: string; pos: string; mpos: string; grp: string;
  year: number; league: string; round: number | null; pick: number | null; college: string;
  wav: number | null; cal: number; hof: boolean; pb: number; ap1: number;
}
```

and to `GeneratedClass`:

```ts
  source?: 'year' | 'alltime' | 'decade' | 'picked';
  name?: string; // hand-picked class name
  missing?: string[]; // picked keys the data no longer has
  truncatedKeys?: boolean; // more than 402 keys were sent
  pickedCount?: number; // real (non-filler) players in a picked class
```

- [ ] **Step 2: Cache.** In `web/src/cache.ts` add inside `cache`:

```ts
  // Hand-picked classes: one record per class under custom:<id>.
  async customList(): Promise<CustomClass[]> {
    const all = (await keys()) as string[];
    const out: CustomClass[] = [];
    for (const k of all) if (/^custom:/.test(String(k))) { const c = await get<CustomClass>(k); if (c) out.push(c); }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  },
  customGet: (id: string): Promise<CustomClass | undefined> => get<CustomClass>(`custom:${id}`),
  customSet: (c: CustomClass) => set(`custom:${c.id}`, c),
  customDel: (id: string) => del(`custom:${id}`),
```

Import `CustomClass` from `./types`. Note `cachedYears()` matches `^class:` so `custom:` keys do not pollute it.

- [ ] **Step 3: API.** In `web/src/api.ts`:

```ts
let catalogCache: CatalogPlayer[] | null = null;
```

and inside `api`:

```ts
  /** The whole player pool for the class builder; fetched once per session. */
  async catalog(): Promise<CatalogPlayer[]> {
    if (catalogCache) return catalogCache;
    const r = await jget<{ players: CatalogPlayer[] }>('/api/players/catalog');
    catalogCache = r.players;
    return catalogCache;
  },
```

Extend `generatedCustom`'s `opts` type: `source: 'year' | 'alltime' | 'decade' | 'picked'; keys?: string[]; fill?: boolean; name?: string;`. Extend the `draftOpts` parameter type of `downloadMdc` and `saveMdcToSaves` the same way (`source` union + `keys?`, `fill?`, `name?`, `customId?`), and in `downloadMdc` set the filename:

```ts
    a.download =
      draftOpts?.source === 'picked' ? `CAREERDRAFT-${(draftOpts.name ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 16) || 'CUSTOM'}`
      : draftOpts?.source === 'alltime' ? 'CAREERDRAFT-ALLTIMEGREATS'
      : draftOpts?.source === 'decade' ? `CAREERDRAFT-${draftOpts.decade}sGREATS`
      : `CAREERDRAFT-${year}DRAFT`;
```

Import `CatalogPlayer` from `./types`.

- [ ] **Step 4: App state.** In `web/src/App.tsx`:

```ts
export interface DraftOpts {
  source: 'year' | 'alltime' | 'decade' | 'picked';
  …existing fields…
  customId?: string; // hand-picked class id (source === 'picked')
  fill?: boolean; // pad a short hand-picked class to 402 (default true)
}
export const isCustomDraft = (o: DraftOpts) =>
  o.source !== 'year' || …unchanged…;
```

In `select`, compute the league/edit key for picked classes and branch the fetch:

```ts
      const league = baseOpts.source === 'alltime' ? 'all-time'
        : baseOpts.source === 'decade' ? `${baseOpts.decade}s`
        : baseOpts.source === 'picked' ? `custom:${baseOpts.customId ?? 'none'}`
        : useLeague ?? effLeague(year);
```

and `ekYear`: `opts.source === 'alltime' || opts.source === 'picked' ? 0 : …`. Inside `if (custom) {` before calling `api.generatedCustom`, load the saved class:

```ts
          let picked: { keys: string[]; name: string } | undefined;
          if (opts.source === 'picked') {
            const c = opts.customId ? await cache.customGet(opts.customId) : undefined;
            if (!c) throw new Error('That hand-picked class no longer exists');
            picked = { keys: c.keys, name: c.name };
          }
          const live = await api.generatedCustom({ …existing…, keys: picked?.keys, fill: opts.fill !== false, name: picked?.name });
          if (req !== reqRef.current) return;
          live.fetchedAt = Date.now();
          live.gameVersion = useVersion;
          if (picked) live.league = league; // edits key on the saved class id, not its name
```

`applyDraftOpts`: the year for picked is `0` — extend the ternary: `next.source === 'alltime' || next.source === 'picked' ? 0 : …`.

- [ ] **Step 5: Type-check and commit**

```bash
cd web && npm run typecheck
git add web/src/types.ts web/src/cache.ts web/src/api.ts web/src/App.tsx
git commit -m "Load, key and export hand-picked classes on the client"
```

### Task 7: The class builder UI

**Files:**
- Create: `web/src/components/ClassBuilder.tsx`
- Modify: `web/src/components/DraftOptions.tsx` (fourth source, class picker, Build button, fill checkbox)
- Modify: `web/src/components/ClassView.tsx` (header for picked classes; pass through `onOpenBuilder`)
- Modify: `web/src/App.tsx` (builder open state; `onSaveCustom`)

**Interfaces:**
- Consumes: `api.catalog()`, `cache.custom*`, `DraftOpts` from Task 6.
- Produces: `<ClassBuilder open initial onClose onGenerate />` where `onGenerate(c: CustomClass, fill: boolean)` saves and applies `{ source: 'picked', customId: c.id, fill }`.

- [ ] **Step 1: `ClassBuilder.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { cache } from '../cache';
import { POS_GROUP_ORDER } from '../constants';
import type { CatalogPlayer, CustomClass } from '../types';
import { Icon, ICONS } from './ui';

const CAP = 402;
const SHOW_MAX = 400;
type SortKey = 'year' | 'name' | 'pos' | 'pick' | 'wav' | 'cal' | 'pb';

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const greatness = (p: CatalogPlayer) => (p.wav ?? 0) + 4 * p.ap1 + 2 * p.pb + (p.hof ? 40 : 0);

/**
 * Hand-pick a class from the whole pool: browse/sort/filter the 32k catalog on the
 * left, build up to 402 on the right, save it by name, generate it.
 */
export function ClassBuilder({ initial, onClose, onGenerate }: {
  initial: CustomClass | null;
  onClose: () => void;
  onGenerate: (c: CustomClass, fill: boolean) => void;
}) {
  const [catalog, setCatalog] = useState<CatalogPlayer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<CustomClass[]>([]);
  const [draft, setDraft] = useState<CustomClass>(initial ?? { id: newId(), name: '', keys: [], createdAt: Date.now(), updatedAt: Date.now() });
  const [fill, setFill] = useState(true);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [grp, setGrp] = useState('ALL');
  const [from, setFrom] = useState(1936);
  const [to, setTo] = useState(2026);
  const [league, setLeague] = useState('ALL');
  const [hof, setHof] = useState(false);
  const [sort, setSort] = useState<SortKey>('cal');

  const loadCatalog = () => { setError(null); api.catalog().then(setCatalog).catch((e) => setError((e as Error).message)); };
  useEffect(loadCatalog, []);
  useEffect(() => { cache.customList().then(setSaved); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const byKey = useMemo(() => new Map((catalog ?? []).map((p) => [p.key, p])), [catalog]);
  const picked = new Set(draft.keys);
  const years = useMemo(() => { const s = new Set((catalog ?? []).map((p) => p.year)); return [...s].sort((a, b) => a - b); }, [catalog]);
  const leagues = useMemo(() => [...new Set((catalog ?? []).map((p) => p.league))].sort(), [catalog]);

  const list = useMemo(() => {
    if (!catalog) return [];
    const needle = q.trim().toLowerCase();
    let r = catalog.filter((p) => p.year >= from && p.year <= to);
    if (grp !== 'ALL') r = r.filter((p) => p.grp === grp);
    if (league !== 'ALL') r = r.filter((p) => p.league === league);
    if (hof) r = r.filter((p) => p.hof);
    if (needle) r = r.filter((p) => `${p.first} ${p.last} ${p.college}`.toLowerCase().includes(needle));
    const pickNo = (p: CatalogPlayer) => (p.round == null ? 99 : p.round) * 1000 + (p.pick ?? 999);
    r.sort((a, b) =>
      sort === 'year' ? b.year - a.year || pickNo(a) - pickNo(b)
      : sort === 'name' ? a.last.localeCompare(b.last) || a.first.localeCompare(b.first)
      : sort === 'pos' ? a.mpos.localeCompare(b.mpos) || b.cal - a.cal
      : sort === 'pick' ? pickNo(a) - pickNo(b) || b.year - a.year
      : sort === 'wav' ? (b.wav ?? -1) - (a.wav ?? -1)
      : sort === 'pb' ? b.pb - a.pb || b.cal - a.cal
      : b.cal - a.cal || (b.wav ?? -1) - (a.wav ?? -1));
    return r;
  }, [catalog, q, grp, from, to, league, hof, sort]);

  const setKeys = (keys: string[]) => setDraft((d) => ({ ...d, keys, updatedAt: Date.now() }));
  const add = (k: string) => { if (!picked.has(k) && draft.keys.length < CAP) setKeys([...draft.keys, k]); };
  const remove = (k: string) => setKeys(draft.keys.filter((x) => x !== k));
  const addAllShown = () => {
    const room = CAP - draft.keys.length;
    const fresh = list.filter((p) => !picked.has(p.key)).slice(0, room).map((p) => p.key);
    if (fresh.length) setKeys([...draft.keys, ...fresh]);
  };

  const pickedPlayers = draft.keys.map((k) => byKey.get(k) ?? null);
  const groups = useMemo(() => {
    const m = new Map<string, { key: string; p: CatalogPlayer | null }[]>();
    draft.keys.forEach((key, i) => { const p = pickedPlayers[i]; const g = p?.grp ?? '?'; (m.get(g) ?? m.set(g, []).get(g)!).push({ key, p }); });
    for (const arr of m.values()) arr.sort((a, b) => (b.p ? greatness(b.p) : -1) - (a.p ? greatness(a.p) : -1));
    return [...POS_GROUP_ORDER, '?'].filter((g) => m.has(g)).map((g) => [g, m.get(g)!] as const);
  }, [draft.keys, byKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = async (): Promise<CustomClass> => {
    const c = { ...draft, name: draft.name.trim() || 'My class', updatedAt: Date.now() };
    await cache.customSet(c);
    setDraft(c);
    setSaved(await cache.customList());
    return c;
  };
  const openSaved = (c: CustomClass) => setDraft(c);
  const duplicate = async (c: CustomClass) => { const d = { ...c, id: newId(), name: `${c.name} copy`, createdAt: Date.now(), updatedAt: Date.now() }; await cache.customSet(d); setSaved(await cache.customList()); setDraft(d); };
  const del = async (id: string) => { await cache.customDel(id); setSaved(await cache.customList()); setConfirmDel(null); if (draft.id === id) setDraft({ id: newId(), name: '', keys: [], createdAt: Date.now(), updatedAt: Date.now() }); };

  const full = draft.keys.length >= CAP;
  const sel = 'rounded-md border border-border bg-surface-0 px-2 py-1 text-xs text-neutral-200 focus:border-primary focus:outline-none';
  const th = 'px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-neutral-400';
  const sortBtn = (k: SortKey, label: string) => (
    <button onClick={() => setSort(k)} className={`${th} ${sort === k ? 'text-neutral-100' : 'hover:text-neutral-200'}`}>{label}{sort === k ? ' ▾' : ''}</button>
  );

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Build a custom draft class" tabIndex={-1}
        ref={(el) => { if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true }); }}
        className="flex h-[88vh] w-[1280px] max-w-full flex-col overflow-hidden rounded-xl border border-border-strong bg-surface-1 shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
          <div>
            <div className="text-sm font-bold tracking-tight text-neutral-100">Build a custom draft class</div>
            <div className="text-xs text-neutral-400">Pick anyone from {catalog ? catalog.length.toLocaleString() : '…'} players, 1936–2026. The class holds {CAP}. Picks are ranked best-first by career; your usual modifiers still apply.</div>
          </div>
          <button onClick={onClose} className="rounded-md border border-border px-2 py-1 text-xs text-neutral-300 hover:bg-surface-2" aria-label="Close">Esc</button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Catalog */}
          <div className="flex min-w-0 flex-[3] flex-col border-r border-border">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or college…" className={`${sel} w-52`} />
              <select value={grp} onChange={(e) => setGrp(e.target.value)} className={sel}>
                <option value="ALL">All positions</option>
                {POS_GROUP_ORDER.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <select value={from} onChange={(e) => { const v = Number(e.target.value); setFrom(v); if (v > to) setTo(v); }} className={sel}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
              <span className="text-xs text-muted">to</span>
              <select value={to} onChange={(e) => { const v = Number(e.target.value); setTo(v); if (v < from) setFrom(v); }} className={sel}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
              <select value={league} onChange={(e) => setLeague(e.target.value)} className={sel}>
                <option value="ALL">All leagues</option>
                {leagues.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-neutral-300"><input type="checkbox" checked={hof} onChange={(e) => setHof(e.target.checked)} className="accent-primary" />HOF only</label>
              <span className="ml-auto text-xs tabular-nums text-muted">{list.length.toLocaleString()} match</span>
              <button onClick={addAllShown} disabled={full || !list.length} className="rounded-md border border-primary/50 bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20 disabled:opacity-40" title="Add from the top of this list until the class is full">Add all shown</button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {error && <div className="m-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-200">Couldn't load the player catalog: {error} <button onClick={loadCatalog} className="ml-2 underline">Retry</button></div>}
              {!catalog && !error && <div className="px-4 py-8 text-center text-sm text-muted">Loading the player pool…</div>}
              {catalog && (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface-2">
                    <tr>
                      <th className={th}>{sortBtn('name', 'Name')}</th>
                      <th className={th}>{sortBtn('pos', 'Pos')}</th>
                      <th className={th}>{sortBtn('year', 'Year')}</th>
                      <th className={th}>{sortBtn('pick', 'Drafted')}</th>
                      <th className={th}>College</th>
                      <th className={`${th} text-right`}>{sortBtn('wav', 'wAV')}</th>
                      <th className={`${th} text-right`}>{sortBtn('cal', 'Career')}</th>
                      <th className={`${th} text-right`}>{sortBtn('pb', 'PB')}</th>
                      <th className={th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.slice(0, SHOW_MAX).map((p) => {
                      const inClass = picked.has(p.key);
                      return (
                        <tr key={p.key} className={`border-t border-border/50 ${inClass ? 'bg-success/5' : 'hover:bg-surface-2/50'}`}>
                          <td className="px-3 py-1.5 text-neutral-100">{p.first} {p.last}{p.hof && <span className="ml-1.5 rounded bg-gold/15 px-1 text-[10px] font-semibold text-gold" title="Hall of Fame">HOF</span>}</td>
                          <td className="px-3 py-1.5 text-neutral-300">{p.mpos}</td>
                          <td className="px-3 py-1.5 tabular-nums text-neutral-300">{p.year}{p.league !== 'NFL' ? <span className="ml-1 text-[10px] text-muted">{p.league}</span> : null}</td>
                          <td className="px-3 py-1.5 text-neutral-300">{p.round != null ? `Rd ${p.round}${p.pick != null ? `, #${p.pick}` : ''}` : 'Undrafted'}</td>
                          <td className="px-3 py-1.5 text-neutral-400">{p.college}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-neutral-300">{p.wav ?? '–'}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-neutral-300">{p.cal}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-neutral-400">{p.pb || ''}</td>
                          <td className="px-3 py-1.5 text-right">
                            {inClass ? (
                              <button onClick={() => remove(p.key)} className="rounded-md border border-border px-2 py-0.5 text-xs text-neutral-300 hover:text-red-300">Remove</button>
                            ) : (
                              <button onClick={() => add(p.key)} disabled={full} className="rounded-md border border-primary/50 bg-primary/10 px-2 py-0.5 text-xs text-primary hover:bg-primary/20 disabled:opacity-40">Add</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {list.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-sm text-neutral-500">Nobody matches.</td></tr>}
                  </tbody>
                </table>
              )}
              {catalog && list.length > SHOW_MAX && (
                <div className="border-t border-border px-4 py-2 text-center text-xs text-muted">Showing {SHOW_MAX} of {list.length.toLocaleString()} — narrow the search or filters to see the rest.</div>
              )}
            </div>
          </div>

          {/* The class */}
          <div className="flex min-w-0 flex-[2] flex-col">
            {saved.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-2 text-xs">
                <span className="text-neutral-400">My classes:</span>
                {saved.map((c) => (
                  <span key={c.id} className={`flex items-center gap-1 rounded border px-1.5 py-0.5 ${c.id === draft.id ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border text-neutral-300'}`}>
                    <button onClick={() => openSaved(c)} title={`${c.keys.length} players`}>{c.name}</button>
                    <button onClick={() => duplicate(c)} className="text-muted hover:text-neutral-200" title="Duplicate">⧉</button>
                    {confirmDel === c.id ? (
                      <button onClick={() => del(c.id)} className="text-red-300" title="Click again to delete">delete?</button>
                    ) : (
                      <button onClick={() => setConfirmDel(c.id)} className="text-muted hover:text-red-300" title="Delete" aria-label={`Delete ${c.name}`}>×</button>
                    )}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-3 border-b border-border px-4 py-2">
              <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Class name (e.g. 90s Legends)" className={`${sel} w-56 text-sm`} maxLength={60} />
              <span className={`ml-auto text-sm tabular-nums ${full ? 'text-warning' : 'text-neutral-200'}`}><b>{draft.keys.length}</b> / {CAP}</span>
              <button onClick={() => setKeys([])} disabled={!draft.keys.length} className="text-xs text-muted hover:text-neutral-200 disabled:opacity-40">Clear</button>
            </div>
            <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2 text-[11px]">
              {groups.map(([g, arr]) => <span key={g} className="rounded bg-surface-2 px-1.5 py-0.5 text-neutral-300">{g} <b className="tabular-nums text-neutral-100">{arr.length}</b></span>)}
              {!draft.keys.length && <span className="text-muted">Add players from the left. Tip: filter a position, sort by Career, then “Add all shown”.</span>}
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-4 py-2">
              {groups.map(([g, arr]) => (
                <div key={g} className="mb-3">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{g}</div>
                  {arr.map(({ key, p }) => (
                    <div key={key} className="flex items-center gap-2 border-t border-border/40 py-1 text-sm">
                      {p ? (
                        <>
                          <span className="min-w-0 flex-1 truncate text-neutral-100">{p.first} {p.last} <span className="text-xs text-muted">{p.mpos} · {p.year}{p.round != null ? ` · Rd ${p.round}` : ' · UDFA'}</span></span>
                          <span className="tabular-nums text-xs text-neutral-400">{p.cal}</span>
                        </>
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-red-300" title={key}>Not found in the current data</span>
                      )}
                      <button onClick={() => remove(key)} className="text-muted hover:text-red-300" aria-label="Remove">×</button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 border-t border-border px-4 py-3">
              <label className="flex items-center gap-2 text-xs text-neutral-300" title="A short class is padded with generated prospects from the era of your picks so it imports as a full class">
                <input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} className="accent-primary" />
                Fill the rest with generated prospects
              </label>
              <span className="ml-auto" />
              <button onClick={() => persist()} disabled={!draft.keys.length} className="rounded-md border border-border-strong bg-surface-2 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-surface-3 disabled:opacity-40">Save</button>
              <button onClick={async () => onGenerate(await persist(), fill)} disabled={!draft.keys.length} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primary-light disabled:opacity-40">
                <Icon path={ICONS.board} className="h-3.5 w-3.5" /> Save & generate
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `DraftOptions.tsx`.** Add props `customClasses: CustomClass[]` and `onOpenBuilder: (c: CustomClass | null) => void`; local state `const [customId, setCustomId] = useState(opts.customId); const [fill, setFill] = useState(opts.fill !== false);` (reset in the `useEffect([opts])`). Include `customId` and `fill` in `next`. Add a fourth segment button `Hand-picked` and, when `source === 'picked'`:

```tsx
            {source === 'picked' && (
              <>
                <select value={customId ?? ''} onChange={(e) => setCustomId(e.target.value || undefined)} className="rounded-md border border-border bg-surface-0 px-2 py-1.5 text-sm text-neutral-200 focus:border-primary focus:outline-none">
                  <option value="">Choose a class…</option>
                  {customClasses.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.keys.length})</option>)}
                </select>
                <button onClick={() => onOpenBuilder(customClasses.find((c) => c.id === customId) ?? null)} className="rounded-md border border-primary/50 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/20">
                  {customId ? 'Edit class…' : 'Build class…'}
                </button>
                <label className="flex items-center gap-1.5 text-xs text-neutral-300" title="Pad a short class with generated prospects from the era of your picks">
                  <input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} /> Fill to 402
                </label>
              </>
            )}
```

Disable Generate when `source === 'picked' && !customId`. Footer copy for picked: `'Your hand-picked players, ranked by career'`.

- [ ] **Step 3: `ClassView.tsx`.** New props `customClasses: CustomClass[]`, `onOpenBuilder: (c: CustomClass | null) => void`; pass both to `DraftOptions`. Header title branch:

```tsx
              {data.source === 'picked' ? (
                <span className="text-gold">Custom · {data.name || 'My class'}</span>
              ) : allTime ? …
```

and pills: `{data.source === 'picked' && <Pill tone="neutral">{data.pickedCount ?? data.count} picked</Pill>}` and `{data.missing && data.missing.length > 0 && <Pill tone="gold">{data.missing.length} not found</Pill>}` (wrap the latter in a `<span title={data.missing.join('\n')}>`). The "Draft options" button's active-highlight condition should also include `draftOpts.source !== 'year'` (already does).

- [ ] **Step 4: `App.tsx`.** State: `const [builder, setBuilder] = useState<{ open: boolean; initial: CustomClass | null }>({ open: false, initial: null }); const [customClasses, setCustomClasses] = useState<CustomClass[]>([]);` Load on mount: `cache.customList().then(setCustomClasses);`. Handlers:

```ts
  const openBuilder = useCallback((c: CustomClass | null) => setBuilder({ open: true, initial: c }), []);
  const generatePicked = useCallback(async (c: CustomClass, fill: boolean) => {
    setBuilder({ open: false, initial: null });
    setCustomClasses(await cache.customList());
    applyDraftOpts({ ...draftOpts, source: 'picked', customId: c.id, fill });
  }, [draftOpts, applyDraftOpts]);
```

Render `<ClassBuilder initial={builder.initial} onClose={() => { setBuilder({ open: false, initial: null }); cache.customList().then(setCustomClasses); }} onGenerate={generatePicked} />` when `builder.open`, next to `DroppedPanel`. Pass `customClasses` and `onOpenBuilder={openBuilder}` to `ClassView`. In `onSelectYear`/`onSelectPlayer` the existing reset to `source: 'year'` already handles leaving a picked class.

- [ ] **Step 5: Type-check, run, verify manually**

`cd web && npm run typecheck`. Then `npm run dev`: Draft options → Hand-picked → Build class… → filter QB, sort Career, Add all shown (should stop at 402 or add all), name it, Save & generate. Expect the board titled "Custom · <name>", `n picked` pill, fillers padding to 402. Edit a player, close, reopen the class from the dropdown: the edit persists. Export → filename `CAREERDRAFT-<SLUG>`. Delete the class from My classes and confirm the dropdown updates.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/ClassBuilder.tsx web/src/components/DraftOptions.tsx web/src/components/ClassView.tsx web/src/App.tsx
git commit -m "Build a draft class by hand from the whole player pool"
```

### Task 8: Docs

**Files:**
- Modify: `README.md` ("Using it" step 4 and the "Custom classes" paragraph)
- Modify: `CHANGELOG.md` (an *Unreleased* section at the top)
- Modify: `web/src/components/WhatsNew.tsx` only if it hard-codes release notes (check first; if it reads CHANGELOG, skip)

- [ ] **Step 1: README.** Replace the "Custom classes" paragraph with:

```md
**Custom classes.** Build an all-time draft, a decade, apply your own modifiers — or hand-pick
your own class from all 32,140 players, sorted by position, era or career, up to Madden's 402
slots. Short classes are padded with era-correct generated prospects. Export any class to a
spreadsheet with every overall and all 54 attributes.
```

- [ ] **Step 2: CHANGELOG.** Above `## 1.0.0` add:

```md
## Unreleased

**Hand-picked classes.** Draft options → Hand-picked → Build class… lets you pick any players
from the whole 1936–2026 pool (filter by position, era and league; sort by career), name the
class, save it, and export it as `CAREERDRAFT-<NAME>`. Short classes are padded with generated
prospects from the era of your picks.

**Full CSV.** Export CSV now writes every player with overall, dev trait, bio, combine numbers
and all 54 attributes, with your edits applied.

**The overall is Madden's.** The player card no longer has an Overall box. Its rating chip and
the board's OVR column show the overall Madden will compute from the attributes on import,
updating as you edit.
```

- [ ] **Step 3: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "Describe hand-picked classes, the full CSV and the Madden-owned overall"
```
