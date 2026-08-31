import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR, CACHE_DIR } from '../config/paths';
import { BaselinePlayer } from '../types/player';
import { FaceFeatures, faceDistance } from './FaceFeatures';
import { parseCsvFile, normalizeName } from '../util/csv';

/**
 * Player likeness assignment. Each generated prospect gets, in priority order:
 *   1. their real Madden face asset (PEPS, e.g. "jacksonBo_9877") when the
 *      lookup has one  -> the player's actual in-game 3D head + portrait;
 *   2. otherwise a race-appropriate generic draft-class face (gen_<tone>_...),
 *      so at least skin tone matches.
 * Generic faces come from generic-face-DRAFTCLASS-FINAL.json (the set Madden
 * itself uses for draft-class prospects). See draft-class-generator-project.
 */

interface FaceEntry {
  genericCode: string;
  skinTone: number;
  isTrueGeneric: boolean;
  assetName: string;
  pid?: number;
}

let byTone: Map<number, string[]> | null = null;
let pidByCode: Map<string, number> | null = null;

/** Per-game real-face catalogs (data/lookups/face-assets-by-game.json, built by
 *  scripts/build-face-catalogs.ts): every head asset the installed game can render —
 *  unique scans decoded from the game's own bundle tables (this is where legends
 *  like polamaluTroy_16548 live) plus the career roster's cranium heads — with the
 *  asset name in the game's casing and its menu-portrait id. */
export interface RealFace { assetName: string; portraitPid: number; genericHead: string | null; first: string | null; last: string | null; source: string; draftYear?: number; portraitKind?: 'legend' | 'roster' | 'player' | 'none' }
interface FaceCatalog { assets: Map<string, RealFace>; byName: Map<string, string>; byNameTight: Map<string, string>; legendPortraits: Set<string>; legendPids: Map<string, number>; playerPortraits: Set<string>; headAccessory: Set<string> }
const catalogs: Partial<Record<'m26' | 'm27', FaceCatalog>> = {};
/** Measured appearance features, baked by scripts/build-face-features.ts.
 *  Absent files simply disable matching and the stride fallback takes over. */
let headFeatMem: Record<string, Record<string, FaceFeatures>> | null = null;
let playerFeatMem: Record<string, FaceFeatures> | null = null;

function headFeatures(): Record<string, Record<string, FaceFeatures>> {
  if (!headFeatMem) {
    try {
      headFeatMem = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'generic-head-features.json'), 'utf8'));
    } catch { headFeatMem = {}; }
  }
  return headFeatMem!;
}

function playerFeatures(): Record<string, FaceFeatures> {
  if (!playerFeatMem) {
    try {
      playerFeatMem = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'player-face-features.json'), 'utf8'));
    } catch { playerFeatMem = {}; }
  }
  return playerFeatMem!;
}

function catalogFor(version: 'm26' | 'm27'): FaceCatalog {
  const hit = catalogs[version];
  if (hit) return hit;
  const cat: FaceCatalog = { assets: new Map(), byName: new Map(), byNameTight: new Map(), legendPortraits: new Set(), legendPids: new Map(), playerPortraits: new Set(), headAccessory: new Set() };
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'face-assets-by-game.json'), 'utf8'));
    const v = raw?.[version] ?? {};
    for (const [k, e] of Object.entries(v.assets ?? {})) cat.assets.set(k, e as RealFace);
    for (const [k, a] of Object.entries(v.byName ?? {})) {
      cat.byName.set(k, a as string);
      const t = k.replace(/[^a-z]/g, '');
      if (cat.byNameTight.has(t) && cat.byNameTight.get(t) !== a) cat.byNameTight.set(t, '');
      else cat.byNameTight.set(t, a as string);
    }
    for (const k of (v.legendPortraits ?? []) as string[]) cat.legendPortraits.add(k);
    for (const [k, pid] of Object.entries(v.legendPids ?? {})) cat.legendPids.set(k, Number(pid));
    for (const k of (v.playerPortraits ?? []) as string[]) cat.playerPortraits.add(k);
    for (const k of (v.genericHeadAccessory ?? []) as string[]) cat.headAccessory.add(k.toLowerCase());
  } catch { /* catalog absent — M27 falls back to the save-only map, M26 to the lookup */ }
  if (version === 'm27' && cat.assets.size === 0) {
    // Older data file: the save-only extract (current players, no legends).
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'm27-face-assets.json'), 'utf8'));
      for (const [name, v] of Object.entries(raw.players ?? {})) {
        const e = v as { assetName: string; portraitPid: number; genericHead: string | null };
        const [first, ...rest] = name.split(' ');
        cat.assets.set(e.assetName.toLowerCase(), { ...e, first, last: rest.join(' '), source: 'roster' });
        cat.byName.set(name, e.assetName.toLowerCase());
        const tight = name.toLowerCase().replace(/[^a-z]/g, '');
        if (cat.byNameTight.has(tight) && cat.byNameTight.get(tight) !== e.assetName.toLowerCase()) cat.byNameTight.set(tight, '');
        else cat.byNameTight.set(tight, e.assetName.toLowerCase());
      }
    } catch { /* nothing */ }
  }
  catalogs[version] = cat;
  return cat;
}
/** Lookup assets newer than this are accepted for M27 even when absent from the
 *  catalog: the catalog's roster half comes from an advanced franchise save that
 *  has already cut players, and current players' heads carry over between the two
 *  games (their portrait ids match 1,044 of 1,055 times). */
