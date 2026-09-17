# Roster Writer and Build Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write Madden 27 ROSTER saves back from the server, then apply moves, cuts and per-player edits to a base roster and write a new ROSTER file, gated on two in-game load tests.

**Architecture:** The roster payload is a TDB2 database; the MIT parser/writer from bep713/madden-file-tools is vendored under `server/src/vendor/tdb2/` and wrapped by a small TypeScript module. A container module recomputes the FBCHUNKS header (length, CRC-32/BZIP2, timestamp). `RosterFileService` moves its read path onto the engine; a new `RosterBuildService` applies a roster document and writes `ROSTER-<NAME>`. This plan covers spec phases 1 and 2 (Gate 1 and Gate 2). The sidebar rail, Rosters view and pool adds are later plans.

**Tech Stack:** Node 22+, TypeScript (CommonJS), Express, `node:test` via `node --import tsx --test`, vendored CommonJS JavaScript required with `require`, zlib.

**Spec:** `docs/superpowers/specs/2026-09-16-roster-builder-design.md`

## Global Constraints

- Output file size is exactly 6,291,530 bytes; header 74 bytes (0x4a); zlib payload at 0x4a; zero padding after.
- Header words: `0x12` u32 LE inflated payload length; `0x1a` u32 LE CRC-32 MSB-first (poly 0x04C11DB7, init 0xFFFFFFFF, xorout 0xFFFFFFFF) over the whole inflated payload; `0x22` six u16 LE = year, month, day, hour, minute, second of the save time. Everything else in the header is copied from the base.
- Never overwrite the base file or `ROSTER-Official`. Output names are `ROSTER-<NAME>` with NAME upper-cased, non-alphanumerics dropped, at most 16 characters.
- Builds assemble the whole buffer, write to `<output>.tmp`, then rename.
- Free agency is the TEAM row whose `TASN` is `FreeAgents` (TGID 1009 in the shipped roster); read it from the file, never hard-code it.
- Cuts move to free agency; nothing is deleted from the PLAY table.
- Another Claude session commits to this repo concurrently: every `git add` names explicit files, never `-A` or `.`.
- Tests that need `ROSTER-Official` skip when it is absent, using the same `skipWithoutRoster` pattern as `server/src/services/__tests__/RosterFile.test.ts`.
- Fixture path: `M27_SAVES_DIR/ROSTER-Official` (`%USERPROFILE%\Documents\Madden NFL 27\saves\ROSTER-Official`).
- Run all server commands from `draft-class-generator/server`. The repo root for git is `draft-class-generator`.

## File Structure

| File | Responsibility |
|---|---|
| `server/src/vendor/tdb2/*.js` (new) | Verbatim-ish copies of the TDB2 engine from madden-file-tools commit `6c7eb93`: `File.js`, `FileParser.js`, `SimpleParser.js`, `TDB2Field.js`, `TDB2File.js`, `TDB2Record.js`, `TDB2Table.js`, `TDB2Parser.js`, `TDB2Writer.js`, `subTableWriter.js`, `utilService.js`, `LICENSE`, `README.md`. Only change: flat `./` requires, the sparse-write flag (Task 2). |
| `server/src/services/Tdb2Engine.ts` (new) | Typed wrapper: `parseTdb2(payload)`, `serializeTdb2(file)`, `makeIntField`, `makeStringField`, `makeRecord`, `intOf`, `strOf`, `setInt`, `setStr`. The only file that requires the vendored engine. |
| `server/src/services/RosterContainer.ts` (new) | FBCHUNKS container: `splitContainer`, `buildContainer`, `crc32Bzip2`, `ROSTER_FILE_SIZE`. Pure functions, no I/O. |
| `server/src/services/RosterFileService.ts` (modify) | Read path on the engine; `openBase(name)` returning header, parsed file, teams, players; `write(tdb2, header)`. Same public read API as today, now async. |
| `server/src/services/RosterBuildService.ts` (new) | Applies a `RosterBuildDoc` (moves, edits) to a parsed base and writes the output file. |
| `server/src/types/roster.ts` (new) | `PlayerFieldEdit`, `RosterBuildDoc`, `RosterBuildResult`. |
| `server/src/routes/roster.ts` (modify) | Await the async service; add `POST /roster/build`. |
| `server/scripts/roster-gate1.ts`, `server/scripts/roster-gate2.ts` (new) | In-game gate files. |
| Tests under `server/src/services/__tests__/` | `Tdb2Engine.test.ts`, `RosterContainer.test.ts`, `RosterFile.test.ts` (modify), `RosterBuild.test.ts`. |

Reference facts an implementer needs (from the spike on 2026-09-16, ROSTER-Official RL2_5):

- Tables in file order: `BLOB` (1 record; field `BLBM` is a type-5 subtable keyed by player id with one gzip record per player, field `TREF`), `DCHT` (2,754: `PGID TGID DDEP PPOS`), `DFTP` (672), `INJY` (178), `PLAY` (3,111 players), `PLCT` (2,215 contracts), `PRSN` (3,111 personas), `TEAM` (33).
- PLAY keys: id `PGID` (= `POID`), names `PFNA`/`PLNA`, team `TGID`, overall `POVR`, age `PAGE`, height `PHGT` inches, weight `PWGT` = pounds − 160, jersey `PJEN`, years pro `PYRP`, years with team `PYWT`, dev `PROL` (0 Normal, 1 Star, 2 Superstar, 3 X-Factor), position `PPOS` (0–21, `PositionMapper.name(id)`), archetype `PLTY`, college `PCOL`, hometown `PHTN`, state `PHSN`, draft round `PDRO`, draft pick `PDPI`, draft team `PLDT`, face asset `PEPS`.
- PLAY rating keys: speed PSPD, acceleration PACC, agility PAGI, strength PSTR, awareness PAWR, jumping PJMP, stamina PSTA, changeOfDirection PELU, toughness PTGH, injury PINJ, carrying PCAR, ballCarrierVision PBCV, breakTackle PBKT, trucking PLTR, stiffArm PLSA, spinMove PLSM, jukeMove PLJM, catching PCTH, catchInTraffic PLCI, spectacularCatch PLSC, shortRouteRunning SRRN, mediumRouteRunning PMRR, deepRouteRunning PDRR, release PLRL, throwPower PTHP, throwAccuracyShort PTAS, throwAccuracyMid PTAM, throwAccuracyDeep PTAD, throwOnTheRun PTOR, throwUnderPressure PTUP, playAction PPLA, breakSack PBSK, passBlock PPBK, passBlockPower PPBS, passBlockFinesse PPBF, runBlock PRBK, runBlockPower PRBS, runBlockFinesse PRBF, leadBlock PLBK, impactBlocking PLIB, tackle PTAK, hitPower PLHT, powerMoves PLPM, finesseMoves PFMS, blockShedding PBSG, pursuit PLPU, playRecognition PLPR, manCoverage PLMC, zoneCoverage PLZC, pressCoverage PLPE, kickPower PKPR, kickAccuracy PKAC, kickReturn PKRT, longSnap PIMP.
- TEAM keys: `TGID` id, `TASN` nickname (`Bears`), `TLNA` city (`Chicago`), `TSNA` abbreviation (`CHI`), `TDAN` db name.
- Blob record (BLBM, index = PGID): `ASNM` asset name, `CFNM`/`CLNM` names, `CJNO` jersey, `CNID` id, `GENR` generic head (`gen_6_T_G_005`), `HINC` height, `SKNT` skin tone 1–8, `WLBS` weight, `LOUT` subtable of loadouts: one record with `LDCT`=5 whose `PINS` has one record `ITAN`=`<Body>_BodyType` `SLOT`=129 (values seen: Standard, Thin, Muscular, Heavy, Lean); one record with `LDTY`=1 whose `PINS` records are the on-field gear (`ITAN` asset, `SLOT` id). The facemask record has `ITAN` starting `GearFaceMask_` and no `SLOT`.
- Loadout slotType name → SLOT id (from tallying every blob): HeadWear 106, Visor 2, LeftHandWear 114, RightHandWear 115, LeftShoe 10, RightShoe 11, Shoulderpads 25, Neckpad 29, OuterShirt 125, InnerSocks 109, LeftArmWear 110, RightArmWear 111, LeftElbowWear 116, RightElbowWear 117, LeftWristWear 120, RightWristWear 121, LeftThighWear 142, RightThighWear 143, KneeWear 118, LeftSpat 9, RightSpat 54, OuterPants 124. (Also seen, not edited here: towel 26, mouthpiece 122, handwarmer 127, handwarmer style 101, flak jacket 30, backplate 12, face paint 51, undershirt 108, helmet flag 88, guardian cap 135.)
- The vendored parser's `_normalizeRecords` adds every field a table has seen to every record with a zero/empty default. The game omits such fields. Task 2 stops the writer emitting untouched defaults.
- Engine values are already decoded integers (POVR 72 reads as 72); the old `decodeSmall` is not needed on the engine path.

---

### Task 1: Vendor the TDB2 engine and wrap it

**Files:**
- Create: `server/src/vendor/tdb2/{File.js,FileParser.js,SimpleParser.js,TDB2Field.js,TDB2File.js,TDB2Record.js,TDB2Table.js,TDB2Parser.js,TDB2Writer.js,subTableWriter.js,utilService.js,LICENSE,README.md}`
- Create: `server/src/services/Tdb2Engine.ts`
- Modify: `server/package.json` (dependencies), `server/scripts/copy-assets.js` if it does not already copy `src/vendor/**/*.js` into `dist/`
- Test: `server/src/services/__tests__/Tdb2Engine.test.ts`

