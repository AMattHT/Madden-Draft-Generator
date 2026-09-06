import fs from 'fs';
import path from 'path';
import { openSave, savesDir, writeField, outputNameFor, TEAM_TABLE_UID, SEASONGAME_TABLE_UID, SEASONINFO_TABLE_UID, type GameVersion } from './FranchiseService';
import { SeasonPackService, type SeasonPack, type SeasonTeam } from './SeasonPackService';
import { EraRulesService, type EraRules, type PlayoffFormat } from './EraRulesService';

/**
 * Historic seasons in a Madden 27 franchise: read-only preview of what a season pack
 * (data/seasons/<year>.json) would do to a save, plus the companion playoff bracket
 * computed from the save's standings under that era's rules, and the first writer:
 * armPlayoffFormat (the era's field via ForceWin on the wild-card rows). Layout, roster and
 * schedule writers follow.
 */

export interface TeamRecord {
  name: string;
  teamIndex: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}
export interface PlayedGame { home: string; away: string; homeScore: number; awayScore: number }

export interface BracketSeed { seed: number; team: string; record: string; via: 'division' | 'wildcard'; division: string; bye: boolean }
export interface BracketGame { round: string; away: string; home: string }
export interface CompanionBracket {
  format: PlayoffFormat;
  conferences: Record<string, BracketSeed[]>;
  games: BracketGame[];
  notes: string[];
}

export interface HistoricRule { key: string; label: string; wanted: string; current: string; status: 'matches' | 'differs' | 'unknown' | 'guidance' }

export type ForceWin = 'Home' | 'Away' | 'None';
export interface ArmedRow { index: number; away: string; home: string; force: ForceWin; reason: string; placeholder: boolean }
export interface ArmPlayoffsResult {
  input: string;
  output: string;
  outputPath: string;
  dryRun: boolean;
  year: number;
  /** 'regular' = rows were empty and got placeholders + flags; 'wildcard' = rows already seeded, flags only. */
  mode: 'regular' | 'wildcard';
  field: Record<string, string[]>;
  rows: ArmedRow[];
  notes: string[];
}

export interface HistoricPreview {
  input: string;
  year: number;
  era: EraRules;
  pack: { teams: number; games: number; rosterRows: number; rosterMatched: number; playoffGames: number };
  teamMap: { key: string; name: string; division: string; modernName: string; teamIndex: number | null; currentDivision: string | null }[];
  parked: { name: string; teamIndex: number | null }[];
  layout: { division: string; conference: string; teams: string[]; fits: boolean }[];
  saveLayout: { division: string; teams: string[] }[];
  schedule: { packWeeks: number; packGames: number; saveRegularWeeks: number; saveRegularGames: number; currentWeekType: string; currentWeek: number };
  rules: HistoricRule[];
  standings: TeamRecord[];
  bracket: CompanionBracket;
  warnings: string[];
}

const val = (r: any, k: string): any => { try { return r[k]; } catch { return undefined; } };
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const isNullRef = (bits: unknown) => /^0*$/.test(String(bits ?? ''));

// ------------------------------------------------------------------ bracket (pure)
function pct(r: TeamRecord): number {
  const g = r.wins + r.losses + r.ties;
  return g ? (r.wins + 0.5 * r.ties) / g : 0;
}
function headToHead(a: string, b: string, games: PlayedGame[]): number {
  let aw = 0, bw = 0;
  for (const g of games) {
    const pair = (g.home === a && g.away === b) || (g.home === b && g.away === a);
    if (!pair) continue;
    const winner = g.homeScore > g.awayScore ? g.home : g.awayScore > g.homeScore ? g.away : null;
    if (winner === a) aw++; else if (winner === b) bw++;
  }
  return aw === bw ? 0 : aw > bw ? -1 : 1;
}
function compareRecords(a: TeamRecord, b: TeamRecord, games: PlayedGame[]): number {
  return (pct(b) - pct(a))
    || headToHead(a.name, b.name, games)
    || ((b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst))
    || (b.pointsFor - a.pointsFor)
    || a.name.localeCompare(b.name);
}
const fmtRecord = (r: TeamRecord) => `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}`;

