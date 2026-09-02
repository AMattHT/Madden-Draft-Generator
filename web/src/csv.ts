import { ATTR_COLUMNS, DEV_NAMES, POS_NAMES, fmtHeight } from './constants';
import type { ClassEdits, PlayerRow } from './types';

/** Fixed (non-attribute) columns, in sheet order. The 54 attributes follow, using
 *  Madden's abbreviations from ATTR_COLUMNS. */
export const CSV_FIXED_COLUMNS = [
  'Pick', 'First', 'Last', 'Pos', 'Archetype', 'OVR', 'Dev', 'wAV', 'wAVSource', 'Team', 'College',
  'DraftYear', 'Round', 'DraftPick', 'Height', 'HeightIn', 'Weight', 'Age', 'Jersey', 'BodyType', 'Face',
  'Forty', 'Bench', 'Vertical', 'Broad', 'Cone', 'Shuttle',
];

const esc = (v: unknown): string => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One board as a spreadsheet, with the player's edits applied the way the export
 *  applies them (names, position, dev, bio, every rating). No byte-order mark:
 *  the caller adds it so tests can compare plain text. */
export function buildClassCsv(rows: PlayerRow[], edits: ClassEdits): string {
  const lines = [[...CSV_FIXED_COLUMNS, ...ATTR_COLUMNS.map((c) => c.label)].join(',')];
  for (const r of rows) {
    const e = edits[r.id] ?? {};
    const num = (k: string, base: number) => (e[k] != null && e[k] !== '' ? Number(e[k]) : base);
    const str = (k: string, base: string) => (typeof e[k] === 'string' ? (e[k] as string) : base);
    const posId = num('position', r.positionId);
    const heightIn = num('heightInches', r.heightInches);
    const fixed = [
      r.pick, str('firstName', r.firstName), str('lastName', r.lastName), POS_NAMES[posId] ?? r.position,
      r.archetypeName, num('overall', r.overall), DEV_NAMES[num('devTrait', r.devTrait)] ?? '', r.wav ?? '',
      r.wavSource, r.team?.abbr ?? '', r.college, r.draftYear, r.round ?? '', r.draftPick ?? '',
      fmtHeight(heightIn), heightIn, num('weight', r.weight), num('age', r.age), num('jerseyNum', r.jersey),
      str('bodyType', r.bodyType), r.face,
      r.combine?.forty ?? '', r.combine?.bench ?? '', r.combine?.vertical ?? '', r.combine?.broad ?? '',
      r.combine?.cone ?? '', r.combine?.shuttle ?? '',
    ];
    const attrs = ATTR_COLUMNS.map((c) => num(c.key, r.ratings?.[c.key] ?? 0));
    lines.push([...fixed, ...attrs].map(esc).join(','));
  }
  return lines.join('\n');
}
