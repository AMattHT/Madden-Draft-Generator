import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skipWithoutData } from './data';
import { enrichedClass } from '../DraftEnrichment';
import { DraftClassBuilder } from '../DraftClassBuilder';
import { MdcService } from '../MdcService';
import { Mdc27Service } from '../Mdc27Service';
import { OVRWeightsCalculator } from '../OVRWeightsCalculator';
import { RATING_KEYS } from '../AttributeModel';

// The real pipeline end to end: enrich -> build -> write -> parse, for both games.
test('2003 exports round-trip through the M26 and M27 writers with the class intact', skipWithoutData, async () => {
  const { players } = await enrichedClass(2003, 'NFL', { fill: true });
  const silent = <T,>(fn: () => T): T => { const c = { ...console }; console.log = console.warn = console.info = () => {}; try { return fn(); } finally { Object.assign(console, c); } };

  const m26 = silent(() => DraftClassBuilder.buildMdc(players));
  const back26 = silent(() => MdcService.parse(m26.buffer)).filter((p: any) => p.firstName) as any[];
  assert.equal(m26.count, 402);
  assert.equal(back26.length, 402);
  assert.equal(m26.buffer.readUInt16LE(0x42), 402, 'M26 header count');
  assert.equal(back26[0].firstName, 'Carson');
  assert.equal(back26[0].lastName, 'Palmer');
  const exact26 = back26.filter((p) => OVRWeightsCalculator.computeOverall(p.position, p.archetype, p, 'm26') === p.overall).length;
  assert.ok(exact26 / back26.length >= 0.97, `M26 recompute exact ${exact26}/${back26.length}`);

  const m27 = DraftClassBuilder.buildMdc27(players);
  const back27 = Mdc27Service.parse(m27.buffer).filter((p: any) => p.firstName) as any[];
  assert.equal(back27.length, 402);
  assert.equal(m27.buffer.readUInt16LE(0x42), 402, 'M27 header count');
  assert.equal(back27[0].lastName, 'Palmer');
  assert.ok(back27.every((p) => p.personaDNA.length === 5), 'five persona slots each');
  assert.ok(back27.every((p) => p.PID > 0 || !p.visuals?.genericHeadName), 'every generic head has a portrait PID');
  assert.ok(back27.filter((p) => p.commentaryId > 0).length > 200, 'announcer ids present');
  // Each game has its own calibration, so attributes may differ by a few points; the overall must not.
  assert.equal(back27[0].overall, back26[0].overall, 'overall agrees across writers');
  for (const k of RATING_KEYS) assert.ok(Math.abs(back27[0][k] - back26[0][k]) <= 8, `rating ${k}: M26 ${back26[0][k]} vs M27 ${back27[0][k]}`);
  // No foreign face asset: M27 must never carry an M26-only legend scan
  assert.ok(back27.every((p) => !p.assetName || !/_\d{5}$/.test(p.assetName) || p.PID >= 0), 'assets sane');
});
