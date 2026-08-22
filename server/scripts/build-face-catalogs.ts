/**
 * Build the per-game real-face catalogs: which head assets each installed game can
 * actually render, with the asset name in the casing the game uses, the menu
 * portrait id, and (where known) the player they belong to.
 *
 * Sources, merged per game:
 *   1. Superbundle tables of contents (Data/Win32/**.toc). Frostbite stores the
 *      bundle names Huffman-coded; every unique head scan is a bundle directory
 *      `win32/content/characters/player/players/<x>/<asset>/…_playerhead_brt`.
 *      This is the only place legends (polamalutroy_16548) appear — they are not
 *      on any franchise roster.
 *   2. The newest CAREER-*-AUTOSAVE's Player table (PLYR_ASSETNAME / PLYR_PORTRAIT /
 *      PLYR_GENERICHEAD). Current players whose heads are "cranium" (parametric)
 *      have no bundle directory, so the roster is the only list of those.
 *   3. ALL_PLAYER_LOOKUP.csv for the cased asset name + PhotoID of bundle-only heads.
 *
 * Output: data/lookups/face-assets-by-game.json
 *   { m26: { assets: { "<lower>": { assetName, portraitPid, genericHead, first, last, source } }, byName: {...} }, m27: {...} }
 *
 *   npx tsx scripts/build-face-catalogs.ts
 *   env: MADDEN26_DIR, MADDEN27_DIR, MADDEN_SAVES_DIR, MADDEN27_SAVES_DIR
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';
import { parseCsvFile } from '../src/util/csv';
import { LOOKUPS_DIR } from '../src/config/paths';

const require = createRequire(import.meta.url);
const madden = require('madden-franchise');

type Version = 'm26' | 'm27';
interface Entry { assetName: string; portraitPid: number; genericHead: string | null; first: string | null; last: string | null; source: string; draftYear?: number }

const GAME_DIRS: Record<Version, string> = {
  m26: process.env.MADDEN26_DIR || 'E:/SteamLibrary/steamapps/common/Madden NFL 26',
  m27: process.env.MADDEN27_DIR || 'G:/SteamLibrary/steamapps/common/Madden NFL 27',
};
const SAVES_DIRS: Record<Version, string> = {
  m26: process.env.MADDEN_SAVES_DIR || path.join(os.homedir(), 'Documents', 'Madden NFL 26', 'Saves'),
  m27: process.env.MADDEN27_SAVES_DIR || path.join(os.homedir(), 'Documents', 'Madden NFL 27', 'saves'),
};

// ---------- Frostbite "Manifest2019" toc bundle names ----------
const TOC_HEADER = 0x22c; // signature block before the table
// A scan lives in players/<initial>/<asset>/. Most dirs hold the head bundles
// (…_playerhead_brt); ~280 legacy dirs (baughsammy, williamskevin, randlejohn_12183)
// hold only shader presets — kept, flagged `preset`, pending an in-game check.
const HEAD_DIR = /^win32\/content\/characters\/player\/players\/([a-z0-9])\/([a-z0-9][a-z0-9\-_]*)\/(.*)$/;

export function tocBundleNames(file: string): string[] {
  const d = fs.readFileSync(file);
  if (d.length < TOC_HEADER + 60) return [];
  const magic = d.readUInt32LE(0);
  if (magic !== 0x01ced100 && magic !== 0x03ced100 && magic !== 0x00ced100) return [];
  const S = TOC_HEADER;
  const u = (i: number) => d.readUInt32BE(S + 4 * i);
  const bundleData = S + u(1);
  const count = u(2);
  if (!count) return [];
  const flags = u(11);
  const names: string[] = [];
  if (flags & 5) {
    // Huffman: names region is a bit stream of BE u32 words; the table is pairs of
    // child indices, negative = leaf (~value is the character), root = last pair.
    const namesOff = S + u(8);
    const words = u(12);
    const tableCount = u(13);
    const tableOff = S + u(14);
    const table = new Int32Array(tableCount);
    for (let i = 0; i < tableCount; i++) table[i] = d.readInt32BE(tableOff + 4 * i);
    const root = (tableCount >> 1) - 1;
    const word = (i: number) => d.readUInt32BE(namesOff + 4 * i);
    const decode = (bit: number): string => {
      let out = '';
      for (;;) {
        let node = root;
        let v: number;
        for (;;) {
          const b = (word(bit >>> 5) >>> (bit & 31)) & 1;
          bit++;
          v = table[node * 2 + b];
          if (v < 0) break;
          node = v;
        }
        const c = ~v;
        if (c === 0) return out;
        out += String.fromCharCode(c);
        if (out.length > 512) return out;
      }
    };
    if (words * 4 + namesOff > d.length) return [];
    for (let i = 0; i < count; i++) names.push(decode(d.readInt32BE(bundleData + 16 * i)));
  } else {
    const namesOff = S + u(8);
    for (let i = 0; i < count; i++) {
      const no = d.readInt32BE(bundleData + 16 * i);
      const end = d.indexOf(0, namesOff + no);
      names.push(d.toString('latin1', namesOff + no, end).split('').reverse().join(''));
    }
  }
  return names;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.toc')) out.push(p);
  }
  return out;
}

const LEGEND_PORTRAIT = /\/portraits\/playerportraits\/assets\/legends\/plpo_legends_([a-z0-9_]+?)_assetlibrary_playerportraits_brt$/;

function headBundles(gameDir: string): { heads: Map<string, boolean>; legendPortraits: Set<string> } {
  const heads = new Map<string, boolean>(); // asset -> has a playerhead bundle
  const legendPortraits = new Set<string>(); // "kellyjim", "troyaikman" — MUT legends, whose heads are parametric (no bundle)
  const root = path.join(gameDir, 'Data', 'Win32');
  if (!fs.existsSync(root)) { console.warn(`  game dir missing: ${gameDir}`); return { heads, legendPortraits }; }
  for (const toc of walk(root)) {
    let names: string[] = [];
    try { names = tocBundleNames(toc); } catch (e) { console.warn(`  ${path.basename(toc)}: ${(e as Error).message}`); }
    for (const n of names) {
      const lp = LEGEND_PORTRAIT.exec(n);
      if (lp) { legendPortraits.add(lp[1].replace(/_(profile|alt\d*|\d+)$/g, '').replace(/[^a-z]/g, '')); continue; }
      const m = HEAD_DIR.exec(n);
      if (!m || m[1].length !== 1) continue; // teen_*/recipes dirs are templates
      const asset = m[2];
      heads.set(asset, (heads.get(asset) ?? false) || /playerhead_brt$/.test(m[3]));
    }
  }
  return { heads, legendPortraits };
}

