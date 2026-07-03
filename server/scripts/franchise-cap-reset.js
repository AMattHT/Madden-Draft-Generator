/**
 * Franchise salary-cap reset (Madden 26 CAREER save).
 *
 * Clears accumulated dead money and opens cap room for every real NFL team so a
 * late-franchise save isn't strangled by cap penalties. Reads a CAREER save and
 * writes the result to a SEPARATE output file — it never overwrites the input.
 *
 *   node scripts/franchise-cap-reset.js <input CAREER save> <output path> [rolloverFloor]
 *
 * What it changes per team (Team table, uniqueId-agnostic — found by field):
 *   - ThisYearCapPenalties -> 0   (this year's dead money)
 *   - NextYearCapPenalties -> 0   (next year's dead money)
 *   - SalCapCapRoom        += the dead money we just freed (reflect the space)
 *   - RolloverCap          -> at least `rolloverFloor` (a cushion)
 * Pseudo-teams (AFC / NFC pro-bowl squads, Free Agents) are skipped.
 *
 * NOTE: TEAM_SALARY is derived from player contracts, so it's intentionally left
 * alone here — lowering it means editing contracts (a separate, riskier pass).
 */
const madden = require('madden-franchise');
const fs = require('fs');
const path = require('path');

const INPUT = process.argv[2];
const OUTPUT = process.argv[3];
const ROLLOVER_FLOOR = Number(process.argv[4] || 5000);
const SKIP = new Set(['AFC', 'NFC', 'Free Agents', 'Free Agent', 'Rest of NFL', 'AFC Pro Bowl', 'NFC Pro Bowl']);

async function findTeamTable(file) {
  for (const t of file.tables || []) {
    const cap = t.header?.recordCapacity ?? 0;
    if (cap < 20 || cap > 64) continue;
    const fnames = (t.schema?.attributes || []).map((a) => a.name);
    if (fnames.includes('SalCapCapRoom') && fnames.includes('TEAM_SALARY')) return t;
  }
  return null;
}

(async () => {
  if (!INPUT || !OUTPUT) { console.error('usage: node franchise-cap-reset.js <input> <output> [rolloverFloor]'); process.exit(1); }
  if (path.resolve(INPUT) === path.resolve(OUTPUT)) { console.error('refusing to overwrite the input file'); process.exit(1); }
  if (!fs.existsSync(INPUT)) { console.error('input not found:', INPUT); process.exit(1); }

  const file = await madden.create(INPUT, { autoParse: true });
  const tt = await findTeamTable(file);
  if (!tt) { console.error('team cap table not found'); process.exit(1); }
  await tt.readRecords();

  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const setSafe = (rec, field, val, log) => { try { rec[field] = val; } catch (e) { log.push(`${field} set failed: ${e.message}`); } };

  const rows = [];
  let edited = 0;
  for (const r of tt.records) {
    if (r.isEmpty) continue;
    let name; try { name = String(r.DisplayName || r.LongName || `#${r.index}`); } catch { name = `#${r.index}`; }
    const salary = num(r.TEAM_SALARY);
    if (SKIP.has(name) || salary === 0) continue; // pseudo teams have no salary

    const before = { name, salary, room: num(r.SalCapCapRoom), thisPen: num(r.ThisYearCapPenalties), nextPen: num(r.NextYearCapPenalties), roll: num(r.RolloverCap) };
    const log = [];
    const freed = before.thisPen;
    setSafe(r, 'SalCapCapRoom', before.room + freed, log);
    setSafe(r, 'ThisYearCapPenalties', 0, log);
    setSafe(r, 'NextYearCapPenalties', 0, log);
    if (before.roll < ROLLOVER_FLOOR) setSafe(r, 'RolloverCap', ROLLOVER_FLOOR, log);
    edited++;
    rows.push({ before, after: { room: num(r.SalCapCapRoom), thisPen: num(r.ThisYearCapPenalties), nextPen: num(r.NextYearCapPenalties), roll: num(r.RolloverCap) }, log });
  }

  await file.save(OUTPUT, {});

  console.log(`edited ${edited} teams; wrote ${OUTPUT} (${fs.statSync(OUTPUT).size} bytes, input ${fs.statSync(INPUT).size})\n`);
  console.log('TEAM         DEAD MONEY (this/next)      CAP ROOM        ROLLOVER');
  for (const { before, after, log } of rows) {
    console.log(
      `${before.name.padEnd(12)} ${String(before.thisPen).padStart(5)}/${String(before.nextPen).padStart(4)} -> ${String(after.thisPen)}/${after.nextPen}` +
      `      ${String(before.room).padStart(5)} -> ${String(after.room).padStart(5)}` +
      `     ${String(before.roll).padStart(5)} -> ${String(after.roll).padStart(5)}` +
      (log.length ? `   [!] ${log.join('; ')}` : '')
    );
  }
  process.exit(0);
})().catch((e) => { console.error('ERROR:', (e && e.stack) || e); process.exit(1); });
