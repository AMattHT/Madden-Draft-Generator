import { enrichedClass } from '../src/services/DraftEnrichment';

async function main() {
  const { players } = await enrichedClass(2003, 'NFL', { fill: true });
  for (const p of players) {
    if (['Polamalu', 'Suggs', 'Reed'].includes(p.lastName)) {
      console.log(p.firstName, p.lastName, '-> position:', p.position, '| pick:', p.pick);
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
