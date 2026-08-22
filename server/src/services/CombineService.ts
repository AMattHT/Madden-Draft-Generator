import fs from 'fs';
import path from 'path';
import { CACHE_DIR } from '../config/paths';
import { parseCsvFile, normalizeName } from '../util/csv';
import { PositionMapper } from './PositionMapper';

/**
 * NFL Combine measurements + testing numbers from nflverse (combine.csv, 2000+).
 * Provides authoritative height/weight (the combine is officially measured, so it
 * fixes the ~half of players missing height in the local lookup) plus the testing
 * numbers used to derive athletic ratings. Joined by normalized name + draft year.
 */

export interface CombineData {
  heightInches: number | null;
  weight: number | null;
  forty: number | null; // 40-yard dash (s)
  bench: number | null; // 225lb reps
  vertical: number | null; // inches
  broad: number | null; // inches
  cone: number | null; // 3-cone (s)
  shuttle: number | null; // 20-yd shuttle (s)
}

const URL = 'https://github.com/nflverse/nflverse-data/releases/download/combine/combine.csv';
const CACHE_FILE = path.join(CACHE_DIR, 'nflverse_combine.csv');

interface RawRow {
  draft_year: string;
  season: string;
  player_name: string;
  pos: string;
  ht: string;
  wt: string;
  forty: string;
  bench: string;
  vertical: string;
  broad_jump: string;
  cone: string;
  shuttle: string;
}

const num = (s: string | undefined): number | null => {
  if (!s || s.trim() === '') return null;
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
};
/** "5-11" -> 71 inches; "" -> null. */
const htInches = (s: string | undefined): number | null => {
  if (!s || s.trim() === '') return null;
  const [ft, inch] = s.split('-').map((x) => parseInt(x, 10));
  return Number.isNaN(ft) || Number.isNaN(inch) ? null : ft * 12 + inch;
};

let byKey: Map<string, CombineData> | null = null;
let loading: Promise<void> | null = null;
// rating group -> drill -> ascending sorted values (for within-position percentiles)
let drillsByGroup: Map<string, Record<string, number[]>> | null = null;
const DRILLS = ['forty', 'bench', 'vertical', 'broad', 'cone', 'shuttle'] as const;
const LOWER_IS_BETTER = new Set(['forty', 'cone', 'shuttle']);

async function ensureLoaded(): Promise<void> {
  if (byKey) return;
  if (!loading) {
    loading = (async () => {
      if (!fs.existsSync(CACHE_FILE)) {
        const res = await fetch(URL, {
          headers: { 'User-Agent': 'MaddenDraftClassGenerator/0.1 (personal modding tool)' },
        });
        if (!res.ok) throw new Error(`nflverse combine fetch failed: HTTP ${res.status}`);
        fs.writeFileSync(CACHE_FILE, await res.text());
      }
      const rows = parseCsvFile<RawRow>(CACHE_FILE);
      const map = new Map<string, CombineData>();
      const drills = new Map<string, Record<string, number[]>>();
      for (const r of rows) {
        const name = normalizeName(r.player_name);
        if (!name) continue;
        // Per-position-group drill distributions (all combine years).
        const group = PositionMapper.groupFromLabel(r.pos);
        const g = drills.get(group) ?? Object.fromEntries(DRILLS.map((d) => [d, [] as number[]]));
        const vals: Record<string, number | null> = { forty: num(r.forty), bench: num(r.bench), vertical: num(r.vertical), broad: num(r.broad_jump), cone: num(r.cone), shuttle: num(r.shuttle) };
        for (const d of DRILLS) if (vals[d] != null) g[d].push(vals[d] as number);
        drills.set(group, g);
        const data: CombineData = {
          heightInches: htInches(r.ht),
          weight: num(r.wt) != null ? Math.round(num(r.wt)!) : null,
          forty: num(r.forty),
          bench: num(r.bench),
          vertical: num(r.vertical),
          broad: num(r.broad_jump),
          cone: num(r.cone),
          shuttle: num(r.shuttle),
        };
        const year = parseInt(r.draft_year, 10) || parseInt(r.season, 10);
        if (year) map.set(`${name}|${year}`, data);
        // also key by combine season as a fallback (undrafted / draft_year gaps)
        const season = parseInt(r.season, 10);
        if (season) map.set(`${name}|${season}`, data);
      }
      byKey = map;
      for (const g of drills.values()) for (const d of DRILLS) g[d].sort((a, b) => a - b);
      drillsByGroup = drills;
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}

export const CombineService = {
  /**
   * Where a drill result sits among combine participants of the same position
   * group (0 = worst, 1 = best; time drills inverted). Null until the combine
   * file is loaded or when the group has fewer than 20 results.
   */
  drillPercentile(group: string, drill: string, value: number): number | null {
    const g = drillsByGroup?.get(group) ?? drillsByGroup?.get('WR');
    const arr = g?.[drill];
    if (!arr || arr.length < 20) return null;
    // binary search for the count of values <= value
    let lo = 0, hi = arr.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] <= value) lo = mid + 1; else hi = mid; }
    const below = lo / arr.length;
    return LOWER_IS_BETTER.has(drill) ? 1 - below : below;
  },

  /** Combine data for a player by name + draft year, or undefined. Empty on failure. */
  async get(firstName: string, lastName: string, draftYear: number): Promise<CombineData | undefined> {
    try {
      await ensureLoaded();
    } catch {
      return undefined;
    }
    return byKey?.get(`${normalizeName(`${firstName} ${lastName}`)}|${draftYear}`);
  },
};