const M27_TRUST_LOOKUP_FROM = 2019;
/** How many of the nearest-matching heads a player may be spread across. Too
 *  low and a class collapses onto a handful of faces; too high and the match
 *  stops resembling him. 6 keeps every candidate a close match while bounding
 *  reuse near the even-spread figure. */
const GENERIC_MATCH_CANDIDATES = 6;
/** Skull caps / do-rags under the helmet became common in the late 1990s. */
const HEADWEAR_FROM = 1995;
/** ~280 legacy scan dirs (baughsammy, williamskevin, suggsterrell_16524) hold only
 *  shader presets, no head bundle. In-game (M27, 22 Aug 2026) they render as the
 *  default head, so they are generics unless MADDEN_PRESET_HEADS=1. */
const ACCEPT_PRESET_HEADS = process.env.MADDEN_PRESET_HEADS === '1';
/** Retired pre-2019 players with an EA id but no scan (AmukamaraPrince_10766): M26
 *  still ships their portraits, M27 dropped them from disk, so their heads may be
 *  gone too. Off by default for M27 (generic head); MADDEN27_TRUST_M26_HEADS=1 to
 *  try them in-game. */
const M27_TRUST_ALL_M26_HEADS = process.env.MADDEN27_TRUST_M26_HEADS === '1';
/** Write lookup ids for legends that only have a legends portrait (no scan) on M27. */
const M27_TRUST_LEGEND_IDS = process.env.MADDEN27_TRUST_LEGEND_IDS === '1';
let m26Scans: Array<{ id: string; name: string; asset: string; portraitPid?: number; image?: string }> | null = null;
const m27Key = (first: string, last: string) => `${first} ${last}`.toLowerCase().replace(/[^a-z ]/g, '');
/** The same name with the spaces gone too. m27Key keeps them, so a player the
 *  lookup writes "T. J. Parker" keys as "t j parker" while the game's catalog
 *  writes "t.j. parker" and keys as "tj parker" -- the two never meet, and five
 *  of the 2026 rookies had a scan sitting unused because of a full stop. This is
 *  a LAST resort: it is looser, so everything found through it goes through the
 *  same era guard as the exact key. */
const m27KeyTight = (first: string, last: string) => `${first}${last}`.toLowerCase().replace(/[^a-z]/g, '');

