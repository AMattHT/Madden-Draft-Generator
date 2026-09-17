import type { ArchetypeOption, PersonaFocusOption, PersonaTrait, PlayerFieldEdit } from './api';
import type { PlayerRow, RosterPlayer } from './types';
import { ATTR_GROUPS, POS_NAMES } from './constants';

/** Lookups the card needs to name ids: persona traits and focus options, colleges, archetypes by position. */
export interface CardCtx {
  traits: PersonaTrait[];
  focus: PersonaFocusOption[];
  colleges: { id: number; name: string }[];
  archetypes: Record<string, ArchetypeOption[]>;
}

const DEV_NAME = ['Normal', 'Star', 'Superstar', 'XFactor'];
const DEV_KEY: Record<string, number> = { Normal: 0, Star: 1, Superstar: 2, XFactor: 3 };
const RATING_KEYS = new Set(ATTR_GROUPS.flatMap((g) => g.keys));

/** The card's row for a roster player (base or added) with no edits applied: edits ride in the patch. */
export function rowFor(p: RosterPlayer, ctx: CardCtx, draftYearHint?: number): PlayerRow {
  const gear: Record<string, string> = {};
  if (p.visuals.helmet) gear.helmet = p.visuals.helmet;
  if (p.visuals.facemask) gear.facemask = p.visuals.facemask;
  return {
    id: p.id,
    pick: 0,
    firstName: p.firstName,
    lastName: p.lastName,
    position: p.position,
    positionId: p.positionId,
    overall: p.overall,
    devTrait: p.devTrait,
    archetype: p.archetypeId,
    archetypeName: p.archetype ?? '',
    draftYear: draftYearHint ?? 2026 - p.yearsPro,
    round: p.draftRound,
    draftPick: p.draftPick,
    wav: null,
    wavSource: 'preset',
    face: p.face,
    skinTone: p.skinTone,
    genericHead: p.visuals.genericHead || null,
    college: p.college ?? '',
    age: p.age,
    heightInches: p.heightInches,
    weight: p.weight,
    jersey: p.jersey,
    bodyType: p.visuals.bodyType || 'Standard',
    photoUrl: null,
    portrait: p.portrait,
    gamePortrait: p.portrait,
    persona: p.personaDNA.map((id) => ctx.traits.find((t) => t.id === id)?.name ?? `#${id}`),
    focus: ctx.focus.find((f) => f.id === p.focus)?.name,
    gear,
    ratings: p.ratings,
  };
}

/** A roster edit as the card's patch (the draft editor's vocabulary). */
export function patchFor(e: PlayerFieldEdit | undefined, _base: RosterPlayer): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  if (!e) return out;
  if (e.overall != null) out.overall = e.overall;
  if (e.ratings) for (const [k, v] of Object.entries(e.ratings)) if (v != null) out[k] = v;
  if (e.position && POS_NAMES.includes(e.position)) out.position = POS_NAMES.indexOf(e.position);
  if (e.dev && e.dev in DEV_KEY) out.devTrait = DEV_KEY[e.dev];
  if (e.jersey != null) out.jerseyNum = e.jersey;
  if (e.age != null) out.age = e.age;
  if (e.heightInches != null) out.heightInches = e.heightInches;
  if (e.weight != null) out.weight = e.weight;
  if (e.firstName != null) out.firstName = e.firstName;
  if (e.lastName != null) out.lastName = e.lastName;
  if (e.college != null) out.college = e.college;
  if (e.archetype != null) out.archetype = e.archetype;
  if (e.bodyType) out.bodyType = e.bodyType;
  if (e.genericHead) out.genericHeadName = e.genericHead;
  if (e.faceAsset) out.faceAsset = e.faceAsset;
  if (e.skinTone != null) out.skinTone = e.skinTone;
  if (e.personaDNA) out.personaDNA = e.personaDNA.join(',');
  if (e.focus != null) out.focus = String(e.focus);
  return out;
}

/** One card edit as a roster patch to merge with withEdit. Unknown fields return null. */
export function editFromCard(field: string, value: number | string): PlayerFieldEdit | null {
  const n = Number(value);
  if (RATING_KEYS.has(field)) return Number.isFinite(n) ? { ratings: { [field]: n } } : null;
  switch (field) {
    case 'overall': case 'age': case 'heightInches': case 'weight': case 'college': case 'archetype': case 'skinTone':
      return Number.isFinite(n) ? { [field]: n } : null;
    case 'jerseyNum': return Number.isFinite(n) ? { jersey: n } : null;
    case 'position': return POS_NAMES[n] ? { position: POS_NAMES[n] } : null;
    case 'devTrait': return DEV_NAME[n] ? { dev: DEV_NAME[n] } : null;
    case 'firstName': case 'lastName': case 'bodyType': case 'faceAsset':
      return { [field]: String(value) };
    case 'genericHeadName': return { genericHead: String(value) };
    case 'personaDNA':
      return { personaDNA: String(value).split(',').map((s) => parseInt(s.trim(), 10)).filter((x) => Number.isFinite(x) && x > 0) };
    case 'focus': return Number.isFinite(n) ? { focus: n } : null;
    default: return null;
  }
}
