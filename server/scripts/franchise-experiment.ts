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

// ---------------------------------------------------------------- main
(async () => {
  const saveName = opt('save', '') || newestSave();
  log(`input: ${saveName}${dryRun ? ' (dry run)' : ''}`);
  const ctx = await load(saveName);
  const suffix: Record<string, string> = { field: 'EXP-FIELD', divisions: flag('park') ? 'EXP-DIVPARK' : 'EXP-DIV', season14: 'EXP-SEASON14', 'schedule-week1': 'EXP-SCHED', 'swap-players': 'EXP-SWAP', 'all-1975': 'EXP-1975' };
  switch (preset) {
    case 'inspect': await inspect(ctx); return;
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
