/**
 * Historic-season research spike: write one candidate edit to a COPY of a Madden 27
 * franchise save so the game can be asked what it does with it. Never touches the input.
 *
 *   npx tsx scripts/franchise-experiment.ts inspect        [--save CAREER-...]
 *   npx tsx scripts/franchise-experiment.ts field          [--wildcards 1] [--byes 0] [--blank-slots]
 *   npx tsx scripts/franchise-experiment.ts divisions      [--park]
 *   npx tsx scripts/franchise-experiment.ts season14
 *   npx tsx scripts/franchise-experiment.ts schedule-week1
 *   npx tsx scripts/franchise-experiment.ts swap-players
 *   npx tsx scripts/franchise-experiment.ts all-1975       (field 0/0 + divisions --park + season14)
 *   npx tsx scripts/franchise-experiment.ts bracket        --teams 8|10|12 [--parked] [--ghost-from worst|parked]
 *
 * Every writing preset saves `CAREER-<base>-EXP-<PRESET>` into the Madden 27 Saves folder
 * (or prints what it would change with --dry-run). Default input: the newest CAREER-* save.
 *
 * What each preset probes (see the plan's Phase 0):
 *   field          SeasonScheduleManager.SeasonScheduleTunableData Field_11 (wild cards per
 *                  conference, 3) and Field_12 (byes per conference, 1). --blank-slots also
 *                  un-schedules the surplus WildcardPlayoff rows so the game must cope with
 *                  fewer pre-built games.
 *   divisions      Rewrites the eight Division.Teams arrays into a 1975-style layout (four
 *                  slots per division is a hard limit of the array table, so the 5-team 1975
 *                  East divisions become 4 + a spill-over "extra" division). --park also hides
 *                  the six clubs with no 1975 ancestor (TEAM_VISIBLE=false).
 *   season14       SeasonInfo.NflseasonWeekCount 23 -> 19 and un-schedules regular-season
 *                  rows from week 14 on (14 games, the 1975 slate).
 *   schedule-week1 Re-pairs the first four week-0 games so the in-game schedule can be
 *                  checked against a known list.
 *   swap-players   Swaps two same-position starters between the Chiefs and the Raiders
 *                  (TeamIndex + Team.Roster slot), the cheapest test of moving players.
 *   bracket        The Dynasty Tool move, Madden style: the era's field takes the top seeds
 *                  of Madden's fixed 14-slot bracket and ghost teams fill the rest, each
 *                  ghost game ForceWin'd to the real club, so the wild-card week resolves
 *                  itself and the divisional round is the era's real first round. Emptying
 *                  rows instead (first attempt) left the save unable to load.
 */
import fs from 'fs';
import path from 'path';
import { M27_SAVES_DIR } from '../src/config/paths';
import { openSave, writeField, outputNameFor, TEAM_TABLE_UID, PLAYER_TABLE_UID, SEASONGAME_TABLE_UID, SEASONINFO_TABLE_UID } from '../src/services/FranchiseService';

const args = process.argv.slice(2);
const preset = args[0] || 'inspect';
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string, dflt: string) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
const dryRun = flag('dry-run');

const NULL_REF = '0'.repeat(32);
const PARKED = ['Seahawks', 'Buccaneers', 'Jaguars', 'Panthers', 'Ravens', 'Texans']; // no 1975 ancestor

/** 1975 alignment squeezed into 4-slot divisions (Colts and Cardinals spill into the
 *  fourth division of their conference alongside the parked clubs). */
const LAYOUT_1975: Record<string, string[]> = {
  'AFC East': ['Bills', 'Dolphins', 'Patriots', 'Jets'],
  'AFC North': ['Bengals', 'Browns', 'Steelers', 'Titans'], // 1975 AFC Central (Oilers = Titans)
  'AFC West': ['Broncos', 'Chiefs', 'Raiders', 'Chargers'],
  'AFC South': ['Colts', 'Jaguars', 'Ravens', 'Texans'],   // spill-over: Colts + parked
  'NFC East': ['Cowboys', 'Giants', 'Eagles', 'Commanders'],
  'NFC North': ['Bears', 'Lions', 'Packers', 'Vikings'],   // 1975 NFC Central
  'NFC West': ['Falcons', 'Rams', 'Saints', '49ers'],
  'NFC South': ['Cardinals', 'Seahawks', 'Buccaneers', 'Panthers'], // spill-over: Cardinals + parked
};

