import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { CACHE_DIR, DATA_ROOT, LOOKUPS_DIR } from '../config/paths';
import { normalizeName, parseCsvFile } from '../util/csv';
import { BaselinePlayer, nflversePick } from '../types/player';
import { PortraitService } from './PortraitService';
import { RetroHeadshotService } from './RetroHeadshotService';
import { PortraitFetchService } from './PortraitFetchService';
import { NflverseCareerService } from './NflverseCareerService';
import { PlayerLookupService } from './PlayerLookupService';
import { CustomPortraitIdService } from './CustomPortraitIdService';

/**
 * Madden 27 portrait pack: the menu portraits the game does not ship, supplied
 * as a mod so the class can point at them.
 *
 * M27's player-portrait library (assetlibrary_playerportraits_brt, 5,114 images)
 * holds the current roster, 531 legends and 993 generics — and nobody else. Tom
 * Brady (portrait 494), Cam Newton (4439) and 5,000 other retired players whose
 * portraits this app holds from Madden 26 are not in it, and 25,000 more lookup
 * players never had a Madden portrait at all. The class file cannot reach any other
 * image library (the Yard, MUT): PLYR_PORTRAIT indexes this one library only.
 *
 * The way in is the way every custom-portrait mod works: put the image INTO the
 * library under an id, and have the class write that id.
 *   - A player with an own (M26) portrait id keeps it: the id is free in M27
 *     exactly because the game dropped the image.
 *   - A player with no id gets a custom one (CustomPortraitIdService, 60000+) when
 *     we have a picture of him: a file the user dropped into portrait-sources,
 *     the Madden 2001–2017 disc headshot (RetroHeadshotService), or, on request,
 *     his NFL/ESPN headshot (the url nflverse carries).
 * The full pack (File → Build Madden 27 portrait pack) is every own-id portrait
 * plus every custom one with a picture on disk, written as <pid>.dds (the only
 * form the MMC Frosty Editor's Portrait Manager imports: "a folder of DDS files,
 * each named the ID you wish to assign"), imported once through Tools > Portrait
 * Manager > Import Player Portraits; a class exported with the option
 * on pins those ids. Without the mod such a prospect shows the blank shield, so
 * the option is what decides whether the id is written.
 */
const SHIPPED_FILE = path.join(LOOKUPS_DIR, 'm27-shipped-portrait-pids.json');
const MAPPING_FILE = path.join(LOOKUPS_DIR, 'PID_Portrait_Mapping.csv');
const PACK_ART_DIR = path.join(DATA_ROOT, 'portraits');
/** Output size: the library's own 512px, so an imported portrait matches the
 *  game's (the pack art is 128px and the disc headshots 96-256px, upscaled). */
const SIZE = 512;
export const FULL_PACK_NAME = 'M27-ALL-PORTRAITS';

export type PackKind = 'own' | 'file' | 'retro' | 'cdn';

export interface PackAssignment {
  index: number; // prospect index in the class
  pid: number; // portrait id the class writes (own, or custom 60000+)
  plpo: string; // library asset name for an own id, 'custom' otherwise
  kind: PackKind;
  firstName: string;
  lastName: string;
  draftYear: number;
  source: string; // image file, or the url still to download (kind 'cdn')
}

export interface MissingPortrait {
  index: number;
  firstName: string;
  lastName: string;
  draftYear: number;
  /** Drop a picture under this name into portrait-sources and export again. */
  expectedFile: string;
}

export interface PackOptions {
  /** Download NFL/ESPN headshots for players with no other picture (network). */
  cdn?: boolean;
}

/** Drop art here as <year>_<First_Last>.png (or .jpg), <First_Last>.png, or
 *  <plpo>.png; it wins over every other source. CDN downloads are cached under
 *  cdn/ so a re-export is offline. */
let overrideDir = path.join(CACHE_DIR, 'portrait-sources');
/** Other portrait mods (.fbmod) dropped here: every id one of them adds is left
 *  out of our pack, so two mods never fight over an image. A Frosty mod lists the
 *  resources it touches in plain text (assets/added/plpo_id_<pid>) even though
 *  the MMC build encrypts the image data, so no decoding is needed. */
let otherModsDir = path.join(CACHE_DIR, 'portrait-packs', 'other-mods');
let otherModsCache: { stamp: string; ids: Map<number, string> } | null = null;

