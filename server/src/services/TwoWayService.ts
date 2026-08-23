import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../config/paths';
import { PositionMapper } from './PositionMapper';
import { NflverseCareerService } from './NflverseCareerService';

/**
 * Two-way players. Madden holds one position per player, so a player's other
 * role has to live in his ratings: the depth chart rates every player at every
 * position from the attributes, and a QB with 85 kick power is a usable punter.
 *
 * Three sources of secondary roles:
 *   - career totals (nflverse draft_picks, 1980+): 30+ receptions for a
 *     non-receiver, 3+ interceptions for an offensive player, 100+ carries for a
 *     non-back — Deion and Troy Brown qualify, J.J. Watt's three catches at tight
 *     end do not;
 *   - a curated, verified list for the years before the data
 *     (data/lookups/two-way-players.json): Baugh punted and played safety, Blanda
 *     kicked, Bednarik snapped — and kicking/punting, which no table records;
 *   - the era: through 1949 (single-platoon football, free substitution came in
 *     1949-50) every player also played the mirrored side, so a 1940s class gets
 *     competence both ways — ends at defensive back / end, backs at safety, the
 *     line at the other line, quarterbacks at safety.
 *
 * The secondary role's core ratings are floored at overall minus a gap (kickers
 * close, everyone else a step below), then the primary overall is re-solved.
 */

/** Last season of single-platoon football. */
export const TWO_WAY_ERA_END = 1949;

/** Mirror role by position group, for the era rule (Madden labels). */
const MIRROR: Record<string, string> = {
  QB: 'FS', RB: 'SS', WR: 'CB', TE: 'LEDG', OL: 'DT', IDL: 'LG', EDGE: 'TE', LB: 'FB', CB: 'WR', S: 'HB', K: '', P: '', LS: '',
};

/** Core ratings of each secondary role and how far below the overall they sit. */
const ROLE_CORE: Record<string, { attrs: string[]; gap: number }> = {
  K: { attrs: ['kickPower', 'kickAccuracy'], gap: 4 },
  P: { attrs: ['kickPower', 'kickAccuracy'], gap: 4 },
  FS: { attrs: ['zoneCoverage', 'manCoverage', 'playRecognition', 'tackle', 'pursuit'], gap: 8 },
  SS: { attrs: ['zoneCoverage', 'manCoverage', 'playRecognition', 'tackle', 'pursuit', 'hitPower'], gap: 8 },
  CB: { attrs: ['manCoverage', 'zoneCoverage', 'pressCoverage', 'playRecognition', 'tackle'], gap: 8 },
  WR: { attrs: ['catching', 'shortRouteRunning', 'mediumRouteRunning', 'deepRouteRunning', 'release', 'catchInTraffic'], gap: 10 },
  TE: { attrs: ['catching', 'runBlock', 'passBlock', 'shortRouteRunning', 'impactBlocking'], gap: 10 },
  HB: { attrs: ['carrying', 'ballCarrierVision', 'breakTackle', 'jukeMove', 'trucking', 'stiffArm'], gap: 10 },
  FB: { attrs: ['leadBlock', 'impactBlocking', 'carrying', 'trucking', 'runBlock'], gap: 10 },
  QB: { attrs: ['throwPower', 'throwAccuracyShort', 'throwAccuracyMid', 'throwAccuracyDeep', 'throwOnTheRun', 'playAction'], gap: 12 },
  C: { attrs: ['runBlock', 'passBlock', 'runBlockPower', 'passBlockPower', 'impactBlocking', 'strength'], gap: 10 },
  LG: { attrs: ['runBlock', 'passBlock', 'runBlockPower', 'passBlockPower', 'impactBlocking', 'strength'], gap: 10 },
  LT: { attrs: ['runBlock', 'passBlock', 'runBlockFinesse', 'passBlockFinesse', 'impactBlocking', 'strength'], gap: 10 },
  DT: { attrs: ['blockShedding', 'powerMoves', 'tackle', 'strength', 'pursuit'], gap: 10 },
  LEDG: { attrs: ['blockShedding', 'finesseMoves', 'powerMoves', 'tackle', 'pursuit'], gap: 10 },
  REDG: { attrs: ['blockShedding', 'finesseMoves', 'powerMoves', 'tackle', 'pursuit'], gap: 10 },
  MIKE: { attrs: ['tackle', 'pursuit', 'playRecognition', 'hitPower', 'blockShedding', 'zoneCoverage'], gap: 9 },
  SAM: { attrs: ['tackle', 'pursuit', 'playRecognition', 'hitPower', 'blockShedding'], gap: 9 },
  WILL: { attrs: ['tackle', 'pursuit', 'playRecognition', 'zoneCoverage', 'hitPower'], gap: 9 },
};
const ALIAS: Record<string, string> = { S: 'FS', DB: 'CB', DE: 'LEDG', LB: 'MIKE', G: 'LG', OT: 'LT', RG: 'LG', RT: 'LT', E: 'TE' };

