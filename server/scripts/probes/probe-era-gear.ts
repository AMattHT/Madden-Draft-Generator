import { EraGearService } from '../src/services/EraGearService';

// M26 position ids: 0 QB, 1 HB, 5 LT, 13 SAM(LB), 16 CB
for (const [year, posId, label] of [
  [1965, 0, 'QB'], [1965, 5, 'OL'], [1985, 1, 'RB'], [1995, 13, 'LB'], [2003, 16, 'CB'], [2024, 0, 'QB'],
] as const) {
  const els = EraGearService.loadoutElements(year, posId, `probe|${year}|${posId}`);
  console.log(`-- ${year} ${label}`);
  for (const e of els) console.log(`   ${e.slotType ?? '(slotless)'}: ${e.itemAssetName}`);
}
