import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { LikenessService } from '../LikenessService';
import { LOOKUPS_DIR } from '../../config/paths';
import type { BaselinePlayer } from '../../types/player';

const catalogPresent = fs.existsSync(path.join(LOOKUPS_DIR, 'face-assets-by-game.json'));
const skipWithoutCatalog = catalogPresent ? undefined : { skip: 'face-assets-by-game.json not built' };

function player(p: Partial<BaselinePlayer>): BaselinePlayer {
  return {
    firstName: 'Test', lastName: 'Player', draftYear: 2003, draftRound: 1, draftPick: 1,
    position: 'SS', college: '', photoId: null, playerAssetsId: null, race: 7, ...p,
  } as BaselinePlayer;
}

test('Polamalu gets his real M27 head scan (the game ships polamalutroy_16548)', skipWithoutCatalog, () => {
  const p = player({ firstName: 'Troy', lastName: 'Polamalu', playerAssetsId: 'polamaluTroy_16548', photoId: 63 });
  const face = LikenessService.realFace(p, 'm27');
  assert.ok(face, 'expected a real face for M27');
  assert.equal(face!.assetName, 'polamaluTroy_16548');
  assert.equal(face!.portraitPid, 63);
  const like = LikenessService.assign(p, 0, 'm27');
  assert.equal(like.kind, 'asset');
  assert.equal(like.peps, 'polamaluTroy_16548');
});

test('a lookup id the game does not ship stays generic in M27 (no silhouettes)', skipWithoutCatalog, () => {
  // 1988 Deatrich Wise: the lookup pairs him with his son's 2017 id; no scan, no legends portrait.
  const p = player({ firstName: 'Deatrich', lastName: 'Wise', playerAssetsId: 'WiseJrDeatrich_12607', photoId: 0, draftYear: 1988 });
  assert.equal(LikenessService.realFace(p, 'm27'), null);
  assert.equal(LikenessService.assign(p, 0, 'm27').kind, 'generic');
  assert.equal(LikenessService.assign(p, 0, 'm26').kind, 'generic', 'M26 rejects the namesake collision too');
});

test('Aikman (legends portrait, parametric head) keeps his id in both games', skipWithoutCatalog, () => {
  const p = player({ firstName: 'Troy', lastName: 'Aikman', playerAssetsId: 'AikmanTroy_7201', photoId: 5644, draftYear: 1989 });
  assert.equal(LikenessService.realFace(p, 'm27')?.assetName, 'AikmanTroy_7201');
  assert.equal(LikenessService.realFace(p, 'm26')?.assetName, 'AikmanTroy_7201');
});

test('a recent draftee keeps his lookup asset in M27 even when the autosave roster lacks him', skipWithoutCatalog, () => {
  const p = player({ firstName: 'Terrion', lastName: 'Arnold', playerAssetsId: 'ArnoldTerrion_24163', photoId: 4242, draftYear: 2024 });
  const face = LikenessService.realFace(p, 'm27');
  assert.ok(face, 'recent draftee should carry over');
  assert.equal(face!.assetName, 'ArnoldTerrion_24163');
});

test('M26 keeps accepting a lookup asset with no modern namesake (status quo)', () => {
  const p = player({ firstName: 'Sammy', lastName: 'Baugh', playerAssetsId: 'baughSammy', draftYear: 1937 });
  assert.equal(LikenessService.assign(p, 0, 'm26').peps, 'baughSammy');
});

test('M27 face catalog lists legends with portraits', skipWithoutCatalog, () => {
  const scans = LikenessService.faceScans('m27');
  const troy = scans.find((s) => s.asset === 'polamaluTroy_16548');
  assert.ok(troy, 'Polamalu in the M27 scan catalog');
  assert.equal(troy!.name, 'Troy Polamalu');
  assert.equal(troy!.portraitPid, 63);
});

test('a 1989 DJ Johnson does not get the 2023 DJ Johnson head (same-name collision)', skipWithoutCatalog, () => {
  const p = player({ firstName: 'DJ', lastName: 'Johnson', playerAssetsId: 'JohnsonDJ_22983', photoId: 0, draftYear: 1989 });
  assert.equal(LikenessService.realFace(p, 'm27'), null);
  assert.equal(LikenessService.realFace(p, 'm26'), null);
});

test('a MUT legend with a parametric head (legend portrait, no scan) keeps his lookup id in M27', skipWithoutCatalog, () => {
  const p = player({ firstName: 'Jim', lastName: 'Kelly', playerAssetsId: 'KellyJim_32174', photoId: 0, draftYear: 1983 });
  const face = LikenessService.realFace(p, 'm27');
  assert.ok(face, 'Jim Kelly has a legends portrait in M27');
  assert.equal(face!.assetName, 'KellyJim_32174');
  assert.equal(face!.source, 'legend-portrait');
});

test('a head on the M26 roster carries over to M27 even after the player left the M27 autosave', skipWithoutCatalog, () => {
  // Heads persist between games (M27 kept 1,275 of M26's 1,276 scan bundles).
  const p = player({ firstName: 'Raheem', lastName: 'Mostert', playerAssetsId: 'MostertRaheem_2832', photoId: 0, draftYear: 2015 });
  const face = LikenessService.realFace(p, 'm27');
  assert.ok(face, 'Mostert was on the M26 roster');
  assert.equal(face!.assetName, 'MostertRaheem_2832');
});
