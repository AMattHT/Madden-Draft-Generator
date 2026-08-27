/**
 * Renders icons/m26.svg + m27.svg to the Windows icon size set and packs
 * icons/m26.ico + m27.ico (what builder-m26/27.json point at), plus a 256px
 * PNG preview of each. Rerun after editing the SVGs: node scripts/build-icons.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIcoMod = require('png-to-ico');
const pngToIco = pngToIcoMod.default || pngToIcoMod;

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const DIR = path.join(__dirname, '..', 'icons');

async function build(name) {
  const svg = fs.readFileSync(path.join(DIR, `${name}.svg`));
  const pngs = await Promise.all(
    SIZES.map((s) => sharp(svg, { density: 300 }).resize(s, s).png().toBuffer())
  );
  fs.writeFileSync(path.join(DIR, `${name}.ico`), await pngToIco(pngs));
  fs.writeFileSync(path.join(DIR, `${name}-256.png`), pngs[SIZES.indexOf(256)]);
  console.log(`${name}.ico (${SIZES.join('/')}) + ${name}-256.png`);
}

Promise.all(['m26', 'm27'].map(build)).catch((e) => {
  console.error(e);
  process.exit(1);
});