// ---------- Roster (career autosave) ----------
function newestAutosave(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const c = fs.readdirSync(dir)
    .filter((f) => /^CAREER-.*AUTOSAVE$/i.test(f))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return c.length ? path.join(dir, c[0].f) : null;
}

interface RosterRow { asset: string; pid: number; genericHead: string | null; first: string; last: string; yearsPro: number }
async function rosterFaces(save: string): Promise<RosterRow[]> {
  const f = await madden.create(save, { autoParse: true });
  const pt = f.getTableByName('Player');
  await pt.readRecords();
  const out: RosterRow[] = [];
  for (const r of pt.records) {
    if (r.isEmpty) continue;
    const asset = String(r.PLYR_ASSETNAME || '').trim();
    if (!asset || /^gen_/i.test(asset)) continue;
    const gh = String(r.PLYR_GENERICHEAD || '').trim();
    out.push({
      asset,
      pid: Number(r.PLYR_PORTRAIT) || 0,
      genericHead: gh && gh !== 'NoHead' ? gh : null,
      first: String(r.FirstName || '').trim(),
      last: String(r.LastName || '').trim(),
      yearsPro: Number(r.YearsPro) || 0,
    });
  }
  return out;
}

// ---------- Lookup ----------
interface LookupRow { asset: string; pid: number; first: string; last: string; draftYear: number }
function lookupAssets(): Map<string, LookupRow> {
  const rows = parseCsvFile<Record<string, string>>(path.join(LOOKUPS_DIR, 'ALL_PLAYER_LOOKUP.csv'));
  const m = new Map<string, LookupRow>();
  for (const r of rows) {
    const asset = (r['Player Assets ID'] || '').trim();
    if (!asset || /^gen_/i.test(asset)) continue;
    const key = asset.toLowerCase();
    const row: LookupRow = {
      asset,
      pid: parseInt(r.PhotoID || '', 10) || 0,
      first: (r['First Name'] || '').trim(),
      last: (r['Last Name'] || '').trim(),
      draftYear: parseInt(r['Draft Class'] || '', 10) || 0,
    };
    // Prefer the most recent row for a reused asset (same person, later draft row).
    const prev = m.get(key);
    if (!prev || row.draftYear > prev.draftYear) m.set(key, row);
  }
  return m;
}

