/**
 * Build a Madden 27 draft class for a year through the full enriched pipeline
 * (position fixes, combine, likeness, era gear) + persona DNA, and write it to
 * cache/exports/CAREERDRAFT-<year>M27. Run: node scripts/build-m27.js [year]
 */
const path = require('path');
const fs = require('fs');

require('tsx/cjs');
const { enrichedClass } = require('../src/services/DraftEnrichment');
const { DraftClassBuilder } = require('../src/services/DraftClassBuilder');
const { Mdc27Service } = require('../src/services/Mdc27Service');

const year = parseInt(process.argv[2] || '2003', 10);
const league = year >= 1960 && year <= 1969 ? 'combined' : 'NFL';

async function main() {
  const { players } = await enrichedClass(year, league, { fill: true });
  console.log(`[m27] ${year} (${league}): ${players.length} enriched players`);

  const { buffer, count, likeness } = DraftClassBuilder.buildMdc27(players);
  const outPath = path.join(__dirname, '..', 'cache', 'exports', `CAREERDRAFT-${year}M27`);
  fs.writeFileSync(outPath, buffer);
  console.log(`[m27] wrote ${outPath} (${buffer.length} bytes, ${count} prospects, faces: ${likeness.asset} real/${likeness.generic} generic)`);

  // Re-parse and report the key players + a persona DNA sample.
  const reparsed = Mdc27Service.parse(buffer);
  for (const name of ['Polamalu', 'Suggs', 'Palmer']) {
    const p = reparsed.find((x) => x.lastName === name);
    if (p) {
      console.log(
        `[m27] ${p.firstName} ${p.lastName}: pos=${p.position} ovr=${p.overall} dev=${p.devTrait} dna=[${p.personaDNA.join(',')}] face=${p.PEPS || p.visuals?.genericHeadName}`
      );
    }
  }
  const POS = ['QB','HB','FB','WR','TE','LT','LG','C','RG','RT','LEDG','REDG','DT','SAM','MIKE','WILL','CB','FS','SS','K','P','LS'];
  const first = reparsed[0];
  console.log(`[m27] pick 1: ${first.firstName} ${first.lastName} ${POS[first.position]} ovr=${first.overall}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
