import { Router, Request, Response } from 'express';
import { FranchiseService, CapResetOptions, PlayerEditOptions, PlayerFieldEdit, RelocateRebrandOptions } from '../services/FranchiseService';

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

/** List all editable players in a franchise save (for the roster editor). */
router.post('/franchise/players', async (req: Request, res: Response) => {
  const { fileName } = (req.body ?? {}) as { fileName?: string };
  if (!fileName) return res.status(400).json({ error: 'fileName required' });
  try {
    res.json(await FranchiseService.franchisePlayers(fileName));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Apply per-player roster edits — writes a new CAREER-*-ROSTER file. */
router.post('/franchise/roster-apply', async (req: Request, res: Response) => {
  const { fileName, edits } = (req.body ?? {}) as { fileName?: string; edits?: Record<string, PlayerFieldEdit> };
  if (!fileName) return res.status(400).json({ error: 'fileName required' });
  try {
    res.json(await FranchiseService.rosterApply(fileName, edits ?? {}));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Read each real team's editable identity (name, city, abbreviation, colors, logo). */
router.post('/franchise/teams', async (req: Request, res: Response) => {
  const { fileName } = (req.body ?? {}) as { fileName?: string };
  if (!fileName) return res.status(400).json({ error: 'fileName required' });
  try {
    res.json(await FranchiseService.franchiseTeams(fileName));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Relocate/rebrand a team — writes a new CAREER-*-RELOCATE / -REBRAND file. */
router.post('/franchise/relocate-rebrand', async (req: Request, res: Response) => {
  const { fileName, options } = (req.body ?? {}) as { fileName?: string; options?: RelocateRebrandOptions };
  if (!fileName) return res.status(400).json({ error: 'fileName required' });
  if (!options || options.teamIndex == null) return res.status(400).json({ error: 'options.teamIndex required' });
  try {
    res.json(await FranchiseService.relocateRebrand(fileName, options));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
