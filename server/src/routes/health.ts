import { Router } from 'express';
import { LikenessOverrideService } from '../services/LikenessOverrideService';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { MdcService } from '../services/MdcService';
import { PlayerLookupService } from '../services/PlayerLookupService';
import { LOOKUPS_DIR, DATA_ROOT } from '../config/paths';

const r = Router();

/**
 * Generator fingerprint: a hash of the code that decides what a class looks like
 * (services + vendored writers) and the lookups/calibration it reads. The web app
 * stores it with each cached class and regenerates when it changes - no more
 * hand-bumped CACHE_VERSION after every rating tweak.
 */
let fingerprint: string | null = null;
function generatorFingerprint(): string {
  if (fingerprint) return fingerprint;
  const h = crypto.createHash('sha1');
  const roots = [path.join(__dirname, '..', 'services'), path.join(__dirname, '..', 'vendor', 'draft-class'), LOOKUPS_DIR];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const f of fs.readdirSync(root).sort()) {
      const p = path.join(root, f);
      const st = fs.statSync(p);
      if (!st.isFile() || /\.(test|spec)\.ts$/.test(f)) continue;
      h.update(f).update(String(st.size)).update(String(Math.floor(st.mtimeMs)));
    }
  }
  fingerprint = h.digest('hex').slice(0, 12);
  return fingerprint;
}

r.get('/health', (_req, res) => {
  // The user's likeness fixes are part of what a class looks like: their stamp
  // rides on the fingerprint so every cached class goes stale after a fix.
  res.json({ ok: true, ts: Date.now(), generator: `${generatorFingerprint()}-${LikenessOverrideService.stamp()}` });
});

/**
 * Deployment shape for the web app. The packaged per-game desktop builds pin
 * gameVersion (the M26 app only writes M26 files, the M27 app M27), and
 * Franchise Tools ship only when explicitly enabled (DRAFT_TOOL_FRANCHISE=1) —
 * pulled from the 1.0.0 release until they are ready.
 */
r.get('/config', (_req, res) => {
  const g = process.env.DRAFT_TOOL_GAME;
  res.json({
    gameVersion: g === 'm26' || g === 'm27' ? g : null,
    franchise: process.env.DRAFT_TOOL_FRANCHISE === '1',
  });
});

/** Debug: confirm the vendored .mdc engine works through the HTTP layer. */
r.get('/template/info', (_req, res) => {
  const buf = MdcService.loadTemplate();
  const prospects = MdcService.parse(buf);
  res.json({
    size: buf.length,
    capacity: MdcService.capacity(buf),
    parsed: prospects.length,
    localPlayers: PlayerLookupService.totalRows(),
    sample: prospects.slice(0, 5).map((p) => ({
      name: `${p.firstName ?? ''} ${p.lastName ?? ''}`.toString().trim(),
      pos: p.position,
      ovr: p.overall,
      round: p.draftRound,
      pick: p.draftPick,
    })),
  });
});

export default r;

/** App version + release notes, for the What's new panel.
 *
 *  CHANGELOG.md sits at the repo root in a dev tree and beside the bundled data
 *  in a packaged one, so try both rather than assuming a layout. Missing notes
 *  are not an error -- the panel just shows the version. */
r.get('/about', (_req, res) => {
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', 'CHANGELOG.md'),
    path.resolve(__dirname, '..', '..', 'CHANGELOG.md'),
    path.join(DATA_ROOT, '..', 'CHANGELOG.md'),
    path.join(DATA_ROOT, 'CHANGELOG.md'),
  ];
  const file = candidates.find((c) => fs.existsSync(c));
  let version = '';
  for (const p of [path.resolve(__dirname, '..', '..', 'package.json'),
                   path.resolve(__dirname, '..', '..', '..', 'package.json')]) {
    try { version = JSON.parse(fs.readFileSync(p, 'utf8')).version || ''; if (version) break; } catch { /* next */ }
  }
  res.json({ version, changelog: file ? fs.readFileSync(file, 'utf8') : null });
});

