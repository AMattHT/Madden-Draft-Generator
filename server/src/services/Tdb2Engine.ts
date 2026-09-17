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
