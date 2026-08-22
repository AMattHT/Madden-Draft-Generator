import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { CACHE_DIR } from '../config/paths';
import { BaselinePlayer, ObservedGear } from '../types/player';

const UA = 'MaddenDraftClassGenerator/0.1 (personal modding tool; historical draft research)';
const WIKI_CACHE = path.join(CACHE_DIR, 'wiki-photos.json');
const GEAR_CACHE = path.join(CACHE_DIR, 'photo-gear.json');
const PHOTO_DIR = path.join(CACHE_DIR, 'player-photos');

const ALLOWED_HOST = [
  'upload.wikimedia.org',
  'commons.wikimedia.org',
  'static.www.nfl.com',
  'static.nfl.com',
  'nfl.com',
  'pro-football-reference.com',
  'sports-reference.com',
];

type WikiMap = Record<string, string | null>;
type GearMap = Record<string, ObservedGear>;

let wikiMem: WikiMap | null = null;
let gearMem: GearMap | null = null;

function loadJson<T>(file: string, fallback: T): T {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch { /* corrupt cache */ }
  return fallback;
}
/** Atomic JSON write (temp + rename): a crash mid-write used to leave a truncated
 *  cache that loadJson silently replaced with {} - and then re-crawled Wikipedia. */
function saveJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

function wikiMap(): WikiMap {
  if (!wikiMem) wikiMem = loadJson<WikiMap>(WIKI_CACHE, {});
  return wikiMem;
}
function gearMap(): GearMap {
  if (!gearMem) gearMem = loadJson<GearMap>(GEAR_CACHE, {});
  return gearMem;
}

function allowed(url: string): boolean {
  try {
    const host = new URL(url).host.toLowerCase();
    return ALLOWED_HOST.some((a) => host === a || host.endsWith('.' + a));
  } catch {
    return false;
  }
}

async function fetchBuf(url: string, timeoutMs = 8000): Promise<Buffer | null> {
  if (!allowed(url)) return null;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ac.signal });
    if (!res.ok) return null;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct && !ct.includes('image') && !ct.includes('octet-stream')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 800 ? buf : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function photoKey(url: string): string {
  return crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
}

function looksLikePlayerPhoto(url: string): boolean {
  const u = url.toLowerCase();
  if (u.endsWith('.svg') || u.includes('logo') || u.includes('wordmark')) return false;
  if (u.includes('flag_of') || u.includes('coat_of_arms')) return false;
  return /\.(jpg|jpeg|png|webp)(\?|$)/i.test(u) || u.includes('static.www.nfl.com');
}

/** Live Wikipedia lookup for a player page image (cached). */
async function wikiPhoto(first: string, last: string): Promise<string | null> {
  const key = `${first}|${last}`.toLowerCase();
  const cache = wikiMap();
  if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];
  const q = `"${first} ${last}" (football OR NFL)`;
  const api =
    'https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search' +
    `&gsrsearch=${encodeURIComponent(q)}&gsrlimit=5` +
    '&prop=pageimages|pageterms&piprop=original&wbptterms=description';
  try {
    const res = await fetch(api, { headers: { 'User-Agent': UA } });
    if (!res.ok) {
      cache[key] = null;
      saveJson(WIKI_CACHE, cache);
      return null;
    }
    const json = (await res.json()) as {
      query?: { pages?: Record<string, { title?: string; terms?: { description?: string[] }; original?: { source?: string } }> };
    };
    const pages = Object.values(json.query?.pages || {});
    let hit: string | null = null;
    for (const p of pages) {
      const src = p.original?.source || '';
      const blob = `${p.title || ''} ${(p.terms?.description || []).join(' ')}`.toLowerCase();
      if (!/football|nfl|linebacker|quarterback|wide receiver|running back|cornerback|safety|tackle|guard|tight end|kicker|punter|draft/.test(blob)) {
        continue;
      }
      if (src && looksLikePlayerPhoto(src) && allowed(src)) {
        hit = src;
        break;
      }
    }
    cache[key] = hit;
    saveJson(WIKI_CACHE, cache);
    return hit;
  } catch {
    cache[key] = null;
    saveJson(WIKI_CACHE, cache);
    return null;
  }
}

function isSkin(r: number, g: number, b: number): boolean {
  return r > 80 && r > g && g > b * 0.55 && r - b > 15 && g > 40 && r < 240;
}

