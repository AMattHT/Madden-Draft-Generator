import { type BaselinePlayer, type FrontSevenInfo, nflversePick } from '../types/player';
import { CuratedDbPositions } from './CuratedDbPositions';
import { FrontSevenService } from './FrontSevenService';
import { PositionMapper } from './PositionMapper';
import { NflverseCareerService } from './NflverseCareerService';

const LB_BUCKET = /^(LB|MLB|ILB|OLB|LOLB|ROLB)$/i;
const END_LABEL = /^(DE|LE|RE|E|LDE|RDE|DEFENSIVEEND)$/i;

export interface PositionLabel {
  /** The source label after the corrections (a Madden label, or the raw one when nothing applied). */
  label: string;
  /** The weight the rules used: nflverse first, else the draft table's. */
  weight: number | null;
  /** The slot came from real data (curation, a depth chart, a pinned role) and must survive cohort balancing. */
  locked: boolean;
  frontSeven: FrontSevenInfo | null;
}

/**
 * The position steps of enrichment that need no per-year join, shared by the pool
 * listing and the rating path so both show the same position: the curated
 * defensive-back entry, the front-seven classifier (3-4 rushers to edge, off-ball
 * backers to SAM/MIKE/WILL), the pre-2001 corner/safety split by build, and the
 * heavy-end sack rule (a 290-299 lb end who rushed like an edge stays outside).
 * `chartLabel` (a 2001+ depth-chart slot) and `pickTeam` come from the year-class
 * join and are absent for the pool.
 */
export function positionLabelFor(p: BaselinePlayer, chartLabel?: string | null, pickTeam?: string | null, measuredWeight?: number | null): PositionLabel {
  const source = (p.position || '').trim();
  const curated = CuratedDbPositions.get(p.firstName, p.lastName, p.draftYear);
  const f7 = LB_BUCKET.test(source) || FrontSevenService.pinnedRole(p) ? FrontSevenService.resolve(p, pickTeam) : null;
  // A depth-chart slot never moves a quarterback or a specialist to the line or the
  // secondary (Hail-Mary and hands-team packages list QBs at LCB / WR).
  const chart = chartLabel && /^(QB|K|P|LS)$/i.test(source) ? null : chartLabel ?? null;
  const dbSplit = !curated && !chart && p.draftYear < 2001 ? PositionMapper.dbByBuild(p.position, p.weight, p.draftYear) : null;
  const nv = NflverseCareerService.get(p.firstName, p.lastName, p.draftYear, nflversePick(p));
  // Measured (combine, then the pick join) beats nflverse beats the draft table, as the rating path has it.
  const weight = measuredWeight ?? nv?.weight ?? p.weight ?? null;
  let label = curated ?? chart ?? f7?.label ?? dbSplit ?? source;
  // A 290+ lb end is an interior lineman in Madden terms (PositionMapper sends a
  // heavy DE to DT) unless he rushed like an edge: J.J. Watt (290, 20 sacks a
  // season) is an edge, Cam Heyward (295, ~6) a DT. 300+ stays interior regardless.
  if (END_LABEL.test(label) && weight != null && weight >= 290 && weight < 300 && nv?.defSacks != null) {
    const seasons = (p.seasonsStarted ?? nv.seasonsStarted ?? null) || (nv.games ? nv.games / 16 : null);
    if (seasons && seasons >= 3 && nv.defSacks / seasons >= 7) label = 'EDGE';
  }
  return { label, weight, locked: !!(curated || chart || f7?.frontSeven?.lock), frontSeven: f7?.frontSeven ?? null };
}
