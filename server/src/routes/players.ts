import { Router } from 'express';
import { PlayerLookupService } from '../services/PlayerLookupService';
import { TeamDraftService } from '../services/TeamDraftService';
import type { TeamInfo } from '../services/TeamService';

const r = Router();

/** Search all drafted players by name → their draft class. GET /api/players/search?q=&limit= */
r.get('/players/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || 40), 10)));
  res.json({ results: q ? PlayerLookupService.search(q, limit) : [] });
});

/** Every player in the pool as compact rows for the class builder (one fetch, ~3 MB),
 *  each with the club that drafted him when a source records it. */
r.get('/players/catalog', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const teams = await TeamDraftService.draftTeams().catch(() => new Map<string, { team: TeamInfo }>());
  res.json({ players: PlayerLookupService.catalog().map((p) => ({ ...p, team: teams.get(p.key)?.team ?? null })) });
});

export default r;
