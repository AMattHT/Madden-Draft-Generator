import { NflverseCareerService } from '../src/services/NflverseCareerService';
import { enrichedClass } from '../src/services/DraftEnrichment';
import { RatingService } from '../src/services/RatingService';

async function main() {
  console.log('svc', NflverseCareerService.get('Cris', 'Carter', 1987));
  const { players } = await enrichedClass(1987, 'NFL', { fill: false });
  const c = players.find((p) => /carter/i.test(p.lastName) && /cris/i.test(p.firstName));
  if (!c) {
    console.log('not found', players.filter((p) => /carter/i.test(p.lastName)).map((p) => `${p.firstName} ${p.lastName}`));
    return;
  }
  const cal = RatingService.caliber(c, 3);
  console.log({
    name: `${c.firstName} ${c.lastName}`,
    ht: c.heightInches,
    wt: c.weight,
    wav: c.wav,
    src: c.wavSource,
    hof: c.isHOF,
    pb: c.proBowls,
    ap: c.allPro1,
    caliber: cal,
  });
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
