import fs from 'fs';
import { parseM27Prospects } from '../src/vendor/draft-class/M27Parser.js';
import { TEMPLATE_M27 } from '../src/config/paths';

const files = [
  ['template', TEMPLATE_M27],
  ['1987', 'C:/Users/amatthews/Documents/Madden NFL 27/saves/CAREERDRAFT-1987DRAFT'],
];

for (const [label, file] of files) {
  const buf = fs.readFileSync(file);
  const list = parseM27Prospects(buf, { dataStartOffset: 0x46 }).filter((p) => p.firstName);
  const pid0 = list.filter((p) => !p.PID).length;
  const pidN = list.filter((p) => p.PID).length;
  const withAsset = list.filter((p) => p.PEPS || p.assetName).length;
  const withGen = list.filter((p) => p.visuals?.genericHeadName).length;
  console.log(label, { n: list.length, pid0, pidN, withAsset, withGen, sample: list.slice(0, 3).map((p) => ({
    n: `${p.firstName} ${p.lastName}`,
    pid: p.PID,
    peps: p.PEPS || p.assetName,
    gen: p.visuals?.genericHeadName,
  })) });
}
