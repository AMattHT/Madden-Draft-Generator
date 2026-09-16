import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { CACHE_DIR, DATA_ROOT, LOOKUPS_DIR } from '../config/paths';
import { normalizeName, parseCsvFile } from '../util/csv';
import { BaselinePlayer } from '../types/player';
import { PortraitService } from './PortraitService';

/**
 * Madden 27 portrait pack: the menu portraits the game no longer ships, supplied
 * as a mod so the class can point at them.
 *
 * M27's player-portrait library (assetlibrary_playerportraits_brt, 5,114 images)
 * holds the current roster, 531 legends and 993 generics — and nobody else. Tom
 * Brady (portrait 494), Cam Newton (4439) and 5,000 other retired players whose
 * portraits this app holds from Madden 26 are not in it, so their prospects fall
 * back to a tone-matched generic portrait. The class file cannot reach any other
 * image library (the Yard, MUT): PLYR_PORTRAIT indexes this one library only.
 *
 * The way in is the way every custom-portrait mod works: put the image INTO the
 * library under an id, and have the class write that id. The ids are the players'
 * own — the M26 portrait ids the lookup already carries — which are free in M27
 * exactly because the game dropped those images. So one pack of every portrait we
 * hold that M27 lacks, named <pid>.png, imported once with the MMC Frosty Editor's
 * Portrait Manager, serves every class; a class exported with the option on writes
 * those ids for its players. Without the mod imported, such a prospect would show
 * the blank shield, so the option is what decides whether the id is written.
 */
const SHIPPED_FILE = path.join(LOOKUPS_DIR, 'm27-shipped-portrait-pids.json');
const MAPPING_FILE = path.join(LOOKUPS_DIR, 'PID_Portrait_Mapping.csv');
const PACK_ART_DIR = path.join(DATA_ROOT, 'portraits');
/** Drop higher-resolution art here (e.g. an MMC export of another library) as
 *  <First_Last>.png / .jpg or <plpo>.png / .jpg; it wins over the 128px pack art. */
const OVERRIDE_DIR = path.join(CACHE_DIR, 'portrait-sources');
/** Output size. The library stores 512px, but the pack art is 128px, so 256
 *  carries everything it has at a quarter of the bytes (5,000 files). */
const SIZE = 256;
export const FULL_PACK_NAME = 'M27-ALL-PORTRAITS';

