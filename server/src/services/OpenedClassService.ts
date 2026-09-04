import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { CACHE_DIR, MDC_BLOCK_SIZE, MDC_DATA_START, M27_BLOCK_SIZE, M27_DATA_START, M27_SAVES_DIR } from '../config/paths';
import { MdcService, MdcProspect } from './MdcService';
import { Mdc27Service } from './Mdc27Service';
import { PositionMapper } from './PositionMapper';
import { LookupService } from './LookupService';
import { PortraitService } from './PortraitService';
import { PersonaService } from './PersonaService';
import { FranchiseService } from './FranchiseService';
import {
  RATING_KEYS,
  applyEdits,
  applyGearEdits,
  gearSlots,
  neutralizeBlock,
  type ClassEdits,
  type GearEdits,
  type PreviewRow,
  type PreviewResult,
} from './DraftClassBuilder';

/**
 * A draft class opened from a file: a CAREERDRAFT-* the user exported earlier, one
 * the game wrote, or one downloaded from the community. The file is parsed with
 * the game's own record layout (detected from the block size), shown on the normal
 * board with every editor working, and written back into a copy of the ORIGINAL
 * bytes so its header and any extra blocks survive. The game format is kept: a
 * Madden 26 file exports as Madden 26.
 *
 * Opened files are kept under CACHE_DIR/opened/<id>.mdc with a JSON sidecar so a
 * page reload (or an API restart) can show the class again; the newest KEEP files
 * are retained.
 */
export type GameVersion = 'm26' | 'm27';

export interface OpenedClass {
  id: string;
  name: string; // the file name as opened (CAREERDRAFT-1998DRAFT)
  gameVersion: GameVersion;
  openedAt: number;
}

export interface SaveFileInfo {
  name: string;
  sizeBytes: number;
  modified: number;
}

const OPENED_DIR = path.join(CACHE_DIR, 'opened');
const KEEP = 20;
const SAVE_NAME = /^CAREERDRAFT[A-Za-z0-9_.-]*$/;

interface Entry extends OpenedClass {
  buf: Buffer;
  prospects: MdcProspect[]; // used blocks, in file order (block i = pick i)
  preview?: PreviewResult;
}

const entries = new Map<string, Entry>();

/** The game a .mdc was written for, from its record size; null when it is neither. */
export function detectGame(buf: Buffer): GameVersion | null {
  if (!buf || buf.length <= M27_DATA_START + M27_BLOCK_SIZE) return null;
  const m27 = (buf.length - M27_DATA_START) % M27_BLOCK_SIZE === 0;
  const m26 = (buf.length - MDC_DATA_START) % MDC_BLOCK_SIZE === 0;
  if (m27 && !m26) return 'm27';
  if (m26 && !m27) return 'm26';
  if (m26 && m27) {
    // Both divide (rare): the M27 visual region starts with '{' JSON; M26 is compressed.
    return buf[M27_DATA_START] === 0x7b ? 'm27' : 'm26';
  }
  return null;
}

function faceOf(p: MdcProspect): 'asset' | 'generic' {
  const peps = String(p.PEPS || '').toLowerCase();
  return peps && !peps.startsWith('gen_') ? 'asset' : 'generic';
}

function genericHeadOf(p: MdcProspect): string | null {
  const v = String(p.PEPS || (p.visuals as { genericHeadName?: string } | null)?.genericHeadName || '');
  return /^gen_\d/i.test(v) ? v : null;
}

