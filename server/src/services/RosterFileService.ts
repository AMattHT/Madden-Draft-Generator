import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { CACHE_DIR, M27_SAVES_DIR } from '../config/paths';
import { PositionMapper } from './PositionMapper';
import { LookupService } from './LookupService';
import { LikenessService } from './LikenessService';
import { PortraitService } from './PortraitService';
import { RATING_KEYS } from './AttributeModel';
import { parseTdb2, serializeTdb2, intOf, strOf, type Tdb2File, type Tdb2Record } from './Tdb2Engine';
import { splitContainer, buildContainer } from './RosterContainer';

/**
 * Madden 27 ROSTER saves (ROSTER-Official, community all-time rosters, ...).
 *
 * The file is a fixed 6 MB Frostbite save container ("FBCHUNKS", build tag
 * Madden-27-RL2-...) whose single zlib payload is a TDB2 database (see
 * RosterContainer for the header, vendor/tdb2 for the payload). Tables: BLOB
 * (one gzip visuals record per player, keyed by player id), DCHT depth chart,
 * DFTP draft picks, INJY injuries, PLAY players, PLCT contracts, PRSN personas,
 * TEAM. Field names are four characters (PGID id, TGID team, POVR overall, ...);
 * the ids in data/lookups/m27-roster-fields.json are those names packed in six
 * bits, kept there as documentation of how the fields were identified.
 *
 * Only non-default fields are written by the game; the vendored writer follows
 * suit. Writes go through `write`; see RosterBuildService.
 */
export interface RosterTeam {
  id: number;
  name: string; // Cowboys
  city: string; // Dallas
  abbr: string; // DAL
}

export interface RosterPlayer {
  id: number;
  firstName: string;
  lastName: string;
  position: string; // Madden label (QB, HB, ..., LEDG, MIKE, SS)
  positionId: number;
  teamId: number;
  team: string | null; // abbr, null for free agents
  teamName: string | null;
  overall: number;
  age: number;
  heightInches: number;
  weight: number;
  jersey: number;
  yearsPro: number;
  devTrait: number; // 0 Normal, 1 Star, 2 Superstar, 3 X-Factor
  archetype: string | null;
  college: string | null;
  hometown: string | null;
  draftRound: number | null;
  draftPick: number | null;
  assetName: string | null;
  portrait: string | null; // /api/portrait/... when the face asset is in the catalog
  ratings: Record<string, number>;
  /** From the player's visuals blob: body type (Standard…Lean), generic head, helmet and facemask assets; '' when absent. */
  visuals: { bodyType: string; genericHead: string; helmet: string; facemask: string };
}

export interface RosterInfo {
  id: string;
  name: string;
  gameVersion: 'm27';
  openedAt: number;
  count: number;
  teamCount: number;
  freeAgentTeamId: number;
  /** Identity of the file the roster came from, so a saved document can tell whether its base changed. */
  crc: number;
  sizeBytes: number;
}

export interface RosterData extends RosterInfo {
  teams: RosterTeam[];
  players: RosterPlayer[];
}

export interface SaveFileInfo {
  name: string;
  sizeBytes: number;
  modified: number;
}

/** A base roster opened for building: the container header, the parsed tables and the read model. */
export interface BaseRoster {
  name: string;
  header: Buffer;
  tdb2: Tdb2File;
  teams: RosterTeam[];
  players: RosterPlayer[];
  freeAgentTeamId: number;
}

/** camelCase rating key -> PLAY field. */
export const PLAY_RATING_KEY: Record<string, string> = {
  speed: 'PSPD', acceleration: 'PACC', agility: 'PAGI', strength: 'PSTR', awareness: 'PAWR', jumping: 'PJMP', stamina: 'PSTA',
  changeOfDirection: 'PELU', toughness: 'PTGH', injury: 'PINJ', carrying: 'PCAR', ballCarrierVision: 'PBCV', breakTackle: 'PBKT',
  trucking: 'PLTR', stiffArm: 'PLSA', spinMove: 'PLSM', jukeMove: 'PLJM', catching: 'PCTH', catchInTraffic: 'PLCI', spectacularCatch: 'PLSC',
  shortRouteRunning: 'SRRN', mediumRouteRunning: 'PMRR', deepRouteRunning: 'PDRR', release: 'PLRL', throwPower: 'PTHP',
  throwAccuracyShort: 'PTAS', throwAccuracyMid: 'PTAM', throwAccuracyDeep: 'PTAD', throwOnTheRun: 'PTOR', throwUnderPressure: 'PTUP',
  playAction: 'PPLA', breakSack: 'PBSK', passBlock: 'PPBK', passBlockPower: 'PPBS', passBlockFinesse: 'PPBF', runBlock: 'PRBK',
  runBlockPower: 'PRBS', runBlockFinesse: 'PRBF', leadBlock: 'PLBK', impactBlocking: 'PLIB', tackle: 'PTAK', hitPower: 'PLHT',
  powerMoves: 'PLPM', finesseMoves: 'PFMS', blockShedding: 'PBSG', pursuit: 'PLPU', playRecognition: 'PLPR', manCoverage: 'PLMC',
  zoneCoverage: 'PLZC', pressCoverage: 'PLPE', kickPower: 'PKPR', kickAccuracy: 'PKAC', kickReturn: 'PKRT', longSnap: 'PIMP',
};

