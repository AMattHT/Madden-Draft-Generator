import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { CACHE_DIR, DATA_ROOT, LOOKUPS_DIR } from '../config/paths';
import { normalizeName } from '../util/csv';
import { BaselinePlayer } from '../types/player';
import { PortraitService } from './PortraitService';

/**
 * Madden 27 portrait pack: the menu portraits the game no longer ships, supplied
 * as a mod alongside the class.
 *
 * M27's player-portrait library (assetlibrary_playerportraits_brt, 5,114 images)
 * holds the current roster, 531 legends and 993 generics — and nobody else. Tom
 * Brady (regular portrait 494 in M26), Cam Newton (4439) and most retired players
 * are simply not in it, so their prospects fall back to a tone-matched generic
 * portrait. The class file cannot reach any other image library (the Yard, MUT):
 * PLYR_PORTRAIT indexes this one library only.
 *
 * The way in is the way every custom-portrait mod works: put the image INTO the
 * library under an id, and have the class write that id. This service recycles
 * generic ids the game ships but nothing ever displays (m27-portrait-pack-slots.json:
 * 775 generic portraits neither the M27 roster nor this generator's generic-head
 * pool uses), assigns them in class order, pins them on the prospects, and writes
 * <pid>.png files (512x512, the library's own size) plus a manifest for the MMC
 * Frosty Editor's Portrait Manager. Without the mod imported, those prospects show
 * the slot's own generic portrait — exactly what they show today.
 *
 * Assignment is deterministic over the class, so the .mdc and the pack folder
 * always agree without shared state (same rule as the M26 PortraitSlotService).
 */
const SLOTS_FILE = path.join(LOOKUPS_DIR, 'm27-portrait-pack-slots.json');
const PACK_ART_DIR = path.join(DATA_ROOT, 'portraits');
/** Drop higher-resolution art here (e.g. an MMC export of another library) as
 *  <First_Last>.png / .jpg or <plpo>.png / .jpg; it wins over the 128px pack art. */
const OVERRIDE_DIR = path.join(CACHE_DIR, 'portrait-sources');
const SIZE = 512;

interface Slot { pid: number; plpo: string; tone: number }

export interface PackAssignment {
  index: number; // prospect index in the class
  pid: number; // recycled generic id the class writes
  plpo: string; // that id's asset name in the library
  firstName: string;
  lastName: string;
  draftYear: number;
  source: string; // file the image came from
}

let slots: Slot[] | null = null;
function loadSlots(): Slot[] {
  if (slots) return slots;
  try {
    slots = (JSON.parse(fs.readFileSync(SLOTS_FILE, 'utf8')) as { slots: Slot[] }).slots ?? [];
  } catch {
    slots = [];
  }
  return slots;
}

/** A portrait id that shows a generic face (or nothing): the pack replaces these. */
function isGenericOrBlank(pid: number): boolean {
  if (!pid) return true;
  const plpo = PortraitService.plpoForPid(pid);
  return !plpo || /^plpo_generic/i.test(plpo);
}

