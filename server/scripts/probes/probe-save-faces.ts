import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const madden = require('madden-franchise');
const [,, file] = process.argv;
(async () => {
  const f = await madden.create(file, { autoParse: true });
  const pt = f.getTableByName('Player');
  await pt.readRecords();
  const fields = Object.keys(pt.records[0].fields).filter((k) => /ASSET|PORTRAIT|HEAD|GENERIC|FACE|SKIN/i.test(k));
  console.log('gameYear', f.gameYear, 'records', pt.records.length, fields);
  let real = 0, gen = 0;
  const sample: any[] = [];
  for (const r of pt.records) {
    if (r.isEmpty) continue;
    const a = r.PLYR_ASSETNAME;
    if (a && !/^gen_/i.test(a)) real++; else gen++;
    if (sample.length < 5 && a) sample.push({ n: `${r.FirstName} ${r.LastName}`, a, pid: r.PLYR_PORTRAIT, gh: r.PLYR_GENERICHEAD ?? r.GenericHeadAssetName, skin: r.PLYR_SKINTONE });
  }
  console.log({ real, gen, sample });
})();
