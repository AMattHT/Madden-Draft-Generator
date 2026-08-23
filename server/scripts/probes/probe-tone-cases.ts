import { toneFromEvidence } from '../../src/services/SkinToneClassify';
import { SkinToneService } from '../../src/services/SkinToneService';
const cases: Array<[string, string, number, number | null, number | null]> = [
  ['Namath', 'QB', 1965, -30.5, null], ['Butkus', 'MIKE', 1965, 13.1, null], ['Brooking', 'WILL', 1998, 30.4, null], ['Sayers', 'HB', 1965, -11.9, null],
  ['Greenwood', 'LEDG', 1969, null, 36.7], ['Upshaw', 'LG', 1967, -3.6, null], ['Wright', 'LT', 1967, null, 45.3], ['Polamalu', 'SS', 2003, -22.5, null],
  ['Page', 'DT', 1967, -53.8, null], ['Barney', 'CB', 1967, -23.6, null], ['Newton(modern)', 'QB', 2011, -4.3, null], ['Murray', 'HB', 2011, -20, null],
];
console.log(cases.map(([n, pos, y, ita, g]) => `${n}:${toneFromEvidence({ ita, greyL: g, legendPortrait: !n.includes('modern'), prior: SkinToneService.toneDistribution(pos, y) })}`).join('  '));