function newestSave(): string {
  const files = fs.readdirSync(M27_SAVES_DIR).filter((f) => /^CAREER-/i.test(f) && !/-EXP-/i.test(f));
  if (!files.length) throw new Error(`no CAREER-* save in ${M27_SAVES_DIR}`);
  files.sort((a, b) => fs.statSync(path.join(M27_SAVES_DIR, b)).mtimeMs - fs.statSync(path.join(M27_SAVES_DIR, a)).mtimeMs);
  return files[0];
}

const log = (...a: unknown[]) => console.log(...a);
const val = (r: any, k: string) => { try { return r[k]; } catch { return undefined; } };

interface Ctx { file: any; teams: any; teamRows: Map<string, number>; teamByRow: string[]; changes: string[] }

async function load(saveName: string): Promise<Ctx> {
  const file = await openSave(path.join(M27_SAVES_DIR, saveName), 'm27');
  const teams = file.getTableByUniqueId(TEAM_TABLE_UID);
  await teams.readRecords();
  const teamRows = new Map<string, number>();
  const teamByRow: string[] = [];
  teams.records.forEach((r: any, i: number) => {
    if (r.isEmpty) return;
    const name = String(val(r, 'DisplayName') ?? '');
    teamByRow[i] = name;
    if (name && !teamRows.has(name)) teamRows.set(name, i);
  });
  return { file, teams, teamRows, teamByRow, changes: [] };
}

function put(ctx: Ctx, rec: any, field: string, value: unknown, label: string): void {
  const before = val(rec, field);
  if (dryRun) { ctx.changes.push(`${label}: ${field} ${before} -> ${value} (dry run)`); return; }
  try {
    const changed = writeField(rec, field, value, true);
    const after = val(rec, field);
    ctx.changes.push(`${label}: ${field} ${before} -> ${after}${changed ? '' : ' (UNCHANGED)'}`);
  } catch (e) {
    ctx.changes.push(`${label}: ${field} ${before} -> ${value} FAILED: ${(e as Error).message}`);
  }
}

// ---------------------------------------------------------------- inspect
async function inspect(ctx: Ctx): Promise<void> {
  const { file, teams, teamByRow } = ctx;
  const si = file.getTableByUniqueId(SEASONINFO_TABLE_UID); await si.readRecords();
  const s = si.records[0];
  log('SeasonInfo:', ['CurrentSeasonYear', 'CurrentWeek', 'CurrentWeekType', 'CurrentStage', 'NflseasonWeekCount', 'PreseasonWeekCount', 'PostSeasonNumWeeks'].map((k) => `${k}=${val(s, k)}`).join(' '));
  const tun = file.getTableByName('SeasonScheduleManager.SeasonScheduleTunableData'); await tun.readRecords();
  const t = tun.records[0];
  log('Tunables:', Array.from({ length: 28 }, (_, i) => `F${i}=${val(t, `Field_${i}`)}`).join(' '));
  const dv = file.getTableByName('Division'); await dv.readRecords();
  for (const d of dv.records) {
    const ref = d.getReferenceDataByKey('Teams'); const arr = file.getTableById(ref.tableId); await arr.readRecords();
    const row = arr.records[ref.rowNumber];
    const names = ['Team0', 'Team1', 'Team2', 'Team3'].map((k) => { try { const r = row.getReferenceDataByKey(k); return teamByRow[r.rowNumber] ?? `row${r.rowNumber}`; } catch { return '?'; } });
    log(`Division ${String(val(d, 'Name')).padEnd(10)} ${names.join(', ')}`);
  }
  const hidden = teams.records.filter((r: any) => !r.isEmpty && val(r, 'TEAM_VISIBLE') === false).map((r: any) => val(r, 'DisplayName'));
  log('Hidden teams:', hidden.length ? hidden.join(', ') : 'none');
  const sg = file.getTableByUniqueId(SEASONGAME_TABLE_UID); await sg.readRecords();
  const counts: Record<string, number> = {};
  for (const g of sg.records) { if (g.isEmpty) continue; const k = `${val(g, 'SeasonWeekType')} wk${val(g, 'SeasonWeek')} ${val(g, 'GameStatus')}`; counts[k] = (counts[k] ?? 0) + 1; }
  const post = Object.entries(counts).filter(([k]) => /Playoff|SuperBowl/.test(k)).map(([k, n]) => `${k}=${n}`);
  log('Playoff rows:', post.join(' | '));
  const regWeeks = new Set(sg.records.filter((g: any) => !g.isEmpty && val(g, 'SeasonWeekType') === 'RegularSeason' && !/^0*$/.test(String(val(g, 'HomeTeam')))).map((g: any) => val(g, 'SeasonWeek')));
  log('Regular-season weeks with games:', [...regWeeks].sort((a: any, b: any) => a - b).join(','));
}

