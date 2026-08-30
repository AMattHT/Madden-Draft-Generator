/** How many of the 87 mis-split surnames now reach a headshot. */
import { PlayerLookupService } from '../../src/services/PlayerLookupService';
import { NflverseCareerService } from '../../src/services/NflverseCareerService';
const PART = new Set(['van','vander','vanden','von','de','del','della','di','da','du','la','le','st','st.','ste','ste.','mc','mac','el','ah','te','ter','abdul','bin','al']);
let repaired = 0, withPhoto = 0;
for (const y of PlayerLookupService.years())
  for (const p of PlayerLookupService.byYear(y)) {
    const head = p.lastName.split(/\s+/)[0]?.toLowerCase();
    if (!head || !PART.has(head)) continue;
    repaired++;
    if (NflverseCareerService.get(p.firstName, p.lastName, y, p.draftPick)?.headshotUrl) withPhoto++;
  }
console.log(`${repaired} repaired surnames; ${withPhoto} now resolve a headshot`);