function rowsFor(e: Entry): PreviewResult {
  let asset = 0, generic = 0, withPortrait = 0;
  const rows: PreviewRow[] = e.prospects.map((p, i) => {
    const ratings: Record<string, number> = {};
    for (const k of RATING_KEYS) ratings[k] = Number(p[k]) || 0;
    const face = faceOf(p);
    const gh = genericHeadOf(p);
    const visTone = Number((p.visuals as { skinTone?: number } | null)?.skinTone);
    const tone = gh ? parseInt(gh.match(/^gen_(\d+)/i)?.[1] ?? '4', 10) : visTone >= 1 && visTone <= 8 ? visTone : 4;
    const pid = Number(p.PID) || 0;
    if (face === 'asset') asset++; else generic++;
    if (pid > 0) withPortrait++;
    const own = pid > 0 ? PortraitService.plpoForPid(pid) : null;
    const plpo = own ?? PortraitService.plpoFor(0, tone, `${p.firstName}|${p.lastName}|${i}`);
    const dna = Array.isArray(p.personaDNA) ? (p.personaDNA as number[]) : null;
    const posId = Number(p.position) || 0;
    return {
      id: i + 1,
      pick: i + 1,
      firstName: String(p.firstName ?? ''),
      lastName: String(p.lastName ?? ''),
      position: PositionMapper.name(posId),
      positionId: posId,
      overall: Number(p.overall) || 0,
      devTrait: Number(p.devTrait) || 0,
      archetype: Number(p.archetype) || 0,
      archetypeName: LookupService.idToName('archetype', Number(p.archetype) || 0) || '',
      round: Number(p.draftRound) > 0 && Number(p.draftRound) < 63 ? Number(p.draftRound) : null,
      draftPick: Number(p.draftPick) || null,
      wav: null,
      wavSource: 'preset', // as the file has him; no career behind the number
      srcIdx: i,
      twoWay: null,
      face,
      faceSource: face === 'asset' ? 'file' : null,
      skinTone: tone,
      genericHead: gh,
      toneSource: null,
      likenessFixed: false,
      college: LookupService.idToName('college', Number(p.college)) || '',
      age: Number(p.age) || 0,
      heightInches: Number(p.heightInches) || 0,
      weight: Number(p.weight) || 0,
      jersey: Number(p.jerseyNum) || 0,
      bodyType: String(p.bodyType || 'Standard'),
      draftYear: 0,
      photoUrl: null,
      portrait: plpo ? `/api/portrait/plpo/${plpo}` : null,
      gamePortrait: own ? `/api/portrait/plpo/${own}` : null,
      persona: e.gameVersion === 'm27' && dna ? dna.map((d) => PersonaService.name(d)) : undefined,
      gear: gearSlots(p),
      ratings,
    } as PreviewRow;
  });
  return { rows, likeness: { asset, generic, withPortrait, customPortrait: 0 }, count: rows.length, dropped: [], included: [], launchCount: 0 } as PreviewResult;
}

function parseFor(buf: Buffer, gameVersion: GameVersion): MdcProspect[] {
  const all = gameVersion === 'm27' ? Mdc27Service.parse(buf) : MdcService.parse(buf);
  // Used blocks only, in file order: block i is pick i in the game.
  return all.filter((p) => String(p.firstName || '').trim().length > 0);
}