const OPENED_DIR = path.join(CACHE_DIR, 'opened');
const KEEP = 10;
const SAVE_NAME = /^ROSTER[A-Za-z0-9_.-]*$/;
const MAGIC = Buffer.from('FBCHUNKS');

/**
 * Small numbers (ratings, age, height, weight over 160, jersey, ...) are written
 * in 6-bit digits but a plain varint reader yields 7-bit digits: 76 arrives as 140
 * (1*128 + 12), 165 as 293 (2*128 + 37), 200 as 392 (3*128 + 8). Re-read the
 * digits in base 64. A digit of 64 or more means the value was not written this
 * way (record ids, references) and is returned as is. The TDB2 engine decodes
 * this itself ("modified LEB"); this stays as the documented fact about the
 * on-disk encoding.
 */
export function decodeSmall(v: number): number {
  if (v < 128) return v;
  let out = 0, mul = 1, rest = v;
  while (rest > 0) {
    const digit = rest % 128;
    if (digit >= 64) return v;
    out += digit * mul;
    mul *= 64;
    rest = Math.floor(rest / 128);
  }
  return out;
}

/** Where the zlib stream starts inside the container, or -1 when this is not a roster. */
export function payloadOffset(buf: Buffer): number {
  if (buf.length < 0x100 || !buf.subarray(0, 8).equals(MAGIC)) return -1;
  if (!buf.subarray(0, 0x60).includes(Buffer.from('Madden-27'))) return -1;
  for (let i = 0x40; i < 0x80; i++) {
    if (buf[i] === 0x78 && [0x01, 0x5e, 0x9c, 0xda].includes(buf[i + 1])) return i;
  }
  return -1;
}

let portraitByAsset: Map<string, string | null> | null = null;
function portraitFor(asset: string | null): string | null {
  if (!asset) return null;
  if (!portraitByAsset) {
    portraitByAsset = new Map();
    try {
      for (const s of LikenessService.faceScans('m27')) {
        const plpo = s.portraitPid ? PortraitService.plpoForPid(s.portraitPid) : null;
        portraitByAsset.set(s.asset.toLowerCase(), plpo ? `/api/portrait/plpo/${plpo}` : (s.image ?? null));
      }
    } catch {
      // no catalog: no portraits
    }
  }
  return portraitByAsset.get(asset.toLowerCase()) ?? null;
}

function buildTeams(file: Tdb2File): RosterTeam[] {
  return file.TEAM.records
    .map((r) => ({ id: intOf(r, 'TGID'), name: strOf(r, 'TASN'), city: strOf(r, 'TLNA'), abbr: strOf(r, 'TSNA') }))
    .filter((t) => t.name);
}

function freeAgentTeam(teams: RosterTeam[]): number {
  const fa = teams.find((t) => /^free\s*agents?$/i.test(t.name)) ?? teams.find((t) => /free/i.test(t.name));
  if (!fa) throw new Error('no free-agent team in this roster');
  return fa.id;
}

function visualsOf(blob: Tdb2Record | undefined): RosterPlayer['visuals'] {
  const out = { bodyType: '', genericHead: '', helmet: '', facemask: '' };
  if (!blob) return out;
  out.genericHead = strOf(blob, 'GENR');
  const louts: Tdb2Record[] = blob.fields.LOUT?.value?.records ?? [];
  for (const l of louts) {
    const pins: Tdb2Record[] = l.fields.PINS?.value?.records ?? [];
    if (intOf(l, 'LDCT', -1) === 5) {
      const body = pins.find((p) => intOf(p, 'SLOT', -1) === 129);
      if (body) out.bodyType = strOf(body, 'ITAN').replace(/_BodyType$/, '');
    } else if (intOf(l, 'LDTY', -1) === 1) {
      for (const p of pins) {
        const asset = strOf(p, 'ITAN');
        if (intOf(p, 'SLOT', -1) === 106) out.helmet = asset;
        else if (!p.fields.SLOT && asset.startsWith('GearFaceMask_')) out.facemask = asset;
      }
    }
  }
  return out;
}

