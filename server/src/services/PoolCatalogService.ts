import { PlayerLookupService, type CatalogPlayer } from './PlayerLookupService';
import { PositionMapper } from './PositionMapper';
import { TeamDraftService } from './TeamDraftService';
import { RatingService } from './RatingService';
import { enrichAcrossYears } from './DraftEnrichment';
import { GenericFillerService } from './GenericFillerService';
import { draftPositions } from './DraftClassBuilder';
import { referenceLeague } from './ReferenceDraftService';
import { DbPositionService } from './DbPositionService';
import type { TeamInfo } from './TeamService';

interface CatalogSnapshot { players: CatalogPlayer[]; degraded: boolean }
let cache: Promise<CatalogSnapshot> | null = null;
let ready = false;

/** Shared career inputs and the default entry-year draft's positions, including its 402-player cap. */
export const PoolCatalogService = {
  balanced(): Promise<CatalogPlayer[]> {
    return this.snapshot().then(result => result.players);
  },
  snapshot(): Promise<CatalogSnapshot> {
    const nowReady = DbPositionService.isReady();
    if (ready !== nowReady) { cache = null; ready = nowReady; }
    if (!cache) {
      const pending = build().then(players => ({ players, degraded: !nowReady })).catch(e => {
        if (cache === pending) cache = null;
        throw e;
      });
      cache = pending;
    }
    return cache;
  },
  async positionId(key: string): Promise<number | null> {
    const row = (await this.balanced()).find(p => p.key === key);
    return row ? PositionMapper.idOfName(row.mpos) : null;
  },
  _reset(): void { cache = null; },
};

async function build(): Promise<CatalogPlayer[]> {
  const rows = PlayerLookupService.catalog();
  const teams = await TeamDraftService.draftTeams().catch(() => new Map<string, { team: TeamInfo }>());
  const raw = PlayerLookupService.byKeys(rows.map(r => r.key)).players;
  // No photo downloads or face generation are needed for the pool's rating inputs.
  const players = await enrichAcrossYears(raw, true);
  const byKey = new Map(players.map(p => [p.key!, p]));
  const positions = new Map<string, number>();
  const groups = new Map<string, typeof players>();
  for (const p of players) {
    const league = referenceLeague(p);
    const id = `${p.draftYear}|${league}`;
    if (!groups.has(id)) groups.set(id, PlayerLookupService.byYear(p.draftYear, league).map(r => byKey.get(r.key!)!));
  }
  for (const [id, real] of groups) {
    const year = Number(id.split('|')[0]);
    const cohort = [...real, ...GenericFillerService.build(year, real)];
    const { capped, posIds } = draftPositions(cohort);
    const assigned = new Map(capped.map((p, i) => [p.key, posIds[i]]));
    for (const p of real) {
      if (`${p.draftYear}|${referenceLeague(p)}` !== id) continue;
      let posId = assigned.get(p.key);
      if (posId == null) {
        const idx = cohort.indexOf(p);
        const forced = draftPositions(cohort, { include: [idx] });
        posId = forced.posIds[forced.keptIdx.indexOf(idx)];
      }
      positions.set(p.key!, posId);
    }
  }
  return rows.map(r => {
    const p = byKey.get(r.key)!;
    const posId = positions.get(r.key)!;
    return { ...r, mpos: PositionMapper.name(posId), grp: PositionMapper.groupFromId(posId),
      wav: p.wavSource === 'predicted' ? RatingService.predictedWav(p) : p.wav, wavSource: p.wavSource,
      cal: RatingService.caliber(p, posId), hof: p.isHOF, pb: p.proBowls ?? 0, ap1: p.allPro1 ?? 0,
      team: teams.get(r.key)?.team ?? null };
  });
}