// ---------------------------------------------------------------- presets
async function fieldPreset(ctx: Ctx): Promise<void> {
  const wildcards = parseInt(opt('wildcards', '1'), 10);
  const byes = parseInt(opt('byes', '0'), 10);
  const tun = ctx.file.getTableByName('SeasonScheduleManager.SeasonScheduleTunableData'); await tun.readRecords();
  const t = tun.records[0];
  put(ctx, t, 'Field_11', wildcards, 'tunable wild cards/conf');
  put(ctx, t, 'Field_12', byes, 'tunable byes/conf');
  if (flag('blank-slots')) {
    // 4 division winners + N wild cards per conference -> 2*(4+N) teams; the wild-card
    // round then needs (teams - 2*byes)/2 games. Un-schedule the surplus pre-built rows.
    const teamsIn = 2 * (4 + wildcards);
    const wcGames = (teamsIn - 2 * byes) / 2;
    const sg = ctx.file.getTableByUniqueId(SEASONGAME_TABLE_UID); await sg.readRecords();
    const wc = sg.records.filter((g: any) => !g.isEmpty && val(g, 'SeasonWeekType') === 'WildcardPlayoff');
    ctx.changes.push(`wild-card rows in file: ${wc.length}; keeping ${wcGames}`);
    for (const g of wc.slice(wcGames)) {
      put(ctx, g, 'SeasonWeekType', 'OffSeason', `surplus WC game ${val(g, 'SeasonGameID')}`);
    }
  }
}

async function divisionsPreset(ctx: Ctx): Promise<void> {
  const { file, teams, teamRows } = ctx;
  const dv = file.getTableByName('Division'); await dv.readRecords();
  for (const d of dv.records) {
    const name = String(val(d, 'Name'));
    const want = LAYOUT_1975[name];
    if (!want) { ctx.changes.push(`division ${name}: no layout, left alone`); continue; }
    const ref = d.getReferenceDataByKey('Teams'); const arr = file.getTableById(ref.tableId); await arr.readRecords();
    const row = arr.records[ref.rowNumber];
    want.forEach((teamName, slot) => {
      const rowNum = teamRows.get(teamName);
      if (rowNum == null) { ctx.changes.push(`division ${name} slot ${slot}: team ${teamName} not found`); return; }
      const bits = teams.getBinaryReferenceToRecord(rowNum);
      const before = (() => { try { return ctx.teamByRow[row.getReferenceDataByKey(`Team${slot}`).rowNumber]; } catch { return '?'; } })();
      if (dryRun) { ctx.changes.push(`division ${name} slot ${slot}: ${before} -> ${teamName} (dry run)`); return; }
      try { row[`Team${slot}`] = bits; ctx.changes.push(`division ${name} slot ${slot}: ${before} -> ${teamName}`); }
      catch (e) { ctx.changes.push(`division ${name} slot ${slot}: FAILED ${(e as Error).message}`); }
    });
  }
  // Keep each team's own division slot number in step with the array it now sits in.
  const slotOf: Record<string, number> = {};
  Object.entries(LAYOUT_1975).forEach(([div, names]) => { const n = ['East', 'North', 'South', 'West'].findIndex((s) => div.endsWith(s)); names.forEach((t) => { slotOf[t] = n; }); });
  for (const r of teams.records) {
    if (r.isEmpty) continue;
    const name = String(val(r, 'DisplayName'));
    if (slotOf[name] != null && val(r, 'DIV_SLOTNUMBER') !== slotOf[name]) put(ctx, r, 'DIV_SLOTNUMBER', slotOf[name], `team ${name}`);
    if (flag('park') && PARKED.includes(name)) {
      put(ctx, r, 'TEAM_VISIBLE', false, `park ${name}`);
      put(ctx, r, 'TEAM_VISIBLEINQUICKSTART', false, `park ${name}`);
    }
  }
}

