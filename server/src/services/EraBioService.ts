import { PlayerLookupService } from './PlayerLookupService';
import { PositionMapper } from './PositionMapper';
import { CalibrationService } from './CalibrationService';
import { gauss } from './AttributeModel';

/**
 * Era-aware height/weight norms for players whose measurements are missing
 * (under 4% of 1950s draftees have any). Built from the players in the lookup
 * who DO have measurements, per decade and rating group: a 1952 tackle is 6'2"
 * 235, not the 6'6" 318 the Madden-26 calibration would hand him. Decades with
 * too few samples borrow the nearest populated decade; beyond the data the
 * modern calibration profile applies.
 */
export interface BioNorms {
  htMean: number;
  htStd: number;
  wtMean: number;
  wtStd: number;
  n: number;
}

const MIN_SAMPLES = 15;
let table: Map<string, BioNorms> | null = null;

function decadeOf(year: number): number {
  return Math.floor(year / 10) * 10;
}

function build(): Map<string, BioNorms> {
  const acc = new Map<string, { hs: number[]; ws: number[] }>();
  for (const year of PlayerLookupService.years()) {
    for (const p of PlayerLookupService.byYear(year, 'combined')) {
      if (p.heightInches == null || p.weight == null) continue;
      const group = PositionMapper.groupFromId(PositionMapper.resolve(p.firstName, p.lastName, p.position, p.weight));
      const key = `${decadeOf(year)}|${group}`;
      const a = acc.get(key) ?? { hs: [], ws: [] };
      a.hs.push(p.heightInches);
      a.ws.push(p.weight);
      acc.set(key, a);
    }
  }
  const out = new Map<string, BioNorms>();
  const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  // Robust spread: median absolute deviation scaled to a normal sigma, capped so a
  // handful of mis-merged modern measurements cannot widen an old decade.
  const mad = (xs: number[], m: number) => 1.4826 * median(xs.map((x) => Math.abs(x - m)));
  for (const [key, a] of acc) {
    const hm = median(a.hs), wm = median(a.ws);
    out.set(key, {
      htMean: hm, htStd: Math.min(2.3, Math.max(1.2, mad(a.hs, hm))),
      wtMean: wm, wtStd: Math.min(18, Math.max(6, mad(a.ws, wm))),
      n: a.hs.length,
    });
  }
  // Players only got bigger over time: a thin early bucket must not exceed the next
  // decade's (well-populated) norm, and thin buckets lean on the next decade.
  const groups = new Set([...out.keys()].map((k) => k.split('|')[1]));
  for (const g of groups) {
    for (let dec = 2010; dec >= 1930; dec -= 10) {
      const cur = out.get(`${dec}|${g}`);
      const next = out.get(`${dec + 10}|${g}`);
      if (!cur || !next) continue;
      const trust = Math.min(1, cur.n / 60);
      cur.wtMean = Math.min(next.wtMean, trust * cur.wtMean + (1 - trust) * (next.wtMean - 6));
      cur.htMean = Math.min(next.htMean, trust * cur.htMean + (1 - trust) * (next.htMean - 0.3));
    }
  }
  return out;
}

function load(): Map<string, BioNorms> {
  if (!table) table = build();
  return table;
}

export const EraBioService = {
  /** Height/weight norms for a draft year and rating group. */
  norms(year: number, group: string, version: 'm26' | 'm27' = 'm26'): BioNorms {
    const t = load();
    const dec = decadeOf(year);
    // Nearest populated decade, searching outward (earlier first for old years so a
    // 1936 class leans on the 1940s, not the 1970s).
    for (let d = 0; d <= 60; d += 10) {
      for (const cand of d === 0 ? [dec] : [dec - d, dec + d]) {
        const hit = t.get(`${cand}|${group}`);
        if (hit && hit.n >= MIN_SAMPLES) return hit;
      }
    }
    const posName = Object.entries({ QB: 'QB', RB: 'HB', WR: 'WR', TE: 'TE', OL: 'LT', EDGE: 'LEDG', IDL: 'DT', LB: 'MIKE', CB: 'CB', S: 'FS', K: 'K', P: 'P', LS: 'LS' }).find(([g]) => g === group)?.[1] ?? 'WR';
    const prof = CalibrationService.positionProfile(posName, version);
    return { htMean: prof.htMean, htStd: prof.htStd, wtMean: prof.wtMean, wtStd: prof.wtStd, n: 0 };
  },

  /** A plausible build for a player of that era/group (seeded). */
  sample(year: number, group: string, rand: () => number, version: 'm26' | 'm27' = 'm26'): { heightInches: number; weight: number } {
    const n = this.norms(year, group, version);
    const z = Math.max(-2.2, Math.min(2.2, gauss(rand)));
    const heightInches = Math.round(Math.max(64, Math.min(81, n.htMean + z * n.htStd)));
    // Weight correlates with height: share part of the same draw; clamp to +-2 sigma.
    const zw = Math.max(-2, Math.min(2, 0.5 * z + 0.87 * gauss(rand)));
    const weight = Math.round(Math.max(150, n.wtMean + zw * n.wtStd));
    return { heightInches, weight };
  },
};
