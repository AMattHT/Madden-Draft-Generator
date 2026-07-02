import { Router } from 'express';
import { MdcService } from '../services/MdcService';
import { PlayerLookupService } from '../services/PlayerLookupService';

const r = Router();

r.get('/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
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
