import type { PlayerFieldEdit } from './api';
import type { GeneratedRosterPlayer, RosterData, RosterDoc, RosterPlayer } from './types';
import type { AppView } from './App';
import { POS_NAMES, DEV_NAMES } from './constants';

/** A roster player as the builder shows him: base values with the document's deltas applied. */
export interface ViewPlayer extends RosterPlayer {
  edited: boolean;
  moved: boolean;
  /** From the player pool (not in the base file); `tempId` keys his edits and moves. */
  added: boolean;
  tempId?: string;
}

export const POSITION_ORDER: string[] = POS_NAMES;

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

export function newRosterDoc(data: RosterData, fromSaves: boolean, fresh = false): RosterDoc {
  const now = Date.now();
  return {
    id: newId(),
    name: '',
    fresh,
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

/** Merge a patch into a player's edits (ratings and gear merge one level deep). Added players use their tempId. */
export function withEdit(doc: RosterDoc, id: number | string, patch: PlayerFieldEdit): RosterDoc {
  const prev = doc.edits[id] ?? {};
  const next: PlayerFieldEdit = { ...prev, ...patch };
  if (patch.ratings) next.ratings = { ...(prev.ratings ?? {}), ...patch.ratings };
  if (patch.gear) next.gear = { ...(prev.gear ?? {}), ...patch.gear };
  return { ...doc, edits: { ...doc.edits, [id]: next }, updatedAt: Date.now() };
}

export function withoutEdits(doc: RosterDoc, id: number | string): RosterDoc {
  const edits = { ...doc.edits };
  delete edits[id];
  return { ...doc, edits, updatedAt: Date.now() };
}

/** A stable negative id for an added player, so he can sit in lists keyed by number. */
export function addId(tempId: string): number {
  let h = 2166136261;
  for (let i = 0; i < tempId.length; i++) { h ^= tempId.charCodeAt(i); h = Math.imul(h, 16777619); }
  return -((h >>> 0) % 1_000_000_000 + 1);
}

export const addedKeys = (doc: RosterDoc) => new Set(doc.adds.map((a) => a.key));

/** Add a pool player to a team; a key already in the document is left where it is. */
export function withAdd(doc: RosterDoc, key: string, teamId: number): RosterDoc {
  if (doc.adds.some((a) => a.key === key)) return doc;
  return { ...doc, adds: [...doc.adds, { tempId: newId(), key, teamId }], updatedAt: Date.now() };
}

export function withoutAdd(doc: RosterDoc, tempId: string): RosterDoc {
  const edits = { ...doc.edits };
  delete edits[tempId];
  return { ...doc, adds: doc.adds.filter((a) => a.tempId !== tempId), edits, updatedAt: Date.now() };
}

export function withAddMove(doc: RosterDoc, tempId: string, teamId: number): RosterDoc {
  return { ...doc, adds: doc.adds.map((a) => (a.tempId === tempId ? { ...a, teamId } : a)), updatedAt: Date.now() };
}

const DEV_KEY: Record<string, number> = { Normal: 0, Star: 1, Superstar: 2, XFactor: 3 };

/** A player with his team resolved and an edit patch laid over him. */
function overlay(p: RosterPlayer, e: PlayerFieldEdit | undefined, teamId: number, data: RosterData): RosterPlayer {
  const team = data.teams.find((t) => t.id === teamId);
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
  };
}

/** A pool player's preview as a roster player (before edits). */
export function playerFromPreview(g: GeneratedRosterPlayer, id: number, teamId: number, jersey?: number): RosterPlayer {
  return {
    id, firstName: g.firstName, lastName: g.lastName, position: g.position, positionId: g.positionId,
    teamId, team: null, teamName: null,
    overall: g.overall, age: g.age, heightInches: g.heightInches, weight: g.weight, jersey: jersey ?? g.jersey,
    yearsPro: g.yearsPro, devTrait: g.devTrait, archetype: g.archetype, college: g.college, hometown: g.hometown,
    draftRound: g.draftRound < 63 ? g.draftRound : null, draftPick: g.draftPick || null,
    assetName: g.assetName || null, portrait: g.portrait, ratings: { ...g.ratings },
    visuals: { bodyType: g.bodyType, genericHead: g.genericHead, helmet: g.gear.helmet ?? '', facemask: g.gear.facemask ?? '' },
    archetypeId: g.archetypeId, collegeId: g.collegeId, homeState: g.homeStateId, skinTone: g.skinTone,
    personaDNA: [...g.personaDNA], focus: g.focus, face: g.assetName ? 'asset' : 'generic',
  };
}

/** Every base player with moves and edits applied, then the adds that have a preview. */
export function viewPlayers(doc: RosterDoc, data: RosterData, previews: Record<string, GeneratedRosterPlayer> = {}): ViewPlayer[] {
  // A roster from scratch shows only the adds; the base players exist just to lend the file its shape.
  const basePlayers = doc.fresh === true ? [] : data.players;
  const out: ViewPlayer[] = basePlayers.map((p) => ({
    ...overlay(p, doc.edits[p.id], teamOf(doc, p), data),
    edited: !!doc.edits[p.id],
    moved: doc.moves[p.id] != null,
    added: false,
  }));
  for (const a of doc.adds) {
    const g = previews[a.key];
    if (!g) continue;
    const base = playerFromPreview(g, addId(a.tempId), a.teamId, a.jersey);
    out.push({ ...overlay(base, doc.edits[a.tempId], a.teamId, data), edited: !!doc.edits[a.tempId], moved: false, added: true, tempId: a.tempId });
  }
  return out;
}

export function docCounts(doc: RosterDoc, data: RosterData): { moved: number; cut: number; edited: number; added: number } {
  let moved = 0, cut = 0;
  if (doc.fresh !== true) for (const t of Object.values(doc.moves)) { if (t === data.freeAgentTeamId) cut++; else moved++; }
  return { moved, cut, edited: Object.keys(doc.edits).length, added: doc.adds.length };
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