/** nflverse draft year by the same name key as the M27 face map. */
let draftYearByKey: Map<string, number> | null = null;
function loadDraftYears(): Map<string, number> {
  if (draftYearByKey) return draftYearByKey;
  draftYearByKey = new Map();
  try {
    const rows = parseCsvFile<Record<string, string>>(path.join(CACHE_DIR, 'nflverse_players.csv'));
    for (const r of rows) {
      const year = parseInt(r.draft_year || '', 10);
      if (!year) continue;
      const display = (r.display_name || '').trim();
      if (display) {
        const k = display.toLowerCase().replace(/[^a-z ]/g, '');
        // M27 scans belong to CURRENT players, so among same-name rows the face's
        // owner is the most recently drafted one (not the first row in the file).
        if (k && (!draftYearByKey.has(k) || year > (draftYearByKey.get(k) ?? 0))) draftYearByKey.set(k, year);
      }
      const first = (r.first_name || r.common_first_name || '').trim();
      const last = (r.last_name || '').trim();
      if (first && last) {
        const k = m27Key(first, last);
        if (k && (!draftYearByKey.has(k) || year > (draftYearByKey.get(k) ?? 0))) draftYearByKey.set(k, year);
      }
    }
  } catch { /* nflverse cache absent — year guard degrades to the 2015 cutoff */ }
  return draftYearByKey;
}

function load(): void {
  if (byTone) return;
  byTone = new Map();
  pidByCode = new Map();
  const file = path.join(LOOKUPS_DIR, 'generic-face-DRAFTCLASS-FINAL.json');
  const arr: FaceEntry[] = JSON.parse(fs.readFileSync(file, 'utf8'));
  // Prefer true generics; fall back to any validated draft-class face per tone.
  const trueGen = new Map<number, string[]>();
  for (const e of arr) {
    const code = e.genericCode;
    if (!code || !/^gen_\d/i.test(code)) continue;
    if (typeof e.pid === 'number') pidByCode.set(code, e.pid);
    // Bucket by the gen_N prefix, NOT the JSON skinTone field — M26Writer derives the
    // exported skin tone from that prefix, and 48 entries disagree with their field, so
    // a field-bucketed pick would write a tone that mismatches the player's race.
    const tone = toneFromCode(code);
    if (!byTone.has(tone)) byTone.set(tone, []);
    byTone.get(tone)!.push(code);
    if (e.isTrueGeneric) {
      if (!trueGen.has(tone)) trueGen.set(tone, []);
      trueGen.get(tone)!.push(code);
    }
  }
  // Where a tone has true generics, prefer them (avoids reusing a named scan).
  for (const [tone, codes] of trueGen) {
    if (codes.length >= 3) byTone.set(tone, codes);
  }
  // Madden 26 and 27 have different generic-head sets. Each game's own random
  // classes are the authority for which gen_* heads it assigns AND the menu
  // portrait it pairs with each (the validated lookup's pid column disagreed with
  // the game on every head it shared). Pools are kept per game; the portrait
  // table only backs up heads the game never showed us.
  try {
    const catalog = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'generic-heads-by-game.json'), 'utf8')) as { m26: Record<string, number>; m27: Record<string, number> };
    const plpoPid = new Map<string, number>();
    for (const r of parseCsvFile<Record<string, string>>(path.join(LOOKUPS_DIR, 'PID_Portrait_Mapping.csv'))) {
      const name = (r.Portrait || '').trim();
      const pid = parseInt(r.PID, 10);
      if (name && !Number.isNaN(pid) && !plpoPid.has(name)) plpoPid.set(name, pid);
    }
    for (const version of ['m26', 'm27'] as const) {
      const heads = catalog[version] ?? {};
      const pools = new Map<number, string[]>();
      const pids = new Map<string, number>();
      for (const [code, pid] of Object.entries(heads)) {
        if (!/^gen_\d/i.test(code)) continue;
        const tone = toneFromCode(code);
        if (!pools.has(tone)) pools.set(tone, []);
        pools.get(tone)!.push(code);
        pids.set(code, pid || plpoPid.get(`plpo_generic_${code.slice(4)}`) || 0);
      }
      // Tones the game showed too few heads for keep the validated lookup's pool.
      for (const [tone, codes] of byTone!) if (!pools.has(tone) || pools.get(tone)!.length < 8) pools.set(tone, codes);
      for (const codes of pools.values()) codes.sort();
      byToneByVersion.set(version, pools);
      pidByVersion.set(version, pids);
    }
  } catch { /* optional: both games fall back to the validated lookup pools */ }
}

