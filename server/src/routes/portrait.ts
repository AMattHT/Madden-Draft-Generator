import { Router } from 'express';
import { PortraitService } from '../services/PortraitService';
import { GearImageService } from '../services/GearImageService';

const r = Router();

/** Serve a gear thumbnail PNG by its asset value (for the equipment builder). */
r.get('/gear-image/:value', (req, res) => {
  const file = GearImageService.filePath(req.params.value);
  if (!file) return res.status(404).end();
  res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  return res.sendFile(file);
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