async function season14Preset(ctx: Ctx): Promise<void> {
  const si = ctx.file.getTableByUniqueId(SEASONINFO_TABLE_UID); await si.readRecords();
  const s = si.records[0];
  const post = Number(val(s, 'PostSeasonNumWeeks')) || 5;
  put(ctx, s, 'NflseasonWeekCount', 14 + post, 'SeasonInfo');
  const sg = ctx.file.getTableByUniqueId(SEASONGAME_TABLE_UID); await sg.readRecords();
  let cleared = 0;
  for (const g of sg.records) {
    if (g.isEmpty || val(g, 'SeasonWeekType') !== 'RegularSeason') continue;
    if (Number(val(g, 'SeasonWeek')) < 14) continue;
    if (/^0*$/.test(String(val(g, 'HomeTeam')))) continue;
    if (!dryRun) {
      try { g.HomeTeam = NULL_REF; g.AwayTeam = NULL_REF; } catch (e) { ctx.changes.push(`game ${val(g, 'SeasonGameID')}: ref clear FAILED ${(e as Error).message}`); continue; }
      put(ctx, g, 'GameStatus', 'Unscheduled', `game ${val(g, 'SeasonGameID')}`);
    }
    cleared++;
  }
  ctx.changes.push(`regular-season games from week 14 on un-scheduled: ${cleared}`);
}

async function scheduleWeek1Preset(ctx: Ctx): Promise<void> {
  const { file, teams, teamRows } = ctx;
  const sg = file.getTableByUniqueId(SEASONGAME_TABLE_UID); await sg.readRecords();
  const reg = sg.records.filter((g: any) => !g.isEmpty && val(g, 'SeasonWeekType') === 'RegularSeason' && !/^0*$/.test(String(val(g, 'HomeTeam'))));
  const played = (g: any) => /Won$/.test(String(val(g, 'GameStatus'))) || Number(val(g, 'HomeScore')) + Number(val(g, 'AwayScore')) > 0;
  const firstOpen = Math.min(...reg.filter((g: any) => !played(g)).map((g: any) => Number(val(g, 'SeasonWeek'))));
  ctx.changes.push(`first unplayed regular-season week: ${firstOpen}`);
  const wk0 = reg.filter((g: any) => Number(val(g, 'SeasonWeek')) === firstOpen);
  // 1975 week 1 pairings (away @ home) mapped onto modern franchises.
  const pairs: [string, string][] = [['Chargers', 'Steelers'], ['Colts', 'Bears'], ['Titans', 'Patriots'], ['Cardinals', 'Falcons']];
  pairs.forEach(([away, home], i) => {
    const g = wk0[i]; if (!g) return;
    const a = teamRows.get(away), h = teamRows.get(home);
    if (a == null || h == null) { ctx.changes.push(`pair ${away}@${home}: team missing`); return; }
    const before = `${ctx.teamByRow[g.getReferenceDataByKey('AwayTeam').rowNumber]} @ ${ctx.teamByRow[g.getReferenceDataByKey('HomeTeam').rowNumber]}`;
    if (dryRun) { ctx.changes.push(`week 1 game ${i}: ${before} -> ${away} @ ${home} (dry run)`); return; }
    try { g.AwayTeam = teams.getBinaryReferenceToRecord(a); g.HomeTeam = teams.getBinaryReferenceToRecord(h); ctx.changes.push(`week 1 game ${i}: ${before} -> ${away} @ ${home}`); }
    catch (e) { ctx.changes.push(`week 1 game ${i}: FAILED ${(e as Error).message}`); }
  });
}

