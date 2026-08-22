import fs from 'fs';
import { parseM27Prospects } from '../src/vendor/draft-class/M27Parser.js';
import { TEMPLATE_M27 } from '../src/config/paths';

const j = JSON.parse(fs.readFileSync('C:/Users/amatthews/Documents/Projects/Madden26DraftClass/draft-class-generator/server/data/lookups/m27-face-assets.json', 'utf8'));
const byPid: Record<number, string[]> = {};
for (const [name, v] of Object.entries(j.players as Record<string, { portraitPid: number }>)) {
  if (!v.portraitPid) continue;
  (byPid[v.portraitPid] ??= []).push(name);
}

const buf = fs.readFileSync(TEMPLATE_M27);
const list = parseM27Prospects(buf, { dataStartOffset: 0x46 }).filter((p) => p.firstName);
const genToPid = new Map<string, number[]>();
let collide = 0;
for (const p of list) {
  const gen = p.visuals?.genericHeadName;
  if (!gen) continue;
  if (!genToPid.has(gen)) genToPid.set(gen, []);
  genToPid.get(gen)!.push(p.PID);
  if (byPid[p.PID]) collide++;
}
console.log('template gens', genToPid.size, 'collide with named M27 players', collide);
console.log('unique pids per gen? sample', [...genToPid.entries()].slice(0, 8).map(([g, ids]) => [g, [...new Set(ids)]]));

const saved = parseM27Prospects(
  fs.readFileSync('C:/Users/amatthews/Documents/Madden NFL 27/saves/CAREERDRAFT-1987DRAFT'),
  { dataStartOffset: 0x46 }
);
const wood = saved.find((p) => /woodson/i.test(p.lastName || ''));
console.log('woodson', wood && {
  name: `${wood.firstName} ${wood.lastName}`,
  pid: wood.PID,
  gen: wood.visuals?.genericHeadName,
  owner: byPid[wood.PID] || null,
});