function buildPlayer(r: Tdb2Record, teamById: Map<number, RosterTeam>, faId: number, blob: Tdb2Record | undefined): RosterPlayer | null {
  const firstName = strOf(r, 'PFNA'), lastName = strOf(r, 'PLNA');
  if (!firstName && !lastName) return null;
  const ratings: Record<string, number> = {};
  for (const k of RATING_KEYS) ratings[k] = intOf(r, PLAY_RATING_KEY[k]);
  const positionId = intOf(r, 'PPOS');
  const teamId = intOf(r, 'TGID', faId);
  const team = teamById.get(teamId);
  const isFa = teamId === faId || !team;
  const asset = strOf(r, 'PEPS') || null;
  const round = intOf(r, 'PDRO');
  const pick = intOf(r, 'PDPI');
  const weightOver = intOf(r, 'PWGT', -1);
  return {
    id: intOf(r, 'PGID'),
    firstName, lastName,
    position: PositionMapper.name(positionId),
    positionId,
    teamId,
    team: isFa ? null : team!.abbr,
    teamName: isFa ? null : `${team!.city} ${team!.name}`,
    overall: intOf(r, 'POVR'),
    age: intOf(r, 'PAGE'),
    heightInches: intOf(r, 'PHGT'),
    weight: weightOver >= 0 ? weightOver + 160 : 0, // stored as pounds over 160, like the franchise table
    jersey: intOf(r, 'PJEN'),
    yearsPro: intOf(r, 'PYRP'),
    devTrait: Math.max(0, Math.min(3, intOf(r, 'PROL'))),
    archetype: LookupService.idToName('archetype', intOf(r, 'PLTY')) || null, // absent = 0, the position's first archetype
    college: r.fields.PCOL ? LookupService.idToName('college', intOf(r, 'PCOL')) || null : null,
    hometown: strOf(r, 'PHTN') || null,
    draftRound: round > 0 && round < 63 ? round : null,
    draftPick: r.fields.PDPI && pick < 300 ? pick : null,
    assetName: asset,
    portrait: portraitFor(asset),
    ratings,
    visuals: visualsOf(blob),
  };
}

function buildPlayers(file: Tdb2File, teams: RosterTeam[], faId: number): RosterPlayer[] {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const blobs = new Map<number, Tdb2Record>(file.BLOB.records[0].fields.BLBM.value.records.map((b: Tdb2Record) => [b.index, b]));
  const out: RosterPlayer[] = [];
  for (const r of file.PLAY.records) {
    const p = buildPlayer(r, teamById, faId, blobs.get(intOf(r, 'PGID')));
    if (p) out.push(p);
  }
  return out;
}

interface Entry extends RosterData { buf: Buffer }
const entries = new Map<string, Entry>();

function persist(e: Entry): void {
  try {
    fs.mkdirSync(OPENED_DIR, { recursive: true });
    fs.writeFileSync(path.join(OPENED_DIR, `${e.id}.roster`), e.buf);
    fs.writeFileSync(path.join(OPENED_DIR, `${e.id}.roster.json`), JSON.stringify({ id: e.id, name: e.name, openedAt: e.openedAt }));
    const side = fs.readdirSync(OPENED_DIR).filter((f) => f.endsWith('.roster.json'))
      .map((f) => ({ f, t: fs.statSync(path.join(OPENED_DIR, f)).mtimeMs })).sort((a, b) => b.t - a.t);
    for (const { f } of side.slice(KEEP)) {
      const id = f.replace(/\.roster\.json$/, '');
      for (const ext of ['.roster.json', '.roster']) { try { fs.unlinkSync(path.join(OPENED_DIR, `${id}${ext}`)); } catch { /* gone */ } }
      entries.delete(id);
    }
  } catch { /* persistence is a convenience */ }
}

async function restore(id: string): Promise<Entry | null> {
  if (!/^[a-f0-9]{16}$/.test(id)) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(OPENED_DIR, `${id}.roster.json`), 'utf8')) as { name: string; openedAt: number };
    const buf = fs.readFileSync(path.join(OPENED_DIR, `${id}.roster`));
    const e = await build(buf, meta.name, id, meta.openedAt);
    entries.set(id, e);
    return e;
  } catch {
    return null;
  }
}

