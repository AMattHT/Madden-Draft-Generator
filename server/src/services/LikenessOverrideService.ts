import fs from 'fs';
import path from 'path';
import { CACHE_DIR } from '../config/paths';
import { normalizeName } from '../util/csv';

/**
 * The user's own likeness fixes: a skin tone, a face (generic head code or scan
 * asset) and/or a body type pinned to one real player, applied in every class he
 * appears in (his draft year, All-Time, decade, By team, Studio boards).
 *
 * Why a separate store: two thirds of the database has no photo evidence, so a
 * tone comes from a position/era prior and is sometimes wrong; the shipped
 * curated-skin-tone.json only covers Hall of Famers and ships with the app. This
 * file lives in the cache directory, which an update does not touch, so a fix
 * made today survives the next release. It can be exported and promoted into the
 * curated file so everyone gets it (scripts/promote-likeness-overrides.ts).
 *
 * Keyed like CuratedSkinToneService: normalized first|last|draftYear, because
 * names repeat across eras.
 */
export interface LikenessOverride {
  skinTone?: number; // 1-7
  /** gen_* generic head code, a face-scan asset name, or null = the generator's real head. */
  faceAsset?: string | null;
  bodyType?: string; // Standard / Thin / Lean / Muscular / Heavy
  note?: string;
  updatedAt: number;
}

export interface LikenessOverrideEntry extends LikenessOverride {
  key: string;
  firstName: string;
  lastName: string;
  draftYear: number;
}

interface StoreFile {
  version: 1;
  /** normalized key -> override, with the display name kept for the list view. */
  overrides: Record<string, LikenessOverrideEntry>;
}

const BODY_TYPES = new Set(['Standard', 'Thin', 'Lean', 'Muscular', 'Heavy']);

let file = path.join(CACHE_DIR, 'likeness-overrides.json');
let store: StoreFile | null = null;

export const likenessKey = (first: string, last: string, year: number): string =>
  `${normalizeName(first)}|${normalizeName(last)}|${year}`;

function load(): StoreFile {
  if (store) return store;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<StoreFile>;
    store = { version: 1, overrides: raw.overrides && typeof raw.overrides === 'object' ? raw.overrides : {} };
  } catch {
    store = { version: 1, overrides: {} };
  }
  return store;
}

function save(): void {
  const s = load();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, file);
}

/** Validate and normalize a patch from the API; returns the reason it is bad, else null. */
export function validateLikenessPatch(p: Partial<LikenessOverride>): string | null {
  if (p.skinTone != null) {
    const t = Number(p.skinTone);
    if (!Number.isInteger(t) || t < 1 || t > 7) return 'skinTone must be 1-7';
  }
  if (p.faceAsset != null && p.faceAsset !== '' && typeof p.faceAsset !== 'string') return 'faceAsset must be a string';
  if (p.faceAsset && p.faceAsset.length > 80) return 'faceAsset too long';
  if (p.bodyType != null && !BODY_TYPES.has(String(p.bodyType))) return `bodyType must be one of ${[...BODY_TYPES].join(', ')}`;
  if (p.skinTone == null && p.faceAsset === undefined && p.bodyType == null) return 'nothing to fix: give a skinTone, faceAsset or bodyType';
  return null;
}

export const LikenessOverrideService = {
  /** The user's fix for this player, or null. */
  get(first: string, last: string, draftYear: number | null | undefined): LikenessOverrideEntry | null {
    if (draftYear == null) return null;
    return load().overrides[likenessKey(first, last, draftYear)] ?? null;
  },

  /** Every fix, newest first. */
  all(): LikenessOverrideEntry[] {
    return Object.values(load().overrides).sort((a, b) => b.updatedAt - a.updatedAt);
  },

  /** Record (or replace) a fix. A tone of a gen_* head wins over an explicit skinTone that disagrees. */
  set(first: string, last: string, draftYear: number, patch: Partial<LikenessOverride>): LikenessOverrideEntry {
    const why = validateLikenessPatch(patch);
    if (why) throw new Error(why);
    const key = likenessKey(first, last, draftYear);
    const prev = load().overrides[key];
    const entry: LikenessOverrideEntry = {
      ...(prev ?? {}),
      key, firstName: first, lastName: last, draftYear,
      updatedAt: Date.now(),
    };
    if (patch.skinTone != null) entry.skinTone = Number(patch.skinTone);
    if (patch.faceAsset !== undefined) {
      const asset = patch.faceAsset ? String(patch.faceAsset).trim() : null;
      entry.faceAsset = asset || null;
      const m = asset ? /^gen_(\d+)/i.exec(asset) : null;
      if (m) entry.skinTone = Math.max(1, Math.min(7, Number(m[1])));
    }
    if (patch.bodyType != null) entry.bodyType = String(patch.bodyType);
    if (patch.note != null) entry.note = String(patch.note).slice(0, 200);
    load().overrides[key] = entry;
    save();
    return entry;
  },

  /** Drop a fix; true when one existed. */
  remove(first: string, last: string, draftYear: number): boolean {
    const key = likenessKey(first, last, draftYear);
    const s = load();
    if (!s.overrides[key]) return false;
    delete s.overrides[key];
    save();
    return true;
  },

  /** A short stamp that changes whenever a fix changes, so cached classes go stale. */
  stamp(): string {
    const all = load().overrides;
    let latest = 0;
    let n = 0;
    for (const e of Object.values(all)) { n++; if (e.updatedAt > latest) latest = e.updatedAt; }
    return n ? `${n}.${latest.toString(36)}` : '0';
  },

  /** The file as shipped to the user (export / promote). */
  exportJson(): string {
    return JSON.stringify(load(), null, 2);
  },

  get filePath(): string {
    return file;
  },

  /** Tests: point the store at a scratch file and forget what was loaded. */
  _useFile(p: string): void {
    file = p;
    store = null;
  },
};

/**
 * Merge the tones of an overrides file into the shipped curated map. An entry the
 * curated file already has is kept unless `force`; returns what changed.
 */
export function mergeIntoCurated(
  overrides: Record<string, Pick<LikenessOverride, 'skinTone'>>,
  curated: Record<string, number>,
  force = false
): { added: string[]; replaced: string[]; skipped: string[] } {
  const added: string[] = [], replaced: string[] = [], skipped: string[] = [];
  for (const [key, o] of Object.entries(overrides)) {
    const t = o.skinTone;
    if (t == null || !Number.isInteger(t) || t < 1 || t > 7) continue;
    if (curated[key] == null) { curated[key] = t; added.push(key); }
    else if (curated[key] !== t && force) { curated[key] = t; replaced.push(key); }
    else if (curated[key] !== t) skipped.push(key);
  }
  return { added, replaced, skipped };
}
