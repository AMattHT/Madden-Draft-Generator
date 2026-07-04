import { Router } from 'express';
import { PlayerLookupService } from '../services/PlayerLookupService';
import { DraftClassBuilder, GenOptions } from '../services/DraftClassBuilder';
import { TeamService, PickEnrichment } from '../services/TeamService';
import { WikipediaTeamService } from '../services/WikipediaTeamService';
import { enrichedClass, allTimeGreatsClass } from '../services/DraftEnrichment';
import { normalizeName } from '../util/csv';
import { DraftClassResponse } from '../types/player';
import type { PreviewResult } from '../services/DraftClassBuilder';

const r = Router();

/** Attach the drafting team to each preview row: 1980+ from nflverse by pick,
 *  2026 from Wikipedia, pre-1980 from Wikipedia by name. (Post-generation.) */
async function attachTeams(preview: PreviewResult, year: number, enrich: Map<number, PickEnrichment>): Promise<void> {
  if (enrich.size) {
    for (const row of preview.rows) {
      const t = row.draftPick != null ? enrich.get(row.draftPick)?.team : undefined;
      if (t) row.team = t;
    }
  } else if (year === 2026) {
    const t2026 = TeamService.teams2026();
    for (const row of preview.rows) {
      const t = row.draftPick != null ? t2026.get(row.draftPick) : undefined;
      if (t) row.team = t;
    }
  } else if (year < 1980 && year > 0) {
    const wikiTeams = await WikipediaTeamService.teamsByName(year);
    if (wikiTeams.size) {
      for (const row of preview.rows) {
        const t = wikiTeams.get(normalizeName(`${row.firstName} ${row.lastName}`));
        if (t) row.team = t;
      }
    }
  }
}

r.get('/draft/years', (_req, res) => {
  res.json({ years: PlayerLookupService.years() }); // 2026 = the real draft, now in the lookup
});

/** Generated class as JSON (wAV-driven OVR, dev trait, face) for the UI. */
r.get('/draft/:year/generated', async (req, res) => {
  const year = parseInt(req.params.year, 10);
  if (Number.isNaN(year)) return res.status(400).json({ error: 'invalid year' });
  const isMergeEra = year >= 1960 && year <= 1969;
  const league = (req.query.league as string) || (isMergeEra ? 'combined' : 'NFL');
  const mode: 'madden' | 'retro' = req.query.mode === 'retro' ? 'retro' : 'madden';
  const fill = req.query.fill !== '0'; // pad to a full class by default

  // Baseline players with DB positions corrected + per-pick team map (shared with
  // the .mdc export so the file matches this preview exactly).
  const { players, enrich, generatedCount } = await enrichedClass(year, league, { fill });
  if (!players.length) return res.status(404).json({ error: `no players for ${year}` });

  const preview = DraftClassBuilder.preview(players, mode);
  await attachTeams(preview, year, enrich);
  return res.json({ year, league, mode, generatedCount, ...preview });
});

/** Custom class generation: All-Time Greats source and/or generation modifiers
 *  (strength / studs / generational). Not cached server-side; the client caches by
 *  its own key. */
r.post('/draft/custom', async (req, res) => {
  const b = (req.body ?? {}) as {
    source?: 'year' | 'alltime' | 'decade'; year?: number; decade?: number; league?: string; mode?: string;
    strength?: number; studs?: number; generational?: boolean;
  };
  const mode: 'madden' | 'retro' = b.mode === 'retro' ? 'retro' : 'madden';
  const opts: GenOptions = {
    strength: Number(b.strength) > 0 ? Number(b.strength) : 1,
    studs: Math.max(0, Math.round(Number(b.studs) || 0)),
    generational: !!b.generational,
  };

  if (b.source === 'alltime' || b.source === 'decade') {
    const decade = Math.floor(Number(b.decade) / 10) * 10;
    const range = b.source === 'decade' && decade > 0 ? { from: decade, to: decade + 9 } : undefined;
    const { players, generatedCount } = await allTimeGreatsClass(range);
    if (!players.length) return res.status(404).json({ error: 'no players' });
    const preview = DraftClassBuilder.preview(players, mode, opts);
    const league = range ? `${decade}s` : 'all-time';
    return res.json({ year: range ? decade : 0, league, mode, source: b.source, generatedCount, ...preview });
  }

  const year = parseInt(String(b.year), 10);
  if (Number.isNaN(year)) return res.status(400).json({ error: 'invalid year' });
  const isMergeEra = year >= 1960 && year <= 1969;
  const league = b.league || (isMergeEra ? 'combined' : 'NFL');
  const { players, enrich, generatedCount } = await enrichedClass(year, league, { fill: true });
  if (!players.length) return res.status(404).json({ error: `no players for ${year}` });
  const preview = DraftClassBuilder.preview(players, mode, opts);
  await attachTeams(preview, year, enrich);
  return res.json({ year, league, mode, source: 'year', generatedCount, ...preview });
});

/**
 * Baseline draft class from the local ALL_PLAYER_LOOKUP.csv (offline, no
 * scraping). Live sourcing/enrichment is layered on top in a later task.
 */
r.get('/draft/:year', (req, res) => {
  const year = parseInt(req.params.year, 10);
  if (Number.isNaN(year)) {
    return res.status(400).json({ error: 'invalid year' });
  }
  const isMergeEra = year >= 1960 && year <= 1969;
  const league = (req.query.league as string) || (isMergeEra ? 'combined' : 'NFL');
  const prospects = PlayerLookupService.byYear(year, league);
  const drafted = prospects.filter((p) => p.draftRound != null).length;

  const body: DraftClassResponse = {
    year,
    league,
    source: 'local',
    degraded: false,
    counts: {
      drafted,
      undrafted: prospects.length - drafted,
      freeAgents: 0,
      total: prospects.length,
    },
    prospects,
    freeAgents: [],
  };
  return res.json(body);
});

export default r;
