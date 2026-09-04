import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skipWithoutData } from './data';
import { OpenedClassService, detectGame } from '../OpenedClassService';
import { MdcService } from '../MdcService';
import { Mdc27Service } from '../Mdc27Service';
import { DraftClassBuilder } from '../DraftClassBuilder';
import { enrichedClass } from '../DraftEnrichment';

const silent = <T,>(fn: () => T): T => { const c = { ...console }; console.log = console.warn = console.info = () => {}; try { return fn(); } finally { Object.assign(console, c); } };

test('the game a file was written for is read off its record size', () => {
  assert.equal(detectGame(MdcService.loadTemplate()), 'm26');
  assert.equal(detectGame(Mdc27Service.loadTemplate()), 'm27');
  assert.equal(detectGame(Buffer.alloc(1000)), null);
  assert.equal(detectGame(Buffer.alloc(0x46 + 4296 * 3 + 7)), null);
});

test('the Madden 26 template opens as a class in file order with faces and gear', () => {
  const opened = OpenedClassService.open(MdcService.loadTemplate(), 'CAREERDRAFT-2026Template.mdc');
  assert.equal(opened.gameVersion, 'm26');
  assert.equal(opened.name, 'CAREERDRAFT-2026Template');
  assert.ok(opened.count >= 400, `prospects in the template: ${opened.count}`);
  const pv = OpenedClassService.preview(opened.id)!;
  const first = MdcService.parse(MdcService.loadTemplate()).find((p) => String(p.firstName || '').trim())!;
  assert.equal(pv.rows[0].firstName, first.firstName);
  assert.equal(pv.rows[0].pick, 1);
  assert.ok(pv.rows.some((r) => r.gear && Object.keys(r.gear).length > 0), 'gear slots read from the file');
  const gen = pv.rows.find((r) => r.face === 'generic' && r.genericHead);
  assert.ok(gen, 'a generic head row');
  assert.match(gen!.genericHead!, new RegExp(`^gen_${gen!.skinTone}`, 'i'));
  assert.ok(pv.rows.every((r) => r.position && Number.isFinite(r.overall)));
  assert.deepEqual(OpenedClassService.get(opened.id)?.gameVersion, 'm26');
});

test('an unknown id is null, and a Saves name with a path in it is refused', () => {
  assert.equal(OpenedClassService.get('0123456789abcdef'), null);
  assert.equal(OpenedClassService.preview('nope'), null);
  assert.throws(() => OpenedClassService.openFromSaves('m27', '../CAREERDRAFT-X'), /not a draft class file name/);
  assert.throws(() => OpenedClassService.openFromSaves('m27', 'CAREER-franchise'), /not a draft class file name/);
});

test('a class opened from our own export edits and writes back in both games, other records untouched', skipWithoutData, async () => {
  const { players } = await enrichedClass(2003, 'NFL', { fill: true });
  for (const game of ['m26', 'm27'] as const) {
    const built = silent(() => (game === 'm27' ? DraftClassBuilder.buildMdc27(players) : DraftClassBuilder.buildMdc(players)));
    const opened = OpenedClassService.open(built.buffer, `CAREERDRAFT-2003DRAFT`);
    assert.equal(opened.gameVersion, game);
    assert.equal(opened.count, 402);
    const before = OpenedClassService.preview(opened.id)!;
    assert.equal(before.rows[0].lastName, 'Palmer');
    const helmet = before.rows[0].gear?.helmet;
    const out = OpenedClassService.write(opened.id, { 1: { overall: 91, speed: 88, genericHeadName: 'gen_4_B_S_001' } }, { 1: { helmet: helmet ?? '' } })!;
    assert.equal(out.gameVersion, game);
    assert.equal(out.filename, 'CAREERDRAFT-2003DRAFT');
    assert.equal(out.buffer.length, built.buffer.length, 'same file size');
    const back = silent(() => (game === 'm27' ? Mdc27Service.parse(out.buffer) : MdcService.parse(out.buffer))).filter((p: any) => p.firstName) as any[];
    assert.equal(back.length, 402);
    assert.equal(back[0].lastName, 'Palmer');
    assert.equal(back[0].overall, 91);
    assert.equal(back[0].speed, 88);
    assert.match(String(back[0].PEPS || back[0].visuals?.genericHeadName || ''), /^gen_4_B_S_001$/i);
    // Every other prospect is exactly as it was.
    const orig = silent(() => (game === 'm27' ? Mdc27Service.parse(built.buffer) : MdcService.parse(built.buffer))).filter((p: any) => p.firstName) as any[];
    for (let i = 1; i < 402; i++) {
      assert.equal(back[i].lastName, orig[i].lastName, `pick ${i + 1} name`);
      assert.equal(back[i].overall, orig[i].overall, `pick ${i + 1} overall`);
      assert.equal(back[i].speed, orig[i].speed, `pick ${i + 1} speed`);
    }
    // Reopening the written file works too.
    const again = OpenedClassService.open(out.buffer, out.filename);
    assert.equal(OpenedClassService.preview(again.id)!.rows[0].overall, 91);
  }
});
