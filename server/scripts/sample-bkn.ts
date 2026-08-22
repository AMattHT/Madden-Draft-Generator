import sharp from 'sharp';

const SRC = 'C:/Users/amatthews/AppData/Local/Temp/bkn-tigers36.png';

async function main() {
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const at = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return `${x},${y}=${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`;
  };
  console.log(info);
  for (const [x, y] of [
    [0, 0],
    [1, 1],
    [5, 5],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
    [(w / 2) | 0, 2],
    [2, (h / 2) | 0],
  ] as const) {
    console.log(at(x, y));
  }
}
main();
