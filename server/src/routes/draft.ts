import { Router } from 'express';
import { PlayerLookupService } from '../services/PlayerLookupService';
import { DraftClassBuilder } from '../services/DraftClassBuilder';
import { TeamService } from '../services/TeamService';
import { WikipediaTeamService } from '../services/WikipediaTeamService';
import { enrichedClass } from '../services/DraftEnrichment';
import { normalizeName } from '../util/csv';
import { DraftClassResponse } from '../types/player';

const r = Router();

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

  // Attach the drafting team. 1980+: nflverse by overall pick. Pre-1980: Wikipedia
  // NFL draft pages, joined by player name. (Post-generation; doesn't affect ratings.)
  if (enrich.size) {
    for (const row of preview.rows) {
      const t = row.draftPick != null ? enrich.get(row.draftPick)?.team : undefined;
      if (t) row.team = t;
    }
  } else if (year === 2026) {
    // nflverse draft_picks lags a year; attach the real 2026 teams from Wikipedia.
    const t2026 = TeamService.teams2026();
    for (const row of preview.rows) {
      const t = row.draftPick != null ? t2026.get(row.draftPick) : undefined;
      if (t) row.team = t;
    }
  } else if (year < 1980) {
    const wikiTeams = await WikipediaTeamService.teamsByName(year);
    if (wikiTeams.size) {
      for (const row of preview.rows) {
        const t = wikiTeams.get(normalizeName(`${row.firstName} ${row.lastName}`));
        if (t) row.team = t;
      }
    }
  }
  return res.json({ year, league, mode, generatedCount, ...preview });
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
