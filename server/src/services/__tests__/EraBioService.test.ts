import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EraBioService } from '../EraBioService';
import { HometownService } from '../HometownService';
import { seededRng } from '../../util/rng';

test('1950s linemen are a lot lighter than 2010s linemen', () => {
  const w50 = EraBioService.norms(1952, 'OL').wtMean;
  const w75 = EraBioService.norms(1975, 'OL').wtMean;
  const w15 = EraBioService.norms(2015, 'OL').wtMean;
  assert.ok(w50 < 250, `1950s OL mean ${w50}`);
  assert.ok(w75 > w50 && w75 < 275, `1975 OL mean ${w75}`);
  assert.ok(w15 > 300, `2015 OL mean ${w15}`);
});

test('sampled builds stay inside the era (no 318-lb tackle in 1950)', () => {
  const rand = seededRng('era-test');
  for (let i = 0; i < 200; i++) {
    const { weight, heightInches } = EraBioService.sample(1950, 'OL', rand);
    assert.ok(weight <= 275, `1950 OL weight ${weight}`);
    assert.ok(heightInches >= 70 && heightInches <= 79, `1950 OL height ${heightInches}`);
  }
});

test('decades with too little data fall back to the nearest populated decade', () => {
  const n = EraBioService.norms(1936, 'QB');
  assert.ok(n.wtMean > 170 && n.wtMean < 215, `1936 QB mean ${n.wtMean}`);
});

test('truncated hometown states resolve through the city ("Massapequa Park, New" -> New York)', () => {
  const h = HometownService.resolve('Massapequa Park, New', 1985, 'seed');
  assert.equal(h.stateName, 'New York');
  assert.equal(h.town, 'Massapequa Park');
  const ok = HometownService.resolve('Tyler, Texas', 1985, 'seed');
  assert.equal(ok.stateName, 'Texas');
});

test('an unknown hometown gets a state sampled from the era, not Alabama (id 0) every time', () => {
  const states = new Set<number>();
  for (let i = 0; i < 40; i++) states.add(HometownService.resolve(null, 1985, `s${i}`).state);
  assert.ok(states.size > 8, `only ${states.size} distinct states sampled`);
  assert.equal(HometownService.resolve(null, 1985, 'same').state, HometownService.resolve(null, 1985, 'same').state);
});
