/**
 * Exercise every franchise tool against COPIES of the M26 and M27 autosaves in a
 * temp folder (your real Saves folders are never touched), re-open each output
 * and assert the edit is really there. Prints PASS/FAIL per tool.
 *
 *   npx tsx scripts/verify-franchise.ts
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'madden-verify-'));
const m26Dir = path.join(tmp, 'm26'), m27Dir = path.join(tmp, 'm27');
fs.mkdirSync(m26Dir); fs.mkdirSync(m27Dir);
const realM26 = process.env.REAL_M26_SAVES || path.join(os.homedir(), 'Documents', 'Madden NFL 26', 'Saves');
const realM27 = process.env.REAL_M27_SAVES || path.join(os.homedir(), 'Documents', 'Madden NFL 27', 'saves');
const pick = (dir: string) => fs.existsSync(dir) ? fs.readdirSync(dir).find((f) => /^CAREER-.*AUTOSAVE$/i.test(f)) ?? null : null;
const m26Save = pick(realM26), m27Save = pick(realM27);
// Each save goes into BOTH folders so the cross-game guard can be exercised.
if (m26Save) { fs.copyFileSync(path.join(realM26, m26Save), path.join(m26Dir, m26Save)); fs.copyFileSync(path.join(realM26, m26Save), path.join(m27Dir, m26Save)); }
if (m27Save) { fs.copyFileSync(path.join(realM27, m27Save), path.join(m27Dir, m27Save)); fs.copyFileSync(path.join(realM27, m27Save), path.join(m26Dir, m27Save)); }
// Point the service at the temp folders BEFORE it loads its path constants.
process.env.MADDEN_SAVES_DIR = m26Dir;
process.env.MADDEN27_SAVES_DIR = m27Dir;

(async () => {
  const { FranchiseService } = await import('../src/services/FranchiseService');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const madden = require('madden-franchise');
  let pass = 0, fail = 0;
  const check = async (name: string, fn: () => Promise<string>) => {
    try { const detail = await fn(); console.log(`  PASS  ${name}${detail ? ' - ' + detail : ''}`); pass++; }
    catch (e) { console.log(`  FAIL  ${name} - ${(e as Error).message}`); fail++; }
  };
  const silence = async <T,>(fn: () => Promise<T>): Promise<T> => { const c = { ...console }; console.log = console.warn = console.info = () => {}; try { return await fn(); } finally { Object.assign(console, c); } };

  for (const [version, save, dir] of [['m26', m26Save, m26Dir], ['m27', m27Save, m27Dir]] as Array<['m26' | 'm27', string | null, string]>) {
    console.log(`\n${version.toUpperCase()} ${save ?? '(no autosave found)'}`);
    if (!save) continue;
    const expectedYear = version === 'm27' ? 27 : 26;
    const reopen = async (name: string) => { const f = await madden.create(path.join(dir, name), { autoParse: true }); if (Number(f.gameYear) !== expectedYear) throw new Error(`output is Madden ${f.gameYear}`); return f; };
    const playerTable = async (f: any) => { const t = f.getTableByUniqueId(1612938518) || f.getTableByName('Player'); await t.readRecords(); return t; };

    await check('cross-game guard', async () => {
      const wrong = version === 'm27' ? 'm26' : 'm27';
      try { await FranchiseService.franchiseTeams(save, wrong); } catch (e) { if (/is a Madden \d+ franchise/.test((e as Error).message)) return 'refused with a clear message'; throw e; }
      throw new Error('a save from the other game was accepted');
    });
    await check('teams list', async () => { const r = await FranchiseService.franchiseTeams(save, version); if (r.teams.length < 32) throw new Error(`${r.teams.length} teams`); return `${r.teams.length} teams`; });
    await check('players list', async () => { const r = await FranchiseService.franchisePlayers(save, version); if (r.players.length < 1000) throw new Error(`${r.players.length} players`); return `${r.players.length} players`; });
    await check('schedule', async () => { const r = await FranchiseService.franchiseSchedule(save, version); const n = (r as any).weeks?.length ?? (r as any).games?.length ?? 0; if (!n) throw new Error('empty'); return `${n} weeks/games`; });
    await check('heal injuries + rookie dev (written, re-opened)', async () => {
      const r = await silence(() => FranchiseService.playerEdit(save, { healInjuries: true, setDev: { scope: 'rookies', tier: 'Star' } }, version));
      const f = await reopen(r.output); const pt = await playerTable(f);
      let injured = 0, rookieNotStar = 0;
      for (const rec of pt.records) { if (rec.isEmpty) continue; try { if (String(rec.ContractStatus) === 'Deleted') continue; } catch { continue; }
        try { if (String(rec.InjuryStatus) !== 'Uninjured') injured++; } catch { /* */ }
        // The dev enum carries aliases that share a value (College_Impact = Star, College_Star = Superstar, College_Elite = XFactor).
        try { if (Number(rec.YearsPro) === 0 && !['Star', 'College_Impact'].includes(String(rec.TraitDevelopment))) rookieNotStar++; } catch { /* */ } }
      if (injured) throw new Error(`${injured} still injured`);
      if (rookieNotStar) throw new Error(`${rookieNotStar} rookies not Star`);
      return `${r.injuriesCleared} healed, ${r.devSet} dev set`;
    });
    await check('trait realism (dry run)', async () => { const r = await silence(() => FranchiseService.applyTraitRealism(save, { dryRun: true }, version)); return JSON.stringify((r as any).after ?? '').slice(0, 80); });
    await check('free-agent trim (dry run)', async () => { const r = await silence(() => FranchiseService.trimFreeAgents(save, { dryRun: true }, version)); return `${(r as any).wouldDelete ?? (r as any).deleted ?? '?'} would go`; });
    await check('cap reset (written, re-opened)', async () => {
      const r = await silence(() => FranchiseService.capReset(save, {}, version));
      await reopen(r.output);
      return `${r.teams?.length ?? '?'} teams, output ${r.output}`;
    });
    await check('roster apply: overall 99 on one player (written, re-opened)', async () => {
      const list = await FranchiseService.franchisePlayers(save, version);
      const target = list.players.find((p) => p.overall && p.overall < 90)!;
      const r = await silence(() => FranchiseService.rosterApply(save, { [String(target.id)]: { overall: 99 } }, version));
      const f = await reopen(r.output); const pt = await playerTable(f);
      const rec = pt.records[target.id];
      if (Number(rec.OverallRating) !== 99) throw new Error(`overall reads ${rec.OverallRating}`);
      return `${target.lastName}: ${target.overall} -> 99`;
    });
  }
  console.log(`\n${fail ? 'FAIL' : 'PASS'}: ${pass} passed, ${fail} failed (temp: ${tmp})`);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* leave for inspection */ }
  process.exit(fail ? 1 : 0);
})();