/**
 * Seed the playoff field the way the era did it: division winners by record, then the
 * best remaining records as wild cards, byes to the top seeds. `records` are keyed by the
 * modern team display name (the pack's `modernName`), `games` (optional) break ties
 * head to head. Returns the seeds per conference and the first-round pairings.
 */
export function companionBracket(pack: SeasonPack, era: EraRules, records: Map<string, TeamRecord>, games: PlayedGame[] = []): CompanionBracket {
  const format = era.playoff;
  const conferences: Record<string, BracketSeed[]> = {};
  const notes: string[] = [];
  const byKey = new Map(pack.teams.map((t) => [t.key, t]));
  for (const [conf, divs] of Object.entries(pack.divisions)) {
    const winners: { rec: TeamRecord; division: string }[] = [];
    const rest: TeamRecord[] = [];
    for (const [division, keys] of Object.entries(divs)) {
      const members = keys.map((k) => byKey.get(k)?.modernName).map((n) => (n ? records.get(n) : undefined)).filter((r): r is TeamRecord => !!r);
      if (!members.length) { notes.push(`${division}: no standings for its teams`); continue; }
      const sorted = [...members].sort((a, b) => compareRecords(a, b, games));
      winners.push({ rec: sorted[0], division });
      rest.push(...sorted.slice(1));
    }
    winners.sort((a, b) => compareRecords(a.rec, b.rec, games));
    const wild = rest.sort((a, b) => compareRecords(a, b, games)).slice(0, format.wildCards);
    const seeds: BracketSeed[] = [
      ...winners.map((w) => ({ seed: 0, team: w.rec.name, record: fmtRecord(w.rec), via: 'division' as const, division: w.division, bye: false })),
      ...wild.map((r) => ({ seed: 0, team: r.name, record: fmtRecord(r), via: 'wildcard' as const, division: byKey.get(pack.teams.find((t) => t.modernName === r.name)?.key ?? '')?.division ?? '', bye: false })),
    ];
    seeds.forEach((s, i) => { s.seed = i + 1; s.bye = i < format.byes; });
    conferences[conf] = seeds;
  }
  const games_: BracketGame[] = [];
  for (const [conf, seeds] of Object.entries(conferences)) {
    const playing = seeds.filter((s) => !s.bye);
    const round = format.teams <= 8 ? 'Divisional' : 'Wild Card';
    for (let i = 0; i < Math.floor(playing.length / 2); i++) {
      const home = playing[i], away = playing[playing.length - 1 - i];
      games_.push({ round: `${conf} ${round}`, away: away.team, home: home.team });
    }
  }
  if (format.teams <= 8) notes.push('1970–77 rule: the wild card visits a division winner and two clubs from one division cannot meet in the first round; the pairing above is by seed and may need the rotation applied by hand.');
  if (era.from <= 1977) notes.push('Tiebreaks shown: win percentage, head to head, point differential. The era also used division record and common games.');
  return { format, conferences, games: games_, notes };
}

/**
 * Which way each wild-card game must be forced so that exactly the era's field survives
 * the round. `field` holds the modern names of the clubs that belong in the era's playoff.
 * A game between two members is left alone (they play), a game with one member is forced
 * to that member, a game with none is forced Home (irrelevant to the field).
 */
export function playoffForces(field: Set<string>, rows: { home: string; away: string }[]): { force: ForceWin; reason: string }[] {
  return rows.map(({ home, away }) => {
    const h = field.has(home), a = field.has(away);
    if (h && a) return { force: 'None', reason: 'both clubs belong to the field; the game is played' };
    if (h) return { force: 'Home', reason: `${home} belongs to the field, ${away} does not` };
    if (a) return { force: 'Away', reason: `${away} belongs to the field, ${home} does not` };
    return { force: 'Home', reason: 'neither club belongs to the field' };
  });
}

