/**
 * Gate 1: write ROSTER-Official back through the TDB2 engine with no edits, as
 * ROSTER-GATE1 in the Madden 27 saves folder, for an in-game load test.
 *
 *   npx tsx scripts/roster-gate1.ts [baseName]      (default ROSTER-Official)
 *
 * In Madden 27: Load and Save -> Load -> Roster -> ROSTER-GATE1. Check a few
 * players (Geno Smith QB NYJ 72 OVR, throw power 88) and start a play.
 */
import fs from 'fs';
import { RosterFileService } from '../src/services/RosterFileService';
import { splitContainer, headerInfo, crc32Bzip2 } from '../src/services/RosterContainer';

async function main() {
  const baseName = process.argv[2] || 'ROSTER-Official';
  const outName = 'ROSTER-GATE1';
  const base = await RosterFileService.openBase(baseName);
  const out = RosterFileService.write(base.tdb2, base.header);
  const { header, payload } = splitContainer(out);
  const info = headerInfo(header);
  if (info.payloadLength !== payload.length || info.crc !== crc32Bzip2(payload)) throw new Error('self-check failed: header does not match payload');
  const original = splitContainer(fs.readFileSync(RosterFileService.savePath(baseName))).payload;
  const outPath = RosterFileService.savePath(outName);
  fs.writeFileSync(`${outPath}.tmp`, out);
  fs.renameSync(`${outPath}.tmp`, outPath);
  console.log(`wrote ${outPath}`);
  console.log(`players ${base.players.length}, teams ${base.teams.length}, payload ${payload.length} bytes (original ${original.length}), crc ${info.crc.toString(16)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
