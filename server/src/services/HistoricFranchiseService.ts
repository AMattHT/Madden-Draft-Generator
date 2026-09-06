import fs from 'fs';
import path from 'path';
import { openSave, savesDir, TEAM_TABLE_UID, SEASONGAME_TABLE_UID, SEASONINFO_TABLE_UID, type GameVersion } from './FranchiseService';
import { SeasonPackService, type SeasonPack, type SeasonTeam } from './SeasonPackService';
import { EraRulesService, type EraRules, type PlayoffFormat } from './EraRulesService';

/**
 * Historic seasons in a Madden 27 franchise: read-only preview of what a season pack
 * (data/seasons/<year>.json) would do to a save, plus the companion playoff bracket
 * computed from the save's standings under that era's rules. The writers (layout,
 * rosters, schedule, era rules) land once the save experiments say what the game honours.
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
export const HistoricFranchiseService = {
  /** Baked seasons with their era rules, for the season picker. */
  seasons(): { year: number; era: EraRules | null; teams: number }[] {
    return SeasonPackService.years().map((year) => ({ year, era: EraRulesService.rulesFor(year), teams: SeasonPackService.get(year)?.teams.length ?? 0 }));
  },

  companionBracket,

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
