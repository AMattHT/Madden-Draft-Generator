import { PlayerLookupService } from './PlayerLookupService';
import { TeamService, PickEnrichment } from './TeamService';
import { CuratedDbPositions } from './CuratedDbPositions';
import { GenericFillerService } from './GenericFillerService';
import { CombineService } from './CombineService';
import { BaselinePlayer } from '../types/player';

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
      const label = curated ?? e?.positionLabel ?? null;

      // Combine (2000+): official measured height/weight + testing numbers for ratings.
      const c = await CombineService.get(p.firstName, p.lastName, p.draftYear);

      // Accuracy priority — height/weight: combine (measured) > nflverse roster > CSV.
      const height = c?.heightInches ?? e?.heightInches ?? null;
      const weight = c?.weight ?? e?.weight ?? null;
      const age = e?.age ?? null; // real draft age

      if (!label && !c && height == null && weight == null && age == null) return p;
      const out: BaselinePlayer = { ...p };
      if (label) out.position = label;
      if (c) out.combine = { forty: c.forty, bench: c.bench, vertical: c.vertical, broad: c.broad, cone: c.cone, shuttle: c.shuttle };
      if (height != null) out.heightInches = height;
      if (weight != null) out.weight = weight;
      if (age != null) out.age = age;
      return out;
    })
  );
  // Pad to a full Madden-sized class with generated undrafted generics.
  const fillers = opts.fill ? GenericFillerService.build(year, real.length) : [];
  return { players: [...real, ...fillers], enrich, generatedCount: fillers.length };
}
