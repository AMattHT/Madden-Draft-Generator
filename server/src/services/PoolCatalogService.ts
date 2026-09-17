import { PlayerLookupService, type CatalogPlayer } from './PlayerLookupService';
import { PositionMapper, type BoardItem } from './PositionMapper';
import { positionLabelFor } from './PositionLabel';
import { TeamDraftService } from './TeamDraftService';
import { RatingService } from './RatingService';
import type { TeamInfo } from './TeamService';

let cache: Promise<CatalogPlayer[]> | null = null;

/**
 * The pool as the app serves it: every player with the club that drafted him and
 * his position balanced the way a draft class balances its cosmetic cohorts,
 * club by club, so a club's own draftees split LEDG/REDG (and the rest) evenly
 * rather than landing on one side by the luck of a pool-wide alternation.
 * Built once; a roster add pins the slot shown here.
 */
export const PoolCatalogService = {
  balanced(): Promise<CatalogPlayer[]> {
    if (!cache) cache = build().catch((e) => { cache = null; throw e; });
    return cache;
  },

  /** The pool's slot for a key (M26 position id), or null. */
  async positionId(key: string): Promise<number | null> {
    const row = (await this.balanced()).find((p) => p.key === key);
    return row ? PositionMapper.idOfName(row.mpos) : null;
  },

  _reset(): void { cache = null; },
};

async function build(): Promise<CatalogPlayer[]> {
  const rows = PlayerLookupService.catalog();
  const teams = await TeamDraftService.draftTeams().catch(() => new Map<string, { team: TeamInfo }>());
  const { players } = PlayerLookupService.byKeys(rows.map((r) => r.key));
  const byKey = new Map(players.map((p) => [p.key!, p]));
  // Each player's raw slot and what the balancer needs, in pool order.
  const items: BoardItem[] = [];
  const ids: number[] = [];
  for (const r of rows) {
    const p = byKey.get(r.key)!;
    const pos = positionLabelFor(p);
    items.push({ firstName: p.firstName, lastName: p.lastName, weight: pos.weight, positionLocked: pos.locked, frontSeven: pos.frontSeven });
    ids.push(PositionMapper.resolve(p.firstName, p.lastName, pos.label, pos.weight));
  }
  // Balance within each drafting club (undrafted and unknown clubs form one group).
  const groups = new Map<string, number[]>();
  rows.forEach((r, i) => {
    const k = teams.get(r.key)?.team.name ?? '';
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(i);
  });
  const out = ids.slice();
  for (const idx of groups.values()) {
    const balanced = PositionMapper.balanceBoard(idx.map((i) => ids[i]), idx.map((i) => items[i]));
    idx.forEach((i, j) => { out[i] = balanced[j]; });
  }
  return rows.map((r, i) => {
    const posId = out[i];
    const p = byKey.get(r.key)!;
    return { ...r, mpos: PositionMapper.name(posId), grp: PositionMapper.groupFromId(posId), cal: RatingService.caliber(p, posId), team: teams.get(r.key)?.team ?? null };
  });
}
