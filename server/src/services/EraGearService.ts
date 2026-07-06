import fs from 'fs';
import path from 'path';
import { DATA_ROOT } from '../config/paths';
import { PositionMapper } from './PositionMapper';

/**
 * Era-appropriate gear for generated draft prospects. Emits M26 visual-JSON
 * loadout elements (slotType + itemAssetName) that M26Writer merges into each
 * block's PlayerOnField loadout, so a 1965 class looks period-correct (vintage
 * helmet/cleats, taped or no gloves, NO visor) instead of modern.
 *
 * Asset names + era brackets come from equipment-years.json (the same data the
 * Editor Suite's EquipmentAssignmentService uses for retro rosters). We set the
 * era-defining slots whose asset vocabulary is verified valid against both that
 * data and the live template (helmet, cleats, gloves, visor, facemask).
 *
 * Facemask is a SLOTLESS loadout element (itemAssetName GearFaceMask_*, no slotType
 * — verified in the template); for the vintage eras we force a period-correct
 * two-bar/three-bar mask (universal-compatible, so it sits right on the Riddell TK
 * shell). Modern eras keep the helmet's default facemask.
 */

interface EraDefaults {
  helmet: string[] | null;
  shoes: string[] | null;
  gloves: string[] | null;
  linemanGloves?: string[] | null;
  notes?: string;
}

interface EquipmentYears {
  eraDefaults: Record<string, EraDefaults>;
}

let data: EquipmentYears | null = null;

function load(): EquipmentYears {
  if (data) return data;
  data = JSON.parse(fs.readFileSync(path.join(DATA_ROOT, 'equipment-years.json'), 'utf8'));
  return data!;
}

/** Era brackets, matching the Editor Suite's EquipmentAssignmentService. */
function eraBracket(year: number): string {
  if (year <= 1979) return '1970-1979';
  if (year <= 1989) return '1980-1989';
  if (year <= 1999) return '1990-1999';
  if (year <= 2007) return '2000-2007';
  if (year <= 2013) return '2008-2013';
  if (year <= 2016) return '2014-2016';
  if (year <= 2019) return '2017-2019';
  if (year <= 2022) return '2020-2022';
  return '2023-2025';
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic pick from a list (reproducible per player+slot). */
function pick(arr: string[] | null | undefined, seed: string): string | null {
  if (!arr || arr.length === 0) return null;
  return arr[hash(seed) % arr.length];
}

const SKILL = new Set(['QB', 'RB', 'WR', 'TE', 'CB', 'S']);
const LINE = new Set(['OL', 'IDL', 'EDGE']);

/** Period-correct facemask by era bracket. Two-bar for skill, three-bar for
 *  linemen; both are 'universal' compat so they fit the Riddell TK vintage shell.
 *  Modern eras (2000+) are omitted so the helmet's default facemask is used. */
const ERA_FACEMASK: Record<string, { skill: string; line: string }> = {
  '1970-1979': { skill: 'GearFaceMask_2Bar', line: 'GearFaceMask_3Bar' },
  '1980-1989': { skill: 'GearFaceMask_2Bar', line: 'GearFaceMask_3Bar' },
  '1990-1999': { skill: 'GearFaceMask_2Bar', line: 'GearFaceMask_3Bar' },
};

export interface LoadoutElement {
  slotType?: string;
  itemAssetName: string;
}

export const EraGearService = {
  /** Build era-appropriate PlayerOnField loadout elements for a prospect. */
  loadoutElements(year: number, m26PosId: number, seedKey: string): LoadoutElement[] {
    const era = load().eraDefaults[eraBracket(year)];
    if (!era) return [];
    const group = PositionMapper.groupFromId(m26PosId);
    const els: LoadoutElement[] = [];

    const helmet = pick(era.helmet, `${seedKey}|helmet`);
    if (helmet) els.push({ slotType: 'HeadWear', itemAssetName: helmet });

    // Vintage facemask (slotless GearFaceMask_* element) for the old eras.
    const fm = ERA_FACEMASK[eraBracket(year)];
    if (fm) els.push({ itemAssetName: LINE.has(group) ? fm.line : fm.skill });

    const shoe = pick(era.shoes, `${seedKey}|shoe`);
    if (shoe) {
      els.push({ slotType: 'LeftShoe', itemAssetName: shoe });
      els.push({ slotType: 'RightShoe', itemAssetName: shoe });
    }

    const glovePool = LINE.has(group) ? era.linemanGloves || era.gloves : era.gloves;
    const glove = pick(glovePool, `${seedKey}|glove`) || 'GearHand_None';
    els.push({ slotType: 'LeftHandWear', itemAssetName: glove });
    els.push({ slotType: 'RightHandWear', itemAssetName: glove });

    // No visors before 1990; afterward only skill positions tend to wear them.
    const visor = year < 1990 ? 'GearVisor_None' : SKILL.has(group) ? 'GearVisor_visorClear' : 'GearVisor_None';
    els.push({ slotType: 'Visor', itemAssetName: visor });

    return els;
  },

  /** A full PlayerOnField loadout object for prospect.visuals.loadouts. */
  loadout(year: number, m26PosId: number, seedKey: string) {
    return { loadoutType: 'PlayerOnField', loadoutElements: this.loadoutElements(year, m26PosId, seedKey) };
  },

  eraBracket,
};
