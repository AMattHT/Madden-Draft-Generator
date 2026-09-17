import fs from 'fs';
import path from 'path';
import { RosterFileService, PLAY_RATING_KEY, type BaseRoster } from './RosterFileService';
import { intOf, strOf, setInt, setStr, makeIntField, makeStringField, makeRecord, cloneRecord, type Tdb2Record, type Tdb2Table } from './Tdb2Engine';
import { PositionMapper } from './PositionMapper';
import { RATING_KEYS } from './AttributeModel';
import { GEAR_SLOT_TYPES, waistConflict } from './GearOptionsService';
import { RosterAddService } from './RosterAddService';
import type { RosterBuildDoc, PlayerFieldEdit, ApplyCounts, RosterBuildResult, AddedPlayer, GeneratedRosterPlayer } from '../types/roster';

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

/** The base roster's median-overall player at the position, else the median of everyone. */
function templateFor(base: BaseRoster, positionId: number): Tdb2Record {
  const rows = base.tdb2.PLAY.records;
  const same = rows.filter((r) => intOf(r, 'PPOS') === positionId);
  const pool = (same.length ? same : rows).slice().sort((a, b) => intOf(a, 'POVR') - intOf(b, 'POVR'));
  return pool[Math.floor(pool.length / 2)];
}

function cheapestContract(base: BaseRoster): Tdb2Record | undefined {
  const rows = base.tdb2.PLCT.records.filter((r) => intOf(r, 'PCON') === 1);
  return rows.slice().sort((a, b) => intOf(a, 'PSA0') - intOf(b, 'PSA0'))[0];
}

function nextId(base: BaseRoster): number {
  return Math.max(0, ...base.tdb2.PLAY.records.map((r) => intOf(r, 'PGID'))) + 1;
}

/** Clone a template player's PLAY, PRSN, PLCT and blob rows for a pool player and write his
 *  values. No depth-chart rows: the game rebuilds them on load. Returns the new PGID. */
