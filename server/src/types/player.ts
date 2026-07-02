/** Source-agnostic player record used across sourcing, dedup, and rating. */
export interface BaselinePlayer {
  firstName: string;
  lastName: string;
  college: string;
  draftYear: number;
  draftRound: number | null;
  draftPick: number | null;
  position: string; // raw source position label (HB, DE, OLB, ...)
  jersey: number | null;
  league: string; // NFL | AFL | AAFC | ...
  isHOF: boolean;

  // Madden asset-link fields (from ALL_PLAYER_LOOKUP.csv)
  photoId: number | null; // PID
  playerAssetsId: string | null; // PEPS / asset name
  commId: number | null;
  plpo: string | null;

  // Bio
  heightInches: number | null;
  weight: number | null;
  age?: number | null; // real draft age (nflverse), else sampled at generation
  homeState: string | null;
  race: number | null; // 1=White, 5=Hispanic, 7=Black (drives generic-face skin tone)
  wikiImageUrl: string | null; // real photo (Wikipedia) for custom portraits
  pfrImageUrl: string | null; // real photo (Pro-Football-Reference headshot)

  // Career value metrics
  careerFrom: number | null;
  careerTo: number | null;
  allPro1: number | null;
  proBowls: number | null;
  seasonsStarted: number | null;
  wav: number | null;
  wavSource: 'actual' | 'predicted';

  combine?: CombineMeasurements | null; // NFL Combine testing (nflverse, 2000+)

  source: string; // origin of this record (local, pfr, nflverse, wikipedia, ...)
}

/** NFL Combine testing numbers used for authentic height/weight + athletic ratings. */
export interface CombineMeasurements {
  forty: number | null;
  bench: number | null;
  vertical: number | null;
  broad: number | null;
  cone: number | null;
  shuttle: number | null;
}

export interface DraftClassResponse {
  year: number;
  league: string;
  source: string;
  degraded: boolean;
  counts: { drafted: number; undrafted: number; freeAgents: number; total: number };
  prospects: BaselinePlayer[];
  freeAgents: BaselinePlayer[];
}
