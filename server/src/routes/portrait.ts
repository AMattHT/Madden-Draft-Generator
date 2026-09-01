import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { DATA_ROOT } from '../config/paths';
import { PortraitService } from '../services/PortraitService';
import { GearImageService } from '../services/GearImageService';
import { LikenessService } from '../services/LikenessService';
import { RetroHeadshotService } from '../services/RetroHeadshotService';

const r = Router();

/** Serve a gear thumbnail PNG by its asset value (for the equipment builder). */
r.get('/gear-image/:value', (req, res) => {
  const file = GearImageService.filePath(req.params.value);
  if (!file) return res.status(404).end();
  res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  return res.sendFile(file);
});

/** Serve the portrait PNG for a gen_* generic head code (face picker preview):
 *  code -> portrait PID -> plpo -> cropped sprite cell. 404 if unmapped. */
r.get('/portrait/generic-head/:code', async (req, res) => {
  try {
    const pid = LikenessService.genericPid(req.params.code);
    const plpo = pid != null ? PortraitService.plpoForPid(pid) : null;
    const buf = plpo ? await PortraitService.cropByPlpo(plpo) : null;
    if (!buf) return res.status(404).end();
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    return res.send(buf);
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
});

/** Serve a real headshot from the retro pack (Madden 2001-2003 discs) for a
 *  player by name. 404 when he is not on any of those rosters. */
r.get('/portrait/retro/:first/:last', async (req, res) => {
  try {
    const size = Math.min(512, Math.max(64, parseInt(String(req.query.size || '256'), 10) || 256));
    // Position guards against same-name players from different eras (the 1973
    // CB J.T. Thomas vs the 2011 LB). Absent, the lookup cannot tell them apart.
    const position = typeof req.query.position === 'string' ? req.query.position : null;
    // Position says what kind of player he was; draftYear says whether he was
    // playing when the disc shipped. Without the year the 1968 Steve Smith gets
    // the 2003 receiver's photograph -- both are REC, so position clears him.
    const dy = parseInt(String(req.query.draftYear ?? ''), 10);
    const draftYear = Number.isFinite(dy) ? dy : null;
    const buf = await RetroHeadshotService.portraitPng(req.params.first, req.params.last, size, position, draftYear);
    if (!buf) return res.status(404).end();
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    return res.send(buf);
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
});

/** Serve a Madden development-trait badge.
 *
 *  EA's artwork, extracted from the game and shipped in data/dev-icons like the
 *  rest of that directory. When a file is missing this 404s and the UI falls
 *  back to drawing its own mark.
 *
 *  The path must stay under /portrait: every route in this file is mounted that
 *  way and the client asks for /api/portrait/dev-icon/. Registered as
 *  /dev-icon/ it 404s, and the fallback hides it -- the badges just quietly
 *  stop being the real artwork. */
r.get('/portrait/dev-icon/:name', (req, res) => {
  const name = String(req.params.name || '').toLowerCase();
  if (!/^(slow|normal|quick|superstar|hidden)$/.test(name)) return res.status(400).end();
  const file = path.join(DATA_ROOT, 'dev-icons', `${name}.png`);
  if (!fs.existsSync(file)) return res.status(404).end();
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  return res.sendFile(file);
});

/** Serve a Madden menu portrait PNG by portrait PID. */
r.get('/portrait/pid/:pid', async (req, res) => {
  try {
    const pid = parseInt(req.params.pid, 10);
    const plpo = Number.isFinite(pid) ? PortraitService.plpoForPid(pid) : null;
    const buf = plpo ? await PortraitService.cropByPlpo(plpo) : null;
    if (!buf) return res.status(404).end();
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    return res.send(buf);
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
});

/** Serve a Madden menu portrait PNG by its plpo asset name (cropped from the
 *  Editor Suite sprite atlas). 404 if portraits are unavailable or unknown. */
r.get('/portrait/plpo/:plpo', async (req, res) => {
  try {
    const buf = await PortraitService.cropByPlpo(req.params.plpo);
    if (!buf) return res.status(404).end();
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    return res.send(buf);
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
});

export default r;