async function swapPlayersPreset(ctx: Ctx): Promise<void> {
  const { file, teams, teamRows } = ctx;
  const pt = file.getTableByUniqueId(PLAYER_TABLE_UID); await pt.readRecords();
  const pick = (teamName: string) => {
    const idx = Number(val(teams.records[teamRows.get(teamName)!], 'TeamIndex'));
    const rosterRef = teams.records[teamRows.get(teamName)!].getReferenceDataByKey('Roster');
    return { idx, rosterRef };
  };
  const a = pick('Chiefs'), b = pick('Raiders');
  const arr = file.getTableById(a.rosterRef.tableId); await arr.readRecords();
  const rowA = arr.records[a.rosterRef.rowNumber], rowB = arr.records[b.rosterRef.rowNumber];
  const slots = Object.keys(rowA.fields ?? {});
  const find = (row: any, teamIdx: number) => {
    let best: { slot: string; rec: any } | null = null;
    for (const slot of slots) {
      let ref: any; try { ref = row.getReferenceDataByKey(slot); } catch { continue; }
      const rec = pt.records[ref.rowNumber];
      if (!rec || rec.isEmpty || val(rec, 'Position') !== 'WR' || Number(val(rec, 'TeamIndex')) !== teamIdx) continue;
      if (!best || Number(val(rec, 'OverallRating')) > Number(val(best.rec, 'OverallRating'))) best = { slot, rec };
    }
    return best;
  };
  const pa = find(rowA, a.idx), pb = find(rowB, b.idx);
  if (!pa || !pb) { ctx.changes.push('could not find a WR on both rosters'); return; }
  const name = (r: any) => `${val(r, 'FirstName')} ${val(r, 'LastName')} (${val(r, 'OverallRating')})`;
  ctx.changes.push(`swap ${name(pa.rec)} Chiefs <-> ${name(pb.rec)} Raiders`);
  if (dryRun) return;
  const bitsA = String(rowA[pa.slot]), bitsB = String(rowB[pb.slot]);
  try { rowA[pa.slot] = bitsB; rowB[pb.slot] = bitsA; } catch (e) { ctx.changes.push(`roster slot swap FAILED ${(e as Error).message}`); return; }
  put(ctx, pa.rec, 'TeamIndex', b.idx, name(pa.rec));
  put(ctx, pb.rec, 'TeamIndex', a.idx, name(pb.rec));
  put(ctx, pa.rec, 'PrevTeamIndex', a.idx, name(pa.rec));
  put(ctx, pb.rec, 'PrevTeamIndex', b.idx, name(pb.rec));
  put(ctx, pa.rec, 'WeeksWithTeam', 0, name(pa.rec));
  put(ctx, pb.rec, 'WeeksWithTeam', 0, name(pb.rec));
}

interface Rec { name: string; row: number; conf: string; division: string; wins: number; losses: number; ties: number; pf: number; pa: number }

/** Every visible club with its conference/division (from the save's Division tables) and record. */
async function readField(ctx: Ctx): Promise<{ recs: Rec[]; cmp: (a: Rec, b: Rec) => number }> {
  const { file, teams, teamByRow } = ctx;
  const divOf = new Map<string, { conf: string; division: string }>();
  const dv = file.getTableByName('Division'); await dv.readRecords();
  for (const d of dv.records) {
    const division = String(val(d, 'Name')); const conf = division.slice(0, 3);
    const ref = d.getReferenceDataByKey('Teams'); const arr = file.getTableById(ref.tableId); await arr.readRecords();
    const row = arr.records[ref.rowNumber];
    for (const k of ['Team0', 'Team1', 'Team2', 'Team3']) {
      try { const n = teamByRow[row.getReferenceDataByKey(k).rowNumber]; if (n) divOf.set(n, { conf, division }); } catch { /* empty slot */ }
    }
  }
  const recs: Rec[] = [];
  teams.records.forEach((r: any, row: number) => {
    if (r.isEmpty) return;
    const name = String(val(r, 'DisplayName')); const d = divOf.get(name);
    if (!d || Number(val(r, 'TeamIndex')) >= 32) return;
    recs.push({ name, row, conf: d.conf, division: d.division,
      wins: Number(val(r, 'HomeWin')) + Number(val(r, 'RoadWin')), losses: Number(val(r, 'HomeLoss')) + Number(val(r, 'RoadLoss')), ties: Number(val(r, 'HomeTie')) + Number(val(r, 'RoadTie')),
      pf: Number(val(r, 'SeasonLeagPointsFor')), pa: Number(val(r, 'SeasonLeagPointsAgainst')) });
  });
  const pct = (r: Rec) => (r.wins + 0.5 * r.ties) / Math.max(1, r.wins + r.losses + r.ties);
  const cmp = (a: Rec, b: Rec) => pct(b) - pct(a) || (b.pf - b.pa) - (a.pf - a.pa) || b.pf - a.pf || a.name.localeCompare(b.name);
  return { recs, cmp };
}

/**
 * The Dynasty Tool move, Madden style. The game keeps a fixed 14-slot bracket (seven per
 * conference, one bye, six wild-card games), and emptying rows breaks the load. So the era's
 * field takes the top seeds and GHOST teams fill the remaining slots, with ForceWin handing
 * every ghost game to the real club: the wild-card week resolves itself and the divisional
 * round is the era's real first round (8 teams: 4 real + 3 ghosts per conference; 10: 5 + 2;
 * 12: 6 + 1). Ghosts are the parked clubs when the save has them, else the conference's
 * worst non-qualifiers (--ghost-from worst).
 */
