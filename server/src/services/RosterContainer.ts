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
