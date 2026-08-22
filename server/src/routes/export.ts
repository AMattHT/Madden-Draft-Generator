import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { DraftClassBuilder, GenOptions } from '../services/DraftClassBuilder';
import { PortraitModService } from '../services/PortraitModService';
import { FranchiseService } from '../services/FranchiseService';
import { M27_SAVES_DIR } from '../config/paths';
import { enrichedClass, allTimeGreatsClass } from '../services/DraftEnrichment';

const r = Router();

/**
 * Build and download an importable .mdc draft class for a year (local baseline).
 * POST body may pass already-edited prospects later; for now it sources from
 * the local lookup by year. Ratings are wAV-driven; the full reconciliation
 * engine refines attribute spreads in a later task.
 */
r.post('/export/mdc', async (req, res) => {
  const edits = req.body?.edits as Record<string, Record<string, number | string>> | undefined;
  const gearEdits = req.body?.gearEdits as Record<string, Record<string, string>> | undefined;
  const mode: 'madden' | 'retro' = req.body?.mode === 'retro' ? 'retro' : 'madden';
  const gameVersion: 'm26' | 'm27' = req.body?.gameVersion === 'm27' ? 'm27' : 'm26';
  const source = req.body?.source === 'alltime' ? 'alltime' : req.body?.source === 'decade' ? 'decade' : 'year';
  const opts: GenOptions = {
    strength: Number(req.body?.strength) > 0 ? Number(req.body?.strength) : 1,
    studs: Math.max(0, Math.round(Number(req.body?.studs) || 0)),
    generational: !!req.body?.generational,
    hindsight: req.body?.hindsight != null && req.body?.hindsight !== '' ? Math.max(0, Math.min(1, Number(req.body.hindsight))) : 1,
    autoStrength: !!req.body?.autoStrength,
    variant: Math.max(0, Math.round(Number(req.body?.variant) || 0)),
  };

  let players; let filename: string;
  if (source === 'alltime' || source === 'decade') {
    const decade = Math.floor(Number(req.body?.decade) / 10) * 10;
    const range = source === 'decade' && decade > 0 ? { from: decade, to: decade + 9 } : undefined;
    ({ players } = await allTimeGreatsClass(range));
    filename = range ? `CAREERDRAFT-${decade}sGREATS` : 'CAREERDRAFT-ALLTIMEGREATS';
  } else {
    const year = parseInt(String(req.body?.year ?? req.query.year), 10);
    if (Number.isNaN(year)) return res.status(400).json({ error: 'year is required' });
    const isMergeEra = year >= 1960 && year <= 1969;
    const league = String(req.body?.league ?? req.query.league ?? (isMergeEra ? 'combined' : 'NFL'));
    const fill = req.body?.fill !== false; // matches the preview (full class) by default
    ({ players } = await enrichedClass(year, league, { fill }));
    filename = `CAREERDRAFT-${year}DRAFT`;
  }
  if (players.length === 0) {
    return res.status(404).json({ error: 'no players found' });
  }

  const { buffer, count, truncated, dropped, likeness } = gameVersion === 'm27'
    ? DraftClassBuilder.buildMdc27(players, edits, mode, gearEdits, opts)
    : DraftClassBuilder.buildMdc(players, edits, mode, gearEdits, opts);

  // saveToSaves: write the class straight into the Madden Saves folder (the name
  // is already Madden's CAREERDRAFT-* convention) so it shows up in Franchise →
  // Choose Draft Class without a manual file move. Overwrites our own previous
  // export of the same class intentionally.
  if (req.body?.saveToSaves) {
    const dir = gameVersion === 'm27' ? M27_SAVES_DIR : FranchiseService.savesDir();
    if (!fs.existsSync(dir)) return res.status(400).json({ error: `Madden Saves folder not found: ${dir}` });
    const outPath = path.join(dir, filename);
    fs.writeFileSync(outPath, buffer);
    return res.json({ saved: true, path: outPath, filename, count, truncated, dropped: dropped.length, likeness });
  }

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
