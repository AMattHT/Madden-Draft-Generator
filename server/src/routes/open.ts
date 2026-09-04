import { Router } from 'express';
import { OpenedClassService } from '../services/OpenedClassService';

const r = Router();

const gv = (v: unknown): 'm26' | 'm27' => (v === 'm27' ? 'm27' : 'm26');

/** What the client needs to show an opened class: identity plus the board rows. */
function payload(id: string) {
  const meta = OpenedClassService.get(id);
  const preview = OpenedClassService.preview(id);
  if (!meta || !preview) return null;
  return {
    year: 0,
    league: `file:${id}`,
    source: 'file',
    fileId: id,
    fileName: meta.name,
    name: meta.name,
    gameVersion: meta.gameVersion,
    mode: 'madden',
    generatedCount: 0,
    ...preview,
  };
}

/** Draft-class files in a game's Saves folder. */
r.get('/open/saves', (req, res) => {
  const gameVersion = gv(req.query.gameVersion);
  res.json({ gameVersion, dir: OpenedClassService.savesDir(gameVersion), files: OpenedClassService.listSaves(gameVersion) });
});

/** Open one of those files: { gameVersion, name }. */
r.post('/open/saves', (req, res) => {
  const b = (req.body ?? {}) as { gameVersion?: unknown; name?: unknown };
  try {
    const opened = OpenedClassService.openFromSaves(gv(b.gameVersion), String(b.name ?? ''));
    res.json(payload(opened.id));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

/** Open a file the browser read: { name, dataBase64 }. */
r.post('/open/file', (req, res) => {
  const b = (req.body ?? {}) as { name?: unknown; dataBase64?: unknown };
  const raw = String(b.dataBase64 ?? '').replace(/^data:[^;]*;base64,/, '');
  if (!raw) return res.status(400).json({ error: 'no file data' });
  let buf: Buffer;
  try { buf = Buffer.from(raw, 'base64'); } catch { return res.status(400).json({ error: 'could not decode the file' }); }
  try {
    const opened = OpenedClassService.open(buf, String(b.name ?? 'CAREERDRAFT'));
    res.json(payload(opened.id));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

/** An opened class again (after a reload). */
r.get('/open/:id', (req, res) => {
  const p = payload(String(req.params.id));
  if (!p) return res.status(404).json({ error: 'that opened class is gone — open the file again' });
  res.json(p);
});

export default r;
