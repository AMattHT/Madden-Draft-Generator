import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { CACHE_DIR, LOOKUPS_DIR, M27_SAVES_DIR } from '../config/paths';
import { PositionMapper } from './PositionMapper';
import { LookupService } from './LookupService';
import { LikenessService } from './LikenessService';
import { PortraitService } from './PortraitService';
import { RATING_KEYS } from './AttributeModel';

/**
 * Madden 27 ROSTER saves (ROSTER-Official, community all-time rosters, ...).
 *
 * The file is a fixed 6 MB Frostbite save container ("FBCHUNKS", build tag
 * Madden-27-RL2-...) whose single zlib payload holds typed lists of records.
 * A record is a run of fields sorted by a 3-byte big-endian field id, each
 * followed by a type byte and a value: 0x00 = LEB128 varint, 0x01 = length byte
 * + string + NUL, 0x0a = 4 raw bytes. Records are separated by a single 0x00;
 * a list starts with `<key> 0x04 0x03 <varint count>`. Only non-default fields
 * are written, so a player carries 84-101 fields in the shipped roster and 220
 * in a roster a tool wrote.
 *
 * Small numbers (ratings, age, height, jersey, ...) are written in 6-bit digits
 * and read back in 7-bit ones: a 76 speed is 140 on disk (see decodeSmall). Field ids were named by
 * matching ROSTER-Official against a CAREER save's Player table (92 of 106 ids
 * agree on 90-100% of 2,719 players); see data/lookups/m27-roster-fields.json.
 *
 * Read-only: the roster is shown and exported, never written back.
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
}

export interface RosterInfo {
  id: string;
  name: string;
  gameVersion: 'm27';
  openedAt: number;
  count: number;
  teamCount: number;
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

type FieldKind = 'rating' | 'small' | 'int' | 'string' | 'enum' | 'unknown';
interface FieldSpec { name: string | null; kind: FieldKind }
interface FieldMap {
  fields: Record<string, FieldSpec>;
  team: Record<string, string>;
  playersListKey: string;
  teamsListKey: string;
}

type Rec = Array<[number, number, number | string]>;

const OPENED_DIR = path.join(CACHE_DIR, 'opened');
const KEEP = 10;
const SAVE_NAME = /^ROSTER[A-Za-z0-9_.-]*$/;
const MAGIC = Buffer.from('FBCHUNKS');

let fieldMap: FieldMap | null = null;
function map(): FieldMap {
  if (fieldMap) return fieldMap;
  fieldMap = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'm27-roster-fields.json'), 'utf8')) as FieldMap;
  return fieldMap;
}
const keyOf = (hex: string) => parseInt(hex, 16);

/**
 * Small numbers (ratings, age, height, weight over 160, jersey, ...) are written
 * in 6-bit digits but the varint reader yields 7-bit digits: 76 arrives as 140
 * (1*128 + 12), 165 as 293 (2*128 + 37), 200 as 392 (3*128 + 8). Re-read the
 * digits in base 64. A digit of 64 or more means the value was not written this
 * way (record ids, references) and is returned as is.
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

function inflate(buf: Buffer, off: number): Buffer {
  // The payload is followed by padding; Z_SYNC_FLUSH returns what inflated.
  return zlib.inflateSync(buf.subarray(off), { finishFlush: zlib.constants.Z_SYNC_FLUSH });
}

function varint(d: Buffer, p: number): [number, number] {
  let v = 0, s = 0;
  for (;;) {
    const c = d[p++];
    v += (c & 0x7f) * 2 ** s;
    if (c < 0x80) return [v, p];
    s += 7;
  }
}

/** Records of the list whose header key is `key`, in file order. */
function parseList(d: Buffer, key: number): Rec[] {
  const hdr = Buffer.from([(key >> 16) & 0xff, (key >> 8) & 0xff, key & 0xff, 0x04, 0x03]);
  const h = d.indexOf(hdr);
  if (h < 0) return [];
  let [, p] = varint(d, h + 5);
  const recs: Rec[] = [];
  let cur: Rec = [];
  let last = -1;
  while (p < d.length - 4) {
    if (d[p] === 0) {
      if (cur.length) { recs.push(cur); cur = []; last = -1; }
      p += 1;
      continue;
    }
    const k = (d[p] << 16) | (d[p + 1] << 8) | d[p + 2];
    const t = d[p + 3];
    let q = p + 4;
    let v: number | string;
    if (t === 0) [v, q] = varint(d, q);
    else if (t === 1) { const L = d[q]; v = d.subarray(q + 1, q + L).toString('latin1'); q = q + 1 + L; }
    else if (t === 0x0a) { v = d.readUInt32LE(q); q += 4; }
    else break; // the next list header (0x04) or something we do not know
    if (k < last && cur.length) { recs.push(cur); cur = []; }
    cur.push([k, t, v]);
    last = k;
    p = q;
  }
  if (cur.length) recs.push(cur);
  return recs;
}

