/**
 * Mine the real game files for the M27 binary fields the generator used to leave
 * zero, and write data/lookups/m27-field-stats.json:
 *
 *   - surnameCommentary: last name -> announcer id (U16 @0x9e M27 / @0x9c M26),
 *     from every CAREERDRAFT-* file in both Saves folders plus the M27 career
 *     save's Player table (PLYR_COMMENT). Names are case-folded.
 *   - headPid: genericHeadName -> menu-portrait PID (U16 @0x94 M27 / @0x92 M26)
 *     from the game-generated classes.
 *   - personality: per-position { mean, std } of PersonalityRating (@0x70) and
 *     its slope against overall, from the M27 game classes.
 *   - focus: histogram of Focus (@0xf2); qbStyle: histogram (@0x96) for QBs;
 *     hidden87 / hidden9c: histograms of the two undecoded bytes the game always
 *     fills (no correlation with anything we know; we just reproduce their spread).
 *   - bodyTypeEnum: visuals.bodyType string -> byte @0x91.
 *
 * Usage: npx tsx scripts/build-m27-field-stats.ts [M27 career save name]
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { LOOKUPS_DIR, M27_SAVES_DIR } from '../src/config/paths';
import { FranchiseService } from '../src/services/FranchiseService';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const M27 = require('../src/vendor/draft-class/M27Parser');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const madden = require('madden-franchise');

const START = 0x46;
const M26 = { block: 4296, attr: 0x1000, size: 0xc8, pid: 0x92, comment: 0x9c, last: 0x11, lastLen: 15 };
const PLAYER_TABLE_UID = 1612938518;
const POS: Record<number, string> = { 0: 'QB', 1: 'HB', 2: 'FB', 3: 'WR', 4: 'TE', 5: 'LT', 6: 'LG', 7: 'C', 8: 'RG', 9: 'RT', 10: 'LEDG', 11: 'REDG', 12: 'DT', 13: 'SAM', 14: 'MIKE', 15: 'WILL', 16: 'CB', 17: 'FS', 18: 'SS', 19: 'K', 20: 'P', 21: 'LS' };

const m26SavesDir = process.env.MADDEN_SAVES_DIR || path.join(os.homedir(), 'Documents', 'Madden NFL 26', 'Saves');
const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

/** Is this a class the GAME generated (not one of ours)? Ours carry real hometowns;
 *  the game's random classes write "PLACEHOLDER" for every prospect. */
function gameGeneratedM27(buf: Buffer): boolean {
  const a = buf.subarray(START + 0x1600, START + 0x1600 + 0xf4);
  return a.toString('ascii', 0x2b, 0x2b + 11) === 'PLACEHOLDER';
}
function gameGeneratedM26(buf: Buffer): boolean {
  const a = buf.subarray(START + M26.attr, START + M26.attr + M26.size);
  return a.toString('ascii', 0x27, 0x27 + 11) === 'PLACEHOLDER';
}

interface Stat { n: number; sum: number; sumSq: number }
const stat = (): Stat => ({ n: 0, sum: 0, sumSq: 0 });
const add = (s: Stat, v: number) => { s.n++; s.sum += v; s.sumSq += v * v; };
const finish = (s: Stat) => ({ mean: s.n ? +(s.sum / s.n).toFixed(2) : 0, std: s.n ? +Math.sqrt(Math.max(0, s.sumSq / s.n - (s.sum / s.n) ** 2)).toFixed(2) : 0, n: s.n });

