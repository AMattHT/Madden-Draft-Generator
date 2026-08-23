import { enrichedClass } from '../../src/services/DraftEnrichment';
(async () => {
  const { players } = await enrichedClass(1967, 'NFL', { fill: false });
  for (const p of players) if (['Upshaw', 'Wright', 'Little'].includes(p.lastName) && ['Gene', 'Rayfield', 'Floyd'].includes(p.firstName)) console.log(p.firstName, p.lastName, 'race', p.race, 'photoId', p.photoId, 'wiki', (p.wikiImageUrl || '').slice(0, 50));
})();
