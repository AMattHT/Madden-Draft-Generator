import fs from 'fs';
import { parseM27Prospects } from '../src/vendor/draft-class/M27Parser.js';

function dump(label: string, file: string) {
  const buf = fs.readFileSync(file);
  const st = fs.statSync(file);
  const list = parseM27Prospects(buf, { dataStartOffset: 0x46 });
  const w = list.find((p) => /woodson/i.test(p.lastName || ''));
  const b = list.find((p) => /bennett/i.test(p.lastName || '') && /corn/i.test(p.firstName || ''));
  console.log('\n==', label, st.mtime.toISOString(), buf.length);
  for (const p of [w, b]) {
    if (!p) continue;
    console.log({
      name: `${p.firstName} ${p.lastName}`,
      idx: p.index,
      pid: p.PID,
      peps: p.PEPS || p.assetName,
      gen: p.visuals?.genericHeadName,
      skin: p.visuals?.skinTone,
      comm: p.commentaryId,
      visKeys: p.visuals ? Object.keys(p.visuals) : [],
    });
    console.log('visual', JSON.stringify(p.visuals));
  }
}

dump('saves', 'C:/Users/amatthews/Documents/Madden NFL 27/saves/CAREERDRAFT-1987DRAFT');
dump('downloads', 'C:/Users/amatthews/Downloads/CAREERDRAFT-1987DRAFT');