function persist(e: Entry): void {
  try {
    fs.mkdirSync(OPENED_DIR, { recursive: true });
    fs.writeFileSync(path.join(OPENED_DIR, `${e.id}.mdc`), e.buf);
    fs.writeFileSync(path.join(OPENED_DIR, `${e.id}.json`), JSON.stringify({ id: e.id, name: e.name, gameVersion: e.gameVersion, openedAt: e.openedAt }));
    // Keep the newest KEEP files; a class is ~2 MB.
    const sidecars = fs.readdirSync(OPENED_DIR).filter((f) => f.endsWith('.json'))
      .map((f) => ({ f, t: fs.statSync(path.join(OPENED_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const { f } of sidecars.slice(KEEP)) {
      const id = f.replace(/\.json$/, '');
      for (const ext of ['.json', '.mdc']) { try { fs.unlinkSync(path.join(OPENED_DIR, `${id}${ext}`)); } catch { /* gone */ } }
      entries.delete(id);
    }
  } catch {
    // Persistence is a convenience (reload / restart); the class is open in memory regardless.
  }
}

function restore(id: string): Entry | null {
  if (!/^[a-f0-9]{16}$/.test(id)) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(OPENED_DIR, `${id}.json`), 'utf8')) as OpenedClass;
    const buf = fs.readFileSync(path.join(OPENED_DIR, `${id}.mdc`));
    const gameVersion: GameVersion = meta.gameVersion === 'm27' ? 'm27' : 'm26';
    const e: Entry = { id, name: meta.name, gameVersion, openedAt: meta.openedAt, buf, prospects: parseFor(buf, gameVersion) };
    entries.set(id, e);
    return e;
  } catch {
    return null;
  }
}

function savesDirFor(gameVersion: GameVersion): string {
  return gameVersion === 'm27' ? M27_SAVES_DIR : FranchiseService.savesDir();
}

export const OpenedClassService = {
  detectGame,

  /** Parse and register a file's bytes. Throws with a user-facing message when it is not a draft class. */
  open(buf: Buffer, name: string): OpenedClass & { count: number } {
    const gameVersion = detectGame(buf);
    if (!gameVersion) throw new Error('That is not a Madden draft class file (the record size matches neither Madden 26 nor Madden 27)');
    const prospects = parseFor(buf, gameVersion);
    if (!prospects.length) throw new Error('That draft class file has no prospects in it');
    const clean = String(name || 'CAREERDRAFT').replace(/[\\/]+/g, '').replace(/\.mdc$/i, '').slice(0, 64) || 'CAREERDRAFT';
    const id = crypto.randomBytes(8).toString('hex');
    const e: Entry = { id, name: clean, gameVersion, openedAt: Date.now(), buf: Buffer.from(buf), prospects };
    entries.set(id, e);
    persist(e);
    return { id, name: clean, gameVersion, openedAt: e.openedAt, count: prospects.length };
  },

  /** An opened class by id (from memory, else the on-disk copy), or null. */
  get(id: string): (OpenedClass & { count: number }) | null {
    const e = entries.get(id) ?? restore(id);
    if (!e) return null;
    return { id: e.id, name: e.name, gameVersion: e.gameVersion, openedAt: e.openedAt, count: e.prospects.length };
  },

  /** The board rows for an opened class (same shape as a generated preview). */
  preview(id: string): PreviewResult | null {
    const e = entries.get(id) ?? restore(id);
    if (!e) return null;
    if (!e.preview) e.preview = rowsFor(e);
    return e.preview;
  },

  /** The class with edits applied, written into a copy of the original file. */
  write(id: string, edits?: ClassEdits, gearEdits?: GearEdits): { buffer: Buffer; filename: string; gameVersion: GameVersion; count: number } | null {
    const e = entries.get(id) ?? restore(id);
    if (!e) return null;
    const clone = e.prospects.map((p) => ({ ...p, visuals: p.visuals && typeof p.visuals === 'object' ? JSON.parse(JSON.stringify(p.visuals)) : p.visuals }));
    applyEdits(clone, edits, e.gameVersion);
    applyGearEdits(clone, gearEdits);
    const original = Buffer.from(e.buf);
    let buffer: Buffer;
    if (e.gameVersion === 'm27') {
      buffer = Mdc27Service.write(clone, original);
    } else {
      buffer = MdcService.write(clone, original);
      const capacity = MdcService.capacity(buffer);
      for (let i = clone.length; i < capacity; i++) neutralizeBlock(buffer, i);
    }
    return { buffer, filename: e.name, gameVersion: e.gameVersion, count: clone.length };
  },

  /** Where a game keeps its saves (the folder the picker lists). */
  savesDir: savesDirFor,

  /** Draft-class files in a game's Saves folder, newest first. */
  listSaves(gameVersion: GameVersion): SaveFileInfo[] {
    const dir = savesDirFor(gameVersion);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((f) => SAVE_NAME.test(f) && !/\.(bak|tmp.*)$/i.test(f))
      .map((f) => { const st = fs.statSync(path.join(dir, f)); return { name: f, sizeBytes: st.size, modified: st.mtimeMs }; })
      .filter((f) => f.sizeBytes > MDC_DATA_START + MDC_BLOCK_SIZE)
      .sort((a, b) => b.modified - a.modified);
  },

  /** Open a draft class straight from a game's Saves folder by file name. */
  openFromSaves(gameVersion: GameVersion, name: string): OpenedClass & { count: number } {
    if (!SAVE_NAME.test(name)) throw new Error('not a draft class file name');
    const file = path.join(savesDirFor(gameVersion), name);
    if (!fs.existsSync(file)) throw new Error(`${name} is not in the Madden ${gameVersion === 'm27' ? '27' : '26'} Saves folder`);
    return OpenedClassService.open(fs.readFileSync(file), name);
  },

  /** Tests: forget everything opened in this process. */
  _reset(): void {
    entries.clear();
  },
};
