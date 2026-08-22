import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { toneFromEvidence, TONE_ITA_MODEL } from '../SkinToneClassify';
import { SkinToneService } from '../SkinToneService';
import { DerivedSkinToneService } from '../DerivedSkinToneService';
import { LOOKUPS_DIR } from '../../config/paths';

const itaPresent = fs.existsSync(path.join(LOOKUPS_DIR, 'pid_ita.json'));
const skipWithoutIta = itaPresent ? undefined : { skip: 'pid_ita.json not built' };

test('the calibrated model is monotone: lighter tones have higher ITA means', () => {
  for (let t = 1; t < 7; t++) assert.ok(TONE_ITA_MODEL[t][0] >= TONE_ITA_MODEL[t + 1][0], `tone ${t} vs ${t + 1}`);
});

test('a strong portrait reading beats the position prior (Keith Brooking: white LB, 1998)', () => {
  const prior = SkinToneService.toneDistribution('WILL', 1998);
  assert.ok(prior[7] > prior[2], 'linebackers skew dark in 1998');
  const tone = toneFromEvidence({ ita: 30, legendPortrait: true, prior });
  assert.ok(tone <= 3, `Brooking should be light, got ${tone}`);
});

test('an underexposed legends portrait of a 1965 quarterback resolves light (Namath)', () => {
  const prior = SkinToneService.toneDistribution('QB', 1965);
  assert.ok(toneFromEvidence({ ita: -30, legendPortrait: true, prior }) <= 3);
  // the same reading on a 1965 halfback stays dark (Sayers-style evidence)
  assert.ok(toneFromEvidence({ ita: -12, legendPortrait: true, prior: SkinToneService.toneDistribution('HB', 1965) }) >= 6);
});

test('a clearly dark modern portrait is dark whatever the position (Page, Mackey-style)', () => {
  assert.ok(toneFromEvidence({ ita: -54, legendPortrait: true, prior: SkinToneService.toneDistribution('DT', 1967) }) >= 6);
  assert.ok(toneFromEvidence({ ita: -40, prior: SkinToneService.toneDistribution('QB', 2011) }) >= 6, 'Cam Newton');
});

test('no evidence falls back to the era prior mode', () => {
  assert.ok(toneFromEvidence({ prior: SkinToneService.toneDistribution('QB', 1955) }) <= 2);
  assert.ok(toneFromEvidence({ prior: SkinToneService.toneDistribution('CB', 2015) }) >= 6);
});

test('pid_ita carries the legends flag and reads Namath/Sayers/Butkus portraits sensibly', skipWithoutIta, () => {
  const namath = DerivedSkinToneService.itaForPid(1703)!;
  const sayers = DerivedSkinToneService.itaForPid(4831)!;
  const butkus = DerivedSkinToneService.itaForPid(10807)!;
  assert.ok(namath && sayers && butkus, 'legend portraits sampled');
  assert.equal(namath.legend, true);
  assert.ok(butkus.ita > sayers.ita, 'Butkus lighter than Sayers');
  assert.ok(butkus.ita > 5, `Butkus ITA ${butkus.ita}`);
});
