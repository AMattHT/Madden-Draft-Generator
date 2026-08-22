import fs from 'fs';
import { enrichedClass } from '../src/services/DraftEnrichment';
import { DraftClassBuilder } from '../src/services/DraftClassBuilder';
import { LikenessService } from '../src/services/LikenessService';
import { parseM27Prospects } from '../src/vendor/draft-class/M27Parser.js';

async function main() {
  console.log('bennett 1987', LikenessService.m27FaceFor('Cornelius', 'Bennett', 1987));
  console.log('bennett 2022?', LikenessService.m27FaceFor('Jakorian', 'Bennett', 2022));
  console.log('testaverde 1987', LikenessService.m27FaceFor('Vinny', 'Testaverde', 1987));

  const { players } = await enrichedClass(1987, 'NFL', { fill: true });
  const { buffer, count, likeness } = DraftClassBuilder.buildMdc27(players);
  const out = 'C:/Users/amatthews/Documents/Madden NFL 27/saves/CAREERDRAFT-1987DRAFT';
  fs.writeFileSync(out, buffer);
  console.log('wrote', out, 'count', count, 'likeness', likeness);

  const list = parseM27Prospects(buffer, { dataStartOffset: 0x46 });
  for (const p of list.slice(0, 3)) {
    console.log({
      name: `${p.firstName} ${p.lastName}`,
      pid: p.PID,
      peps: p.PEPS || p.assetName,
      gen: p.visuals?.genericHeadName ?? null,
    });
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