/** The era's playoff field (modern names) from the companion bracket: every seed. */
export function eraField(bracket: CompanionBracket): Record<string, string[]> {
  return Object.fromEntries(Object.entries(bracket.conferences).map(([conf, seeds]) => [conf, seeds.map((s) => s.team)]));
}

// ------------------------------------------------------------------ save reading
async function readSave(inputPath: string, gameVersion: GameVersion) {
  const file = await openSave(inputPath, gameVersion);
  const tt = file.getTableByUniqueId(TEAM_TABLE_UID); await tt.readRecords();
  const teamByRow: string[] = [];
  const records = new Map<string, TeamRecord>();
  const teamIndexByName = new Map<string, number>();
  tt.records.forEach((r: any, i: number) => {
    if (r.isEmpty) return;
    const name = String(val(r, 'DisplayName') ?? '');
    teamByRow[i] = name;
    const idx = num(val(r, 'TeamIndex'));
    if (idx < 0 || idx >= 32 || !name || /Pro Bowl|Free Agent|Practice|^AFC$|^NFC$/i.test(name)) return;
    teamIndexByName.set(name, idx);
    records.set(name, {
      name, teamIndex: idx,
      wins: num(val(r, 'HomeWin')) + num(val(r, 'RoadWin')),
      losses: num(val(r, 'HomeLoss')) + num(val(r, 'RoadLoss')),
      ties: num(val(r, 'HomeTie')) + num(val(r, 'RoadTie')),
      pointsFor: num(val(r, 'SeasonLeagPointsFor')),
      pointsAgainst: num(val(r, 'SeasonLeagPointsAgainst')),
    });
  });
  // Divisions as the save has them.
  const saveLayout: { division: string; teams: string[] }[] = [];
  const divisionOf = new Map<string, string>();
  const dv = file.getTableByName('Division');
  if (dv) {
    await dv.readRecords();
    for (const d of dv.records) {
      if (d.isEmpty) continue;
      const division = String(val(d, 'Name') ?? '');
      const teams: string[] = [];
      try {
        const ref = d.getReferenceDataByKey('Teams'); const arr = file.getTableById(ref.tableId); await arr.readRecords();
        const row = arr.records[ref.rowNumber];
        for (const k of ['Team0', 'Team1', 'Team2', 'Team3']) {
          try { const tr = row.getReferenceDataByKey(k); const n = teamByRow[tr.rowNumber]; if (n) { teams.push(n); divisionOf.set(n, division); } } catch { /* empty slot */ }
        }
      } catch { /* no array */ }
      saveLayout.push({ division, teams });
    }
  }
  // Season position and played games.
  const si = file.getTableByUniqueId(SEASONINFO_TABLE_UID); await si.readRecords();
  const s = si.records[0];
  const season = { weekCount: num(val(s, 'NflseasonWeekCount')), postWeeks: num(val(s, 'PostSeasonNumWeeks')), currentWeekType: String(val(s, 'CurrentWeekType') ?? ''), currentWeek: num(val(s, 'CurrentWeek')), year: num(val(s, 'CurrentSeasonYear')) };
  const sg = file.getTableByUniqueId(SEASONGAME_TABLE_UID); await sg.readRecords();
  const played: PlayedGame[] = [];
  const regWeeks = new Set<number>();
  let regGames = 0;
  for (const g of sg.records) {
    if (g.isEmpty || String(val(g, 'SeasonWeekType')) !== 'RegularSeason' || isNullRef(val(g, 'HomeTeam'))) continue;
    regGames++; regWeeks.add(num(val(g, 'SeasonWeek')));
    const status = String(val(g, 'GameStatus') ?? '');
    if (!/Won$/.test(status)) continue;
    try {
      const h = teamByRow[g.getReferenceDataByKey('HomeTeam').rowNumber], a = teamByRow[g.getReferenceDataByKey('AwayTeam').rowNumber];
      if (h && a) played.push({ home: h, away: a, homeScore: num(val(g, 'HomeScore')), awayScore: num(val(g, 'AwayScore')) });
    } catch { /* skip */ }
  }
  // Format tunables and league settings.
  let wildCards: number | null = null, byes: number | null = null;
  try { const tun = file.getTableByName('SeasonScheduleManager.SeasonScheduleTunableData'); await tun.readRecords(); wildCards = num(val(tun.records[0], 'Field_11')); byes = num(val(tun.records[0], 'Field_12')); } catch { /* generic schema missing */ }
  let minRoster = '', salaryCap: boolean | null = null, tradeDeadline: boolean | null = null;
  try { const ls = file.getTableByName('LeagueSetting'); await ls.readRecords(); const l = ls.records[0]; minRoster = String(val(l, 'MinRosterSize') ?? ''); salaryCap = !!val(l, 'IsSalaryCapEnabled'); tradeDeadline = !!val(l, 'IsTradeDeadlineEnabled'); } catch { /* */ }
  return { records, teamIndexByName, divisionOf, saveLayout, season, played, regWeeks, regGames, wildCards, byes, minRoster, salaryCap, tradeDeadline };
}

