import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const SRC = 'C:/Users/amatthews/AppData/Local/Temp/bkn-tigers36.png';
const OUT = path.resolve(__dirname, '../data/lookups/logos/bkn.png');

async function main() {
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  console.log('size', w, h);

  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const isBackdrop = (r: number, g: number, b: number, a: number) => {
    if (a < 16) return true;
    // orange page / near-white fringe
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const isOrange = r > 180 && g > 40 && g < 200 && b < 90 && r > g && g > b;
    const isWhite = min > 228 && max - min < 18;
    return isOrange || isWhite;
  };
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

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const out = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  fs.writeFileSync(OUT, out);
  fs.writeFileSync('C:/Users/amatthews/AppData/Local/Temp/bkn-clear.png', out);
  console.log('wrote', OUT, out.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
