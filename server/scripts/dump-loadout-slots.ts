/**
 * Dump every PlayerOnField loadout slotType -> itemAssetName count from a
 * franchise save, so new equipment slots can be added from evidence rather than
 * guesswork (what the game actually writes, per game version).
 *
 *   npx tsx scripts/dump-loadout-slots.ts <savePath> <gameYear 26|27> [slotTypeFilter]
 */
import fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const madden = require('madden-franchise');

const PLAYER_TABLE_UID = 1612938518;
const CHARVISUALS_TABLE_UID = 1429178382;
const bitsNull = (b: string) => /^0+$/.test(b);

async function main() {
  const [savePath, yearArg, filter] = process.argv.slice(2);
  if (!savePath || !fs.existsSync(savePath)) throw new Error(`save not found: ${savePath}`);
  const file = await madden.create(savePath, { autoParse: true, gameYearOverride: Number(yearArg) || 26 });
  const pt = file.getTableByUniqueId(PLAYER_TABLE_UID) || file.getTableByName('Player');
  await pt.readRecords();
  const cvt = file.getTableByUniqueId(CHARVISUALS_TABLE_UID);
  await cvt.readRecords();

  const counts = new Map<string, Map<string, number>>();
  let players = 0;
  for (const r of pt.records) {
    if (r.isEmpty) continue;
    let status = '';
    try { status = String(r.ContractStatus); } catch { /* */ }
    if (status === 'Deleted' || status === 'None') continue;
    let els: Array<{ slotType?: string; itemAssetName?: string }> = [];
    try {
      if (bitsNull(String(r.CharacterVisuals ?? ''))) continue;
      const ref = r.getReferenceDataByKey('CharacterVisuals');
      const row = ref && ref.rowNumber != null ? cvt.records[ref.rowNumber] : null;
      if (!row || !bitsNull(String(row.Overflow))) continue;
      const obj = JSON.parse(String(row.RawData));
      const lo = (obj.loadouts || []).find((l: { loadoutType?: string }) => l.loadoutType === 'PlayerOnField');
      els = lo?.loadoutElements ?? [];
    } catch { continue; }
    players++;
    for (const e of els) {
      const st = e.slotType ?? '(slotless)';
      if (filter && !new RegExp(filter, 'i').test(st)) continue;
      const m = counts.get(st) ?? new Map<string, number>();
      m.set(String(e.itemAssetName ?? ''), (m.get(String(e.itemAssetName ?? '')) ?? 0) + 1);
      counts.set(st, m);
    }
  }
  console.log(`${players} players with a PlayerOnField loadout`);
  for (const [st, m] of [...counts].sort((a, b) => a[0].localeCompare(b[0]))) {
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    console.log(`\n## ${st} (${total})`);
    for (const [asset, n] of [...m].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${asset}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
