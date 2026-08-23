import { TONE_ITA_MODEL, TONE_L_MODEL } from '../../src/services/SkinToneClassify';
import { SkinToneService } from '../../src/services/SkinToneService';
const cases: Array<[string, string, number, number | null, number | null, 'light' | 'dark']> = [
  ['Namath', 'QB', 1965, -30.5, null, 'light'], ['Butkus', 'MIKE', 1965, 13.1, null, 'light'], ['Brooking', 'WILL', 1998, 30.4, null, 'light'],
  ['Sayers', 'HB', 1965, -11.9, null, 'dark'], ['Greenwood', 'LEDG', 1969, null, 36.7, 'dark'], ['Upshaw', 'LG', 1967, -3.6, null, 'dark'],
  ['Wright', 'LT', 1967, null, 45.3, 'dark'], ['Polamalu', 'SS', 2003, -22.5, null, 'dark'], ['Page', 'DT', 1967, -53.8, null, 'dark'], ['Barney', 'CB', 1967, -23.6, null, 'dark'],
];
function tone(ita: number | null, greyL: number | null, prior: Record<number, number>, k: number, pw: number, gk: number): number {
  let best = 0, bs = -Infinity;
  for (let t = 1; t <= 7; t++) {
    let ll = pw * Math.log(Math.max(0.03, prior[t] ?? 0));
    if (ita != null) { const [mu, sd0] = TONE_ITA_MODEL[t]; const kk = ita <= -15 ? k : 1; const sd = sd0 * kk; ll += -0.5 * ((ita - mu) / sd) ** 2 - Math.log(sd); }
    else if (greyL != null) { const [mu, sd0] = TONE_L_MODEL[t]; const sd = sd0 * gk; ll += -0.5 * ((greyL - mu) / sd) ** 2 - Math.log(sd); }
    if (ll > bs) { bs = ll; best = t; }
  }
  return best;
}
for (const k of [1.5, 1.75, 2, 2.5]) for (const pw of [0.5, 0.75, 1]) for (const gk of [1, 1.5, 2]) {
  const res = cases.map(([n, pos, y, ita, g, want]) => { const t = tone(ita, g, SkinToneService.toneDistribution(pos, y), k, pw, gk); return [n, t, want === 'light' ? t <= 3 : t >= 5] as const; });
  const ok = res.filter((r) => r[2]).length;
  if (ok >= cases.length - 1) console.log(`k=${k} pw=${pw} gk=${gk} ok=${ok}/${cases.length}`, res.filter((r) => !r[2]).map((r) => `${r[0]}=${r[1]}`).join(' '), '|', res.map((r) => `${r[0]}:${r[1]}`).join(' '));
}
