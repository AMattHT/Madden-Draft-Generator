import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignM27Fields, decodeBirthdate, ROOKIE_REFERENCE_SEASON } from '../M27Fields';

function base(over: Record<string, unknown> = {}) {
  return {
    firstName: 'Andre', lastName: 'Smith', position: 3, overall: 72, age: 22, bodyType: 'Muscular',
    visuals: { genericHeadName: 'gen_2_H_GM_004' }, PEPS: 'gen_2_H_GM_004', ...over,
  } as Record<string, unknown>;
}

test('generic heads get their menu-portrait PID and surnames get the announcer id', () => {
  const p = base();
  assignM27Fields(p, { birthDate: null }, 'seed-a');
  assert.equal(p.PID, 4196);
  assert.equal(p.commentaryId, 4600);
  assert.equal(p.bodyTypeId, 2);
});

test('a real M27 face keeps its own portrait PID; unknown surnames write 0', () => {
  const p = base({ PID: 9999, PEPS: 'MahomesIIPatrick_12635', visuals: {}, lastName: 'Zxqvnotaname' });
  assignM27Fields(p, { birthDate: null }, 'seed-b');
  assert.equal(p.PID, 9999);
  assert.equal(p.commentaryId, 0);
});

test('personality, focus, hidden bytes fall in the observed game ranges; QB style only for QBs', () => {
  const wr = base();
  assignM27Fields(wr, { birthDate: null }, 'seed-c');
  assert.ok((wr.personalityRating as number) >= 10 && (wr.personalityRating as number) <= 98);
  assert.ok([0, 1, 2, 3].includes(wr.focus as number));
  assert.ok((wr.hidden87 as number) >= 10 && (wr.hidden87 as number) <= 37);
  assert.ok((wr.hidden9c as number) >= 0 && (wr.hidden9c as number) <= 98);
  assert.equal(wr.qbStyle, 0);
  const qb = base({ position: 0 });
  assignM27Fields(qb, { birthDate: null }, 'seed-d');
  assert.ok((qb.qbStyle as number) >= 0 && (qb.qbStyle as number) <= 13);
});

test('kickers rate far lower on personality than quarterbacks at the same overall', () => {
  let k = 0, q = 0;
  for (let i = 0; i < 40; i++) {
    const kp = base({ position: 19 }); assignM27Fields(kp, { birthDate: null }, `k${i}`); k += kp.personalityRating as number;
    const qp = base({ position: 0 }); assignM27Fields(qp, { birthDate: null }, `q${i}`); q += qp.personalityRating as number;
  }
  assert.ok(q / 40 - k / 40 > 25, `QB avg ${q / 40} vs K avg ${k / 40}`);
});

test('birthdate: year follows age on the reference season; real month/day used when known', () => {
  const p = base({ age: 23 });
  assignM27Fields(p, { birthDate: '2003-04-09' }, 'seed-e');
  const d = decodeBirthdate(p.birthdate as number);
  assert.equal(d.year, ROOKIE_REFERENCE_SEASON - 23);
  assert.equal(d.month, 4);
  assert.equal(d.day, 9);
  const q = base({ age: 21 });
  assignM27Fields(q, { birthDate: null }, 'seed-f');
  const e = decodeBirthdate(q.birthdate as number);
  assert.equal(e.year, ROOKIE_REFERENCE_SEASON - 21);
  assert.ok(e.month >= 1 && e.month <= 12 && e.day >= 1 && e.day <= 28);
});

test('assignment is deterministic for the same seed', () => {
  const a = base(); const b = base();
  assignM27Fields(a, { birthDate: null }, 'same'); assignM27Fields(b, { birthDate: null }, 'same');
  assert.deepEqual([a.personalityRating, a.focus, a.hidden87, a.hidden9c, a.birthdate], [b.personalityRating, b.focus, b.hidden87, b.hidden9c, b.birthdate]);
});
