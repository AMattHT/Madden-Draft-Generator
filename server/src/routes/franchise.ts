import { Router, Request, Response } from 'express';
import { FranchiseService, CapResetOptions, PlayerEditOptions } from '../services/FranchiseService';

const router = Router();

/** List CAREER franchise saves found in the Madden Saves directory. */
router.get('/franchise/list', (_req: Request, res: Response) => {
  try {
    res.json({ savesDir: FranchiseService.savesDir(), franchises: FranchiseService.listFranchises() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Apply a salary-cap reset to a franchise save, writing a new CAREER-*-CAPRESET file. */
router.post('/franchise/cap-reset', async (req: Request, res: Response) => {
  const { fileName, options } = (req.body ?? {}) as { fileName?: string; options?: CapResetOptions };
  if (!fileName) return res.status(400).json({ error: 'fileName required' });
  try {
    const result = await FranchiseService.capReset(fileName, options ?? {});
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Bulk player edits (heal injuries, set dev traits) — writes a new CAREER-*-PLAYERS file. */
router.post('/franchise/player-edit', async (req: Request, res: Response) => {
  const { fileName, options } = (req.body ?? {}) as { fileName?: string; options?: PlayerEditOptions };
  if (!fileName) return res.status(400).json({ error: 'fileName required' });
  try {
    const result = await FranchiseService.playerEdit(fileName, options ?? {});
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
