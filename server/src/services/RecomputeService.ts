import { gameOverall, reconcileToTarget } from './AttributeModel';

export interface RecomputeItem {
  id: number;
  positionId: number;
  archetype: number;
  ratings: Record<string, number>;
  /** Legacy edit target: reconcile the attributes to it first (what the export does). */
  overall?: number;
}

export interface RecomputeResult {
  id: number;
  overall: number | null;
  archetype: number;
}

/**
 * Madden recomputes a prospect's overall from his attributes on import, so the
 * board must show that number for edited players. Pure, microseconds per item.
 */
export function recomputeBatch(items: RecomputeItem[], gameVersion: 'm26' | 'm27'): RecomputeResult[] {
  return items.map((it) => {
    const posId = Number(it.positionId) || 0;
    const archetype = Number(it.archetype) || 0;
    const ratings: Record<string, number> = {};
    for (const [k, v] of Object.entries(it.ratings ?? {})) {
      const n = Number(v);
      if (Number.isFinite(n)) ratings[k] = Math.max(0, Math.min(99, Math.round(n)));
    }
    if (it.overall != null && Number.isFinite(Number(it.overall))) {
      reconcileToTarget(ratings, posId, archetype, Number(it.overall), gameVersion);
    }
    const g = gameOverall(ratings, posId, archetype, gameVersion);
    return { id: Number(it.id), overall: g.overall, archetype: g.archetype };
  });
}
