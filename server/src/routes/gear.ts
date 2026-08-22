import { Router } from 'express';
import { RealPlayerGearService } from '../services/RealPlayerGearService';
import { PhotoLookService } from '../services/PhotoLookService';
import { EraGearService } from '../services/EraGearService';

const r = Router();

/** Provenance for the real-player gear donor DB. */
r.get('/gear/players/info', (_req, res) => {
  const info = RealPlayerGearService.info();
  if (!info) return res.status(404).json({ error: 'real-player-gear.json not built — run scripts/extract-real-gear.ts' });
  res.json(info);
});

/** Search real NFL players to copy gear from: /api/gear/players?q=allen&limit=25 */
r.get('/gear/players', (req, res) => {
  const q = String(req.query.q ?? '');
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '25'), 10) || 25));
  res.json({ players: RealPlayerGearService.search(q, limit) });
});

/** One donor player's full loadout, keyed by our gear-slot keys. */
r.get('/gear/players/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const p = Number.isNaN(id) ? null : RealPlayerGearService.player(id);
  if (!p) return res.status(404).json({ error: 'player not found' });
  res.json(p);
});

/** Inspect an uploaded / URL photo and return observed gear + editor slots. */
r.post('/gear/from-photo', async (req, res) => {
  const year = parseInt(String(req.body?.year ?? ''), 10);
  const positionId = parseInt(String(req.body?.positionId ?? ''), 10);
  const gameVersion = req.body?.gameVersion === 'm27' ? 'm27' : 'm26';
  if (!Number.isFinite(year) || !Number.isFinite(positionId)) {
    return res.status(400).json({ error: 'year and positionId required' });
  }
  let buf: Buffer | null = null;
  const b64 = String(req.body?.imageBase64 || '');
  const url = String(req.body?.imageUrl || '');
  if (b64) {
    const raw = b64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    try { buf = Buffer.from(raw, 'base64'); } catch { buf = null; }
  } else if (url) {
    try {
      const target = new URL(url);
      if (target.protocol !== 'http:' && target.protocol !== 'https:') {
        return res.status(400).json({ error: 'URL must be http(s)' });
      }
      const upstream = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MaddenDraftClassGenerator/0.1',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
        redirect: 'follow',
      });
      if (!upstream.ok) return res.status(502).json({ error: `image URL returned HTTP ${upstream.status}` });
      const ct = (upstream.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html')) {
        return res.status(400).json({ error: 'that URL is a web page, not an image — right-click the photo and copy image address' });
      }
      buf = Buffer.from(await upstream.arrayBuffer());
    } catch {
      buf = null;
    }
  }
  if (!buf || buf.length < 800) return res.status(400).json({ error: 'need a photo (upload or url)' });
  const observed = await PhotoLookService.observeBytes(buf);
  const slots = observed.onField
    ? EraGearService.slotsFromObserved(year, positionId, observed, gameVersion)
    : {};
  res.json({ observed, slots });
});

export default r;

