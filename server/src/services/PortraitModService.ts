import fs from 'fs';
import path from 'path';
import { CACHE_DIR } from '../config/paths';
import { PlayerLookupService } from './PlayerLookupService';
import { PortraitSlotService, PortraitAssignment } from './PortraitSlotService';
import { PortraitFetchService } from './PortraitFetchService';

const FROSTY_README = `Custom Portrait Mod — Frosty import
=====================================
This folder contains real-photo portraits for historical draft prospects who
have no built-in Madden face/portrait. Each PNG is named after the recyclable
generic portrait slot (PLPO) it overrides; the matching draft class (.mdc)
already points those prospects at the same slot's PID.

To use:
  1. Import this folder's images into Frosty Mod Manager as texture replacements
     for the matching generic portrait assets (PLPO names below / in manifest.json).
  2. Apply the mod and launch Madden.
  3. Import the .mdc draft class in Franchise (Choose Draft Class -> Import Local File).

See manifest.json / assignments.csv for the player -> PLPO/PID mapping.
`;

export interface PortraitModResult {
  outputDir: string;
  candidates: number;
  exported: number;
  errors: { name: string; error: string }[];
  manifest: unknown;
}

/** Run async tasks with a small concurrency limit (polite to image hosts). */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export const PortraitModService = {
  /** Build a Frosty-import portrait folder for a year's custom-portrait players. */
  async buildForYear(
    year: number,
    league: string,
    opts: { limit?: number; nowIso?: string } = {}
  ): Promise<PortraitModResult> {
    const players = PlayerLookupService.byYear(year, league).slice(0, 402);
    let assignments = PortraitSlotService.assignSlots(players);
    if (opts.limit) assignments = assignments.slice(0, opts.limit);

    const outputDir = path.join(CACHE_DIR, 'portraits', `${year}_${league}`);
    fs.mkdirSync(outputDir, { recursive: true });

    const errors: { name: string; error: string }[] = [];
    const ok: PortraitAssignment[] = [];

    await mapPool(assignments, 4, async (a) => {
      try {
        const png = await PortraitFetchService.fetchPortraitPng(a.photoUrl);
        fs.writeFileSync(path.join(outputDir, `${a.plpo}.png`), png);
        ok.push(a);
      } catch (e) {
        errors.push({ name: a.name, error: (e as Error).message });
      }
    });

    const manifest = {
      year,
      league,
      exportedAt: opts.nowIso || '',
      totalExported: ok.length,
      assignments: ok.map((a) => ({
        historicalPlayer: a.name,
        plpo: a.plpo,
        pid: a.pid,
        position: a.position,
        source: a.photoUrl,
      })),
    };
    fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    const csv = [
      'Historical Player,PLPO,PID,Position,Source',
      ...manifest.assignments.map((a) => `"${a.historicalPlayer}",${a.plpo},${a.pid},${a.position || ''},${a.source}`),
    ].join('\n');
    fs.writeFileSync(path.join(outputDir, 'assignments.csv'), csv);
    fs.writeFileSync(path.join(outputDir, 'README.txt'), FROSTY_README);

    return { outputDir, candidates: assignments.length, exported: ok.length, errors, manifest };
  },
};
