/**
 * Gate 4: the card's new edits on a base player, plus a pool player with a chosen generic
 * head, written as ROSTER-GATE4.
 *
 *   npx tsx scripts/roster-gate4.ts
 *
 * In Madden 27, load ROSTER-GATE4. Jets: "Eugene Smithson" QB (was Geno Smith), 6'6" 240
 * from Alabama, archetype changed, Patrick Mahomes's face, a new Persona (three traits,
 * Personal Accolades focus). Bears: Walter Payton with the printed tone-1 generic head.
 */
import { RosterFileService } from '../src/services/RosterFileService';
import { RosterBuildService } from '../src/services/RosterBuildService';
import { LookupService } from '../src/services/LookupService';
import { LikenessService } from '../src/services/LikenessService';

async function main() {
  const base = await RosterFileService.openBase('ROSTER-Official');
  const geno = base.players.find((p) => p.firstName === 'Geno' && p.lastName === 'Smith');
  const bears = base.teams.find((t) => t.abbr === 'CHI');
  if (!geno || !bears) throw new Error('Geno Smith or the Bears are not in ROSTER-Official');
  const alabama = LookupService.nameToId('college', 'Alabama') ?? geno.collegeId;
  const head = LikenessService.genericHeadsByTone('m27')['1']?.[0];
  if (!head) throw new Error('no tone-1 generic head in the Madden 27 pool');
  const result = await RosterBuildService.build({
    baseName: 'ROSTER-Official', name: 'GATE4',
    adds: [{ tempId: 'p', key: '1975|NFL|walter|payton|4', teamId: bears.id }],
    edits: {
      [geno.id]: { firstName: 'Eugene', lastName: 'Smithson', college: alabama, heightInches: 78, weight: 240, archetype: geno.archetypeId === 0 ? 1 : 0, personaDNA: [3, 4, 5], focus: 2, faceAsset: 'MahomesIIPatrick_12635' },
      p: { genericHead: head, skinTone: 1 },
    },
  });
  console.log(result);
  console.log(`Geno Smith -> Eugene Smithson, college id ${alabama}, archetype ${geno.archetypeId === 0 ? 1 : 0}; Payton's head ${head}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
