import { MdcService, MdcProspect } from './MdcService';
import { PositionMapper } from './PositionMapper';
import { LookupService } from './LookupService';
import {
  RATING_KEYS,
  applyEdits,
  type ClassEdits,
  type PreviewRow,
  type PreviewResult,
} from './DraftClassBuilder';

/**
 * The 2026 draft class. The local lookup (ALL_PLAYER_LOOKUP.csv) only covers
 * 1936–2025, but the CAREERDRAFT-2026Template ships with the real 402-prospect
 * Madden 26 rookie class (Drew Allar, Garrett Nussmeier, …) — EA's actual
 * ratings + real face assets. Rookies have no career wAV yet, so for 2026 we
 * serve this authoritative class as-is rather than predicting from draft slot.
 */

export const TEMPLATE_YEAR = 2026;

function faceOf(p: MdcProspect): 'asset' | 'generic' | 'photo' {
  const peps = String(p.PEPS || '').toLowerCase();
  return peps && !peps.startsWith('gen_') ? 'asset' : 'generic';
}

/** Sort prospects into draft order (round, then within-round pick; UDFA last). */
function draftOrder(prospects: MdcProspect[]): MdcProspect[] {
  const rk = (r: number) => (r === 0 ? 98 : r === 63 ? 99 : r);
  return [...prospects].sort((a, b) => {
    const ra = rk(Number(a.draftRound) || 99);
    const rb = rk(Number(b.draftRound) || 99);
    if (ra !== rb) return ra - rb;
    return (Number(a.draftPick) || 999) - (Number(b.draftPick) || 999);
  });
}

let cache: { result: PreviewResult; ordered: MdcProspect[] } | null = null;

function build() {
  const prospects = MdcService.parse(MdcService.loadTemplate()).filter(
    (p) => String(p.firstName || '').trim().length > 0
  );
  const ordered = draftOrder(prospects);
  const rows: PreviewRow[] = ordered.map((p, i) => {
    const ratings: Record<string, number> = {};
    for (const k of RATING_KEYS) ratings[k] = Number(p[k]) || 0;
    const gh = (() => {
      const v = String((p as { PEPS?: string; visuals?: { genericHeadName?: string } }).PEPS || (p as { visuals?: { genericHeadName?: string } }).visuals?.genericHeadName || '');
      return /^gen_\d/i.test(v) ? v : null;
    })();
    const tone = gh ? parseInt(gh.match(/^gen_(\d+)/i)?.[1] ?? '4', 10) : 4;
    return {
      id: i + 1,
      pick: i + 1,
      firstName: String(p.firstName ?? ''),
      lastName: String(p.lastName ?? ''),
      position: PositionMapper.name(Number(p.position)),
      positionId: Number(p.position),
      overall: Number(p.overall),
      devTrait: Number(p.devTrait),
      archetype: Number(p.archetype) || 0,
      archetypeName: LookupService.idToName('archetype', Number(p.archetype) || 0) || '',
      round: Number(p.draftRound) || null,
      draftPick: Number(p.draftPick) || null,
      wav: null,
      wavSource: 'preset', // EA's official rookie rating — no career wAV yet
      face: faceOf(p),
      faceSource: null,
      skinTone: tone,
      genericHead: gh,
      college: LookupService.idToName('college', Number(p.college)) || '',
      age: Number(p.age) || 0,
      heightInches: Number(p.heightInches) || 0,
      weight: Number(p.weight) || 0,
      jersey: Number(p.jerseyNum) || 0,
      bodyType: String(p.bodyType || 'Standard'),
      photoUrl: null, // 2026 rookies aren't in the photo lookup
      ratings,
    };
  });
  let asset = 0;
  let generic = 0;
  let withPortrait = 0;
  for (const p of prospects) {
    if (faceOf(p) === 'asset') asset++;
    else generic++;
    if (Number(p.PID) > 0) withPortrait++;
  }
  cache = {
    result: { rows, likeness: { asset, generic, withPortrait, customPortrait: 0 }, count: rows.length, dropped: [] },
    ordered,
  };
  return cache;
}

export const TemplateClassService = {
  /** Preview rows + likeness for year 2026 (same shape as DraftClassBuilder.preview). */
  preview(): PreviewResult {
    return (cache ?? build()).result;
  },

  /** The 2026 class as an importable .mdc — the template itself is already valid. */
  mdcBuffer(): Buffer {
    return MdcService.loadTemplate();
  },

  /** 2026 class with user edits applied (by pick). Without edits, the raw template. */
  mdcBufferWithEdits(edits?: ClassEdits): Buffer {
    if (!edits || Object.keys(edits).length === 0) return MdcService.loadTemplate();
    const { ordered } = cache ?? build();
    const clone = ordered.map((p) => ({ ...p }));
    applyEdits(clone, edits);
    return MdcService.write(clone, MdcService.loadTemplate());
  },
};
