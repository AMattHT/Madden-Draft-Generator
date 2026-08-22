import { LookupService } from './LookupService';
import { PlayerLookupService } from './PlayerLookupService';
import { seededRng } from '../util/rng';

/**
 * Hometown -> Madden home-state id + town, repairing the lookup's quirks:
 *  - ~1,900 rows carry a truncated state ("Massapequa Park, New", "Charlotte, North"):
 *    resolved through a city -> state table built from the rows that are complete.
 *  - ~66% of rows have no hometown at all; those used to export as state 0, which
 *    is Alabama. They now get a state sampled from the decade's real distribution
 *    (seeded, so preview and export agree) and an empty town.
 */
export interface Hometown {
  state: number;
  stateName: string;
  town: string;
}

const AMBIGUOUS: Record<string, string[]> = {
  new: ['New York', 'New Jersey', 'New Mexico', 'New Hampshire'],
  north: ['North Carolina', 'North Dakota'],
  south: ['South Carolina', 'South Dakota'],
  west: ['West Virginia'],
};

let cityState: Map<string, string> | null = null;
let decadeStates: Map<number, Array<[number, number]>> | null = null; // decade -> [stateId, count]

function split(raw: string): { town: string; state: string } | null {
  const s = raw.trim();
  const ci = s.lastIndexOf(',');
  if (ci < 0) return null;
  return { town: s.slice(0, ci).trim(), state: s.slice(ci + 1).trim() };
}

function build(): void {
  cityState = new Map();
  decadeStates = new Map();
  const cityVotes = new Map<string, Map<string, number>>();
  for (const year of PlayerLookupService.years()) {
    const dec = Math.floor(year / 10) * 10;
    for (const p of PlayerLookupService.byYear(year, 'combined')) {
      if (!p.homeState) continue;
      const parts = split(p.homeState);
      if (!parts) continue;
      const id = LookupService.stateId(parts.state);
      if (id == null) continue; // truncated or foreign
      const name = LookupService.idToName('state', id) ?? parts.state;
      const key = parts.town.toLowerCase();
      if (key) {
        const votes = cityVotes.get(key) ?? new Map<string, number>();
        votes.set(name, (votes.get(name) ?? 0) + 1);
        cityVotes.set(key, votes);
      }
      const ds = decadeStates.get(dec) ?? [];
      const slot = ds.find((e) => e[0] === id);
      if (slot) slot[1]++;
      else ds.push([id, 1]);
      decadeStates.set(dec, ds);
    }
  }
  for (const [city, votes] of cityVotes) {
    cityState.set(city, [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  }
}

function ensure(): void {
  if (!cityState) build();
}

function resolveState(town: string, stateText: string): { id: number; name: string } | null {
  const direct = LookupService.stateId(stateText);
  if (direct != null) return { id: direct, name: LookupService.idToName('state', direct) ?? stateText };
  // Truncated token: try the city table first, then the single unambiguous expansion.
  const options = AMBIGUOUS[stateText.toLowerCase()];
  const byCity = cityState!.get(town.toLowerCase());
  if (byCity && (!options || options.includes(byCity))) {
    const id = LookupService.stateId(byCity);
    if (id != null) return { id, name: byCity };
  }
  if (options && options.length === 1) {
    const id = LookupService.stateId(options[0]);
    if (id != null) return { id, name: options[0] };
  }
  if (byCity) {
    const id = LookupService.stateId(byCity);
    if (id != null) return { id, name: byCity };
  }
  // No city evidence: the most common of the candidates across all rows (New York
  // dwarfs New Jersey / New Mexico / New Hampshire; the Carolinas beat the Dakotas).
  if (options) {
    let best: { id: number; name: string } | null = null, bestCount = -1;
    for (const name of options) {
      const id = LookupService.stateId(name);
      if (id == null) continue;
      let count = 0;
      for (const ds of decadeStates!.values()) count += ds.find((e) => e[0] === id)?.[1] ?? 0;
      if (count > bestCount) { best = { id, name }; bestCount = count; }
    }
    if (best) return best;
  }
  return null;
}

function sampleState(year: number, seedKey: string): { id: number; name: string } {
  const dec = Math.floor(year / 10) * 10;
  let pool = decadeStates!.get(dec);
  for (let d = 10; (!pool || pool.length < 5) && d <= 60; d += 10) pool = decadeStates!.get(dec - d) ?? decadeStates!.get(dec + d) ?? pool;
  if (!pool || !pool.length) return { id: 0, name: LookupService.idToName('state', 0) ?? '' };
  const total = pool.reduce((s, [, c]) => s + c, 0);
  let x = seededRng(`hometown|${seedKey}`)() * total;
  for (const [id, c] of pool) {
    x -= c;
    if (x <= 0) return { id, name: LookupService.idToName('state', id) ?? '' };
  }
  const [id] = pool[pool.length - 1];
  return { id, name: LookupService.idToName('state', id) ?? '' };
}

export const HometownService = {
  resolve(raw: string | null | undefined, draftYear: number, seedKey: string): Hometown {
    ensure();
    if (raw && raw.trim()) {
      const parts = split(raw);
      if (parts) {
        const st = resolveState(parts.town, parts.state);
        if (st) return { state: st.id, stateName: st.name, town: parts.town };
        // Unresolvable state text: keep the town, sample the state.
        const s = sampleState(draftYear, seedKey);
        return { state: s.id, stateName: s.name, town: parts.town };
      }
      const asState = LookupService.stateId(raw.trim());
      if (asState != null) return { state: asState, stateName: LookupService.idToName('state', asState) ?? raw.trim(), town: '' };
      const s = sampleState(draftYear, seedKey);
      return { state: s.id, stateName: s.name, town: raw.trim() };
    }
    const s = sampleState(draftYear, seedKey);
    return { state: s.id, stateName: s.name, town: '' };
  },
};
