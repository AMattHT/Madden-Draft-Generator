import { Router } from 'express';
import { DraftClassBuilder } from '../services/DraftClassBuilder';
import { PortraitModService } from '../services/PortraitModService';
import { TemplateClassService, TEMPLATE_YEAR } from '../services/TemplateClassService';
import { enrichedClass } from '../services/DraftEnrichment';

const r = Router();

/**
 * Build and download an importable .mdc draft class for a year (local baseline).
 * POST body may pass already-edited prospects later; for now it sources from
 * the local lookup by year. Ratings are wAV-driven; the full reconciliation
 * engine refines attribute spreads in a later task.
 */
r.post('/export/mdc', async (req, res) => {
  const year = parseInt(String(req.body?.year ?? req.query.year), 10);
  if (Number.isNaN(year)) {
    return res.status(400).json({ error: 'year is required' });
  }
  const edits = req.body?.edits as Record<string, Record<string, number>> | undefined;
  const gearEdits = req.body?.gearEdits as Record<string, Record<string, string>> | undefined;
  const mode: 'madden' | 'retro' = req.body?.mode === 'retro' ? 'retro' : 'madden';
  // 2026 = the real template class; it's already a valid importable .mdc.
  if (year === TEMPLATE_YEAR) {
    const buffer = TemplateClassService.mdcBufferWithEdits(edits);
    const preview = TemplateClassService.preview();
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="CAREERDRAFT-2026DRAFT"`);
    res.setHeader('X-Prospect-Count', String(preview.count));
    res.setHeader('X-Likeness-Asset', String(preview.likeness.asset));
    res.setHeader('X-Likeness-CustomPortrait', '0');
    return res.send(buffer);
  }
  const isMergeEra = year >= 1960 && year <= 1969;
  const league = String(req.body?.league ?? req.query.league ?? (isMergeEra ? 'combined' : 'NFL'));
  // Same DB-position correction + class fill as the preview so the exported file
  // matches the UI (fill defaults on; pass fill:false to export real players only).
  const fill = req.body?.fill !== false;
  const { players } = await enrichedClass(year, league, { fill });
  if (players.length === 0) {
    return res.status(404).json({ error: `no players found for ${year} (${league})` });
  }

  const { buffer, count, truncated, dropped, likeness } = DraftClassBuilder.buildMdc(players, edits, mode, gearEdits);
  const filename = `CAREERDRAFT-${year}DRAFT`;
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-Prospect-Count', String(count));
  res.setHeader('X-Truncated', truncated ? '1' : '0');
  res.setHeader('X-Likeness-Asset', String(likeness.asset));
  res.setHeader('X-Likeness-Generic', String(likeness.generic));
  res.setHeader('X-Likeness-Portrait', String(likeness.withPortrait));
  res.setHeader('X-Likeness-CustomPortrait', String(likeness.customPortrait));
  if (dropped.length) res.setHeader('X-Dropped-Count', String(dropped.length));
  return res.send(buffer);
});

/**
 * Build a Frosty-import custom-portrait folder for a year: downloads real
 * photos for prospects who have no in-game face, crops them, names each by the
 * recycled PLPO slot, and writes a manifest. The matching .mdc already points
 * those prospects at the same slot's PID. `?limit=N` caps downloads (testing).
 */
r.post('/export/portraits/:year', async (req, res) => {
  const year = parseInt(req.params.year, 10);
  if (Number.isNaN(year)) return res.status(400).json({ error: 'invalid year' });
  const isMergeEra = year >= 1960 && year <= 1969;
  const league = String(req.query.league ?? (isMergeEra ? 'combined' : 'NFL'));
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
  try {
    const result = await PortraitModService.buildForYear(year, league, {
      limit,
      nowIso: new Date().toISOString(),
    });
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
});

export default r;
