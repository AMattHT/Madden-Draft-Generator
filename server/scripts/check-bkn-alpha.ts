import sharp from 'sharp';

async function dump(label: string, src: string) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = 0;
  let trans = 0;
  for (let p = 3; p < data.length; p += 4) if (data[p] === 0) trans++;
  console.log(label, info.width, info.height, 'corner', data[0], data[1], data[2], data[3], 'transparent', trans);
}

async function main() {
  await dump('src', 'C:/Users/amatthews/AppData/Local/Temp/bkn-tigers36.png');
  await dump('tmp', 'C:/Users/amatthews/AppData/Local/Temp/bkn-clear.png');
  await dump('repo', 'C:/Users/amatthews/Documents/Projects/Madden26DraftClass/draft-class-generator/server/data/lookups/logos/bkn.png');
}
main();
