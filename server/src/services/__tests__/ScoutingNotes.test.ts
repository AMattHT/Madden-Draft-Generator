import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { scoutingNotes, MADDEN_NOTE_ATTRS } from '../ScoutingNotesService';
import { PositionMapper } from '../PositionMapper';

interface Bullet { index: number; attribute: string; threshold: number; good: string[]; bad: string[] }
interface NotesFile { attributeBullets: Bullet[]; byPosition: Record<string, number[]> }

const notesFile: NotesFile = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../../../data/lookups/m27-scouting-notes.json'), 'utf8'));
const bulletByIndex = new Map(notesFile.attributeBullets.map((b) => [b.index, b]));

/** Our position ids use LEDG/SAM/MIKE; the game's bullet table uses LE/LOLB/MLB. */
const BULLET_POSITION: Record<string, string> = {
  LEDG: 'LE', REDG: 'RE', SAM: 'LOLB', MIKE: 'MLB', WILL: 'ROLB',
};

function isReal(line: string): boolean {
  return line.length > 0 && !line.includes('PLACEHOLDER') && !line.startsWith('DraftAttributeBullet');
}

function bulletsForId(positionId: number): Bullet[] {
  const name = PositionMapper.name(positionId);
  const key = BULLET_POSITION[name] ?? name;
  return (notesFile.byPosition[key] ?? []).map((i) => bulletByIndex.get(i)!);
}

test('every position we rate has a Madden bullet list, and every code maps to a rating', () => {
  for (let id = 0; id <= 21; id++) {
    const bullets = bulletsForId(id);
    assert.ok(bullets.length >= 2, `${PositionMapper.name(id)} has bullets`);
    for (const b of bullets) assert.ok(MADDEN_NOTE_ATTRS[b.attribute], `${b.attribute} maps to a rating`);
  }
});

test('a rating at the cutoff takes a good line, and one below takes a bad line', () => {
  const thp = bulletsForId(0).find((b) => b.attribute === 'THP')!;
  const high = scoutingNotes({ id: 1, positionId: 0, ratings: { throwPower: thp.threshold } });
  const low = scoutingNotes({ id: 1, positionId: 0, ratings: { throwPower: thp.threshold - 1 } });
  assert.ok(thp.good.filter(isReal).includes(high[0]), high[0]);
  assert.ok(thp.bad.filter(isReal).includes(low[0]), low[0]);
});

test('every position gets one real Madden line per attribute, in the game list order', () => {
  for (let id = 0; id <= 21; id++) {
    const bullets = bulletsForId(id);
    const ratings: Record<string, number> = {};
    for (const b of bullets) ratings[MADDEN_NOTE_ATTRS[b.attribute]] = 99;
    const notes = scoutingNotes({ id: 4, positionId: id, ratings });
    const expected = bullets.filter((b) => b.good.some(isReal));
    assert.equal(notes.length, expected.length, PositionMapper.name(id));
    expected.forEach((b, i) => {
      assert.ok(b.good.filter(isReal).includes(notes[i]), `${PositionMapper.name(id)} ${b.attribute}: ${notes[i]}`);
    });
  }
});

test('a side that is only a placeholder is left off', () => {
  const speed = bulletsForId(0).find((b) => b.attribute === 'SPD')!;
  assert.ok(speed.bad.every((s) => !isReal(s)));
  const ratings: Record<string, number> = {};
  for (const b of bulletsForId(0)) ratings[MADDEN_NOTE_ATTRS[b.attribute]] = 99;
  ratings.throwPower = speed.threshold - 1;
  ratings.speed = speed.threshold - 1;
  const notes = scoutingNotes({ id: 1, positionId: 0, ratings });
  assert.ok(!notes.some((n) => n.includes('PLACEHOLDER') || n.startsWith('DraftAttribute')));
  assert.equal(notes.filter((n) => speed.good.includes(n) || speed.bad.includes(n)).length, 0);
});

test('the same player always gets the same lines, and another player can get a different one', () => {
  const thp = bulletsForId(0).find((b) => b.attribute === 'THP')!;
  const ratings = { throwPower: thp.threshold };
  assert.deepEqual(
    scoutingNotes({ id: 3, positionId: 0, ratings }),
    scoutingNotes({ id: 3, positionId: 0, ratings }),
  );
  const firsts = new Set<string>();
  for (let id = 1; id <= 40; id++) firsts.add(scoutingNotes({ id, positionId: 0, ratings })[0]);
  assert.ok(firsts.size >= 2);
  for (const line of firsts) assert.ok(thp.good.includes(line), line);
});
