/**
 * Renders the product mark (web/public/art/logo.png, the generated Front Office
 * badge) to the Windows icon size set and packs icons/m26.ico + m27.ico (what
 * builder-m26/27.json point at), plus a 256px PNG preview of each and the web
 * favicons in web/public/icons. Rerun after changing the logo:
 *   node scripts/build-icons.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIcoMod = require('png-to-ico');
const pngToIco = pngToIcoMod.default || pngToIcoMod;

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const DIR = path.join(__dirname, '..', 'icons');
const LOGO = path.join(__dirname, '..', '..', 'web', 'public', 'art', 'logo.png');
const WEB_ICONS = path.join(__dirname, '..', '..', 'web', 'public', 'icons');

async function build() {
  const pngs = await Promise.all(SIZES.map((s) => sharp(LOGO).resize(s, s).png().toBuffer()));
  const ico = await pngToIco(pngs);
  const big = pngs[SIZES.indexOf(256)];
  for (const name of ['m26', 'm27']) {
    fs.writeFileSync(path.join(DIR, `${name}.ico`), ico);
    fs.writeFileSync(path.join(DIR, `${name}-256.png`), big);
    fs.writeFileSync(path.join(WEB_ICONS, `${name}.png`), big);
    console.log(`${name}.ico (${SIZES.join('/')}) + ${name}-256.png`);
  }
  fs.writeFileSync(path.join(WEB_ICONS, 'app.png'), big);
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