/** Portrait ids claimed by the mods in other-mods, with the mod file each came from. */
function otherModIds(): Map<number, string> {
  let files: string[] = [];
  try { files = fs.readdirSync(otherModsDir).filter((f) => /\.fbmod$/i.test(f)).sort(); } catch { /* no folder */ }
  const stamp = files.map((f) => `${f}:${fs.statSync(path.join(otherModsDir, f)).mtimeMs}`).join('|');
  if (otherModsCache && otherModsCache.stamp === stamp) return otherModsCache.ids;
  const ids = new Map<number, string>();
  for (const f of files) {
    const text = fs.readFileSync(path.join(otherModsDir, f)).toString('latin1');
    for (const m of text.matchAll(/assets\/added\/plpo_id_(\d+)/g)) if (!ids.has(Number(m[1]))) ids.set(Number(m[1]), f);
  }
  otherModsCache = { stamp, ids };
  return ids;
}

let shipped: Set<number> | null = null;
function shippedPids(): Set<number> {
  if (shipped) return shipped;
  try {
    shipped = new Set((JSON.parse(fs.readFileSync(SHIPPED_FILE, 'utf8')) as { pids: number[] }).pids);
  } catch {
    shipped = new Set();
  }
  return shipped;
}

/** A portrait id that shows a generic face (or nothing): the pack replaces these. */
function isGenericOrBlank(pid: number): boolean {
  if (!pid) return true;
  const plpo = PortraitService.plpoForPid(pid);
  return !plpo || /^plpo_generic/i.test(plpo);
}

const fileStem = (first: string, last: string) => `${normalizeName(first)}_${normalizeName(last)}`;
export const expectedFileName = (p: { firstName: string; lastName: string; draftYear: number }) => `${p.draftYear}_${fileStem(p.firstName, p.lastName)}.png`;

/** A picture the user dropped in, or null. Year-prefixed names win, so two men
 *  of one name in different drafts can each have their own. */
