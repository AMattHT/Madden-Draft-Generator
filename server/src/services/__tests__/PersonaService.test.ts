import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PersonaService, DNA } from '../PersonaService';

function top(group: string, n = 400): number[] {
  const count = new Map<number, number>();
  for (let i = 0; i < n; i++) for (const id of PersonaService.dnaFor(`p${i}|${group}`, group, 70, i % 4)) count.set(id, (count.get(id) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

test('rookies always get exactly five distinct traits', () => {
  for (let i = 0; i < 50; i++) {
    const dna = PersonaService.dnaFor(`x${i}`, 'WR', 60 + i, 0);
    assert.equal(dna.length, 5);
    assert.equal(new Set(dna).size, 5);
  }
});

test('trait mix follows the game\'s rookies per position (QB: Reliable/Stoic/Reserved up top; OL: Respectful/Principled/Leader)', () => {
  const qb = top('QB').slice(0, 6);
  assert.ok(qb.includes(DNA.Reliable) && qb.includes(DNA.Stoic), `QB top six: ${qb.join(',')}`);
  const ol = top('OL').slice(0, 6);
  assert.ok(ol.includes(DNA.Respectful) && ol.includes(DNA.Principled), `OL top six: ${ol.join(',')}`);
});

test('deterministic per seed', () => {
  assert.deepEqual(PersonaService.dnaFor('same|seed', 'CB', 72, 1), PersonaService.dnaFor('same|seed', 'CB', 72, 1));
});