async function bracketPreset(ctx: Ctx): Promise<void> {
  const { file, teams } = ctx;
  const teamsIn = parseInt(opt('teams', '8'), 10);
  const realPerConf = teamsIn / 2;
  const ghostsPerConf = 7 - realPerConf;
  const ghostFrom = opt('ghost-from', PARKED.some((n) => ctx.teamRows.has(n)) && flag('parked') ? 'parked' : 'worst');
  const { recs, cmp } = await readField(ctx);
  const visible = recs.filter((r) => val(teams.records[r.row], 'TEAM_VISIBLE') !== false && !(ghostFrom === 'parked' && PARKED.includes(r.name)));

  const seeds: Record<string, Rec[]> = {};
  const ghosts: Record<string, Rec[]> = {};
  const divWinners = new Set<Rec>();
  for (const conf of ['AFC', 'NFC']) {
    const mine = visible.filter((r) => r.conf === conf);
    const divisions = [...new Set(mine.map((r) => r.division))];
    const winners = divisions.map((d) => mine.filter((r) => r.division === d).sort(cmp)[0]).filter(Boolean).sort(cmp);
    winners.forEach((w) => divWinners.add(w));
    const rest = mine.filter((r) => !winners.includes(r)).sort(cmp);
    seeds[conf] = [...winners, ...rest].slice(0, realPerConf);
    const pool = ghostFrom === 'parked'
      ? recs.filter((r) => r.conf === conf && PARKED.includes(r.name))
      : rest.filter((r) => !seeds[conf].includes(r)).reverse();
    ghosts[conf] = pool.slice(0, ghostsPerConf);
    if (ghosts[conf].length < ghostsPerConf) ctx.changes.push(`WARNING: ${conf} has only ${ghosts[conf].length} ghost candidates, need ${ghostsPerConf}`);
    ctx.changes.push(`${conf} seeds: ${seeds[conf].map((r, i) => `${i + 1} ${r.name} ${r.wins}-${r.losses}${winners.includes(r) ? '' : ' (WC)'}`).join(', ')} | ghosts: ${ghosts[conf].map((g) => g.name).join(', ')}`);
  }

  const sg = file.getTableByUniqueId(SEASONGAME_TABLE_UID); await sg.readRecords();
  const rowsOf = (type: string) => sg.records.filter((g: any) => !g.isEmpty && val(g, 'SeasonWeekType') === type && Number(val(g, 'SeasonWeek')) >= 18);
  const wc = rowsOf('WildcardPlayoff'), dvr = rowsOf('DivisionalPlayoff');
  ctx.changes.push(`rows: ${wc.length} wild-card, ${dvr.length} divisional`);
  if (wc.some((g: any) => /Won$/.test(String(val(g, 'GameStatus'))))) ctx.changes.push('WARNING: wild-card games already played in this save; a save from the start of the wild-card week is cleaner');

  const ref = (row: number) => teams.getBinaryReferenceToRecord(row);
  const setGame = (g: any, away: Rec | null, home: Rec | null, status: string, force: 'Home' | 'Away' | 'None', label: string) => {
    const text = `${label}: ${away?.name ?? '-'} @ ${home?.name ?? '-'} ${status}${force !== 'None' ? ` force ${force}` : ''}`;
    if (dryRun) { ctx.changes.push(text + ' (dry run)'); return; }
    try { g.AwayTeam = away ? ref(away.row) : NULL_REF; g.HomeTeam = home ? ref(home.row) : NULL_REF; } catch (e) { ctx.changes.push(`${label}: ref FAILED ${(e as Error).message}`); return; }
    put(ctx, g, 'GameStatus', status, label);
    put(ctx, g, 'ForceWin', force, label);
    for (const k of ['AwayScore', 'HomeScore', 'AwayScoreQuarter1', 'AwayScoreQuarter2', 'AwayScoreQuarter3', 'AwayScoreQuarter4', 'AwayScoreOT', 'HomeScoreQuarter1', 'HomeScoreQuarter2', 'HomeScoreQuarter3', 'HomeScoreQuarter4', 'HomeScoreOT']) { try { if (Number(val(g, k))) writeField(g, k, 0); } catch { /* */ } }
    try { if (val(g, 'IsSimmed')) writeField(g, 'IsSimmed', false); } catch { /* */ }
    for (const k of ['HomeTeamStatus', 'AwayTeamStatus']) { try { if (String(val(g, k)) !== 'Pending') writeField(g, k, 'Pending'); } catch { /* */ } }
    ctx.changes.push(text);
  };

  let wi = 0, di = 0;
  for (const conf of ['AFC', 'NFC']) {
    const slots = [...seeds[conf], ...ghosts[conf]]; // seeds 1..7
    const isGhost = (r: Rec) => ghosts[conf].includes(r);
    // Madden's shape: seed 1 sits out; 2v7, 3v6, 4v5.
    for (const [h, a] of [[1, 6], [2, 5], [3, 4]] as [number, number][]) {
      const home = slots[h], away = slots[a];
      if (!home || !away) { ctx.changes.push(`${conf}: missing slot ${h + 1} or ${a + 1}`); continue; }
      const force: 'Home' | 'Away' | 'None' = isGhost(away) && !isGhost(home) ? 'Home' : isGhost(home) && !isGhost(away) ? 'Away' : 'None';
      setGame(wc[wi++], away, home, 'HomeScheduled', force, `${conf} wild card ${h + 1}v${a + 1}`);
    }
    setGame(dvr[di++], null, slots[0], 'HomeScheduled', 'None', `${conf} divisional bye`);
  }
  for (const g of dvr.slice(di)) setGame(g, null, null, 'Unscheduled', 'None', 'divisional (awaits winners)');

  // Seeds and clinch flags as the game writes them; ghosts read as wild cards.
  for (const conf of ['AFC', 'NFC']) {
    const slots = [...seeds[conf], ...ghosts[conf]];
    slots.forEach((r, i) => {
      const rec = teams.records[r.row];
      put(ctx, rec, 'CurSeasonConfStanding', i, `${r.name} seed`);
      put(ctx, rec, 'PlayoffStatus', i === 0 ? 'ClinchedConf' : divWinners.has(r) && seeds[conf].includes(r) ? 'ClinchedDivBerth' : 'ClinchedWCBerth', `${r.name} status`);
    });
    for (const r of recs.filter((x) => x.conf === conf && !slots.includes(x))) {
      if (String(val(teams.records[r.row], 'PlayoffStatus')) !== 'FirstNotClinched') put(ctx, teams.records[r.row], 'PlayoffStatus', 'FirstNotClinched', `${r.name} status`);
    }
  }
}

