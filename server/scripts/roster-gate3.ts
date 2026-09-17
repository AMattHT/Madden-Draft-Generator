/**
 * Gate 3: two pool players added to the Bears, written as ROSTER-GATE3: one whose face
 * the game ships as a scan and one rendered with a generic head.
 *
 *   npx tsx scripts/roster-gate3.ts
 *
 * In Madden 27, load ROSTER-GATE3, open the Bears: both players are there with the
 * printed overalls; check the face, the gear, the Persona DNA and the contract screen.
 */
import { RosterAddService } from '../src/services/RosterAddService';
import { RosterFileService } from '../src/services/RosterFileService';
import { RosterBuildService } from '../src/services/RosterBuildService';
import { PlayerLookupService } from '../src/services/PlayerLookupService';

/** Legends the game ships scans for; the generic-head player is found by searching the pool. */
const SCAN_CANDIDATES = ['1989|NFL|barry|sanders|3', '1975|NFL|walter|payton|4', '1979|NFL|joe|montana|82'];

async function main() {
  let scan: string | null = null, generic: string | null = null;
  for (const key of SCAN_CANDIDATES) {
    const g = await RosterAddService.generate(key).catch(() => null);
    if (g?.assetName) { scan = key; break; }
  }
  // A late-round pick from the 1990s is very unlikely to have a scan in Madden 27.
  const obscure = PlayerLookupService.catalog().filter((p) => p.year >= 1990 && p.year <= 1999 && p.round != null && p.round >= 6 && p.pb === 0).slice(0, 40);
  for (const p of obscure) {
    const g = await RosterAddService.generate(p.key).catch(() => null);
    if (g && !g.assetName) { generic = p.key; break; }
  }
  if (!scan || !generic) throw new Error(`could not find both kinds (scan=${scan}, generic=${generic})`);
  const base = await RosterFileService.openBase('ROSTER-Official');
  const bears = base.teams.find((t) => t.abbr === 'CHI')!;
  const result = await RosterBuildService.build({
    baseName: 'ROSTER-Official', name: 'GATE3',
    adds: [{ tempId: 'a', key: scan, teamId: bears.id }, { tempId: 'b', key: generic, teamId: bears.id }],
  });
  const a = await RosterAddService.generate(scan), b = await RosterAddService.generate(generic);
  console.log(result);
  console.log(`scan face:    ${a.firstName} ${a.lastName} ${a.position} ${a.overall} OVR, asset ${a.assetName}`);
  console.log(`generic head: ${b.firstName} ${b.lastName} ${b.position} ${b.overall} OVR, head ${b.genericHead}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