**Interfaces:**
- Produces: `parseTdb2(payload: Buffer): Promise<Tdb2File>`, `serializeTdb2(file: Tdb2File): Buffer`, `makeIntField(key, value)`, `makeStringField(key, value)`, `makeRecord(fields)`, `intOf(rec, key, dflt?)`, `strOf(rec, key)`, `setInt(rec, key, value)`, `setStr(rec, key, value)`, types `Tdb2File`, `Tdb2Table`, `Tdb2Record`, `Tdb2Field`.

- [ ] **Step 1: Copy the engine files**

The source is a clone of `https://github.com/bep713/madden-file-tools` at commit `6c7eb93` (a copy sits in the session scratchpad at `%TEMP%\claude\C--Users-amatthews-Documents-Projects-Madden26DraftClass\4def8e1b-9753-462d-bf23-d0fe6354aff3\scratchpad\mft`; if it is gone, `git clone --depth 1 https://github.com/bep713/madden-file-tools.git` into the scratchpad). From the clone root, into `server/src/vendor/tdb2/`:

```bash
SRC=<clone root>; DST=server/src/vendor/tdb2; mkdir -p "$DST"
cp "$SRC/LICENSE" "$DST/LICENSE"
cp "$SRC/filetypes/abstract/File.js" "$SRC/filetypes/abstract/FileParser.js" "$SRC/filetypes/abstract/SimpleParser.js" "$DST/"
cp "$SRC/filetypes/TDB2/TDB2Field.js" "$SRC/filetypes/TDB2/TDB2File.js" "$SRC/filetypes/TDB2/TDB2Record.js" "$SRC/filetypes/TDB2/TDB2Table.js" "$DST/"
cp "$SRC/streams/TDB2/TDB2Parser.js" "$SRC/streams/TDB2/TDB2Writer.js" "$SRC/streams/TDB2/subTableWriter.js" "$DST/"
cp "$SRC/services/utilService.js" "$DST/"
```

- [ ] **Step 2: Flatten the requires and drop the sjcl dependency**

```bash
cd server/src/vendor/tdb2
sed -i -E "s#require\('(\.\./)+(filetypes/abstract|filetypes/TDB2|services|streams/TDB2)/([A-Za-z0-9]+)'\)#require('./\3')#g; s#require\('\./services/([A-Za-z0-9]+)'\)#require('./\1')#g" *.js
sed -i "/require('\.\/sjcl\/sjcl')/d" utilService.js
grep -n "require(" *.js
```

Expected: every `require` is either a Node built-in (`stream`, `zlib`, `fs`, `events`), a package (`stream-parser`, `bit-buffer`), or `./<File>`. Then find the functions in `utilService.js` that still reference `sjcl` (`grep -n sjcl utilService.js`) and delete those whole functions; the TDB2 path uses only `getUncompressedTextFromSixBitCompression`, `compress6BitString`, `charTo6Bit`, `readModifiedLebCompressedInteger`, `parseModifiedLebEncodedNumber`, `writeModifiedLebCompressedInteger`, `toUint32`, `modulo`, `toInteger`. Do not delete anything else.

- [ ] **Step 3: Write the vendor README**

`server/src/vendor/tdb2/README.md`:

```markdown
# Vendored TDB2 engine

The Madden 21+ ROSTER payload parser/writer from
[bep713/madden-file-tools](https://github.com/bep713/madden-file-tools) (MIT, LICENSE
alongside), commit 6c7eb93, taken 2026-09-16. Only the TDB2 path is here:
`TDB2Parser` / `TDB2Writer` / `subTableWriter`, the `TDB2*` model classes, the abstract
`File` / `FileParser` / `SimpleParser`, and `utilService` with its sjcl users removed.

Local changes:
- requires flattened to `./`;
- `TDB2Field.isDefaulted` + writer skip (fields that `_normalizeRecords` invented and
  nobody changed are not written; the game omits them too).

Use through `services/Tdb2Engine.ts`, never directly.
```

- [ ] **Step 4: Add the dependencies and the dist copy**

In `server/package.json` add to `dependencies` (keep alphabetical order):

```json
    "bit-buffer": "^0.2.5",
    "crc-32": "^1.2.2",
    "stream-parser": "^0.3.1",
```

Run `npm install` in `server`. Then open `server/scripts/copy-assets.js` and confirm it copies `src/vendor` into `dist/vendor` (it must already for `vendor/draft-class`; if it lists folders explicitly, add `tdb2`).

- [ ] **Step 5: Write the failing test**

`server/src/services/__tests__/Tdb2Engine.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { M27_SAVES_DIR } from '../../config/paths';
import { parseTdb2, serializeTdb2, makeIntField, makeStringField, makeRecord, intOf, strOf, setInt, setStr } from '../Tdb2Engine';

const OFFICIAL = path.join(M27_SAVES_DIR, 'ROSTER-Official');
const skipWithoutRoster = { skip: fs.existsSync(OFFICIAL) ? false : 'no Madden 27 ROSTER-Official in the Saves folder' };
const payloadOf = (file: string) => zlib.inflateSync(fs.readFileSync(file).subarray(0x4a), { finishFlush: zlib.constants.Z_SYNC_FLUSH });

test('int and string fields round-trip through the engine encoding', () => {
  for (const v of [0, 5, 63, 64, 76, 127, 128, 165, 1009, 28887, -31]) {
    const f = makeIntField('POVR', v);
    assert.equal(f.value, v, `value ${v}`);
    assert.equal(f.rawKey.length, 4);
  }
  const s = makeStringField('PFNA', 'Geno');
  assert.equal(s.value, 'Geno');
  assert.equal(s.raw[s.raw.length - 1], 0, 'strings are NUL terminated on disk');
  const rec = makeRecord([makeIntField('PGID', 7), makeStringField('PLNA', 'Smith')]);
  assert.equal(intOf(rec, 'PGID'), 7);
  assert.equal(strOf(rec, 'PLNA'), 'Smith');
  setInt(rec, 'PGID', 9); setStr(rec, 'PLNA', 'Jones');
  assert.equal(intOf(rec, 'PGID'), 9);
  assert.equal(strOf(rec, 'PLNA'), 'Jones');
  assert.equal(intOf(rec, 'PAGE', 21), 21, 'missing int falls back');
});

test('the shipped roster parses into the known tables and reads Geno Smith', skipWithoutRoster, async () => {
  const file = await parseTdb2(payloadOf(OFFICIAL));
  assert.deepEqual(file.tables.map((t) => t.name), ['BLOB', 'DCHT', 'DFTP', 'INJY', 'PLAY', 'PLCT', 'PRSN', 'TEAM']);
  assert.equal(file.PLAY.records.length, file.PLAY.numEntries);
  const geno = file.PLAY.records.find((r) => strOf(r, 'PFNA') === 'Geno' && strOf(r, 'PLNA') === 'Smith');
  assert.ok(geno, 'Geno Smith');
  assert.equal(intOf(geno!, 'PGID'), 112);
  assert.equal(intOf(geno!, 'POVR'), 72);
  assert.equal(intOf(geno!, 'PSPD'), 84);
  assert.equal(strOf(geno!, 'PEPS'), 'SmithGeno_112');
  const blob = file.BLOB.records[0].fields.BLBM.value;
  assert.equal(blob.records.length, file.PLAY.records.length, 'one blob per player');
  assert.ok(blob.records.some((r) => r.index === 112), 'blob keyed by PGID');
});

test('serialize then parse gives back the same records', skipWithoutRoster, async () => {
  const a = await parseTdb2(payloadOf(OFFICIAL));
  const out = serializeTdb2(a);
  const b = await parseTdb2(out);
  assert.equal(b.PLAY.records.length, a.PLAY.records.length);
  for (let i = 0; i < a.PLAY.records.length; i += 97) {
    const ra = a.PLAY.records[i], rb = b.PLAY.records[i];
    for (const k of Object.keys(ra.fields)) {
      if (ra.fields[k].type === 0 || ra.fields[k].type === 1) assert.equal(rb.fields[k]?.value, ra.fields[k].value, `PLAY[${i}].${k}`);
    }
  }
  assert.equal(b.TEAM.records.length, 33);
  assert.equal(b.BLOB.records[0].fields.BLBM.value.records.length, a.BLOB.records[0].fields.BLBM.value.records.length);
});
```

- [ ] **Step 6: Run the test to see it fail**

Run: `cd server && node --import tsx --test src/services/__tests__/Tdb2Engine.test.ts`
Expected: FAIL, `Cannot find module '../Tdb2Engine'`.

- [ ] **Step 7: Write the wrapper**

`server/src/services/Tdb2Engine.ts`:

