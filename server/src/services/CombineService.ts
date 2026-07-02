import fs from 'fs';
import path from 'path';
import { CACHE_DIR } from '../config/paths';
import { parseCsvFile, normalizeName } from '../util/csv';

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
      for (const r of rows) {
        const name = normalizeName(r.player_name);
        if (!name) continue;
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
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}

export const CombineService = {
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
