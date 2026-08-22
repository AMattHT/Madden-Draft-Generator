import { Router, Request, Response } from 'express';
import { FranchiseService, CapResetOptions, PlayerEditOptions, PlayerFieldEdit, RelocateRebrandOptions, TraitRealismOptions, FaTrimOptions, DraftPickResetOptions } from '../services/FranchiseService';

const router = Router();

/** 'm27' when the request says so, else 'm26'. Every franchise tool reads the
 *  save from that game's folder and refuses a save from the other game. */
const versionOf = (src: unknown): 'm26' | 'm27' => ((src as { gameVersion?: string } | undefined)?.gameVersion === 'm27' ? 'm27' : 'm26');

/** List CAREER franchise saves found in the Madden Saves directory. */
router.get('/franchise/list', (req: Request, res: Response) => {
  const gv = versionOf(req.query);
  try {
    res.json({ savesDir: FranchiseService.savesDir(gv), gameVersion: gv, franchises: FranchiseService.listFranchises(gv) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Apply a salary-cap reset to a franchise save, writing a new CAREER-*-CAPRESET file. */
router.post('/franchise/cap-reset', async (req: Request, res: Response) => {
  const { fileName, options } = (req.body ?? {}) as { fileName?: string; options?: CapResetOptions };
  if (!fileName) return res.status(400).json({ error: 'fileName required' });
  try {
    const result = await FranchiseService.capReset(fileName, options ?? {}, versionOf(req.body));
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
    const result = await FranchiseService.playerEdit(fileName, options ?? {}, versionOf(req.body));
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
    res.json(await FranchiseService.franchisePlayers(fileName, versionOf(req.body)));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Apply per-player roster edits — writes a new CAREER-*-ROSTER file. */
router.post('/franchise/roster-apply', async (req: Request, res: Response) => {
  const { fileName, edits } = (req.body ?? {}) as { fileName?: string; edits?: Record<string, PlayerFieldEdit> };
  if (!fileName) return res.status(400).json({ error: 'fileName required' });
  try {
    res.json(await FranchiseService.rosterApply(fileName, edits ?? {}, versionOf(req.body)));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Read each real team's editable identity (name, city, abbreviation, colors, logo). */
router.post('/franchise/teams', async (req: Request, res: Response) => {
  const { fileName } = (req.body ?? {}) as { fileName?: string };
  if (!fileName) return res.status(400).json({ error: 'fileName required' });
  try {
    res.json(await FranchiseService.franchiseTeams(fileName, versionOf(req.body)));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Realistic dev-trait pass. options.dryRun previews counts; otherwise writes CAREER-*-TRAITS. */
router.post('/franchise/trait-realism', async (req: Request, res: Response) => {
  const { fileName, options } = (req.body ?? {}) as { fileName?: string; options?: TraitRealismOptions };
  if (!fileName) return res.status(400).json({ error: 'fileName required' });
  try {
    res.json(await FranchiseService.applyTraitRealism(fileName, options ?? {}, versionOf(req.body)));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Trim the free-agent pool by OVR/age. options.dryRun previews; else writes CAREER-*-FATRIM. */
router.post('/franchise/trim-free-agents', async (req: Request, res: Response) => {
  const { fileName, options } = (req.body ?? {}) as { fileName?: string; options?: FaTrimOptions };
  if (!fileName) return res.status(400).json({ error: 'fileName required' });
  try {
    res.json(await FranchiseService.trimFreeAgents(fileName, options ?? {}, versionOf(req.body)));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Un-trade future draft picks (CurrentTeam:=OriginalTeam). options.dryRun previews; else CAREER-*-DRAFTPICKS. */
router.post('/franchise/reset-draft-picks', async (req: Request, res: Response) => {
  const { fileName, options } = (req.body ?? {}) as { fileName?: string; options?: DraftPickResetOptions };
  if (!fileName) return res.status(400).json({ error: 'fileName required' });
  try {
    res.json(await FranchiseService.resetDraftPicks(fileName, options ?? {}, versionOf(req.body)));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Read the full season schedule grouped by week (read-only). */
router.post('/franchise/schedule', async (req: Request, res: Response) => {
  const { fileName } = (req.body ?? {}) as { fileName?: string };
  if (!fileName) return res.status(400).json({ error: 'fileName required' });
  try {
    res.json(await FranchiseService.franchiseSchedule(fileName, versionOf(req.body)));
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
    res.json(await FranchiseService.relocateRebrand(fileName, options, versionOf(req.body)));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
