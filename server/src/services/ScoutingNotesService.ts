import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../config/paths';
import { PositionMapper } from './PositionMapper';
import { CalibrationService, type PosProfile } from './CalibrationService';

/**
 * Scout's read for the blind-scouting card: two to four sentences derived from the
 * hidden attributes, never a number. Thresholds are in position standard deviations
 * (see docs/superpowers/specs/2026-09-17-scouting-notes-design.md).
 */

/** Signature attributes per position group. MUST mirror KEY_ATTRS in web/src/constants.ts. */
export const SIGNATURE_ATTRS: Record<string, string[]> = {
  QB: ['throwPower', 'throwAccuracyShort', 'throwAccuracyDeep', 'throwOnTheRun', 'awareness', 'speed'],
  RB: ['speed', 'acceleration', 'agility', 'breakTackle', 'carrying', 'ballCarrierVision', 'jukeMove'],
  WR: ['speed', 'catching', 'shortRouteRunning', 'deepRouteRunning', 'release', 'agility', 'catchInTraffic'],
  TE: ['catching', 'shortRouteRunning', 'runBlock', 'speed', 'strength', 'catchInTraffic'],
  OL: ['runBlock', 'passBlock', 'strength', 'awareness', 'impactBlocking', 'runBlockPower'],
  EDGE: ['powerMoves', 'finesseMoves', 'speed', 'strength', 'blockShedding', 'pursuit', 'tackle'],
  IDL: ['powerMoves', 'blockShedding', 'strength', 'tackle', 'pursuit', 'playRecognition'],
  LB: ['tackle', 'speed', 'pursuit', 'playRecognition', 'hitPower', 'zoneCoverage', 'blockShedding'],
  CB: ['speed', 'manCoverage', 'zoneCoverage', 'pressCoverage', 'acceleration', 'playRecognition', 'catching'],
  S: ['speed', 'zoneCoverage', 'manCoverage', 'tackle', 'hitPower', 'playRecognition', 'pursuit'],
  K: ['kickPower', 'kickAccuracy', 'awareness'],
  P: ['kickPower', 'kickAccuracy', 'awareness'],
  LS: ['longSnap', 'awareness', 'strength'],
};

export interface PhraseCell { strength: { strong: string[]; mild: string[] }; weakness: { strong: string[]; mild: string[] } }
export interface PhraseFile { _source?: string; neutral: Record<string, string>; attrs: Record<string, PhraseCell> }

let phrases: PhraseFile | null = null;
export function loadPhrases(): PhraseFile {
  if (phrases) return phrases;
  phrases = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'scouting-phrases.json'), 'utf8')) as PhraseFile;
  return phrases;
}

export interface ScoutingInput { id: number; positionId: number; ratings: Record<string, number>; profile: PosProfile }

const MILD = 0.8, STRONG = 1.6, FALLBACK_STD = 8;
const MAX_STRENGTHS = 3, MAX_WEAKNESSES = 2, MAX_LINES = 4, MIN_LINES = 2;

/** FNV-1a over "id|key": stable across runs and machines. */
function hash(id: number, key: string): number {
  let h = 0x811c9dc5;
  for (const ch of `${id}|${key}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

export function scoutingNotes({ id, positionId, ratings, profile }: ScoutingInput): string[] {
  const group = PositionMapper.groupFromId(positionId);
  const keys = SIGNATURE_ATTRS[group] ?? SIGNATURE_ATTRS.WR;
  const phrases = loadPhrases();
  const scored = keys.map((key) => {
    const mean = Number(profile.attrs?.[key]);
    const spread = Number(profile.attrStats?.[key]?.std);
    const std = spread > 0 ? spread : FALLBACK_STD; // a zero or missing spread (LS.longSnap is 0) would blow z up
    const value = Number(ratings[key]);
    const z = Number.isFinite(mean) && Number.isFinite(value) ? (value - mean) / std : 0;
    return { key, z, abs: Math.abs(z) };
  });
  const strengths = scored.filter((s) => s.z >= MILD).sort((a, b) => b.abs - a.abs).slice(0, MAX_STRENGTHS);
  const weaknesses = scored.filter((s) => s.z <= -MILD).sort((a, b) => b.abs - a.abs).slice(0, MAX_WEAKNESSES);
  const picked = [...strengths, ...weaknesses].slice(0, MAX_LINES);
  if (picked.length < MIN_LINES) return [phrases.neutral[group] ?? phrases.neutral.WR];
  return picked.map(({ key, z, abs }) => {
    const cell = phrases.attrs[key];
    const list = cell[z > 0 ? 'strength' : 'weakness'][abs >= STRONG ? 'strong' : 'mild'];
    return list[hash(id, key) % list.length];
  });
}

/** Notes from the calibration profile of the player's position (the same profile his ratings were generated against). */
export function scoutingFor(id: number, positionId: number, ratings: Record<string, number>, version: 'm26' | 'm27'): string[] {
  return scoutingNotes({ id, positionId, ratings, profile: CalibrationService.positionProfile(PositionMapper.name(positionId), version) });
}
