import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { MdcService } from '../services/MdcService';
import { PlayerLookupService } from '../services/PlayerLookupService';
import { LOOKUPS_DIR } from '../config/paths';

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
  res.json({ ok: true, ts: Date.now(), generator: generatorFingerprint() });
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
