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
  headshotUrl: string | null; // official NFL.com mugshot (nflverse)

  // Set when a real on-field photo was found and inspected. Missing/unusable
  // photos leave this null and EraGearService falls back to era defaults.
  observedGear?: ObservedGear | null;

  // Career value metrics
  careerFrom: number | null;
  careerTo: number | null;
  allPro1: number | null;
  proBowls: number | null;
  seasonsStarted: number | null;
  wav: number | null;
  wavSource: 'actual' | 'predicted';

  combine?: CombineMeasurements | null; // NFL Combine testing (nflverse, 2000+)

  /** Front-seven verdict for LB-labeled players (edge vs SAM/MIKE/WILL) and why. */
  frontSeven?: FrontSevenInfo | null;
  /** Position slot came from real data (curation / depth chart): cohort balancing leaves it. */
  positionLocked?: boolean;

  source: string; // origin of this record (local, pfr, nflverse, wikipedia, ...)
  /** A custom prospect from the Class Studio: the overall, dev trait and archetype
   *  the user chose are pinned; everything else is generated around them. */
  custom?: { overall: number; devTrait: number; archetype: number | null };

  /** Stable identity across data refreshes: draftYear|league|first|last|pick (see playerKey). */
  key?: string;

  /** Where the skin tone came from (the UI flags 'prior'/'csv' as unverified). */
  toneSource?: ToneSource;
  /** The user's own likeness fix for this player (LikenessOverrideService): face and body. */
  likenessFix?: { faceAsset?: string | null; bodyType?: string } | null;
  /** True when a likeness fix exists for him (tone, face or body). */
  likenessFixed?: boolean;
}

/** How a player's skin tone was decided, best evidence first. */
export type ToneSource = 'override' | 'curated' | 'era' | 'portrait' | 'headshot' | 'wiki' | 'csv' | 'prior';

/** How a linebacker-labeled player was placed in Madden's front seven. */
export interface FrontSevenInfo {
  role: 'EDGE' | 'MIKE' | 'SAM' | 'WILL' | null;
  reason: string; // 'sacks' | '3-4 olb' | '3-4 ilb' | 'coverage' | 'pff' | ... | 'none'
  lock: boolean; // pinned role (the class-level build split must not move it)
  scheme: '3-4' | '4-3' | null; // drafting team's base front over the early career
  team: string | null; // team code the scheme came from
  sackRate: number | null; // career sacks per starting season (when known)
}

/** What we could actually see on a real photo of this player. */
export interface ObservedGear {
  photoUrl: string;
  onField: boolean; // helmet / uniform visible (not a studio mugshot or suit)
  gloves: boolean | null;
  gloveColor: 'white' | 'black' | 'team' | null;
  visor: 'none' | 'clear' | 'dark' | null;
  wristband: boolean | null;
  socks: 'high' | 'mid' | 'low' | null;
  eyeBlack: boolean | null;
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
