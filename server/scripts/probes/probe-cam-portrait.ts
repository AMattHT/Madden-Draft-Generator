import { enrichedClass } from '../../src/services/DraftEnrichment';
import { LikenessService } from '../../src/services/LikenessService';
import { genericHeadPid } from '../../src/services/M27Fields';
import { DraftClassBuilder } from '../../src/services/DraftClassBuilder';
(async () => {
  const { players } = await enrichedClass(2011, 'NFL', { fill: true });
  const cam = players.find((p) => p.lastName === 'Newton' && p.firstName === 'Cam')!;
  console.log('race', cam.race, 'photoId', cam.photoId, 'asset', cam.playerAssetsId);
  const g = LikenessService.generic(cam, 0, 'm27');
  console.log('generic', g, 'pid', genericHeadPid(g.peps));
  console.log('realFace', LikenessService.realFace(cam, 'm27'));
  const row = DraftClassBuilder.preview(players, 'madden', {}, 'm27').rows.find((r) => r.lastName === 'Newton' && r.firstName === 'Cam')!;
  console.log('row tone', row.skinTone, 'portrait', row.portrait, 'genericHead', row.genericHead);
})();