function chroma(r: number, g: number, b: number): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function inspect(buf: Buffer): Promise<Omit<ObservedGear, 'photoUrl'>> {
  return sharp(buf)
    .resize(96, 96, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => {
      const w = info.width;
      const h = info.height;
      const at = (x: number, y: number) => {
        const i = (y * w + x) * 3;
        return [data[i], data[i + 1], data[i + 2]] as [number, number, number];
      };
      let topDark = 0, topN = 0, turf = 0, botN = 0;
      let handSat = 0, handSkin = 0, handN = 0;
      let midDark = 0, midN = 0;
      let eyeDark = 0, eyeN = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const [r, g, b] = at(x, y);
          const v = (r + g + b) / 3;
          if (y < h * 0.32) {
            topN++;
            if (v < 70) topDark++;
          }
          if (y > h * 0.78) {
            botN++;
            if (g > r + 18 && g > b + 10 && g > 70) turf++;
          }
          const inHands = y > h * 0.42 && y < h * 0.82 && (x < w * 0.28 || x > w * 0.72);
          if (inHands) {
            handN++;
            if (isSkin(r, g, b)) handSkin++;
            else if (chroma(r, g, b) > 35 && v > 40) handSat++;
          }
          if (y > h * 0.22 && y < h * 0.48 && x > w * 0.3 && x < w * 0.7) {
            midN++;
            if (v < 55) midDark++;
          }
          if (y > h * 0.18 && y < h * 0.38 && x > w * 0.32 && x < w * 0.68) {
            eyeN++;
            if (v < 40) eyeDark++;
          }
        }
      }
      const helmet = topN && topDark / topN > 0.22;
      const onField = !!(helmet || (botN && turf / botN > 0.12));
      const gloves = handN
        ? handSat / handN > 0.16 && handSat > handSkin * 0.7
          ? true
          : handSkin / handN > 0.28
            ? false
            : null
        : null;
      let gloveColor: ObservedGear['gloveColor'] = null;
      if (gloves) {
        // Sample hand pixels again for a coarse color.
        let white = 0, black = 0, color = 0;
        for (let y = Math.floor(h * 0.45); y < Math.floor(h * 0.8); y++) {
          for (const x of [4, 8, w - 8, w - 4]) {
            const [r, g, b] = at(x, y);
            const v = (r + g + b) / 3;
            if (v > 190 && chroma(r, g, b) < 35) white++;
            else if (v < 55) black++;
            else if (chroma(r, g, b) > 40) color++;
          }
        }
        gloveColor = color >= white && color >= black ? 'team' : white >= black ? 'white' : 'black';
      }
      const visor: ObservedGear['visor'] =
        !helmet ? 'none'
        : eyeN && eyeDark / eyeN > 0.45 ? 'dark'
        : 'none';
      const wristband = handSat > 8 ? true : null;
      const fullBody = h >= w * 0.95 && turf / Math.max(1, botN) > 0.08;
      const socks: ObservedGear['socks'] = fullBody ? 'high' : null;
      const eyeBlack = !!(midN && midDark / midN > 0.18 && helmet);
      return { onField, gloves, gloveColor, visor, wristband, socks, eyeBlack };
    })
    .catch(() => ({
      onField: false,
      gloves: null,
      gloveColor: null,
      visor: null,
      wristband: null,
      socks: null,
      eyeBlack: null,
    }));
}

async function observeUrl(url: string): Promise<ObservedGear> {
  const cache = gearMap();
  if (cache[url]) return cache[url];
  // The photo is analysed once and only the verdict is kept (photo-gear.json);
  // the full-resolution bytes are never read again, so they are not written to
  // disk any more (the old cache held 2+ GB of dead .bin files). A leftover .bin
  // from an earlier run is used, then removed.
  const disk = path.join(PHOTO_DIR, `${photoKey(url)}.bin`);
  let buf: Buffer | null = null;
  if (fs.existsSync(disk)) {
    try { buf = fs.readFileSync(disk); } catch { buf = null; }
    try { fs.unlinkSync(disk); } catch { /* ignore */ }
  }
  if (!buf) buf = await fetchBuf(url);
  const seen = buf
    ? await inspect(buf)
    : { onField: false, gloves: null, gloveColor: null, visor: null, wristband: null, socks: null, eyeBlack: null };
  const rec: ObservedGear = { photoUrl: url, ...seen };
  cache[url] = rec;
  saveJson(GEAR_CACHE, cache);
  return rec;
}

export function bestPhotoUrl(p: Pick<BaselinePlayer, 'headshotUrl' | 'pfrImageUrl' | 'wikiImageUrl'>): string | null {
  return p.headshotUrl || p.pfrImageUrl || p.wikiImageUrl || null;
}

let inflight = 0;
const waiting: Array<() => void> = [];
function gate<T>(fn: () => Promise<T>, max = 5): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      inflight++;
      fn().then(resolve, reject).finally(() => {
        inflight--;
        const next = waiting.shift();
        if (next) next();
      });
    };
    if (inflight < max) run();
    else waiting.push(run);
  });
}

export const PhotoLookService = {
  bestPhotoUrl,

  /** Resolve a picture (nflverse / PFR / Wiki CSV, else live Wikipedia). */
  async resolvePhoto(p: BaselinePlayer): Promise<string | null> {
    const have = bestPhotoUrl(p);
    if (have) return have;
    if (p.source === 'generated') return null;
    return gate(() => wikiPhoto(p.firstName, p.lastName));
  },

  /** Inspect a photo for on-field gear. Returns null when there is no picture. */
  async observe(p: BaselinePlayer): Promise<ObservedGear | null> {
    const url = await this.resolvePhoto(p);
    if (!url) return null;
    return gate(() => observeUrl(url));
  },

  /** Inspect an uploaded / pasted image buffer (not cached by URL). */
  async observeBytes(buf: Buffer): Promise<ObservedGear> {
    const seen = await inspect(buf);
    return { photoUrl: 'upload', ...seen };
  },
};
