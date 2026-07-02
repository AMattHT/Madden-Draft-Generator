import { BaselinePlayer } from '../types/player';
import { PlayerLookupService } from './PlayerLookupService';
import { seededRng } from '../util/rng';

/**
 * Pads a draft class up to a full Madden-sized class with generated, undrafted
 * generic prospects — the way Madden fills out a draft pool. Fillers are low-rated
 * (undrafted -> low predicted caliber in RatingService), get race-appropriate
 * generic faces/portraits + era gear from the existing pipeline, and carry
 * realistic recombined names sampled from the historical name pool.
 *
 * Generation is deterministic per (year, index) so a class is reproducible.
 */

// A full Madden draft class fills all logical blocks (see DraftClassBuilder).
export const FULL_CLASS_SIZE = 402;

// Rough positional makeup of a class (raw labels PositionMapper understands),
// weighted so the mix looks like a real draft (lots of OL/WR/DB, few QB/K/P).
const POSITION_WEIGHTS: Array<[string, number]> = [
  ['WR', 11], ['CB', 9], ['LT', 4], ['LG', 4], ['C', 3], ['RG', 4], ['RT', 4],
  ['DE', 7], ['DT', 6], ['OLB', 5], ['MLB', 5], ['FS', 4], ['SS', 4],
  ['HB', 6], ['TE', 5], ['QB', 4], ['FB', 1], ['K', 1], ['P', 1], ['LS', 1],
];

// Skin-tone/race weights (1=light … 7=dark), roughly matching NFL demographics
// and the tones available in the generic-portrait set.
const RACE_WEIGHTS: Array<[number, number]> = [
  [7, 55], [1, 33], [3, 4], [2, 3], [4, 2], [5, 2], [6, 1],
];

function weightedPick<T>(pairs: Array<[T, number]>, roll: number): T {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let x = roll * total;
  for (const [val, w] of pairs) {
    if ((x -= w) < 0) return val;
  }
  return pairs[pairs.length - 1][0];
}

export const GenericFillerService = {
  /** Generate `target - existingCount` undrafted generic prospects for a year. */
  build(year: number, existingCount: number, target = FULL_CLASS_SIZE): BaselinePlayer[] {
    const need = Math.max(0, target - existingCount);
    if (need === 0) return [];
    const { first, last } = PlayerLookupService.namePool();
    const out: BaselinePlayer[] = [];
    for (let i = 0; i < need; i++) {
      const rand = seededRng(`filler|${year}|${i}`);
      const position = weightedPick(POSITION_WEIGHTS, rand());
      const race = weightedPick(RACE_WEIGHTS, rand());
      const firstName = first[Math.floor(rand() * first.length)] || 'Draft';
      const lastName = last[Math.floor(rand() * last.length)] || 'Prospect';
      out.push({
        firstName,
        lastName,
        college: '',
        draftYear: year,
        draftRound: null, // undrafted -> low predicted caliber
        draftPick: null,
        position,
        jersey: null,
        league: 'NFL',
        isHOF: false,
        photoId: null,
        playerAssetsId: null, // no real asset -> generic face + generic portrait
        commId: null,
        plpo: null,
        heightInches: null, // filled from position norms in DraftClassBuilder
        weight: null,
        homeState: null,
        race,
        wikiImageUrl: null,
        pfrImageUrl: null,
        careerFrom: null,
        careerTo: null,
        allPro1: null,
        proBowls: null,
        seasonsStarted: null,
        wav: null,
        wavSource: 'predicted',
        source: 'generated',
      });
    }
    return out;
  },
};