// ------------------------------------------------------------------ service
const NULL_REF = '0'.repeat(32);
/** Madden fills the six wild-card rows in this order (observed): AFC 2v7, NFC 2v7, AFC 3v6, NFC 3v6, AFC 4v5, NFC 4v5. */
const WILDCARD_ROW_ORDER: { conf: 'AFC' | 'NFC'; home: number; away: number }[] = [
  { conf: 'AFC', home: 1, away: 6 }, { conf: 'NFC', home: 1, away: 6 },
  { conf: 'AFC', home: 2, away: 5 }, { conf: 'NFC', home: 2, away: 5 },
  { conf: 'AFC', home: 3, away: 4 }, { conf: 'NFC', home: 3, away: 4 },
];

export const HistoricFranchiseService = {
  /** Baked seasons with their era rules, for the season picker. */
  seasons(): { year: number; era: EraRules | null; teams: number }[] {
    return SeasonPackService.years().map((year) => ({ year, era: EraRulesService.rulesFor(year), teams: SeasonPackService.get(year)?.teams.length ?? 0 }));
  },

  companionBracket,
  playoffForces,

  /**
   * Arm the era's playoff format. Madden always seeds seven clubs per conference and sims
   * the wild-card round from the six pre-built rows; it re-seeds the teams on those rows at
   * the week-18 advance but KEEPS each row's ForceWin flag (verified 2026-09-06). So:
   *  - during the regular season the rows are empty: write placeholder pairings (the flag
   *    only loads when the row has teams) and the flags for the projected field;
   *  - at the wild-card week, before any game is played: the rows hold the real seeds, so
   *    only the flags are (re)written, exactly for the era's field.
   * Rows that have been played are never touched (re-teaming a played row breaks the save).
   */
  async armPlayoffFormat(fileName: string, year: number, opts: { dryRun?: boolean; outputName?: string } = {}, gameVersion: GameVersion = 'm27'): Promise<ArmPlayoffsResult> {
    const pack = SeasonPackService.get(year);
    if (!pack) throw new Error(`no season pack for ${year}`);
    const era = EraRulesService.rulesFor(year);
    if (!era) throw new Error(`no era rules for ${year}`);
    const dir = savesDir(gameVersion);
    const inputPath = path.join(dir, fileName);
    if (!fs.existsSync(inputPath)) throw new Error(`franchise not found: ${fileName}`);
    const dryRun = !!opts.dryRun;
    const outputName = dryRun ? '' : outputNameFor(fileName, 'PLAYOFFS', opts.outputName);
    const outputPath = dryRun ? '' : path.join(dir, outputName);
    if (!dryRun && path.resolve(outputPath) === path.resolve(inputPath)) throw new Error('refusing to overwrite the input file');

    const save = await readSave(inputPath, gameVersion);
    const notes: string[] = [];
    const bracket = companionBracket(pack, era, save.records, save.played);
    const fieldByConf = eraField(bracket);
    const field = new Set(Object.values(fieldByConf).flat());

    const file = await openSave(inputPath, gameVersion);
    const tt = file.getTableByUniqueId(TEAM_TABLE_UID); await tt.readRecords();
    const rowOfName = new Map<string, number>();
    const nameOfRow: string[] = [];
    tt.records.forEach((r: any, i: number) => { if (r.isEmpty) return; const n = String(val(r, 'DisplayName') ?? ''); nameOfRow[i] = n; if (n && !rowOfName.has(n)) rowOfName.set(n, i); });
    const sg = file.getTableByUniqueId(SEASONGAME_TABLE_UID); await sg.readRecords();
    const wc = sg.records.filter((g: any) => !g.isEmpty && String(val(g, 'SeasonWeekType')) === 'WildcardPlayoff' && num(val(g, 'SeasonWeek')) >= 18);
    const dv = sg.records.filter((g: any) => !g.isEmpty && String(val(g, 'SeasonWeekType')) === 'DivisionalPlayoff' && num(val(g, 'SeasonWeek')) >= 18);
    if (wc.length !== 6) throw new Error(`expected six wild-card rows, found ${wc.length}`);
    if (wc.some((g: any) => /Won$|Tied|StatsReported/.test(String(val(g, 'GameStatus'))))) throw new Error('the wild-card round has already been played in this save; arm the format before the wild-card week is advanced');
    const teamOf = (g: any, k: string) => { const bits = String(val(g, k) ?? ''); if (isNullRef(bits)) return ''; try { return nameOfRow[g.getReferenceDataByKey(k).rowNumber] ?? ''; } catch { return ''; } };
    const seeded = wc.every((g: any) => teamOf(g, 'HomeTeam') && teamOf(g, 'AwayTeam'));
    const mode: 'regular' | 'wildcard' = seeded ? 'wildcard' : 'regular';

    // Placeholder pairings for empty rows: Madden's own shape from the current standings
    // (division winners of the save's divisions by record, then the best of the rest).
    let placeholders: { home: string; away: string }[] = [];
    if (!seeded) {
      const seedsByConf: Record<string, string[]> = {};
      for (const conf of ['AFC', 'NFC']) {
        const divs = save.saveLayout.filter((d) => d.division.startsWith(conf));
        const recs = (names: string[]) => names.map((n) => save.records.get(n)).filter((r): r is TeamRecord => !!r).sort((a, b) => compareRecords(a, b, save.played));
        const winners = divs.map((d) => recs(d.teams)[0]).filter((r): r is TeamRecord => !!r).sort((a, b) => compareRecords(a, b, save.played));
        const rest = recs(divs.flatMap((d) => d.teams)).filter((r) => !winners.includes(r));
        seedsByConf[conf] = [...winners, ...rest].slice(0, 7).map((r) => r.name);
      }
      placeholders = WILDCARD_ROW_ORDER.map((o) => ({ home: seedsByConf[o.conf][o.home] ?? '', away: seedsByConf[o.conf][o.away] ?? '' }));
      if (placeholders.some((p: { home: string; away: string }) => !p.home || !p.away)) throw new Error('could not build placeholder pairings from the standings');
      notes.push('Rows were empty (regular season): placeholder pairings written so the flags load; Madden replaces the teams with the real seeds when the week-18 advance seeds the bracket and keeps the flags.');
    } else {
      notes.push('Rows already seeded by the game: only the ForceWin flags were written, for the era\'s field as the standings stand now.');
    }
    const pairings = seeded ? wc.map((g: any) => ({ home: teamOf(g, 'HomeTeam'), away: teamOf(g, 'AwayTeam') })) : placeholders;
    const forces = playoffForces(field, pairings);
    if (!seeded && era.playoff.teams <= 8) notes.push('Projected from the current standings; with the 8-team format every wild-card game is forced to the higher seed once the real seeds are known, so run this again at the wild-card week only if a 5 seed should replace a 4 seed under the era\'s wild-card rule.');
    if (era.playoff.teams >= 14) notes.push('This era uses the full 14-team field: nothing is forced.');

    if (seeded) {
      const seededNames = new Set<string>([...pairings.flatMap((p: { home: string; away: string }) => [p.home, p.away]), ...dv.map((g: any) => teamOf(g, 'HomeTeam')).filter(Boolean)]);
      for (const name of field) if (!seededNames.has(name)) notes.push(`${name} belongs to the ${year} field but Madden did not seed it; check the division layout (its division winner must be a Madden division winner).`);
    }
    const rows: ArmedRow[] = pairings.map((p: { home: string; away: string }, i: number) => ({ index: i, away: p.away, home: p.home, force: forces[i].force, reason: forces[i].reason, placeholder: !seeded }));
    if (!dryRun) {
      wc.forEach((g: any, i: number) => {
        if (!seeded) {
          g.HomeTeam = tt.getBinaryReferenceToRecord(rowOfName.get(pairings[i].home)!);
          g.AwayTeam = tt.getBinaryReferenceToRecord(rowOfName.get(pairings[i].away)!);
          writeField(g, 'GameStatus', 'HomeScheduled', true);
        }
        writeField(g, 'ForceWin', forces[i].force, true);
      });
      if (!seeded) {
        // The two bye hosts the game will also overwrite; keep the shape it expects.
        const byes = ['AFC', 'NFC'].map((conf) => bracket.conferences[conf]?.[0]?.team);
        dv.forEach((g: any, i: number) => {
          if (i < 2 && byes[i] && rowOfName.has(byes[i]!)) { g.HomeTeam = tt.getBinaryReferenceToRecord(rowOfName.get(byes[i]!)!); g.AwayTeam = NULL_REF; writeField(g, 'GameStatus', 'HomeScheduled', true); }
        });
      }
      await file.save(outputPath, {});
    }
    return { input: fileName, output: outputName, outputPath, dryRun, year, mode, field: fieldByConf, rows, notes: [...notes, ...bracket.notes] };
  },

  /** Read-only: what the pack would change in this save, and the era's bracket for its standings. */
  async preview(fileName: string, year: number, gameVersion: GameVersion = 'm27'): Promise<HistoricPreview> {
    const pack = SeasonPackService.get(year);
    if (!pack) throw new Error(`no season pack for ${year}`);
    const era = EraRulesService.rulesFor(year);
    if (!era) throw new Error(`no era rules for ${year}`);
    const inputPath = path.join(savesDir(gameVersion), fileName);
    if (!fs.existsSync(inputPath)) throw new Error(`franchise not found: ${fileName}`);
    const save = await readSave(inputPath, gameVersion);
    const warnings = [...pack.warnings];

    const teamMap = pack.teams.map((t: SeasonTeam) => ({
      key: t.key, name: t.name, division: t.division, modernName: t.modernName,
      teamIndex: save.teamIndexByName.get(t.modernName) ?? null,
      currentDivision: save.divisionOf.get(t.modernName) ?? null,
    }));
    for (const t of teamMap) if (t.teamIndex == null) warnings.push(`${t.name}: modern club "${t.modernName}" not found in the save (renamed?)`);
    const parked = pack.parked.map((name) => ({ name, teamIndex: save.teamIndexByName.get(name) ?? null }));

    const layout = Object.entries(pack.divisions).flatMap(([conference, divs]) => Object.entries(divs).map(([division, keys]) => {
      const teams = keys.map((k) => pack.teams.find((t) => t.key === k)?.modernName ?? k);
      return { division, conference, teams, fits: teams.length <= 4 };
    }));
    for (const d of layout) if (!d.fits) warnings.push(`${d.division} has ${d.teams.length} teams; the save's divisions hold four`);

    const rosterRows = Object.values(pack.rosters).reduce((n, r) => n + r.length, 0);
    const rosterMatched = Object.values(pack.rosters).reduce((n, r) => n + r.filter((p) => p.poolKey).length, 0);

    const rules: HistoricRule[] = [
      { key: 'gamesPerTeam', label: 'Regular-season games', wanted: String(era.gamesPerTeam), current: String(save.regWeeks.size ? Math.round(save.regGames * 2 / Math.max(1, save.records.size)) : 0), status: save.regWeeks.size && Math.round(save.regGames * 2 / Math.max(1, save.records.size)) === era.gamesPerTeam ? 'matches' : 'differs' },
      { key: 'regularSeasonWeeks', label: 'Regular-season weeks', wanted: String(era.regularSeasonWeeks), current: String(save.regWeeks.size), status: save.regWeeks.size === era.regularSeasonWeeks ? 'matches' : 'differs' },
      { key: 'playoffTeams', label: 'Playoff teams', wanted: String(era.playoff.teams), current: save.wildCards == null ? 'unknown' : String(2 * (4 + save.wildCards)), status: save.wildCards == null ? 'unknown' : 2 * (4 + save.wildCards) === era.playoff.teams ? 'matches' : 'differs' },
      { key: 'wildCards', label: 'Wild cards per conference', wanted: String(era.playoff.wildCards), current: save.wildCards == null ? 'unknown' : String(save.wildCards), status: save.wildCards == null ? 'unknown' : save.wildCards === era.playoff.wildCards ? 'matches' : 'differs' },
      { key: 'byes', label: 'First-round byes per conference', wanted: String(era.playoff.byes), current: save.byes == null ? 'unknown' : String(save.byes), status: save.byes == null ? 'unknown' : save.byes === era.playoff.byes ? 'matches' : 'differs' },
      { key: 'divisions', label: 'Divisions per conference', wanted: String(era.divisionsPerConference), current: String(save.saveLayout.length / 2), status: 'guidance' },
      { key: 'rosterLimit', label: 'Roster limit', wanted: String(era.rosterLimit), current: save.minRoster.replace(/^MINIMUM_ROSTER_SIZE_/, 'min ') || 'unknown', status: 'guidance' },
      { key: 'salaryCap', label: 'Salary cap', wanted: era.salaryCap ? 'on' : 'off', current: save.salaryCap == null ? 'unknown' : save.salaryCap ? 'on' : 'off', status: save.salaryCap == null ? 'unknown' : save.salaryCap === era.salaryCap ? 'matches' : 'differs' },
      { key: 'tradeDeadline', label: 'Trade deadline', wanted: era.tradeDeadline ? 'on' : 'off', current: save.tradeDeadline == null ? 'unknown' : save.tradeDeadline ? 'on' : 'off', status: save.tradeDeadline == null ? 'unknown' : save.tradeDeadline === era.tradeDeadline ? 'matches' : 'differs' },
    ];

    const standings = [...save.records.values()].sort((a, b) => compareRecords(a, b, save.played));
    const bracket = companionBracket(pack, era, save.records, save.played);
    if (!standings.some((r) => r.wins + r.losses + r.ties > 0)) bracket.notes.unshift('No games played yet in this save; seeds fall to the tiebreakers.');

    return {
      input: fileName, year, era,
      pack: { teams: pack.teams.length, games: pack.schedule.length, rosterRows, rosterMatched, playoffGames: pack.playoffs.length },
      teamMap, parked, layout, saveLayout: save.saveLayout,
      schedule: { packWeeks: pack.regularSeasonWeeks, packGames: pack.schedule.length, saveRegularWeeks: save.regWeeks.size, saveRegularGames: save.regGames, currentWeekType: save.season.currentWeekType, currentWeek: save.season.currentWeek },
      rules, standings, bracket, warnings,
    };
  },
};
