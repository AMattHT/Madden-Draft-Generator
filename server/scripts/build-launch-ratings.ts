/**
 * Bake EA's launch-day rookie ratings into a shipped lookup.
 *
 * maddenratings.net (an independent fan database — credit where this data is
 * shown) publishes each Madden edition's launch roster as spreadsheets: one
 * full file for most editions, 32 per-team files for the 2003–2012 era. A rookie
 * is a row with 0 years pro; editions whose files carry no years-pro column keep
 * the rows whose names sit in that year's draft class instead. The Madden 24
 * launch file is the 2023 class as EA shipped it on release day: overall plus
 * every attribute the edition tracked (about 25 in 2002, 55 today).
 *
 * This downloads the files ONCE and writes data/lookups/rookie-launch-ratings.json.
 * The app never fetches at runtime. Not on the site: Madden 11's files are the
 * binary .xls format (2010 class); Madden 22 has only a final-season roster (2021);
 * the 2024 "Madden NFL 25" and Madden 26 are absent (2024, 2025). Those classes
 * fall back to the Realistic lens.
 *
 *   npx tsx scripts/build-launch-ratings.ts [--only=2023]
 */
import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR, CACHE_DIR } from '../src/config/paths';
import { readSheetRows } from '../src/util/xlsx';
import { normalizeName } from '../src/util/csv';
import { PlayerLookupService } from '../src/services/PlayerLookupService';
import { PositionMapper } from '../src/services/PositionMapper';
import { TeamService } from '../src/services/TeamService';
import { parseLaunchSheet, launchKey, type LaunchFile, type LaunchEntry, type LaunchRookie } from '../src/services/LaunchRatingsService';

const SITE = 'https://www.maddenratings.net';
const UPLOADS = `${SITE}/uploads/1/4/0/9/14097292/`;

type Source = { kind: 'full'; file: string } | { kind: 'teams'; page: string };
const EDITIONS: Array<{ draftClass: number; madden: string; source: Source }> = [
  { draftClass: 2001, madden: '2002', source: { kind: 'full', file: 'madden_nfl_2002_-_full_player_ratings.xlsx' } },
  { draftClass: 2002, madden: '2003', source: { kind: 'teams', page: 'madden-nfl-2003.html' } },
  { draftClass: 2003, madden: '2004', source: { kind: 'full', file: 'madden_nfl_2004_-_full_player_ratings.xlsx' } },
  { draftClass: 2004, madden: '2005', source: { kind: 'teams', page: 'madden-nfl-2005.html' } },
  { draftClass: 2005, madden: '06', source: { kind: 'teams', page: 'madden-nfl-06.html' } },
  { draftClass: 2006, madden: '07', source: { kind: 'teams', page: 'madden-nfl-07.html' } },
  { draftClass: 2007, madden: '08', source: { kind: 'teams', page: 'madden-nfl-08.html' } },
  { draftClass: 2008, madden: '09', source: { kind: 'teams', page: 'madden-nfl-09.html' } },
  { draftClass: 2009, madden: '10', source: { kind: 'teams', page: 'madden-nfl-10.html' } },
  // 2010 (Madden 11): binary .xls only -- not readable here.
  { draftClass: 2011, madden: '12', source: { kind: 'teams', page: 'madden-nfl-12.html' } },
  { draftClass: 2012, madden: '13', source: { kind: 'full', file: 'madden_nfl_13_-_full_player_ratings.xlsx' } },
  { draftClass: 2013, madden: '25', source: { kind: 'full', file: 'madden_nfl_25_-_full_player_ratings.xlsx' } },
  { draftClass: 2014, madden: '15', source: { kind: 'full', file: 'madden_nfl_15_-_full_player_ratings.xlsx' } },
  { draftClass: 2015, madden: '16', source: { kind: 'full', file: 'madden_nfl_16_-_full_player_ratings.xlsx' } },
  { draftClass: 2016, madden: '17', source: { kind: 'full', file: 'madden_nfl_17_-_full_player_ratings.xlsx' } },
  { draftClass: 2017, madden: '18', source: { kind: 'full', file: 'madden_nfl_18_-_full_player_ratings.xlsx' } },
  { draftClass: 2018, madden: '19', source: { kind: 'full', file: 'madden_nfl_19_-_full_player_ratings_1.xlsx' } },
  { draftClass: 2019, madden: '20', source: { kind: 'full', file: 'madden_nfl_20_-_full_player_ratings.xlsx' } },
  { draftClass: 2020, madden: '21', source: { kind: 'full', file: 'madden_nfl_21_-_full_player_ratings.xlsx' } },
  // 2021 (Madden 22): final-season roster only. 2024, 2025: editions not on the site.
  { draftClass: 2022, madden: '23', source: { kind: 'full', file: 'madden_nfl_23_player_ratings.xlsx' } },
  { draftClass: 2023, madden: '24', source: { kind: 'full', file: 'maddennfl24fullplayerratings.xlsx' } },
  { draftClass: 2026, madden: '27', source: { kind: 'full', file: 'madden_nfl_27_-_full_player_ratings__official_launch_roster_.xlsx' } },
];
const UA = 'MaddenDraftClassGenerator/1.1 (personal modding tool; one-time launch-ratings bake)';
const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DL_DIR = path.join(CACHE_DIR, 'launch-rosters');

