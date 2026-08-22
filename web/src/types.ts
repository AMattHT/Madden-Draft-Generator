export interface PlayerRow {
  id: number; // == pick (stable)
  pick: number;
  firstName: string;
  lastName: string;
  position: string; // M26 label
  positionId: number;
  overall: number;
  devTrait: number; // 0 Normal, 1 Star, 2 Superstar, 3 X-Factor
  archetype: number;
  archetypeName: string;
  round: number | null;
  draftPick: number | null;
  wav: number | null;
  wavSource: string; // 'actual' | 'predicted' | 'preset'
  face: 'asset' | 'generic' | 'photo';
  faceSource?: string | null; // real-head provenance: bundle | roster | legend-portrait | preset | lookup…
  skinTone?: number; // 1-8, for the face picker's per-tone pool
  genericHead?: string | null; // current generic head code (gen_*), null if a real asset
  college: string;
  age: number;
  heightInches: number;
  weight: number;
  jersey: number;
  bodyType: string; // Madden 26 build: Heavy / Muscular / Thin / Standard
  photoUrl: string | null;
  portrait?: string | null; // Madden menu-portrait URL (real or generic-by-skintone)
  team?: TeamInfo; // drafting team (nflverse, 1980+), joined by overall pick
  combine?: CombineMeasurements | null; // NFL combine testing (nflverse, 2000+)
  persona?: string[]; // M27 persona DNA trait names (only present when gameVersion='m27')
  /** Why an LB-labeled source player landed at edge vs SAM/MIKE/WILL (null when not an LB source). */
  frontSeven?: FrontSevenInfo | null;
  gear?: Record<string, string>; // era-default equipment (editor slot -> asset) the export writes
  ratings: Record<string, number>; // full editable attribute set
}

export interface FrontSevenInfo {
  role: 'EDGE' | 'MIKE' | 'SAM' | 'WILL' | null;
  reason: string; // 'sacks' | '3-4 olb' | '3-4 ilb' | '3-4 build' | '4-3 blitzer' | 'coverage' | 'pff' | 'nflverse' | 'none'
  scheme: '3-4' | '4-3' | null; // drafting team's base front over the early career
  team: string | null;
  sackRate: number | null; // career sacks per starting season
}

/** NFL Combine testing numbers (nflverse). */
export interface CombineMeasurements {
  forty: number | null;
  bench: number | null;
  vertical: number | null;
  broad: number | null;
  cone: number | null;
  shuttle: number | null;
}

/** Drafting team, resolved server-side by overall draft pick. */
export interface TeamInfo {
  abbr: string; // display abbreviation (as of the draft season)
  name: string; // full franchise name
  logo: string | null; // ESPN or era-correct PFR historical logo
}

/** User edits keyed by player id (pick) -> { field: value }. Numeric for ratings/
 *  ids/measurements; string for name/hometown text fields. */
export type ClassEdits = Record<number, Record<string, number | string>>;

/** Gear edits keyed by player id (pick) -> { slot: assetName } (helmet/cleats/gloves/visor). */
export type GearEdits = Record<number, Record<string, string>>;

/** Real 3D face scan (game-version catalog). */
export interface FaceScan {
  id: string;
  name: string;
  asset: string;
  portraitPid?: number;
  image?: string;
}

/** One equipment option for the gear editor. */
export interface GearOption {
  value: string;
  label: string;
  year?: number;
  image?: string; // thumbnail URL
  compatibility?: string; // facemask helmet-family ('universal' | 'f7' | …)
}

export interface LikenessStats {
  asset: number;
  generic: number;
  withPortrait: number;
  customPortrait: number;
}

export interface GeneratedClass {
  year: number;
  league: string;
  gameVersion?: 'm26' | 'm27'; // target game for this class (default m26)
  rows: PlayerRow[];
  likeness: LikenessStats;
  count: number;
  generatedCount?: number; // filler generics added to pad to a full class
  degraded?: boolean; // built before the backend's data caches were ready (not cached client-side)
  dropped?: string[]; // players that did not fit (years with more than 402 rows)
  fetchedAt?: number; // stamped client-side when pulled
  _v?: number; // cache schema/logic version (see cache.ts)
  _gen?: string; // backend generator fingerprint the class was built by (see cache.ts)
}

export type GameVersion = 'm26' | 'm27';
