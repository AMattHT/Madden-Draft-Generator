import { enrichedClass } from './DraftEnrichment';
import { DraftClassBuilder } from './DraftClassBuilder';
import { PlayerLookupService } from './PlayerLookupService';
import { DbPositionService } from './DbPositionService';
import type { BaselinePlayer } from '../types/player';
import type { RosterMode } from '../types/roster';

/** Match the default year-class league, retaining players excluded by dual-draft deduplication. */
export function referenceLeague(p: BaselinePlayer): string {
  if (p.draftYear >= 1960 && p.draftYear <= 1966 && PlayerLookupService.byYear(p.draftYear, 'combined').some(r => r.key === p.key)) return 'combined';
  return p.league;
}

async function build(year: number, league: string, mode: RosterMode) {
  const { players, positionsReady } = await enrichedClass(year, league, { fill: true });
  const result = DraftClassBuilder.buildProspects(players, mode, {}, 'm27');
  return { players, result, positionsReady, byKey: new Map(result.sourceIndices.map((idx, i) => [players[idx].key, i])) };
}
const cache = new Map<string, ReturnType<typeof build>>();

/** Use the whole entry-year class: Realistic ranks must never come from a one-player board. */
export const ReferenceDraftService = {
  async player(key: string, mode: RosterMode) {
    const raw = PlayerLookupService.byKeys([key]).players[0];
    if (!raw) throw new Error(`player ${key} is not in the pool`);
    const league = referenceLeague(raw);
    const cacheKey = `${raw.draftYear}|${league}|${mode}|${DbPositionService.isReady()}`;
    let pending = cache.get(cacheKey);
    if (!pending) {
      if (cache.size >= 8) cache.delete(cache.keys().next().value!);
      pending = build(raw.draftYear, league, mode).catch(e => { cache.delete(cacheKey); throw e; });
      cache.set(cacheKey, pending);
    }
    const cohort = await pending;
    const idx = cohort.players.findIndex(p => p.key === key);
    if (idx < 0) throw new Error(`player ${key} is not in his reference class`);
    const existing = cohort.byKey.get(key);
    // Older drafts can exceed 402 slots. Use exactly the draft editor's Include behavior.
    const result = existing != null ? cohort.result : DraftClassBuilder.buildProspects(cohort.players, mode, { include: [idx] }, 'm27');
    const prospectIndex = existing ?? result.sourceIndices.indexOf(idx);
    return { player: cohort.players[idx], prospect: result.prospects[prospectIndex], degraded: !cohort.positionsReady };
  },
  _reset() { cache.clear(); },
};
