import { PlayerLookupService } from '../../src/services/PlayerLookupService';
import { enrichedClass } from '../../src/services/DraftEnrichment';
import { CuratedDbPositions } from '../../src/services/CuratedDbPositions';
import { DbPositionService } from '../../src/services/DbPositionService';
(async () => {
  const raw = PlayerLookupService.byYear(2008, 'NFL').filter((p) => ['Ryan', 'Flacco'].includes(p.lastName));
  console.log('raw', raw.map((p) => [p.firstName, p.lastName, p.position, p.draftPick]));
  const { players, enrich } = await enrichedClass(2008, 'NFL', { fill: false });
  for (const p of players.filter((p) => ['Ryan', 'Flacco'].includes(p.lastName))) {
    const e = enrich?.get?.(p.draftPick ?? -1) ?? [...(enrich?.values?.() ?? [])].find((x: any) => x?.gsis && false);
    console.log(p.firstName, p.lastName, 'position', p.position, 'curated', CuratedDbPositions.get(p.firstName, p.lastName, p.draftYear), 'enrich', e);
  }
})();
