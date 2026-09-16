import fs from 'fs';
import path from 'path';
import { CACHE_DIR } from '../config/paths';
import { normalizeName } from '../util/csv';

/**
 * Portrait ids for players who never had a Madden portrait.
 *
 * A player with an M26 portrait id keeps it in the M27 portrait pack (the id is
 * free there). A player with no id at all — most of the pre-2000 lookup — needs
 * one the game does not use before a pack image can be attached to him. The
 * portrait field is a 16-bit integer and the highest id the game or the mapping
 * table uses is 14429, so 60000–65535 is free. Ids are handed out once, on this
 * machine, and remembered in cache/portrait-packs/custom-ids.json so the pack
 * image and every later class export agree; the pack and the classes it serves
 * are built on the same machine, so a per-machine registry is enough.
 */
export const CUSTOM_PID_BASE = 60000;
export const CUSTOM_PID_MAX = 65535;

interface Registry { next: number; ids: Record<string, number> }

let file = path.join(CACHE_DIR, 'portrait-packs', 'custom-ids.json');
let reg: Registry | null = null;

function load(): Registry {
  if (reg) return reg;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<Registry>;
    reg = { next: Math.max(CUSTOM_PID_BASE, Number(raw.next) || CUSTOM_PID_BASE), ids: raw.ids ?? {} };
  } catch {
    reg = { next: CUSTOM_PID_BASE, ids: {} };
  }
  return reg;
}

function save(): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(load(), null, 2) + '\n');
  fs.renameSync(tmp, file);
}

export const keyFor = (p: { firstName: string; lastName: string; draftYear: number }) =>
  `${p.draftYear}|${normalizeName(p.firstName)}|${normalizeName(p.lastName)}`;

export const CustomPortraitIdService = {
  /** The player's custom id; allocates the next free one when asked and unknown. */
  idFor(p: { firstName: string; lastName: string; draftYear: number }, opts: { allocate?: boolean } = {}): number | null {
    const r = load();
    const k = keyFor(p);
    const have = r.ids[k];
    if (have != null) return have;
    if (!opts.allocate) return null;
    if (r.next > CUSTOM_PID_MAX) throw new Error(`custom portrait ids exhausted (${CUSTOM_PID_MAX - CUSTOM_PID_BASE + 1} used)`);
    const pid = r.next++;
    r.ids[k] = pid;
    save();
    return pid;
  },

  entries(): Array<{ key: string; pid: number }> {
    return Object.entries(load().ids).map(([key, pid]) => ({ key, pid }));
  },

  get registryPath(): string {
    return file;
  },

  /** Tests: point the registry at another file (and forget the loaded one). */
  useRegistry(p: string): void {
    file = p;
    reg = null;
  },
};
