import { BaselinePlayer, FrontSevenInfo } from '../types/player';
import { NflverseCareerService } from './NflverseCareerService';
import { RosterPositionService } from './RosterPositionService';
import { SchemeService } from './SchemeService';
import { classifyFrontSeven, FrontSevenInput } from './FrontSevenClassifier';

/**
 * Resolves a linebacker-labeled source player to a Madden front-seven label:
 *   'DE'   -> edge (LEDG/REDG, side assigned later)
 *   'DT'   -> interior line (nflverse lists him DT/NT)
 *   'MIKE' | 'SAM' | 'WILL' -> pinned off-ball role
 *   null   -> no verdict; keep the source label and let the class-level
 *             build split (DraftClassBuilder.balanceLbByBuild) decide.
 *
 * Inputs are gathered from what the project already caches: nflverse
 * draft_picks (sacks / interceptions / games / drafting team), nflverse
 * players (PFF + roster position), and the defensive-scheme table. The
 * scheme is the drafting team's dominant base front over the player's first
 * five seasons (or to the end of a shorter career).
 */
const EARLY_CAREER_SEASONS = 5;
const INTERIOR = new Set(['DT', 'NT', 'DL']);
const EDGE_TEXT = new Set(['DE', 'LE', 'RE', 'EDGE']);
const FRONT_SEVEN_TEXT = new Set(['DE', 'LE', 'RE', 'EDGE', 'DT', 'NT', 'DL', 'LB', 'OLB', 'ILB', 'MLB', 'LOLB', 'ROLB', 'LILB', 'RILB']);

export interface FrontSevenResolution {
  label: string | null;
  frontSeven: FrontSevenInfo | null;
}

export const FrontSevenService = {
  /** `pickTeam` is the nflverse team code from the draft-pick join (year classes);
   *  when absent the drafting team comes from nflverse by name. */
  resolve(p: BaselinePlayer, pickTeam?: string | null): FrontSevenResolution {
    const raw = RosterPositionService.raw(p.firstName, p.lastName);
    // A same-name collision with a non-front-seven player must not steer the verdict.
    const nv = raw && FRONT_SEVEN_TEXT.has(raw.position) ? raw : null;
    if (nv && INTERIOR.has(nv.position) && nv.pffPosition !== 'ED' && nv.pffPosition !== 'LB') {
      return { label: 'DT', frontSeven: null };
    }

    const career = NflverseCareerService.get(p.firstName, p.lastName, p.draftYear, p.draftPick);
    const team = (pickTeam || career?.draftTeam || '').trim().toUpperCase() || null;
    const to = p.careerTo ?? career?.careerTo ?? null;
    const spanEnd = Math.min(p.draftYear + EARLY_CAREER_SEASONS - 1, to != null && to >= p.draftYear ? to : p.draftYear + EARLY_CAREER_SEASONS - 1);
    const scheme = team ? SchemeService.dominant(team, p.draftYear, spanEnd) : null;

    // nflverse's plain position text: a DE listing (or an EDGE NGS tag) is edge text.
    let nvPosition: string | null = nv ? nv.position : null;
    if (nv && (EDGE_TEXT.has(nv.position) || nv.ngsPosition === 'EDGE')) nvPosition = 'DE';

    const seasons = p.seasonsStarted ?? career?.seasonsStarted ?? null;
    const input: FrontSevenInput = {
      label: p.position,
      draftYear: p.draftYear,
      sacks: career?.defSacks ?? null,
      ints: career?.defInts ?? null,
      seasonsStarted: seasons,
      games: career?.games ?? null,
      scheme,
      weight: p.weight ?? career?.weight ?? null,
      pffPosition: nv ? nv.pffPosition || null : null,
      nvPosition,
    };
    // A DE listing with no PFF veto is an edge outright (pre-PFF players listed DE in nflverse).
    const listedEdge = nvPosition === 'DE' && input.pffPosition !== 'LB' && p.draftYear >= 1972;
    const v = listedEdge ? { role: 'EDGE' as const, reason: 'nflverse' as const, lock: true } : classifyFrontSeven(input);

    const seasonsForRate = seasons != null && seasons >= 1 ? seasons : career?.games ? career.games / 16 : null;
    const sackRate = career?.defSacks != null && seasonsForRate && seasonsForRate >= 3 ? Math.round((career.defSacks / seasonsForRate) * 10) / 10 : null;
    const info: FrontSevenInfo = { role: v.role, reason: v.reason, lock: v.lock, scheme, team, sackRate };
    const label = v.role === 'EDGE' ? 'DE' : v.role; // MIKE / SAM / WILL map straight to Madden ids
    return { label: label ?? null, frontSeven: info };
  },
};
