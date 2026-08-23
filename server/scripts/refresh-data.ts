/**
 * Refresh the cached nflverse datasets when they are older than MAX_AGE_DAYS
 * (default 30; pass --force to refresh regardless). The services only download
 * a file when it is missing, so without this the draft picks / players / combine
 * / depth charts never pick up a new season's wAV, Pro Bowls or rookies.
 *
 *   npx tsx scripts/refresh-data.ts [--force] [--days 30]
 */
import fs from 'fs';
import path from 'path';
import { CACHE_DIR } from '../src/config/paths';

const args = process.argv.slice(2);
const force = args.includes('--force');
const daysIdx = args.indexOf('--days');
const MAX_AGE_DAYS = daysIdx >= 0 ? Number(args[daysIdx + 1]) || 30 : 30;
const UA = { 'User-Agent': 'MaddenDraftClassGenerator/0.1 (personal modding tool)' };
const thisSeason = new Date().getFullYear();

const targets: Array<{ file: string; url: string }> = [
  { file: 'nflverse_draft_picks.csv', url: 'https://github.com/nflverse/nflverse-data/releases/download/draft_picks/draft_picks.csv' },
  { file: 'nflverse_players.csv', url: 'https://github.com/nflverse/nflverse-data/releases/download/players/players.csv' },
  { file: 'nflverse_combine.csv', url: 'https://github.com/nflverse/nflverse-data/releases/download/combine/combine.csv' },
  { file: 'nflverse_player_stats.csv', url: 'https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv' },
  { file: 'nflverse_player_stats_def.csv', url: 'https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_def.csv' },
  // Only the current and previous season's depth charts change; older ones are history.
  ...[thisSeason - 1, thisSeason].map((y) => ({ file: `nflverse_depth_charts_${y}.csv`, url: `https://github.com/nflverse/nflverse-data/releases/download/depth_charts/depth_charts_${y}.csv` })),
];

(async () => {
  let refreshed = 0;
  for (const t of targets) {
    const p = path.join(CACHE_DIR, t.file);
    const ageDays = fs.existsSync(p) ? (Date.now() - fs.statSync(p).mtimeMs) / 86400000 : Infinity;
    if (!force && ageDays < MAX_AGE_DAYS) { console.log(`  fresh  ${t.file} (${ageDays.toFixed(0)} d)`); continue; }
    try {
      const res = await fetch(t.url, { headers: UA });
      if (res.status === 404) { console.log(`  n/a    ${t.file} (not published yet)`); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text.length < 1000) throw new Error('suspiciously small reply');
      fs.writeFileSync(p + '.tmp', text);
      fs.renameSync(p + '.tmp', p);
      refreshed++;
      console.log(`  fetched ${t.file} (${(text.length / 1e6).toFixed(1)} MB)`);
    } catch (e) {
      console.log(`  failed ${t.file}: ${(e as Error).message}`);
    }
  }
  // Derived caches that depend on the above.
  for (const derived of ['nflverse_db_positions.json', 'nflverse_slot_positions.json', 'nflverse_usage.json']) {
    const p = path.join(CACHE_DIR, derived);
    if (refreshed && fs.existsSync(p)) { fs.unlinkSync(p); console.log(`  reset  ${derived} (rebuilt on next start or via build-depth-slots.ts)`); }
  }
  console.log(refreshed ? `${refreshed} file(s) refreshed - restart the server.` : 'Nothing to refresh.');
})();