// ---------------------------------------------------------------- main
(async () => {
  const saveName = opt('save', '') || newestSave();
  log(`input: ${saveName}${dryRun ? ' (dry run)' : ''}`);
  const ctx = await load(saveName);
  const suffix: Record<string, string> = { bracket: `EXP-BRACKET${opt('teams', '8')}G`, field: 'EXP-FIELD', divisions: flag('park') ? 'EXP-DIVPARK' : 'EXP-DIV', season14: 'EXP-SEASON14', 'schedule-week1': 'EXP-SCHED', 'swap-players': 'EXP-SWAP', 'all-1975': 'EXP-1975' };
  switch (preset) {
    case 'inspect': await inspect(ctx); return;
    case 'bracket': await bracketPreset(ctx); break;
    case 'field': await fieldPreset(ctx); break;
    case 'divisions': await divisionsPreset(ctx); break;
    case 'season14': await season14Preset(ctx); break;
    case 'schedule-week1': await scheduleWeek1Preset(ctx); break;
    case 'swap-players': await swapPlayersPreset(ctx); break;
    case 'all-1975': args.push('--park', '--wildcards', '0', '--byes', '0'); await fieldPreset(ctx); await divisionsPreset(ctx); await season14Preset(ctx); break;
    default: throw new Error(`unknown preset ${preset}`);
  }
  for (const c of ctx.changes) log('  ' + c);
  if (dryRun) return;
  const outName = outputNameFor(saveName, suffix[preset]);
  const outPath = path.join(M27_SAVES_DIR, outName);
  await ctx.file.save(outPath, {});
  log(`wrote ${outPath}`);
  log('Now: load this save in Madden 27, sim to the playoffs, and note the bracket size, the standings page, and any crash.');
})().catch((e) => { console.error('ERR', e && (e.stack || e.message)); process.exit(1); });
