import { test } from 'node:test';
import assert from 'node:assert/strict';
import { youngDev, pace, seasonsCompleted, type YoungInput } from '../DevTraitService';

const YEAR = 2026;
let n = 0;
const mk = (over: Partial<YoungInput>): YoungInput => ({
  key: `p${n++}`, posGroup: 'WR', draftYear: 2023, careerTo: null, wav: 0, wavActual: true,
  ap1: 0, pb: 0, awards: [], round: 3, pick: 80, caliber: 60, elite: false, ...over,
});
const dev = (items: YoungInput[]) => youngDev(items, YEAR);

test('seasons and pace: 2023 draftee has three completed seasons; 24 wAV as a QB is a 1.13 pace', () => {
  assert.equal(seasonsCompleted(2023, null, YEAR), 3);
  assert.equal(seasonsCompleted(2026, null, YEAR), 0);
  assert.equal(seasonsCompleted(2018, 2022, YEAR), 5);
  const stroud = mk({ posGroup: 'QB', wav: 24 });
  assert.ok(Math.abs(pace(stroud, YEAR) - 24 / 3 / 9.8) < 1e-9);
  assert.equal(pace(mk({ wav: 50, wavActual: false }), YEAR), 0, 'predicted wAV is not production');
});

test('X-Factor comes from awards or wAV, never from a quota', () => {
  const mvp = mk({ awards: ['MVP'], wav: 5 });
  const twoAllPro = mk({ ap1: 2, wav: 5 });
  const roy = mk({ posGroup: 'QB', awards: ['OROY'], wav: 24 }); // Stroud: 8/yr, pace 0.82
  const royNoData = mk({ posGroup: 'WR', draftYear: 2025, awards: ['OROY'], wav: null, wavActual: false }); // McMillan
  const royBust = mk({ posGroup: 'QB', awards: ['OROY'], wav: 6 }); // 2/yr over 3 seasons: the award never translated
  const royFaded = mk({ posGroup: 'EDGE', draftYear: 2020, awards: ['DROY'], wav: 29, pb: 1 }); // Chase Young: pace ~0.6, one Pro Bowl
  const royBacked = mk({ posGroup: 'CB', draftYear: 2017, awards: ['DROY'], wav: 43, pb: 4 }); // Lattimore: pace ~0.67 but four Pro Bowls
  const paceOnly3 = mk({ posGroup: 'RB', wav: 45 }); // 15/yr vs 10.3 over 3 seasons: pace 1.46, past ELITE_PACE
  const goodNotElite = mk({ posGroup: 'RB', wav: 40 }); // Gibbs: 13/yr, pace 1.29 -- a very good third year, not a Hall of Fame track
  const paceOnly2 = mk({ posGroup: 'QB', draftYear: 2024, wav: 30 }); // 15/yr (pace 1.53), only 2 seasons
  const punter = mk({ posGroup: 'P', wav: 9 }); // 3/yr vs 2.3: a fine punter, never an X-Factor
  const filler = Array.from({ length: 30 }, () => mk({ wav: 1 }));
  const r = dev([mvp, twoAllPro, roy, royNoData, royBust, royFaded, royBacked, paceOnly3, goodNotElite, paceOnly2, punter, ...filler]);
  assert.equal(r.get(mvp.key), 3);
  assert.equal(r.get(twoAllPro.key), 3);
  assert.equal(r.get(roy.key), 3, 'Rookie of the Year is an X-Factor');
  assert.equal(r.get(royNoData.key), 3, 'even before wAV exists');
  assert.equal(r.get(royBust.key), 2, 'unless three seasons show it never translated');
  assert.equal(r.get(royFaded.key), 2, 'a Rookie of the Year whose career stayed ordinary is a Superstar');
  assert.equal(r.get(royBacked.key), 3, 'Pro Bowls keep the award-winner an X-Factor');
  assert.equal(r.get(paceOnly3.key), 3, 'elite pace over three seasons');
  assert.ok(r.get(goodNotElite.key)! <= 2, 'a strong but ordinary-star pace is not an X-Factor');
  assert.ok(r.get(paceOnly2.key)! <= 2, 'two seasons of elite pace stop at Superstar');
  assert.ok(r.get(punter.key)! <= 2, 'specialists never reach X-Factor on pace');
  assert.equal([...r.values()].filter((t) => t === 3).length, 6, 'no X-Factor from the quota');
});

test('Superstar and Star floors from All-Pro and Pro Bowl counts', () => {
  const ap = mk({ ap1: 1, wav: 3 });
  const pb2 = mk({ pb: 2, wav: 3 });
  // The Pro Bowler produced less than the field, so any quota Superstar goes to a
  // filler and his tier is the floor alone; the 0-wAV man gets nothing.
  const pb1 = mk({ pb: 1, wav: 1 });
  const nobody = mk({ wav: 0 });
  const filler = Array.from({ length: 30 }, () => mk({ wav: 2 }));
  const r = dev([ap, pb2, pb1, nobody, ...filler]);
  assert.equal(r.get(ap.key), 2);
  assert.equal(r.get(pb2.key), 2);
  assert.equal(r.get(pb1.key), 1);
  assert.equal(r.get(nobody.key), 0);
});

test('a zero-season class hands out Superstars and Stars by slot and no X-Factors', () => {
  // 257 drafted rookies in a 402-slot class: quotas scale against the class, not the draftees.
  const items = Array.from({ length: 257 }, (_, i) => mk({ draftYear: 2026, wav: null, wavActual: false, round: Math.floor(i / 32) + 1, pick: i + 1 }));
  const r = youngDev(items, YEAR, 402);
  const tiers = [...r.values()];
  assert.equal(tiers.filter((t) => t === 3).length, 0);
  assert.equal(tiers.filter((t) => t === 2).length, 12);
  assert.equal(tiers.filter((t) => t === 1).length, 90);
  assert.equal(r.get(items[0].key), 2, 'pick 1 is a Superstar');
  assert.equal(r.get(items[200].key), 0);
});

test('the quota grows with seasons: a quarter at one season, half at two, full Superstars at four', () => {
  const cls = (year: number) => Array.from({ length: 402 }, (_, i) => mk({ draftYear: year, wav: Math.max(1, 30 - i / 10), round: Math.floor(i / 32) + 1, pick: i + 1 }));
  const count = (year: number, tier: number) => [...dev(cls(year)).values()].filter((t) => t === tier).length;
  assert.equal(count(2025, 2), 4, 'one season: a quarter of the Superstars');
  assert.equal(count(2025, 1), 45, 'one season: half the Stars');
  assert.equal(count(2024, 2), 7, 'two seasons: half the Superstars');
  assert.equal(count(2024, 1), 90);
  assert.equal(count(2022, 2), 14, 'four seasons: full Superstars');
});
