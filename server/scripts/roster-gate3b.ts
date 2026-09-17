/**
 * Gate 3b: a made-up player on the Bears, written as ROSTER-GATE3B. His ratings and
 * generic head come from a pool player, but the name and number are invented, so the
 * game cannot match him to any face or portrait it ships.
 *
 *   npx tsx scripts/roster-gate3b.ts
 *
 * In Madden 27, load ROSTER-GATE3B, open the Bears: Rando Tester, QB #17, with a
 * generic head, gear, Persona DNA and a contract.
 */
import fs from 'fs';
import { RosterAddService } from '../src/services/RosterAddService';
import { RosterFileService } from '../src/services/RosterFileService';
import { RosterBuildService } from '../src/services/RosterBuildService';
import { PlayerLookupService } from '../src/services/PlayerLookupService';

async function main() {
  // Any 1990s late-round quarterback without a scan gives us ratings and a tone-matched generic head.
  const pool = PlayerLookupService.catalog().filter((p) => p.year >= 1990 && p.year <= 1999 && p.round != null && p.round >= 5 && p.mpos === 'QB').slice(0, 40);
  let seed = null;
  for (const p of pool) {
    const g = await RosterAddService.generate(p.key).catch(() => null);
    if (g && !g.assetName) { seed = g; break; }
  }
  if (!seed) throw new Error('no generic-head quarterback found in the first 40 candidates');
  const invented = { ...seed, key: 'gate3b|random', firstName: 'Rando', lastName: 'Tester', jersey: 17, hometown: 'Nowhere', commentaryId: 0, portrait: null };

  const base = await RosterFileService.openBase('ROSTER-Official');
  const bears = base.teams.find((t) => t.abbr === 'CHI')!;
  const counts = RosterBuildService.apply(base, {
    baseName: 'ROSTER-Official', name: 'GATE3B',
    adds: [{ tempId: 'r', key: invented.key, teamId: bears.id, jersey: 17 }],
  }, new Map([[invented.key, invented]]));
  const out = RosterFileService.write(base.tdb2, base.header);
  const outPath = RosterFileService.savePath('ROSTER-GATE3B');
  fs.writeFileSync(`${outPath}.tmp`, out);
  fs.renameSync(`${outPath}.tmp`, outPath);
  console.log(counts);
  console.log(`wrote ${outPath}`);
  console.log(`Rando Tester QB #17, ${invented.overall} OVR, head ${invented.genericHead}, body ${invented.bodyType}, from ${seed.firstName} ${seed.lastName}'s ratings`);
}

main().catch((e) => { console.error(e); process.exit(1); });