async function parseBase(buf: Buffer, name: string): Promise<BaseRoster> {
  if (payloadOffset(buf) < 0) throw new Error('That is not a Madden 27 roster file');
  const { header, payload } = splitContainer(buf);
  const tdb2 = await parseTdb2(payload);
  for (const t of ['PLAY', 'TEAM', 'BLOB', 'DCHT']) if (!tdb2[t]) throw new Error(`No ${t} table in that roster file`);
  const teams = buildTeams(tdb2);
  const freeAgentTeamId = freeAgentTeam(teams);
  const players = buildPlayers(tdb2, teams, freeAgentTeamId);
  if (!players.length) throw new Error('No players found in that roster file');
  return { name, header, tdb2, teams, players, freeAgentTeamId };
}

async function build(buf: Buffer, name: string, id: string, openedAt: number): Promise<Entry> {
  const base = await parseBase(buf, name);
  return {
    id, name, gameVersion: 'm27', openedAt,
    count: base.players.length,
    teamCount: base.teams.filter((t) => t.id !== base.freeAgentTeamId).length,
    freeAgentTeamId: base.freeAgentTeamId,
    crc: buf.readUInt32LE(0x1a),
    sizeBytes: buf.length,
    teams: base.teams, players: base.players, buf: Buffer.from(buf),
  };
}

const strip = (e: Entry): RosterData => { const { buf: _b, ...rest } = e; void _b; return rest; };

export const RosterFileService = {
  payloadOffset,
  decodeSmall,

  /** True when the bytes are a Madden 27 roster save. */
  isRoster(buf: Buffer): boolean {
    return payloadOffset(buf) >= 0;
  },

  /** Parse a roster and keep it under a random id (also on disk, for reloads). */
  async open(buf: Buffer, name: string): Promise<RosterData> {
    const clean = String(name || 'ROSTER').replace(/[\\/]+/g, '').slice(0, 64) || 'ROSTER';
    const id = crypto.randomBytes(8).toString('hex');
    const e = await build(buf, clean, id, Date.now());
    entries.set(id, e);
    persist(e);
    return strip(e);
  },

  /** An opened roster, from memory or the on-disk copy. */
  async get(id: string): Promise<RosterData | null> {
    const e = entries.get(id) ?? (await restore(id));
    return e ? strip(e) : null;
  },

  savesDir(): string {
    return M27_SAVES_DIR;
  },

  /** ROSTER-* files in the Madden 27 Saves folder, newest first. */
  listSaves(): SaveFileInfo[] {
    const dir = M27_SAVES_DIR;
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((f) => SAVE_NAME.test(f) && !/\.(bak|tmp.*)$/i.test(f))
      .map((f) => { const st = fs.statSync(path.join(dir, f)); return { name: f, sizeBytes: st.size, modified: st.mtimeMs }; })
      .sort((a, b) => b.modified - a.modified);
  },

  /** Absolute path of a ROSTER file in the saves folder; the name is validated. */
  savePath(name: string): string {
    if (!SAVE_NAME.test(name)) throw new Error('not a roster file name');
    return path.join(M27_SAVES_DIR, name);
  },

  async openFromSaves(name: string): Promise<RosterData> {
    const file = RosterFileService.savePath(name);
    if (!fs.existsSync(file)) throw new Error(`${name} is not in the Madden 27 Saves folder`);
    return RosterFileService.open(fs.readFileSync(file), name);
  },

  /** A base roster from the saves folder with its parsed tables, for building. */
  async openBase(name: string): Promise<BaseRoster> {
    const file = RosterFileService.savePath(name);
    if (!fs.existsSync(file)) throw new Error(`${name} is not in the Madden 27 Saves folder`);
    return parseBase(fs.readFileSync(file), name);
  },

  /** A base roster from the copy kept for an opened id (a browsed file that is not in the saves folder). */
  async openOpened(id: string): Promise<BaseRoster> {
    const e = entries.get(id) ?? (await restore(id));
    if (!e) throw new Error('that roster is gone — open the file again');
    return parseBase(e.buf, e.name);
  },

  /** The full 6,291,530-byte file for a parsed roster and its base header. */
  write(tdb2: Tdb2File, header: Buffer, now = new Date()): Buffer {
    return buildContainer(header, serializeTdb2(tdb2), now);
  },

  /** ROSTER-<NAME>: upper-case, alphanumerics only, at most 16 characters, CUSTOM when empty. */
  outputNameFor(name: string): string {
    const clean = String(name ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 16);
    return `ROSTER-${clean || 'CUSTOM'}`;
  },

  /** Parse without registering (tests, scripts). */
  async parse(buf: Buffer, name = 'ROSTER'): Promise<RosterData> {
    return strip(await build(buf, name, '0000000000000000', Date.now()));
  },

  _reset(): void {
    entries.clear();
  },
};
