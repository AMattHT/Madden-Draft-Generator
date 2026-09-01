import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { DATA_ROOT, LOOKUPS_DIR } from '../config/paths';
import { normalizeName } from '../util/csv';
import { PlayerLookupService } from './PlayerLookupService';

/**
 * Real NFL headshots lifted off the Madden 2001-2012 PS2 discs and the PS3
 * discs (Madden 25 and 15), which ship the photo of every player on their
 * rosters (see ../../../headshots/extract_madden_ps2_portraits.py and
 * ../../../headshots/ps3/extract_ps3_portraits.py).
 *
 * These matter because the web sources behind PhotoLookService are weakest for
 * exactly the players historical draft classes are made of: the NFL CDN answers
 * with a silhouette for most retirees, and Wikipedia often has no free photo at
 * all. Around 1,900 players in ALL_PLAYER_LOOKUP have no in-game face and no
 * portrait, but do appear on one of these discs.
 *
 * The pack (data/retro-portraits, built by scripts/build-retro-headshot-pack.ts)
 * holds each portrait at whatever its disc shipped: 96x96 from the PS2 discs,
 * 256x256 from the PS3 ones. The PS2 sizes are small for a texture replacement,
 * so `portraitPng` resizes with Lanczos -- upscaling those and merely fitting
 * the PS3 art. An upscaled 96x96 is softer than a modern web photo but is a real
 * likeness of the right player, in period, and it needs no network. If the pack
 * is absent the service reports unavailable and every caller falls back to the
 * web lookup as before.
 */
const PACK_DIR = path.join(DATA_ROOT, 'retro-portraits');
const INDEX_FILE = path.join(LOOKUPS_DIR, 'retro-headshots.json');

export interface Entry {
  year: number;
  position: string;
  /** Pack filename. Absent in the old single-entry format, where the name
   *  alone gave the file. */
  file?: string;
}

let index: Record<string, Entry[]> | null = null;

function load(): Record<string, Entry[]> {
  if (!index) {
    try {
      const raw = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')) as Record<string, Entry | Entry[]>;
      // The pack used to hold one entry per name. Read either shape so an old
      // pack still works rather than silently returning no headshots at all.
      index = Object.fromEntries(
        Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v : [v]])
      );
    } catch {
      index = {};
    }
  }
  return index;
}

const key = (first: string, last: string) => `${normalizeName(first)}|${normalizeName(last)}`;

/** Coarse position families. Two players of the same name are the same man only
 *  if they played the same kind of football; exact labels drift between sources
 *  (LE/DE, HB/RB, OLB/EDGE) so compare the family, not the string. */
const POSITION_GROUP: Record<string, string> = {
  QB: 'QB',
  HB: 'BACK', RB: 'BACK', FB: 'BACK',
  WR: 'REC', TE: 'REC',
  LT: 'OL', LG: 'OL', C: 'OL', RG: 'OL', RT: 'OL', OL: 'OL', OT: 'OL', OG: 'OL', G: 'OL', T: 'OL',
  LE: 'DL', RE: 'DL', DT: 'DL', DE: 'DL', DL: 'DL', NT: 'DL',
  LEDG: 'EDGE', REDG: 'EDGE', EDGE: 'EDGE',
  LOLB: 'LB', ROLB: 'LB', MLB: 'LB', OLB: 'LB', ILB: 'LB', LB: 'LB', SAM: 'LB', MIKE: 'LB', WILL: 'LB',
  CB: 'DB', FS: 'DB', SS: 'DB', S: 'DB', DB: 'DB',
  K: 'ST', P: 'ST',
};

export const groupOf = (pos: string | null | undefined): string | null =>
  POSITION_GROUP[(pos || '').trim().toUpperCase()] ?? null;

/** EDGE and LB/DL overlap by design (a 3-4 rusher is listed either way). */
export function groupsCompatible(a: string | null, b: string | null): boolean {
  if (!a || !b) return true; // unknown on either side: don't reject on no evidence
  if (a === b) return true;
  const edgy = new Set(['EDGE', 'DL', 'LB']);
  return edgy.has(a) && edgy.has(b);
}

/** Career spans of every player sharing a name, built once. A disc photo shows
 *  whoever was on that roster, so the span is what says whether it can be him. */
