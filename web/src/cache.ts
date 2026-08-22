import { get, set, keys, del } from 'idb-keyval';
import type { GeneratedClass, ClassEdits, GearEdits } from './types';

/** Persisted board view state per class. */
export interface TableFilters {
  search: string;
  pos: string;
  sort: string;
}

// Client-side cache: every pulled class is stored in IndexedDB so revisiting a
// year (or reloading the page) is instant and offline-friendly.
// Bump CACHE_VERSION whenever the backend rating/position logic changes so stale
// cached classes are treated as a miss and re-pulled automatically.
const CACHE_VERSION = 46; // v46: front-seven classifier (3-4 OLBs -> edge, pinned SAM/MIKE/WILL)
/** Backend generator fingerprint (from /api/health). A cached class built by a
 *  different generator is treated as stale, so rating/likeness changes show up
 *  without a manual CACHE_VERSION bump. */
let generatorFingerprint: string | null = null;
export function setGeneratorFingerprint(fp: string | null): void { generatorFingerprint = fp; }
const keyOf = (year: number, league: string, mode: string) => `class:${year}_${league}_${mode}`;
const editsKeyOf = (year: number, league: string) => `edits:${year}_${league}`;
const gearKeyOf = (year: number, league: string) => `gear:${year}_${league}`;

export const cache = {
  async get(year: number, league: string, mode: string): Promise<GeneratedClass | undefined> {
    const c = await get<GeneratedClass>(keyOf(year, league, mode));
    if (!c || c._v !== CACHE_VERSION) return undefined; // ignore stale-version entries
    if (generatorFingerprint && c._gen && c._gen !== generatorFingerprint) return undefined; // built by an older generator
    return c;
  },
  set: (c: GeneratedClass, mode: string) => set(keyOf(c.year, c.league, mode), { ...c, _v: CACHE_VERSION, _gen: generatorFingerprint ?? undefined }),
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

  // Draft years already used in the franchise (so the random picker never repeats
  // a class). Persisted so the no-reuse history survives reloads.
  usedYearsGet: (): Promise<number[]> => get<number[]>('usedDraftYears').then((a) => a ?? []),
  usedYearsSet: (years: number[]) => set('usedDraftYears', years),

  // The random-picker year range (inclusive). Persisted alongside the used years.
  rangeGet: (): Promise<{ from: number; to: number } | null> =>
    get<{ from: number; to: number }>('draftRange').then((r) => r ?? null),
  rangeSet: (range: { from: number; to: number }) => set('draftRange', range),

  // Per-year table view state (search text, position filter, sort order), so the
  // board looks the way you left it when revisiting a class.
  filtersGet: (year: number, league: string): Promise<TableFilters | null> =>
    get<TableFilters>(`filters:${year}_${league}`).then((f) => f ?? null),
  filtersSet: (year: number, league: string, filters: TableFilters) => set(`filters:${year}_${league}`, filters),

  // Recently viewed draft years (most recent first, capped), for the year picker.
  recentYearsGet: (): Promise<number[]> => get<number[]>('recentDraftYears').then((a) => a ?? []),
  recentYearsSet: (years: number[]) => set('recentDraftYears', years.slice(0, 8)),

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
