import { enrichedClass } from '../src/services/DraftEnrichment';
import { DraftClassBuilder } from '../src/services/DraftClassBuilder';

async function main() {
  const { players } = await enrichedClass(1987, 'NFL', { fill: false });
  const prev = DraftClassBuilder.preview(players, 'madden', {}, 'm27');
  const c = prev.rows.find((r) => /carter/i.test(r.lastName) && /cris/i.test(r.firstName));
  console.log(c && {
    name: `${c.firstName} ${c.lastName}`,
    ht: c.heightInches,
    wt: c.weight,
    wav: c.wav,
    arch: c.archetypeName,
    ovr: c.overall,
  });
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
