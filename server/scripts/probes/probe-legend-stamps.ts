import { PlayerLookupService } from '../../src/services/PlayerLookupService';
import { parseCsvFile } from '../../src/util/csv';
import { LOOKUPS_DIR } from '../../src/config/paths';
import path from 'path';
const raw = parseCsvFile<Record<string, string>>(path.join(LOOKUPS_DIR, 'ALL_PLAYER_LOOKUP.csv'));
const stamped = raw.filter((r) => /^plpo_legends_/i.test(r.PLPO || ''));
let dropped: string[] = [];
for (const y of PlayerLookupService.years()) for (const p of PlayerLookupService.byYear(y)) {
  const r = stamped.find((x) => x['First Name'] === p.firstName && x['Last Name'] === p.lastName && Number(x['Draft Class']) === p.draftYear);
  if (r && !p.plpo) dropped.push(`${p.firstName} ${p.lastName} ${p.draftYear} ${p.position}`);
}
console.log('legend-portrait rows', stamped.length, 'dropped as namesakes', dropped.length);
console.log(dropped.join(' | '));
