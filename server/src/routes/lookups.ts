import { Router } from 'express';
import { LookupService } from '../services/LookupService';
import { CalibrationService } from '../services/CalibrationService';
import { GearOptionsService } from '../services/GearOptionsService';
import { LikenessService } from '../services/LikenessService';
import { PersonaService } from '../services/PersonaService';

const r = Router();

r.get('/lookups', (_req, res) => {
  res.json({ lookups: LookupService.names() });
});

/** Valid archetypes per M26 position (from Madden's real mix) for the editor. */
r.get('/lookups/archetypes-by-position', (_req, res) => {
  res.json(CalibrationService.archetypeOptions());
});

/** Era-filtered equipment options for the per-player gear editor. Supports ?gameVersion=m26|m27 */
r.get('/lookups/equipment', (req, res) => {
  const year = parseInt(String(req.query.year), 10);
  const gv = (req.query.gameVersion === 'm27' ? 'm27' : 'm26') as 'm26' | 'm27';
  res.json(GearOptionsService.optionsForYear(Number.isNaN(year) ? 2025 : year, gv));
});

/** Generic draft-class head codes grouped by skin tone, for the face picker. */
r.get('/lookups/generic-heads', (_req, res) => {
  res.json(LikenessService.genericHeadsByTone());
});

/** Real face-scan catalog for the target game (M26 assets vs M27 extract). */
r.get('/lookups/face-scans', (req, res) => {
  const gv = req.query.gameVersion === 'm27' ? 'm27' : 'm26';
  res.json({ gameVersion: gv, scans: LikenessService.faceScans(gv) });
});

/** Selectable M27 persona DNA traits (id + name) for the persona editor. */
r.get('/lookups/persona-dna', (_req, res) => {
  res.json({ traits: PersonaService.list() });
});

r.get('/lookups/:name', (req, res) => {
  const name = req.params.name;
  try {
    if (name.endsWith('.json')) {
      return res.json(LookupService.rawJson(name));
    }
    return res.json(LookupService.get(name));
  } catch (e) {
    return res.status(404).json({ error: (e as Error).message });
  }
});

export default r;