interface Curated { roles: string[]; note?: string }
let curated: Map<string, Curated> | null = null;
function load(): Map<string, Curated> {
  if (curated) return curated;
  curated = new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'two-way-players.json'), 'utf8'));
    for (const [k, v] of Object.entries(raw.players ?? {})) curated.set(k, v as Curated);
  } catch { /* no list */ }
  return curated;
}
const key = (first: string, last: string, year: number) => `${first} ${last}`.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim() + `|${year}`;

export interface TwoWayInfo { roles: string[]; source: 'curated' | 'era' | 'stats'; note?: string }

/** First draft year with career totals in nflverse draft_picks. */
const DATA_FROM = 1980;
/** Career totals that prove a secondary role was real, not a package: Deion's 60
 *  catches and Troy Brown's 3 interceptions qualify; J.J. Watt's 3 receptions at
 *  tight end do not. */
const DATA_THRESHOLDS = { receptions: 30, defInts: 3, rushAtts: 100 };

export const TwoWayService = {
  /** Secondary roles for a player at his resolved primary position, or null. */
  rolesFor(first: string, last: string, draftYear: number, primaryPosId: number, draftPick?: number | null): TwoWayInfo | null {
    const primary = PositionMapper.name(primaryPosId);
    const group = PositionMapper.groupFromId(primaryPosId);
    const roles = new Set<string>();
    let source: 'curated' | 'era' | 'stats' = 'era';
    let note: string | undefined;
    if (draftYear >= DATA_FROM) {
      // Modern players: only what the career totals prove.
      const c = NflverseCareerService.get(first, last, draftYear, draftPick ?? undefined);
      if (c) {
        const offense = ['QB', 'RB', 'WR', 'TE', 'OL'].includes(group);
        const parts: string[] = [];
        if (!['WR', 'TE', 'RB'].includes(group) && (c.receptions ?? 0) >= DATA_THRESHOLDS.receptions) { roles.add(group === 'OL' || group === 'IDL' || group === 'EDGE' ? 'TE' : 'WR'); parts.push(`${c.receptions} receptions`); }
        if (offense && (c.defInts ?? 0) >= DATA_THRESHOLDS.defInts) { roles.add(group === 'QB' || group === 'TE' || group === 'OL' ? 'FS' : 'CB'); parts.push(`${c.defInts} interceptions`); }
        if (!['RB', 'QB'].includes(group) && (c.rushAtts ?? 0) >= DATA_THRESHOLDS.rushAtts) { roles.add('HB'); parts.push(`${c.rushAtts} carries`); }
        if (parts.length) { source = 'stats'; note = `Career: ${parts.join(', ')}`; }
      }
    } else {
      const hit = load().get(key(first, last, draftYear));
      if (hit) {
        for (const r of hit.roles) { const n = ALIAS[r] ?? r; if (ROLE_CORE[n] && n !== primary) roles.add(n); }
        source = 'curated';
        note = hit.note;
      }
    }
    if (draftYear <= TWO_WAY_ERA_END) {
      const mirror = MIRROR[group] ?? '';
      if (mirror && mirror !== primary && ROLE_CORE[mirror]) roles.add(mirror);
    }
    roles.delete(primary);
    if (!roles.size) return null;
    return { roles: [...roles], source, note };
  },

  /** Floor the secondary roles' core ratings at overall minus the role's gap. */
  apply(attrs: Record<string, number>, roles: string[], overall: number): void {
    for (const r of roles) {
      const core = ROLE_CORE[r];
      if (!core) continue;
      const floor = Math.max(40, Math.min(95, overall - core.gap));
      for (const a of core.attrs) if ((Number(attrs[a]) || 0) < floor) attrs[a] = floor;
    }
  },

  roleCore(role: string): string[] {
    return ROLE_CORE[role]?.attrs ?? [];
  },
};
