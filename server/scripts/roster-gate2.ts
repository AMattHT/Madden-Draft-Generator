/**
 * Gate 2: one edited overall and one team move, written as ROSTER-GATE2 for an
 * in-game check.
 *
 *   npx tsx scripts/roster-gate2.ts
 *
 * In Madden 27, load ROSTER-GATE2 and check: Geno Smith is on the Bears at 90 OVR
 * with 95 throw power, and shows on the Bears' depth chart; the second Jets
 * quarterback listed below is a free agent.
 */
import { RosterFileService } from '../src/services/RosterFileService';
import { RosterBuildService } from '../src/services/RosterBuildService';

async function main() {
  const base = await RosterFileService.openBase('ROSTER-Official');
  const geno = base.players.find((p) => p.firstName === 'Geno' && p.lastName === 'Smith');
  const bears = base.teams.find((t) => t.abbr === 'CHI');
  if (!geno || !bears) throw new Error('Geno Smith or the Bears are not in ROSTER-Official');
  const otherJet = base.players.find((p) => p.teamId === geno.teamId && p.position === 'QB' && p.id !== geno.id);
  if (!otherJet) throw new Error('no second Jets quarterback');
  const result = await RosterBuildService.build({
    baseName: 'ROSTER-Official',
    name: 'GATE2',
    moves: { [geno.id]: bears.id, [otherJet.id]: base.freeAgentTeamId },
    edits: { [geno.id]: { overall: 90, ratings: { throwPower: 95 } } },
  });
  console.log(result);
  console.log(`check in-game: Geno Smith -> Bears, 90 OVR, THP 95; ${otherJet.firstName} ${otherJet.lastName} -> free agent`);
}

main().catch((e) => { console.error(e); process.exit(1); });
