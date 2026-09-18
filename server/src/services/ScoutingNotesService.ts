import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../config/paths';

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
