import { gearSlots, RATING_KEYS } from './DraftClassBuilder';
import { ReferenceDraftService } from './ReferenceDraftService';
import { RatingService } from './RatingService';
import { DbPositionService } from './DbPositionService';
import { PositionMapper } from './PositionMapper';
import { PersonaService } from './PersonaService';
import { LookupService } from './LookupService';
import { LikenessService } from './LikenessService';
import { commentaryIdFor, focusFor, genericHeadPid } from './M27Fields';
import type { GeneratedRosterPlayer, RosterMode } from '../types/roster';

const CACHE_MAX = 200;
const cache = new Map<string, GeneratedRosterPlayer>();


const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Rate one pool player for a roster: the entry-year draft-class pipeline under the selected lens
 *  for Madden 27, then the roster-only extras (age as a veteran, persona, announcer id). */
export const RosterAddService = {
  async generate(key: string, mode: RosterMode = 'retro'): Promise<GeneratedRosterPlayer> {
    const cacheKey = `${key}|${mode}|${DbPositionService.isReady()}`;
    const hit = cache.get(cacheKey);
    if (hit) return hit;
    const { player, prospect, degraded } = await ReferenceDraftService.player(key, mode);
    const p = prospect as Record<string, unknown>;
    const positionId = num(p.position);
    const position = PositionMapper.name(positionId);
    const overall = num(p.overall);
    const devTrait = num(p.devTrait);
    const seed = `${player.firstName}|${player.lastName}`;
    const peps = str(p.PEPS);
    const visuals = (p.visuals ?? {}) as { genericHeadName?: string; skinTone?: number };
    const isScan = !!peps && !/^gen_/i.test(peps);
    // A scan player still gets a tone-matched generic head for the blob's GENR.
    const generic = visuals.genericHeadName
      ? { peps: visuals.genericHeadName, skinTone: visuals.skinTone ?? 4 }
      : LikenessService.generic(player, 0, 'm27');
    const toneMatch = /^gen_(\d+)/i.exec(generic.peps);
    const ratings: Record<string, number> = {};
    for (const k of RATING_KEYS) ratings[k] = Math.max(0, Math.min(99, Math.round(num(p[k]))));
    const draftAge = num(player.age, num(p.age, 22));
    // buildProspects has not run assignM27Fields: ordinary generic heads still
    // have PID 0 here. Keep any real/legend portrait, otherwise use the head's.
    const portraitPid = num(p.PID) || genericHeadPid(generic.peps);
    const out: GeneratedRosterPlayer = {
      key,
      degraded,
      wav: player.wavSource === 'predicted' ? RatingService.predictedWav(player) : player.wav,
      wavSource: player.wavSource,
      firstName: str(p.firstName) || player.firstName,
      lastName: str(p.lastName) || player.lastName,
      positionId, position,
      archetypeId: num(p.archetype), archetype: LookupService.idToName('archetype', num(p.archetype)) || null,
      collegeId: num(p.college), college: LookupService.idToName('college', num(p.college)) || null,
      hometown: str(p.homeTown), homeStateId: num(p.homeState),
      age: Math.max(22, Math.min(40, Math.round(draftAge + 4))), yearsPro: 4,
      heightInches: num(p.heightInches, 72), weight: num(p.weight, 200), jersey: num(p.jerseyNum),
      overall, devTrait,
      draftYear: player.draftYear, draftRound: num(p.draftRound, 63), draftPick: num(p.draftPick),
      ratings,
      assetName: isScan ? peps : '',
      genericHead: generic.peps,
      skinTone: Math.max(1, Math.min(8, toneMatch ? Number(toneMatch[1]) : num(generic.skinTone, 4))),
      bodyType: str(p.bodyType) || 'Standard',
      gear: gearSlots(p),
      personaDNA: PersonaService.dnaFor(seed, PositionMapper.groupFromId(positionId), overall, devTrait).slice(0, 5),
      focus: focusFor(`${seed}|0`),
      commentaryId: commentaryIdFor(player.lastName),
      portraitPid,
      portrait: portraitPid ? `/api/portrait/pid/${portraitPid}` : null,
    };
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(`${key}|${mode}|${!degraded}`, out);
    return out;
  },

  _reset(): void { cache.clear(); ReferenceDraftService._reset(); },
};
