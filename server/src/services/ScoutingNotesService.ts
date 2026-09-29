import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../config/paths';
import { PositionMapper } from './PositionMapper';

/**
 * Scout's read, using Madden 27's own draft notes.
 *
 * Each position has a list of attributes in franchise-tuning-binary
 * (DraftAttributeBullet + DraftPlayerAttributeBullets). A rating at or above
 * that attribute's cutoff takes one of the good sentences; below it, one of
 * the bad ones. The game stores several sentences per side and does not record
 * which one it prints, so the choice is stable per player id. A side that is
 * still an EA placeholder is skipped. Edge and off-ball linebacker ids use the
 * game's LE/RE and LOLB/MLB/ROLB lists.
 */

/** Madden attribute code -> the rating key on a prospect. */
export const MADDEN_NOTE_ATTRS: Record<string, string> = {
  AWR: 'awareness',
  BSH: 'blockShedding',
  BTK: 'breakTackle',
  CAR: 'carrying',
  CIT: 'catchInTraffic',
  CTH: 'catching',
  DAC: 'throwAccuracyDeep',
  DRR: 'deepRouteRunning',
  FMV: 'finesseMoves',
  JKM: 'jukeMove',
  JMP: 'jumping',
  KAC: 'kickAccuracy',
  KPW: 'kickPower',
  LBK: 'leadBlock',
  LSP: 'longSnap',
  MAC: 'throwAccuracyMid',
  MCV: 'manCoverage',
  MRR: 'mediumRouteRunning',
  PBF: 'passBlockFinesse',
  PBK: 'passBlock',
  PBP: 'passBlockPower',
  PMV: 'powerMoves',
  POW: 'hitPower',
  PRC: 'playRecognition',
  PRS: 'pressCoverage',
  PUR: 'pursuit',
  RBF: 'runBlockFinesse',
  RBK: 'runBlock',
  RBP: 'runBlockPower',
  RET: 'kickReturn',
  RUN: 'throwOnTheRun',
  SAC: 'throwAccuracyShort',
  SPC: 'spectacularCatch',
  SPD: 'speed',
  SPM: 'spinMove',
  SRR: 'shortRouteRunning',
  STR: 'strength',
  TAK: 'tackle',
  THP: 'throwPower',
  TRK: 'trucking',
  TUP: 'throwUnderPressure',
  ZCV: 'zoneCoverage',
};

/** Our position name -> the name on the game's per-position bullet list. */
const BULLET_POSITION: Record<string, string> = {
  LEDG: 'LE', REDG: 'RE', SAM: 'LOLB', MIKE: 'MLB', WILL: 'ROLB',
};

interface Bullet { index: number; attribute: string; threshold: number; good: string[]; bad: string[] }
interface NotesFile { attributeBullets: Bullet[]; byPosition: Record<string, number[]> }

let file: NotesFile | null = null;
let bulletsByIndex: Map<number, Bullet> | null = null;

function load(): { file: NotesFile; byIndex: Map<number, Bullet> } {
  if (file && bulletsByIndex) return { file, byIndex: bulletsByIndex };
  file = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'm27-scouting-notes.json'), 'utf8')) as NotesFile;
  bulletsByIndex = new Map(file.attributeBullets.map((b) => [b.index, b]));
  return { file, byIndex: bulletsByIndex };
}

function isReal(line: string): boolean {
  return line.length > 0 && !line.includes('PLACEHOLDER') && !line.startsWith('DraftAttributeBullet');
}

/** FNV-1a over "id|key": stable across runs and machines. */
function hash(id: number, key: string): number {
  let h = 0x811c9dc5;
  for (const ch of `${id}|${key}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

export interface ScoutingInput { id: number; positionId: number; ratings: Record<string, number> }

export function scoutingNotes({ id, positionId, ratings }: ScoutingInput): string[] {
  const { file, byIndex } = load();
  const name = PositionMapper.name(positionId);
  const indexes = file.byPosition[BULLET_POSITION[name] ?? name] ?? [];
  const lines: string[] = [];
  for (const index of indexes) {
    const bullet = byIndex.get(index);
    if (!bullet) continue;
    const key = MADDEN_NOTE_ATTRS[bullet.attribute];
    if (!key) continue;
    const value = Number(ratings[key]);
    if (!Number.isFinite(value)) continue;
    const pool = (value >= bullet.threshold ? bullet.good : bullet.bad).filter(isReal);
    if (pool.length === 0) continue;
    lines.push(pool[hash(id, bullet.attribute) % pool.length]);
  }
  return lines;
}

/** Notes for a prospect. `version` is unused: both games show the M27 note table. */
export function scoutingFor(id: number, positionId: number, ratings: Record<string, number>, _version: 'm26' | 'm27'): string[] {
  return scoutingNotes({ id, positionId, ratings });
}