const nameKey = (first: string, last: string) => `${first} ${last}`.toLowerCase().replace(/[^a-z ]/g, '');
const stemKey = (first: string, last: string) => `${last}${first}`.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(jr|sr|iii|ii|iv)$/, '');

/** Lookup rows with no real asset of their own, by "lastfirst" stem (for naming
 *  scan dirs the lookup never pointed at). */
let lookupByName: Map<string, LookupRow[]> = new Map();
function indexLookupNames(): void {
  const rows = parseCsvFile<Record<string, string>>(path.join(LOOKUPS_DIR, 'ALL_PLAYER_LOOKUP.csv'));
  lookupByName = new Map();
  for (const r of rows) {
    const asset = (r['Player Assets ID'] || '').trim();
    if (asset && !/^gen_/i.test(asset)) continue;
    const first = (r['First Name'] || '').trim();
    const last = (r['Last Name'] || '').trim();
    if (!first || !last) continue;
    const k = stemKey(first, last);
    const row: LookupRow = { asset: '', pid: parseInt(r.PhotoID || '', 10) || 0, first, last, draftYear: parseInt(r['Draft Class'] || '', 10) || 0 };
    const list = lookupByName.get(k) ?? [];
    // Same person listed twice (AFL + NFL draft rows) is still one candidate.
    if (!list.some((x) => x.draftYear === row.draftYear)) list.push(row);
    lookupByName.set(k, list);
  }
}

