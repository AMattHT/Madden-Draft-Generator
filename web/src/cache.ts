import { get, set, keys, del } from 'idb-keyval';
import type { GeneratedClass, ClassEdits, GearEdits } from './types';

// Client-side cache: every pulled class is stored in IndexedDB so revisiting a
// year (or reloading the page) is instant and offline-friendly.
// Bump CACHE_VERSION whenever the backend rating/position logic changes so stale
// cached classes are treated as a miss and re-pulled automatically.
const CACHE_VERSION = 24; // v24: 2026 = REAL NFL draft (Wikipedia) replacing the projected template class, with teams+logos
const keyOf = (year: number, league: string, mode: string) => `class:${year}_${league}_${mode}`;
const editsKeyOf = (year: number, league: string) => `edits:${year}_${league}`;
const gearKeyOf = (year: number, league: string) => `gear:${year}_${league}`;

export const cache = {
  async get(year: number, league: string, mode: string): Promise<GeneratedClass | undefined> {
    const c = await get<GeneratedClass>(keyOf(year, league, mode));
    return c && c._v === CACHE_VERSION ? c : undefined; // ignore stale-version entries
  },
  set: (c: GeneratedClass, mode: string) => set(keyOf(c.year, c.league, mode), { ...c, _v: CACHE_VERSION }),
  del: (year: number, league: string, mode: string) => del(keyOf(year, league, mode)),

  // Per-year user edits (shared across modes; keyed by pick, which is stable).
  editsGet: (year: number, league: string): Promise<ClassEdits> =>
    get<ClassEdits>(editsKeyOf(year, league)).then((e) => e ?? {}),
  editsSet: (year: number, league: string, edits: ClassEdits) => set(editsKeyOf(year, league), edits),
  editsDel: (year: number, league: string) => del(editsKeyOf(year, league)),

  // Per-year gear edits (shared across modes; keyed by pick).
  gearEditsGet: (year: number, league: string): Promise<GearEdits> =>
    get<GearEdits>(gearKeyOf(year, league)).then((e) => e ?? {}),
  gearEditsSet: (year: number, league: string, gear: GearEdits) => set(gearKeyOf(year, league), gear),
  gearEditsDel: (year: number, league: string) => del(gearKeyOf(year, league)),

  async cachedYears(): Promise<Set<number>> {
    const all = (await keys()) as string[];
    const years = new Set<number>();
    for (const k of all) {
      const m = /^class:(\d+)_/.exec(String(k));
      if (m) years.add(parseInt(m[1], 10));
    }
    return years;
  },
};
