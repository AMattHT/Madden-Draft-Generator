import { PlayerLookupService } from './PlayerLookupService';
import { TeamService, PickEnrichment } from './TeamService';
import { CuratedDbPositions } from './CuratedDbPositions';
import { GenericFillerService } from './GenericFillerService';
import { CombineService } from './CombineService';
import { PositionMapper } from './PositionMapper';
import { RosterPositionService } from './RosterPositionService';
import { BaselinePlayer } from '../types/player';

// The generic "LB" bucket in ALL_PLAYER_LOOKUP that nflverse can reclassify.
const LB_BUCKET = /^(LB|MLB|ILB|OLB|LOLB|ROLB)$/i;

/**
 * Generic-face skin tone (Race: 1=White, 5=Hispanic, 7=Black) inferred from
 * position when the player has no ethnicity on record. It's ONLY a fallback so a
 * generic-face rookie (e.g. the 2026 class, all blank) matches the overwhelming
 * NFL positional demographics instead of a flat mid-tone — the actual value wins
 * whenever it's known. Positions that are genuinely mixed stay neutral.
 */
function positionDefaultRace(label: string | null | undefined): number {
  const group = PositionMapper.groupFromId(PositionMapper.toM26Id(label ?? ''));
  if (['WR', 'RB', 'CB', 'S', 'LB', 'EDGE', 'IDL'].includes(group)) return 7; // Black-dominant
  if (['K', 'P', 'LS'].includes(group)) return 2; // predominantly white specialists
  if (group === 'OL') return 3; // O-line leans white
  return 4; // QB / TE / unknown -> neutral mid-tone
}

/**
 * Baseline players for a draft year with DB positions corrected BEFORE generation
 * (curated pre-2001 list > nflverse depth-chart/roster), plus the per-pick team
 * enrichment map. Shared by the preview (/generated) and export (/mdc) routes so
 * the exported .mdc matches exactly what the UI shows. Overridden players are
 * cloned so the shared lookup cache isn't mutated.
 */
export async function enrichedClass(
  year: number,
  league: string,
  opts: { fill?: boolean } = {}
): Promise<{ players: BaselinePlayer[]; enrich: Map<number, PickEnrichment>; generatedCount: number }> {
  const baseline = PlayerLookupService.byYear(year, league);
  const enrich = await TeamService.byYear(year);
  const real = await Promise.all(
    baseline.map(async (p) => {
      const e = enrich.size && p.draftPick != null ? enrich.get(p.draftPick) : undefined;
      const curated = CuratedDbPositions.get(p.firstName, p.lastName, p.draftYear);
      // Reclassify the generic linebacker bucket from nflverse's more specific
      // position (so "MLB" edge rushers like Ware/Taylor become OLB -> edge).
      const lbFix = LB_BUCKET.test(p.position.trim()) ? RosterPositionService.frontSeven(p.firstName, p.lastName) : null;
      const label = curated ?? e?.positionLabel ?? lbFix ?? null;

      // Combine (2000+): official measured height/weight + testing numbers for ratings.
      const c = await CombineService.get(p.firstName, p.lastName, p.draftYear);

      // Accuracy priority — height/weight: combine (measured) > nflverse roster > CSV.
      const height = c?.heightInches ?? e?.heightInches ?? null;
      const weight = c?.weight ?? e?.weight ?? null;
      const age = e?.age ?? null; // real draft age
      // Fill a plausible skin tone for generic faces when ethnicity is unknown.
      const race = p.race == null ? positionDefaultRace(label ?? p.position) : null;

      if (!label && !c && height == null && weight == null && age == null && race == null) return p;
      const out: BaselinePlayer = { ...p };
      if (label) out.position = label;
      if (c) out.combine = { forty: c.forty, bench: c.bench, vertical: c.vertical, broad: c.broad, cone: c.cone, shuttle: c.shuttle };
      if (height != null) out.heightInches = height;
      if (weight != null) out.weight = weight;
      if (age != null) out.age = age;
      if (race != null) out.race = race;
      return out;
    })
  );
  // Pad to a full Madden-sized class with generated undrafted generics.
  const fillers = opts.fill ? GenericFillerService.build(year, real.length) : [];
  return { players: [...real, ...fillers], enrich, generatedCount: fillers.length };
}