function addPlayer(base: BaseRoster, add: AddedPlayer, g: GeneratedRosterPlayer, skipped: string[]): number {
  const template = templateFor(base, g.positionId);
  const templateId = intOf(template, 'PGID');
  const pgid = nextId(base);
  const salaryRow = cheapestContract(base);
  const salary = salaryRow ? intOf(salaryRow, 'PSA0') : 20;
  const jersey = add.jersey ?? g.jersey;

  const row = cloneRecord(template);
  setInt(row, 'PGID', pgid); setInt(row, 'POID', pgid);
  setStr(row, 'PFNA', g.firstName); setStr(row, 'PLNA', g.lastName);
  setInt(row, 'TGID', add.teamId);
  setInt(row, 'PPOS', g.positionId); setInt(row, 'PLTY', g.archetypeId);
  setInt(row, 'POVR', g.overall); setInt(row, 'PROL', g.devTrait);
  setInt(row, 'PAGE', g.age); setInt(row, 'PYRP', g.yearsPro); setInt(row, 'PYWT', 0);
  setInt(row, 'PHGT', g.heightInches); setInt(row, 'PWGT', Math.max(0, g.weight - 160));
  setInt(row, 'PJEN', jersey);
  setInt(row, 'PCOL', g.collegeId); setStr(row, 'PHTN', g.hometown); setInt(row, 'PHSN', g.homeStateId);
  setInt(row, 'PDRO', g.draftRound); setInt(row, 'PDPI', g.draftPick); setInt(row, 'PLDT', 0);
  setStr(row, 'PEPS', g.assetName || g.genericHead);
  setInt(row, 'PCMT', g.commentaryId);
  setInt(row, 'PCSA', salary); setInt(row, 'PTSA', salary); setInt(row, 'PVTS', salary);
  for (const k of RATING_KEYS) setInt(row, PLAY_RATING_KEY[k], g.ratings[k] ?? 0);
  base.tdb2.PLAY.addRecord(row);

  const prsnT = base.tdb2.PRSN.records.find((r) => intOf(r, 'PGID') === templateId) ?? base.tdb2.PRSN.records[0];
  if (prsnT) {
    const prsn = cloneRecord(prsnT);
    setInt(prsn, 'PGID', pgid);
    for (let i = 0; i < 8; i++) setInt(prsn, `DNA${i}`, g.personaDNA[i] ?? 0);
    setInt(prsn, 'PRFC', g.focus);
    base.tdb2.PRSN.addRecord(prsn);
  } else skipped.push(`add: no persona template for ${g.key}`);

  if (salaryRow) {
    const plct = cloneRecord(salaryRow);
    setInt(plct, 'PGID', pgid);
    base.tdb2.PLCT.addRecord(plct);
  } else skipped.push(`add: no contract template for ${g.key}`);

  const blobs: Tdb2Table = base.tdb2.BLOB.records[0].fields.BLBM.value;
  const blobT = blobs.records.find((r) => r.index === templateId) ?? blobs.records[0];
  if (blobT) {
    const blob = cloneRecord(blobT);
    blob.index = pgid;
    setInt(blob, 'CNID', pgid);
    setStr(blob, 'ASNM', g.assetName);
    setStr(blob, 'CFNM', g.firstName); setStr(blob, 'CLNM', g.lastName);
    setInt(blob, 'CJNO', jersey);
    setStr(blob, 'GENR', g.genericHead);
    setInt(blob, 'SKNT', g.skinTone);
    setInt(blob, 'HINC', g.heightInches); setInt(blob, 'WLBS', g.weight);
    const { onField, body } = loadouts(blob);
    if (body) setPin(body, BODY_SLOT, `${g.bodyType}_BodyType`);
    if (onField) {
      for (const [slot, asset] of Object.entries(g.gear)) {
        if (!asset) continue;
        if (slot === 'facemask') { setFacemask(onField, asset); continue; }
        for (const t of GEAR_SLOT_TYPES[slot] ?? []) { const id = SLOT_ID[t]; if (id != null) setPin(onField, id, asset); }
      }
    }
    blobs.addRecord(blob);
  } else skipped.push(`add: no visuals template for ${g.key}`);

  // The read model is what later moves and edits in this apply consult.
  base.players.push({
    id: pgid, firstName: g.firstName, lastName: g.lastName, position: g.position, positionId: g.positionId,
    teamId: add.teamId, team: base.teams.find((t) => t.id === add.teamId)?.abbr ?? null, teamName: null,
    overall: g.overall, age: g.age, heightInches: g.heightInches, weight: g.weight, jersey,
    yearsPro: g.yearsPro, devTrait: g.devTrait, archetype: g.archetype, college: g.college, hometown: g.hometown,
    draftRound: g.draftRound < 63 ? g.draftRound : null, draftPick: g.draftPick || null,
    assetName: g.assetName || null, portrait: g.portrait, ratings: { ...g.ratings },
    visuals: { bodyType: g.bodyType, genericHead: g.genericHead, helmet: g.gear.helmet ?? '', facemask: g.gear.facemask ?? '' },
  });
  return pgid;
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
  /** Apply a document's moves, adds and edits to a parsed base roster, in place.
   *  `generated` holds the rated pool players for the document's adds, by catalog key. */
  apply(base: BaseRoster, doc: RosterBuildDoc, generated: Map<string, GeneratedRosterPlayer>): ApplyCounts {
    const counts: ApplyCounts = { moved: 0, cut: 0, edited: 0, added: 0, skipped: [] };
    const teamIds = new Set(base.teams.map((t) => t.id));
    const idOfTemp = new Map<string, number>();
    for (const add of doc.adds ?? []) {
      const g = generated.get(add.key);
      if (!g) { counts.skipped.push(`add: player ${add.key} could not be generated`); continue; }
      if (!teamIds.has(add.teamId)) { counts.skipped.push(`add: team ${add.teamId} is not in the base roster`); continue; }
      idOfTemp.set(add.tempId, addPlayer(base, add, g, counts.skipped));
      counts.added++;
    }
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
      const pgid = idOfTemp.get(idStr) ?? Number(idStr);
      if (!Number.isFinite(pgid)) { counts.skipped.push(`edit: ${idStr} is not a player`); continue; }
      if (applyEdit(base, pgid, e, counts.skipped)) counts.edited++;
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
    const generated = new Map<string, GeneratedRosterPlayer>();
    for (const add of doc.adds ?? []) {
      if (generated.has(add.key)) continue;
      try { generated.set(add.key, await RosterAddService.generate(add.key)); } catch { /* reported by apply as skipped */ }
    }
    const counts = RosterBuildService.apply(base, doc, generated);
    const buf = RosterFileService.write(base.tdb2, base.header);
    const outputPath = RosterFileService.savePath(output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(`${outputPath}.tmp`, buf);
    fs.renameSync(`${outputPath}.tmp`, outputPath);
    return { ...counts, input: base.name, output, outputPath };
  },
};
