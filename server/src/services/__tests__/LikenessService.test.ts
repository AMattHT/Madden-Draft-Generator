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
  // M27 dropped his regular portrait (PID 63 shows the blank shield in-game); the
  // legends portrait has its own id.
  assert.equal(face!.portraitPid, 4829);
  assert.equal(face!.portraitKind, 'legend');
  assert.equal(LikenessService.realFace(p, 'm26')!.portraitPid, 63, 'M26 still ships the regular portrait');
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

test('Aikman (legends portrait, parametric head) keeps his id on M26 and his legends portrait on M27', skipWithoutCatalog, () => {
  const p = player({ firstName: 'Troy', lastName: 'Aikman', playerAssetsId: 'AikmanTroy_7201', photoId: 5644, draftYear: 1989 });
  assert.equal(LikenessService.realFace(p, 'm26')?.assetName, 'AikmanTroy_7201');
  assert.equal(LikenessService.realFace(p, 'm27'), null);
  assert.equal(LikenessService.legendPortraitPid('Troy', 'Aikman', 'm27'), 5644);
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
});

test('a 1989 DJ Johnson does not get the 2023 DJ Johnson head (same-name collision)', skipWithoutCatalog, () => {
  const p = player({ firstName: 'DJ', lastName: 'Johnson', playerAssetsId: 'JohnsonDJ_22983', photoId: 0, draftYear: 1989 });
  assert.equal(LikenessService.realFace(p, 'm27'), null);
  assert.equal(LikenessService.realFace(p, 'm26'), null);
});

test('a MUT legend with only a legends portrait (no scan) gets a generic head plus his legends portrait on M27', skipWithoutCatalog, () => {
  // In-game: a legends portrait does not prove a renderable head (Suggs showed the
  // default head), so the id is only written on M26; M27 uses the portrait alone.
  const p = player({ firstName: 'Jim', lastName: 'Kelly', playerAssetsId: 'KellyJim_32174', photoId: 0, draftYear: 1983 });
  assert.equal(LikenessService.realFace(p, 'm27'), null);
  assert.ok(LikenessService.legendPortraitPid('Jim', 'Kelly', 'm27') > 0, 'M27 ships plpo_legends_kellyjim');
  assert.equal(LikenessService.realFace(p, 'm26')?.assetName, 'KellyJim_32174');
});

test('a head on the M26 roster carries over to M27 even after the player left the M27 autosave', skipWithoutCatalog, () => {
  // Heads persist between games (M27 kept 1,275 of M26's 1,276 scan bundles).
  const p = player({ firstName: 'Raheem', lastName: 'Mostert', playerAssetsId: 'MostertRaheem_2832', photoId: 0, draftYear: 2015 });
  const face = LikenessService.realFace(p, 'm27');
  assert.ok(face, 'Mostert was on the M26 roster');
  assert.equal(face!.assetName, 'MostertRaheem_2832');
});

test('preset-only legacy heads (Suggs, Kevin Williams) are generic: in-game they render as the default head', skipWithoutCatalog, () => {
  for (const [first, last, asset] of [['Terrell', 'Suggs', 'suggsTerrell_16524'], ['Kevin', 'Williams', 'williamsKevin'], ['Anquan', 'Boldin', 'boldinanquan']]) {
    const p = player({ firstName: first, lastName: last, playerAssetsId: asset, photoId: 2886, draftYear: 2003 });
    assert.equal(LikenessService.realFace(p, 'm27'), null, `${last} should be generic on M27`);
    assert.equal(LikenessService.assign(p, 0, 'm27').kind, 'generic');
  }
});

test('a scanned head with no portrait left in M27 reports portraitKind none (builder substitutes a generic portrait)', skipWithoutCatalog, () => {
  // Tom Brady: full scan in M27, but neither a legends nor a regular portrait on disk.
  const p = player({ firstName: 'Tom', lastName: 'Brady', playerAssetsId: 'bradyTom_1327', photoId: 1327, draftYear: 2000 });
  const face = LikenessService.realFace(p, 'm27');
  assert.ok(face, 'Brady scan present');
  assert.equal(face!.portraitKind, 'none');
  assert.equal(face!.portraitPid, 0);
});