async function main() {
  const surname = new Map<string, Map<number, number>>(); // key -> id -> votes
  const headPid = new Map<string, Map<number, number>>();
  const vote = (m: Map<string, Map<number, number>>, k: string, id: number) => {
    if (!k || !id || id >= 32767) return; // 32767 = the game's "no audio" sentinel
    const inner = m.get(k) ?? new Map<number, number>();
    inner.set(id, (inner.get(id) ?? 0) + 1);
    m.set(k, inner);
  };

  const personality: Record<string, Stat> = {};
  const personalityByOvr: Record<string, { xs: number[]; ys: number[] }> = {};
  const focus: Record<string, number> = {};
  const qbStyle: Record<string, number> = {};
  const hidden87: Record<string, number> = {};
  const hidden9c: Record<string, number> = {};
  const bodyTypeEnum: Record<string, Record<string, number>> = {};
  let m27Files = 0, m26Files = 0, m27Rookies = 0;

  // --- M27 draft classes (game-generated only for stats; all files for names) ---
  if (fs.existsSync(M27_SAVES_DIR)) {
    for (const f of fs.readdirSync(M27_SAVES_DIR)) {
      if (!f.startsWith('CAREERDRAFT-')) continue;
      const buf = fs.readFileSync(path.join(M27_SAVES_DIR, f));
      if (buf.length < START + 5876 * 2) continue;
      const gameMade = gameGeneratedM27(buf);
      const ps = M27.parseM27Prospects(buf, { dataStartOffset: START }).filter((p: any) => p.firstName);
      m27Files++;
      for (const p of ps) {
        const a = buf.subarray(START + p.index * 5876 + 0x1600, START + p.index * 5876 + 0x1600 + 0xf4);
        const pid = a.readUInt16LE(0x94), comment = a.readUInt16LE(0x9e);
        if (!gameMade) continue; // our own exports must not vote (they carried CSV ids in the wrong field)
        vote(surname, key(p.lastName), comment);
        m27Rookies++;
        const head = p.visuals?.genericHeadName;
        if (head) vote(headPid, head, pid);
        const pos = POS[a[0x4e]] ?? 'WR';
        (personality[pos] ??= stat()); add(personality[pos], a[0x70]);
        (personalityByOvr[pos] ??= { xs: [], ys: [] }); personalityByOvr[pos].xs.push(a[0x55]); personalityByOvr[pos].ys.push(a[0x70]);
        focus[a[0xf2]] = (focus[a[0xf2]] ?? 0) + 1;
        if (a[0x4e] === 0) qbStyle[a[0x96]] = (qbStyle[a[0x96]] ?? 0) + 1;
        hidden87[a[0x87]] = (hidden87[a[0x87]] ?? 0) + 1;
        hidden9c[a[0x9c]] = (hidden9c[a[0x9c]] ?? 0) + 1;
        const bt = String(p.visuals?.bodyType ?? 'Standard');
        (bodyTypeEnum[bt] ??= {})[a[0x91]] = (bodyTypeEnum[bt][a[0x91]] ?? 0) + 1;
      }
    }
  }

  // --- M26 draft classes: surnames + generic-head PIDs (same id spaces as M27) ---
  if (fs.existsSync(m26SavesDir)) {
    for (const f of fs.readdirSync(m26SavesDir)) {
      if (!f.startsWith('CAREERDRAFT-')) continue;
      const buf = fs.readFileSync(path.join(m26SavesDir, f));
      if (buf.length < START + M26.block * 2) continue;
      const gameMade = gameGeneratedM26(buf);
      m26Files++;
      const cap = Math.floor((buf.length - START) / M26.block);
      for (let i = 0; i < cap; i++) {
        const a = buf.subarray(START + i * M26.block + M26.attr, START + i * M26.block + M26.attr + M26.size);
        if (!a.some((b) => b)) continue;
        if (!gameMade) continue;
        const last = a.toString('ascii', M26.last, M26.last + M26.lastLen).replace(/\0.*$/, '');
        vote(surname, key(last), a.readUInt16LE(M26.comment));
        // generic head name lives in the zstd visual JSON; M26Parser decodes it, but
        // the PID<->head pairs from M27 already cover the shared heads, so skip here.
      }
    }
  }

  // --- M27 career save: the richest surname -> PLYR_COMMENT source ---
  const saveName = process.argv[2] || fs.readdirSync(M27_SAVES_DIR).find((f) => /^CAREER-.*AUTOSAVE/.test(f));
  let saveNames = 0;
  if (saveName && fs.existsSync(path.join(M27_SAVES_DIR, saveName))) {
    const file = await madden.create(path.join(M27_SAVES_DIR, saveName), { autoParse: true, gameYearOverride: 27 });
    const pt = file.getTableByUniqueId(PLAYER_TABLE_UID) || file.getTableByName('Player');
    await pt.readRecords();
    for (const r of pt.records) {
      if (r.isEmpty) continue;
      let last = '', id = 0;
      try { last = String(r.LastName ?? ''); id = Number(r.PLYR_COMMENT ?? 0); } catch { /* */ }
      if (last && id) { vote(surname, key(last), id); saveNames++; }
    }
  }

  const resolve = (m: Map<string, Map<number, number>>) => {
    const out: Record<string, number> = {};
    for (const [k, votes] of m) out[k] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return out;
  };
  const slope = (xs: number[], ys: number[]) => {
    const n = xs.length; if (n < 8) return 0;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
    return sxx ? +(sxy / sxx).toFixed(3) : 0;
  };

  const out = {
    _source: `built ${new Date().toISOString().slice(0, 10)} from ${m27Files} M27 + ${m26Files} M26 CAREERDRAFT files (${m27Rookies} game-generated M27 rookies) and ${saveNames} career-save players`,
    surnameCommentary: resolve(surname),
    headPid: resolve(headPid),
    personality: Object.fromEntries(Object.entries(personality).map(([p, s]) => [p, { ...finish(s), slopeVsOvr: slope(personalityByOvr[p].xs, personalityByOvr[p].ys) }])),
    focus, qbStyle, hidden87, hidden9c, bodyTypeEnum,
  };
  const dest = path.join(LOOKUPS_DIR, 'm27-field-stats.json');
  fs.writeFileSync(dest, JSON.stringify(out, null, 1));
  console.log(`wrote ${dest}`);
  console.log(`surnames: ${Object.keys(out.surnameCommentary).length}, heads: ${Object.keys(out.headPid).length}, positions with personality: ${Object.keys(out.personality).length}`);
  console.log('focus', focus, 'qbStyle', qbStyle, 'bodyType', bodyTypeEnum);
  void FranchiseService; // keep the import (ensures the lib is resolvable the same way the app does)
}

main().catch((e) => { console.error(e); process.exit(1); });
