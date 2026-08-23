import { enrichedClass } from '../../src/services/DraftEnrichment';
(async () => {
  const { players, enrich } = await enrichedClass(2011, 'NFL', { fill: false });
  for (const p of players.filter((x) => ['Watt', 'Heyward'].includes(x.lastName))) console.log(p.firstName, p.lastName, p.position, p.weight, (enrich as any)?.get?.(p.draftPick)?.positionLabel);
})();