async function buildVersion(v: Version, lookup: Map<string, LookupRow>) {
  console.log(`[${v}] bundles from ${GAME_DIRS[v]}`);
  const { heads, legendPortraits } = headBundles(GAME_DIRS[v]);
  console.log(`  ${heads.size} unique head scans, ${legendPortraits.size} legend portraits in the game files`);
  const save = newestAutosave(SAVES_DIRS[v]);
  const roster = save ? await rosterFaces(save) : [];
  console.log(`  ${roster.length} real-face players on ${save ? path.basename(save) : '(no autosave)'}`);

  const assets: Record<string, Entry> = {};
  let rosterSkipped = 0;
  const skipped: string[] = [];
  for (const r of roster) {
    const key = r.asset.toLowerCase();
    const lk = lookup.get(key);
    // A class this tool imported leaves its own asset names on the roster. A real
    // current player either has a scanned head in the game files or was drafted
    // recently enough to have a cranium head; a 2003 draftee with no scan and
    // rookie service is ours.
    if (!heads.has(key) && lk && lk.draftYear < 2015 && r.yearsPro < 3) { rosterSkipped++; skipped.push(`${r.first} ${r.last} (${r.asset})`); continue; }
    assets[key] = { assetName: r.asset, portraitPid: r.pid, genericHead: r.genericHead, first: r.first, last: r.last, source: heads.has(key) ? (heads.get(key) ? 'roster+bundle' : 'roster+preset') : 'roster' };
  }
  if (rosterSkipped) console.log(`  skipped ${rosterSkipped} roster rows that look tool-imported: ${skipped.slice(0, 10).join(', ')}${skipped.length > 10 ? ', …' : ''}`);

  let bundleOnly = 0, unnamed = 0, presetOnly = 0;
  for (const [key, hasHead] of heads) {
    if (assets[key]) continue;
    const lk = lookup.get(key);
    const kind = hasHead ? 'bundle' : 'preset';
    if (!hasHead) presetOnly++;
    if (lk) {
      assets[key] = { assetName: lk.asset, portraitPid: lk.pid, genericHead: null, first: lk.first, last: lk.last, source: `${kind}+lookup`, draftYear: lk.draftYear || undefined };
      bundleOnly++;
    } else {
      assets[key] = { assetName: key, portraitPid: 0, genericHead: null, first: null, last: null, source: kind };
      unnamed++;
    }
  }
  // Scan dirs the lookup has no asset for: infer the owner when exactly one lookup
  // row (without an asset of its own) spells the same last+first name.
  let inferred = 0;
  for (const [key, e] of Object.entries(assets)) {
    if (e.first) continue;
    const stem = key.split('_')[0].replace(/(jr|sr|iii|ii|iv)$/, '');
    const cands = lookupByName.get(stem) ?? [];
    if (cands.length !== 1) continue;
    const r = cands[0];
    // Casing as the lookup spells legends (polamaluTroy_16548): lowercase last name,
    // capitalised first name; the id keeps the dir's spelling.
    const id = key.slice(stem.length + (key.split('_')[0].length - stem.length));
    const firstPart = key.split('_')[0].slice(r.last.toLowerCase().replace(/[^a-z0-9]/g, '').length);
    const lastPart = key.split('_')[0].slice(0, r.last.toLowerCase().replace(/[^a-z0-9]/g, '').length);
    const cased = lastPart + firstPart.charAt(0).toUpperCase() + firstPart.slice(1) + id;
    Object.assign(e, { assetName: cased, first: r.first, last: r.last, portraitPid: r.pid, source: `${e.source}+name`, draftYear: r.draftYear || undefined });
    inferred++; unnamed--;
  }
  console.log(`  ${bundleOnly} scans not on the roster matched to the lookup (legends/retired), ${inferred} matched by name, ${unnamed} unnamed, ${presetOnly} preset-only`);

  // Lookup assets the game cannot render (no scan, not on the roster).
  const missing = [...lookup.keys()].filter((k) => !assets[k]);
  console.log(`  ${missing.length} lookup assets absent from ${v} (would render as a silhouette)`);

  const byName: Record<string, string> = {};
  for (const [k, e] of Object.entries(assets)) if (e.first && e.last) byName[nameKey(e.first, e.last)] = k;
  return { assets, byName, legendPortraits: [...legendPortraits].sort(), missingFromLookup: missing.sort(), stats: { heads: heads.size, roster: roster.length, rosterSkipped, bundleOnly, unnamed, presetOnly, save: save ? path.basename(save) : null } };
}

(async () => {
  const lookup = lookupAssets();
  indexLookupNames();
  console.log(`${lookup.size} real asset ids in ALL_PLAYER_LOOKUP.csv`);
  const out: Record<string, unknown> = {
    _source: 'scripts/build-face-catalogs.ts — Frostbite toc bundle names (unique head scans) + newest career autosave Player table + lookup casing/PhotoID',
    _built: new Date().toISOString().slice(0, 10),
  };
  for (const v of ['m26', 'm27'] as Version[]) out[v] = await buildVersion(v, lookup);
  const dest = path.join(LOOKUPS_DIR, 'face-assets-by-game.json');
  fs.writeFileSync(dest, JSON.stringify(out));
  console.log(`wrote ${dest}`);
})();
