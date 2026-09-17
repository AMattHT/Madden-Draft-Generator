import type { PlayerFieldEdit } from './api';
import type { RosterData, RosterDoc, RosterPlayer } from './types';
import type { AppView } from './App';
import { POS_NAMES, DEV_NAMES } from './constants';

/** A roster player as the builder shows him: base values with the document's deltas applied. */
export interface ViewPlayer extends RosterPlayer {
  edited: boolean;
  moved: boolean;
}

export const POSITION_ORDER: string[] = POS_NAMES;

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

export function newRosterDoc(data: RosterData, fromSaves: boolean): RosterDoc {
  const now = Date.now();
  return {
    id: newId(),
    name: '',
    base: { fileName: data.name, openedId: data.id, sizeBytes: data.sizeBytes, crc: data.crc, fromSaves },
    moves: {},
    adds: [],
    edits: {},
    createdAt: now,
    updatedAt: now,
  };
}

/** The team a player is on once the document's moves apply. */
export function teamOf(doc: RosterDoc, p: RosterPlayer): number {
  return doc.moves[p.id] ?? p.teamId;
}

/** Move a player; moving him back to his base team drops the delta. */
export function withMove(doc: RosterDoc, pgid: number, teamId: number, data: RosterData): RosterDoc {
  const base = data.players.find((p) => p.id === pgid);
  if (!base) return doc;
  const moves = { ...doc.moves };
  if (teamId === base.teamId) delete moves[pgid];
  else moves[pgid] = teamId;
  return { ...doc, moves, updatedAt: Date.now() };
}

/** Merge a patch into a player's edits (ratings and gear merge one level deep). */
export function withEdit(doc: RosterDoc, pgid: number, patch: PlayerFieldEdit): RosterDoc {
  const prev = doc.edits[pgid] ?? {};
  const next: PlayerFieldEdit = { ...prev, ...patch };
  if (patch.ratings) next.ratings = { ...(prev.ratings ?? {}), ...patch.ratings };
  if (patch.gear) next.gear = { ...(prev.gear ?? {}), ...patch.gear };
  return { ...doc, edits: { ...doc.edits, [pgid]: next }, updatedAt: Date.now() };
}

export function withoutEdits(doc: RosterDoc, pgid: number): RosterDoc {
  const edits = { ...doc.edits };
  delete edits[pgid];
  return { ...doc, edits, updatedAt: Date.now() };
}

const DEV_KEY: Record<string, number> = { Normal: 0, Star: 1, Superstar: 2, XFactor: 3 };

/** Every base player with moves and edits applied. */
export function viewPlayers(doc: RosterDoc, data: RosterData): ViewPlayer[] {
  const teamById = new Map(data.teams.map((t) => [t.id, t]));
  return data.players.map((p) => {
    const e = doc.edits[p.id];
    const teamId = teamOf(doc, p);
    const team = teamById.get(teamId);
    const isFa = teamId === data.freeAgentTeamId || !team;
    const position = e?.position && POS_NAMES.includes(e.position) ? e.position : p.position;
    return {
      ...p,
      teamId,
      team: isFa ? null : team!.abbr,
      teamName: isFa ? null : `${team!.city} ${team!.name}`,
      overall: e?.overall ?? p.overall,
      age: e?.age ?? p.age,
      jersey: e?.jersey ?? p.jersey,
      position,
      positionId: POS_NAMES.indexOf(position),
      devTrait: e?.dev != null && e.dev in DEV_KEY ? DEV_KEY[e.dev] : p.devTrait,
      ratings: e?.ratings ? { ...p.ratings, ...e.ratings } : p.ratings,
      visuals: {
        bodyType: e?.bodyType ?? p.visuals.bodyType,
        genericHead: e?.genericHead ?? p.visuals.genericHead,
        helmet: e?.gear?.helmet ?? p.visuals.helmet,
        facemask: e?.gear?.facemask ?? p.visuals.facemask,
      },
      edited: !!e,
      moved: doc.moves[p.id] != null,
    };
  });
}

export function docCounts(doc: RosterDoc, data: RosterData): { moved: number; cut: number; edited: number } {
  let moved = 0, cut = 0;
  for (const t of Object.values(doc.moves)) { if (t === data.freeAgentTeamId) cut++; else moved++; }
  return { moved, cut, edited: Object.keys(doc.edits).length };
}

export function isDocEmpty(doc: RosterDoc): boolean {
  return !Object.keys(doc.moves).length && !Object.keys(doc.edits).length && !doc.adds.length;
}

/** Players of one team, grouped by position in Madden order; empty groups are left out. */
export function groupByPosition<T extends RosterPlayer>(players: T[]): { position: string; players: T[] }[] {
  const out: { position: string; players: T[] }[] = [];
  for (const position of POSITION_ORDER) {
    const ps = players.filter((p) => p.position === position).sort((a, b) => b.overall - a.overall || a.lastName.localeCompare(b.lastName));
    if (ps.length) out.push({ position, players: ps });
  }
  return out;
}

export const devLabel = (dev: number) => DEV_NAMES[dev] ?? DEV_NAMES[0];

export interface RailEntry { view: AppView; label: string; icon: string }
const ICON_HOME = 'M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z';
const ICON_DRAFT = 'M5 8l7 4 7-4M5 13l7 4 7-4';
const ICON_ROSTERS = 'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0';
const ICON_FRANCHISE = 'M12 3l7 3v5c0 4.2-3 7.4-7 8.5-4-1.1-7-4.3-7-8.5V6l7-3z';

export function railEntries(franchiseEnabled: boolean): RailEntry[] {
  const out: RailEntry[] = [
    { view: 'home', label: 'Home', icon: ICON_HOME },
    { view: 'draft', label: 'Draft classes', icon: ICON_DRAFT },
    { view: 'rosters', label: 'Rosters', icon: ICON_ROSTERS },
  ];
  if (franchiseEnabled) out.push({ view: 'franchise', label: 'Franchise tools', icon: ICON_FRANCHISE });
  return out;
}
