import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { CACHE_DIR, LOOKUPS_DIR } from '../config/paths';

const DIR = path.join(CACHE_DIR, 'logos');
fs.mkdirSync(DIR, { recursive: true });

const ALLOWED = ['a.espncdn.com', 'cdn.ssref.net', 'www.pro-football-reference.com'];
const UA = 'MaddenDraftClassGenerator/0.1 (personal modding tool)';

function keyOf(url: string): string {
  return crypto.createHash('sha1').update(url).digest('hex');
}

function allowed(url: string): boolean {
  try {
    const host = new URL(url).host.toLowerCase();
    return ALLOWED.some((a) => host === a || host.endsWith('.' + a));
  } catch {
    return false;
  }
}

/** True if the pixel is the typical sports-logo page background (white / light gray). */
function isBackdrop(r: number, g: number, b: number, a: number): boolean {
  if (a < 16) return true;
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  return min > 228 && max - min < 18;
}

/**
 * Flood-fill from the image border so only *background* white becomes
 * transparent. Interior white (Colts horseshoe, lettering) stays.
 */
function knockoutBorder(data: Buffer, w: number, h: number): void {
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const at = (x: number, y: number) => (y * w + x) * 4;
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (seen[p]) return;
    const i = p * 4;
    if (!isBackdrop(data[i], data[i + 1], data[i + 2], data[i + 3])) return;
    seen[p] = 1;
    stack.push(p);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w;
    const y = (p / w) | 0;
    data[p * 4] = 0;
    data[p * 4 + 1] = 0;
    data[p * 4 + 2] = 0;
    data[p * 4 + 3] = 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  // Soften anti-aliased fringe next to cleared pixels.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = at(x, y);
      if (data[i + 3] === 0) continue;
      const min = Math.min(data[i], data[i + 1], data[i + 2]);
      if (min < 200) continue;
      let neighborClear = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (data[at(nx, ny) + 3] === 0) {
          neighborClear = true;
          break;
        }
      }
      if (neighborClear) {
        const t = Math.max(0, (245 - min) / 45);
        data[i + 3] = Math.round(data[i + 3] * t);
      }
    }
  }
}

async function fetchBuf(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`logo fetch HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export const LogoService = {
  allowed,

  /** Bundled historical mark from data/lookups/logos/{id}.png. */
  local(id: string): Buffer {
    if (!/^[a-z0-9_-]+$/i.test(id)) throw new Error('bad id');
    const file = path.join(LOOKUPS_DIR, 'logos', `${id}.png`);
    if (!fs.existsSync(file)) throw new Error('missing logo');
    return fs.readFileSync(file);
  },

  /** Process + cache a remote logo as a transparent PNG. */
  async png(url: string): Promise<Buffer> {
    if (!allowed(url)) throw new Error('host not allowed');
    const file = path.join(DIR, `${keyOf(url)}.png`);
    if (fs.existsSync(file)) return fs.readFileSync(file);
    const input = await fetchBuf(url);
    const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    knockoutBorder(data, info.width, info.height);
    const out = await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .png()
      .toBuffer();
    fs.writeFileSync(file, out);
    return out;
  },
};
