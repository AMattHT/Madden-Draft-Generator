import { Router } from 'express';
import { RosterFileService } from '../services/RosterFileService';

const r = Router();

/** ROSTER-* files in the Madden 27 Saves folder. */
r.get('/roster/saves', (_req, res) => {
  res.json({ gameVersion: 'm27', dir: RosterFileService.savesDir(), files: RosterFileService.listSaves() });
});

/** Open a roster: { name } from the Saves folder, or { name, dataBase64 } from a file the browser read. */
r.post('/roster/open', async (req, res) => {
  const b = (req.body ?? {}) as { name?: unknown; dataBase64?: unknown };
  try {
    if (b.dataBase64) {
      const raw = String(b.dataBase64).replace(/^data:[^;]*;base64,/, '');
      const buf = Buffer.from(raw, 'base64');
      if (buf.length < 1024) return res.status(400).json({ error: 'could not decode the file' });
      return res.json(await RosterFileService.open(buf, String(b.name ?? 'ROSTER')));
    }
    return res.json(await RosterFileService.openFromSaves(String(b.name ?? '')));
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

/** An opened roster again (after a reload). */
r.get('/roster/:id', async (req, res) => {
  try {
    const data = await RosterFileService.get(String(req.params.id));
    if (!data) return res.status(404).json({ error: 'that roster is gone — open the file again' });
    return res.json(data);
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

export default r;
