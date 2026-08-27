import { Router } from 'express';
import crypto from 'crypto';
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
  'espncdn.com',
];

/**
 * The NFL CDN answers 200 with one generic helmeted-silhouette PNG for players
 * whose photo it no longer hosts (most retirees). Serving it would stamp every
 * historical class with the same fake "photo", so it becomes the 404 it really
 * is and the UI falls back to the in-game portrait.
 */
const NFL_PLACEHOLDER_MD5 = 'f63433b569d11ff35f8fe048849e34a1';
export function isDeadPhoto(host: string, body: Buffer): boolean {
  if (host !== 'nfl.com' && !host.endsWith('.nfl.com')) return false;
  return crypto.createHash('md5').update(body).digest('hex') === NFL_PLACEHOLDER_MD5;
}

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
    const body = Buffer.from(await upstream.arrayBuffer());
    if (isDeadPhoto(host, body)) return res.status(404).json({ error: 'placeholder photo' });
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(body);
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