```ts
import { Readable, pipeline } from 'stream';

/* Vendored CommonJS TDB2 engine (madden-file-tools, MIT) — see vendor/tdb2/README.md. */
/* eslint-disable @typescript-eslint/no-var-requires */
const TDB2Parser = require('../vendor/tdb2/TDB2Parser');
const TDB2Writer = require('../vendor/tdb2/TDB2Writer');
const TDB2Field = require('../vendor/tdb2/TDB2Field');
const TDB2Record = require('../vendor/tdb2/TDB2Record');
const utilService = require('../vendor/tdb2/utilService');

export const FIELD_INT = 0;
export const FIELD_STRING = 1;
export const FIELD_SUBTABLE = 4;
export const FIELD_SUBTABLE_COMPRESSED = 5;

export interface Tdb2Field {
  key: string;
  type: number;
  /** Decoded value: number (type 0), string (type 1), Tdb2Table (types 4/5), number (type 10). */
  value: any;
  raw: Buffer;
  rawKey: Buffer;
  length: number;
  isChanged: boolean;
  /** Set by the parser on fields it invented to fill a record; the writer skips them unless changed. */
  isDefaulted?: boolean;
}
export interface Tdb2Record {
  index: number;
  fields: Record<string, Tdb2Field>;
  subRecord: Tdb2Record | null;
}
export interface Tdb2Table {
  name: string;
  type: number;
  unknown1: number;
  unknown2: number;
  records: Tdb2Record[];
  numEntries: number;
  fieldDefinitions: { name: string; type: number }[];
  addRecord(rec: Tdb2Record): void;
  removeRecord(index: number): void;
}
export interface Tdb2File {
  tables: Tdb2Table[];
  BLOB: Tdb2Table; DCHT: Tdb2Table; PLAY: Tdb2Table; PLCT: Tdb2Table; PRSN: Tdb2Table; TEAM: Tdb2Table;
  [table: string]: any;
}

/** Parse an inflated ROSTER payload. */
export function parseTdb2(payload: Buffer): Promise<Tdb2File> {
  return new Promise((resolve, reject) => {
    const parser = new TDB2Parser();
    pipeline(Readable.from([payload]), parser, (err: Error | null) => (err ? reject(err) : resolve(parser.file as Tdb2File)));
  });
}

/** Serialize a parsed file back to an inflated payload. */
export function serializeTdb2(file: Tdb2File): Buffer {
  const writer = new TDB2Writer(file);
  const chunks: Buffer[] = [];
  let chunk: Buffer | null;
  while ((chunk = writer.read()) !== null) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function rawKey(key: string, type: number): Buffer {
  if (key.length !== 4) throw new Error(`TDB2 keys are four characters: ${key}`);
  return Buffer.from([...utilService.compress6BitString(key), type]);
}

export function makeIntField(key: string, value: number): Tdb2Field {
  const f = new TDB2Field();
  f.key = key; f.type = FIELD_INT; f.rawKey = rawKey(key, FIELD_INT);
  f.value = Math.round(value);
  return f;
}

export function makeStringField(key: string, value: string): Tdb2Field {
  const f = new TDB2Field();
  f.key = key; f.type = FIELD_STRING; f.rawKey = rawKey(key, FIELD_STRING);
  f.value = value;
  return f;
}

export function makeRecord(fields: Tdb2Field[]): Tdb2Record {
  const r = new TDB2Record();
  for (const f of fields) r.fields[f.key] = f;
  return r;
}

export function intOf(rec: Tdb2Record, key: string, dflt = 0): number {
  const f = rec.fields[key];
  return f && f.type === FIELD_INT ? Number(f.value) : dflt;
}

export function strOf(rec: Tdb2Record, key: string): string {
  const f = rec.fields[key];
  return f && f.type === FIELD_STRING ? String(f.value) : '';
}

/** Set an int field, creating it when the record lacks it. */
export function setInt(rec: Tdb2Record, key: string, value: number): void {
  const f = rec.fields[key];
  if (f && f.type === FIELD_INT) f.value = Math.round(value);
  else rec.fields[key] = makeIntField(key, value);
}

/** Set a string field, creating it when the record lacks it. */
export function setStr(rec: Tdb2Record, key: string, value: string): void {
  const f = rec.fields[key];
  if (f && f.type === FIELD_STRING) f.value = value;
  else rec.fields[key] = makeStringField(key, value);
}
```

- [ ] **Step 8: Run the tests**

Run: `cd server && node --import tsx --test src/services/__tests__/Tdb2Engine.test.ts`
Expected: 3 passing (the two fixture tests skip on a machine without the roster). If `parseTdb2` never resolves, the parser did not emit `finish`: check the last `this.bytes(0x5, …)` request in `TDB2Parser._checkTableEnd` and, if needed, resolve on the parser's `'finish'` event after calling `parser.end(payload)` instead of `pipeline`.

- [ ] **Step 9: Typecheck and commit**

Run: `cd server && npm run typecheck` (expected: no errors; `vendor/**/*.js` is excluded from tsc).

```bash
cd draft-class-generator
git add server/package.json server/package-lock.json server/src/vendor/tdb2 server/src/services/Tdb2Engine.ts server/src/services/__tests__/Tdb2Engine.test.ts server/scripts/copy-assets.js
git commit -m "Vendor the TDB2 roster engine from madden-file-tools with a typed wrapper

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(Include `copy-assets.js` only if it changed.)

---

### Task 2: Sparse writing — skip fields the parser invented

**Files:**
- Modify: `server/src/vendor/tdb2/TDB2Field.js` (add `isDefaulted`), `server/src/vendor/tdb2/TDB2Parser.js` (`_normalizeRecords`), `server/src/vendor/tdb2/TDB2Writer.js` (two field loops), `server/src/vendor/tdb2/TDB2Record.js` (`deepCopyRecord`)
- Test: `server/src/services/__tests__/Tdb2Engine.test.ts`

**Interfaces:**
- Consumes: `parseTdb2`, `serializeTdb2` from Task 1.
- Produces: a serialized payload whose non-blob tail is byte-identical to the original.

- [ ] **Step 1: Write the failing test**

Append to `Tdb2Engine.test.ts`:

```ts
/** Offset of a table header (packed 4-char name + type byte 0x04) in a payload. */
function tableOffset(payload: Buffer, name: string): number {
  let v = 0;
  for (const ch of name) v = (v << 6) | ((ch.charCodeAt(0) - 32) & 63);
  const hdr = Buffer.from([(v >> 16) & 255, (v >> 8) & 255, v & 255, 4]);
  const at = payload.indexOf(hdr);
  if (at < 0) throw new Error(`table ${name} not found`);
  return at;
}

