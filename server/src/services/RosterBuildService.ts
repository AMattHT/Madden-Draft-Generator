import fs from 'fs';
import path from 'path';
import { RosterFileService, PLAY_RATING_KEY, type BaseRoster } from './RosterFileService';
import { intOf, strOf, setInt, setStr, makeIntField, makeStringField, makeRecord, type Tdb2Record, type Tdb2Table } from './Tdb2Engine';
import { PositionMapper } from './PositionMapper';
import { RATING_KEYS } from './AttributeModel';
import { GEAR_SLOT_TYPES, waistConflict } from './GearOptionsService';
import type { RosterBuildDoc, PlayerFieldEdit, ApplyCounts, RosterBuildResult } from '../types/roster';

/** Loadout slotType (the app's names, as in the CharacterVisuals JSON) -> roster blob SLOT id.
 *  Tallied from every player's blob in ROSTER-Official on 2026-09-16. */
export const SLOT_ID: Record<string, number> = {
  HeadWear: 106, Visor: 2, LeftHandWear: 114, RightHandWear: 115, LeftShoe: 10, RightShoe: 11,
  Shoulderpads: 25, Neckpad: 29, OuterShirt: 125, InnerSocks: 109, LeftArmWear: 110, RightArmWear: 111,
  LeftElbowWear: 116, RightElbowWear: 117, LeftWristWear: 120, RightWristWear: 121,
  LeftThighWear: 142, RightThighWear: 143, KneeWear: 118, LeftSpat: 9, RightSpat: 54, OuterPants: 124,
};
const BODY_SLOT = 129;
const BODY_TYPES = new Set(['Standard', 'Thin', 'Muscular', 'Heavy', 'Lean']);
export const DEV_ID: Record<string, number> = { Normal: 0, Star: 1, Superstar: 2, XFactor: 3 };
/** The 22 Madden 27 labels in compact-id order (QB … LS). */
export const ROSTER_POSITIONS: string[] = Array.from({ length: 22 }, (_, i) => PositionMapper.name(i));
const clamp99 = (v: number) => Math.max(0, Math.min(99, Math.round(v)));

function playerRow(base: BaseRoster, pgid: number): Tdb2Record | undefined {
  return base.tdb2.PLAY.records.find((r) => intOf(r, 'PGID') === pgid);
}

function blobRow(base: BaseRoster, pgid: number): Tdb2Record | undefined {
  return base.tdb2.BLOB.records[0].fields.BLBM.value.records.find((r: Tdb2Record) => r.index === pgid);
}

function dropDepthChartRows(dcht: Tdb2Table, pgid: number, teamId: number): void {
  const keep = dcht.records.filter((r) => !(intOf(r, 'PGID') === pgid && intOf(r, 'TGID') === teamId));
  if (keep.length === dcht.records.length) return;
  dcht.records.length = 0;
  dcht.records.push(...keep);
  dcht.numEntries = keep.length;
}

/** The on-field PINS subtable of a blob (LDTY = 1) and the body PINS (LDCT = 5). */
function loadouts(blob: Tdb2Record): { onField: Tdb2Table | null; body: Tdb2Table | null } {
  const louts: Tdb2Record[] = blob.fields.LOUT?.value?.records ?? [];
  const find = (key: string, v: number) => louts.find((l) => intOf(l, key, -1) === v)?.fields.PINS?.value ?? null;
  return { onField: find('LDTY', 1), body: find('LDCT', 5) };
}

function setPin(pins: Tdb2Table, slot: number, asset: string): void {
  const rec = pins.records.find((p) => intOf(p, 'SLOT', -1) === slot);
  if (rec) setStr(rec, 'ITAN', asset);
  else pins.addRecord(makeRecord([makeStringField('ITAN', asset), makeIntField('SLOT', slot)]));
}

function setFacemask(pins: Tdb2Table, asset: string): void {
  const rec = pins.records.find((p) => !p.fields.SLOT && strOf(p, 'ITAN').startsWith('GearFaceMask_'));
  if (rec) setStr(rec, 'ITAN', asset);
  else pins.addRecord(makeRecord([makeStringField('ITAN', asset)]));
}

