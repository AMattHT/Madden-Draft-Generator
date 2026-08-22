import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mdc27Service } from '../Mdc27Service';
import { encodeBirthdate, decodeBirthdate } from '../M27Fields';

const START = 0x46;

function prospect(i: number, extra: Record<string, unknown> = {}) {
  return {
    firstName: `First${i}`, lastName: `Last${i}`, position: 3, overall: 70, devTrait: 0,
    age: 22, heightInches: 72, weight: 200, college: 5, jerseyNum: 10,
    draftRound: 1, draftPick: i + 1, speed: 80, acceleration: 80,
    visuals: { genericHeadName: 'gen_2_H_GM_004', bodyType: 'Muscular', loadouts: [] },
    ...extra,
  };
}

test('header prospect count at 0x42 is written to match the prospects written', () => {
  const buf = Mdc27Service.write([prospect(0), prospect(1), prospect(2)]);
  assert.equal(buf.readUInt16LE(0x42), 3);
  assert.equal(buf.readUInt16LE(0x44), 0); // untouched neighbour
});

test('portrait PID is at 0x94 and commentary id at 0x9e (as in the game files)', () => {
  const buf = Mdc27Service.write([prospect(0, { PID: 4196, commentaryId: 4600 })]);
  const attr = START + 0x1600;
  assert.equal(buf.readUInt16LE(attr + 0x94), 4196);
  assert.equal(buf.readUInt16LE(attr + 0x9e), 4600);
  const back = Mdc27Service.parse(buf)[0] as Record<string, number>;
  assert.equal(back.PID, 4196);
  assert.equal(back.commentaryId, 4600);
});

test('constants, body-type enum, personality, focus, QB style and hidden bytes round-trip', () => {
  const buf = Mdc27Service.write([prospect(0, { personalityRating: 61, focus: 3, qbStyle: 12, bodyTypeId: 2, hidden87: 23, hidden9c: 49 })]);
  const attr = START + 0x1600;
  assert.equal(buf[attr + 0x6b], 127);
  assert.equal(buf[attr + 0x7d], 1);
  assert.equal(buf[attr + 0x91], 2);
  assert.equal(buf[attr + 0x70], 61);
  assert.equal(buf[attr + 0xf2], 3);
  assert.equal(buf[attr + 0x96], 12);
  assert.equal(buf[attr + 0x87], 23);
  assert.equal(buf[attr + 0x9c], 49);
  const back = Mdc27Service.parse(buf)[0] as Record<string, number>;
  assert.equal(back.personalityRating, 61);
  assert.equal(back.focus, 3);
  assert.equal(back.bodyTypeId, 2);
});

test('drafted picks write the within-round pick; undrafted write their block index, as U16', () => {
  const ps = [prospect(0, { draftRound: 1, draftPick: 1 }), prospect(1, { draftRound: 63, draftPick: null }), prospect(2, { draftRound: 63, draftPick: 300 })];
  const buf = Mdc27Service.write(ps);
  const at = (i: number) => START + i * 5876 + 0x1600;
  assert.equal(buf.readUInt16LE(at(0) + 0x52), 1);
  assert.equal(buf.readUInt16LE(at(1) + 0x52), 1); // block index 1
  assert.equal(buf.readUInt16LE(at(2) + 0x52), 2); // block index 2 (ignores the bogus 300)
});

test('birthdate encodes as (day<<11)|((month-1)<<7)|(year-1940) and decodes back', () => {
  const v = encodeBirthdate(1995, 9, 17);
  assert.equal(v, 35895); // Mahomes, from the M27 Player table
  assert.deepEqual(decodeBirthdate(v), { year: 1995, month: 9, day: 17 });
  const buf = Mdc27Service.write([prospect(0, { birthdate: v })]);
  assert.equal(buf.readUInt16LE(START + 0x1600 + 0x48), 35895);
});