const byToneByVersion = new Map<'m26' | 'm27', Map<number, string[]>>();
const pidByVersion = new Map<'m26' | 'm27', Map<string, number>>();
function poolsFor(version: 'm26' | 'm27'): Map<number, string[]> {
  load();
  return byToneByVersion.get(version) ?? byTone!;
}

function toneFromCode(code: string): number {
  const m = code.match(/^gen_(\d+)/i);
  return m ? parseInt(m[1], 10) : 4;
}

/** Deterministic 32-bit hash for reproducible per-player face selection. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function raceToSkinTone(race: number | null): number {
  if (race != null && race >= 1 && race <= 8) return race;
  return 4; // unknown -> mid tone
}

export type LikenessKind = 'asset' | 'generic';

export interface Likeness {
  peps: string; // real asset name OR a gen_ generic code
  kind: LikenessKind;
  skinTone: number;
}

export const LikenessService = {
  /** Generic heads available for a skin tone in a game (that game's own usage). */
  headsForTone(tone: number, version: 'm26' | 'm27' = 'm26'): string[] {
    return [...(poolsFor(version).get(tone) ?? [])];
  },

  /** Generic draft-class face codes grouped by skin tone (1-8), for the face picker. */
  genericHeadsByTone(version: 'm26' | 'm27' = 'm26'): Record<number, string[]> {
    const out: Record<number, string[]> = {};
    for (const [tone, codes] of poolsFor(version)) out[tone] = [...codes].sort();
    return out;
  },

  /** Portrait PID for a gen_* generic face code (for head previews), else null. */
  genericPid(code: string, version: 'm26' | 'm27' = 'm26'): number | null {
    load();
    const fromGame = pidByVersion.get(version)?.get(code);
    if (fromGame) return fromGame;
    // Not in this game's catalog: the other game's pairing, then the validated lookup.
    const other = pidByVersion.get(version === 'm26' ? 'm27' : 'm26')?.get(code);
    return other || pidByCode!.get(code) || null;
  },

  /** The real head this player gets in `version`, or null for a generic.
   *   1. the lookup's asset id, when that game ships it (scan bundle or roster);
   *   2. a roster player of the same name whose draft year matches within a year
   *      (covers players the lookup has no asset for — rookies, name variants);
   *   3. M27 only: a recent lookup asset (>= 2019) the advanced autosave no longer
   *      lists — heads carry over between games;
   *   4. M26 only: any lookup asset (the lookup was built from M26's own files). */
  realFace(player: Pick<BaselinePlayer, 'firstName' | 'lastName' | 'draftYear' | 'playerAssetsId' | 'photoId'>, version: 'm26' | 'm27'): RealFace | null {
    const head = this.resolveHead(player, version);
    if (!head) return null;
    return { ...head, ...this.portraitFor(player, head, version) };
  },

  /** Menu portrait for a real head. The games key portraits by PID; a PID the game
   *  has no image for shows the blank NFL shield. M27 dropped most retired players'
   *  regular portraits (plpo_<name>, 7,956 in M26 -> 3,339) but keeps the legends set
   *  (plpo_legends_<name>, its own PID: Polamalu 4829, not the regular 63), so
   *  legends first, then the roster's PID, then the regular portrait when shipped. */
  portraitFor(player: Pick<BaselinePlayer, 'firstName' | 'lastName' | 'photoId'>, head: RealFace, version: 'm26' | 'm27'): { portraitPid: number; portraitKind: 'legend' | 'roster' | 'player' | 'none' } {
    const cat = catalogFor(version);
    const f = player.firstName.toLowerCase().replace(/[^a-z]/g, '');
    const l = player.lastName.toLowerCase().replace(/[^a-z]/g, '');
    const legend = cat.legendPids.get(l + f) ?? cat.legendPids.get(f + l);
    const roster = /roster/.test(head.source) ? head.portraitPid : 0;
    const regular = cat.playerPortraits.has(l + f) || cat.playerPortraits.has(f + l) ? (player.photoId || head.portraitPid || 0) : 0;
    if (version === 'm26') {
      if (regular) return { portraitPid: regular, portraitKind: 'player' };
      if (roster) return { portraitPid: roster, portraitKind: 'roster' };
      if (legend) return { portraitPid: legend, portraitKind: 'legend' };
      return { portraitPid: player.photoId || head.portraitPid || 0, portraitKind: player.photoId || head.portraitPid ? 'player' : 'none' };
    }
    if (legend) return { portraitPid: legend, portraitKind: 'legend' };
    if (roster) return { portraitPid: roster, portraitKind: 'roster' };
    if (regular) return { portraitPid: regular, portraitKind: 'player' };
    return { portraitPid: 0, portraitKind: 'none' };
  },

  /** The head asset only (see realFace for the portrait). */
  resolveHead(player: Pick<BaselinePlayer, 'firstName' | 'lastName' | 'draftYear' | 'playerAssetsId' | 'photoId'>, version: 'm26' | 'm27'): RealFace | null {
    const cat = catalogFor(version);
    const asset = (player.playerAssetsId || '').trim();
    const hasAsset = !!asset && !/^gen_/i.test(asset);
    const key = m27Key(player.firstName, player.lastName);
    if (hasAsset) {
      const hit = cat.assets.get(asset.toLowerCase());
      if (hit) {
        // (portraitPid stays the catalog's own value here — 0 when the roster PID was a
        // generic portrait; portraitFor decides what to show.)
        // A roster head belongs to a CURRENT player. The lookup pairs some old rows
        // with a namesake's id (1989 DJ Johnson -> JohnsonDJ_22983): same name,
        // wrong person — only accept it when the draft years agree.
        // (A scan-backed id with no nflverse year for the name — Gates, undrafted — is fine.)
        if (/roster/.test(hit.source) && !this.sameEra(key, player.draftYear, /bundle/.test(hit.source))) return null;
        if (ACCEPT_PRESET_HEADS || !/preset/.test(hit.source)) {
          return { ...hit, assetName: hit.assetName || asset };
        }
      }
    }
    const byName = cat.byName.get(key);
    if (byName) {
      const face = cat.assets.get(byName);
      // A catalog entry that knows its owner's draft year (lookup-matched scans)
      // is checked against it directly; roster heads fall back to nflverse.
      const same = face?.draftYear
        ? player.draftYear == null || Math.abs(player.draftYear - face.draftYear) <= 1
        : this.sameEra(key, player.draftYear);
      if (face && same && (ACCEPT_PRESET_HEADS || !/preset/.test(face.source))) return face;
    }
    // Same lookup with punctuation and spacing ignored, for "T. J." against
    // "t.j.". Deliberately after the exact key and behind the identical era
    // check: the loose key is what would otherwise hand the 2026 pick 149 named
    // Justin Jefferson the 2020 receiver's face. An empty value means two
    // catalog names collapsed to this key, which is not a match but an
    // ambiguity, so it is skipped.
    const tight = cat.byNameTight.get(m27KeyTight(player.firstName, player.lastName));
    if (tight) {
      const face = cat.assets.get(tight);
      const same = face?.draftYear
        ? player.draftYear == null || Math.abs(player.draftYear - face.draftYear) <= 1
        : this.sameEra(key, player.draftYear);
      if (face && same && (ACCEPT_PRESET_HEADS || !/preset/.test(face.source))) return face;
    }
    if (hasAsset) {
      const own = { assetName: asset, portraitPid: player.photoId || 0, genericHead: null, first: player.firstName, last: player.lastName };
      // MUT legends added since the cranium pipeline have no scan bundle, only a
      // legends portrait. In-game (M27) a legends portrait did NOT guarantee a head
      // (Suggs rendered as the default head), so on M27 the portrait is used on its
      // own over a generic head unless MADDEN27_TRUST_LEGEND_IDS=1; M26 keeps the id.
      if (this.hasLegendPortrait(player.firstName, player.lastName, version) && (version === 'm26' || M27_TRUST_LEGEND_IDS)) return { ...own, source: 'legend-portrait' };
      // M26: the lookup was built from M26's own files, so keep the id — unless a
      // modern namesake exists and the draft years disagree (that id is his).
      if (version === 'm26' && this.sameEra(key, player.draftYear, true)) return { ...own, source: 'lookup' };
      // M27 kept 1,275 of M26's 1,276 scan bundles, so heads carry over between
      // the games: a head on the M26 roster (a 2025 player, now maybe retired
      // and gone from the advanced M27 autosave) is still in M27.
      if (version === 'm27') {
        const prev = catalogFor('m26').assets.get(asset.toLowerCase());
        if (prev && /roster/.test(prev.source) && this.sameEra(key, player.draftYear, true)) return { ...own, portraitPid: prev.portraitPid || own.portraitPid, source: 'm26-roster' };
      }
      if ((player.draftYear ?? 0) >= M27_TRUST_LOOKUP_FROM) return { ...own, source: 'lookup-recent' };
      if (version === 'm27' && M27_TRUST_ALL_M26_HEADS && this.sameEra(key, player.draftYear, true)) return { ...own, source: 'm26-lookup' };
    }
    return null;
  },

  /** The legends-portrait PID for this player in `version`, or 0. Works without a
   *  head: a generic-head prospect can still show the real menu portrait. */
  legendPortraitPid(firstName: string, lastName: string, version: 'm26' | 'm27'): number {
    const cat = catalogFor(version);
    const f = firstName.toLowerCase().replace(/[^a-z]/g, '');
    const l = lastName.toLowerCase().replace(/[^a-z]/g, '');
    return cat.legendPids.get(l + f) ?? cat.legendPids.get(f + l) ?? 0;
  },

  /** Does the game ship a legends portrait for this player (plpo_legends_<name>)? */
  hasLegendPortrait(firstName: string, lastName: string, version: 'm26' | 'm27'): boolean {
    const lp = catalogFor(version).legendPortraits;
    if (!lp.size) return false;
    const f = firstName.toLowerCase().replace(/[^a-z]/g, '');
    const l = lastName.toLowerCase().replace(/[^a-z]/g, '');
    return lp.has(l + f) || lp.has(f + l);
  },

  /** A roster scan belongs to a CURRENT player; a 1987 Cornelius Bennett must not
   *  receive a current Bennett's head. Same name + draft year within 1 = same person. */
  sameEra(nameKey: string, draftYear?: number, unknownOk = false): boolean {
    const ownerYear = loadDraftYears().get(nameKey);
    if (draftYear != null && ownerYear != null) return Math.abs(draftYear - ownerYear) <= 1;
    if (unknownOk) return true;
    if (draftYear != null && draftYear < 2015) return false;
    return true;
  },

  /** @deprecated use realFace(player, 'm27') */
  m27FaceFor(firstName: string, lastName: string, draftYear?: number): { assetName: string; portraitPid: number; genericHead: string | null } | null {
    return this.realFace({ firstName, lastName, draftYear: draftYear ?? 0, playerAssetsId: null, photoId: null }, 'm27');
  },

  /** Real 3D face-scan catalog for the target game (M26 lookup assets vs M27 save extract). */
  faceScans(gameVersion: 'm26' | 'm27'): Array<{ id: string; name: string; asset: string; portraitPid?: number; image?: string }> {
    const title = (s: string) => s.replace(/\w/g, (c) => c.toUpperCase());
    if (gameVersion === 'm27') {
      return [...catalogFor('m27').assets.values()]
        .filter((v) => v.first && v.last)
        .map((v) => ({
          id: v.assetName,
          name: `${v.first} ${v.last}`,
          asset: v.assetName,
          portraitPid: v.portraitPid || undefined,
          image: v.portraitPid ? `/api/portrait/pid/${v.portraitPid}` : undefined,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    if (!m26Scans) {
      m26Scans = [];
      try {
        const rows = parseCsvFile<Record<string, string>>(path.join(LOOKUPS_DIR, 'ALL_PLAYER_LOOKUP.csv'));
        const seen = new Set<string>();
        for (const r of rows) {
          const asset = (r['Player Assets ID'] || '').trim();
          if (!asset || /^gen_/i.test(asset) || seen.has(asset)) continue;
          seen.add(asset);
          const first = (r['First Name'] || '').trim();
          const last = (r['Last Name'] || '').trim();
          const pid = parseInt(r.PhotoID || '', 10);
          m26Scans.push({
            id: asset,
            name: `${first} ${last}`.trim() || asset,
            asset,
            portraitPid: Number.isFinite(pid) && pid > 0 ? pid : undefined,
            image: Number.isFinite(pid) && pid > 0 ? `/api/portrait/pid/${pid}` : undefined,
          });
        }
        m26Scans.sort((a, b) => a.name.localeCompare(b.name));
      } catch { /* lookup missing */ }
    }
    return m26Scans;
  },

  /** Assign a face for a player. `index` keeps generic picks reproducible.
   *  A real head only when the target game can render it (see realFace); an asset
   *  the game lacks would show as the empty NFL-shield silhouette. */
  assign(player: BaselinePlayer, index: number, gameVersion: 'm26' | 'm27' = 'm26'): Likeness {
    load();
    const tone = raceToSkinTone(player.race);
    const real = this.realFace(player, gameVersion);
    if (real) return { peps: real.assetName, kind: 'asset', skinTone: tone };
    return this.generic(player, index, gameVersion);
  },

  /** The generic head this player would get (reproducible by `index`). */
  generic(player: BaselinePlayer, index: number, gameVersion: 'm26' | 'm27' = 'm26'): Likeness {
    load();
    const tone = raceToSkinTone(player.race);
    const pools = poolsFor(gameVersion);
    let pool = pools.get(tone);
    // Heads with built-in headwear (skull cap / do-rag — a `headaccessory` part in
    // the game files) are a 2000s look; keep them off players drafted before 1995
    // when the tone still has enough plain heads to choose from.
    if (pool && (player.draftYear ?? 2026) < HEADWEAR_FROM) {
      const acc = catalogFor(gameVersion).headAccessory;
      const plain = pool.filter((h) => !acc.has(h.toLowerCase()));
      if (plain.length >= 3) pool = plain;
    }
    if (!pool || pool.length === 0) {
      // Nearest available tone, then any.
      for (let d = 1; d <= 7 && (!pool || pool.length === 0); d++) {
        pool = pools.get(tone - d) || pools.get(tone + d);
      }
      pool = pool && pool.length ? pool : [...pools.values()][0];
    }
    // Stride the pool by draft position rather than hashing the name into it.
    // An independent per-name hash collides by the birthday problem: over a 1974
    // class it left one head on 15 players while others went unused, so Ed "Too
    // Tall" Jones (6'9") and Ross Browner (6'3") drew the same face. `index` is
    // unique within a class, so `index % len` walks the pool evenly -- every head
    // is used, the count per head is within one of the average, and no two
    // adjacent picks repeat. The name still breaks ties between classes.
    // Pick the head that actually looks like him when we have measured his face.
    // Tone alone gave Pat Leahy -- light-haired, clean-shaven -- a head with dark
    // hair and stubble, because nothing in the pick ever looked at his picture.
    // Features come from the Madden disc headshots, so this only fires for a
    // player the pack has; see FaceFeatures for why they survive photo-vs-render.
    const mine = playerFeatures()[`${normalizeName(player.firstName)}_${normalizeName(player.lastName)}`];
    const heads = headFeatures()[gameVersion];
    if (mine && heads) {
      // Spread across the K CLOSEST heads rather than taking the single nearest.
      // The features are coarse, so a strict argmax collapses: in a 2003 class it
      // put 181 players on one head, because most modern players measure alike.
      // Every candidate here is still a close match on hair and facial hair; the
      // draft position only decides which of the near-ties he gets.
      const ranked = pool
        .filter((c) => heads[c])
        .map((c) => ({ c, d: faceDistance(mine, heads[c]) }))
        .sort((a, b) => a.d - b.d);
      if (ranked.length) {
        const k = Math.min(ranked.length, GENERIC_MATCH_CANDIDATES);
        return { peps: ranked[index % k].c, kind: 'generic', skinTone: tone };
      }
    }
    // No measured face: stride the pool by draft position rather than hashing the
    // name into it. An independent per-name hash collides by the birthday problem
    // -- over a 1974 class it left one head on 15 players while others went unused,
    // so Ed "Too Tall" Jones and Ross Browner drew the same face. `index` is unique
    // within a class, so this walks the pool evenly instead.
    return { peps: pool[index % pool.length], kind: 'generic', skinTone: tone };
  },
};
