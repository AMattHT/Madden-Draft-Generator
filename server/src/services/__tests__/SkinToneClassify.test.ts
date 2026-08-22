import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleSkinITA, itaToTone, resolveSkinTone } from '../SkinToneClassify';

function image(fill: (x: number, y: number) => [number, number, number], w = 40, h = 40): Buffer {
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = fill(x, y); const i = (y * w + x) * 3; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; }
  return buf;
}

test('a greyscale portrait yields no skin reading instead of a dark tone', () => {
  const grey = image(() => [120, 120, 120]);
  assert.equal(sampleSkinITA(grey, 40, 40, 3, { minPixels: 20 }), null);
  const darkGrey = image(() => [70, 70, 70]);
  assert.equal(sampleSkinITA(darkGrey, 40, 40, 3, { minPixels: 20 }), null);
});

test('real skin still classifies: light skin -> light tone, dark skin -> dark tone', () => {
  const light = sampleSkinITA(image(() => [230, 190, 165]), 40, 40, 3, { minPixels: 20 });
  const dark = sampleSkinITA(image(() => [95, 60, 40]), 40, 40, 3, { minPixels: 20 });
  assert.ok(light != null && itaToTone(light) <= 3, `light tone ${light && itaToTone(light)}`);
  assert.ok(dark != null && itaToTone(dark) >= 6, `dark tone ${dark && itaToTone(dark)}`);
});

test('with no photo evidence the trusted source race decides (Unitas: Race 1 -> light)', () => {
  assert.ok(resolveSkinTone({ derived: null, wiki: null, trustedCsv: 1, fallback: 7 }) <= 2);
});

test('era prior: the 1930s-40s are effectively all light; modern classes follow the position mix', async () => {
  const { SkinToneService } = await import('../SkinToneService');
  assert.ok(SkinToneService.eraDarkShare(1938) < 0.03);
  assert.ok(SkinToneService.eraDarkShare(1955) < 0.2);
  assert.ok(SkinToneService.eraDarkShare(1985) > 0.45);
  assert.ok(SkinToneService.eraDarkShare(2020) > 0.6);
  assert.ok(SkinToneService.defaultRaceFor('HB', 'k', 1940) <= 3);
  assert.ok(SkinToneService.defaultRaceFor('HB', 'k', 2015) >= 6);
  let dark = 0;
  for (let i = 0; i < 2000; i++) if (SkinToneService.defaultRaceForVaried('WR', `filler|1950|${i}|race`, 1950) >= 6) dark++;
  assert.ok(dark < 300, `${dark}/2000 dark fillers in 1950 (expected ~8%)`);
});

test('an ambiguous 5-6 reading on a pre-1965 legend with a White record resolves light-tanned (Namath), a clear 7 stays dark (Page)', () => {
  assert.equal(resolveSkinTone({ derived: 6, wiki: null, trustedCsv: 1, fallback: 2, eraDarkShare: 0.15 }), 4);
  assert.equal(resolveSkinTone({ derived: 7, wiki: null, trustedCsv: 1, fallback: 2, eraDarkShare: 0.15 }), 7);
  assert.equal(resolveSkinTone({ derived: 6, wiki: null, trustedCsv: 1, fallback: 7, eraDarkShare: 0.65 }), 6);
});
