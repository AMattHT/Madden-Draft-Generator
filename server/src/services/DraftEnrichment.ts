import { PlayerLookupService } from './PlayerLookupService';
import { TeamService, PickEnrichment } from './TeamService';
import { CuratedDbPositions } from './CuratedDbPositions';
import { GenericFillerService } from './GenericFillerService';
import { CombineService } from './CombineService';
import { PositionMapper } from './PositionMapper';
import { FrontSevenService } from './FrontSevenService';
import { SkinToneService } from './SkinToneService';
import { DerivedSkinToneService } from './DerivedSkinToneService';
import { WikiSkinToneService } from './WikiSkinToneService';
import { toneFromEvidence } from './SkinToneClassify';
import { NflverseCareerService } from './NflverseCareerService';
import { PhotoLookService } from './PhotoLookService';
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
  // Reclassify the generic linebacker bucket: 3-4 OLB pass rushers become edges
  // (LEDG/REDG) and off-ball backers get a pinned SAM/MIKE/WILL where the career
  // signals (sacks, interceptions, scheme, PFF) support it.
  const f7 = LB_BUCKET.test(p.position.trim()) ? FrontSevenService.resolve(p, e?.team?.abbr) : null;
  // Pre-2001 defensive backs: no depth charts, so split corner vs safety by build.
  const dbSplit = !curated && !e?.positionLabel && p.draftYear < 2001 ? PositionMapper.dbByBuild(p.position, p.weight, p.draftYear) : null;
  const label = curated ?? e?.positionLabel ?? f7?.label ?? dbSplit ?? null;
  // A slot that came from real data (curation or a depth chart) must survive the
  // class-level cohort balancing.
  const positionLocked = !!(curated || e?.positionLabel);

  // Combine (2000+): official measured height/weight + testing numbers for ratings.
  const c = await CombineService.get(p.firstName, p.lastName, p.draftYear);

  const nv = NflverseCareerService.get(p.firstName, p.lastName, p.draftYear, p.draftPick);

  // Accuracy priority — height/weight: combine (measured) > pick-join > nflverse name > CSV.
  const height = c?.heightInches ?? e?.heightInches ?? nv?.heightInches ?? null;
  const weight = c?.weight ?? e?.weight ?? nv?.weight ?? null;
  const age = e?.age ?? nv?.age ?? null;
  // Skin tone for generic faces (and the generic portrait of a scan with no
  // portrait left): calibrated portrait evidence weighed against the position/era
  // prior — SkinToneClassify.toneFromEvidence. A legends portrait (vintage photo,
  // Namath reads as dark) is tempered; a Wikipedia tone and an explicit CSV race
  // are weak extra evidence. No more "ignore a light reading at a dark position"
  // (that made Keith Brooking tone 7).
  const prior = SkinToneService.toneDistribution(label ?? p.position, p.draftYear);
  const portrait = DerivedSkinToneService.itaForPid(p.photoId);
  // The wiki tone was read from the row's Wikipedia photo; if that photo was
  // sanitized away (icon, or another same-named player's picture) the tone goes too.
  const wiki = p.wikiImageUrl ? WikiSkinToneService.toneFor(p.firstName, p.lastName, p.draftYear) : null;
  const trusted = p.race != null && p.race !== 7 ? p.race : null;
  const race = toneFromEvidence({ ita: portrait?.ita ?? null, legendPortrait: portrait?.legend, wikiTone: wiki, trustedCsv: trusted, prior });

  if (!label && !c && height == null && weight == null && age == null && race == null && !nv && !f7?.frontSeven) {
    const photo = await PhotoLookService.resolvePhoto(p);
    if (!photo) return p;
    const out: BaselinePlayer = { ...p };
    if (!out.headshotUrl && !out.pfrImageUrl && !out.wikiImageUrl) out.wikiImageUrl = photo;
    out.observedGear = await PhotoLookService.observe(out);
    return out;
  }
  const out: BaselinePlayer = { ...p };
  if (label) out.position = label;
  // A 290+ lb end is an interior lineman in Madden terms (PositionMapper sends a
  // heavy DE to DT) — unless he rushed like an edge. J.J. Watt (290, 20 sacks a
  // season) is a RE/LE in the game, Cam Heyward (295, ~6) a DT. 'EDGE' bypasses
  // the weight rule; 300+ stays interior whatever the production.
  const endLabel = /^(DE|LE|RE|E|LDE|RDE|DEFENSIVEEND)$/i.test((out.position || '').trim());
  if (endLabel && weight != null && weight >= 290 && weight < 300 && nv?.defSacks != null) {
    const seasons = (out.seasonsStarted ?? nv.seasonsStarted ?? null) || (nv.games ? nv.games / 16 : null);
    if (seasons && seasons >= 3 && nv.defSacks / seasons >= 7) out.position = 'EDGE';
  }
  if (positionLocked) out.positionLocked = true;
  if (f7?.frontSeven) out.frontSeven = f7.frontSeven;
  if (c) out.combine = { forty: c.forty, bench: c.bench, vertical: c.vertical, broad: c.broad, cone: c.cone, shuttle: c.shuttle };
  if (height != null) out.heightInches = height;
  if (weight != null) out.weight = weight;
  if (age != null) out.age = age;
  if (race != null) out.race = race;
  if (nv) {
    // A current-year rookie's nflverse w_av is one season (or a 0 placeholder):
    // not a career signal. Leave those on the draft-slot estimate.
    const currentRookie = p.draftYear >= new Date().getFullYear() - 1;
    if (out.wav == null && nv.wav != null && !currentRookie) {
      out.wav = nv.wav;
      out.wavSource = 'actual';
    }
    if (!(out.proBowls) && nv.proBowls) out.proBowls = nv.proBowls;
    if (!(out.allPro1) && nv.allPro1) out.allPro1 = nv.allPro1;
    if (!(out.seasonsStarted) && nv.seasonsStarted) out.seasonsStarted = nv.seasonsStarted;
    if (out.careerTo == null && nv.careerTo != null) out.careerTo = nv.careerTo;
    if (!out.isHOF && nv.isHOF) out.isHOF = true;
    if (!out.headshotUrl && nv.headshotUrl) out.headshotUrl = nv.headshotUrl;
  }
  const photo = await PhotoLookService.resolvePhoto(out);
  if (photo && !out.headshotUrl && !out.pfrImageUrl && !out.wikiImageUrl) {
    out.wikiImageUrl = photo;
  }
  if (photo) {
    out.observedGear = await PhotoLookService.observe(out);
  }
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
  const fillers = opts.fill ? GenericFillerService.build(year, real) : [];
  return { players: [...real, ...fillers], enrich, generatedCount: fillers.length };
}

/** A "greats" class: the best players in history (by career greatness), enriched the
 *  same way as a year class but without a per-year team map. An optional draft-year
 *  `range` scopes it to a decade/era (the greatest players of that span). */
export async function allTimeGreatsClass(range?: { from: number; to: number }): Promise<{ players: BaselinePlayer[]; generatedCount: number }> {
  const baseline = PlayerLookupService.allTimeGreats(402, range);
  const players = await Promise.all(baseline.map((p) => enrichOne(p)));
  return { players, generatedCount: 0 };
}
