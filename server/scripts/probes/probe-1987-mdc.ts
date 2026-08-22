import fs from 'fs';
import { parseM27Prospects } from '../src/vendor/draft-class/M27Parser.js';

const buf = fs.readFileSync('C:/Users/amatthews/Documents/Madden NFL 27/saves/CAREERDRAFT-1987DRAFT');
const list = parseM27Prospects(buf, { dataStartOffset: 0x46 });
const used = list.filter((p) => p.firstName);
console.log('used', used.length, 'of', list.length);
for (const p of used.slice(0, 8)) {
  console.log({
    i: p.index,
    name: `${p.firstName} ${p.lastName}`,
    ovr: p.overall,
    pos: p.position,
    age: p.age,
    ht: p.heightInches,
    wt: p.weight,
    pid: p.PID,
    peps: p.PEPS || p.assetName,
    college: p.college,
    town: p.homeTown,
    state: p.homeState,
    arch: p.archetype,
    dev: p.devTrait,
    gen: p.visuals?.genericHeadName ?? null,
    skin: p.visuals?.skinTone ?? null,
    awr: p.awareness,
    thp: p.throwPower,
  });
}
const vinny = used.find((p) => /testaverde/i.test(p.lastName || ''));
console.log('vinny found', !!vinny, vinny ? vinny.index : null);