function overrideFor(first: string, last: string, year: number | null, plpo: string | null): string | null {
  const stem = fileStem(first, last);
  const names = [...(year ? [`${year}_${stem}`] : []), stem, ...(plpo ? [plpo] : [])];
  for (const n of names) for (const ext of ['png', 'jpg', 'jpeg']) {
    const f = path.join(overrideDir, `${n}.${ext}`);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

/** The player's own portrait id when M27 lacks it and we hold the art; else null. */
function ownPortrait(p: Pick<BaselinePlayer, 'firstName' | 'lastName' | 'photoId' | 'draftYear'>): { pid: number; plpo: string; source: string } | null {
  const pid = p.photoId ?? 0;
  if (!pid || shippedPids().has(pid)) return null;
  const plpo = PortraitService.plpoForPid(pid);
  if (!plpo || /^plpo_generic|^plpo_Blank$/i.test(plpo)) return null;
  const packFile = path.join(PACK_ART_DIR, `${plpo}.jpg`);
  const source = overrideFor(p.firstName, p.lastName, p.draftYear, plpo) ?? (fs.existsSync(packFile) ? packFile : null);
  return source ? { pid, plpo, source } : null;
}

const cdnCachePath = (p: { firstName: string; lastName: string; draftYear: number }) => path.join(overrideDir, 'cdn', expectedFileName(p));

/** A picture for a player with no portrait id: dropped file, disc headshot, or
 *  (asked for) the NFL/ESPN headshot url; null when there is none. */
function customSource(p: BaselinePlayer, opts: PackOptions): { kind: PackKind; source: string } | null {
  const file = overrideFor(p.firstName, p.lastName, p.draftYear, null);
  if (file) return { kind: 'file', source: file };
  const retro = RetroHeadshotService.filePath(p.firstName, p.lastName, p.position, p.draftYear);
  if (retro) return { kind: 'retro', source: retro };
  const cached = cdnCachePath(p);
  if (fs.existsSync(cached)) return { kind: 'cdn', source: cached };
  if (opts.cdn) {
    const url = NflverseCareerService.get(p.firstName, p.lastName, p.draftYear, nflversePick(p))?.headshotUrl;
    if (url && /^https:\/\/(a\.espncdn\.com|static\.www\.nfl\.com)\//.test(url)) return { kind: 'cdn', source: url };
  }
  return null;
}

/** Face-crop a downloaded headshot into the pack size; refuse anything that is
 *  not a real picture (tiny placeholders). */
async function downloadCdn(url: string, cachePath: string): Promise<string> {
  const png = await PortraitFetchService.fetchPortraitPng(url, SIZE);
  const meta = await sharp(png).metadata();
  if (!meta.width || !meta.height || meta.width < 100) throw new Error('not a usable picture');
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, png);
  return cachePath;
}

/**
 * Write the picture as an uncompressed DDS (DX10 header, R8G8B8A8_UNORM_SRGB, one
 * mip). The Portrait Manager's texture importer takes R8G8B8A8 or BC7 and insists
 * on the sRGB variant, then re-encodes to the library's own BC7 on import; a plain
 * RGBA file needs no encoder here. 512x512x4 = 1 MB per portrait on disk; the
 * editor's import log reads it as source=DDS, type=TT_2d, format=R8G8B8A8_SRGB,
 * depth=1, mips=1, srgb=True.
 */
async function writeDds(source: string, out: string): Promise<void> {
  const meta = await sharp(source).metadata();
  let img = sharp(source).resize(SIZE, SIZE, { kernel: 'lanczos3', fit: 'cover' });
  // An upscale from the 128px pack art or a 96-256px disc headshot comes out soft;
  // an unsharp mask after the resize brings the edges back without ringing at this
  // strength. A picture already at or above the output size is left alone.
  if ((meta.width ?? 0) < SIZE) img = img.sharpen({ sigma: 1.5, m1: 1.0, m2: 2.5 });
  const rgba = await img.ensureAlpha().raw().toBuffer();
  const header = Buffer.alloc(4 + 124 + 20);
  header.write('DDS ', 0, 'ascii');
  header.writeUInt32LE(124, 4); // header size
  header.writeUInt32LE(0x1 | 0x2 | 0x4 | 0x8 | 0x1000, 8); // CAPS | HEIGHT | WIDTH | PITCH | PIXELFORMAT
  header.writeUInt32LE(SIZE, 12); // height
  header.writeUInt32LE(SIZE, 16); // width
  header.writeUInt32LE(SIZE * 4, 20); // pitch
  header.writeUInt32LE(0, 24); // depth
  header.writeUInt32LE(1, 28); // mip count
  header.writeUInt32LE(32, 76); // pixel format size
  header.writeUInt32LE(0x4, 80); // DDPF_FOURCC
  header.write('DX10', 84, 'ascii');
  header.writeUInt32LE(0x1000, 108); // DDSCAPS_TEXTURE
  header.writeUInt32LE(29, 128); // DXGI_FORMAT_R8G8B8A8_UNORM_SRGB
  header.writeUInt32LE(3, 132); // D3D10_RESOURCE_DIMENSION_TEXTURE2D
  header.writeUInt32LE(0, 136); // misc flag
  header.writeUInt32LE(1, 140); // array size
  header.writeUInt32LE(0, 144); // misc flags 2
  fs.writeFileSync(out, Buffer.concat([header, rgba]));
}

const eligible = (prospect: Record<string, unknown>, p: BaselinePlayer | undefined): p is BaselinePlayer =>
  !!p && p.source !== 'generated' && isGenericOrBlank(Number(prospect.PID) || 0);

export const PortraitPackService = {
  /** Where a class's pack folder goes. */
  dirFor(classFileName: string): string {
    return path.join(CACHE_DIR, 'portrait-packs', classFileName.replace(/[^A-Za-z0-9_.-]/g, '_'));
  },

  /**
   * Which prospects get a pack portrait: a real player (not generated filler)
   * whose class portrait is generic or blank, with his own portrait held here or
   * a picture for a custom id. Custom ids are allocated as they are met.
   */
  assign(prospects: Array<Record<string, unknown>>, players: BaselinePlayer[], opts: PackOptions = {}): PackAssignment[] {
    const out: PackAssignment[] = [];
    prospects.forEach((prospect, index) => {
      const p = players[index];
      if (!eligible(prospect, p)) return;
      const base = { index, firstName: p.firstName, lastName: p.lastName, draftYear: p.draftYear };
      const own = ownPortrait(p);
      if (own) { out.push({ ...base, pid: own.pid, plpo: own.plpo, kind: 'own', source: own.source }); return; }
      const custom = customSource(p, opts);
      if (!custom) return;
      const pid = CustomPortraitIdService.idFor(p, { allocate: true })!;
      out.push({ ...base, pid, plpo: 'custom', kind: custom.kind, source: custom.source });
    });
    return out;
  },

  /** Real players in the class still showing a generic or blank portrait. */
  missing(prospects: Array<Record<string, unknown>>, players: BaselinePlayer[], assignments: PackAssignment[]): MissingPortrait[] {
    const covered = new Set(assignments.map((a) => a.index));
    const out: MissingPortrait[] = [];
    prospects.forEach((prospect, index) => {
      const p = players[index];
      if (covered.has(index) || !eligible(prospect, p)) return;
      out.push({ index, firstName: p.firstName, lastName: p.lastName, draftYear: p.draftYear, expectedFile: expectedFileName(p) });
    });
    return out;
  },

  /** Pin the ids on the prospects (before assignM27Fields, which keeps a pinned
   *  portrait on a generic head). */
  apply(prospects: Array<Record<string, unknown>>, players: BaselinePlayer[], opts: PackOptions = {}): PackAssignment[] {
    const assignments = this.assign(prospects, players, opts);
    for (const a of assignments) {
      prospects[a.index].PID = a.pid;
      prospects[a.index].pinPortrait = true;
    }
    return assignments;
  },

  /** Write one class's subset: <pid>.dds per player, manifest.csv (with status),
   *  missing.csv (players still without a picture), README.txt. */
  async write(assignments: PackAssignment[], outDir: string, missing: MissingPortrait[] = []): Promise<{ dir: string; count: number; missing: number; otherMod: number; errors: string[] }> {
    fs.mkdirSync(outDir, { recursive: true });
    const errors: string[] = [];
    const taken = otherModIds();
    let count = 0, otherMod = 0;
    for (const a of assignments) {
      if (taken.has(a.pid)) { otherMod++; continue; } // another mod supplies this id; the class still points at it
      try {
        const source = a.kind === 'cdn' && /^https?:/.test(a.source) ? await downloadCdn(a.source, cdnCachePath(a)) : a.source;
        await writeDds(source, path.join(outDir, `${a.pid}.dds`));
        count++;
      } catch (e) {
        errors.push(`${a.firstName} ${a.lastName}: ${(e as Error).message}`);
        missing = [...missing, { index: a.index, firstName: a.firstName, lastName: a.lastName, draftYear: a.draftYear, expectedFile: expectedFileName(a) }];
      }
    }
    const csv = ['pid,plpo,status,player,draft_year,source', ...assignments.map((a) => `${a.pid},${a.plpo},${taken.has(a.pid) ? `other-mod:${taken.get(a.pid)}` : a.kind},"${a.firstName} ${a.lastName}",${a.draftYear},"${path.basename(a.source)}"`)].join('\n');
    fs.writeFileSync(path.join(outDir, 'manifest.csv'), csv + '\n');
    const miss = ['player,draft_year,drop_in_portrait_sources_as', ...missing.map((m) => `"${m.firstName} ${m.lastName}",${m.draftYear},${m.expectedFile}`)].join('\n');
    fs.writeFileSync(path.join(outDir, 'missing.csv'), miss + '\n');
    fs.writeFileSync(path.join(outDir, 'README.txt'), README);
    return { dir: outDir, count, missing: missing.length, otherMod, errors };
  },

  /** Every portrait the app can supply that M27 lacks: own-id portraits (about
   *  5,100) plus custom ids for players with a picture on disk (disc headshots,
   *  dropped files; CDN downloads only when a class asked for them). */
  fullPackEntries(): Array<{ pid: number; plpo: string; kind: PackKind; name: string; source: string }> {
    const out: Array<{ pid: number; plpo: string; kind: PackKind; name: string; source: string }> = [];
    for (const r of parseCsvFile<Record<string, string>>(MAPPING_FILE)) {
      const pid = parseInt(r['PID'], 10);
      const plpo = (r['Portrait'] || '').trim();
      if (!pid || !plpo || (r['Type'] || '').trim() === 'generic') continue;
      const name = (r['Player Name'] || '').trim();
      const [first, ...rest] = name.split(' ');
      const dropped = overrideFor(first || '', rest.join(' '), null, plpo);
      // An id the game ships is only written when a better picture was dropped in
      // (it then replaces the game's own image); otherwise the pack art stands in
      // for the ids the game dropped.
      if (shippedPids().has(pid)) { if (dropped) out.push({ pid, plpo, kind: 'file', name, source: dropped }); continue; }
      const packFile = path.join(PACK_ART_DIR, `${plpo}.jpg`);
      const source = dropped ?? (fs.existsSync(packFile) ? packFile : null);
      if (source) out.push({ pid, plpo, kind: dropped ? 'file' : 'own', name, source });
    }
    for (const year of PlayerLookupService.years()) {
      for (const p of PlayerLookupService.byYear(year)) {
        if (p.photoId || p.source === 'generated') continue;
        const custom = customSource(p, {});
        if (!custom) continue;
        const pid = CustomPortraitIdService.idFor(p, { allocate: true })!;
        out.push({ pid, plpo: 'custom', kind: custom.kind, name: `${p.firstName} ${p.lastName}`, source: custom.source });
      }
    }
    return out.sort((a, b) => a.pid - b.pid);
  },

  /** Write the whole pack once; files already present are kept unless `force`. */
  async writeFull(opts: { force?: boolean } = {}): Promise<{ dir: string; count: number; skipped: number; otherMod: number; errors: string[] }> {
    const dir = this.dirFor(FULL_PACK_NAME);
    fs.mkdirSync(dir, { recursive: true });
    const entries = this.fullPackEntries();
    const errors: string[] = [];
    const taken = otherModIds();
    let count = 0, skipped = 0, otherMod = 0;
    for (const e of entries) {
      const out = path.join(dir, `${e.pid}.dds`);
      if (taken.has(e.pid)) {
        // Another mod supplies this id: leave it out, and drop a file an earlier run wrote.
        otherMod++;
        if (fs.existsSync(out)) fs.unlinkSync(out);
        continue;
      }
      if (!opts.force && fs.existsSync(out)) { skipped++; continue; }
      try {
        await writeDds(e.source, out);
        count++;
      } catch (err) {
        errors.push(`${e.name}: ${(err as Error).message}`);
      }
    }
    // Earlier builds wrote PNGs, which the importer ignores; clear them out.
    for (const f of fs.readdirSync(dir)) if (/^\d+\.png$/.test(f)) fs.unlinkSync(path.join(dir, f));
    const csv = ['pid,plpo,status,player,source', ...entries.map((e) => `${e.pid},${e.plpo},${taken.has(e.pid) ? `other-mod:${taken.get(e.pid)}` : e.kind},"${e.name}","${path.basename(e.source)}"`)].join('\n');
    fs.writeFileSync(path.join(dir, 'manifest.csv'), csv + '\n');
    fs.writeFileSync(path.join(dir, 'README.txt'), README);
    return { dir, count, skipped, otherMod, errors };
  },

  get sourcesDir(): string {
    return overrideDir;
  },

  /** Tests: read dropped-in pictures from another folder. */
  useSourcesDir(dir: string): void {
    overrideDir = dir;
  },

  get otherModsDir(): string {
    return otherModsDir;
  },

  /** Ids other portrait mods supply (see other-mods), with the file each came from. */
  otherModIds(): Map<number, string> {
    return otherModIds();
  },

  /** Tests: read other mods from another folder. */
  useOtherModsDir(dir: string): void {
    otherModsDir = dir;
    otherModsCache = null;
  },
};

const README = `Madden 27 portrait pack
=======================
Menu portraits Madden 27 does not ship, for players in generated draft classes.
Each DDS file is named by the portrait id the app writes for that player when a
class is exported with "Portrait pack" on:
  - a retired player's own Madden portrait id (Tom Brady 494, Cam Newton 4439),
    which the game no longer uses;
  - a custom id from 60000 up for a player who never had a Madden portrait, when
    the app has a picture of him: a file you dropped in, his Madden 2001-2017
    disc headshot, or his NFL/ESPN headshot when you ticked that option.
manifest.csv lists id, asset name, status (own / file / retro / cdn), player and
image source. missing.csv lists the class's players still without a picture and
the file name to drop into the app cache's portrait-sources folder
(<year>_<first>_<last>.png); export again and they are included.

To use:
  1. Open the MMC Frosty Editor for Madden 27 and go to
     Tools > Portrait Manager > Import Player Portraits.
  2. When it asks for the folder, pick THIS folder (the one holding the .dds
     files, not its parent). Each <id>.dds becomes the portrait with that id.
  3. File > Export Mod, then apply the mod in the Mod Manager, launch Madden and
     import the draft class as usual.
The importer reads DDS files only and takes the id from the file name; that is
why the pack is written this way.

The full pack (${FULL_PACK_NAME}) covers every class; a class's own folder is
the subset that class uses. Custom ids are remembered on this machine
(custom-ids.json next to the packs), so a player keeps his id across exports.

Better pictures: a file dropped into portrait-sources replaces the pack art for
that player, and for a portrait the game already ships (a legend such as Joe
Montana, plpo_legends_JoeMontana_Profile.png) it is written under the game's own
id and replaces the game's image on import.

Other portrait mods: copy any portrait .fbmod you also use into the other-mods
folder next to the packs and build again. Every id that mod adds is left out of
this pack (status other-mod in manifest.csv), so the two never fight over an
image; the class still points at the id and the other mod's picture shows.
`;