function get(r: Rec, key: number): number | string | undefined {
  for (const [k, , v] of r) if (k === key) return v;
  return undefined;
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

function buildTeams(d: Buffer): RosterTeam[] {
  const m = map();
  const k = Object.fromEntries(Object.entries(m.team).map(([hex, name]) => [name, keyOf(hex)]));
  return parseList(d, keyOf(m.teamsListKey))
    .map((r) => ({
      id: decodeSmall(Number(get(r, k.id) ?? 0)),
      name: String(get(r, k.name) ?? ''),
      city: String(get(r, k.city) ?? ''),
      abbr: String(get(r, k.abbr) ?? ''),
    }))
    .filter((t) => t.name);
}

function buildPlayers(d: Buffer, teams: RosterTeam[]): RosterPlayer[] {
  const m = map();
  const specs = new Map<number, FieldSpec>(Object.entries(m.fields).map(([hex, s]) => [keyOf(hex), s]));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const out: RosterPlayer[] = [];
  for (const r of parseList(d, keyOf(m.playersListKey))) {
    const f: Record<string, number | string> = {};
    const ratings: Record<string, number> = {};
    for (const [k, , v] of r) {
      const s = specs.get(k);
      if (!s?.name) continue;
      // Enum ids (college, archetype, state) and team ids use the same 6-bit
      // digits as the ratings; record ids and references do not.
      if (s.kind === 'rating') ratings[s.name] = decodeSmall(Number(v));
      else if (s.kind === 'small' || s.kind === 'enum' || s.name === 'teamId' || s.name === 'draftTeamId') f[s.name] = decodeSmall(Number(v));
      else f[s.name] = v;
    }
    if (f.lastName == null && f.firstName == null) continue;
    for (const key of RATING_KEYS) if (ratings[key] == null) ratings[key] = 0;
    const positionId = Number(f.positionId ?? 0);
    const teamId = Number(f.teamId ?? -1);
    const team = teamById.get(teamId);
    const isFa = !team || /free/i.test(team.name);
    const asset = f.assetName != null ? String(f.assetName) : null;
    const round = f.draftRound != null ? Number(f.draftRound) : null;
    out.push({
      id: Number(f.id ?? out.length),
      firstName: String(f.firstName ?? ''),
      lastName: String(f.lastName ?? ''),
      position: PositionMapper.name(positionId),
      positionId,
      teamId,
      team: isFa ? null : team!.abbr,
      teamName: isFa ? null : `${team!.city} ${team!.name}`,
      overall: Number(f.overall ?? 0),
      age: Number(f.age ?? 0),
      heightInches: Number(f.height ?? 0),
      weight: f.weight != null ? Number(f.weight) + 160 : 0, // stored as pounds over 160, like the franchise table
      jersey: Number(f.jersey ?? 0),
      yearsPro: Number(f.yearsPro ?? 0),
      devTrait: Math.max(0, Math.min(3, Number(f.devTrait ?? 0))),
      archetype: LookupService.idToName('archetype', Number(f.archetypeId ?? 0)) || null, // absent = 0, the position's first archetype
      college: f.collegeId != null ? LookupService.idToName('college', Number(f.collegeId)) || null : null,
      hometown: f.hometown != null ? String(f.hometown) : null,
      draftRound: round != null && round > 0 && round < 63 ? round : null,
      draftPick: f.draftPick != null && Number(f.draftPick) < 300 ? Number(f.draftPick) : null,
      assetName: asset,
      portrait: portraitFor(asset),
      ratings,
    });
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

function restore(id: string): Entry | null {
  if (!/^[a-f0-9]{16}$/.test(id)) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(OPENED_DIR, `${id}.roster.json`), 'utf8')) as { name: string; openedAt: number };
    const buf = fs.readFileSync(path.join(OPENED_DIR, `${id}.roster`));
    const e = build(buf, meta.name, id, meta.openedAt);
    entries.set(id, e);
    return e;
  } catch {
    return null;
  }
}

function build(buf: Buffer, name: string, id: string, openedAt: number): Entry {
  const off = payloadOffset(buf);
  if (off < 0) throw new Error('That is not a Madden 27 roster file');
  const d = inflate(buf, off);
  const teams = buildTeams(d);
  const players = buildPlayers(d, teams);
  if (!players.length) throw new Error('No players found in that roster file');
  return { id, name, gameVersion: 'm27', openedAt, count: players.length, teamCount: teams.filter((t) => !/free/i.test(t.name)).length, teams, players, buf: Buffer.from(buf) };
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
  open(buf: Buffer, name: string): RosterData {
    const clean = String(name || 'ROSTER').replace(/[\\/]+/g, '').slice(0, 64) || 'ROSTER';
    const id = crypto.randomBytes(8).toString('hex');
    const e = build(buf, clean, id, Date.now());
    entries.set(id, e);
    persist(e);
    return strip(e);
  },

  /** An opened roster, from memory or the on-disk copy. */
  get(id: string): RosterData | null {
    const e = entries.get(id) ?? restore(id);
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

  openFromSaves(name: string): RosterData {
    if (!SAVE_NAME.test(name)) throw new Error('not a roster file name');
    const file = path.join(M27_SAVES_DIR, name);
    if (!fs.existsSync(file)) throw new Error(`${name} is not in the Madden 27 Saves folder`);
    return RosterFileService.open(fs.readFileSync(file), name);
  },

  /** Parse without registering (tests, scripts). */
  parse(buf: Buffer, name = 'ROSTER'): RosterData {
    return strip(build(buf, name, '0000000000000000', Date.now()));
  },

  _reset(): void {
    entries.clear();
  },
};
