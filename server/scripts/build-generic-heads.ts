/**
 * Per-game generic-head catalogs mined from the game's own generated classes:
 * which gen_* heads each game assigns and the menu-portrait PID it pairs with
 * each (M26 PID @0x92, M27 PID @0x94). Madden 26 and 27 have different head
 * sets, so the pools are kept apart. Writes data/lookups/generic-heads-by-game.json.
 *
 *   npx tsx scripts/build-generic-heads.ts
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { LOOKUPS_DIR, M27_SAVES_DIR } from '../src/config/paths';
import { MdcService } from '../src/services/MdcService';
import { Mdc27Service } from '../src/services/Mdc27Service';

const m26Dir = process.env.MADDEN_SAVES_DIR || path.join(os.homedir(), 'Documents', 'Madden NFL 26', 'Saves');
const START = 0x46;
const silence = <T,>(fn: () => T): T => { const c = { ...console }; console.log = console.error = console.warn = console.info = () => {}; try { return fn(); } finally { Object.assign(console, c); } };

function gameMadeM26(buf: Buffer): boolean { return buf.toString('ascii', START + 0x1000 + 0x27, START + 0x1000 + 0x27 + 11) === 'PLACEHOLDER'; }
function gameMadeM27(buf: Buffer): boolean { return buf.toString('ascii', START + 0x1600 + 0x2b, START + 0x1600 + 0x2b + 11) === 'PLACEHOLDER'; }

function mine(dir: string, prefix: string, isGame: (b: Buffer) => boolean, parse: (b: Buffer) => any[]): Record<string, number> {
  const votes = new Map<string, Map<number, number>>();
  if (!fs.existsSync(dir)) return {};
  let files = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith(prefix)) continue;
    const buf = fs.readFileSync(path.join(dir, f));
    if (buf.length < 100000 || !isGame(buf)) continue;
    files++;
    for (const p of silence(() => parse(buf)).filter((x: any) => x.firstName)) {
      const head = p.visuals?.genericHeadName;
      if (!head || !/^gen_\d/i.test(head)) continue;
      const v = votes.get(head) ?? new Map<number, number>();
      v.set(Number(p.PID) || 0, (v.get(Number(p.PID) || 0) ?? 0) + 1);
      votes.set(head, v);
    }
  }
  console.log(`${prefix} ${dir}: ${files} game-made files, ${votes.size} heads`);
  const out: Record<string, number> = {};
  for (const [head, v] of [...votes.entries()].sort()) out[head] = [...v.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return out;
}

const m26 = mine(m26Dir, 'CAREERDRAFT-', gameMadeM26, (b) => MdcService.parse(b));
const m27 = mine(M27_SAVES_DIR, 'CAREERDRAFT-', gameMadeM27, (b) => Mdc27Service.parse(b) as any[]);
const dest = path.join(LOOKUPS_DIR, 'generic-heads-by-game.json');
fs.writeFileSync(dest, JSON.stringify({ _source: 'genericHeadName -> menu-portrait PID, from the game-generated CAREERDRAFT classes (M26: RANDOMGEN*/NFLDRAFT2026; M27: TEST*)', m26, m27 }, null, 1));
console.log(`wrote ${dest}: m26 ${Object.keys(m26).length} heads, m27 ${Object.keys(m27).length} heads, shared ${Object.keys(m26).filter((h) => h in m27).length}`);