let careersByName: Map<string, { draftYear: number; from: number; to: number; hof: boolean }[]> | null = null;
function careersFor(first: string, last: string) {
  if (!careersByName) {
    careersByName = new Map();
    for (const y of PlayerLookupService.years()) {
      for (const p of PlayerLookupService.byYear(y)) {
        const k = key(p.firstName, p.lastName);
        const from = p.careerFrom ?? p.draftYear;
        // An open career (still active, or simply unrecorded) is given a
        // generous span so a real match is never refused for missing data.
        const to = p.careerTo ?? from + 20;
        const list = careersByName.get(k) ?? [];
        list.push({ draftYear: p.draftYear, from, to, hof: !!p.isHOF });
        careersByName.set(k, list);
      }
    }
  }
  return careersByName.get(key(first, last)) ?? [];
}

/** Could the man drafted in `draftYear` be the player photographed on the
 *  `disc` year's roster?
 *
 *  Position alone cannot answer this. The 1968 linebacker D.D. Lewis and the
 *  2002 linebacker D.D. Lewis are both LB, and the photo on the 2005 disc is
 *  the second one's. Nor can era alone: the discs carry legends teams, so
 *  Walter Payton (1975) really is on the 2012 disc.
 *
 *  What separates them is whether the player was PLAYING when the disc shipped.
 *  If he was, it is him. If he was not, it is only him when he is the sort of
 *  player a legends roster carries -- and a Hall of Famer is the honest test of
 *  that. Everyone else is refused, which is how the 1968 Steve Smith stops
 *  wearing the 2003 receiver's face. */
function plausibleEra(first: string, last: string, draftYear: number | null | undefined, disc: number): boolean {
  if (draftYear == null) return true; // nothing to check against
  const all = careersFor(first, last);
  const me = all.find((c) => c.draftYear === draftYear);
  if (!me) return true;
  if (disc >= me.from && disc <= me.to + 2) return true; // he was playing
  return me.hof; // otherwise only a legend belongs on a later disc
}

export const RetroHeadshotService = {
  get available(): boolean {
    return fs.existsSync(PACK_DIR) && Object.keys(load()).length > 0;
  },

  /** The disc this player's photo came from, or null if we have no photo.
   *
   *  The pack is keyed by NAME ONLY, so without `position` a name shared across
   *  eras returns the wrong man: the 1973 Steelers cornerback J.T. Thomas was
   *  being handed the face of the 2011 West Virginia linebacker of the same
   *  name, whose photo is the one on the 2012 disc. Pass the position and a
   *  mismatch is refused.
   *
   *  Position rather than era, because era cannot tell the two cases apart:
   *  Madden discs carry legends, so Walter Payton's real photo is legitimately
   *  on a 2012 disc decades after he was drafted. He is HB on both sides and
   *  survives; a cornerback matched to a linebacker does not. */
  lookup(first: string, last: string, position?: string | null, draftYear?: number | null): Entry | null {
    const hits0 = load()[key(first, last)];
    if (!hits0 || !hits0.length) return null;
    // Drop any disc the player could not have been photographed on before the
    // position match runs, so a refused entry cannot shadow a valid one.
    const hits = hits0.filter((h) => plausibleEra(first, last, draftYear, h.year));
    if (!hits.length) return null;
    const want = groupOf(position);
    // A name can hold several men -- Cam Newton is a 2008 safety and a 2011
    // quarterback. Take the one who played this kind of football, preferring an
    // exact group over the deliberate EDGE/DL/LB overlap so a real end is not
    // handed a linebacker's face while his own photo sits in the pack.
    return (
      hits.find((h) => want != null && groupOf(h.position) === want) ??
      hits.find((h) => groupsCompatible(want, groupOf(h.position))) ??
      null
    );
  },

  /** Path to the packed PNG (96x96 from PS2, 256x256 from PS3), or null. */
  filePath(first: string, last: string, position?: string | null, draftYear?: number | null): string | null {
    const hit = this.lookup(first, last, position, draftYear);
    if (!hit) return null;
    const file = path.join(PACK_DIR, hit.file ?? `${key(first, last).replace('|', '_')}.png`);
    return fs.existsSync(file) ? file : null;
  },

  /** Pack file stem for this player, so other measurements taken off the same
   *  image (skin ITA) can key on the picture rather than on the name. */
  stem(first: string, last: string, position?: string | null, draftYear?: number | null): string | null {
    const hit = this.lookup(first, last, position, draftYear);
    if (!hit) return null;
    return (hit.file ?? `${key(first, last).replace('|', '_')}.png`).replace(/\.png$/, '');
  },

  /** Square portrait PNG at `size`, matching what PortraitFetchService returns
   *  for a web photo so the two are interchangeable to callers. */
  async portraitPng(first: string, last: string, size = 256, position?: string | null, draftYear?: number | null): Promise<Buffer | null> {
    const file = this.filePath(first, last, position, draftYear);
    if (!file) return null;
    return sharp(file)
      .resize(size, size, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
      .png()
      .toBuffer();
  },
};