function applyEdit(base: BaseRoster, pgid: number, e: PlayerFieldEdit, skipped: string[]): boolean {
  const row = playerRow(base, pgid);
  if (!row) { skipped.push(`edit: player ${pgid} is not in the base roster`); return false; }
  let touched = false;
  if (e.overall != null) { setInt(row, 'POVR', clamp99(e.overall)); touched = true; }
  if (e.age != null) { setInt(row, 'PAGE', Math.max(18, Math.min(50, Math.round(e.age)))); touched = true; }
  if (e.jersey != null) { setInt(row, 'PJEN', clamp99(e.jersey)); touched = true; }
  if (e.position) {
    if (ROSTER_POSITIONS.includes(e.position)) { setInt(row, 'PPOS', ROSTER_POSITIONS.indexOf(e.position)); touched = true; }
    else skipped.push(`edit: unknown position ${e.position} for ${pgid}`);
  }
  if (e.dev) {
    if (e.dev in DEV_ID) { setInt(row, 'PROL', DEV_ID[e.dev]); touched = true; }
    else skipped.push(`edit: unknown dev trait ${e.dev} for ${pgid}`);
  }
  if (e.ratings) {
    for (const [k, v] of Object.entries(e.ratings)) {
      if (!RATING_KEYS.includes(k) || v == null) { skipped.push(`edit: unknown rating ${k} for ${pgid}`); continue; }
      setInt(row, PLAY_RATING_KEY[k], clamp99(Number(v)));
      touched = true;
    }
  }
  const blob = blobRow(base, pgid);
  if (e.jersey != null && blob) setInt(blob, 'CJNO', clamp99(e.jersey));
  if (e.genericHead) {
    if (/^gen_\d/i.test(e.genericHead) && blob) { setStr(blob, 'GENR', e.genericHead); touched = true; }
    else skipped.push(`edit: bad generic head ${e.genericHead} for ${pgid}`);
  }
  if (e.bodyType) {
    const { body } = blob ? loadouts(blob) : { body: null };
    if (BODY_TYPES.has(e.bodyType) && body) { setPin(body, BODY_SLOT, `${e.bodyType}_BodyType`); touched = true; }
    else skipped.push(`edit: body type ${e.bodyType} not applied for ${pgid}`);
  }
  if (e.gear && blob) {
    const { onField } = loadouts(blob);
    if (!onField) skipped.push(`edit: no on-field loadout for ${pgid}`);
    else {
      for (const [slot, asset] of Object.entries(e.gear)) {
        if (!asset || waistConflict(e.gear, slot)) continue;
        if (slot === 'facemask') { setFacemask(onField, asset); touched = true; continue; }
        const types = GEAR_SLOT_TYPES[slot] ?? [];
        if (!types.length) { skipped.push(`edit: unknown gear slot ${slot} for ${pgid}`); continue; }
        for (const t of types) {
          const id = SLOT_ID[t];
          if (id == null) { skipped.push(`edit: no roster slot for ${t} (${slot}) on ${pgid}`); continue; }
          setPin(onField, id, asset);
          touched = true;
        }
      }
    }
  }
  return touched;
}

export const RosterBuildService = {
  /** Apply a document's moves and edits to a parsed base roster, in place. */
  apply(base: BaseRoster, doc: RosterBuildDoc): ApplyCounts {
    const counts: ApplyCounts = { moved: 0, cut: 0, edited: 0, skipped: [] };
    const teamIds = new Set(base.teams.map((t) => t.id));
    for (const [idStr, teamId] of Object.entries(doc.moves ?? {})) {
      const pgid = Number(idStr);
      const row = playerRow(base, pgid);
      if (!row) { counts.skipped.push(`move: player ${pgid} is not in the base roster`); continue; }
      if (!teamIds.has(teamId)) { counts.skipped.push(`move: team ${teamId} is not in the base roster`); continue; }
      const from = intOf(row, 'TGID', base.freeAgentTeamId);
      if (from === teamId) continue;
      setInt(row, 'TGID', teamId);
      setInt(row, 'PYWT', 0);
      dropDepthChartRows(base.tdb2.DCHT, pgid, from);
      if (teamId === base.freeAgentTeamId) counts.cut++; else counts.moved++;
    }
    for (const [idStr, e] of Object.entries(doc.edits ?? {})) {
      if (applyEdit(base, Number(idStr), e, counts.skipped)) counts.edited++;
    }
    return counts;
  },

  /** Open the base, apply the document, write ROSTER-<NAME> next to it. */
  async build(doc: RosterBuildDoc): Promise<RosterBuildResult> {
    const output = RosterFileService.outputNameFor(doc.name);
    if (!doc.baseName && !doc.baseId) throw new Error('baseName or baseId required');
    if (output.toUpperCase() === 'ROSTER-OFFICIAL') throw new Error('refusing to overwrite the official roster');
    if (doc.baseName && output.toUpperCase() === String(doc.baseName).toUpperCase()) throw new Error('refusing to overwrite the base roster');
    const base = doc.baseName ? await RosterFileService.openBase(doc.baseName) : await RosterFileService.openOpened(String(doc.baseId));
    if (output.toUpperCase() === base.name.toUpperCase()) throw new Error('refusing to overwrite the base roster');
    const counts = RosterBuildService.apply(base, doc);
    const buf = RosterFileService.write(base.tdb2, base.header);
    const outputPath = RosterFileService.savePath(output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(`${outputPath}.tmp`, buf);
    fs.renameSync(`${outputPath}.tmp`, outputPath);
    return { ...counts, input: base.name, output, outputPath };
  },
};
