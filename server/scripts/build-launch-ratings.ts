/**
 * Bake EA's launch-day rookie ratings into a shipped lookup.
 *
 * maddenratings.net (an independent fan database — credit where this data is
 * shown) publishes each Madden edition's full launch roster as a spreadsheet.
 * A rookie is a row with 0 years pro, so the Madden 24 launch file is the 2023
 * class as EA shipped it on release day: overall plus every attribute.
 *
 * This downloads one file per edition, ONCE, and writes
 * data/lookups/rookie-launch-ratings.json. The app never fetches at runtime.
 * Editions without a launch file on the site (Madden 22 has only a final-season
 * roster; the 2024 "Madden NFL 25" and Madden 26 are absent) are simply not
 * listed, so 2021, 2024 and 2025 fall back to the Realistic lens.
 *
 *   npx tsx scripts/build-launch-ratings.ts [--only=2023]
 */
import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../src/config/paths';
import { readFirstSheet } from '../src/util/xlsx';
import { parseLaunchRows, launchKey, type LaunchFile, type LaunchEntry } from '../src/services/LaunchRatingsService';

const BASE = 'https://www.maddenratings.net/uploads/1/4/0/9/14097292/';
const EDITIONS: Array<{ draftClass: number; madden: number; file: string }> = [
  { draftClass: 2018, madden: 19, file: 'madden_nfl_19_-_full_player_ratings_1.xlsx' },
  { draftClass: 2019, madden: 20, file: 'madden_nfl_20_-_full_player_ratings.xlsx' },
  { draftClass: 2020, madden: 21, file: 'madden_nfl_21_-_full_player_ratings.xlsx' },
  { draftClass: 2022, madden: 23, file: 'madden_nfl_23_player_ratings.xlsx' },
  { draftClass: 2023, madden: 24, file: 'maddennfl24fullplayerratings.xlsx' },
  { draftClass: 2026, madden: 27, file: 'madden_nfl_27_-_full_player_ratings__official_launch_roster_.xlsx' },
];
const UA = 'MaddenDraftClassGenerator/1.1 (personal modding tool; one-time launch-ratings bake)';
const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const outFile = path.join(LOOKUPS_DIR, 'rookie-launch-ratings.json');
  const prev: LaunchFile | null = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : null;
  const out: LaunchFile = {
    _source: 'maddenratings.net launch-roster spreadsheets (rows with 0 years pro), via scripts/build-launch-ratings.ts',
    _built: new Date().toISOString().slice(0, 10),
    editions: { ...(prev?.editions ?? {}) },
    players: { ...(prev?.players ?? {}) },
  };
  for (const ed of EDITIONS) {
    if (only && String(ed.draftClass) !== only) continue;
    const url = BASE + ed.file;
    process.stdout.write(`  ${ed.draftClass} (Madden ${ed.madden}) … `);
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) { console.log(`HTTP ${res.status} — skipped`); continue; }
    const buf = new Uint8Array(await res.arrayBuffer());
    const { headers, rows } = readFirstSheet(buf);
    const rookies = parseLaunchRows(headers, rows);
    if (!rookies.length) { console.log(`no rookies parsed (headers: ${headers.slice(0, 8).join(' | ')}) — skipped`); continue; }
    // Replace this class wholesale so a re-bake never leaves stale entries behind.
    for (const k of Object.keys(out.players)) if (k.startsWith(`${ed.draftClass}|`)) delete out.players[k];
    let attrsMin = Infinity;
    for (const r of rookies) {
      const k = launchKey(ed.draftClass, r.first, r.last);
      const e: LaunchEntry = { pos: r.pos, college: r.college, ovr: r.ovr, attrs: r.attrs };
      (out.players[k] ??= []).push(e);
      attrsMin = Math.min(attrsMin, Object.keys(r.attrs).length);
    }
    out.editions[String(ed.draftClass)] = { madden: ed.madden, rookies: rookies.length };
    const ovrs = rookies.map((r) => r.ovr);
    console.log(`${rookies.length} rookies, OVR ${Math.min(...ovrs)}–${Math.max(...ovrs)}, ≥${attrsMin} attributes each, ${rows.length} roster rows`);
    await sleep(1500);
  }
  fs.writeFileSync(outFile, JSON.stringify(out));
  console.log(`\n${Object.keys(out.editions).length} classes, ${Object.keys(out.players).length} names -> ${outFile} (${Math.round(fs.statSync(outFile).size / 1024)} KB)`);
})();
