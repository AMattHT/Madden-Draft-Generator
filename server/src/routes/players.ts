import { Router } from 'express';
import { PlayerLookupService } from '../services/PlayerLookupService';

const r = Router();

/** Search all drafted players by name → their draft class. GET /api/players/search?q=&limit= */
r.get('/players/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || 40), 10)));
  res.json({ results: q ? PlayerLookupService.search(q, limit) : [] });
});

export default r;