test('an unedited roster writes back with the tables after the blob byte-identical', skipWithoutRoster, async () => {
  const orig = payloadOf(OFFICIAL);
  const out = serializeTdb2(await parseTdb2(orig));
  const tailA = orig.subarray(tableOffset(orig, 'DCHT'));
  const tailB = out.subarray(tableOffset(out, 'DCHT'));
  assert.equal(tailB.length, tailA.length, 'tail length');
  assert.ok(tailB.equals(tailA), 'DCHT..TEAM bytes identical');
  const growth = Math.abs(out.length - orig.length) / orig.length;
  assert.ok(growth < 0.005, `payload size within 0.5% (was ${(growth * 100).toFixed(2)}%)`);
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `cd server && node --import tsx --test src/services/__tests__/Tdb2Engine.test.ts`
Expected: the new test FAILS on `tail length` (the writer currently emits every normalized field; PLCT and PRSN roughly double).

- [ ] **Step 3: Add the flag to the field**

In `server/src/vendor/tdb2/TDB2Field.js`, in the constructor after `this._isChanged = false;` add `this._isDefaulted = false;`, and after the `isChanged` setter add:

```js
    get isDefaulted() {
        return this._isDefaulted;
    };

    set isDefaulted(v) {
        this._isDefaulted = v;
    };
```

In `TDB2Record.js` `deepCopyRecord`, inside the `record instanceof TDB2Field` branch after `copy._isChanged = record._isChanged;` add `copy._isDefaulted = record._isDefaulted;`.

- [ ] **Step 4: Mark invented fields in the parser**

In `server/src/vendor/tdb2/TDB2Parser.js`, `_normalizeRecords`, after `newField.isChanged = false;` add:

```js
                    // Invented to fill the record; the game omits absent fields, so the
                    // writer leaves it out unless someone sets a value.
                    newField.isDefaulted = true;
```

- [ ] **Step 5: Skip them in the writer**

In `server/src/vendor/tdb2/TDB2Writer.js` there are two `sortedFields.map((fieldKey) => {` loops (the main-table one in the constructor and the one in `_writeCompressedRecord`). At the top of each callback, right after `const field = record.fields[fieldKey];`, add:

```js
                        if (field.isDefaulted && !field.isChanged) return;
```

- [ ] **Step 6: Run the tests**

Run: `cd server && node --import tsx --test src/services/__tests__/Tdb2Engine.test.ts`
Expected: all pass. If `DCHT..TEAM bytes identical` still fails, dump the first differing offset in both tails and the surrounding 32 bytes, and report before changing the assertion; do not loosen it to make it pass.

- [ ] **Step 7: Commit**

```bash
cd draft-class-generator
git add server/src/vendor/tdb2/TDB2Field.js server/src/vendor/tdb2/TDB2Parser.js server/src/vendor/tdb2/TDB2Writer.js server/src/vendor/tdb2/TDB2Record.js server/src/services/__tests__/Tdb2Engine.test.ts
git commit -m "TDB2 writer leaves out the zero fields the parser invented, as the game does

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The FBCHUNKS container writer

**Files:**
- Create: `server/src/services/RosterContainer.ts`
- Test: `server/src/services/__tests__/RosterContainer.test.ts`

**Interfaces:**
- Produces: `ROSTER_FILE_SIZE = 6291530`, `HEADER_SIZE = 0x4a`, `crc32Bzip2(buf: Buffer): number`, `splitContainer(buf: Buffer): { header: Buffer; payload: Buffer }`, `buildContainer(header: Buffer, payload: Buffer, now?: Date): Buffer`, `headerInfo(header: Buffer): { payloadLength: number; crc: number; savedAt: Date; product: string }`.

- [ ] **Step 1: Write the failing test**

`server/src/services/__tests__/RosterContainer.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { M27_SAVES_DIR } from '../../config/paths';
import { ROSTER_FILE_SIZE, HEADER_SIZE, crc32Bzip2, splitContainer, buildContainer, headerInfo } from '../RosterContainer';
import { payloadOffset } from '../RosterFileService';

const OFFICIAL = path.join(M27_SAVES_DIR, 'ROSTER-Official');
const skipWithoutRoster = { skip: fs.existsSync(OFFICIAL) ? false : 'no Madden 27 ROSTER-Official in the Saves folder' };

/** A header shaped like the game's, with the product string, for tests without the fixture. */
function fakeHeader(): Buffer {
  const h = Buffer.alloc(HEADER_SIZE);
  h.write('FBCHUNKS', 0, 'latin1');
  h.writeUInt16LE(1, 0x08); h.writeUInt16LE(0x38, 0x0a);
  h.writeUInt16LE(0x60, 0x10);
  h.writeUInt32LE(0x207eb, 0x16);
  h.writeUInt32LE(ROSTER_FILE_SIZE - 18, 0x1e);
  h.write('Madden-27-RL2_5-9171402', 0x2e, 'latin1');
  return h;
}

test('CRC-32/BZIP2 check value', () => {
  assert.equal(crc32Bzip2(Buffer.from('123456789')), 0xfc891918);
  assert.equal(crc32Bzip2(Buffer.alloc(0)), 0);
});

test('buildContainer writes length, checksum, timestamp and exact padding', () => {
  const payload = Buffer.from('hello roster '.repeat(1000));
  const when = new Date(2026, 8, 16, 14, 5, 9);
  const out = buildContainer(fakeHeader(), payload, when);
  assert.equal(out.length, ROSTER_FILE_SIZE);
  assert.equal(out.subarray(0, 8).toString('latin1'), 'FBCHUNKS');
  assert.equal(payloadOffset(out), HEADER_SIZE, 'zlib stream starts right after the header');
  const info = headerInfo(out.subarray(0, HEADER_SIZE));
  assert.equal(info.payloadLength, payload.length);
  assert.equal(info.crc, crc32Bzip2(payload));
  assert.deepEqual([info.savedAt.getFullYear(), info.savedAt.getMonth(), info.savedAt.getDate(), info.savedAt.getHours(), info.savedAt.getMinutes(), info.savedAt.getSeconds()], [2026, 8, 16, 14, 5, 9]);
  assert.equal(info.product, 'Madden-27-RL2_5-9171402');
  const back = zlib.inflateSync(out.subarray(HEADER_SIZE), { finishFlush: zlib.constants.Z_SYNC_FLUSH });
  assert.ok(back.equals(payload));
  const { header, payload: p2 } = splitContainer(out);
  assert.equal(header.length, HEADER_SIZE);
  assert.ok(p2.equals(payload));
  assert.equal(out.subarray(out.length - 1024).every((b) => b === 0), true, 'zero padded');
});

test('a payload that cannot fit is refused', () => {
  const big = Buffer.alloc(ROSTER_FILE_SIZE, 0x41); // incompressible enough? use random
  for (let i = 0; i < big.length; i++) big[i] = (i * 2654435761) >>> 24;
  assert.throws(() => buildContainer(fakeHeader(), big), /too large/);
});

test('the shipped roster splits and rebuilds to its own checksum', skipWithoutRoster, () => {
  const buf = fs.readFileSync(OFFICIAL);
  const { header, payload } = splitContainer(buf);
  const info = headerInfo(header);
  assert.equal(info.payloadLength, payload.length);
  assert.equal(info.crc, crc32Bzip2(payload));
  const out = buildContainer(header, payload);
  assert.equal(out.length, ROSTER_FILE_SIZE);
  assert.equal(headerInfo(out.subarray(0, HEADER_SIZE)).crc, info.crc);
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `cd server && node --import tsx --test src/services/__tests__/RosterContainer.test.ts`
Expected: FAIL, `Cannot find module '../RosterContainer'`.

- [ ] **Step 3: Write the module**

`server/src/services/RosterContainer.ts`:

```ts
import zlib from 'zlib';

/**
 * Madden 27 ROSTER container (FBCHUNKS). Header layout, verified 2026-09-16 against
 * ROSTER-Official and a community roster:
 *   0x00 "FBCHUNKS"            0x10 u16 capacity in 64 KiB units (0x60 = 6 MB)
 *   0x12 u32 inflated length   0x16 u32 constant 0x207eb
 *   0x1a u32 CRC-32/BZIP2 of the inflated payload (MSB-first, poly 0x04C11DB7)
 *   0x1e u32 file length - 18  0x22 six u16: year month day hour minute second
 *   0x2e product string        0x4a zlib stream, then zero padding to 6,291,530 bytes
 * The game validates the length and the checksum; the timestamp and padding are not
 * validated (community tests, see docs/superpowers/specs/2026-09-16-roster-builder-design.md).
 */
export const ROSTER_FILE_SIZE = 6_291_530;
export const HEADER_SIZE = 0x4a;
const OFF_LENGTH = 0x12;
const OFF_CRC = 0x1a;
const OFF_TIME = 0x22;
const OFF_PRODUCT = 0x2e;

const TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n << 24;
  for (let k = 0; k < 8; k++) c = c & 0x80000000 ? ((c << 1) ^ 0x04c11db7) >>> 0 : (c << 1) >>> 0;
  TABLE[n] = c >>> 0;
}

/** CRC-32 in MSB-first bit order (the "BZIP2" variant): init and xorout 0xFFFFFFFF. */
export function crc32Bzip2(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = ((c << 8) ^ TABLE[((c >>> 24) ^ buf[i]) & 0xff]) >>> 0;
  return (c ^ 0xffffffff) >>> 0;
}

export function headerInfo(header: Buffer): { payloadLength: number; crc: number; savedAt: Date; product: string } {
  const u16 = (o: number) => header.readUInt16LE(o);
  return {
    payloadLength: header.readUInt32LE(OFF_LENGTH),
    crc: header.readUInt32LE(OFF_CRC),
    savedAt: new Date(u16(OFF_TIME), u16(OFF_TIME + 2) - 1, u16(OFF_TIME + 4), u16(OFF_TIME + 6), u16(OFF_TIME + 8), u16(OFF_TIME + 10)),
    product: header.subarray(OFF_PRODUCT, HEADER_SIZE).toString('latin1').replace(/\0.*$/s, ''),
  };
}

/** Header and inflated payload of a roster file. */
export function splitContainer(buf: Buffer): { header: Buffer; payload: Buffer } {
  if (buf.length < HEADER_SIZE + 2 || buf.subarray(0, 8).toString('latin1') !== 'FBCHUNKS') throw new Error('not a roster container');
  const payload = zlib.inflateSync(buf.subarray(HEADER_SIZE), { finishFlush: zlib.constants.Z_SYNC_FLUSH });
  return { header: Buffer.from(buf.subarray(0, HEADER_SIZE)), payload };
}

/** A full roster file: the base header with length, checksum and save time recomputed,
 *  the deflated payload, and zero padding to the fixed size. */
export function buildContainer(header: Buffer, payload: Buffer, now = new Date()): Buffer {
  if (header.length !== HEADER_SIZE) throw new Error(`header must be ${HEADER_SIZE} bytes`);
  const h = Buffer.from(header);
  h.writeUInt32LE(payload.length >>> 0, OFF_LENGTH);
  h.writeUInt32LE(crc32Bzip2(payload), OFF_CRC);
  const t = [now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds()];
  t.forEach((v, i) => h.writeUInt16LE(v, OFF_TIME + i * 2));
  const deflated = zlib.deflateSync(payload, { level: 9 });
  if (HEADER_SIZE + deflated.length > ROSTER_FILE_SIZE) throw new Error(`roster too large: ${deflated.length} compressed bytes do not fit the ${ROSTER_FILE_SIZE}-byte container`);
  const out = Buffer.alloc(ROSTER_FILE_SIZE);
  h.copy(out, 0);
  deflated.copy(out, HEADER_SIZE);
  return out;
}
```

- [ ] **Step 4: Run the tests**

Run: `cd server && node --import tsx --test src/services/__tests__/RosterContainer.test.ts`
Expected: 4 passing (fixture test skips without the roster). `payloadOffset` is imported from the current `RosterFileService`, which still exports it.

- [ ] **Step 5: Commit**

```bash
cd draft-class-generator
git add server/src/services/RosterContainer.ts server/src/services/__tests__/RosterContainer.test.ts
git commit -m "Roster container writer: length, CRC-32/BZIP2 and save time in the FBCHUNKS header

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: RosterFileService reads through the engine and can write

**Files:**
- Modify: `server/src/services/RosterFileService.ts`, `server/src/routes/roster.ts`
- Test: `server/src/services/__tests__/RosterFile.test.ts`

**Interfaces:**
- Consumes: `parseTdb2`, `serializeTdb2`, `intOf`, `strOf` (Task 1); `splitContainer`, `buildContainer` (Task 3).
- Produces (all on `RosterFileService`): `open(buf, name): Promise<RosterData>`, `get(id): Promise<RosterData | null>`, `openFromSaves(name): Promise<RosterData>`, `parse(buf, name?): Promise<RosterData>`, `openBase(name): Promise<BaseRoster>`, `write(tdb2, header): Buffer`, `savePath(name): string`, `outputNameFor(name): string`, plus the unchanged `listSaves`, `savesDir`, `isRoster`, `payloadOffset`, `_reset`. New exported types: `BaseRoster { name: string; header: Buffer; tdb2: Tdb2File; teams: RosterTeam[]; players: RosterPlayer[]; freeAgentTeamId: number }`. `RosterData` gains `freeAgentTeamId: number`. `RosterTeam`/`RosterPlayer` unchanged.

- [ ] **Step 1: Update the tests**

In `server/src/services/__tests__/RosterFile.test.ts`:
- make the fixture tests `async` and `await` `RosterFileService.parse(...)`, `openFromSaves(...)`, `get(...)`; `assert.throws(() => openFromSaves('../ROSTER-Official'))` becomes `await assert.rejects(RosterFileService.openFromSaves('../ROSTER-Official'), /not a roster file name/)`; `assert.equal(await RosterFileService.get('0123456789abcdef'), null)`.
- keep the `decodeSmall` test as is (the function stays exported; it documents the on-disk digit encoding).
- add:

```ts
test('openBase exposes the parsed file, the free-agent team and an output name', skipWithoutRoster, async () => {
  const base = await RosterFileService.openBase('ROSTER-Official');
  assert.equal(base.name, 'ROSTER-Official');
  assert.equal(base.header.length, 0x4a);
  assert.equal(base.tdb2.PLAY.records.length, base.players.length);
  assert.equal(base.freeAgentTeamId, base.teams.find((t) => /free/i.test(t.name))!.id);
  assert.ok(base.players.every((p) => p.teamId === base.freeAgentTeamId ? p.team === null : p.team !== null));
  const out = RosterFileService.write(base.tdb2, base.header);
  assert.equal(out.length, 6_291_530);
  assert.equal(RosterFileService.outputNameFor('My 85 Bears!'), 'ROSTER-MY85BEARS');
  assert.equal(RosterFileService.outputNameFor(''), 'ROSTER-CUSTOM');
  assert.equal(RosterFileService.outputNameFor('a'.repeat(40)), 'ROSTER-' + 'A'.repeat(16));
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd server && node --import tsx --test src/services/__tests__/RosterFile.test.ts`
Expected: FAIL (`openBase is not a function`, and the awaited calls return plain objects, so `.count` reads work but the new test fails).

- [ ] **Step 3: Rewrite the read path on the engine**

Replace the body of `server/src/services/RosterFileService.ts` from `type FieldKind` down to the end with the following, keeping the file header comment (update its last line: "Read-only" becomes "Writes go through `write`; see RosterBuildService."), the interfaces (`RosterTeam`, `RosterPlayer`, `RosterInfo`, `RosterData`, `SaveFileInfo`; add `freeAgentTeamId: number` to `RosterInfo`), the constants (`OPENED_DIR`, `KEEP`, `SAVE_NAME`), `decodeSmall`, and `payloadOffset`:

```ts
import { parseTdb2, serializeTdb2, intOf, strOf, type Tdb2File, type Tdb2Record } from './Tdb2Engine';
import { splitContainer, buildContainer } from './RosterContainer';
import { RATING_KEYS } from './AttributeModel';

/** camelCase rating key -> PLAY field. */
export const PLAY_RATING_KEY: Record<string, string> = {
  speed: 'PSPD', acceleration: 'PACC', agility: 'PAGI', strength: 'PSTR', awareness: 'PAWR', jumping: 'PJMP', stamina: 'PSTA',
  changeOfDirection: 'PELU', toughness: 'PTGH', injury: 'PINJ', carrying: 'PCAR', ballCarrierVision: 'PBCV', breakTackle: 'PBKT',
  trucking: 'PLTR', stiffArm: 'PLSA', spinMove: 'PLSM', jukeMove: 'PLJM', catching: 'PCTH', catchInTraffic: 'PLCI', spectacularCatch: 'PLSC',
  shortRouteRunning: 'SRRN', mediumRouteRunning: 'PMRR', deepRouteRunning: 'PDRR', release: 'PLRL', throwPower: 'PTHP',
  throwAccuracyShort: 'PTAS', throwAccuracyMid: 'PTAM', throwAccuracyDeep: 'PTAD', throwOnTheRun: 'PTOR', throwUnderPressure: 'PTUP',
  playAction: 'PPLA', breakSack: 'PBSK', passBlock: 'PPBK', passBlockPower: 'PPBS', passBlockFinesse: 'PPBF', runBlock: 'PRBK',
  runBlockPower: 'PRBS', runBlockFinesse: 'PRBF', leadBlock: 'PLBK', impactBlocking: 'PLIB', tackle: 'PTAK', hitPower: 'PLHT',
  powerMoves: 'PLPM', finesseMoves: 'PFMS', blockShedding: 'PBSG', pursuit: 'PLPU', playRecognition: 'PLPR', manCoverage: 'PLMC',
  zoneCoverage: 'PLZC', pressCoverage: 'PLPE', kickPower: 'PKPR', kickAccuracy: 'PKAC', kickReturn: 'PKRT', longSnap: 'PIMP',
};

export interface BaseRoster {
  name: string;
  header: Buffer;
  tdb2: Tdb2File;
  teams: RosterTeam[];
  players: RosterPlayer[];
  freeAgentTeamId: number;
}

let portraitByAsset: Map<string, string | null> | null = null;
function portraitFor(asset: string | null): string | null {
  /* unchanged from today */
}

function buildTeams(file: Tdb2File): RosterTeam[] {
  return file.TEAM.records
    .map((r) => ({ id: intOf(r, 'TGID'), name: strOf(r, 'TASN'), city: strOf(r, 'TLNA'), abbr: strOf(r, 'TSNA') }))
    .filter((t) => t.name);
}

function freeAgentTeam(teams: RosterTeam[]): number {
  const fa = teams.find((t) => /^free\s*agents?$/i.test(t.name)) ?? teams.find((t) => /free/i.test(t.name));
  if (!fa) throw new Error('no free-agent team in this roster');
  return fa.id;
}

function buildPlayer(r: Tdb2Record, teamById: Map<number, RosterTeam>, faId: number): RosterPlayer | null {
  const firstName = strOf(r, 'PFNA'), lastName = strOf(r, 'PLNA');
  if (!firstName && !lastName) return null;
  const ratings: Record<string, number> = {};
  for (const k of RATING_KEYS) ratings[k] = intOf(r, PLAY_RATING_KEY[k]);
  const positionId = intOf(r, 'PPOS');
  const teamId = intOf(r, 'TGID', faId);
  const team = teamById.get(teamId);
  const isFa = teamId === faId || !team;
  const asset = strOf(r, 'PEPS') || null;
  const round = intOf(r, 'PDRO');
  const pick = intOf(r, 'PDPI');
  const weightOver = intOf(r, 'PWGT', -1);
  return {
    id: intOf(r, 'PGID'),
    firstName, lastName,
    position: PositionMapper.name(positionId),
    positionId,
    teamId,
    team: isFa ? null : team!.abbr,
    teamName: isFa ? null : `${team!.city} ${team!.name}`,
    overall: intOf(r, 'POVR'),
    age: intOf(r, 'PAGE'),
    heightInches: intOf(r, 'PHGT'),
    weight: weightOver >= 0 ? weightOver + 160 : 0,
    jersey: intOf(r, 'PJEN'),
    yearsPro: intOf(r, 'PYRP'),
    devTrait: Math.max(0, Math.min(3, intOf(r, 'PROL'))),
    archetype: LookupService.idToName('archetype', intOf(r, 'PLTY')) || null,
    college: r.fields.PCOL ? LookupService.idToName('college', intOf(r, 'PCOL')) || null : null,
    hometown: strOf(r, 'PHTN') || null,
    draftRound: round > 0 && round < 63 ? round : null,
    draftPick: r.fields.PDPI && pick < 300 ? pick : null,
    assetName: asset,
    portrait: portraitFor(asset),
    ratings,
  };
}

function buildPlayers(file: Tdb2File, teams: RosterTeam[], faId: number): RosterPlayer[] {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const out: RosterPlayer[] = [];
  for (const r of file.PLAY.records) {
    const p = buildPlayer(r, teamById, faId);
    if (p) out.push(p);
  }
  return out;
}

interface Entry extends RosterData { buf: Buffer }
const entries = new Map<string, Entry>();

function persist(e: Entry): void { /* unchanged */ }

async function restore(id: string): Promise<Entry | null> {
  if (!/^[a-f0-9]{16}$/.test(id)) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(OPENED_DIR, `${id}.roster.json`), 'utf8')) as { name: string; openedAt: number };
    const buf = fs.readFileSync(path.join(OPENED_DIR, `${id}.roster`));
    const e = await build(buf, meta.name, id, meta.openedAt);
    entries.set(id, e);
    return e;
  } catch {
    return null;
  }
}

async function parseBase(buf: Buffer, name: string): Promise<BaseRoster> {
  if (payloadOffset(buf) < 0) throw new Error('That is not a Madden 27 roster file');
  const { header, payload } = splitContainer(buf);
  const tdb2 = await parseTdb2(payload);
  for (const t of ['PLAY', 'TEAM', 'BLOB', 'DCHT']) if (!tdb2[t]) throw new Error(`No ${t} table in that roster file`);
  const teams = buildTeams(tdb2);
  const freeAgentTeamId = freeAgentTeam(teams);
  const players = buildPlayers(tdb2, teams, freeAgentTeamId);
  if (!players.length) throw new Error('No players found in that roster file');
  return { name, header, tdb2, teams, players, freeAgentTeamId };
}

async function build(buf: Buffer, name: string, id: string, openedAt: number): Promise<Entry> {
  const base = await parseBase(buf, name);
  return {
    id, name, gameVersion: 'm27', openedAt,
    count: base.players.length,
    teamCount: base.teams.filter((t) => t.id !== base.freeAgentTeamId).length,
    freeAgentTeamId: base.freeAgentTeamId,
    teams: base.teams, players: base.players, buf: Buffer.from(buf),
  };
}

const strip = (e: Entry): RosterData => { const { buf: _b, ...rest } = e; void _b; return rest; };

export const RosterFileService = {
  payloadOffset,
  decodeSmall,

  isRoster(buf: Buffer): boolean { return payloadOffset(buf) >= 0; },

  async open(buf: Buffer, name: string): Promise<RosterData> {
    const clean = String(name || 'ROSTER').replace(/[\\/]+/g, '').slice(0, 64) || 'ROSTER';
    const id = crypto.randomBytes(8).toString('hex');
    const e = await build(buf, clean, id, Date.now());
    entries.set(id, e);
    persist(e);
    return strip(e);
  },

  async get(id: string): Promise<RosterData | null> {
    const e = entries.get(id) ?? (await restore(id));
    return e ? strip(e) : null;
  },

  savesDir(): string { return M27_SAVES_DIR; },

  listSaves(): SaveFileInfo[] { /* unchanged */ },

  /** Absolute path of a ROSTER file in the saves folder; the name is validated. */
  savePath(name: string): string {
    if (!SAVE_NAME.test(name)) throw new Error('not a roster file name');
    return path.join(M27_SAVES_DIR, name);
  },

  async openFromSaves(name: string): Promise<RosterData> {
    const file = RosterFileService.savePath(name);
    if (!fs.existsSync(file)) throw new Error(`${name} is not in the Madden 27 Saves folder`);
    return RosterFileService.open(fs.readFileSync(file), name);
  },

  /** A base roster from the saves folder with its parsed tables, for building. */
  async openBase(name: string): Promise<BaseRoster> {
    const file = RosterFileService.savePath(name);
    if (!fs.existsSync(file)) throw new Error(`${name} is not in the Madden 27 Saves folder`);
    return parseBase(fs.readFileSync(file), name);
  },

  /** The full 6,291,530-byte file for a parsed roster and its base header. */
  write(tdb2: Tdb2File, header: Buffer, now = new Date()): Buffer {
    return buildContainer(header, serializeTdb2(tdb2), now);
  },

  /** ROSTER-<NAME>: upper-case, alphanumerics only, at most 16 characters, CUSTOM when empty. */
  outputNameFor(name: string): string {
    const clean = String(name ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 16);
    return `ROSTER-${clean || 'CUSTOM'}`;
  },

  async parse(buf: Buffer, name = 'ROSTER'): Promise<RosterData> {
    return strip(await build(buf, name, '0000000000000000', Date.now()));
  },

  _reset(): void { entries.clear(); },
};
```

Remove the old `FieldKind`/`FieldMap`/`map()`/`keyOf`/`inflate`/`varint`/`parseList`/`get` code and the `Rec` type; drop the now-unused `LOOKUPS_DIR` import. Keep `LookupService`, `PositionMapper`, `LikenessService`, `PortraitService`, `RATING_KEYS` imports. `server/data/lookups/m27-roster-fields.json` stays (documentation of the field ids; nothing reads it now).

- [ ] **Step 4: Await the service in the routes**

In `server/src/routes/roster.ts` make the three handlers `async` and `await` `RosterFileService.open`, `openFromSaves` and `get`; wrap the `get` handler in the same `try/catch` shape as `open` (a parse failure of a persisted copy must answer 400, not crash).

- [ ] **Step 5: Run the tests and typecheck**

Run: `cd server && node --import tsx --test src/services/__tests__/RosterFile.test.ts src/services/__tests__/RosterContainer.test.ts src/services/__tests__/Tdb2Engine.test.ts && npm run typecheck`
Expected: all pass, no type errors. The shipped-roster assertions from before (Geno's throw power, college ids decode, weights are pounds, 2,500–3,500 players, 32 teams) must still hold on the engine path; if `college ids decode like the ratings` fails, `PCOL` is an int the engine already decodes, so pass it straight to `LookupService.idToName`.

- [ ] **Step 6: Commit**

```bash
cd draft-class-generator
git add server/src/services/RosterFileService.ts server/src/routes/roster.ts server/src/services/__tests__/RosterFile.test.ts
git commit -m "RosterFileService reads rosters through the TDB2 engine and can write them back

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Gate 1 script — a no-edit round trip for Madden to load

**Files:**
- Create: `server/scripts/roster-gate1.ts`

**Interfaces:**
- Consumes: `RosterFileService.openBase`, `write`, `savePath`, `listSaves`; `headerInfo`, `crc32Bzip2`, `splitContainer` (Task 3).

- [ ] **Step 1: Write the script**

`server/scripts/roster-gate1.ts`:

```ts
/**
 * Gate 1: write ROSTER-Official back through the TDB2 engine with no edits, as
 * ROSTER-GATE1 in the Madden 27 saves folder, for an in-game load test.
 *
 *   npx tsx scripts/roster-gate1.ts [baseName]      (default ROSTER-Official)
 *
 * In Madden 27: Load and Save -> Load -> Roster -> ROSTER-GATE1. Check a few
 * players (Geno Smith QB NYJ 72 OVR, throw power 88) and start a play.
 */
import fs from 'fs';
import { RosterFileService } from '../src/services/RosterFileService';
import { splitContainer, headerInfo, crc32Bzip2 } from '../src/services/RosterContainer';

async function main() {
  const baseName = process.argv[2] || 'ROSTER-Official';
  const outName = 'ROSTER-GATE1';
  const base = await RosterFileService.openBase(baseName);
  const out = RosterFileService.write(base.tdb2, base.header);
  const { header, payload } = splitContainer(out);
  const info = headerInfo(header);
  if (info.payloadLength !== payload.length || info.crc !== crc32Bzip2(payload)) throw new Error('self-check failed: header does not match payload');
  const original = splitContainer(fs.readFileSync(RosterFileService.savePath(baseName))).payload;
  const outPath = RosterFileService.savePath(outName);
  fs.writeFileSync(`${outPath}.tmp`, out);
  fs.renameSync(`${outPath}.tmp`, outPath);
  console.log(`wrote ${outPath}`);
  console.log(`players ${base.players.length}, teams ${base.teams.length}, payload ${payload.length} bytes (original ${original.length}), crc ${info.crc.toString(16)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it**

Run: `cd server && npx tsx scripts/roster-gate1.ts`
Expected output ends with `wrote …\saves\ROSTER-GATE1` and a payload size within a few KB of the original (about 4,066,000 bytes).

- [ ] **Step 3: Commit, then hand the file to the user**

```bash
cd draft-class-generator
git add server/scripts/roster-gate1.ts
git commit -m "Gate 1 script: an unedited roster written back for the in-game load test

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

**STOP HERE until the user reports the in-game result for ROSTER-GATE1.** Passing: the roster loads, a few players read right, a play runs. If it fails, record what Madden said and stop this plan: the spec's fallback (a byte-faithful serializer) needs its own plan. If it passes, record the pass date in the memory note `m27-roster-format` and continue.

---

### Task 6: RosterBuildService — moves, cuts and edits

**Files:**
- Create: `server/src/types/roster.ts`, `server/src/services/RosterBuildService.ts`
- Test: `server/src/services/__tests__/RosterBuild.test.ts`

**Interfaces:**
- Consumes: `BaseRoster`, `RosterFileService.openBase/write/savePath/outputNameFor`, `PLAY_RATING_KEY` (Task 4); `intOf`, `strOf`, `setInt`, `setStr`, `makeIntField`, `makeStringField`, `makeRecord` (Task 1); `PositionMapper.toM26Id/name`; `RATING_KEYS`.
- Produces: `RosterBuildService.apply(base, doc): ApplyCounts`, `RosterBuildService.build(doc): Promise<RosterBuildResult>`, `SLOT_ID`, `ROSTER_POSITIONS`, `DEV_ID`.

- [ ] **Step 1: Define the types**

`server/src/types/roster.ts`:

```ts
/** One player's pending edits (same shape as the web's PlayerFieldEdit). */
export interface PlayerFieldEdit {
  overall?: number;
  age?: number;
  position?: string;   // Madden 27 label: QB HB FB WR TE LT LG C RG RT LEDG REDG DT SAM MIKE WILL CB FS SS K P LS
  dev?: string;        // Normal | Star | Superstar | XFactor
  jersey?: number;
  ratings?: Record<string, number>;
  bodyType?: string;   // Standard | Thin | Muscular | Heavy | Lean
  genericHead?: string; // gen_<tone>_...
  gear?: Record<string, string>; // GearOptionsService slot -> asset
}

/** A roster document the server can apply: deltas against a base file. */
export interface RosterBuildDoc {
  baseName: string;                  // ROSTER-* file in the Madden 27 saves folder
  name: string;                      // roster name; the output is ROSTER-<NAME>
  moves?: Record<string, number>;    // PGID -> TGID (the free-agent team id cuts)
  edits?: Record<string, PlayerFieldEdit>; // PGID -> edits
}

export interface ApplyCounts { moved: number; cut: number; edited: number; skipped: string[] }

export interface RosterBuildResult extends ApplyCounts {
  input: string;
  output: string;
  outputPath: string;
}
```

- [ ] **Step 2: Write the failing tests**

`server/src/services/__tests__/RosterBuild.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { M27_SAVES_DIR } from '../../config/paths';
import { RosterFileService } from '../RosterFileService';
import { RosterBuildService, SLOT_ID, ROSTER_POSITIONS, DEV_ID } from '../RosterBuildService';
import { splitContainer } from '../RosterContainer';
import { parseTdb2, intOf, strOf } from '../Tdb2Engine';

const OFFICIAL = path.join(M27_SAVES_DIR, 'ROSTER-Official');
const skipWithoutRoster = { skip: fs.existsSync(OFFICIAL) ? false : 'no Madden 27 ROSTER-Official in the Saves folder' };

test('static maps', () => {
  assert.equal(SLOT_ID.HeadWear, 106);
  assert.equal(SLOT_ID.LeftShoe, 10);
  assert.equal(ROSTER_POSITIONS.length, 22);
  assert.ok(ROSTER_POSITIONS.includes('LEDG') && ROSTER_POSITIONS.includes('MIKE'));
  assert.deepEqual(DEV_ID, { Normal: 0, Star: 1, Superstar: 2, XFactor: 3 });
});

test('moves, cuts and edits land in the tables and survive a write', skipWithoutRoster, async () => {
  const base = await RosterFileService.openBase('ROSTER-Official');
  const geno = base.players.find((p) => p.firstName === 'Geno' && p.lastName === 'Smith')!;
  const bears = base.teams.find((t) => t.abbr === 'CHI')!;
  const someJet = base.players.find((p) => p.teamId === geno.teamId && p.id !== geno.id)!;
  const counts = RosterBuildService.apply(base, {
    baseName: 'ROSTER-Official', name: 'test',
    moves: { [geno.id]: bears.id, [someJet.id]: base.freeAgentTeamId },
    edits: {
      [geno.id]: { overall: 90, age: 30, dev: 'Superstar', jersey: 12, position: 'QB', ratings: { throwPower: 95, speed: 70 }, bodyType: 'Thin', genericHead: 'gen_3_T_G_001', gear: { helmet: 'GearHelmet_Speed_Flex', facemask: 'GearFaceMask_SpeedFlex808', visor: 'GearVisor_None' } },
      '999999': { overall: 50 },
    },
  });
  assert.deepEqual({ moved: counts.moved, cut: counts.cut, edited: counts.edited }, { moved: 1, cut: 1, edited: 1 });
  assert.ok(counts.skipped.some((s) => s.includes('999999')), 'unknown player reported');

  const out = RosterFileService.write(base.tdb2, base.header);
  const file = await parseTdb2(splitContainer(out).payload);
  const g = file.PLAY.records.find((r) => intOf(r, 'PGID') === geno.id)!;
  assert.equal(intOf(g, 'TGID'), bears.id);
  assert.equal(intOf(g, 'PYWT'), 0);
  assert.equal(intOf(g, 'POVR'), 90);
  assert.equal(intOf(g, 'PAGE'), 30);
  assert.equal(intOf(g, 'PROL'), 2);
  assert.equal(intOf(g, 'PJEN'), 12);
  assert.equal(intOf(g, 'PTHP'), 95);
  assert.equal(intOf(g, 'PSPD'), 70);
  const j = file.PLAY.records.find((r) => intOf(r, 'PGID') === someJet.id)!;
  assert.equal(intOf(j, 'TGID'), base.freeAgentTeamId);
  assert.ok(!file.DCHT.records.some((r) => intOf(r, 'PGID') === geno.id && intOf(r, 'TGID') === geno.teamId), 'old depth-chart rows dropped');
  assert.ok(!file.DCHT.records.some((r) => intOf(r, 'PGID') === someJet.id), 'cut player has no depth-chart rows');
  const blob = file.BLOB.records[0].fields.BLBM.value.records.find((r: any) => r.index === geno.id)!;
  assert.equal(strOf(blob, 'GENR'), 'gen_3_T_G_001');
  assert.equal(intOf(blob, 'CJNO'), 12);
  const louts = blob.fields.LOUT.value.records;
  const body = louts.find((l: any) => intOf(l, 'LDCT') === 5).fields.PINS.value.records[0];
  assert.equal(strOf(body, 'ITAN'), 'Thin_BodyType');
  const pins = louts.find((l: any) => intOf(l, 'LDTY') === 1).fields.PINS.value.records;
  assert.equal(strOf(pins.find((p: any) => intOf(p, 'SLOT', -1) === 106), 'ITAN'), 'GearHelmet_Speed_Flex');
  assert.equal(strOf(pins.find((p: any) => intOf(p, 'SLOT', -1) === 2), 'ITAN'), 'GearVisor_None');
  assert.equal(strOf(pins.find((p: any) => !p.fields.SLOT && strOf(p, 'ITAN').startsWith('GearFaceMask_')), 'ITAN'), 'GearFaceMask_SpeedFlex808');
  assert.equal(file.PLAY.records.length, base.players.length, 'nobody deleted');
});

test('build refuses to overwrite the base or the official roster', skipWithoutRoster, async () => {
  await assert.rejects(RosterBuildService.build({ baseName: 'ROSTER-Official', name: 'Official' }), /official/i);
  await assert.rejects(RosterBuildService.build({ baseName: 'ROSTER-Nope', name: 'x' }), /not in the Madden 27 Saves folder/);
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `cd server && node --import tsx --test src/services/__tests__/RosterBuild.test.ts`
Expected: FAIL, `Cannot find module '../RosterBuildService'`.

- [ ] **Step 4: Write the service**

`server/src/services/RosterBuildService.ts`:

```ts
import fs from 'fs';
import path from 'path';
import { RosterFileService, PLAY_RATING_KEY, type BaseRoster } from './RosterFileService';
import { intOf, strOf, setInt, setStr, makeIntField, makeStringField, makeRecord, type Tdb2Record, type Tdb2Table } from './Tdb2Engine';
import { PositionMapper } from './PositionMapper';
import { RATING_KEYS } from './AttributeModel';
import { GEAR_SLOT_TYPES, waistConflict } from './GearOptionsService';
import type { RosterBuildDoc, PlayerFieldEdit, ApplyCounts, RosterBuildResult } from '../types/roster';

/** Loadout slotType (the app's names, as in the CharacterVisuals JSON) -> roster blob SLOT id.
 *  Tallied from every player's blob in ROSTER-Official on 2026-09-16. */
export const SLOT_ID: Record<string, number> = {
  HeadWear: 106, Visor: 2, LeftHandWear: 114, RightHandWear: 115, LeftShoe: 10, RightShoe: 11,
  Shoulderpads: 25, Neckpad: 29, OuterShirt: 125, InnerSocks: 109, LeftArmWear: 110, RightArmWear: 111,
  LeftElbowWear: 116, RightElbowWear: 117, LeftWristWear: 120, RightWristWear: 121,
  LeftThighWear: 142, RightThighWear: 143, KneeWear: 118, LeftSpat: 9, RightSpat: 54, OuterPants: 124,
};
const BODY_SLOT = 129;
const BODY_TYPES = new Set(['Standard', 'Thin', 'Muscular', 'Heavy', 'Lean']);
export const DEV_ID: Record<string, number> = { Normal: 0, Star: 1, Superstar: 2, XFactor: 3 };
/** The 22 Madden 27 labels in compact-id order (QB … LS). */
export const ROSTER_POSITIONS: string[] = Array.from({ length: 22 }, (_, i) => PositionMapper.name(i));
const clamp99 = (v: number) => Math.max(0, Math.min(99, Math.round(v)));

function playerRow(base: BaseRoster, pgid: number): Tdb2Record | undefined {
  return base.tdb2.PLAY.records.find((r) => intOf(r, 'PGID') === pgid);
}

function blobRow(base: BaseRoster, pgid: number): Tdb2Record | undefined {
  return base.tdb2.BLOB.records[0].fields.BLBM.value.records.find((r: Tdb2Record) => r.index === pgid);
}

function dropDepthChartRows(dcht: Tdb2Table, pgid: number, teamId: number): void {
  const keep = dcht.records.filter((r) => !(intOf(r, 'PGID') === pgid && intOf(r, 'TGID') === teamId));
  if (keep.length === dcht.records.length) return;
  dcht.records.length = 0;
  dcht.records.push(...keep);
  dcht.numEntries = keep.length;
}

/** The on-field PINS subtable of a blob (LDTY = 1) and the body PINS (LDCT = 5). */
function loadouts(blob: Tdb2Record): { onField: Tdb2Table | null; body: Tdb2Table | null } {
  const louts: Tdb2Record[] = blob.fields.LOUT?.value?.records ?? [];
  const find = (key: string, v: number) => louts.find((l) => intOf(l, key, -1) === v)?.fields.PINS?.value ?? null;
  return { onField: find('LDTY', 1), body: find('LDCT', 5) };
}

function setPin(pins: Tdb2Table, slot: number, asset: string): void {
  const rec = pins.records.find((p) => intOf(p, 'SLOT', -1) === slot);
  if (rec) setStr(rec, 'ITAN', asset);
  else pins.addRecord(makeRecord([makeStringField('ITAN', asset), makeIntField('SLOT', slot)]));
}

function setFacemask(pins: Tdb2Table, asset: string): void {
  const rec = pins.records.find((p) => !p.fields.SLOT && strOf(p, 'ITAN').startsWith('GearFaceMask_'));
  if (rec) setStr(rec, 'ITAN', asset);
  else pins.addRecord(makeRecord([makeStringField('ITAN', asset)]));
}

function applyEdit(base: BaseRoster, pgid: number, e: PlayerFieldEdit, skipped: string[]): boolean {
  const row = playerRow(base, pgid);
  if (!row) { skipped.push(`edit: player ${pgid} is not in the base roster`); return false; }
  let touched = false;
  if (e.overall != null) { setInt(row, 'POVR', clamp99(e.overall)); touched = true; }
  if (e.age != null) { setInt(row, 'PAGE', Math.max(18, Math.min(50, Math.round(e.age)))); touched = true; }
  if (e.jersey != null) { setInt(row, 'PJEN', clamp99(e.jersey)); touched = true; }
  if (e.position) {
    if (ROSTER_POSITIONS.includes(e.position)) { setInt(row, 'PPOS', ROSTER_POSITIONS.indexOf(e.position)); touched = true; }
    else skipped.push(`edit: unknown position ${e.position} for ${pgid}`);
  }
  if (e.dev) {
    if (e.dev in DEV_ID) { setInt(row, 'PROL', DEV_ID[e.dev]); touched = true; }
    else skipped.push(`edit: unknown dev trait ${e.dev} for ${pgid}`);
  }
  if (e.ratings) {
    for (const [k, v] of Object.entries(e.ratings)) {
      if (!RATING_KEYS.includes(k) || v == null) { skipped.push(`edit: unknown rating ${k} for ${pgid}`); continue; }
      setInt(row, PLAY_RATING_KEY[k], clamp99(Number(v)));
      touched = true;
    }
  }
  const blob = blobRow(base, pgid);
  if (e.jersey != null && blob) setInt(blob, 'CJNO', clamp99(e.jersey));
  if (e.genericHead) {
    if (/^gen_\d/i.test(e.genericHead) && blob) { setStr(blob, 'GENR', e.genericHead); touched = true; }
    else skipped.push(`edit: bad generic head ${e.genericHead} for ${pgid}`);
  }
  if (e.bodyType) {
    const { body } = blob ? loadouts(blob) : { body: null };
    if (BODY_TYPES.has(e.bodyType) && body) { setPin(body, BODY_SLOT, `${e.bodyType}_BodyType`); touched = true; }
    else skipped.push(`edit: body type ${e.bodyType} not applied for ${pgid}`);
  }
  if (e.gear && blob) {
    const { onField } = loadouts(blob);
    if (!onField) skipped.push(`edit: no on-field loadout for ${pgid}`);
    else {
      for (const [slot, asset] of Object.entries(e.gear)) {
        if (!asset || waistConflict(e.gear, slot)) continue;
        if (slot === 'facemask') { setFacemask(onField, asset); touched = true; continue; }
        const types = GEAR_SLOT_TYPES[slot] ?? [];
        if (!types.length) { skipped.push(`edit: unknown gear slot ${slot} for ${pgid}`); continue; }
        for (const t of types) {
          const id = SLOT_ID[t];
          if (id == null) { skipped.push(`edit: no roster slot for ${t} (${slot}) on ${pgid}`); continue; }
          setPin(onField, id, asset);
          touched = true;
        }
      }
    }
  }
  return touched;
}

export const RosterBuildService = {
  /** Apply a document's moves and edits to a parsed base roster, in place. */
  apply(base: BaseRoster, doc: RosterBuildDoc): ApplyCounts {
    const counts: ApplyCounts = { moved: 0, cut: 0, edited: 0, skipped: [] };
    const teamIds = new Set(base.teams.map((t) => t.id));
    for (const [idStr, teamId] of Object.entries(doc.moves ?? {})) {
      const pgid = Number(idStr);
      const row = playerRow(base, pgid);
      if (!row) { counts.skipped.push(`move: player ${pgid} is not in the base roster`); continue; }
      if (!teamIds.has(teamId)) { counts.skipped.push(`move: team ${teamId} is not in the base roster`); continue; }
      const from = intOf(row, 'TGID', base.freeAgentTeamId);
      if (from === teamId) continue;
      setInt(row, 'TGID', teamId);
      setInt(row, 'PYWT', 0);
      dropDepthChartRows(base.tdb2.DCHT, pgid, from);
      if (teamId === base.freeAgentTeamId) counts.cut++; else counts.moved++;
    }
    for (const [idStr, e] of Object.entries(doc.edits ?? {})) {
      if (applyEdit(base, Number(idStr), e, counts.skipped)) counts.edited++;
    }
    return counts;
  },

  /** Open the base, apply the document, write ROSTER-<NAME> next to it. */
  async build(doc: RosterBuildDoc): Promise<RosterBuildResult> {
    const output = RosterFileService.outputNameFor(doc.name);
    if (output.toUpperCase() === 'ROSTER-OFFICIAL') throw new Error('refusing to overwrite the official roster');
    if (output.toUpperCase() === String(doc.baseName).toUpperCase()) throw new Error('refusing to overwrite the base roster');
    const base = await RosterFileService.openBase(doc.baseName);
    const counts = RosterBuildService.apply(base, doc);
    const buf = RosterFileService.write(base.tdb2, base.header);
    const outputPath = RosterFileService.savePath(output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(`${outputPath}.tmp`, buf);
    fs.renameSync(`${outputPath}.tmp`, outputPath);
    return { ...counts, input: doc.baseName, output, outputPath };
  },
};
```

- [ ] **Step 5: Run the tests**

Run: `cd server && node --import tsx --test src/services/__tests__/RosterBuild.test.ts && npm run typecheck`
Expected: 3 passing (two skip without the fixture). The refusal test's second case must reject before opening anything: `openBase` throws `ROSTER-Nope is not in the Madden 27 Saves folder`.

- [ ] **Step 6: Commit**

```bash
cd draft-class-generator
git add server/src/types/roster.ts server/src/services/RosterBuildService.ts server/src/services/__tests__/RosterBuild.test.ts
git commit -m "RosterBuildService: moves, cuts and per-player edits applied to a base roster

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: The build route and the Gate 2 script

**Files:**
- Modify: `server/src/routes/roster.ts`
- Create: `server/scripts/roster-gate2.ts`
- Test: `server/src/__tests__/app.test.ts` (add one case) — check how that file spins up the app first and follow it.

**Interfaces:**
- Consumes: `RosterBuildService.build` (Task 6).
- Produces: `POST /api/roster/build` with body `RosterBuildDoc`, answering `RosterBuildResult` or `{ error }` with 400.

- [ ] **Step 1: Write the failing test**

In `server/src/__tests__/app.test.ts`, following its existing request helper, add:

```ts
test('POST /api/roster/build validates its body', async () => {
  const res = await request('POST', '/api/roster/build', { name: 'x' });
  assert.equal(res.status, 400);
  assert.match(String(res.body.error), /baseName/);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd server && node --import tsx --test src/__tests__/app.test.ts`
Expected: FAIL with status 404 (no route yet).

- [ ] **Step 3: Add the route**

In `server/src/routes/roster.ts`:

```ts
import { RosterBuildService } from '../services/RosterBuildService';
import type { RosterBuildDoc } from '../types/roster';

/** Apply a roster document to a base ROSTER file and write ROSTER-<NAME>. */
r.post('/roster/build', async (req, res) => {
  const b = (req.body ?? {}) as Partial<RosterBuildDoc>;
  if (!b.baseName || typeof b.baseName !== 'string') return res.status(400).json({ error: 'baseName required' });
  if (typeof b.name !== 'string') return res.status(400).json({ error: 'name required' });
  try {
    return res.json(await RosterBuildService.build({ baseName: b.baseName, name: b.name, moves: b.moves ?? {}, edits: b.edits ?? {} }));
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});
```

- [ ] **Step 4: Run the tests**

Run: `cd server && npm test`
Expected: everything passes (fixture tests skip where the roster is absent).

- [ ] **Step 5: Write the Gate 2 script**

`server/scripts/roster-gate2.ts`:

```ts
/**
 * Gate 2: one edited overall and one team move, written as ROSTER-GATE2 for an
 * in-game check.
 *
 *   npx tsx scripts/roster-gate2.ts
 *
 * In Madden 27, load ROSTER-GATE2 and check: Geno Smith is on the Bears at 90 OVR
 * with 95 throw power, and shows on the Bears' depth chart; the second Jets
 * quarterback listed below is a free agent.
 */
import { RosterFileService } from '../src/services/RosterFileService';
import { RosterBuildService } from '../src/services/RosterBuildService';

async function main() {
  const base = await RosterFileService.openBase('ROSTER-Official');
  const geno = base.players.find((p) => p.firstName === 'Geno' && p.lastName === 'Smith');
  const bears = base.teams.find((t) => t.abbr === 'CHI');
  if (!geno || !bears) throw new Error('Geno Smith or the Bears are not in ROSTER-Official');
  const otherJet = base.players.find((p) => p.teamId === geno.teamId && p.position === 'QB' && p.id !== geno.id);
  if (!otherJet) throw new Error('no second Jets quarterback');
  const result = await RosterBuildService.build({
    baseName: 'ROSTER-Official',
    name: 'GATE2',
    moves: { [geno.id]: bears.id, [otherJet.id]: base.freeAgentTeamId },
    edits: { [geno.id]: { overall: 90, ratings: { throwPower: 95 } } },
  });
  console.log(result);
  console.log(`check in-game: Geno Smith -> Bears, 90 OVR, THP 95; ${otherJet.firstName} ${otherJet.lastName} -> free agent`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 6: Run it and commit**

Run: `cd server && npx tsx scripts/roster-gate2.ts`
Expected: prints `{ moved: 1, cut: 1, edited: 1, skipped: [], input: 'ROSTER-Official', output: 'ROSTER-GATE2', outputPath: … }`.

```bash
cd draft-class-generator
git add server/src/routes/roster.ts server/src/__tests__/app.test.ts server/scripts/roster-gate2.ts
git commit -m "POST /api/roster/build writes a roster from a document; Gate 2 script

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

**STOP HERE until the user reports the in-game result for ROSTER-GATE2.** Passing: Geno is a Bear at 90 with 95 throw power and has a depth-chart slot; the cut quarterback is a free agent. Record the result in the memory note `m27-roster-format`. The next plan (sidebar rail and Rosters view) starts from here; pool adds and Gate 3 follow it.

---

## Self-review notes

- Spec coverage for phases 1–2: vendored engine (Task 1), sparse write (Task 2, an addition beyond the spec that makes Gate 1 more likely to pass without changing the fallback), container writer (Task 3), `RosterFileService` on the engine with `write` and `openBase` (Task 4), Gate 1 (Task 5), build service with moves, cuts, edits and the error list (Task 6), build route and Gate 2 (Task 7). Not in this plan by design: adds, `preview-add`, the web document, the rail and the view.
- Type consistency: `BaseRoster.freeAgentTeamId`, `RosterFileService.outputNameFor/savePath/openBase/write`, `PLAY_RATING_KEY`, `SLOT_ID`, `ROSTER_POSITIONS`, `DEV_ID`, `ApplyCounts.skipped` are used with the same names in every task.
- CHANGELOG: nothing user-visible ships in these phases; the Rosters view plan adds the Unreleased line.
