import zlib from 'node:zlib';
import { buildContainer } from '../../RosterContainer';

// A tiny, synthetic roster encoded independently of Tdb2Engine's field helpers
// and serializer. Exact reader expectations must not depend on a user's live
// ROSTER-Official, whose ratings, equipment and personas change with updates.
type Row = Record<string, number | string | Buffer>;
const key = (name: string, type: number) => {
  const packed = [...name].reduce((n, c) => (n << 6) | (c.charCodeAt(0) - 32), 0);
  return Buffer.from([packed >>> 16, packed >>> 8, packed, type]);
};
// Fixture numbers fit in two bytes: six data bits, then seven data bits.
const integer = (n: number) => {
  if (!Number.isInteger(n) || n < 0 || n >= 8192) throw new Error(`fixture integer: ${n}`);
  return Buffer.from(n < 64 ? [n] : [(n & 63) | 128, n >>> 6]);
};
function record(row: Row): Buffer {
  const fields = Object.keys(row).sort().map(name => {
    const value = row[name];
    if (Buffer.isBuffer(value)) return value; // pre-encoded subtable field
    if (typeof value === 'number') return Buffer.concat([key(name, 0), integer(value)]);
    const text = Buffer.from(value + '\0', 'utf8');
    return Buffer.concat([key(name, 1), integer(text.length), text]);
  });
  return Buffer.concat([...fields, Buffer.from([0])]);
}
function table(name: string, rows: Row[]): Buffer {
  return Buffer.concat([key(name, 4), Buffer.from([0]), integer(rows.length), ...rows.map(record)]);
}
function blob(index: number, row: Row): Buffer {
  const body = Buffer.concat([
    key('CHAN', 3), key('CHAN', 3), Buffer.from([0, 0]), key('CHVI', 3), record(row),
  ]);
  const compressed = zlib.gzipSync(body);
  return Buffer.concat([integer(index), integer(compressed.length), compressed]);
}

export function rosterFixturePayload(): Buffer {
  const visuals = blob(112, {
    GENR: 'gen_6_T_G_005', SKNT: 6,
    LOUT: table('LOUT', [
      { LDCT: 5, PINS: table('PINS', [{ SLOT: 129, ITAN: 'Standard_BodyType' }]) },
      { LDTY: 1, PINS: table('PINS', [
        { SLOT: 106, ITAN: 'GearHelmet_Speed_Flex' },
        { ITAN: 'GearFaceMask_SpeedFlex808' },
      ]) },
    ]),
  });
  const generic = blob(113, { GENR: 'gen_2_H_GM_004', SKNT: 2 });
  return Buffer.concat([
    table('BLOB', [{ BLBM: Buffer.concat([key('BLBM', 5), Buffer.from([0, 2, 2]), visuals, generic]) }]),
    table('DCHT', []), table('DFTP', []), table('INJY', []),
    table('PLAY', [
      { PFNA: 'Geno', PLNA: 'Smith', PGID: 112, TGID: 1, POVR: 72, PSPD: 84,
        PEPS: 'SmithGeno_112', PAGE: 35, PHGT: 75, PWGT: 61, PCOL: 1, PLTY: 1 },
      { PFNA: 'Fixture', PLNA: 'Rookie', PGID: 113, TGID: 32, POVR: 63, PSPD: 99,
        PEPS: 'gen_2_H_GM_004', PPOS: 1, PAGE: 21, PHGT: 70, PWGT: 40 },
    ]),
    table('PLCT', []),
    table('PRSN', [{ PGID: 112, DNA0: 45, DNA1: 51, DNA2: 17, DNA3: 25, DNA4: 32, DNA5: 30 }]),
    table('TEAM', [
      { TGID: 1, TASN: 'Cowboys', TLNA: 'Dallas', TSNA: 'DAL' },
      { TGID: 32, TASN: 'Free Agents', TLNA: '', TSNA: 'FA' },
    ]),
  ]);
}

export function rosterFixture(): Buffer {
  const header = Buffer.alloc(0x4a);
  header.write('FBCHUNKS');
  header.write('Madden-27-RL2-9157631', 0x2e, 'latin1');
  return buildContainer(header, rosterFixturePayload(), new Date(2026, 0, 1));
}