/** The best image we hold of this man, or null. */
function artFor(p: Pick<BaselinePlayer, 'firstName' | 'lastName' | 'photoId'>): string | null {
  const plpo = p.photoId ? PortraitService.plpoForPid(p.photoId) : null;
  const names = [`${normalizeName(p.firstName)}_${normalizeName(p.lastName)}`, ...(plpo ? [plpo] : [])];
  for (const n of names) for (const ext of ['png', 'jpg', 'jpeg']) {
    const f = path.join(OVERRIDE_DIR, `${n}.${ext}`);
    if (fs.existsSync(f)) return f;
  }
  if (plpo && !/^plpo_generic|^plpo_Blank$/i.test(plpo)) {
    const f = path.join(PACK_ART_DIR, `${plpo}.jpg`);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

export const PortraitPackService = {
  get slotCount(): number {
    return loadSlots().length;
  },

  /** Where a class's pack folder goes. */
  dirFor(classFileName: string): string {
    return path.join(CACHE_DIR, 'portrait-packs', classFileName.replace(/[^A-Za-z0-9_.-]/g, '_'));
  },

  /**
   * Which prospects get a pack portrait and which slot each takes. A prospect
   * qualifies when he is a real player (not generated filler), his class portrait
   * is generic or blank, and we hold art of him. Slots are handed out in class
   * order, tone-matched so the fallback (mod not imported) still fits him.
   */
  assign(prospects: Array<Record<string, unknown>>, players: BaselinePlayer[]): PackAssignment[] {
    const all = loadSlots();
    if (!all.length) return [];
    const byTone = new Map<number, Slot[]>();
    for (const s of all) (byTone.get(s.tone) ?? byTone.set(s.tone, []).get(s.tone)!).push(s);
    const cursor = new Map<number, number>();
    const take = (tone: number): Slot | null => {
      const order = [tone, ...[1, 2, 3, 4, 5, 6, 7].sort((a, b) => Math.abs(a - tone) - Math.abs(b - tone))];
      for (const t of order) {
        const list = byTone.get(t);
        const i = cursor.get(t) ?? 0;
        if (list && i < list.length) { cursor.set(t, i + 1); return list[i]; }
      }
      return null;
    };
    const out: PackAssignment[] = [];
    prospects.forEach((prospect, index) => {
      const p = players[index];
      if (!p || p.source === 'generated') return;
      if (!isGenericOrBlank(Number(prospect.PID) || 0)) return;
      const source = artFor(p);
      if (!source) return;
      const slot = take(p.race ?? 7);
      if (!slot) return;
      out.push({ index, pid: slot.pid, plpo: slot.plpo, firstName: p.firstName, lastName: p.lastName, draftYear: p.draftYear, source });
    });
    return out;
  },

  /** Pin the recycled ids on the prospects (before assignM27Fields, which keeps a
   *  pinned portrait on a generic head). */
  apply(prospects: Array<Record<string, unknown>>, players: BaselinePlayer[]): PackAssignment[] {
    const assignments = this.assign(prospects, players);
    for (const a of assignments) {
      prospects[a.index].PID = a.pid;
      prospects[a.index].pinPortrait = true;
    }
    return assignments;
  },

  /** Write the pack folder: <pid>.png per player, manifest.csv, README.txt. */
  async write(assignments: PackAssignment[], outDir: string): Promise<{ dir: string; count: number; errors: string[] }> {
    fs.mkdirSync(outDir, { recursive: true });
    const errors: string[] = [];
    let count = 0;
    for (const a of assignments) {
      try {
        const png = await sharp(a.source).resize(SIZE, SIZE, { kernel: 'lanczos3', fit: 'cover' }).png().toBuffer();
        fs.writeFileSync(path.join(outDir, `${a.pid}.png`), png);
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
};

const README = `Madden 27 portrait pack
=======================
Menu portraits for players in this draft class whom Madden 27 no longer ships a
portrait for (retired players such as Tom Brady and Cam Newton). Each PNG is
named by the portrait id the class file already writes for that player; the id
belongs to a generic portrait the game ships but never displays, so replacing
its image affects nobody else. manifest.csv lists id, asset name (plpo), player
and the image source.

To use:
  1. Open the MMC Frosty Editor for Madden 27 and go to
     Tools > Portrait Manager > Image Library Manager.
  2. With assetlibrary_playerportraits_brt selected, import this folder
     (each <id>.png replaces the image stored under that id).
  3. Save the mod, apply it, launch Madden and import the draft class as usual.

Without the mod, these players show the slot's own generic portrait, as before.
Every class hands out the same ids in its own order, so import the pack of the
class you are drafting from; two classes' packs cannot be active at once.
The pack art is the app's 128px portrait pack upscaled; to use sharper art, drop
<First_Last>.png (or <plpo>.png) into the app cache's portrait-sources folder
before exporting and it will be used instead.
`;