/** Download once into the cache; a re-bake reads from disk. */
async function download(url: string): Promise<Uint8Array | null> {
  fs.mkdirSync(DL_DIR, { recursive: true });
  const local = path.join(DL_DIR, path.basename(url));
  if (fs.existsSync(local) && fs.statSync(local).size > 0) return new Uint8Array(fs.readFileSync(local));
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  await sleep(400);
  if (!res.ok) return null;
  const buf = new Uint8Array(await res.arrayBuffer());
  fs.writeFileSync(local, buf);
  return buf;
}

/** Per-team spreadsheet links on an edition page: every .xlsx upload that is not a
 *  roster update, an all-star team or the site's own full file. */
async function teamFiles(page: string): Promise<string[]> {
  const res = await fetch(`${SITE}/${page}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${page}: HTTP ${res.status}`);
  const html = await res.text();
  // Weebly writes these links with single quotes, sometimes absolute.
  const hrefs = [...html.matchAll(/href=['"]([^'"]*\/uploads\/1\/4\/0\/9\/14097292\/[^'"]+\.xlsx)['"]/gi)].map((m) => m[1]);
  const skip = /roster_update|canton|all-?25|all_time|pro_bowl|team_rice|team_sanders|full_player|legends|expansion/i;
  return [...new Set(hrefs)].filter((h) => !skip.test(h)).map((h) => (h.startsWith('http') ? h : SITE + h));
}

/** Position group of a roster label (LE, ROLB, HB, T…) via the app's mapper. */
const groupOfLabel = (pos: string) => PositionMapper.groupFromId(PositionMapper.toM26Id(pos));

(async () => {
  const outFile = path.join(LOOKUPS_DIR, 'rookie-launch-ratings.json');
  const prev: LaunchFile | null = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : null;
  const out: LaunchFile = {
    _source: 'maddenratings.net launch-roster spreadsheets (rookies: 0 years pro, or names in that year\'s draft class), via scripts/build-launch-ratings.ts',
    _built: new Date().toISOString().slice(0, 10),
    editions: { ...(prev?.editions ?? {}) },
    players: { ...(prev?.players ?? {}) },
  };
  for (const ed of EDITIONS) {
    if (only && String(ed.draftClass) !== only) continue;
    process.stdout.write(`  ${ed.draftClass} (Madden ${ed.madden}, ${ed.source.kind}) … `);
    let rows: LaunchRookie[] = [];
    let files = 0;
    if (ed.source.kind === 'full') {
      const buf = await download(UPLOADS + ed.source.file);
      if (!buf) { console.log('download failed — skipped'); continue; }
      rows = parseLaunchSheet(readSheetRows(buf));
      files = 1;
    } else {
      const urls = await teamFiles(ed.source.page);
      for (const u of urls) {
        const buf = await download(u);
        if (!buf) continue;
        // The team is the file's name when the sheet has no Team column
        // ("arizona_cardinals_madden_nfl_07.xlsx").
        const slugTeam = path.basename(u).replace(/[_(]?madden.*$/i, '').replace(/_/g, ' ').trim();
        try {
          for (const r of parseLaunchSheet(readSheetRows(buf))) rows.push({ ...r, team: r.team || slugTeam });
          files++;
        } catch { /* a non-xlsx upload */ }
      }
    }
    // Rookies: the file's own years-pro when it has one, else the year's draft class.
    // Name alone is not enough there -- the 2012 roster's Brandon Marshall at 91 is
    // the Bears receiver, not the rookie linebacker -- so the row's position group
    // must agree with the draftee's; the drafting team must agree too when both
    // sides know it (the 2009 roster's Zach Miller at 86 is the Raiders' tight end,
    // not the Jaguars' rookie of the same position); and a name that still fits
    // two rows is dropped.
    const hasYears = rows.some((r) => r.yearsPro != null);
    let rookies: LaunchRookie[];
    if (hasYears) {
      rookies = rows.filter((r) => r.yearsPro === 0);
    } else {
      const teams = await TeamService.byYear(ed.draftClass);
      const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const nickname = (name: string) => alnum(name.trim().split(/\s+/).pop() ?? '');
      const cls = new Map<string, Array<{ group: string; nick: string | null }>>();
      for (const p of PlayerLookupService.byYear(ed.draftClass, 'NFL')) {
        const k = `${normalizeName(p.firstName)}|${normalizeName(p.lastName)}`;
        const teamName = p.draftPick != null ? teams.get(p.draftPick)?.team.name ?? null : null;
        (cls.get(k) ?? cls.set(k, []).get(k)!).push({
          group: PositionMapper.groupFromId(PositionMapper.resolve(p.firstName, p.lastName, p.position, p.weight)),
          nick: teamName ? nickname(teamName) : null,
        });
      }
      const fits = rows.filter((r) => {
        const cands = cls.get(`${normalizeName(r.first)}|${normalizeName(r.last)}`) ?? [];
        const rt = alnum(r.team);
        return cands.some((c) => c.group === groupOfLabel(r.pos) && (!rt || !c.nick || rt.includes(c.nick)));
      });
      const seen = new Map<string, number>();
      for (const r of fits) { const k = `${normalizeName(r.first)}|${normalizeName(r.last)}`; seen.set(k, (seen.get(k) ?? 0) + 1); }
      rookies = fits.filter((r) => seen.get(`${normalizeName(r.first)}|${normalizeName(r.last)}`) === 1);
    }
    if (!rookies.length) { console.log(`no rookies parsed from ${files} file(s), ${rows.length} rows — skipped`); continue; }
    for (const k of Object.keys(out.players)) if (k.startsWith(`${ed.draftClass}|`)) delete out.players[k];
    let attrsMin = Infinity;
    for (const r of rookies) {
      const e: LaunchEntry = { pos: r.pos, college: r.college, ovr: r.ovr, attrs: r.attrs };
      (out.players[launchKey(ed.draftClass, r.first, r.last)] ??= []).push(e);
      attrsMin = Math.min(attrsMin, Object.keys(r.attrs).length);
    }
    out.editions[String(ed.draftClass)] = { madden: Number(ed.madden.replace(/^0/, '')) || Number(ed.madden), rookies: rookies.length, source: ed.source.kind };
    const ovrs = rookies.map((r) => r.ovr);
    console.log(`${rookies.length} rookies (${hasYears ? 'years pro' : 'draft-class names'}), OVR ${Math.min(...ovrs)}–${Math.max(...ovrs)}, ≥${attrsMin} attrs, ${rows.length} rows from ${files} file(s)`);
  }
  fs.writeFileSync(outFile, JSON.stringify(out));
  console.log(`\n${Object.keys(out.editions).length} classes, ${Object.keys(out.players).length} names -> ${outFile} (${Math.round(fs.statSync(outFile).size / 1024)} KB)`);
})();
