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
  college: string;
  age: number;
  heightInches: number;
  weight: number;
  jersey: number;
  photoUrl: string | null;
  portrait?: string | null; // Madden menu-portrait URL (real or generic-by-skintone)
  team?: TeamInfo; // drafting team (nflverse, 1980+), joined by overall pick
  combine?: CombineMeasurements | null; // NFL combine testing (nflverse, 2000+)
  ratings: Record<string, number>; // full editable attribute set
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
  logo: string | null; // ESPN CDN logo URL, or null for historical/relocated teams
}

/** User edits keyed by player id (pick) -> { field: value }. Numeric for ratings/
 *  ids/measurements; string for name/hometown text fields. */
export type ClassEdits = Record<number, Record<string, number | string>>;

/** Gear edits keyed by player id (pick) -> { slot: assetName } (helmet/cleats/gloves/visor). */
export type GearEdits = Record<number, Record<string, string>>;

/** One equipment option for the gear editor. */
export interface GearOption {
  value: string;
  label: string;
  year?: number;
  image?: string; // thumbnail URL
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
  rows: PlayerRow[];
  likeness: LikenessStats;
  count: number;
  generatedCount?: number; // filler generics added to pad to a full class
  fetchedAt?: number; // stamped client-side when pulled
  _v?: number; // cache schema/logic version (see cache.ts)
}