export interface PackAssignment {
  index: number; // prospect index in the class
  pid: number; // the player's own portrait id, which the class writes
  plpo: string; // that id's asset name in the library
  firstName: string;
  lastName: string;
  draftYear: number;
  source: string; // file the image came from
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

/** Higher-resolution art the user dropped in, or null. */
function overrideFor(first: string, last: string, plpo: string | null): string | null {
  const names = [`${normalizeName(first)}_${normalizeName(last)}`, ...(plpo ? [plpo] : [])];
  for (const n of names) for (const ext of ['png', 'jpg', 'jpeg']) {
    const f = path.join(OVERRIDE_DIR, `${n}.${ext}`);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

/** The player's own portrait id when M27 lacks it and we hold the art; else null. */
function ownPortrait(p: Pick<BaselinePlayer, 'firstName' | 'lastName' | 'photoId'>): { pid: number; plpo: string; source: string } | null {
  const pid = p.photoId ?? 0;
  if (!pid || shippedPids().has(pid)) return null;
  const plpo = PortraitService.plpoForPid(pid);
  if (!plpo || /^plpo_generic|^plpo_Blank$/i.test(plpo)) return null;
  const source = overrideFor(p.firstName, p.lastName, plpo) ?? (fs.existsSync(path.join(PACK_ART_DIR, `${plpo}.jpg`)) ? path.join(PACK_ART_DIR, `${plpo}.jpg`) : null);
  return source ? { pid, plpo, source } : null;
}

async function writePng(source: string, out: string): Promise<void> {
  const png = await sharp(source).resize(SIZE, SIZE, { kernel: 'lanczos3', fit: 'cover' }).png().toBuffer();
  fs.writeFileSync(out, png);
}

export const PortraitPackService = {
  /** Where a class's pack folder goes. */
  dirFor(classFileName: string): string {
    return path.join(CACHE_DIR, 'portrait-packs', classFileName.replace(/[^A-Za-z0-9_.-]/g, '_'));
  },

  /**
   * Which prospects get a pack portrait: a real player (not generated filler)
   * whose class portrait is generic or blank and whose own portrait we hold.
   */
  assign(prospects: Array<Record<string, unknown>>, players: BaselinePlayer[]): PackAssignment[] {
    const out: PackAssignment[] = [];
    prospects.forEach((prospect, index) => {
      const p = players[index];
      if (!p || p.source === 'generated') return;
      if (!isGenericOrBlank(Number(prospect.PID) || 0)) return;
      const own = ownPortrait(p);
      if (!own) return;
      out.push({ index, pid: own.pid, plpo: own.plpo, firstName: p.firstName, lastName: p.lastName, draftYear: p.draftYear, source: own.source });
    });
    return out;
  },

  /** Pin the players' own ids on the prospects (before assignM27Fields, which
   *  keeps a pinned portrait on a generic head). */
  apply(prospects: Array<Record<string, unknown>>, players: BaselinePlayer[]): PackAssignment[] {
    const assignments = this.assign(prospects, players);
    for (const a of assignments) {
      prospects[a.index].PID = a.pid;
      prospects[a.index].pinPortrait = true;
    }
    return assignments;
  },

  /** Write one class's subset: <pid>.png per player, manifest.csv, README.txt. */
  async write(assignments: PackAssignment[], outDir: string): Promise<{ dir: string; count: number; errors: string[] }> {
    fs.mkdirSync(outDir, { recursive: true });
    const errors: string[] = [];
    let count = 0;
    for (const a of assignments) {
      try {
        await writePng(a.source, path.join(outDir, `${a.pid}.png`));
        count++;
      } catch (e) {
        errors.push(`${a.firstName} ${a.lastName}: ${(e as Error).message}`);
      }
    }
    const csv = ['pid,plpo,player,draft_year,source', ...assignments.map((a) => `${a.pid},${a.plpo},"${a.firstName} ${a.lastName}",${a.draftYear},"${path.basename(a.source)}"`)].join('\n');
    fs.writeFileSync(path.join(outDir, 'manifest.csv'), csv + '\n');
    fs.writeFileSync(path.join(outDir, 'README.txt'), README);
    return { dir: outDir, count, errors };
  },

  /** Every portrait the app holds that M27 lacks (about 5,100), named by id. */
  fullPackEntries(): Array<{ pid: number; plpo: string; name: string; source: string }> {
    const rows = parseCsvFile<Record<string, string>>(MAPPING_FILE);
    const out: Array<{ pid: number; plpo: string; name: string; source: string }> = [];
    for (const r of rows) {
      const pid = parseInt(r['PID'], 10);
      const plpo = (r['Portrait'] || '').trim();
      if (!pid || !plpo || (r['Type'] || '').trim() === 'generic' || shippedPids().has(pid)) continue;
      const name = (r['Player Name'] || '').trim();
      const [first, ...rest] = name.split(' ');
      const source = overrideFor(first || '', rest.join(' '), plpo) ?? (fs.existsSync(path.join(PACK_ART_DIR, `${plpo}.jpg`)) ? path.join(PACK_ART_DIR, `${plpo}.jpg`) : null);
      if (source) out.push({ pid, plpo, name, source });
    }
    return out.sort((a, b) => a.pid - b.pid);
  },

  /** Write the whole pack once; files already present are kept unless `force`. */
  async writeFull(opts: { force?: boolean } = {}): Promise<{ dir: string; count: number; skipped: number; errors: string[] }> {
    const dir = this.dirFor(FULL_PACK_NAME);
    fs.mkdirSync(dir, { recursive: true });
    const entries = this.fullPackEntries();
    const errors: string[] = [];
    let count = 0, skipped = 0;
    for (const e of entries) {
      const out = path.join(dir, `${e.pid}.png`);
      if (!opts.force && fs.existsSync(out)) { skipped++; continue; }
      try {
        await writePng(e.source, out);
        count++;
      } catch (err) {
        errors.push(`${e.name}: ${(err as Error).message}`);
      }
    }
    const csv = ['pid,plpo,player,source', ...entries.map((e) => `${e.pid},${e.plpo},"${e.name}","${path.basename(e.source)}"`)].join('\n');
    fs.writeFileSync(path.join(dir, 'manifest.csv'), csv + '\n');
    fs.writeFileSync(path.join(dir, 'README.txt'), README);
    return { dir, count, skipped, errors };
  },
};

const README = `Madden 27 portrait pack
=======================
Menu portraits Madden 27 no longer ships, for retired players in generated
draft classes (Tom Brady, Cam Newton and about 5,000 more). Each PNG is named
by the player's own portrait id, the id the app writes for him when a class is
exported with "Portrait pack" on. Madden 27 does not use these ids, so nothing
else is affected. manifest.csv lists id, asset name (plpo), player and image
source.

To use:
  1. Open the MMC Frosty Editor for Madden 27 and go to
     Tools > Portrait Manager > Image Library Manager.
  2. With assetlibrary_playerportraits_brt selected, import this folder
     (each <id>.png is stored under that id).
  3. Save the mod, apply it, launch Madden and import the draft class as usual.

The full pack (${FULL_PACK_NAME}) covers every class; a class's own folder is
the subset that class uses. The art is the app's 128px portrait pack upscaled;
to use sharper art, drop <First_Last>.png (or <plpo>.png) into the app cache's
portrait-sources folder and build again.
`;
