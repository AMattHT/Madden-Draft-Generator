import { Router } from 'express';
import { LogoService } from '../services/LogoService';

// Only proxy images from these hosts (player photos from the lookup).
const ALLOWED = [
  'upload.wikimedia.org',
  'commons.wikimedia.org',
  'pro-football-reference.com',
  'sports-reference.com',
  'static.www.nfl.com',
  'static.nfl.com',
  'nfl.com',
];

const r = Router();

/**
 * Proxy player photos from allowlisted hosts. Going through the backend avoids
 * browser hotlink/CORS blocks (esp. PFR behind Cloudflare) and lets us send a
 * proper User-Agent. Used by the player profile in the UI.
 */
r.get('/image', async (req, res) => {
  const url = String(req.query.url || '');
  let host: string;
  try {
    host = new URL(url).host.toLowerCase();
  } catch {
    return res.status(400).json({ error: 'bad url' });
  }
  if (!ALLOWED.some((a) => host === a || host.endsWith('.' + a))) {
    return res.status(403).json({ error: 'host not allowed' });
  }
  try {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'MaddenDraftClassGenerator/0.1 (personal modding tool)' },
    });
    if (!upstream.ok) return res.status(upstream.status).end();
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (e) {
    return res.status(502).json({ error: (e as Error).message });
  }
});

/** Transparent team-logo PNG (white page backdrop knocked out). */
r.get('/logo', async (req, res) => {
  const file = String(req.query.file || '');
  if (file) {
    try {
      const buf = LogoService.local(file);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      return res.send(buf);
    } catch (e) {
      return res.status(404).json({ error: (e as Error).message });
    }
  }
  const url = String(req.query.url || '');
  if (!url || !LogoService.allowed(url)) return res.status(400).json({ error: 'bad url' });
  try {
    const buf = await LogoService.png(url);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    return res.send(buf);
  } catch (e) {
    return res.status(502).json({ error: (e as Error).message });
  }
});

export default r;
