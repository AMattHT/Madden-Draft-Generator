import { Router } from 'express';
import { PlayerLookupService } from '../services/PlayerLookupService';
import { PoolCatalogService } from '../services/PoolCatalogService';

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
  res.json({ players: await PoolCatalogService.balanced() });
});

export default r;
