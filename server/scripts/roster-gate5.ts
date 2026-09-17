/**
 * Gate 5: a roster from scratch. Every base player removed, one team (Bears) filled with
 * 53 pool players, the other 31 empty. Written as ROSTER-GATE5.
 *
 *   npx tsx scripts/roster-gate5.ts
 *
 * In Madden 27, load ROSTER-GATE5: the Bears have 53 players, everyone else nobody, free
 * agency empty. Then Play Now, Bears against any team, and note whether the game allows it.
 */
import { RosterFileService } from '../src/services/RosterFileService';
import { RosterBuildService } from '../src/services/RosterBuildService';
import { PlayerLookupService } from '../src/services/PlayerLookupService';

const WANT: [string, number][] = [['QB', 3], ['RB', 5], ['WR', 6], ['TE', 3], ['OL', 9], ['EDGE', 4], ['IDL', 4], ['LB', 6], ['CB', 6], ['S', 4], ['K', 1], ['P', 1], ['LS', 1]];

async function main() {
  const base = await RosterFileService.openBase('ROSTER-Official');
  const bears = base.teams.find((t) => t.abbr === 'CHI');
  if (!bears) throw new Error('the Bears are not in ROSTER-Official');
  const cat = PlayerLookupService.catalog().filter((p) => p.year >= 1980 && p.year <= 2010).sort((a, b) => b.cal - a.cal);
  const adds: { tempId: string; key: string; teamId: number }[] = [];
  for (const [grp, n] of WANT) for (const p of cat.filter((p) => p.grp === grp).slice(0, n)) adds.push({ tempId: `t${adds.length}`, key: p.key, teamId: bears.id });
  const result = await RosterBuildService.build({ baseName: 'ROSTER-Official', name: 'GATE5', fresh: true, adds });
  console.log(result, 'players on the Bears:', adds.length);
}

main().catch((e) => { console.error(e); process.exit(1); });
