/** De-risk: download a real player photo and face-crop it to a square portrait. */
const sharp = require('sharp');

const URL =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/Bo_Jackson%2C_2011_NCAA_Honors_Celebration%2C_San_Antonio%2C_TX.jpg/250px-Bo_Jackson%2C_2011_NCAA_Honors_Celebration%2C_San_Antonio%2C_TX.jpg';

async function main() {
  const res = await fetch(URL, {
    headers: { 'User-Agent': 'MaddenDraftClassGenerator/0.1 (personal modding tool)' },
  });
  console.log('[probe] HTTP', res.status, res.headers.get('content-type'));
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  console.log('[probe] downloaded bytes:', buf.length);

  const meta = await sharp(buf).metadata();
  console.log('[probe] source:', meta.width + 'x' + meta.height, meta.format);

  const png = await sharp(buf)
    .resize(256, 256, { fit: 'cover', position: sharp.strategy.attention })
    .png()
    .toBuffer();
  const om = await sharp(png).metadata();
  console.log('[probe] processed:', om.width + 'x' + om.height, om.format, png.length + ' bytes');
  console.log('[probe] RESULT: PASS ✅');
}
main().catch((e) => {
  console.error('[probe] ERR', e.message);
  process.exit(1);
});
