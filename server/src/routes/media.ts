import { Router } from 'express';

// Only proxy images from these hosts (player photos from the lookup).
const ALLOWED = ['upload.wikimedia.org', 'commons.wikimedia.org', 'pro-football-reference.com', 'sports-reference.com'];

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

export default r;
