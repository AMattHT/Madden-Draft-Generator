/** One player's pending edits (same shape as the web's PlayerFieldEdit). */
export interface PlayerFieldEdit {
  overall?: number;
  age?: number;
  position?: string;   // Madden 27 label: QB HB FB WR TE LT LG C RG RT LEDG REDG DT SAM MIKE WILL CB FS SS K P LS
  dev?: string;        // Normal | Star | Superstar | XFactor
  jersey?: number;
  ratings?: Record<string, number>;
  bodyType?: string;   // Standard | Thin | Muscular | Heavy | Lean
  genericHead?: string; // gen_<tone>_...
  gear?: Record<string, string>; // GearOptionsService slot -> asset
  firstName?: string; lastName?: string;
  college?: number;      // college id
  heightInches?: number; weight?: number;
  archetype?: number;    // archetype id
  personaDNA?: number[]; // up to 8 trait ids; empty slots are 0
  focus?: number;        // 0..3
  faceAsset?: string;    // a face-scan asset the game ships (sets PEPS and the blob's ASNM)
  skinTone?: number;     // 1..8
}

/** A player from the app's pool placed on a team; his edits are keyed by tempId until he has a PGID. */
export interface AddedPlayer { tempId: string; key: string; teamId: number; jersey?: number }

/** A pool player rated for a roster: everything the build needs to clone him in, and the UI needs to show him. */
export interface GeneratedRosterPlayer {
  key: string;
  firstName: string; lastName: string;
  positionId: number; position: string;
  archetypeId: number; archetype: string | null;
  collegeId: number; college: string | null;
  hometown: string; homeStateId: number;
  age: number; yearsPro: number; heightInches: number; weight: number; jersey: number;
  overall: number; devTrait: number;
  draftYear: number; draftRound: number; draftPick: number;
  ratings: Record<string, number>;
  /** Face: a scan asset the game ships, or '' when the player renders with a generic head. */
  assetName: string;
  genericHead: string; skinTone: number; bodyType: string;
  /** Editor slot -> asset (helmet, facemask, gloveLeft, …), for the drawer and the blob. */
  gear: Record<string, string>;
  personaDNA: number[]; focus: number;
  commentaryId: number;
  /** For the UI: the same portrait URL the class table would show, or null. */
  portrait: string | null;
}

/** A roster document the server can apply: deltas against a base file. */
export interface RosterBuildDoc {
  baseName?: string;                 // ROSTER-* file in the Madden 27 saves folder, or
  baseId?: string;                   // an opened roster id (a browsed file kept by the server)
  name: string;                      // roster name; the output is ROSTER-<NAME>
  moves?: Record<string, number>;    // PGID -> TGID (the free-agent team id cuts)
  edits?: Record<string, PlayerFieldEdit>; // PGID or tempId -> edits
  adds?: AddedPlayer[];
  fresh?: boolean;                   // remove every base player before adding yours
}

export interface ApplyCounts { moved: number; cut: number; edited: number; added: number; skipped: string[] }

export interface RosterBuildResult extends ApplyCounts {
  input: string;
  output: string;
  outputPath: string;
}
