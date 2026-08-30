/**
 * Bake the pre-1980 "who drafted whom" map into a shipped lookup.
 *
 * For 1980 onwards nflverse supplies the drafting team by pick. Before that the
 * only source is the Wikipedia draft article, which WikipediaTeamService fetches
 * at runtime and caches under server/cache.
 *
 * That cache is NOT bundled by the installer (it ships server/data and web/dist
 * only), so every installed copy starts empty and has to fetch ~44 articles live.
 * `teamsByName` returns an empty map on any failure -- deliberately, so logos
 * "degrade gracefully to absent" -- which means one throttled request silently
 * wipes every team for that draft year. That is why whole classes show no teams.
 *
 * This writes the parsed result to data/lookups/pre1980-draft-teams.json so the
 * app ships with it and never needs the network for a historical draft.
 *
 *   npx tsx scripts/build-pre1980-draft-teams.ts [--from=1936] [--to=1979]
 */
import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../src/config/paths';
import { WikipediaTeamService } from '../src/services/WikipediaTeamService';

const arg = (name: string, dflt: number) => {
  const m = process.argv.find((a) => a.startsWith(`--${name}=`));
  return m ? Number(m.split('=')[1]) : dflt;
};
const FROM = arg('from', 1936);
const TO = arg('to', 1979);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const file = path.join(LOOKUPS_DIR, 'pre1980-draft-teams.json');
  // Merge into whatever is already there. A --from/--to run must top up the file,
  // not replace it with just that range.
  const out: Record<string, Record<string, { abbr: string; name: string; logo: string | null }>> =
    fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  let years = 0;
  let names = 0;
  const empty: number[] = [];

  for (let year = FROM; year <= TO; year++) {
    // Uncached years hit the Wikipedia API; be a polite client.
    const cached = fs.existsSync(path.join(process.env.DRAFT_TOOL_CACHE || path.join(__dirname, '..', 'cache'), `wiki_nfl_draft_${year}.html`));
    const map = await WikipediaTeamService.teamsByName(year);
    if (!map.size) {
      empty.push(year);
      console.warn(`  ${year}: EMPTY — left out, rerun to retry`);
      if (!cached) await sleep(1500);
      continue;
    }
    const entry: Record<string, { abbr: string; name: string; logo: string | null }> = {};
    for (const [key, team] of map) entry[key] = { abbr: team.abbr, name: team.name, logo: team.logo };
    out[String(year)] = entry;
    years++;
    names += map.size;
    console.log(`  ${year}: ${map.size} names`);
    if (!cached) await sleep(1500);
  }

  fs.writeFileSync(file, JSON.stringify(out));
  const kb = Math.round(fs.statSync(file).size / 1024);
  console.log(`\n${years} years, ${names} names -> ${file} (${kb} KB)`);
  if (empty.length) {
    console.warn(`years still missing (rerun to retry): ${empty.join(', ')}`);
    process.exitCode = 1;
  }
})();
