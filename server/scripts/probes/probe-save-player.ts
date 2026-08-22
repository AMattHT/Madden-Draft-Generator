import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const madden = require('madden-franchise');
const [,, file, ...names] = process.argv;
(async () => {
  const f = await madden.create(file, { autoParse: true });
  const pt = f.getTableByName('Player');
  await pt.readRecords();
  for (const r of pt.records) {
    if (r.isEmpty) continue;
    if (names.includes(String(r.LastName))) console.log(`${r.FirstName} ${r.LastName}`, { asset: r.PLYR_ASSETNAME, gh: r.PLYR_GENERICHEAD, ghAsset: r.GenericHeadAssetName, pid: r.PLYR_PORTRAIT, yearsPro: r.YearsPro, age: r.Age, team: r.TeamIndex, pos: r.Position });
  }
})();
