import { PlayerLookupService } from './PlayerLookupService';
import { TeamService, PickEnrichment } from './TeamService';
import { CuratedDbPositions } from './CuratedDbPositions';
import { GenericFillerService } from './GenericFillerService';
import { CombineService } from './CombineService';
import { PositionMapper } from './PositionMapper';
import { RosterPositionService } from './RosterPositionService';
import { SkinToneService } from './SkinToneService';
import { DerivedSkinToneService } from './DerivedSkinToneService';
import { BaselinePlayer } from '../types/player';

// The generic "LB" bucket in ALL_PLAYER_LOOKUP that nflverse can reclassify.
const LB_BUCKET = /^(LB|MLB|ILB|OLB|LOLB|ROLB)$/i;

/**
 * Baseline players for a draft year with DB positions corrected BEFORE generation
 * (curated pre-2001 list > nflverse depth-chart/roster), plus the per-pick team
 * enrichment map. Shared by the preview (/generated) and export (/mdc) routes so
 * the exported .mdc matches exactly what the UI shows. Overridden players are
 * cloned so the shared lookup cache isn't mutated.
 */
/** Enrich one baseline player (position fix, combine, height/weight/age, skin tone).
 *  `e` is the per-pick team enrichment when available (year classes); omitted for
 *  cross-year sources like All-Time Greats. Returns the original object unchanged if
 *  nothing was added, so the shared lookup cache is never mutated. */
async function enrichOne(p: BaselinePlayer, e?: PickEnrichment): Promise<BaselinePlayer> {
  const curated = CuratedDbPositions.get(p.firstName, p.lastName, p.draftYear);
  // Reclassify the generic linebacker bucket from nflverse's more specific position
  // (so "MLB" edge rushers like Ware/Taylor become OLB -> edge).
  const lbFix = LB_BUCKET.test(p.position.trim()) ? RosterPositionService.frontSeven(p.firstName, p.lastName) : null;
  const label = curated ?? e?.positionLabel ?? lbFix ?? null;

  // Combine (2000+): official measured height/weight + testing numbers for ratings.
  const c = await CombineService.get(p.firstName, p.lastName, p.draftYear);

  // Accuracy priority — height/weight: combine (measured) > nflverse roster > CSV.
  const height = c?.heightInches ?? e?.heightInches ?? null;
  const weight = c?.weight ?? e?.weight ?? null;
  const age = e?.age ?? null; // real draft age
  // Skin tone for generic faces, best source first: derived portrait tone > explicit
  // non-7 CSV race > position-weighted guess. Only matters for players without an asset.
  const derived = DerivedSkinToneService.toneForPid(p.photoId);
  const trusted = p.race != null && p.race !== 7 ? p.race : null;
  const race = derived ?? trusted ?? SkinToneService.defaultRaceFor(label ?? p.position, `${p.firstName}|${p.lastName}|${p.draftYear}`);

  if (!label && !c && height == null && weight == null && age == null && race == null) return p;
  const out: BaselinePlayer = { ...p };
  if (label) out.position = label;
  if (c) out.combine = { forty: c.forty, bench: c.bench, vertical: c.vertical, broad: c.broad, cone: c.cone, shuttle: c.shuttle };
  if (height != null) out.heightInches = height;
  if (weight != null) out.weight = weight;
  if (age != null) out.age = age;
  if (race != null) out.race = race;
  return out;
}

/**
 * Baseline players for a draft year with DB positions corrected BEFORE generation
 * (curated pre-2001 list > nflverse depth-chart/roster), plus the per-pick team
 * enrichment map. Shared by the preview (/generated) and export (/mdc) routes so
 * the exported .mdc matches exactly what the UI shows.
 */
export async function enrichedClass(
  year: number,
  league: string,
  opts: { fill?: boolean } = {}
): Promise<{ players: BaselinePlayer[]; enrich: Map<number, PickEnrichment>; generatedCount: number }> {
  const baseline = PlayerLookupService.byYear(year, league);
  const enrich = await TeamService.byYear(year);
  const real = await Promise.all(
    baseline.map((p) => enrichOne(p, enrich.size && p.draftPick != null ? enrich.get(p.draftPick) : undefined))
  );
  // Pad to a full Madden-sized class with generated undrafted generics.
  const fillers = opts.fill ? GenericFillerService.build(year, real.length) : [];
  return { players: [...real, ...fillers], enrich, generatedCount: fillers.length };
}

/** An "All-Time Greats" class: the best players in history (by career greatness),
 *  enriched the same way as a year class but without a per-year team map. */
export async function allTimeGreatsClass(): Promise<{ players: BaselinePlayer[]; generatedCount: number }> {
  const baseline = PlayerLookupService.allTimeGreats(402);
  const players = await Promise.all(baseline.map((p) => enrichOne(p)));
  return { players, generatedCount: 0 };
}
