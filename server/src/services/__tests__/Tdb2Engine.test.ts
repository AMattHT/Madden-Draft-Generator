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
  assert.ok(blob.records.some((r: { index: number }) => r.index === 112), 'blob keyed by PGID');
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
