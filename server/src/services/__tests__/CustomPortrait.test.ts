import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { PortraitPackService, expectedFileName } from '../PortraitPackService';
import { CustomPortraitIdService, CUSTOM_PID_BASE } from '../CustomPortraitIdService';
import { PlayerLookupService } from '../PlayerLookupService';
import { RetroHeadshotService } from '../RetroHeadshotService';
import { Mdc27Service } from '../Mdc27Service';
import { LOOKUPS_DIR } from '../../config/paths';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'custom-portrait-'));
CustomPortraitIdService.useRegistry(path.join(tmp, 'custom-ids.json'));
PortraitPackService.useSourcesDir(path.join(tmp, 'sources'));
fs.mkdirSync(path.join(tmp, 'sources'), { recursive: true });

/** A 1950s player with no Madden portrait and no disc headshot. */
function bare() {
  for (const y of [1955, 1956, 1957]) {
    const p = PlayerLookupService.byYear(y, 'NFL').find((q) => !q.photoId && !RetroHeadshotService.filePath(q.firstName, q.lastName, q.position, q.draftYear));
    if (p) return p;
  }
  throw new Error('no bare player');
}

test('a dropped-in picture gives a player with no portrait id a stable custom id', async () => {
  const p = bare();
  const file = path.join(tmp, 'sources', expectedFileName(p));
  fs.writeFileSync(file, await sharp({ create: { width: 64, height: 64, channels: 3, background: '#446' } }).png().toBuffer());
  const prospects: Array<Record<string, unknown>> = [{ PID: 0 }];
  const a = PortraitPackService.apply(prospects, [p]);
  assert.equal(a.length, 1);
  assert.equal(a[0].kind, 'file');
  assert.ok(a[0].pid >= CUSTOM_PID_BASE, String(a[0].pid));
  assert.equal(prospects[0].PID, a[0].pid);
  assert.equal(prospects[0].pinPortrait, true);
  const again = PortraitPackService.assign([{ PID: 0 }], [p]);
  assert.equal(again[0].pid, a[0].pid); // remembered
  assert.equal(JSON.parse(fs.readFileSync(CustomPortraitIdService.registryPath, 'utf8')).ids[`${p.draftYear}|${p.firstName.toLowerCase().replace(/[^a-z]/g, '')}|${p.lastName.toLowerCase().replace(/[^a-z]/g, '')}`], a[0].pid);
  const out = await PortraitPackService.write(a, path.join(tmp, 'pack'), PortraitPackService.missing(prospects, [p], a));
  assert.equal(out.count, 1);
  assert.equal(out.missing, 0);
  const dds = fs.readFileSync(path.join(tmp, 'pack', `${a[0].pid}.dds`));
  assert.equal(dds.toString('ascii', 0, 4), 'DDS ');
  assert.equal(dds.toString('ascii', 84, 88), 'DX10');
  assert.equal(dds.readUInt32LE(128), 29); // R8G8B8A8_UNORM_SRGB: the importer insists on an sRGB variant
  assert.equal(dds.length, 4 + 124 + 20 + 256 * 256 * 4);
  fs.unlinkSync(file);
});

test('without any picture the player is listed as missing with the file name to drop in', () => {
  const p = bare();
  const q = { ...p, firstName: 'Zed', lastName: 'Nopicture' };
  const prospects: Array<Record<string, unknown>> = [{ PID: 0 }];
  const a = PortraitPackService.assign(prospects, [q]);
  assert.equal(a.length, 0);
  const miss = PortraitPackService.missing(prospects, [q], a);
  assert.equal(miss.length, 1);
  assert.equal(miss[0].expectedFile, `${q.draftYear}_zed_nopicture.png`);
  // Generated filler and players whose portrait the class already shows are not "missing".
  assert.equal(PortraitPackService.missing([{ PID: 0 }, { PID: 1971 }], [{ ...q, source: 'generated' }, q], []).length, 0);
});

test('a Madden-disc headshot is a source on its own', () => {
  let hit: ReturnType<typeof PlayerLookupService.byYear>[number] | undefined;
  for (const y of [1999, 2000, 2001, 1998]) {
    hit = PlayerLookupService.byYear(y, 'NFL').find((q) => !q.photoId && !!RetroHeadshotService.filePath(q.firstName, q.lastName, q.position, q.draftYear));
    if (hit) break;
  }
  if (!hit) return; // retro pack absent on this machine
  const a = PortraitPackService.assign([{ PID: 0 }], [hit]);
  assert.equal(a.length, 1);
  assert.equal(a[0].kind, 'retro');
  assert.ok(a[0].pid >= CUSTOM_PID_BASE);
});

test('a dropped-in picture for a portrait the game ships goes into the full pack under the game id', async () => {
  const file = path.join(tmp, 'sources', 'plpo_legends_JoeMontana_Profile.png'); // Montana's shipped legend portrait, id 5628
  assert.ok(!PortraitPackService.fullPackEntries().some((e) => e.pid === 5628));
  fs.writeFileSync(file, await sharp({ create: { width: 64, height: 64, channels: 3, background: '#a33' } }).png().toBuffer());
  const hit = PortraitPackService.fullPackEntries().find((e) => e.pid === 5628);
  assert.ok(hit && hit.kind === 'file' && /Montana/.test(hit.name), JSON.stringify(hit));
  fs.unlinkSync(file);
});

test('the custom range is above every id the game or the mapping uses, and survives the M27 writer', () => {
  const shipped = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'm27-shipped-portrait-pids.json'), 'utf8')).pids as number[];
  assert.ok(Math.max(...shipped) < CUSTOM_PID_BASE);
  const mapped = fs.readFileSync(path.join(LOOKUPS_DIR, 'PID_Portrait_Mapping.csv'), 'utf8').split(/\r?\n/).slice(1).map((l) => parseInt(l, 10)).filter(Number.isFinite);
  assert.ok(Math.max(...mapped) < CUSTOM_PID_BASE);
  const template = Mdc27Service.loadTemplate();
  const parsed = Mdc27Service.parse(template);
  const first = { ...parsed[0], PID: 60001 } as Record<string, unknown>;
  const buf = Mdc27Service.write([first as never], template);
  assert.equal(Number(Mdc27Service.parse(buf)[0].PID), 60001);
});
