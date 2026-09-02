/**
 * Extract every real NFL player's full on-field gear loadout from a Madden 26
 * roster/franchise file (default: ROSTER-Official in the Saves dir) into
 * data/real-player-gear.json — the donor database behind "copy real player gear"
 * in the Equipment Builder.
 *
 * Parsing mirrors FranchiseService (madden-franchise lib, Player table +
 * CharacterVisuals table3 RawData JSON). Slot mapping inverts GEAR_SLOT_TYPES
 * from GearOptionsService so the output keys are the same slot keys the web
 * app and the .mdc export already use (helmet, facemask, towel, wristLeft, …).
 *
 * Run:  npx tsx scripts/extract-real-gear.ts [rosterFileName]
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { slotOfElement } from '../src/services/GearOptionsService';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const madden = require('madden-franchise');

const PLAYER_TABLE_UID = 1612938518;
const TEAM_TABLE_UID = 637929298;
const CHARVISUALS_TABLE_UID = 1429178382; // CharacterVisuals (RawData = loadout JSON, table3 blob)
const PSEUDO_TEAMS = new Set(['AFC', 'NFC', 'Free Agents', 'Free Agent', 'Rest of NFL', 'AFC Pro Bowl', 'NFC Pro Bowl']);

// A slotted 'FaceMask' element appears in a few roster loadouts (normally the
// facemask is a slotless GearFaceMask_* element) — map it to the same slot.
const slotOf = (slotType: string, asset: string) => (slotType === 'FaceMask' ? 'facemask' : slotOfElement(slotType, asset));

const bitsNull = (b: string) => /^0+$/.test(b);
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

interface LoadoutElement { slotType?: string; itemAssetName: string }

/** Player CharacterVisuals ref -> parsed PlayerOnField loadout elements (null if none). */
function cvLoadout(cvTable: any, playerRec: any): LoadoutElement[] | null {
  try {
    const raw = String(playerRec.CharacterVisuals ?? '');
    if (bitsNull(raw)) return null;
    const ref = playerRec.getReferenceDataByKey('CharacterVisuals');
    if (!ref || ref.rowNumber == null) return null;
    const row = cvTable.records[ref.rowNumber];
    if (!row) return null;
    let overflow = '';
    try { overflow = String(row.Overflow); } catch { /* */ }
    if (!bitsNull(overflow)) return null;
    let data = '';
    try { data = String(row.RawData); } catch { return null; }
    const obj = JSON.parse(data);
    const lo = (obj.loadouts || []).find((l: { loadoutType?: string }) => l.loadoutType === 'PlayerOnField');
    if (!lo) return null;
    return lo.loadoutElements ?? [];
  } catch {
    return null;
  }
}

async function main() {
  const savesDir = process.env.MADDEN_SAVES_DIR || path.join(os.homedir(), 'Documents', 'Madden NFL 26', 'Saves');
  // Default donor: a franchise save. ROSTER-* files use a different FBCHUNKS
  // chunk layout that madden-franchise can't unpack; CAREER-* franchise saves
  // parse cleanly and (per the owner) carry untouched, official gear.
  const fileName = process.argv[2] || 'CAREER-JUN30-08h18m10p-AUTOSAVE';
  const inputPath = path.join(savesDir, fileName);
  if (!fs.existsSync(inputPath)) throw new Error(`roster file not found: ${inputPath}`);

  console.log(`Opening ${inputPath} …`);
  // gameYearOverride: roster files don't carry the year identifier bytes the lib
  // sniffs for (franchise saves do), so tell it this is Madden 26 explicitly.
  const file = await madden.create(inputPath, { autoParse: true, gameYearOverride: 26 });

  // Team index -> display name (real teams only).
  const teamMap = new Map<number, string>();
  const tt = file.getTableByUniqueId(TEAM_TABLE_UID);
  if (tt) {
    await tt.readRecords();
    for (const r of tt.records) {
      if (r.isEmpty) continue;
      let name = '', idx = -1;
      try { name = String(r.DisplayName || ''); } catch { /* */ }
      try { idx = num(r.TeamIndex); } catch { /* */ }
      if (idx < 0 || idx >= 32 || PSEUDO_TEAMS.has(name) || teamMap.has(idx)) continue;
      teamMap.set(idx, name);
    }
  }

  const pt = file.getTableByUniqueId(PLAYER_TABLE_UID) || file.getTableByName('Player');
  if (!pt) throw new Error('player table not found');
  await pt.readRecords();
  const cvt = file.getTableByUniqueId(CHARVISUALS_TABLE_UID);
  if (!cvt) throw new Error('CharacterVisuals table not found');
  await cvt.readRecords();

  const unknownSlotTypes = new Map<string, number>();
  const players: any[] = [];
  let considered = 0, withGear = 0;

  for (const r of pt.records) {
    if (r.isEmpty) continue;
    let status = '';
    try { status = String(r.ContractStatus); } catch { /* */ }
    if (status === 'Deleted' || status === 'None') continue;
    considered++;

    const els = cvt ? cvLoadout(cvt, r) : null;
    if (!els || els.length === 0) continue;

    const gear: Record<string, string> = {};
    for (const e of els) {
      const asset = String(e.itemAssetName || '');
      if (!asset) continue;
      if (!e.slotType) {
        // Slotless elements: facemasks are the only ones we write (GearFaceMask_*).
        if (asset.startsWith('GearFaceMask_')) gear.facemask = asset;
        continue;
      }
      const slot = slotOf(e.slotType, asset);
      if (!slot) {
        unknownSlotTypes.set(e.slotType, (unknownSlotTypes.get(e.slotType) ?? 0) + 1);
        continue;
      }
      gear[slot] = asset;
    }
    if (Object.keys(gear).length === 0) continue;
    withGear++;

    const s = (k: string) => { try { return String(r[k] ?? ''); } catch { return ''; } };
    const teamIndex = num(r.TeamIndex);
    players.push({
      name: `${s('FirstName')} ${s('LastName')}`.trim(),
      team: teamMap.get(teamIndex) || (status === 'FreeAgent' ? 'Free Agent' : ''),
      position: s('Position'),
      jersey: num(r.JerseyNum),
      gear,
    });
  }

  players.sort((a, b) => a.name.localeCompare(b.name));

  const out = {
    _source: fileName,
    _extractedAt: new Date().toISOString(),
    _playersConsidered: considered,
    players,
  };
  const outPath = path.join(__dirname, '..', 'data', 'real-player-gear.json');
  fs.writeFileSync(outPath, JSON.stringify(out));
  console.log(`Wrote ${players.length} players (${withGear} with gear, ${considered} considered) -> ${outPath}`);
  if (unknownSlotTypes.size) {
    console.log('Unmapped slotTypes seen (not written):', Object.fromEntries(unknownSlotTypes));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
