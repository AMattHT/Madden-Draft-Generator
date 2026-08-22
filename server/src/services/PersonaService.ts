import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../config/paths';

/**
 * Persona DNA assignment for generated M27 prospects.
 *
 * Calibrated against a real M27 career-save census (2,985 players, all 20
 * ACQ_DNA_* slots — see data/lookups/m27-persona-freq.json):
 *  - Real players carry 4–8 traits (mode 5; elites avg ~6, fringe ~5).
 *  - The draft-class binary holds FIVE U16 slots (attr+0xca), so we write 3–5.
 *  - WinAtAllCosts (id 2) is filtered out of imported rookies by the game
 *    (observed in-game twice) — excluded from generation.
 *  - Trait picks are frequency-weighted (real league mix), position-tilted 3x,
 *    unique per player, deterministic by name.
 */

/** Full 64-value DNA enum (M27 Player-table schema order). */
export const DNA = {
  Invalid: 0, TeamFirst: 1, WinAtAllCosts: 2, Diva: 3, FamilyFocused: 4, Mentor: 5,
  StudentOfTheGame: 6, Accountable: 7, Aggressive: 8, Ambitious: 9, Approachable: 10,
  Assertive: 11, Calculated: 12, Cerebral: 13, Charismatic: 14, Collaborative: 15,
  OverlyCompetitive: 16, Composed: 17, Confident: 18, Conscientious: 19, Contractminded: 20,
  Curious: 21, Demanding: 22, Diplomatic: 23, Direct: 24, Disciplined: 25,
  Emotional: 26, Empathetic: 27, Expressive: 28, Flexible: 29, Focused: 30,
  Frugal: 31, Grounded: 32, Guarded: 33, Headstrong: 34, Independent: 35,
  Inquisitive: 36, Intense: 37, Leader: 38, Loyal: 39, Mindful: 40, Observant: 41,
  Opportunistic: 42, Outspoken: 43, Passionate: 44, Patient: 45, Pragmatic: 46,
  Principled: 47, Private: 48, Reliable: 49, Reserved: 50, Resilient: 51, Respectful: 52,
  Savvy: 53, Selfless: 54, Sensitive: 55, Serious: 56, Stoic: 57, Strategic: 58,
  Stubborn: 59, Transparent: 60, Uncompromising: 61, Unpredictable: 62, Wary: 63,
} as const;

const NAME_BY_ID: Record<number, string> = Object.fromEntries(
  Object.entries(DNA).map(([k, v]) => [v, k])
);
const ID_BY_NAME: Record<string, number> = DNA as unknown as Record<string, number>;

interface PersonaFreq { frequencies: Record<string, number> }
let freqCache: Record<number, number> | null = null;

/** League frequency per trait id (from the census JSON). Missing/0 = never. */
function freqById(): Record<number, number> {
  if (freqCache) return freqCache;
  const raw: PersonaFreq = JSON.parse(
    fs.readFileSync(path.join(LOOKUPS_DIR, 'm27-persona-freq.json'), 'utf8')
  );
  const out: Record<number, number> = {};
  for (const [name, count] of Object.entries(raw.frequencies)) {
    const id = ID_BY_NAME[name];
    if (id != null && id !== DNA.WinAtAllCosts && id !== DNA.Invalid) out[id] = count;
  }
  freqCache = out;
  return out;
}

/** Position-group affinity: these traits get a 3x weight for that group. */
const TILT: Record<string, number[]> = {
  QB: [DNA.Leader, DNA.Cerebral, DNA.Confident, DNA.Composed, DNA.Strategic, DNA.Savvy, DNA.Observant],
  RB: [DNA.Aggressive, DNA.OverlyCompetitive, DNA.Resilient, DNA.Passionate, DNA.Intense],
  WR: [DNA.Confident, DNA.Expressive, DNA.Diva, DNA.Outspoken, DNA.Ambitious],
  TE: [DNA.Reliable, DNA.TeamFirst, DNA.Accountable, DNA.Selfless, DNA.Conscientious],
  OL: [DNA.Reliable, DNA.Disciplined, DNA.TeamFirst, DNA.Stoic, DNA.Loyal, DNA.Respectful],
  IDL: [DNA.Aggressive, DNA.Intense, DNA.Stubborn, DNA.Uncompromising, DNA.Headstrong],
  EDGE: [DNA.Aggressive, DNA.Intense, DNA.Ambitious, DNA.OverlyCompetitive, DNA.Uncompromising],
  LB: [DNA.Leader, DNA.Intense, DNA.Accountable, DNA.Focused, DNA.Serious],
  CB: [DNA.Confident, DNA.OverlyCompetitive, DNA.Wary, DNA.Ambitious, DNA.Expressive],
  S: [DNA.Cerebral, DNA.Observant, DNA.Accountable, DNA.Composed, DNA.Strategic, DNA.Wary],
  KP: [DNA.Composed, DNA.Grounded, DNA.Conscientious, DNA.Reserved, DNA.Patient],
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Weighted reservoir-free pick of `n` unique trait ids. */
function pickTraits(h: number, n: number, tilt: number[]): number[] {
  const freq = freqById();
  const weight = new Map<number, number>();
  for (const [id, f] of Object.entries(freq)) weight.set(Number(id), f);
  for (const t of tilt) weight.set(t, (weight.get(t) ?? 10) * 3); // 3x tilt
  const out: number[] = [];
  let state = h >>> 0;
  for (let k = 0; k < n; k++) {
    let total = 0;
    for (const [id, w] of weight) if (!out.includes(id)) total += w;
    if (total <= 0) break;
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0; // LCG stream
    let roll = state % total;
    for (const [id, w] of weight) {
      if (out.includes(id)) continue;
      roll -= w;
      if (roll < 0) { out.push(id); break; }
    }
  }
  return out;
}

export const PersonaService = {
  /**
   * 3–5 persona DNA traits for a prospect (the draft file's five slots at
   * 0xca). Count scales with caliber — elite ~5, mid 4–5, fringe 3–4; ~2.6%
   * carry none, matching the real league census.
   */
  dnaFor(seedKey: string, group: string, overall: number): number[] {
    const h = hash(seedKey);
    // League census has ~2.6% with empty DNA — only fringe/filler. Stars always get traits
    // (Cris Carter hashed into the empty bucket and showed a blank DNA row).
    if (overall < 70 && h % 1000 < 26) return [];
    const roll = (h >>> 4) % 100;
    const n =
      overall >= 78 ? (roll < 75 ? 5 : 4)
      : overall >= 70 ? (roll < 55 ? 5 : 4)
      : (roll < 60 ? 4 : roll < 90 ? 5 : 3);
    return pickTraits(h, n, TILT[group] ?? []);
  },

  /** Display name for a trait id (UI). */
  name(id: number): string {
    return NAME_BY_ID[id] ?? `#${id}`;
  },

  /** The selectable trait list for the persona editor (id + name, sorted). Excludes
   *  Invalid and WinAtAllCosts (the game strips that one from imported rookies). */
  list(): { id: number; name: string }[] {
    return Object.entries(DNA)
      .map(([name, id]) => ({ name, id }))
      .filter((t) => t.id !== DNA.Invalid && t.id !== DNA.WinAtAllCosts)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
};
