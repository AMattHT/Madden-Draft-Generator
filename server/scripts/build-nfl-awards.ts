/**
 * Bake the AP season awards into a shipped lookup.
 *
 * Wikipedia keeps a winners table per award (Season | Player | Position | Team).
 * This fetches the five pages through the parse API, keeps every winners table,
 * and writes data/lookups/nfl-awards.json. Run it again each February.
 *
 *   npx tsx scripts/build-nfl-awards.ts
 */
import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR, CACHE_DIR } from '../src/config/paths';
import { parseAwardTables, type AwardKind, type AwardRecord, type AwardsFile } from '../src/services/AwardsService';

/** page -> the award each winners table on it represents, in page order. */
const PAGES: Array<{ page: string; awards: AwardKind[] }> = [
  { page: 'Associated_Press_NFL_Most_Valuable_Player_Award', awards: ['MVP'] },
  { page: 'AP_NFL_Offensive_Player_of_the_Year_Award', awards: ['OPOY'] },
  { page: 'AP_NFL_Defensive_Player_of_the_Year_Award', awards: ['DPOY'] },
  { page: 'Associated_Press_NFL_Rookie_of_the_Year_Award', awards: ['OROY', 'DROY'] },
];
const UA = 'MaddenDraftClassGenerator/1.1 (personal modding tool)';

async function pageHtml(page: string): Promise<string> {
  const cached = path.join(CACHE_DIR, `wiki_award_${page}.html`);
  if (fs.existsSync(cached) && Date.now() - fs.statSync(cached).mtimeMs < 24 * 3600e3) return fs.readFileSync(cached, 'utf8');
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${page}&prop=text&format=json&formatversion=2&redirects=1`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`wikipedia ${page}: HTTP ${res.status}`);
  const json = (await res.json()) as { parse?: { text?: string }; error?: { info?: string } };
  if (json.error || !json.parse?.text) throw new Error(`wikipedia ${page}: ${json.error?.info ?? 'no text'}`);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cached, json.parse.text);
  return json.parse.text;
}

(async () => {
  const awards: AwardRecord[] = [];
  for (const { page, awards: kinds } of PAGES) {
    const tables = parseAwardTables(await pageHtml(page));
    if (tables.length < kinds.length) throw new Error(`${page}: expected ${kinds.length} winners tables, found ${tables.length}`);
    kinds.forEach((award, i) => {
      for (const r of tables[i]) awards.push({ award, ...r });
      const seasons = tables[i].map((r) => r.season);
      console.log(`  ${award.padEnd(4)} ${tables[i].length} winners, ${Math.min(...seasons)}–${Math.max(...seasons)}`);
    });
    await new Promise((r) => setTimeout(r, 800));
  }
  const out: AwardsFile = { _source: 'Wikipedia AP award winners tables via scripts/build-nfl-awards.ts', _built: new Date().toISOString().slice(0, 10), awards };
  const file = path.join(LOOKUPS_DIR, 'nfl-awards.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 0));
  console.log(`\n${awards.length} awards -> ${file}`);
})();
