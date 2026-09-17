import { boardClass } from './DraftEnrichment';
import { DraftClassBuilder, gearSlots, RATING_KEYS } from './DraftClassBuilder';
import { PositionMapper } from './PositionMapper';
import { PersonaService } from './PersonaService';
import { LookupService } from './LookupService';
import { LikenessService } from './LikenessService';
import { commentaryIdFor, focusFor } from './M27Fields';
import { PoolCatalogService } from './PoolCatalogService';
import type { GeneratedRosterPlayer } from '../types/roster';

const CACHE_MAX = 200;
const cache = new Map<string, GeneratedRosterPlayer>();


const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Rate one pool player for a roster: the draft-class pipeline under the Career lens
 *  for Madden 27, then the roster-only extras (age as a veteran, persona, announcer id). */
export const RosterAddService = {
  async generate(key: string): Promise<GeneratedRosterPlayer> {
    const hit = cache.get(key);
    if (hit) return hit;
    const { players } = await boardClass([{ key }], { fill: false });
    const player = players[0];
    if (!player) throw new Error(`player ${key} is not in the pool`);
    // A one-player class cannot balance its cohorts, so the pool's slot is pinned.
    const pinned = await PoolCatalogService.positionId(key);
    const { prospects } = DraftClassBuilder.buildProspects([player], 'retro', pinned != null ? { pinPositions: new Map([[key, pinned]]) } : {}, 'm27');
    const p = prospects[0] as Record<string, unknown>;
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
    const out: GeneratedRosterPlayer = {
      key,
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
      portrait: num(p.PID) ? `/api/portrait/pid/${num(p.PID)}` : null,
    };
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(key, out);
    return out;
  },

  _reset(): void { cache.clear(); },
};
