import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
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
  const big = crypto.randomBytes(ROSTER_FILE_SIZE); // incompressible
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