test('an undrafted legend with a scan (Gates) is not rejected for lacking an nflverse draft year', skipWithoutCatalog, () => {
  const p = player({ firstName: 'Antonio', lastName: 'Gates', playerAssetsId: 'gatesAntonio_17523', photoId: 1216, draftYear: 2003 });
  assert.equal(LikenessService.realFace(p, 'm27')?.assetName, 'gatesAntonio_17523');
});

test('a legends portrait keyed by name goes to the notable namesake only (Chris Johnson RB 2008, not the 2003 CB)', skipWithoutCatalog, async () => {
  const { PlayerLookupService } = await import('../PlayerLookupService');
  assert.ok(LikenessService.legendPortraitPid('Chris', 'Johnson', 'm27') > 0, 'M27 ships a Chris Johnson legends portrait');
  assert.equal(PlayerLookupService.isMostNotable({ firstName: 'Chris', lastName: 'Johnson', draftYear: 2008 }), true);
  assert.equal(PlayerLookupService.isMostNotable({ firstName: 'Chris', lastName: 'Johnson', draftYear: 2003 }), false);
  assert.equal(PlayerLookupService.isMostNotable({ firstName: 'Troy', lastName: 'Polamalu', draftYear: 2003 }), true);
});

test('generic heads with built-in headwear (skull cap) stay off pre-1995 players', skipWithoutCatalog, () => {
  const acc = new Set(JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'face-assets-by-game.json'), 'utf8')).m27.genericHeadAccessory as string[]);
  assert.ok(acc.has('gen_6_h_g_01') && acc.has('gen_4_t_g_01'), 'Okoye/Namath heads are flagged');
  for (let i = 0; i < 60; i++) {
    const old = LikenessService.generic(player({ firstName: 'Test', lastName: `P${i}`, race: 6, draftYear: 1987 }), i, 'm27');
    assert.equal(acc.has(old.peps.toLowerCase()), false, `${old.peps} has headwear`);
  }
  // modern classes keep the full pool
  let modernAcc = 0;
  for (let i = 0; i < 80; i++) if (acc.has(LikenessService.generic(player({ firstName: 'Test', lastName: `M${i}`, race: 7, draftYear: 2024 }), i, 'm27').peps.toLowerCase())) modernAcc++;
  assert.ok(modernAcc > 0, 'modern players can still get headwear heads');
});

test('a legends portrait never goes to a no-name namesake (1969 Jim Thorpe, Hofstra CB, is not THE Jim Thorpe)', skipWithoutCatalog, async () => {
  const { PlayerLookupService } = await import('../PlayerLookupService');
  const thorpe = PlayerLookupService.byYear(1969, 'AFL').find((p) => p.lastName === 'Thorpe' && p.firstName === 'Jim')
    ?? PlayerLookupService.byYear(1969, 'NFL').find((p) => p.lastName === 'Thorpe' && p.firstName === 'Jim');
  assert.ok(thorpe, '1969 Jim Thorpe row');
  assert.equal(thorpe!.plpo, null);
  assert.equal(thorpe!.photoId, null);
  assert.equal(PlayerLookupService.isMostNotable({ firstName: 'Jim', lastName: 'Thorpe', draftYear: 1969 }), false);
});

test('a roster head whose asset carries a suffix (AndersonJrWill) matches the lookup\'s plain "Will Anderson"', skipWithoutCatalog, () => {
  // The 2023 #3 pick has no asset id in the lookup; the catalog keys him as
  // "will anderson jr", and the lookup writes him without the suffix. 149 roster
  // players carry Jr/Sr/II/III/IV in their asset names, so the match must be
  // suffix-blind on both sides.
  const p = player({ firstName: 'Will', lastName: 'Anderson', draftYear: 2023, position: 'MLB', college: 'Alabama' });
  const face = LikenessService.realFace(p, 'm27');
  assert.ok(face, 'expected Will Anderson Jr.\'s real head');
  assert.equal(face!.assetName, 'AndersonJrWill_22702');
  assert.equal(face!.portraitPid, 856);
  // And the other way round: a lookup row that does carry the suffix.
  const q = player({ firstName: 'Odell', lastName: 'Beckham Jr.', draftYear: 2014, position: 'WR' });
  assert.equal(LikenessService.realFace(q, 'm27')?.assetName.toLowerCase(), 'beckhamjrodell_10829');
});
